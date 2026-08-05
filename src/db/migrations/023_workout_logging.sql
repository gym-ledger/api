ALTER TABLE workout_sets
RENAME COLUMN notes TO discomfort_notes;

ALTER TABLE workout_sets
ADD COLUMN IF NOT EXISTS effort TEXT;

CREATE TABLE IF NOT EXISTS workout_set_alarms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id),

    workout_set_id UUID NOT NULL
        REFERENCES workout_sets(id),

    exercise_id UUID NOT NULL
        REFERENCES exercises(id),

    message TEXT NOT NULL,

    discarded_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_set_alarms_user_active
ON workout_set_alarms(user_id)
WHERE discarded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workout_set_alarms_workout_set_id
ON workout_set_alarms(workout_set_id);

DROP TRIGGER IF EXISTS trigger_workout_set_alarms_updated_at
ON workout_set_alarms;

CREATE TRIGGER trigger_workout_set_alarms_updated_at
BEFORE UPDATE ON workout_set_alarms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
