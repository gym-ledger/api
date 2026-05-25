export const USER_HEALTH_PREFERENCES_TABLE = "user_health_preferences";

export interface UserHealthPreferencesInterface {
    id: string;

    user_id: string;

    timezone: string;

    weight_units: string;

    height_units: string;

    height: number;

    deleted_at: Date;

    updated_at: Date;
}