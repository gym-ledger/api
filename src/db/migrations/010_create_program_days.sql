CREATE TABLE IF NOT EXISTS program_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    workout_program_id UUID NOT NULL
        REFERENCES workout_programs(id),

    day_number INTEGER NOT NULL,

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_program_days_workout_program_day_number
ON program_days(workout_program_id, day_number)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_program_days_updated_at
ON program_days;

CREATE TRIGGER trigger_program_days_updated_at
BEFORE UPDATE ON program_days
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();