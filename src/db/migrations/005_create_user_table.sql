CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    phone_country_code VARCHAR(10),

    phone_number VARCHAR(20),

    email CITEXT,

    password_hash TEXT,

    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CHECK (
        email IS NOT NULL
        OR (
            phone_number IS NOT NULL
            AND phone_country_code IS NOT NULL
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email
ON users(email)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone
ON users(
    phone_country_code,
    phone_number
)
WHERE deleted_at IS NULL;

-- CREATE TRIGGER trigger_users_updated_at
-- BEFORE UPDATE ON users
-- FOR EACH ROW
-- EXECUTE FUNCTION set_updated_at();