export const USER_MUSCLE_SIGNALS_TABLE = "user_muscle_signals";

export interface UserMuscleSignalsInterface {
    id: string;
    user_id: string;
    muscle_id: string;
    training_value: number;
    fatigue_value: number;
    last_computed_at: Date;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
