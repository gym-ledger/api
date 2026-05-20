export const WORKOUT_PROGRAMS_TABLE = "workout_programs";
export const WORKOUT_PROGRAM_VERSIONS_TABLE = "workout_program_versions";

// CREATE TABLE workout_programs (
//     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

//     name VARCHAR(255) NOT NULL,
//     slug CITEXT NOT NULL,

//     added_by_admin_user_id UUID
//         REFERENCES admin_users(id),

//     added_by_user_id UUID
//         REFERENCES users(id),

//     visibility VARCHAR(10) NOT NULL
//         CHECK (visibility IN ('public', 'private')),

//     deleted_at TIMESTAMPTZ,

//     created_at TIMESTAMPTZ NOT NULL
//         DEFAULT NOW(),

//     updated_at TIMESTAMPTZ NOT NULL
//         DEFAULT NOW()

//     CHECK (
//         (
//             added_by_admin_user_id IS NOT NULL
//             AND added_by_user_id IS NULL
//         )
//         OR
//         (
//             added_by_admin_user_id IS NULL
//             AND added_by_user_id IS NOT NULL
//         )
//     )
// );



export interface WorkoutProgramsInterface {
    id: string;

    name: string;

    slug: string;

    added_by_admin_user_id: string;

    added_by_user_id: string;

    visibility: string;

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;

}

export interface WorkoutProgramVersionsInterface {
    id: string;

    workout_program_id: string;

    version_number: number;

    training_days: number;

    split_type: string;

    session_ordering_logic: string;

    duration_type: string;

    duration_weeks: number;

    added_by_admin_user_id: string;

    added_by_user_id: string;

    visibility: string;

    deleted_at: Date;

    created_at: Date;

    updated_at: Date;

}
// CREATE TABLE workout_program_versions (
//     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

//     workout_program_id UUID NOT NULL
//         REFERENCES workout_programs(id),

//     version_number INTEGER NOT NULL,
//     UNIQUE (workout_program_id, version_number),


//     training_days INTEGER NOT NULL,

//     split_type VARCHAR(15) NOT NULL
//         CHECK (split_type IN ('ppl', 'upper-lower', 'full-body', 'custom')),

//     session_ordering_logic VARCHAR(10) NOT NULL
//         CHECK (session_ordering_logic IN ('sequential', 'cyclic', 'random')),

//     duration_type VARCHAR(10) NOT NULL
//         CHECK (duration_type IN ('indefinite', 'finite')),

//     duration_weeks INTEGER NOT NULL,

//     added_by_admin_user_id UUID
//         REFERENCES admin_users(id),

//     added_by_user_id UUID
//         REFERENCES users(id),

//     visibility VARCHAR(10) NOT NULL
//         CHECK (visibility IN ('public', 'private')),

//     deleted_at TIMESTAMPTZ,

//     created_at TIMESTAMPTZ NOT NULL
//         DEFAULT NOW(),

//     updated_at TIMESTAMPTZ NOT NULL
//         DEFAULT NOW()

//     CHECK (
//         (
//             added_by_admin_user_id IS NOT NULL
//             AND added_by_user_id IS NULL
//         )
//         OR
//         (
//             added_by_admin_user_id IS NULL
//             AND added_by_user_id IS NOT NULL
//         )
//     )
// );


export const WORKOUT_PROGRAMS_SCHEMA = {
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

export const WORKOUT_PROGRAM_VERSIONS_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    workout_program_id: {
        type: "string",
        allowNull: true,
    },
    version_number: {
        type: "number",
        allowNull: true,
    },
    training_days: {
        type: "number",
        allowNull: true,
    },
    split_type: {
        type: "string",
        allowNull: true,
    },
    session_ordering_logic: {
        type: "string",
        allowNull: true,
    },
    duration_type: {
        type: "string",
        allowNull: true,
    },
    duration_weeks: {
        type: "number",
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