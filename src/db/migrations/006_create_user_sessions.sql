CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    refresh_token_hash TEXT NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_user_sessions_user_id
ON user_sessions(user_id);

CREATE INDEX idx_user_sessions_expires_at
ON user_sessions(expires_at);

CREATE INDEX idx_user_sessions_revoked_at
ON user_sessions(revoked_at);

CREATE INDEX idx_user_sessions_last_used_at
ON user_sessions(last_used_at);

CREATE UNIQUE INDEX uq_user_sessions_refresh_hash
ON user_sessions(refresh_token_hash);