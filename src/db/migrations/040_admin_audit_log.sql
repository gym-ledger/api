-- Who changed what in the admin panel: one row per successful admin write
-- (create, update, delete, import, password change, signing devices out,
-- retrying a check-in). Written by the auditAdminAction middleware after the
-- response is sent; rows are never updated or deleted by the API.
--
-- `fields` lists the request fields that were sent (names only, never values,
-- so passwords and large payloads aren't copied here). `entity_id` is the
-- path id, or the new row's id for a create.
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    admin_user_id UUID NOT NULL
        REFERENCES admin_users(id),

    admin_session_id UUID
        REFERENCES admin_sessions(id),

    action VARCHAR(20) NOT NULL
        CHECK (action IN ('create', 'update', 'delete', 'import', 'password_change', 'sign_out', 'retry')),

    entity_type VARCHAR(40) NOT NULL,

    entity_id UUID,

    fields TEXT[],

    file_name VARCHAR(255),

    ip_address VARCHAR(64),

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
ON admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
ON admin_audit_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin
ON admin_audit_log(admin_user_id, created_at DESC);
