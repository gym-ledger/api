-- One row per attempted model (Groq) call, for the admin AI-usage dashboard.
-- Metadata only: the prompt and the model's reply are never stored here.
-- `user_id` is NULL for calls not made on behalf of a user. `feature` names
-- the caller (e.g. 'weekly_checkin'). Token counts come from the provider's
-- `usage` field and are NULL when the call never reached it (no key, daily
-- cap, timeout, network error). Rows older than a year are purged by the API
-- (infrastructure/groq/aiRequestLog.ts).
CREATE TABLE IF NOT EXISTS ai_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID
        REFERENCES users(id),

    feature VARCHAR(50) NOT NULL,

    model VARCHAR(100) NOT NULL,

    status VARCHAR(20) NOT NULL
        CHECK (status IN (
            'success', 'rate_limited', 'timeout', 'provider_error',
            'bad_output', 'daily_limit', 'not_configured'
        )),

    prompt_tokens INTEGER,

    completion_tokens INTEGER,

    latency_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at
ON ai_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_requests_feature_created_at
ON ai_requests(feature, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_requests_user_id
ON ai_requests(user_id)
WHERE user_id IS NOT NULL;
