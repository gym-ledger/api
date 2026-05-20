export const PROGRAM_DAYS_TABLE = "program_days";

export interface ProgramDaysInterface {
    id: string;
    workout_program_id: string;
    day_number: number;
    name: string;
    added_by_admin_user_id: string;
    added_by_user_id: string;
    visibility: string;
    deleted_at: Date;
    created_at: Date;
    updated_at: Date;
}

export const PROGRAM_DAYS_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    workout_program_id: {
        type: "string",
        allowNull: true,
    },
    day_number: {
        type: "number",
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