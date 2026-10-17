export const USER_WEEKLY_CHECKINS_TABLE = "user_weekly_checkins";

export type WeeklyCheckinStatus = "pending" | "ready" | "failed" | "skipped";

export interface UserWeeklyCheckinsInterface {
    id: string;
    user_id: string;
    /** "YYYY-MM-DD", the Monday the check-in covers (user's timezone). */
    week_start: string;
    status: WeeklyCheckinStatus;
    stats: unknown;
    skip_reasons: unknown | null;
    content: unknown | null;
    model: string | null;
    attempts: number;
    next_retry_at: Date | null;
    generated_at: Date | null;
    dismissed_at: Date | null;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
