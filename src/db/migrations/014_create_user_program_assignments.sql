CREATE TABLE user_program_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL   
        REFERENCES users(id),

    workout_program_version_id UUID NOT NULL
        REFERENCES workout_program_versions(id),

    started_at TIMESTAMPTZ,

    current_program_day_id UUID
        REFERENCES program_days(id),

    current_program_day_session_id UUID
        REFERENCES program_day_sessions(id),

    is_active BOOLEAN NOT NULL
        DEFAULT TRUE,

    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_user_program_assignments_user_id_workout_program_version_id
ON user_program_assignments(user_id, workout_program_version_id)
WHERE deleted_at IS NULL;

CREATE TRIGGER trigger_user_program_assignments_updated_at
BEFORE UPDATE ON user_program_assignments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
