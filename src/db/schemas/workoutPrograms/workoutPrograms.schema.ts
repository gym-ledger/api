export const WORKOUT_PROGRAMS_TABLE = "workout_programs";
export const WORKOUT_PROGRAM_VERSIONS_TABLE = "workout_program_versions";


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

    version_name: string;

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