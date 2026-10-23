// Writes a run to disk for the dashboard, in a folder of its own:
//
//   run.json            what ran: config, target, start/end, status, restarts
//   status.json         the live view, rewritten every tick (the heartbeat)
//   totals.json         every endpoint since the start, rewritten each minute
//   ticks/<date>.ndjson   every tick: rates, latency, users in the app (charts ≤ a few hours)
//   minutes/<date>.ndjson every minute: the same plus per-endpoint histograms (≤ 2 days)
//   hours/<date>.ndjson   every hour: the same (weeks)
//   events.ndjson       setup problems, errors, threshold breaches, restarts
//
// Dates are UTC. Lines are appended, never rewritten, so a crash loses at most one tick.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Config, VisitKind } from "./config.js";
import type { RateNow } from "./schedule.js";
import {
    addCounts, type Counters, type Counts, diffCounters, EndpointStats, type EndpointJson, emptyCounts,
    errorRate, Histogram, latency, newCounters, type Outcome, Window,
} from "./stats.js";
import { activeVisits, counters, gauges, type RunEvent } from "./runtime.js";

export type RunStatus = "running" | "finished" | "stopped" | "aborted" | "crashed";

export interface RunMeta {
    id: string;
    name: string;
    description: string;
    configFile: string;
    config: Config;
    hash: string;
    target: string;
    durationS: number | null;
    startedAt: number;
    endedAt: number | null;
    status: RunStatus;
    stopReason: string | null;
    restarts: number[];
    host: string;
    tickSeconds: number;
}

/** Gauges sampled each tick and averaged (and maxed) per minute and hour. */
interface GaugeSample {
    want: number;
    act: number;
    sse: number;
    inf: number;
    lag: number;
}
const GAUGES: (keyof GaugeSample)[] = ["want", "act", "sse", "inf", "lag"];

class Bucket {
    readonly win = new Window();
    readonly k0: Counters;
    private readonly sums: GaugeSample = { want: 0, act: 0, sse: 0, inf: 0, lag: 0 };
    private readonly maxes: GaugeSample = { want: 0, act: 0, sse: 0, inf: 0, lag: 0 };
    private readonly kindSums: Record<string, number> = {};
    private samples = 0;

    constructor(readonly start: number) {
        this.k0 = { ...counters };
    }

    sample(g: GaugeSample, kinds: Record<string, number>): void {
        this.samples++;
        for (const k of GAUGES) {
            this.sums[k] += g[k];
            if (g[k] > this.maxes[k]) this.maxes[k] = g[k];
        }
        for (const [k, n] of Object.entries(kinds)) this.kindSums[k] = (this.kindSums[k] ?? 0) + n;
    }

    record(end: number) {
        const mean = (x: number) => (this.samples ? Math.round((x / this.samples) * 10) / 10 : 0);
        const avg = {} as GaugeSample;
        for (const k of GAUGES) avg[k] = mean(this.sums[k]);
        const kinds: Record<string, number> = {};
        for (const [k, x] of Object.entries(this.kindSums)) kinds[k] = mean(x);
        const e: Record<string, EndpointJson> = {};
        for (const [key, s] of this.win.endpoints) e[key] = s.toJSON();
        return {
            t: this.start,
            s: Math.round((end - this.start) / 1000),
            c: this.win.counts,
            h: this.win.all.toJSON(),
            max: Math.round(this.win.all.max),
            g: avg,
            gx: { ...this.maxes, want: Math.round(this.maxes.want) },
            kinds,
            k: diffCounters(counters, this.k0),
            e,
        };
    }
}

const utcDate = (t: number) => new Date(t).toISOString().slice(0, 10);
const MINUTE = 60_000;
const HOUR = 3_600_000;

export class Recorder {
    readonly dir: string;
    readonly meta: RunMeta;
    private tick = new Window();
    private tickK0: Counters = { ...counters };
    private minute: Bucket;
    private hour: Bucket;
    /** The last few minutes, for thresholds. */
    private recent: { start: number; hist: Histogram; counts: Counts }[] = [];
    private totals = new Map<string, EndpointStats>();
    private readonly totalAll = new Histogram();
    private readonly totalCounts = emptyCounts();
    private readonly lag = monitorEventLoopDelay({ resolution: 20 });
    private breached = false;
    private lastLag = 0;

    private constructor(dir: string, meta: RunMeta) {
        this.dir = dir;
        this.meta = meta;
        for (const sub of ["ticks", "minutes", "hours"]) mkdirSync(join(dir, sub), { recursive: true });
        const now = Date.now();
        this.minute = new Bucket(Math.floor(now / MINUTE) * MINUTE);
        this.hour = new Bucket(Math.floor(now / HOUR) * HOUR);
        this.lag.enable();
    }

    static create(c: Config, configFile: string, hash: string, durationS: number): Recorder {
        const startedAt = Date.now();
        const stamp = new Date(startedAt).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
        const id = `${stamp}-${c.name}`;
        const meta: RunMeta = {
            id,
            name: c.name,
            description: c.description,
            configFile,
            config: c,
            hash,
            target: c.target.apiUrl,
            durationS: Number.isFinite(durationS) ? durationS : null,
            startedAt,
            endedAt: null,
            status: "running",
            stopReason: null,
            restarts: [],
            host: hostname(),
            tickSeconds: c.report.tickSeconds,
        };
        const r = new Recorder(join(c.report.dir, id), meta);
        r.writeMeta();
        return r;
    }

    /**
     * Picks up the latest run of this config that didn't end on its own (the machine rebooted,
     * the container was restarted), if the config that shapes the load is unchanged.
     */
    static resume(c: Config, hash: string): Recorder | null {
        const root = c.report.dir;
        if (!existsSync(root)) return null;
        const runs = listRunDirs(root)
            .map((id) => readJson<RunMeta>(join(root, id, "run.json")))
            .filter((m): m is RunMeta => !!m && m.name === c.name)
            .sort((a, b) => b.startedAt - a.startedAt);
        const last = runs[0];
        if (!last || last.status === "finished" || last.status === "aborted" || last.hash !== hash) return null;
        if (last.durationS !== null && Date.now() - last.startedAt >= last.durationS * 1000) return null;
        const dir = join(root, last.id);
        const r = new Recorder(dir, { ...last, status: "running", endedAt: null, stopReason: null, config: c, restarts: [...last.restarts, Date.now()] });
        // Carry on counting from where it was.
        const totals = readJson<{ endpoints: Record<string, EndpointJson>; counters: Counters }>(join(dir, "totals.json"));
        if (totals) {
            for (const [key, j] of Object.entries(totals.endpoints)) {
                const s = EndpointStats.fromJSON(j);
                r.totals.set(key, s);
                r.totalAll.merge(s.hist);
                addCounts(r.totalCounts, s.counts);
            }
            Object.assign(counters, { ...newCounters(), ...totals.counters });
            r.tickK0 = { ...counters };
            r.minute = new Bucket(r.minute.start);
            r.hour = new Bucket(r.hour.start);
        }
        r.writeMeta();
        return r;
    }

    // ── Input ────────────────────────────────────────────────────────────────────────────

    request(key: string, ms: number, status: string, outcome: Outcome): void {
        this.tick.add(key, ms, status, outcome);
        this.minute.win.add(key, ms, status, outcome);
        this.hour.win.add(key, ms, status, outcome);
        let s = this.totals.get(key);
        if (!s) this.totals.set(key, (s = new EndpointStats()));
        s.add(ms, status, outcome);
        this.totalAll.add(ms);
        this.totalCounts.n++;
        this.totalCounts[outcome]++;
    }

    event(e: RunEvent): void {
        const line = JSON.stringify(e);
        console.log(`${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} ${e.message}`);
        try {
            appendFileSync(join(this.dir, "events.ndjson"), `${line}\n`);
        } catch {
            // The disk is full or gone: the console still has it.
        }
    }

    // ── Output ───────────────────────────────────────────────────────────────────────────

    /**
     * Closes the tick: appends it, rolls the minute and hour over when their time is up,
     * rewrites status.json, and judges the thresholds. Returns a breach description, if any.
     */
    onTick(rate: RateNow, idleUsers: number): string | null {
        const now = Date.now();
        const seconds = (now - this.tick.startedAt) / 1000;
        // No samples yet (a tick right after the last one): keep the last reading.
        const lagP99 = this.lag.count ? Math.round(this.lag.percentile(99) / 1e6) : this.lastLag;
        this.lastLag = lagP99;
        this.lag.reset();
        const act = activeVisits();
        const g: GaugeSample = { want: rate.visitsPerHour, act, sse: gauges.streamsOpen, inf: gauges.inFlight, lag: lagP99 };
        const tick = {
            t: now,
            s: Math.round(seconds * 10) / 10,
            want: Math.round(rate.visitsPerHour * 10) / 10,
            mul: Math.round(rate.multiplier * 1000) / 1000,
            hr: Math.round(rate.localHour * 100) / 100,
            wd: rate.weekday,
            stage: rate.stage,
            act,
            kinds: { ...gauges.visits } as Record<VisitKind, number>,
            sse: gauges.streamsOpen,
            inf: gauges.inFlight,
            lag: lagP99,
            rss: Math.round(process.memoryUsage.rss() / 1048576),
            c: this.tick.counts,
            l: latency(this.tick.all),
            k: diffCounters(counters, this.tickK0),
        };
        this.append("ticks", now, tick);
        this.minute.sample(g, gauges.visits);
        this.hour.sample(g, gauges.visits);

        if (Math.floor(now / MINUTE) * MINUTE !== this.minute.start) {
            const rec = this.minute.record(now);
            this.append("minutes", this.minute.start, rec);
            this.recent.push({ start: this.minute.start, hist: this.minute.win.all, counts: this.minute.win.counts });
            const keep = this.meta.config.thresholds.windowMinutes;
            if (this.recent.length > keep) this.recent.splice(0, this.recent.length - keep);
            this.minute = new Bucket(Math.floor(now / MINUTE) * MINUTE);
            this.writeTotals();
        }
        if (Math.floor(now / HOUR) * HOUR !== this.hour.start) {
            this.append("hours", this.hour.start, this.hour.record(now));
            this.hour = new Bucket(Math.floor(now / HOUR) * HOUR);
        }

        const thr = this.judge();
        writeJsonAtomic(join(this.dir, "status.json"), {
            id: this.meta.id,
            status: this.meta.status,
            startedAt: this.meta.startedAt,
            ...tick,
            idleUsers,
            rps: seconds > 0 ? Math.round((this.tick.counts.n / seconds) * 10) / 10 : 0,
            thresholds: thr,
            counters,
            totals: { c: this.totalCounts, l: latency(this.totalAll) },
        });
        this.tick = new Window();
        this.tickK0 = { ...counters };

        if (thr.breached && !this.breached) {
            this.breached = true;
            return `p95 ${thr.p95}ms (limit ${this.meta.config.thresholds.p95Ms}ms), errors ${(thr.errorRate * 100).toFixed(2)}% (limit ${(this.meta.config.thresholds.errorRate * 100).toFixed(2)}%) over the last ${thr.minutes} min`;
        }
        if (!thr.breached) this.breached = false;
        return null;
    }

    /** p95 and error rate over the threshold window (whole minutes plus the current one). */
    private judge() {
        const t = this.meta.config.thresholds;
        const h = new Histogram();
        const c = emptyCounts();
        for (const m of this.recent) {
            h.merge(m.hist);
            addCounts(c, m.counts);
        }
        h.merge(this.minute.win.all);
        addCounts(c, this.minute.win.counts);
        const p95 = Math.round(h.quantile(0.95));
        const rate = errorRate(c);
        // Too few requests to say anything (night, ramp-up).
        const judged = c.n >= 100;
        return {
            minutes: this.recent.length + 1,
            n: c.n,
            p95,
            errorRate: Math.round(rate * 10000) / 10000,
            breached: judged && (p95 > t.p95Ms || rate > t.errorRate),
        };
    }

    private append(kind: "ticks" | "minutes" | "hours", t: number, rec: unknown): void {
        try {
            appendFileSync(join(this.dir, kind, `${utcDate(t)}.ndjson`), `${JSON.stringify(rec)}\n`);
        } catch (err) {
            console.error(`can't write ${kind}: ${(err as Error).message}`);
        }
    }

    private writeTotals(): void {
        const endpoints: Record<string, EndpointJson> = {};
        for (const [k, s] of this.totals) endpoints[k] = s.toJSON();
        writeJsonAtomic(join(this.dir, "totals.json"), { t: Date.now(), endpoints, counters, c: this.totalCounts, l: latency(this.totalAll) });
    }

    writeMeta(): void {
        writeJsonAtomic(join(this.dir, "run.json"), this.meta);
    }

    /** Last writes: the partial minute and hour, totals, the final status. */
    finish(status: RunStatus, reason: string | null, rate: RateNow, idleUsers: number): void {
        const now = Date.now();
        this.meta.status = status;
        this.meta.stopReason = reason;
        this.meta.endedAt = now;
        this.onTick(rate, idleUsers);
        this.append("minutes", this.minute.start, this.minute.record(now));
        this.append("hours", this.hour.start, this.hour.record(now));
        this.writeTotals();
        this.writeMeta();
        this.lag.disable();
    }

    get totalsSummary() {
        return { c: this.totalCounts, l: latency(this.totalAll), endpoints: this.totals };
    }
}

export function listRunDirs(root: string): string[] {
    try {
        return readdirSync(root).filter((d) => existsSync(join(root, d, "run.json")));
    } catch {
        return [];
    }
}

export function readJson<T>(file: string): T | null {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
        return null;
    }
}

/** Write-then-rename, so a reader never sees half a file. */
export function writeJsonAtomic(file: string, data: unknown): void {
    try {
        const tmp = `${file}.tmp`;
        writeFileSync(tmp, JSON.stringify(data));
        renameSync(tmp, file);
    } catch (err) {
        console.error(`can't write ${file}: ${(err as Error).message}`);
    }
}
