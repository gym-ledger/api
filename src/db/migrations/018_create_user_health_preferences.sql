CREATE TABLE IF NOT EXISTS user_health_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    timezone VARCHAR(100) NOT NULL,

    weight_units VARCHAR(10) NOT NULL
        CHECK (weight_units IN ('kg', 'lbs')),

    height_units VARCHAR(10) NOT NULL
        CHECK (height_units IN ('cm', 'ft')),

    height DECIMAL (5, 2) NOT NULL,
        
    deleted_at TIMESTAMPTZ,
    
    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trigger_user_health_preferences_updated_at
ON user_health_preferences;

CREATE TRIGGER trigger_user_health_preferences_updated_at
BEFORE UPDATE ON user_health_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_health_preferences_user_id
ON user_health_preferences(user_id)
WHERE deleted_at IS NULL;