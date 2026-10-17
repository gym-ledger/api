import { logger } from "../../config/logger.js";
import { pg } from "../postgres/index.js";
import { redis } from "../redis/index.js";

export const AI_REQUESTS_TABLE = "ai_requests";

export type AiRequestStatus =
    | "success"
    | "rate_limited"
    | "timeout"
    | "provider_error"
    | "bad_output"
    | "daily_limit"
    | "not_configured";

export interface AiRequestLogEntry {
    userId: string | null;
    feature: string;
    model: string;
    status: AiRequestStatus;
    promptTokens: number | null;
    completionTokens: number | null;
    latencyMs: number | null;
}

// Rows older than this are deleted. Decided with the product owner: 1 year.
const RETENTION_INTERVAL = "1 year";

/**
 * Deletes expired rows at most once per UTC day across every API process
 * (Redis SET NX), piggybacking on the first call logged that day — so there
 * is no cron to run.
 */
const purgeExpiredOncePerDay = async () => {
    const key = `ai_requests:purged:${new Date().toISOString().slice(0, 10)}`;
    const acquired = await redis.set(key, "1", { NX: true, EX: 60 * 60 * 48 });
    if (acquired !== "OK") {
        return;
    }
    await pg.query(`DELETE FROM ${AI_REQUESTS_TABLE} WHERE created_at < NOW() - INTERVAL '${RETENTION_INTERVAL}'`);
}

/**
 * Records one model call. Never throws and isn't awaited by the caller: a
 * failed log write must not break the user's request.
 */
export const logAiRequest = (entry: AiRequestLogEntry): void => {
    pg.query(
        `INSERT INTO ${AI_REQUESTS_TABLE}
            (user_id, feature, model, status, prompt_tokens, completion_tokens, latency_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            entry.userId,
            entry.feature,
            entry.model,
            entry.status,
            entry.promptTokens,
            entry.completionTokens,
            entry.latencyMs,
        ],
    )
        .then(
            () => purgeExpiredOncePerDay().catch((error) => {
                logger.warn({ error }, "Failed to purge expired AI request rows");
            }),
            (error) => {
                logger.error({ error, feature: entry.feature, status: entry.status }, "Failed to log AI request");
            },
        );
}
