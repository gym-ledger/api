import { env } from "../../../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { isPrometheusConfigured, pingPrometheus, promQuery, promQueryRange, PromSample } from "../../../infrastructure/metrics/prometheusClient.js";
import {
    fetchIssueFacetsRepository,
    fetchIssueRepository,
    fetchIssuesRepository,
    fetchIssueSummaryRepository,
    IssueFilters,
} from "./adminMonitoring.repository.js";

type Query = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Prometheus: latency percentiles, throughput, error rates
// ---------------------------------------------------------------------------

export type MetricsWindow = "1h" | "6h" | "24h" | "7d" | "30d";

/**
 * Chart resolution per window: one point every `step` seconds, each the
 * rate over `rate` (at least a few 15s scrapes, so it's never empty).
 */
const WINDOWS: Record<MetricsWindow, { seconds: number, step: number, rate: string }> = {
    "1h": { seconds: 3600, step: 60, rate: "2m" },
    "6h": { seconds: 6 * 3600, step: 300, rate: "5m" },
    "24h": { seconds: 24 * 3600, step: 900, rate: "15m" },
    "7d": { seconds: 7 * 24 * 3600, step: 3600, rate: "1h" },
    "30d": { seconds: 30 * 24 * 3600, step: 4 * 3600, rate: "4h" },
};

const DURATION = "http_request_duration_seconds";
// 401s from an expired access token are the normal refresh path, not
// failures; they are reported on their own.
const CLIENT_ERRORS = `http_errors_total{status_code=~"4..",error_type!="TOKEN_EXPIRED"}`;
const SERVER_ERRORS = `http_errors_total{status_code=~"5.."}`;
const EXPIRED_TOKENS = `http_errors_total{error_type="TOKEN_EXPIRED"}`;

const quantile = (q: number, range: string, by = "") =>
    `histogram_quantile(${q}, sum by (le${by ? `, ${by}` : ""}) (rate(${DURATION}_bucket[${range}])))`;

const single = (samples: PromSample[]) => samples[0]?.value ?? null;

/** Seconds → whole milliseconds; null stays null. */
const ms = (seconds: number | null) => (seconds === null ? null : Math.round(seconds * 1000));

const parseWindow = (query: Query): MetricsWindow => {
    const value = (query.window as string | undefined) ?? "24h";
    if (!(value in WINDOWS)) {
        throw new AppError("window must be one of 1h, 6h, 24h, 7d, 30d", 400);
    }
    return value as MetricsWindow;
}

export const getMonitoringStatusService = async () => ({
    prometheus: {
        configured: isPrometheusConfigured(),
        reachable: await pingPrometheus(),
    },
    grafanaUrl: env.GRAFANA_URL ?? null,
    slowThresholdMs: env.REQUEST_LOG_SLOW_MS,
    retentionDays: env.REQUEST_LOG_RETENTION_DAYS,
});

/** Headline numbers, errors by status/type, process health, and the chart series. */
export const getLatencyOverviewService = async (query: Query) => {
    const window = parseWindow(query);
    const { seconds, step, rate } = WINDOWS[window];
    const end = Math.floor(Date.now() / 1000);
    const start = end - seconds;

    const [
        requests, p50, p95, p99, clientErrors, serverErrors, expiredTokens, aborted,
        errorsByStatus, eventLoopP99, heapUsed, cpu, poolWaiting, inFlight,
        seriesP50, seriesP95, seriesP99, seriesRps, seriesClient, seriesServer,
    ] = await Promise.all([
        promQuery(`sum(increase(${DURATION}_count[${window}]))`),
        promQuery(quantile(0.5, window)),
        promQuery(quantile(0.95, window)),
        promQuery(quantile(0.99, window)),
        promQuery(`sum(increase(${CLIENT_ERRORS}[${window}]))`),
        promQuery(`sum(increase(${SERVER_ERRORS}[${window}]))`),
        promQuery(`sum(increase(${EXPIRED_TOKENS}[${window}]))`),
        promQuery(`sum(increase(http_requests_aborted_total[${window}]))`),
        promQuery(`sum by (status_code, error_type) (increase(http_errors_total[${window}])) > 0`),
        promQuery(`max(nodejs_eventloop_lag_p99_seconds)`),
        promQuery(`sum(nodejs_heap_size_used_bytes)`),
        promQuery(`sum(rate(process_cpu_seconds_total[${rate}]))`),
        promQuery(`sum(pg_pool_connections{state="waiting"})`),
        promQuery(`sum(http_requests_in_flight)`),
        promQueryRange(quantile(0.5, rate), start, end, step),
        promQueryRange(quantile(0.95, rate), start, end, step),
        promQueryRange(quantile(0.99, rate), start, end, step),
        promQueryRange(`sum(rate(${DURATION}_count[${rate}])) * 60`, start, end, step),
        promQueryRange(`sum(rate(${CLIENT_ERRORS}[${rate}])) * 60`, start, end, step),
        promQueryRange(`sum(rate(${SERVER_ERRORS}[${rate}])) * 60`, start, end, step),
    ]);

    const total = single(requests) ?? 0;
    // No error series yet just means zero errors.
    const pct = (n: number | null) => (total === 0 ? null : Math.round(((n ?? 0) / total) * 10000) / 100);

    // Range series line up on the same timestamps; merge them into rows.
    const rows = new Map<number, Record<string, number | null>>();
    const put = (series: typeof seriesP50, key: string, transform: (v: number | null) => number | null) => {
        for (const point of series[0]?.points ?? []) {
            const row = rows.get(point.t) ?? { t: point.t };
            row[key] = transform(point.value);
            rows.set(point.t, row);
        }
    };
    const round2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
    put(seriesP50, "p50_ms", ms);
    put(seriesP95, "p95_ms", ms);
    put(seriesP99, "p99_ms", ms);
    put(seriesRps, "requests_per_min", round2);
    put(seriesClient, "client_errors_per_min", round2);
    put(seriesServer, "server_errors_per_min", round2);

    return {
        window,
        summary: {
            requests: Math.round(total),
            p50_ms: ms(single(p50)),
            p95_ms: ms(single(p95)),
            p99_ms: ms(single(p99)),
            client_errors: Math.round(single(clientErrors) ?? 0),
            server_errors: Math.round(single(serverErrors) ?? 0),
            client_error_rate_pct: pct(single(clientErrors)),
            server_error_rate_pct: pct(single(serverErrors)),
            expired_token_401s: Math.round(single(expiredTokens) ?? 0),
            aborted: Math.round(single(aborted) ?? 0),
        },
        errorsByStatus: errorsByStatus
            .map((s) => ({
                status_code: Number(s.labels.status_code),
                error_type: s.labels.error_type,
                count: Math.round(s.value ?? 0),
            }))
            .sort((a, b) => b.count - a.count),
        process: {
            event_loop_lag_p99_ms: ms(single(eventLoopP99)),
            heap_used_mb: (() => {
                const bytes = single(heapUsed);
                return bytes === null ? null : Math.round(bytes / 1024 / 1024);
            })(),
            cpu_cores_used: round2(single(cpu)),
            db_pool_waiting: single(poolWaiting),
            in_flight: single(inFlight),
        },
        series: [...rows.values()].sort((a, b) => (a.t as number) - (b.t as number)),
    };
}

/** One row per route: volume, percentiles, error counts. */
export const getRouteStatsService = async (query: Query) => {
    const window = parseWindow(query);
    const by = "method, route";
    const [counts, p50, p95, p99, clientErrors, serverErrors] = await Promise.all([
        promQuery(`sum by (${by}) (increase(${DURATION}_count[${window}])) > 0`),
        promQuery(quantile(0.5, window, by)),
        promQuery(quantile(0.95, window, by)),
        promQuery(quantile(0.99, window, by)),
        promQuery(`sum by (${by}) (increase(${CLIENT_ERRORS}[${window}]))`),
        promQuery(`sum by (${by}) (increase(${SERVER_ERRORS}[${window}]))`),
    ]);
    const key = (s: PromSample) => `${s.labels.method} ${s.labels.route}`;
    const index = (samples: PromSample[]) => new Map(samples.map((s) => [key(s), s.value]));
    const [i50, i95, i99, iClient, iServer] = [p50, p95, p99, clientErrors, serverErrors].map(index);

    return {
        window,
        routes: counts
            .map((s) => {
                const k = key(s);
                const requests = Math.round(s.value ?? 0);
                const client = Math.round(iClient.get(k) ?? 0);
                const server = Math.round(iServer.get(k) ?? 0);
                return {
                    method: s.labels.method,
                    route: s.labels.route,
                    requests,
                    p50_ms: ms(i50.get(k) ?? null),
                    p95_ms: ms(i95.get(k) ?? null),
                    p99_ms: ms(i99.get(k) ?? null),
                    client_errors: client,
                    server_errors: server,
                    error_rate_pct: requests ? Math.round(((client + server) / requests) * 10000) / 100 : null,
                };
            })
            .filter((r) => r.requests > 0)
            .sort((a, b) => b.requests - a.requests),
    };
}

// ---------------------------------------------------------------------------
// Postgres: the error and slow-request log
// ---------------------------------------------------------------------------

const todayUtc = () => new Date().toISOString().slice(0, 10);

const shiftDays = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Days are UTC; the default is the last 7. Never wider than the retention. */
const parseFilters = (query: Query): IssueFilters => {
    const to = (query.to as string | undefined) ?? todayUtc();
    const from = (query.from as string | undefined) ?? shiftDays(to, -6);
    if (from > to) {
        throw new AppError("from must be on or before to", 400);
    }
    return {
        from,
        to,
        kind: query.kind as IssueFilters["kind"],
        statusClass: query.statusClass as IssueFilters["statusClass"],
        statusCode: query.statusCode as number | undefined,
        errorType: (query.errorType as string | undefined) || undefined,
        route: (query.route as string | undefined) || undefined,
        userId: query.userId as string | undefined,
    };
}

export const getIssueSummaryService = async (query: Query) => {
    const filters = parseFilters(query);
    const [summary, facets] = await Promise.all([
        fetchIssueSummaryRepository(filters),
        fetchIssueFacetsRepository(filters.from, filters.to),
    ]);
    return { from: filters.from, to: filters.to, ...summary, facets };
}

export const listIssuesService = async (query: Query) => {
    const filters = parseFilters(query);
    const page = (query.page as number | undefined) ?? 1;
    const limit = (query.limit as number | undefined) ?? 25;
    const { rows, totalCount } = await fetchIssuesRepository(filters, page, limit);
    return {
        data: rows,
        meta: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
        },
    };
}

export const viewIssueService = async (id: string) => {
    const row = await fetchIssueRepository(id);
    if (!row) {
        throw new AppError("Request not found (it may have been purged)", 404);
    }
    const { user_first_name, user_last_name, ...issue } = row;
    return {
        ...issue,
        user_name: [user_first_name, user_last_name].filter(Boolean).join(" ") || null,
    };
}
