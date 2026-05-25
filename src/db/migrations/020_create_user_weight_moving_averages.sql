CREATE TABLE IF NOT EXISTS user_weight_moving_averages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    three_day_moving_average DECIMAL (5, 2),

    seven_day_moving_average DECIMAL (5, 2),

    date DATE NOT NULL,
    
    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trigger_user_weight_moving_averages_updated_at
ON user_weight_moving_averages;

CREATE TRIGGER trigger_user_weight_moving_averages_updated_at
BEFORE UPDATE ON user_weight_moving_averages
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_weight_moving_averages_user_id_date
ON user_weight_moving_averages(user_id, date)
WHERE deleted_at IS NULL;