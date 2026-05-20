CREATE TABLE workout_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workout_session_id UUID NOT NULL
        REFERENCES workout_sessions(id),

    workout_program_exercise_id UUID NOT NULL
        REFERENCES workout_program_exercises(id),

    set_order INTEGER NOT NULL,

    weight DECIMAL (6, 2),

    reps INTEGER,

    rir DECIMAL (3, 1),

    is_warmup BOOLEAN NOT NULL
        DEFAULT FALSE,

    notes TEXT,

    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE INDEX idx_workout_sets_workout_session_id
ON workout_sets(workout_session_id)
WHERE deleted_at IS NULL;

CREATE INDEX idx_workout_sets_workout_program_exercise_id
ON workout_sets(workout_program_exercise_id)
WHERE deleted_at IS NULL;

CREATE TRIGGER trigger_workout_sets_updated_at
BEFORE UPDATE ON workout_sets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();