export const USER_PROGRAM_ASSIGNMENTS_TABLE = "user_program_assignments";

export interface UserProgramAssignmentsInterface {
    id: string;
    user_id: string;
    workout_program_version_id: string;
    started_at: Date | null;
    current_program_day_id: string | null;
    current_program_day_session_id: string | null;
    is_active: boolean;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
