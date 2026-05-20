export const EXERCISES_TABLE = "exercises";

// id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

// name VARCHAR(255) NOT NULL,
// slug CITEXT NOT NULL,

// image_url TEXT,

// description TEXT,

// added_by_admin_user_id UUID
//     REFERENCES admin_users(id),

// added_by_user_id UUID
//     REFERENCES users(id),

// visibility VARCHAR(10) NOT NULL
//     CHECK (visibility IN ('public', 'private')),

// deleted_at TIMESTAMPTZ,

// created_at TIMESTAMPTZ NOT NULL
//     DEFAULT NOW(),

// updated_at TIMESTAMPTZ NOT NULL
//     DEFAULT NOW(),

export interface ExercisesInterface {
    id: string;

    name: string;

    slug: string;

    image_url: string;

    description: string;

    added_by_admin_user_id: string;

    added_by_user_id: string;

    visibility: string;

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;
}

export const EXERCISES_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    name: {
        type: "string",
        allowNull: true,
    },
    slug: {
        type: "string",
        allowNull: true,
    },
    image_url: {
        type: "string",
        allowNull: true,
    },
    description: {
        type: "string",
        allowNull: true,
    },
    added_by_admin_user_id: {
        type: "string",
        allowNull: true,
    },
    added_by_user_id: {
        type: "string",
        allowNull: true,
    },
    visibility: {
        type: "string",
        allowNull: true,
    },
    deleted_at: {
        type: "date",
        allowNull: true,
    },
    created_at: {
        type: "date",
        allowNull: false,
    },
    updated_at: {
        type: "date",
        allowNull: false,
    },
}