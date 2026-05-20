// CREATE TABLE program_day_sessions (
//     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

//     workout_program_day_id UUID NOT NULL
//         REFERENCES program_days(id),

//     name VARCHAR(255) NOT NULL,

//     added_by_admin_user_id UUID
//         REFERENCES admin_users(id),

//     added_by_user_id UUID
//         REFERENCES users(id),

//     visibility VARCHAR(10) NOT NULL
//         CHECK (visibility IN ('public', 'private')),

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
//     ),

//     deleted_at TIMESTAMPTZ,

//     created_at TIMESTAMPTZ NOT NULL
//         DEFAULT NOW(),

//     updated_at TIMESTAMPTZ NOT NULL
//         DEFAULT NOW()
// );

export const PROGRAM_DAY_SESSIONS_TABLE = "program_day_sessions";

export interface ProgramDaySessionsInterface {
    id: string;
    workout_program_day_id: string;
    name: string;
    added_by_admin_user_id: string | null;
    added_by_user_id: string | null;
    visibility: string;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export const PROGRAM_DAY_SESSIONS_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    workout_program_day_id: {
        type: "string",
        allowNull: true,
    },
    name: {
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