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