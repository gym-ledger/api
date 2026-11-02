// Calendar-day helpers on "YYYY-MM-DD" strings. They work in UTC on purpose:
// the string already is the user's local day, so no timezone may shift it.

/** 1=Mon..7=Sun for a "YYYY-MM-DD" date string. */
export const isoWeekdayOf = (dateStr: string): number => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return day === 0 ? 7 : day;
}

export const addDays = (dateStr: string, delta: number): string => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export const isRealDate = (dateStr: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && addDays(dateStr, 0) === dateStr;

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
