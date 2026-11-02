import { addDays, daysBetween, isoWeekdayOf } from "../../../utils/dates.js";

/** Counted days off that protect the streak in any rolling window. */
export const DAY_OFF_LIMIT = 10;
export const DAY_OFF_WINDOW_DAYS = 30;
/** How far back a forgotten day can still be marked (or unmarked). */
export const DAY_OFF_BACKFILL_DAYS = 2;
/** How far ahead a day can be marked (a planned trip). */
export const DAY_OFF_MAX_FUTURE_DAYS = 60;
/** Longest range one request may mark. */
export const DAY_OFF_MAX_RANGE_DAYS = 31;

/**
 * A stored day off only *counts* when that weekday is a planned training day
 * (under the user's current plans) and no workout was completed on it. A
 * workout always wins; a day the plan no longer trains needs no protecting.
 */
export const isCountedDayOff = (
    day: string,
    requiredWeekdays: ReadonlySet<number>,
    workedOutDates: ReadonlySet<string>,
): boolean => requiredWeekdays.has(isoWeekdayOf(day)) && !workedOutDates.has(day);

/**
 * Which counted days off protect the streak: a day does when it is among
 * the first DAY_OFF_LIMIT counted days off in the DAY_OFF_WINDOW_DAYS ending
 * on it (itself included). Days past the limit still use up the window, so
 * an 11th day off in a row doesn't protect, and neither does a 12th.
 */
export const protectedDaysOff = (countedDays: Iterable<string>): Set<string> => {
    const sorted = [...new Set(countedDays)].sort();
    const result = new Set<string>();
    let windowStart = 0;
    for (let i = 0; i < sorted.length; i++) {
        const earliest = addDays(sorted[i], -(DAY_OFF_WINDOW_DAYS - 1));
        while (sorted[windowStart] < earliest) windowStart++;
        if (i - windowStart + 1 <= DAY_OFF_LIMIT) result.add(sorted[i]);
    }
    return result;
};

/** Counted days off in the DAY_OFF_WINDOW_DAYS ending on `day`. */
export const daysOffUsedInWindow = (countedDays: Iterable<string>, day: string): number => {
    const earliest = addDays(day, -(DAY_OFF_WINDOW_DAYS - 1));
    let used = 0;
    for (const d of new Set(countedDays)) {
        if (d >= earliest && d <= day) used++;
    }
    return used;
};

export type DayOffRangeProblem =
    | "end_before_start"
    | "too_long"
    | "too_far_back"
    | "too_far_ahead";

/** Checks a [start, end] range against today's marking window. */
export const checkDayOffRange = (start: string, end: string, today: string): DayOffRangeProblem | null => {
    if (end < start) return "end_before_start";
    if (daysBetween(start, end) + 1 > DAY_OFF_MAX_RANGE_DAYS) return "too_long";
    if (start < addDays(today, -DAY_OFF_BACKFILL_DAYS)) return "too_far_back";
    if (end > addDays(today, DAY_OFF_MAX_FUTURE_DAYS)) return "too_far_ahead";
    return null;
};

/** True while a day off can still be changed or removed (today-2 onwards). */
export const isDayOffEditable = (day: string, today: string): boolean =>
    day >= addDays(today, -DAY_OFF_BACKFILL_DAYS) && day <= addDays(today, DAY_OFF_MAX_FUTURE_DAYS);
