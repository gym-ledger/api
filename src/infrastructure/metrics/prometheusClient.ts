import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors/AppError.js";

/**
 * Minimal read-only client for Prometheus's HTTP API, used by the admin API
 * page. Only fixed queries built in admin.monitoring are ever sent, never
 * PromQL from the client.
 */

const TIMEOUT_MS = 5_000;

export interface PromSample {
    labels: Record<string, string>;
    value: number | null;
}

export interface PromSeries {
    labels: Record<string, string>;
    points: { t: number, value: number | null }[];
}

type PromResponse<T> = { status: "success", data: { resultType: string, result: T[] } } | { status: "error", error: string };
type RawVector = { metric: Record<string, string>, value: [number, string] };
type RawMatrix = { metric: Record<string, string>, values: [number, string][] };

export const isPrometheusConfigured = () => Boolean(env.PROMETHEUS_URL);

/** NaN (no data in a quantile) and ±Inf become null, so the JSON stays valid. */
const toNumber = (raw: string) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

const call = async <T>(path: string, params: Record<string, string>): Promise<T[]> => {
    if (!env.PROMETHEUS_URL) {
        throw new AppError("Prometheus is not configured (PROMETHEUS_URL)", 503);
    }
    let response: Response;
    try {
        response = await fetch(`${env.PROMETHEUS_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(params),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (error) {
        logger.warn({ error }, "Prometheus unreachable");
        throw new AppError("Prometheus is unreachable", 503);
    }
    const body = await response.json().catch(() => null) as PromResponse<T> | null;
    if (!response.ok || !body || body.status !== "success") {
        logger.warn({ status: response.status, error: body && body.status === "error" ? body.error : null, query: params.query }, "Prometheus query failed");
        throw new AppError("Prometheus query failed", 503);
    }
    return body.data.result;
}

/** Instant query: one value per series, at now. */
export const promQuery = async (query: string): Promise<PromSample[]> => {
    const result = await call<RawVector>("/api/v1/query", { query });
    return result.map((r) => ({ labels: r.metric, value: toNumber(r.value[1]) }));
}

/** Range query from `startSec` to now, one point every `stepSec`. */
export const promQueryRange = async (query: string, startSec: number, endSec: number, stepSec: number): Promise<PromSeries[]> => {
    const result = await call<RawMatrix>("/api/v1/query_range", {
        query,
        start: String(startSec),
        end: String(endSec),
        step: String(stepSec),
    });
    return result.map((r) => ({
        labels: r.metric,
        points: r.values.map(([t, v]) => ({ t: t * 1000, value: toNumber(v) })),
    }));
}

/** Whether Prometheus answers right now; never throws. */
export const pingPrometheus = async () => {
    if (!env.PROMETHEUS_URL) return false;
    try {
        const response = await fetch(`${env.PROMETHEUS_URL}/-/ready`, { signal: AbortSignal.timeout(2_000) });
        return response.ok;
    } catch {
        return false;
    }
}
