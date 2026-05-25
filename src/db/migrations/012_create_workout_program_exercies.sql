CREATE TABLE IF NOT EXISTS workout_program_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workout_program_day_session_id UUID NOT NULL
        REFERENCES program_day_sessions(id),

    exercise_id UUID NOT NULL
        REFERENCES exercises(id),

    exercise_order INTEGER NOT NULL,

    target_sets INTEGER NOT NULL,

    min_reps INTEGER NOT NULL,

    max_reps INTEGER NOT NULL,

    target_rir DECIMAL (3, 1),

    rest_seconds INTEGER,

    tempo VARCHAR(10),

    notes TEXT,
    
    added_by_admin_user_id UUID
        REFERENCES admin_users(id),
    
    added_by_user_id UUID
        REFERENCES users(id),

    visibility VARCHAR(10) NOT NULL
        CHECK (visibility IN ('public', 'private')),

    CHECK (
        (
            added_by_admin_user_id IS NOT NULL
            AND added_by_user_id IS NULL
        )
        OR
        (
            added_by_admin_user_id IS NULL
            AND added_by_user_id IS NOT NULL
        )
    ),

    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_program_exercises_workout_program_day_session_exercise_order
ON workout_program_exercises(workout_program_day_session_id, exercise_order)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_workout_program_exercises_updated_at
ON workout_program_exercises;

CREATE TRIGGER trigger_workout_program_exercises_updated_at
BEFORE UPDATE ON workout_program_exercises
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();