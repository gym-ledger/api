CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email CITEXT NOT NULL,

    password_hash TEXT NOT NULL,

    refresh_token_hash TEXT,
    refresh_token_expires_at TIMESTAMPTZ,

    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_email
ON admin_users(email)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_admin_users_updated_at
ON admin_users;

CREATE TRIGGER trigger_admin_users_updated_at
BEFORE UPDATE ON admin_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();