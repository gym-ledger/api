CREATE TABLE IF NOT EXISTS user_muscle_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    muscle_id UUID NOT NULL
        REFERENCES muscles(id)
        ON DELETE RESTRICT,

    -- Raw decaying accumulators (formulas in users.muscleSignals.service.ts);
    -- both are lazily decayed off `last_computed_at`, not on
    -- a schedule, so these values are only correct as of that timestamp.
    training_value NUMERIC(10,4) NOT NULL DEFAULT 0,
    fatigue_value NUMERIC(10,4) NOT NULL DEFAULT 0,

    last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_muscle_signals_user_muscle
ON user_muscle_signals(user_id, muscle_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_muscle_signals_user_id
ON user_muscle_signals(user_id)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_user_muscle_signals_updated_at
ON user_muscle_signals;

CREATE TRIGGER trigger_user_muscle_signals_updated_at
BEFORE UPDATE ON user_muscle_signals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
