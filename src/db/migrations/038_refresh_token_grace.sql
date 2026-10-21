-- Refresh-token reuse detection with a short grace window, for user and admin
-- sessions alike (security audit S-18).
--
-- Every refresh swaps the session's refresh token for a new one. The token it
-- replaced is kept in previous_refresh_token_hash, and the new token itself is
-- kept encrypted in rotated_token_enc (AES-256-GCM, key derived from the
-- access-token secret), both stamped with rotated_at.
--
-- Presenting the previous token again:
--   - within REFRESH_REUSE_GRACE_MS of rotated_at (a retry after a dropped
--     response, or two tabs refreshing at once) returns that same new token,
--     so every caller ends up holding the one current token;
--   - any later is treated as theft and ends the session.
--
-- The session id in access tokens is now checked on every request (S-09), so
-- tokens issued before this migration (which carried a hash as their session
-- id) get a 401 and the clients refresh into a correct one.
ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS previous_refresh_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS rotated_token_enc TEXT,
    ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_sessions_previous_refresh_hash
ON user_sessions(previous_refresh_token_hash);

ALTER TABLE admin_sessions
    ADD COLUMN IF NOT EXISTS previous_refresh_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS rotated_token_enc TEXT,
    ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_previous_refresh_hash
ON admin_sessions(previous_refresh_token_hash);

-- 'token_reused': an old refresh token came back after the grace window.
ALTER TABLE admin_sessions DROP CONSTRAINT IF EXISTS admin_sessions_revoked_reason_check;
ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_revoked_reason_check
    CHECK (revoked_reason IN ('logout', 'signed_out_remotely', 'signed_out_others', 'password_changed', 'session_limit', 'token_reused'));
