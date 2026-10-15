-- The plaintext code was a dev-only convenience stored next to otp_hash; it
-- made the hash pointless (DB read access = log in as anyone with a pending
-- OTP). In development the API now logs freshly issued codes instead.
ALTER TABLE otp_auth
    DROP COLUMN IF EXISTS otp;

-- Per-identity resend throttling. The row is no longer deleted when its
-- attempts run out or it expires (only on successful use), so these counters
-- survive across codes and cap how many codes — and therefore guesses — an
-- identity can get per window.
ALTER TABLE otp_auth
    ADD COLUMN IF NOT EXISTS send_count INTEGER NOT NULL DEFAULT 0
        CHECK (send_count >= 0),
    ADD COLUMN IF NOT EXISTS send_window_started_at TIMESTAMPTZ;
