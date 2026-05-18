CREATE TABLE IF NOT EXISTS otp_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    method VARCHAR(10) NOT NULL
        CHECK (method IN ('email', 'phone')),

    phone_country_code VARCHAR(10),

    phone_number VARCHAR(20),

    email VARCHAR(255),

    -- TEMPORARY FOR DEV
    otp VARCHAR(10) NOT NULL,

    otp_hash TEXT NOT NULL,

    generated_at TIMESTAMP NOT NULL
        DEFAULT NOW(),

    expires_at TIMESTAMP NOT NULL
        DEFAULT NOW() + INTERVAL '5 minutes',

    attempts INTEGER NOT NULL
        DEFAULT 0
        CHECK (attempts >= 0),

    is_deleted BOOLEAN NOT NULL
        DEFAULT false,

    created_at TIMESTAMP NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMP NOT NULL
        DEFAULT NOW(),

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
ON otp_auth(method, email, is_deleted);

CREATE INDEX IF NOT EXISTS idx_otp_auth_phone
ON otp_auth(
    method,
    phone_country_code,
    phone_number,
    is_deleted
);

CREATE INDEX IF NOT EXISTS idx_otp_auth_expires_at
ON otp_auth(is_deleted, expires_at);