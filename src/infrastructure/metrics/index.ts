import http from "http";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { pg } from "../postgres/index.js";

/**
 * Prometheus metrics for the API. Everything is registered on this one
 * registry, which is served at GET /metrics on METRICS_PORT (not PORT).
 *
 * Labels must stay low-cardinality: route templates, methods, status codes,
 * error types. Never user ids, raw URLs or anything per request — those
 * belong in api_request_issues (requestIssueLog.ts).
 */
export const metricsRegistry = new Registry();

// CPU, heap, GC, event-loop lag, open handles... (prefixed `nodejs_`/`process_`).
collectDefaultMetrics({ register: metricsRegistry });

/**
 * Buckets in seconds. Denser around REQUEST_LOG_SLOW_MS's default (500 ms)
 * so p95/p99 near that line come out reasonably precise.
 */
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.25, 0.35, 0.5, 0.75, 1, 1.5, 2.5, 5, 10];

export const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "Time from receiving a request to finishing its response, by route template",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: LATENCY_BUCKETS,
    registers: [metricsRegistry],
});

export const httpErrors = new Counter({
    name: "http_errors_total",
    help: "Responses with status >= 400, by the error type sent to the client",
    labelNames: ["method", "route", "status_code", "error_type"] as const,
    registers: [metricsRegistry],
});

export const httpRequestsAborted = new Counter({
    name: "http_requests_aborted_total",
    help: "Requests whose client disconnected before the response finished",
    labelNames: ["method", "route"] as const,
    registers: [metricsRegistry],
});

export const httpRequestsInFlight = new Gauge({
    name: "http_requests_in_flight",
    help: "Requests being handled right now (long-lived event streams excluded)",
    registers: [metricsRegistry],
});

export const requestIssuesDropped = new Counter({
    name: "api_request_issues_dropped_total",
    help: "Error/slow request rows not written to api_request_issues (buffer full or insert failed)",
    labelNames: ["reason"] as const,
    registers: [metricsRegistry],
});

export const aiRequests = new Counter({
    name: "ai_requests_total",
    help: "Model (Groq) calls, by feature and outcome",
    labelNames: ["feature", "status"] as const,
    registers: [metricsRegistry],
});

export const aiRequestDuration = new Histogram({
    name: "ai_request_duration_seconds",
    help: "Model (Groq) call latency, by feature",
    labelNames: ["feature"] as const,
    buckets: [0.25, 0.5, 1, 2, 3, 5, 8, 13, 20, 30],
    registers: [metricsRegistry],
});

// A waiting count above zero means requests are queueing for a database
// connection: the pool (max 20) is the bottleneck, not the queries.
new Gauge({
    name: "pg_pool_connections",
    help: "Postgres pool connections by state",
    labelNames: ["state"] as const,
    registers: [metricsRegistry],
    collect() {
        this.set({ state: "total" }, pg.totalCount);
        this.set({ state: "idle" }, pg.idleCount);
        this.set({ state: "waiting" }, pg.waitingCount);
    },
});

let server: http.Server | null = null;

/** Serves GET /metrics on METRICS_PORT. No-op when METRICS_ENABLED=false. */
export const startMetricsServer = () => {
    if (!env.METRICS_ENABLED || server) return;
    server = http.createServer(async (req, res) => {
        if (req.method !== "GET" || req.url?.split("?")[0] !== "/metrics") {
            res.writeHead(404).end();
            return;
        }
        try {
            const body = await metricsRegistry.metrics();
            res.writeHead(200, { "Content-Type": metricsRegistry.contentType }).end(body);
        } catch (error) {
            logger.error({ error }, "Failed to render metrics");
            res.writeHead(500).end();
        }
    });
    server.on("error", (error) => {
        // Metrics are not worth taking the API down for.
        logger.error({ error, port: env.METRICS_PORT }, "Metrics server failed; metrics are unavailable");
    });
    server.listen(env.METRICS_PORT, () => {
        logger.info(`Metrics on :${env.METRICS_PORT}/metrics`);
    });
};

export const stopMetricsServer = () => {
    server?.close();
    server = null;
};
