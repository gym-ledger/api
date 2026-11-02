import { pg } from "../../../infrastructure/postgres/index.js";
import type { DayOffCategory, UserDaysOffInterface } from "../../../db/schemas/users/workout/userDaysOff.schema.js";

export type DayOffRow = Pick<UserDaysOffInterface, "day" | "category" | "note" | "created_at" | "updated_at">;

// `day` is selected as text: node-postgres would otherwise parse DATE into a
// JS Date at the server's local midnight and could shift the calendar day.
const DAY_OFF_COLUMNS = `to_char(day, 'YYYY-MM-DD') AS day, category, note, created_at, updated_at`;

/** The user's days off between two local days, both included, oldest first. */
export const fetchDaysOffBetweenRepository = async (
    userId: string,
    from: string,
    to: string,
): Promise<DayOffRow[]> => {
    const result = await pg.query(
        `SELECT ${DAY_OFF_COLUMNS}
        FROM user_days_off
        WHERE user_id = $1 AND day BETWEEN $2::date AND $3::date
        ORDER BY day`,
        [userId, from, to],
    );
    return result.rows as DayOffRow[];
};

/** Marks each day (replacing the category and note of days already marked). */
export const upsertDaysOffRepository = async (
    userId: string,
    days: string[],
    category: DayOffCategory,
    note: string | null,
): Promise<DayOffRow[]> => {
    if (days.length === 0) return [];
    const result = await pg.query(
        `INSERT INTO user_days_off (user_id, day, category, note)
        SELECT $1, d, $3, $4 FROM unnest($2::date[]) AS d
        ON CONFLICT (user_id, day) DO UPDATE
            SET category = EXCLUDED.category, note = EXCLUDED.note, updated_at = NOW()
        RETURNING ${DAY_OFF_COLUMNS}`,
        [userId, days, category, note],
    );
    return (result.rows as DayOffRow[]).sort((a, b) => a.day.localeCompare(b.day));
};

/** Removes one day off; false when there was none. */
export const deleteDayOffRepository = async (userId: string, day: string): Promise<boolean> => {
    const result = await pg.query(
        `DELETE FROM user_days_off WHERE user_id = $1 AND day = $2::date`,
        [userId, day],
    );
    return (result.rowCount ?? 0) > 0;
};
