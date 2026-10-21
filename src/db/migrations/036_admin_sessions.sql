-- One row per admin sign-in, replacing the single refresh token stored on
-- admin_users. An admin can now be signed in on several devices at once (the
-- API keeps at most 5 active, see ADMIN_MAX_ACTIVE_SESSIONS) and see every
-- past sign-in under Settings > My Devices.
--
-- A session is active while `revoked_at` is NULL and `expires_at` is in the
-- future. `revoked_reason` says how it ended:
--   'logout'              — signed out on that device
--   'signed_out_remotely' — signed out from another device's settings
--   'signed_out_others'   — "Sign out all other devices"
--   'password_changed'    — the password was changed on another device
--   'session_limit'       — a 6th sign-in replaced the least recently used one
--
-- Device and location columns describe the request that last used the
-- session (sign-in or token refresh); `ip_address` keeps the sign-in IP.
-- City/region/country come from proxy headers (Cloudflare) when present.
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    admin_user_id UUID NOT NULL
        REFERENCES admin_users(id),

    refresh_token_hash TEXT NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    revoked_reason VARCHAR(20)
        CHECK (revoked_reason IN ('logout', 'signed_out_remotely', 'signed_out_others', 'password_changed', 'session_limit')),

    ip_address VARCHAR(64),

    last_ip_address VARCHAR(64),

    user_agent VARCHAR(512),

    browser VARCHAR(60),

    os VARCHAR(60),

    device_type VARCHAR(10)
        CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')),

    city VARCHAR(100),

    region VARCHAR(100),

    country VARCHAR(2),

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    last_used_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_sessions_refresh_hash
ON admin_sessions(refresh_token_hash);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_created
ON admin_sessions(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_active
ON admin_sessions(admin_user_id)
WHERE revoked_at IS NULL;

ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Carry over the session each admin has now, so nobody is signed out by the
-- upgrade, then clear the old columns (no longer read or written).
INSERT INTO admin_sessions (
    admin_user_id,
    refresh_token_hash,
    expires_at,
    created_at,
    last_used_at
)
SELECT
    a.id,
    a.refresh_token_hash,
    a.refresh_token_expires_at,
    a.updated_at,
    a.updated_at
FROM admin_users a
WHERE a.refresh_token_hash IS NOT NULL
    AND a.refresh_token_expires_at > NOW()
    AND a.deleted_at IS NULL
    AND NOT EXISTS (
        SELECT 1
        FROM admin_sessions s
        WHERE s.refresh_token_hash = a.refresh_token_hash
    );

UPDATE admin_users
SET refresh_token_hash = NULL,
    refresh_token_expires_at = NULL
WHERE refresh_token_hash IS NOT NULL;
