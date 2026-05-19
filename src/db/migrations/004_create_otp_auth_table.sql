CREATE TABLE IF NOT EXISTS otp_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    method VARCHAR(10) NOT NULL
        CHECK (method IN ('email', 'phone')),

    phone_country_code VARCHAR(10),

    phone_number VARCHAR(20),

    email CITEXT,

    -- TEMPORARY FOR DEV
    otp VARCHAR(10) NOT NULL,

    otp_hash TEXT NOT NULL,

    generated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    expires_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW() + INTERVAL '5 minutes',

    attempts INTEGER NOT NULL
        DEFAULT 0
        CHECK (attempts >= 0),

    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    last_attempted_at TIMESTAMPTZ,

    CHECK (
        (
            method = 'email'
            AND email IS NOT NULL
            AND phone_number IS NULL
            AND phone_country_code IS NULL
        )
        OR
        (
            method = 'phone'
            AND phone_number IS NOT NULL
            AND phone_country_code IS NOT NULL
            AND email IS NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_otp_auth_email
ON otp_auth(email)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_otp_auth_phone
ON otp_auth(
    phone_country_code,
    phone_number
)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_otp_auth_expiry
ON otp_auth(expires_at)
WHERE deleted_at IS NULL;