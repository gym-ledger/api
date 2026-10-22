import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { pg } from "../postgres/index.js";
import { requestIssuesDropped } from "./index.js";

export const API_REQUEST_ISSUES_TABLE = "api_request_issues";

export interface RequestIssue {
    requestId: string | null;
    method: string;
    route: string;
    path: string;
    statusCode: number;
    durationMs: number;
    isError: boolean;
    isSlow: boolean;
    errorType: string | null;
    errorMessage: string | null;
    errorStack: string | null;
    userId: string | null;
    adminUserId: string | null;
}

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 200;
/**
 * Rows waiting beyond this are dropped (and counted in Prometheus), so a
 * flood of failing requests — or a database outage — can't grow memory
 * without bound or turn into a write storm.
 */
const MAX_BUFFERED = 5_000;

const COLUMNS = [
    "request_id", "method", "route", "path", "status_code", "duration_ms",
    "is_error", "is_slow", "error_type", "error_message", "error_stack",
    "user_id", "admin_user_id",
] as const;

let buffer: RequestIssue[] = [];
let timer: NodeJS.Timeout | null = null;
let flushing: Promise<void> | null = null;

const clip = (value: string | null, max: number) => (value && value.length > max ? value.slice(0, max) : value);

const insertBatch = async (rows: RequestIssue[]) => {
    const values: unknown[] = [];
    const tuples = rows.map((row, i) => {
        values.push(
            clip(row.requestId, 64),
            row.method,
            clip(row.route, 255),
            clip(row.path, 500),
            row.statusCode,
            row.durationMs,
            row.isError,
            row.isSlow,
            clip(row.errorType, 50),
            clip(row.errorMessage, 1000),
            clip(row.errorStack, 8000),
            row.userId,
            row.adminUserId,
        );
        const base = i * COLUMNS.length;
        return `(${COLUMNS.map((_, c) => `$${base + c + 1}`).join(", ")})`;
    });
    await pg.query(
        `INSERT INTO ${API_REQUEST_ISSUES_TABLE} (${COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}`,
        values,
    );
}

/** Writes everything buffered so far. Never throws. */
export const flushRequestIssues = (): Promise<void> => {
    if (flushing) return flushing;
    flushing = (async () => {
        while (buffer.length > 0) {
            const batch = buffer.slice(0, FLUSH_BATCH_SIZE);
            buffer = buffer.slice(batch.length);
            try {
                await insertBatch(batch);
            } catch (error) {
                requestIssuesDropped.inc({ reason: "insert_failed" }, batch.length);
                logger.error({ error, rows: batch.length }, "Failed to write API request issues");
                // Don't retry into a database that's down; the next tick tries new rows.
                break;
            }
        }
    })().finally(() => {
        flushing = null;
    });
    return flushing;
}

/**
 * Queues one error/slow request for the next batch insert. Not awaited by
 * the request: logging must never slow down or break a response.
 */
export const recordRequestIssue = (issue: RequestIssue): void => {
    if (buffer.length >= MAX_BUFFERED) {
        requestIssuesDropped.inc({ reason: "buffer_full" });
        return;
    }
    buffer.push(issue);
    if (buffer.length >= FLUSH_BATCH_SIZE) {
        void flushRequestIssues();
    }
    if (!timer) {
        timer = setInterval(() => void flushRequestIssues(), FLUSH_INTERVAL_MS);
        timer.unref();
    }
}

/** Deletes rows older than REQUEST_LOG_RETENTION_DAYS. Idempotent, so safe on every instance. */
export const purgeExpiredRequestIssues = async () => {
    const result = await pg.query(
        `DELETE FROM ${API_REQUEST_ISSUES_TABLE} WHERE created_at < NOW() - make_interval(days => $1)`,
        [env.REQUEST_LOG_RETENTION_DAYS],
    );
    if (result.rowCount) {
        logger.info({ rows: result.rowCount }, "Purged expired API request issues");
    }
}
