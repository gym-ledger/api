CREATE TABLE IF NOT EXISTS muscles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug CITEXT NOT NULL,

    parent_muscle_id UUID
        REFERENCES muscles(id)
        ON DELETE RESTRICT,

    xp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    recovery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    body_region VARCHAR(100),

    display_order INTEGER NOT NULL,

    added_by_admin_user_id UUID NOT NULL
        REFERENCES admin_users(id),
    
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_muscles_slug
ON muscles(slug)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_muscles_parent_muscle_id
ON muscles(parent_muscle_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_muscles_recovery_enabled
ON muscles(recovery_enabled)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_muscles_display_order
ON muscles(display_order)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_muscles_updated_at
ON muscles;

CREATE TRIGGER trigger_muscles_updated_at
BEFORE UPDATE ON muscles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS exercise_muscles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    exercise_id UUID NOT NULL
        REFERENCES exercises(id)
        ON DELETE RESTRICT,

    muscle_id UUID NOT NULL
        REFERENCES muscles(id)
        ON DELETE RESTRICT,

    contribution NUMERIC(4,2) NOT NULL
        CHECK (contribution > 0 AND contribution <= 1),

    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exercise_muscles_exercise_id_muscle_id
ON exercise_muscles(exercise_id, muscle_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_muscles_exercise_id
ON exercise_muscles(exercise_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_muscles_muscle_id
ON exercise_muscles(muscle_id)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trigger_exercise_muscles_updated_at
ON exercise_muscles;

CREATE TRIGGER trigger_exercise_muscles_updated_at
BEFORE UPDATE ON exercise_muscles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();