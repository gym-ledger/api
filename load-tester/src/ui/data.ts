// Reads the run folders the generator writes (see recorder.ts) and answers the dashboard's
// questions: which runs, what happened over a time range, per endpoint. Files are read
// incrementally (only the bytes appended since the last read) and kept in a small cache.
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RunMeta } from "../recorder.js";
import { listRunDirs, readJson } from "../recorder.js";
import { addCounts, type Counts, emptyCounts, EndpointStats, type EndpointJson, errorRate, Histogram, type HistJson, latency } from "../stats.js";

type Kind = "ticks" | "minutes" | "hours";

interface CachedFile {
    offset: number;
    records: any[];
    used: number;
    partial: string;
}

const MAX_CACHED: Record<Kind, number> = { ticks: 6, minutes: 4, hours: 400 };
/** Ranges up to this long are drawn from ticks, then minutes, then hours. */
const TICKS_UP_TO = 3 * 3600_000;
const MINUTES_UP_TO = 3 * 86_400_000;
const MAX_POINTS = 480;

export class RunStore {
    private readonly cache: Record<Kind, Map<string, CachedFile>> = { ticks: new Map(), minutes: new Map(), hours: new Map() };

    constructor(readonly root: string) {}

    runs() {
        return listRunDirs(this.root)
            .map((id) => this.summary(id))
            .filter((r): r is NonNullable<typeof r> => !!r)
            .sort((a, b) => b.meta.startedAt - a.meta.startedAt);
    }

    private dir(id: string): string | null {
        // Run ids are folder names the generator made; refuse anything that could leave the root.
        if (!/^[A-Za-z0-9._-]+$/.test(id) || id.startsWith(".")) return null;
        const d = join(this.root, id);
        return existsSync(join(d, "run.json")) ? d : null;
    }

    summary(id: string) {
        const d = this.dir(id);
        if (!d) return null;
        const meta = readJson<RunMeta>(join(d, "run.json"));
        if (!meta) return null;
        const status = readJson<any>(join(d, "status.json"));
        const heartbeatMs = Math.max(30_000, meta.tickSeconds * 3000);
        const state = meta.status === "running" && (!status || Date.now() - status.t > heartbeatMs) ? "stale" : meta.status;
        const { config: _config, ...light } = meta;
        return {
            meta: light,
            state,
            lastSeen: status?.t ?? null,
            live: status && state === "running" ? status : null,
            totals: status?.totals ?? null,
            counters: status?.counters ?? null,
        };
    }

    meta(id: string): RunMeta | null {
        const d = this.dir(id);
        return d ? readJson<RunMeta>(join(d, "run.json")) : null;
    }

    status(id: string): any {
        const d = this.dir(id);
        return d ? readJson(join(d, "status.json")) : null;
    }

    // ── Reading the timeline files ───────────────────────────────────────────────────────

    private read(id: string, kind: Kind, date: string): any[] {
        const d = this.dir(id);
        if (!d) return [];
        const file = join(d, kind, `${date}.ndjson`);
        const cache = this.cache[kind];
        let c = cache.get(file);
        let size = 0;
        try {
            size = statSync(file).size;
        } catch {
            return [];
        }
        if (!c || size < c.offset) {
            c = { offset: 0, records: [], used: 0, partial: "" };
            cache.set(file, c);
        }
        if (size > c.offset) {
            const fd = openSync(file, "r");
            try {
                const buf = Buffer.alloc(size - c.offset);
                readSync(fd, buf, 0, buf.length, c.offset);
                c.offset = size;
                const text = c.partial + buf.toString("utf8");
                const lines = text.split("\n");
                c.partial = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line) continue;
                    try {
                        c.records.push(JSON.parse(line));
                    } catch {
                        // A torn line from a crash: skip it.
                    }
                }
            } finally {
                closeSync(fd);
            }
        }
        c.used = Date.now();
        if (cache.size > MAX_CACHED[kind]) {
            const oldest = [...cache.entries()].sort((a, b) => a[1].used - b[1].used)[0];
            if (oldest[0] !== file) cache.delete(oldest[0]);
        }
        return c.records;
    }

    private records(id: string, kind: Kind, from: number, to: number): any[] {
        const out: any[] = [];
        const day = 86_400_000;
        for (let t = Math.floor(from / day) * day; t <= to; t += day) {
            const date = new Date(t).toISOString().slice(0, 10);
            for (const r of this.read(id, kind, date)) if (r.t >= from - 1 && r.t <= to) out.push(r);
        }
        return out;
    }

    private span(id: string, fromQ: string | null, toQ: string | null) {
        const meta = this.meta(id);
        const status = this.status(id);
        const start = meta?.startedAt ?? Date.now() - 3600_000;
        const end = Math.max(start, meta?.endedAt ?? status?.t ?? Date.now());
        const clamp = (v: number) => Math.min(end, Math.max(start, Number.isFinite(v) ? v : start));
        const to = toQ ? clamp(Number(toQ)) : end;
        const from = fromQ ? clamp(Number(fromQ)) : start;
        return { from, to: Math.max(from + 1000, to) };
    }

    private kindFor(from: number, to: number): Kind {
        const len = to - from;
        return len <= TICKS_UP_TO ? "ticks" : len <= MINUTES_UP_TO ? "minutes" : "hours";
    }

    // ── Answers ──────────────────────────────────────────────────────────────────────────

    /** The run over a range, as at most MAX_POINTS points for the charts, plus range totals. */
    series(id: string, fromQ: string | null, toQ: string | null) {
        const { from, to } = this.span(id, fromQ, toQ);
        const kind = this.kindFor(from, to);
        const recs = this.records(id, kind, from, to);
        const step = Math.max(1, Math.ceil(recs.length / MAX_POINTS));
        const points = [];
        for (let i = 0; i < recs.length; i += step) points.push(point(recs.slice(i, i + step), kind));
        const all = point(recs, kind);
        if (kind === "ticks") {
            // Ticks only carry percentiles; the range's are exact from the minutes' histograms.
            const minutes = this.records(id, "minutes", from - 60_000, to);
            if (minutes.length) {
                const exact = point(minutes, "minutes");
                Object.assign(all, { p50: exact.p50, p95: exact.p95, p99: exact.p99, max: exact.max });
            }
        }
        return { from, to, kind, points, range: all };
    }

    /** Every endpoint over a range (the whole run from totals.json). */
    endpoints(id: string, fromQ: string | null, toQ: string | null) {
        const d = this.dir(id);
        if (!d) return null;
        let map: Map<string, EndpointStats>;
        let seconds: number;
        const meta = this.meta(id);
        if (!fromQ && !toQ) {
            const totals = readJson<{ endpoints: Record<string, EndpointJson>; t: number }>(join(d, "totals.json"));
            map = new Map(Object.entries(totals?.endpoints ?? {}).map(([k, j]) => [k, EndpointStats.fromJSON(j)]));
            seconds = ((meta?.endedAt ?? totals?.t ?? Date.now()) - (meta?.startedAt ?? Date.now())) / 1000;
        } else {
            const { from, to } = this.span(id, fromQ, toQ);
            const kind = to - from <= MINUTES_UP_TO ? "minutes" : "hours";
            map = new Map();
            seconds = (to - from) / 1000;
            for (const r of this.records(id, kind, from - (kind === "hours" ? 3600_000 : 60_000), to)) {
                for (const [k, j] of Object.entries(r.e ?? {})) {
                    const s = EndpointStats.fromJSON(j as EndpointJson);
                    const into = map.get(k);
                    if (into) into.merge(s);
                    else map.set(k, s);
                }
            }
        }
        return [...map.entries()].map(([key, s]) => ({
            key,
            ...s.counts,
            rps: seconds > 0 ? s.counts.n / seconds : 0,
            ...latency(s.hist),
            errorRate: errorRate(s.counts),
            statuses: s.statuses,
        })).sort((a, b) => b.n - a.n);
    }

    /** One endpoint over time. */
    endpoint(id: string, key: string, fromQ: string | null, toQ: string | null) {
        const { from, to } = this.span(id, fromQ, toQ);
        const kind: Kind = to - from <= MINUTES_UP_TO ? "minutes" : "hours";
        const recs = this.records(id, kind, from - 60_000, to);
        const step = Math.max(1, Math.ceil(recs.length / MAX_POINTS));
        const points = [];
        for (let i = 0; i < recs.length; i += step) {
            const group = recs.slice(i, i + step);
            const h = new Histogram();
            const c = emptyCounts();
            let s = 0;
            for (const r of group) {
                s += r.s || 60;
                const e = r.e?.[key];
                if (!e) continue;
                h.merge(Histogram.fromJSON(e.h, e.max));
                addCounts(c, e.c);
            }
            points.push({ t: group[0].t, s, rps: s ? c.n / s : 0, ...latency(h), c });
        }
        return { from, to, kind, points };
    }

    events(id: string, limit: number) {
        const d = this.dir(id);
        if (!d) return [];
        const file = join(d, "events.ndjson");
        if (!existsSync(file)) return [];
        // Events are few (problems are rate-limited at the source); read the tail.
        const size = statSync(file).size;
        const start = Math.max(0, size - 2_000_000);
        const fd = openSync(file, "r");
        try {
            const buf = Buffer.alloc(size - start);
            readSync(fd, buf, 0, buf.length, start);
            const lines = buf.toString("utf8").split("\n").filter(Boolean);
            if (start > 0) lines.shift();
            return lines.slice(-limit).reverse().flatMap((l) => {
                try {
                    return [JSON.parse(l)];
                } catch {
                    return [];
                }
            });
        } finally {
            closeSync(fd);
        }
    }

    config(id: string) {
        const d = this.dir(id);
        return d ? JSON.parse(readFileSync(join(d, "run.json"), "utf8")).config : null;
    }
}

/** Merges consecutive timeline records into one chart point. */
function point(group: any[], kind: Kind) {
    const c: Counts = emptyCounts();
    const h = new Histogram();
    let s = 0;
    let gw = 0;
    let weightedLat = { p50: 0, p95: 0, p99: 0 };
    let maxLat = 0;
    const g = { want: 0, act: 0, sse: 0, inf: 0, lag: 0 };
    let actMax = 0;
    let lagMax = 0;
    const k: Record<string, number> = {};
    const kinds: Record<string, number> = {};
    for (const r of group) {
        const rs = r.s || 0;
        // Gauges are snapshots: a near-zero-length record (the final tick) still counts a little.
        const w = Math.max(rs, 0.5);
        gw += w;
        s += rs;
        addCounts(c, r.c);
        if (kind === "ticks") {
            weightedLat.p50 += r.l.p50 * r.c.n;
            weightedLat.p95 += r.l.p95 * r.c.n;
            weightedLat.p99 += r.l.p99 * r.c.n;
            maxLat = Math.max(maxLat, r.l.max);
            g.want += r.want * w;
            g.act += r.act * w;
            g.sse += r.sse * w;
            g.inf += r.inf * w;
            g.lag += r.lag * w;
            actMax = Math.max(actMax, r.act);
            lagMax = Math.max(lagMax, r.lag);
            for (const [kk, v] of Object.entries(r.kinds ?? {})) kinds[kk] = (kinds[kk] ?? 0) + (v as number) * w;
        } else {
            h.merge(Histogram.fromJSON(r.h as HistJson, r.max));
            for (const key of Object.keys(g) as (keyof typeof g)[]) g[key] += (r.g?.[key] ?? 0) * w;
            actMax = Math.max(actMax, r.gx?.act ?? 0);
            lagMax = Math.max(lagMax, r.gx?.lag ?? 0);
        }
        if (kind !== "ticks") {
            for (const [kk, v] of Object.entries(r.kinds ?? {})) kinds[kk] = (kinds[kk] ?? 0) + (v as number) * w;
        }
        for (const [kk, v] of Object.entries(r.k ?? {})) k[kk] = (k[kk] ?? 0) + (v as number);
    }
    const lat = kind === "ticks"
        ? {
            p50: c.n ? Math.round(weightedLat.p50 / c.n) : 0,
            p95: c.n ? Math.round(weightedLat.p95 / c.n) : 0,
            p99: c.n ? Math.round(weightedLat.p99 / c.n) : 0,
            max: Math.round(maxLat),
        }
        : latency(h);
    const avg = (x: number) => (gw ? Math.round((x / gw) * 10) / 10 : 0);
    for (const kk of Object.keys(kinds)) kinds[kk] = avg(kinds[kk]);
    return {
        t: group[0]?.t ?? 0,
        s: Math.round(s),
        c,
        rps: s ? Math.round((c.n / s) * 100) / 100 : 0,
        errorRate: errorRate(c),
        ...lat,
        want: avg(g.want),
        act: avg(g.act),
        actMax,
        sse: avg(g.sse),
        inf: avg(g.inf),
        lag: avg(g.lag),
        lagMax,
        kinds,
        k,
    };
}
