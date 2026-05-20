CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,
    slug CITEXT NOT NULL,

    image_url TEXT,

    description TEXT,

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
        DEFAULT NOW(),


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

CREATE UNIQUE INDEX uq_exercises_slug
ON exercises(slug)
WHERE deleted_at IS NULL;

CREATE TRIGGER trigger_exercises_updated_at
BEFORE UPDATE ON exercises
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();