CREATE TABLE workout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL
        REFERENCES users(id),

    program_assignment_id UUID NOT NULL
        REFERENCES user_program_assignments(id),

    started_at TIMESTAMPTZ NOT NULL,

    completed_at TIMESTAMPTZ,

    notes TEXT,
    
    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE INDEX idx_workout_sessions_user_id
ON workout_sessions(user_id)
WHERE deleted_at IS NULL;

CREATE INDEX idx_workout_sessions_program_assignment_id
ON workout_sessions(program_assignment_id)
WHERE deleted_at IS NULL;

CREATE TRIGGER trigger_workout_sessions_updated_at
BEFORE UPDATE ON workout_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();