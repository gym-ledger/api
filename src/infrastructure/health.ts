import { logger } from "../config/logger.js";
import { pg } from "./postgres/index.js";
import { redis } from "./redis/index.js";

/** A dependency slower than this to answer counts as down. */
const CHECK_TIMEOUT_MS = 2000;
/** Results are reused this long, so a flood of /health calls can't load the database. */
const CACHE_MS = 2000;

type CheckResult = { ok: boolean, latency_ms: number };
export type HealthReport = { ok: boolean, checks: { database: CheckResult, redis: CheckResult } };

const timed = async (name: string, check: () => Promise<unknown>): Promise<CheckResult> => {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
        await Promise.race([
            check(),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
            }),
        ]);
        return { ok: true, latency_ms: Date.now() - started };
    } catch (error) {
        logger.warn({ error, dependency: name }, "Health check failed");
        return { ok: false, latency_ms: Date.now() - started };
    } finally {
        clearTimeout(timer);
    }
};

let cached: { at: number, report: Promise<HealthReport> } | null = null;

const runChecks = async (): Promise<HealthReport> => {
    const [database, redisCheck] = await Promise.all([
        timed("database", () => pg.query("SELECT 1")),
        timed("redis", async () => {
            if (!redis.isReady) throw new Error("not connected");
            await redis.ping();
        }),
    ]);
    return { ok: database.ok && redisCheck.ok, checks: { database, redis: redisCheck } };
};

/** Whether Postgres and Redis answer right now (cached for CACHE_MS). */
export const checkHealth = (): Promise<HealthReport> => {
    if (!cached || Date.now() - cached.at > CACHE_MS) {
        cached = { at: Date.now(), report: runChecks() };
    }
    return cached.report;
};
