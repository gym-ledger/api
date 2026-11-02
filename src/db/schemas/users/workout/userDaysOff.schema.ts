export const USER_DAYS_OFF_TABLE = "user_days_off";

/** Why a planned training day was taken off. Keep in sync with migration 044's CHECK. */
export const DAY_OFF_CATEGORIES = ["sick", "injury", "low_energy", "sore", "travel", "work", "family", "other"] as const;
export type DayOffCategory = typeof DAY_OFF_CATEGORIES[number];

export interface UserDaysOffInterface {
    id: string;
    user_id: string;
    /** The user's local calendar day, YYYY-MM-DD (selected with to_char, never parsed into a Date). */
    day: string;
    category: DayOffCategory;
    note: string | null;
    created_at: Date;
    updated_at: Date;
}
