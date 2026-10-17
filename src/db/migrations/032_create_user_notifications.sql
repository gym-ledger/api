-- In-app notifications. `group_key` ties together notifications that
-- supersede each other (e.g. every weekly check-in notice): posting a new one
-- removes the user's older ones in the same group, so the list never fills
-- up with near-identical entries week after week. `dedupe_key` stops the
-- exact same notice being posted twice (re-posting it would bump it back to
-- unread).
CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    type VARCHAR(50) NOT NULL,

    group_key VARCHAR(100),

    dedupe_key VARCHAR(200),

    title VARCHAR(200) NOT NULL,

    body TEXT NOT NULL,

    -- In-app path to open, e.g. "/progress?tab=body".
    link VARCHAR(500),

    read_at TIMESTAMPTZ,

    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
ON user_notifications(user_id, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_group
ON user_notifications(user_id, group_key)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_user_dedupe
ON user_notifications(user_id, dedupe_key)
WHERE deleted_at IS NULL AND dedupe_key IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_user_notifications_updated_at
ON user_notifications;

CREATE TRIGGER trigger_user_notifications_updated_at
BEFORE UPDATE ON user_notifications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
