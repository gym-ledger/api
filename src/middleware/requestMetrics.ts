import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { API_PREFIX } from "../config/constants.js";
import { httpErrors, httpRequestDuration, httpRequestsAborted, httpRequestsInFlight } from "../infrastructure/metrics/index.js";
import { recordRequestIssue } from "../infrastructure/metrics/requestIssueLog.js";

/**
 * Not measured at all: the Docker health check (every few seconds, would
 * drown real traffic) and the notification event stream (open for minutes
 * by design, would wreck every latency percentile).
 */
const EXCLUDED_PATHS = new Set(["/health", `${API_PREFIX}/user/notifications/stream`]);

/** Fallback error types for responses that didn't go through errorHandler. */
const ERROR_TYPE_BY_STATUS: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
};

const pathOf = (url: string) => {
    const path = url.split("?")[0].replace(/\/+$/, "");
    return path === "" ? "/" : path;
}

/**
 * The route template, e.g. /api/v1/admin/analytics/users/view/:id.
 *
 * Express only keeps the full prefix (req.baseUrl) while inside the router,
 * and resets it as an error bubbles up to errorHandler. req.route survives,
 * so the template is rebuilt: the matched route's segments replace the same
 * number of trailing segments of the real path. Works because every mount
 * point here is a static string.
 *
 * Requests that never reached a route get a fixed label, so bots probing
 * random URLs can't create unbounded label values.
 */
const routeTemplate = (req: Request, res: Response) => {
    const routePath = (req.route as { path?: unknown } | undefined)?.path;
    if (typeof routePath !== "string") {
        // 404: no such route. Otherwise rejected before reaching one, e.g.
        // by the rate limiter or a router-level auth check.
        return res.statusCode === 404 ? "unmatched" : "pre_route";
    }
    const routeSegments = routePath.split("/").filter(Boolean);
    const segments = pathOf(req.originalUrl).split("/").filter(Boolean);
    const prefix = segments.slice(0, Math.max(0, segments.length - routeSegments.length));
    return `/${[...prefix, ...routeSegments].join("/")}`;
}

/**
 * Times every request and feeds Prometheus; errors (>= 400) and slow
 * requests (>= REQUEST_LOG_SLOW_MS) also get a row in api_request_issues.
 * Mount first, so the time includes every other middleware.
 */
export const requestMetrics = (req: Request, res: Response, next: NextFunction) => {
    const path = pathOf(req.originalUrl);
    if (!env.METRICS_ENABLED || EXCLUDED_PATHS.has(path)) {
        return next();
    }

    const started = process.hrtime.bigint();
    httpRequestsInFlight.inc();
    let done = false;

    const finish = () => {
        if (done) return;
        done = true;
        httpRequestsInFlight.dec();

        const method = req.method;
        const route = routeTemplate(req, res);

        // "close" before "finish": the client went away mid-response, so
        // there is no real status or duration to record.
        if (!res.writableFinished) {
            httpRequestsAborted.inc({ method, route });
            return;
        }

        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        const statusCode = res.statusCode;
        const status = String(statusCode);
        httpRequestDuration.observe({ method, route, status_code: status }, durationMs / 1000);

        const isError = statusCode >= 400;
        const isSlow = durationMs >= env.REQUEST_LOG_SLOW_MS;
        const errorType: string | null = isError
            ? (res.locals.errorType as string | undefined)
                ?? ERROR_TYPE_BY_STATUS[statusCode]
                ?? (statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST")
            : null;
        if (isError) {
            httpErrors.inc({ method, route, status_code: status, error_type: errorType! });
        }

        // Not logged (Prometheus still counts them): unmatched 404s, which
        // are mostly scanners, and expired-token 401s, the normal refresh
        // path that every signed-in client hits each access-token lifetime.
        const worthLogging = isError && route !== "unmatched" && errorType !== "TOKEN_EXPIRED";
        if (worthLogging || isSlow) {
            recordRequestIssue({
                requestId: req.id === undefined ? null : String(req.id),
                method,
                route,
                path,
                statusCode,
                durationMs: Math.round(durationMs),
                isError,
                isSlow,
                errorType,
                errorMessage: (res.locals.errorMessage as string | undefined) ?? null,
                errorStack: statusCode >= 500 ? (res.locals.errorStack as string | null | undefined) ?? null : null,
                userId: req.userId ?? null,
                adminUserId: req.adminUserId ?? null,
            });
        }
    };

    res.on("finish", finish);
    res.on("close", finish);
    next();
}
