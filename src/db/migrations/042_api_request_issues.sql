-- API requests that failed (status >= 400) or were slow (REQUEST_LOG_SLOW_MS
-- and up), for drill-down on the admin API page. Every request is counted in
-- Prometheus; only these get a row. Written in batches by the API
-- (infrastructure/metrics/requestIssueLog.ts) and purged after
-- REQUEST_LOG_RETENTION_DAYS (jobs/index.ts).
--
-- No request or response bodies, headers, query strings or IPs. `path` is
-- the URL path only (it can hold resource ids). `user_id`/`admin_user_id`
-- have no foreign key on purpose: rows are inserted in batches after the
-- response, and a user deleted in between must not fail the whole batch.
-- Account deletion clears user_id instead.
CREATE TABLE IF NOT EXISTS api_request_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    -- pino-http's request id, to find the matching log lines.
    request_id VARCHAR(64),

    method VARCHAR(10) NOT NULL,

    -- Route template, e.g. /api/v1/admin/analytics/users/view/:id
    route VARCHAR(255) NOT NULL,

    path VARCHAR(500) NOT NULL,

    status_code SMALLINT NOT NULL,

    duration_ms INTEGER NOT NULL,

    is_error BOOLEAN NOT NULL,

    is_slow BOOLEAN NOT NULL,

    -- The `error.type` sent to the client, e.g. VALIDATION_ERROR.
    error_type VARCHAR(50),

    error_message VARCHAR(1000),

    -- 5xx only.
    error_stack TEXT,

    user_id UUID,

    admin_user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_api_request_issues_created_at
ON api_request_issues(created_at);

CREATE INDEX IF NOT EXISTS idx_api_request_issues_route_created_at
ON api_request_issues(route, created_at);

CREATE INDEX IF NOT EXISTS idx_api_request_issues_user_id
ON api_request_issues(user_id)
WHERE user_id IS NOT NULL;
