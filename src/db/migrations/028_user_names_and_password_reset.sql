-- User display name. Nullable at the DB level because every existing user
-- (and every user created by OTP sign-up) starts without one; the API
-- requires a non-empty first name whenever the user sets it.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- OTPs now serve two flows. `purpose` keeps a login OTP and a
-- forgot-password OTP for the same email/phone from overwriting each other.
-- After a reset OTP is verified, the row is kept (not deleted) and holds a
-- short-lived, single-use reset token (stored hashed) that authorizes the
-- final reset-password call.
ALTER TABLE otp_auth
    ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'login'
        CHECK (purpose IN ('login', 'reset_password')),
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_otp_auth_reset_token_hash
ON otp_auth(reset_token_hash)
WHERE reset_token_hash IS NOT NULL;
