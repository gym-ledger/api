CREATE TABLE program_day_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workout_program_day_id UUID NOT NULL
        REFERENCES program_days(id),

    name VARCHAR(255) NOT NULL,

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

CREATE UNIQUE INDEX uq_program_day_sessions_workout_program_day_name
ON program_day_sessions(workout_program_day_id, name)
WHERE deleted_at IS NULL;

CREATE TRIGGER trigger_program_day_sessions_updated_at
BEFORE UPDATE ON program_day_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();