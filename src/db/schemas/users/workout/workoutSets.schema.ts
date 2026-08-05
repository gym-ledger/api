export const WORKOUT_SETS_TABLE = "workout_sets";

export interface WorkoutSetsInterface {
    id: string;
    workout_session_id: string;
    workout_program_exercise_id: string;
    set_order: number;
    weight: number | null;
    tool_weight: number | null;
    reps: number | null;
    rir: number | null;
    is_warmup: boolean;
    effort: string | null;
    discomfort_notes: string | null;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
