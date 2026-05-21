import { ExercisesInterface } from "../exercises/exercises.schema.js";

export const WORKOUT_PROGRAM_EXERCISES_TABLE = "workout_program_exercises";

export interface WorkoutProgramExercisesInterface {
    id: string;
    workout_program_day_session_id: string;
    exercise_id: string | null;
    exercise: ExercisesInterface | null;
    exercise_order: number;
    target_sets: number;
    min_reps: number;
    max_reps: number;
    target_rir: number | null;
    rest_seconds: number | null;
    tempo: string | null;
    notes: string | null;
    added_by_admin_user_id: string | null;
    added_by_user_id: string | null;
    visibility: string;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export const WORKOUT_PROGRAM_EXERCISES_SCHEMA = {
    id: {
        type: "string",
        primaryKey: true,
        unique: true,
    },
    workout_program_day_session_id: {
        type: "string",
        allowNull: true,
    },
    exercise_id: {
        type: "string",
        allowNull: true,
    },
    exercise_order: {
        type: "number",
        allowNull: true,
    },
    target_sets: {
        type: "number",
        allowNull: true,
    },
    min_reps: {
        type: "number",
        allowNull: true,
    },
    max_reps: {
        type: "number",
        allowNull: true,
    },
    target_rir: {
        type: "number",
        allowNull: true,
    },
    rest_seconds: {
        type: "number",
        allowNull: true,
    },
    tempo: {
        type: "string",
        allowNull: true,
    },
    notes: {
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