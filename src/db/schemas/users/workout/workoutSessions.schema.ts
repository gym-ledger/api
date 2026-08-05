export const WORKOUT_SESSIONS_TABLE = "workout_sessions";

export interface WorkoutSessionsInterface {
    id: string;
    user_id: string;
    program_assignment_id: string;
    started_at: Date;
    completed_at: Date | null;
    notes: string | null;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
