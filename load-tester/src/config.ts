// The run's JSON config: what it looks like, its defaults, and the checks that turn a typo into
// a clear error before any request goes out. Every field is optional except `target.apiUrl`;
// configs/*.json are worked examples.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const VISIT_KINDS = ["workout", "quickCheck", "weighIn", "progress", "explore", "settings"] as const;
export type VisitKind = typeof VISIT_KINDS[number];

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = typeof WEEKDAYS[number];

/** [min, max]: each use draws uniformly between them. */
export type Range = [number, number];

export interface Stage {
    /** How long the stage lasts ("90s", "10m", "2h", "3d"). */
    duration: string;
    /**
     * Load multiplier at the end of the stage; it moves linearly from the previous stage's
     * (from 0 for the first, like k6). With stages, `load.rampUp` is ignored.
     */
    multiplier: number;
}

export interface Config {
    name: string;
    description: string;
    target: {
        /** Base URL of the API, with its prefix: https://api.example.com/api/v1 */
        apiUrl: string;
        /** Env var holding LOAD_TEST_SECRET (same value as the API's). Unset = no header sent. */
        loadTestKeyEnv: string;
        requestTimeoutMs: number;
        /** Sent as User-Agent; the API records it on sessions. */
        userAgent: string;
    };
    users: {
        /** Seeded accounts lt-<first>…lt-<first+count-1>@loadtest.invalid (seed-load-users). */
        count: number;
        first: number;
        passwordEnv: string;
    };
    population: {
        /** Share of all users who open the app on an average day. */
        dailyActiveShare: number;
        /** App opens per active user per day. */
        visitsPerActiveUser: number;
        /** IANA zone the hourly curve and weekday factors are read in. */
        timezone: string;
        /** 24 weights, hour 0…23: when people open the app. Normalised, so only their shape matters. */
        hourlyCurve: number[];
        /** Load on each weekday relative to an average day. */
        weekdayFactors: Record<Weekday, number>;
        /**
         * How unequal usage is: 0 = every user equally likely; 1 ≈ the heavy tail real apps see
         * (a few regulars open it daily, most a couple of times a month).
         */
        activitySkew: number;
        /** Share of app opens on a device that still holds a valid session (no password typed). */
        rememberedDeviceShare: number;
        /** Share of users behind a shared IP (a gym's Wi-Fi, carrier NAT), in groups of `sharedIpGroupSize`. */
        sharedIpShare: number;
        sharedIpGroupSize: number;
    };
    /** What an app open is for. Weights, normalised. */
    visitMix: Record<VisitKind, number>;
    behaviour: {
        /** Pause between screens, seconds. */
        thinkSeconds: Range;
        /** Hold the notification stream (SSE) open while the app is open, as the web app does. */
        notificationStream: boolean;
        workout: {
            exercises: Range;
            setsPerExercise: Range;
            restSeconds: Range;
            /** Seconds spent doing a set (between rest periods). */
            setSeconds: Range;
            warmupShare: number;
            dropSetShare: number;
            /** Workouts left unfinished (the app closed mid-way). */
            abandonShare: number;
            /** Workouts logged offline (bad gym signal): sets queue up and go as one batch. */
            offlineShare: number;
            /** Sets edited after logging. */
            editSetShare: number;
            /** Exercises added mid-workout. */
            adhocExerciseShare: number;
        };
    };
    logins: {
        /** Share of typed passwords that are wrong (typos, caps lock, old password). */
        typoRate: number;
        /** Chance of typing it wrong again after a typo. */
        repeatTypoRate: number;
        /** Wrong attempts before giving up (and, with paid.otpSends, using "forgot password"). */
        maxAttempts: number;
        /** Share of app opens that end with an explicit logout. */
        logoutShare: number;
    };
    attacks: {
        credentialStuffing: {
            /**
             * Login attempts per hour by bots trying leaked email/password pairs, at multiplier 1.
             * Scales with load.multiplier and stages (not with the hour of day: bots don't sleep).
             */
            attemptsPerHour: number;
            /** Share of attempts on an email that exists here (the rest are unknown accounts). */
            existingAccountShare: number;
            /** Attempts per bot IP before it rotates (low = residential proxies, high = one VPS). */
            attemptsPerIp: number;
        };
    };
    /** Requests that cost money. Off unless turned on. */
    paid: {
        /** Users opted into AI weekly check-ins (Groq). 0 = everyone opted out. */
        aiCheckinsShare: number;
        /**
         * Allow "forgot password" after failed logins, which sends a real OTP email to an
         * @loadtest.invalid address. It bounces, and bounces hurt the sending domain's
         * reputation: only against an API whose email sending is stubbed. Needs CAPTCHA_PROVIDER=none.
         */
        otpSends: boolean;
    };
    load: {
        /** "30m", "2h", "7d" or "forever". With `stages`, the stages' total when unset. */
        duration: string;
        /** Scales the whole arrival rate (1 = the population above, as is). */
        multiplier: number;
        /** Optional multiplier profile over time (ramps, spikes, steps); the last one holds. */
        stages: Stage[];
        /**
         * Speeds up the day: 24 runs a whole day's curve in an hour. Session lengths don't
         * change, so keep it 1 for soak tests.
         */
        clockSpeed: number;
        /** Gradual start: the rate ramps from 0 over this long. */
        rampUp: string;
        /** Hard cap on users in the app at once (protects the generator). */
        maxConcurrentVisits: number;
    };
    thresholds: {
        /** Over the last `windowMinutes`: */
        p95Ms: number;
        errorRate: number;
        windowMinutes: number;
        /** Stop the run at the first breach (breakpoint tests). */
        abortOnBreach: boolean;
    };
    report: {
        dir: string;
        /** Seconds between timeline points. */
        tickSeconds: number;
        /** Continue the latest unfinished run of this config after a restart (soak tests). */
        resume: boolean;
    };
}

// A gym app's day (rough, from public fitness-app usage curves): quiet at night, a morning
// peak before work, a lull, and the main evening peak after work.
const GYM_DAY = [
    0.4, 0.2, 0.15, 0.15, 0.3, 1.2, 3.2, 4.4, 3.8, 2.6, 2.2, 2.2,
    2.4, 2.2, 1.9, 2.1, 3.0, 4.3, 5.2, 5.0, 3.8, 2.6, 1.6, 0.8,
];

export const DEFAULTS: Config = {
    name: "load-test",
    description: "",
    target: {
        apiUrl: "",
        loadTestKeyEnv: "LOAD_TEST_SECRET",
        requestTimeoutMs: 30_000,
        userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 GymLedgerLoadTest/1.0",
    },
    users: { count: 1000, first: 1, passwordEnv: "LOAD_USER_PASSWORD" },
    population: {
        dailyActiveShare: 0.35,
        visitsPerActiveUser: 1.8,
        timezone: "Asia/Kolkata",
        hourlyCurve: GYM_DAY,
        weekdayFactors: { mon: 1.2, tue: 1.1, wed: 1.05, thu: 1.0, fri: 0.9, sat: 0.85, sun: 0.75 },
        activitySkew: 0.7,
        rememberedDeviceShare: 0.9,
        sharedIpShare: 0.2,
        sharedIpGroupSize: 25,
    },
    visitMix: { workout: 0.42, quickCheck: 0.28, weighIn: 0.12, progress: 0.1, explore: 0.06, settings: 0.02 },
    behaviour: {
        thinkSeconds: [2, 15],
        notificationStream: true,
        workout: {
            exercises: [4, 7],
            setsPerExercise: [3, 4],
            restSeconds: [60, 180],
            setSeconds: [25, 60],
            warmupShare: 0.15,
            dropSetShare: 0.05,
            abandonShare: 0.06,
            offlineShare: 0.08,
            editSetShare: 0.05,
            adhocExerciseShare: 0.1,
        },
    },
    logins: { typoRate: 0.08, repeatTypoRate: 0.25, maxAttempts: 4, logoutShare: 0.02 },
    attacks: {
        credentialStuffing: { attemptsPerHour: 30, existingAccountShare: 0.05, attemptsPerIp: 3 },
    },
    paid: { aiCheckinsShare: 0, otpSends: false },
    load: {
        duration: "1h",
        multiplier: 1,
        stages: [],
        clockSpeed: 1,
        rampUp: "2m",
        maxConcurrentVisits: 5000,
    },
    thresholds: { p95Ms: 1000, errorRate: 0.01, windowMinutes: 5, abortOnBreach: false },
    report: { dir: "runs", tickSeconds: 10, resume: true },
};

// ── Durations ────────────────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 };

/** "90s", "10m", "1h30m", "2d", "forever" → seconds (Infinity for forever). */
export function parseDuration(text: string): number {
    const t = String(text).trim().toLowerCase();
    if (t === "forever" || t === "indefinite" || t === "∞") return Infinity;
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    let total = 0;
    let rest = t;
    const part = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)/;
    while (rest) {
        const m = part.exec(rest);
        if (!m) throw new Error(`"${text}" is not a duration (try 90s, 10m, 2h, 3d or forever)`);
        total += Number(m[1]) * UNITS[m[2]];
        rest = rest.slice(m[0].length);
    }
    return total;
}

export function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds)) return "forever";
    const d = Math.floor(seconds / 86_400);
    const h = Math.floor((seconds % 86_400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && s && `${s}s`].filter(Boolean);
    return parts.join(" ") || "0s";
}

// ── Loading ──────────────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep-merges `over` onto `base`; arrays and scalars replace. Unknown keys are errors. */
function merge(base: unknown, over: unknown, path: string, errors: string[]): unknown {
    if (over === undefined) return base;
    if (isObject(base)) {
        if (!isObject(over)) {
            errors.push(`${path || "config"} must be an object`);
            return base;
        }
        const out: Json = { ...base };
        for (const [k, v] of Object.entries(over)) {
            if (k.startsWith("$") || k.startsWith("//")) continue; // $schema, comments
            if (!(k in base)) {
                errors.push(`${path ? `${path}.` : ""}${k} is not a setting (typo?)`);
                continue;
            }
            out[k] = merge(base[k], v, path ? `${path}.${k}` : k, errors);
        }
        return out;
    }
    if (Array.isArray(base) && !Array.isArray(over)) {
        errors.push(`${path} must be an array`);
        return base;
    }
    if (!Array.isArray(base) && typeof base !== typeof over) {
        errors.push(`${path} must be a ${typeof base}`);
        return base;
    }
    return over;
}

function validate(c: Config, errors: string[]): void {
    const check = (ok: boolean, message: string) => {
        if (!ok) errors.push(message);
    };
    const share = (v: number, path: string) => check(v >= 0 && v <= 1, `${path} must be between 0 and 1`);
    const range = (r: Range, path: string, min = 0) =>
        check(Array.isArray(r) && r.length === 2 && r[0] >= min && r[1] >= r[0], `${path} must be [min, max] with ${min} ≤ min ≤ max`);
    const duration = (v: string, path: string) => {
        try {
            parseDuration(v);
        } catch (err) {
            errors.push(`${path}: ${(err as Error).message}`);
        }
    };

    check(/^[a-z0-9][a-z0-9._-]{0,60}$/i.test(c.name), "name: letters, digits, . _ - only (it names the run's folder)");
    try {
        const u = new URL(c.target.apiUrl);
        check(u.protocol === "https:" || u.protocol === "http:", "target.apiUrl must be http(s)");
    } catch {
        errors.push("target.apiUrl is required, e.g. https://api.example.com/api/v1");
    }
    check(c.target.requestTimeoutMs >= 1000, "target.requestTimeoutMs must be at least 1000");
    check(Number.isInteger(c.users.count) && c.users.count >= 1, "users.count must be a whole number ≥ 1");
    check(Number.isInteger(c.users.first) && c.users.first >= 1, "users.first must be a whole number ≥ 1");

    const p = c.population;
    share(p.dailyActiveShare, "population.dailyActiveShare");
    check(p.visitsPerActiveUser > 0, "population.visitsPerActiveUser must be > 0");
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: p.timezone });
    } catch {
        errors.push(`population.timezone "${p.timezone}" is not an IANA zone (e.g. Asia/Kolkata)`);
    }
    check(p.hourlyCurve.length === 24 && p.hourlyCurve.every((x) => x >= 0) && p.hourlyCurve.some((x) => x > 0),
        "population.hourlyCurve must be 24 non-negative numbers, not all 0");
    for (const d of WEEKDAYS) check(p.weekdayFactors[d] >= 0, `population.weekdayFactors.${d} must be ≥ 0`);
    check(p.activitySkew >= 0 && p.activitySkew <= 2, "population.activitySkew must be between 0 and 2");
    share(p.rememberedDeviceShare, "population.rememberedDeviceShare");
    share(p.sharedIpShare, "population.sharedIpShare");
    check(p.sharedIpGroupSize >= 2, "population.sharedIpGroupSize must be ≥ 2");

    const mix = Object.values(c.visitMix);
    check(mix.every((x) => x >= 0) && mix.some((x) => x > 0), "visitMix weights must be ≥ 0, not all 0");

    const b = c.behaviour;
    range(b.thinkSeconds, "behaviour.thinkSeconds");
    const w = b.workout;
    range(w.exercises, "behaviour.workout.exercises", 1);
    range(w.setsPerExercise, "behaviour.workout.setsPerExercise", 1);
    range(w.restSeconds, "behaviour.workout.restSeconds");
    range(w.setSeconds, "behaviour.workout.setSeconds");
    for (const k of ["warmupShare", "dropSetShare", "abandonShare", "offlineShare", "editSetShare", "adhocExerciseShare"] as const) {
        share(w[k], `behaviour.workout.${k}`);
    }

    share(c.logins.typoRate, "logins.typoRate");
    share(c.logins.repeatTypoRate, "logins.repeatTypoRate");
    share(c.logins.logoutShare, "logins.logoutShare");
    check(Number.isInteger(c.logins.maxAttempts) && c.logins.maxAttempts >= 1, "logins.maxAttempts must be a whole number ≥ 1");

    const cs = c.attacks.credentialStuffing;
    check(cs.attemptsPerHour >= 0, "attacks.credentialStuffing.attemptsPerHour must be ≥ 0");
    share(cs.existingAccountShare, "attacks.credentialStuffing.existingAccountShare");
    check(cs.attemptsPerIp >= 1, "attacks.credentialStuffing.attemptsPerIp must be ≥ 1");

    share(c.paid.aiCheckinsShare, "paid.aiCheckinsShare");

    const l = c.load;
    duration(l.duration, "load.duration");
    duration(l.rampUp, "load.rampUp");
    check(l.multiplier >= 0, "load.multiplier must be ≥ 0");
    check(l.clockSpeed >= 1 && l.clockSpeed <= 1440, "load.clockSpeed must be between 1 and 1440");
    check(l.maxConcurrentVisits >= 1, "load.maxConcurrentVisits must be ≥ 1");
    l.stages.forEach((s, i) => {
        if (!isObject(s)) return errors.push(`load.stages[${i}] must be { "duration": "5m", "multiplier": 2 }`);
        duration(s.duration, `load.stages[${i}].duration`);
        check(typeof s.multiplier === "number" && s.multiplier >= 0, `load.stages[${i}].multiplier must be ≥ 0`);
    });

    check(c.thresholds.p95Ms > 0, "thresholds.p95Ms must be > 0");
    share(c.thresholds.errorRate, "thresholds.errorRate");
    check(c.thresholds.windowMinutes >= 1, "thresholds.windowMinutes must be ≥ 1");
    check(c.report.tickSeconds >= 1 && c.report.tickSeconds <= 300, "report.tickSeconds must be between 1 and 300");
}

export interface LoadedConfig {
    config: Config;
    /** Seconds; Infinity = until stopped. */
    durationS: number;
    /** Changes when anything that shapes the load changes (a resumed run must match). */
    hash: string;
}

export function parseConfig(raw: unknown): LoadedConfig {
    const errors: string[] = [];
    const config = merge(DEFAULTS, raw, "", errors) as Config;
    // Merge keeps the default wherever a value had the wrong type, so this can run regardless.
    validate(config, errors);
    if (errors.length) {
        throw new Error(`config has ${errors.length} problem${errors.length > 1 ? "s" : ""}:\n${errors.map((e) => `  • ${e}`).join("\n")}`);
    }
    config.target.apiUrl = config.target.apiUrl.replace(/\/+$/, "");
    const stagesS = config.load.stages.reduce((s, x) => s + parseDuration(x.duration), 0);
    const explicit = isObject(raw) && isObject(raw.load) && raw.load.duration !== undefined;
    const durationS = config.load.stages.length && !explicit ? stagesS : parseDuration(config.load.duration);
    const { report: _report, description: _description, ...shape } = config;
    const hash = createHash("sha256").update(JSON.stringify(shape)).digest("hex").slice(0, 12);
    return { config, durationS, hash };
}

export function loadConfig(file: string): LoadedConfig {
    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
        throw new Error(`can't read ${file}: ${(err as Error).message}`);
    }
    return parseConfig(raw);
}
