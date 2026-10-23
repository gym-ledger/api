// Runs a config: people arrive as a Poisson process following the schedule, each visit runs
// on its own, bots knock on the login, and every tick the recorder writes what happened.
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { startCredentialStuffing } from "./attacks.js";
import { formatDuration, type LoadedConfig } from "./config.js";
import { configureHttp, hasLoadTestKey } from "./http.js";
import { Recorder, readJson, type RunStatus, writeJsonAtomic } from "./recorder.js";
import {
    activeVisits, background, counters, event, resetWarnings, running, setSinks, stop, stopping, warnOnce, weighted,
} from "./runtime.js";
import { poisson, Schedule } from "./schedule.js";
import { errorRate } from "./stats.js";
import { Auth, Population } from "./users.js";
import { asVisit, Visits } from "./visits.js";

const ARRIVAL_TICK_MS = 250;
const DEVICES_EVERY_MS = 60_000;
const CONSOLE_EVERY_MS = 5 * 60_000;

export async function run(loaded: LoadedConfig, configFile: string, opts: { fresh: boolean }): Promise<number> {
    const { config: c, durationS, hash } = loaded;
    const password = process.env[c.users.passwordEnv];
    if (!password) throw new Error(`${c.users.passwordEnv} is not set: the seeded accounts' password (seed-load-users)`);

    const resumed = opts.fresh ? null : Recorder.resume(c, hash);
    const rec = resumed ?? Recorder.create(c, configFile, hash, durationS);
    setSinks((...a) => rec.request(...a), (e) => rec.event(e));
    configureHttp(c);

    const population = new Population(c);
    const devicesFile = join(rec.dir, "devices.json");
    const restored = resumed ? population.restoreDevices(readJson(devicesFile)) : 0;
    const auth = new Auth({
        password,
        typoRate: c.logins.typoRate,
        repeatTypoRate: c.logins.repeatTypoRate,
        maxAttempts: c.logins.maxAttempts,
        rememberedDeviceShare: c.population.rememberedDeviceShare,
        otpSends: c.paid.otpSends,
    });
    const visits = new Visits(c, auth);
    const schedule = new Schedule(c, rec.meta.startedAt);

    event("info", resumed ? "resume" : "start", resumed
        ? `resumed run ${rec.meta.id} (restart #${rec.meta.restarts.length}, ${restored} remembered devices)`
        : `started run ${rec.meta.id} against ${c.target.apiUrl} for ${formatDuration(durationS)}`);
    if (!hasLoadTestKey()) {
        event("warn", "setup", `${c.target.loadTestKeyEnv} is not set: every simulated user shares this machine's IP, so the API's per-IP rate limits will throttle the test`);
    }

    // ── Stopping ──
    let status = "finished" as RunStatus;
    let reason: string | null = null;
    const end = (s: RunStatus, why: string) => {
        if (stopping()) return;
        status = s;
        reason = why;
        stop.abort();
    };
    const onSignal = (sig: string) => {
        if (stopping()) {
            console.log(`${sig} again: quitting now`);
            process.exit(130);
        }
        end("stopped", sig);
    };
    process.on("SIGINT", () => onSignal("SIGINT"));
    process.on("SIGTERM", () => onSignal("SIGTERM"));

    // ── Arrivals ──
    let lastDropWarning = 0;
    const arrive = () => {
        const rate = schedule.at(Date.now());
        const n = poisson((rate.visitsPerHour * ARRIVAL_TICK_MS) / 3_600_000);
        for (let i = 0; i < n; i++) {
            if (activeVisits() >= c.load.maxConcurrentVisits) {
                counters.visitsDropped++;
                if (Date.now() - lastDropWarning > 600_000) {
                    lastDropWarning = Date.now();
                    event("warn", "capacity", `load.maxConcurrentVisits (${c.load.maxConcurrentVisits}) reached: arrivals are being dropped`);
                }
                continue;
            }
            const u = population.take();
            if (!u) {
                counters.visitsDropped++;
                if (Date.now() - lastDropWarning > 600_000) {
                    lastDropWarning = Date.now();
                    event("warn", "capacity", `all ${c.users.count} users are already in the app: arrivals are being dropped (seed more users, raise users.count)`);
                }
                continue;
            }
            const kind = weighted(c.visitMix);
            counters.visitsStarted++;
            background(asVisit(kind, () => visits.run(u, kind))
                .then((ok) => {
                    if (ok) counters.visitsFinished++;
                    else if (!stopping()) counters.visitsFailed++;
                })
                .finally(() => population.release(u)));
        }
    };
    const arrivals = setInterval(arrive, ARRIVAL_TICK_MS);
    startCredentialStuffing(c, () => schedule.at(Date.now()).multiplier);

    // ── Ticks ──
    let lastConsole = Date.now();
    let lastDevices = Date.now();
    let lastDay = new Date().toISOString().slice(0, 10);
    const ticker = setInterval(() => {
        const now = Date.now();
        const rate = schedule.at(now);
        const breach = rec.onTick(rate, population.idle);
        if (breach) {
            event("warn", "threshold", `threshold breached: ${breach}`);
            if (c.thresholds.abortOnBreach) end("aborted", `threshold breached: ${breach}`);
        }
        if (now - lastDevices > DEVICES_EVERY_MS) {
            lastDevices = now;
            saveDevices(devicesFile, population);
        }
        if (now - lastConsole > CONSOLE_EVERY_MS) {
            lastConsole = now;
            const t = rec.totalsSummary;
            console.log(`${new Date(now).toISOString()} · ${activeVisits()} in the app · want ${Math.round(rate.visitsPerHour)} visits/h · total ${t.c.n} req, p95 ${t.l.p95}ms, errors ${(errorRate(t.c) * 100).toFixed(2)}%`);
        }
        const day = new Date(now).toISOString().slice(0, 10);
        if (day !== lastDay) {
            lastDay = day;
            resetWarnings(); // problems that went quiet get reported again each day
        }
        if (Number.isFinite(durationS) && now - rec.meta.startedAt >= durationS * 1000) end("finished", "duration reached");
    }, c.report.tickSeconds * 1000);

    process.on("uncaughtException", (err) => {
        warnOnce(`uncaught ${err.message}`, "crash", `uncaught: ${err.stack ?? err.message}`);
    });

    await new Promise<void>((resolve) => stop.signal.addEventListener("abort", () => resolve(), { once: true }));
    clearInterval(arrivals);
    clearInterval(ticker);

    // In-flight requests were aborted with the stop signal; give visits a moment to unwind.
    await Promise.race([Promise.allSettled([...running]), new Promise((r) => setTimeout(r, 10_000))]);
    saveDevices(devicesFile, population);
    rec.finish(status, reason, schedule.at(Date.now()), population.idle);
    event("info", "end", `run ${rec.meta.id} ${status}${reason ? ` (${reason})` : ""}`);
    return status === "aborted" ? 2 : 0;
}

function saveDevices(file: string, population: Population): void {
    writeJsonAtomic(file, population.devices());
    try {
        chmodSync(file, 0o600); // refresh tokens: readable by this user only
    } catch {
        // Windows, or a filesystem without modes.
    }
}
