// load-tester: simulates Gym Ledger's users against the API.
//
//   node dist/cli.js plan    --config configs/typical-day.json   # what it would do, and checks the API
//   node dist/cli.js prepare --config configs/typical-day.json   # onboards every seeded user up front
//   node dist/cli.js run     --config configs/typical-day.json   # runs it (resumes an unfinished run)
//         [--new]  start a fresh run even if an unfinished one of this config exists
//
// Reads .env next to it if present (LOAD_USER_PASSWORD, LOAD_TEST_SECRET).
import { existsSync } from "node:fs";
import { formatDuration, type LoadedConfig, loadConfig, VISIT_KINDS } from "./config.js";
import { configureHttp } from "./http.js";
import { counters, pace } from "./runtime.js";
import { run } from "./runner.js";
import { Schedule } from "./schedule.js";
import { Auth, emailOf, Population } from "./users.js";
import { Visits } from "./visits.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const args = process.argv.slice(2);
const command = args[0];
const option = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
};
const flag = (name: string) => args.includes(`--${name}`);

const USAGE = `usage:
  load-tester plan    --config <file>              print the plan and check the API
  load-tester prepare --config <file> [--concurrency 10]
                                                   onboard every seeded user before the first run
  load-tester run     --config <file> [--new]      run it (an unfinished run of the same config resumes)`;

async function main(): Promise<number> {
    const file = option("config");
    if (!command || !file || !["plan", "run", "prepare"].includes(command)) {
        console.log(USAGE);
        return 1;
    }
    const loaded = loadConfig(file);
    if (command === "plan") return plan(loaded);
    if (command === "prepare") return prepare(loaded, Number(option("concurrency") ?? 10));
    return run(loaded, file, { fresh: flag("new") });
}

// ── plan ─────────────────────────────────────────────────────────────────────────────────

/** Rough cost of each kind of visit: how long it keeps the app open, how many requests. */
function visitShape(loaded: LoadedConfig) {
    const w = loaded.config.behaviour.workout;
    const avg = (r: [number, number]) => (r[0] + r[1]) / 2;
    const think = avg(loaded.config.behaviour.thinkSeconds);
    const sets = avg(w.exercises) * avg(w.setsPerExercise);
    const shape: Record<string, { seconds: number; requests: number }> = {
        workout: { seconds: sets * (avg(w.setSeconds) + avg(w.restSeconds)) + 4 * think, requests: 22 + sets * 1.1 + avg(w.exercises) },
        quickCheck: { seconds: 2 * think, requests: 16 },
        weighIn: { seconds: 4 * think + 12, requests: 19 },
        progress: { seconds: 5 * think, requests: 22 },
        explore: { seconds: 4 * think, requests: 18 },
        settings: { seconds: 3 * think, requests: 18 },
    };
    const mix = loaded.config.visitMix;
    const total = VISIT_KINDS.reduce((s, k) => s + mix[k], 0);
    let seconds = 0;
    let requests = 0;
    for (const k of VISIT_KINDS) {
        seconds += (mix[k] / total) * shape[k].seconds;
        requests += (mix[k] / total) * shape[k].requests;
    }
    return { seconds, requests };
}

async function plan(loaded: LoadedConfig): Promise<number> {
    const { config: c, durationS } = loaded;
    const s = new Schedule(c, Date.now());
    const shape = visitShape(loaded);
    const peak = s.peakVisitsPerHour() * Math.max(1, ...c.load.stages.map((x) => x.multiplier)) * c.load.clockSpeed;
    const bars = " ▁▂▃▄▅▆▇█";
    const max = Math.max(...c.population.hourlyCurve);
    const curve = c.population.hourlyCurve.map((x) => bars[Math.round((x / max) * 8)]).join("");
    const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1));

    console.log(`
${c.name}${c.description ? ` — ${c.description}` : ""}
  target      ${c.target.apiUrl}
  users       ${c.users.count.toLocaleString("en-US")} seeded accounts (${emailOf(c.users.first)} …)
  duration    ${formatDuration(durationS)}${c.load.clockSpeed > 1 ? ` · clock ×${c.load.clockSpeed} (a day every ${formatDuration(86_400 / c.load.clockSpeed)})` : ""}
  load        ×${c.load.multiplier}${c.load.stages.length ? ` · stages ${c.load.stages.map((x) => `${x.duration}→×${x.multiplier}`).join(", ")}` : ` · ramp-up ${c.load.rampUp}`}
  day (${c.population.timezone})  0h ${curve} 23h

  ≈ ${fmt(s.visitsPerDay)} app opens a day, peak ≈ ${fmt(peak)}/h
  ≈ ${fmt(shape.seconds / 60)} min and ${fmt(shape.requests)} requests per visit on average
  at peak ≈ ${fmt((peak / 3600) * shape.seconds)} people in the app at once, ≈ ${fmt((peak / 3600) * shape.requests)} req/s
  bots    ${c.attacks.credentialStuffing.attemptsPerHour}/h credential-stuffing attempts
  paid    AI check-ins ${c.paid.aiCheckinsShare ? `${Math.round(c.paid.aiCheckinsShare * 100)}% of users (Groq calls!)` : "off"} · OTP sends ${c.paid.otpSends ? "ON (real emails)" : "off"}
  stop if p95 > ${c.thresholds.p95Ms}ms or errors > ${(c.thresholds.errorRate * 100).toFixed(2)}% over ${c.thresholds.windowMinutes} min: ${c.thresholds.abortOnBreach ? "yes" : "no (logged only)"}
`);
    if ((peak / 3600) * shape.seconds > c.users.count * 0.5) {
        console.log(`  ⚠ At peak about half the users or more would be in the app at once: seed more (users.count) for realistic spread.\n`);
    }
    return preflight(loaded);
}

/** Checks the API answers, the seeded password works, and the load-test key is honoured. */
async function preflight(loaded: LoadedConfig): Promise<number> {
    const c = loaded.config;
    configureHttp(c);
    let ok = true;
    const line = (good: boolean, text: string) => {
        console.log(`  ${good ? "✓" : "✕"} ${text}`);
        if (!good) ok = false;
    };
    const key = process.env[c.target.loadTestKeyEnv];
    const probe = async (ip: string) => {
        const res = await fetch(`${c.target.apiUrl}/auth/config`, {
            headers: key ? { "x-load-test-key": key, "x-load-test-client-ip": ip } : {},
        });
        await res.text();
        return { status: res.status, remaining: Number(/remaining=(\d+)/.exec(res.headers.get("ratelimit") ?? "")?.[1] ?? NaN) };
    };
    try {
        const ipA = `10.255.${Math.floor(Math.random() * 256)}.1`;
        const a1 = await probe(ipA);
        line(a1.status === 200, `API answers (GET /auth/config → ${a1.status})`);
        if (key) {
            const a2 = await probe(ipA);
            const b = await probe(`10.254.${Math.floor(Math.random() * 256)}.2`);
            const honoured = Number.isFinite(b.remaining) && b.remaining > a2.remaining;
            line(honoured, honoured
                ? "load-test key honoured: each simulated user gets its own rate-limit bucket"
                : "load-test key NOT honoured (check LOAD_TEST_SECRET / LOAD_TEST_SOURCE_IPS on the API): everyone shares one IP's limits");
        } else {
            line(false, `${c.target.loadTestKeyEnv} not set: everyone shares this machine's rate limits`);
        }
    } catch (err) {
        line(false, `API unreachable: ${(err as Error).message}`);
        return 1;
    }
    const password = process.env[c.users.passwordEnv];
    if (!password) {
        line(false, `${c.users.passwordEnv} not set`);
    } else {
        const population = new Population({ ...c, users: { ...c.users, count: 1 } });
        const u = population.users[0];
        const auth = new Auth({ password, typoRate: 0, repeatTypoRate: 0, maxAttempts: 1, rememberedDeviceShare: 1, otpSends: false });
        pace.scale = 0;
        const signedIn = await auth.login(u);
        line(signedIn, signedIn ? `${u.email} signs in` : `${u.email} can't sign in: run seed-load-users with the same ${c.users.passwordEnv}; in production the API also needs this machine's ${c.target.loadTestKeyEnv} (and IP, if LOAD_TEST_SOURCE_IPS is set)`);
        if (signedIn) await auth.logout(u);
    }
    console.log(ok ? "\nReady. Start it with: run --config <file>\n" : "\nFix the ✕ above first.\n");
    return ok ? 0 : 1;
}

// ── prepare ──────────────────────────────────────────────────────────────────────────────

async function prepare(loaded: LoadedConfig, concurrency: number): Promise<number> {
    const c = loaded.config;
    const password = process.env[c.users.passwordEnv];
    if (!password) throw new Error(`${c.users.passwordEnv} is not set`);
    configureHttp(c);
    pace.scale = 0;
    const population = new Population(c);
    const auth = new Auth({ password, typoRate: 0, repeatTypoRate: 0, maxAttempts: 1, rememberedDeviceShare: 1, otpSends: false });
    const visits = new Visits(c, auth);
    let next = 0;
    let done = 0;
    let failed = 0;
    const started = Date.now();
    const worker = async () => {
        while (next < population.users.length) {
            const u = population.users[next++];
            if (!(await visits.prepare(u))) failed++;
            if (++done % 100 === 0) console.log(`  ${done}/${population.users.length} (${counters.onboardings} onboarded, ${failed} failed)`);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    console.log(`prepare: ${done} users in ${formatDuration((Date.now() - started) / 1000)}: ${counters.onboardings} onboarded now, ${counters.plansSelected} plans picked, ${failed} failed`);
    return failed ? 1 : 0;
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        console.error(`load-tester: ${(err as Error).message}`);
        process.exit(1);
    });
