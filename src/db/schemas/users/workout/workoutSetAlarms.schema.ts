export const WORKOUT_SET_ALARMS_TABLE = "workout_set_alarms";

export interface WorkoutSetAlarmsInterface {
    id: string;
    user_id: string;
    workout_set_id: string;
    exercise_id: string;
    message: string;
    discarded_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
