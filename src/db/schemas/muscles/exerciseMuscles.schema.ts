export const EXERCISE_MUSCLES_TABLE = "exercise_muscles";

export interface ExerciseMusclesInterface {
    id: string;
    exercise_id: string;
    muscle_id: string;
    contribution: number;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}