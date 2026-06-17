CREATE TABLE IF NOT EXISTS user_weight_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    from_date DATE NOT NULL,

    duration_type VARCHAR(255) NOT NULL,
    CHECK (duration_type IN ('till-now', 'till-date')),
    
    to_date DATE,

    weight_entries JSONB,

    weight_moving_averages JSONB,

    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trigger_user_weight_views_updated_at
ON user_weight_views;

CREATE TRIGGER trigger_user_weight_views_updated_at
BEFORE UPDATE ON user_weight_views
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_weight_views_user_id
ON user_weight_views(user_id)
WHERE deleted_at IS NULL;