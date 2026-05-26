CREATE TABLE IF NOT EXISTS user_weight_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    weight DECIMAL (5, 2) NOT NULL,

    date DATE NOT NULL,

    day VARCHAR(255) NOT NULL,
    
    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CHECK (
        weight > 0
    )
);

DROP TRIGGER IF EXISTS trigger_user_weight_entries_updated_at
ON user_weight_entries;

CREATE TRIGGER trigger_user_weight_entries_updated_at
BEFORE UPDATE ON user_weight_entries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_weight_entries_user_date
ON user_weight_entries(user_id, date)
WHERE deleted_at IS NULL;
