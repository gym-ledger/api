CREATE TABLE IF NOT EXISTS workout_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,
    slug CITEXT NOT NULL,

    added_by_admin_user_id UUID
        REFERENCES admin_users(id),
    
    added_by_user_id UUID
        REFERENCES users(id),

    visibility VARCHAR(10) NOT NULL
        CHECK (visibility IN ('public', 'private')),

    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

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
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_programs_slug
ON workout_programs(slug)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workout_programs_added_by_user_id
ON workout_programs(added_by_user_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workout_programs_added_by_admin_user_id
ON workout_programs(added_by_admin_user_id)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_workout_programs_updated_at
ON workout_programs;

CREATE TRIGGER trigger_workout_programs_updated_at
BEFORE UPDATE ON workout_programs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS workout_program_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workout_program_id UUID NOT NULL
        REFERENCES workout_programs(id),

    description TEXT NOT NULL,

    version_number INTEGER NOT NULL,
    UNIQUE (workout_program_id, version_number),

    
    training_days INTEGER NOT NULL,

    split_type VARCHAR(15) NOT NULL
        CHECK (split_type IN ('ppl', 'upper-lower', 'full-body', 'custom')),

    session_ordering_logic VARCHAR(10) NOT NULL
        CHECK (session_ordering_logic IN ('sequential', 'cyclic', 'random')),
    
    duration_type VARCHAR(10) NOT NULL
        CHECK (duration_type IN ('indefinite', 'finite')),

    duration_weeks INTEGER NOT NULL,

    added_by_admin_user_id UUID
        REFERENCES admin_users(id),
    
    added_by_user_id UUID
        REFERENCES users(id),

    visibility VARCHAR(10) NOT NULL
        CHECK (visibility IN ('public', 'private')),

    deleted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()

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
    )
);

DROP TRIGGER IF EXISTS trigger_workout_program_versions_updated_at
ON workout_program_versions;

CREATE TRIGGER trigger_workout_program_versions_updated_at
BEFORE UPDATE ON workout_program_versions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_workout_program_versions_workout_program_id
ON workout_program_versions(workout_program_id)
WHERE deleted_at IS NULL;