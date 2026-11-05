-- Which client a session was signed in from. It also decides how the
-- session's refresh token travels:
--   'web'              the browser app: an httpOnly cookie, never the response body
--   'ios' | 'android'  the native app: the response body and an
--                      `Authorization: Refresh <token>` header, never a cookie
-- A token is only accepted over its own transport (see auth/sessionTransport.ts).
-- Existing sessions all came from the web app.
ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS platform VARCHAR(10) NOT NULL DEFAULT 'web'
        CHECK (platform IN ('web', 'ios', 'android'));
