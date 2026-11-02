import { AppError } from "../../../shared/errors/AppError.js";
import type { DayOffCategory } from "../../../db/schemas/users/workout/userDaysOff.schema.js";
import { addDays, daysBetween, isRealDate } from "../../../utils/dates.js";
import { getUserHealthPreferencesOrDefault, localDateString } from "../users.workout/users.workout.service.js";
import {
    fetchRequiredWeekdaysRepository,
    fetchUserAssignmentsRepository,
    fetchWorkedOutDatesRepository,
} from "../users.workout/users.workout.repository.js";
import {
    DAY_OFF_BACKFILL_DAYS,
    DAY_OFF_LIMIT,
    DAY_OFF_MAX_FUTURE_DAYS,
    DAY_OFF_MAX_RANGE_DAYS,
    DAY_OFF_WINDOW_DAYS,
    checkDayOffRange,
    daysOffUsedInWindow,
    isCountedDayOff,
    isDayOffEditable,
    protectedDaysOff,
    type DayOffRangeProblem,
} from "./daysOff.rules.js";
import {
    deleteDayOffRepository,
    fetchDaysOffBetweenRepository,
    upsertDaysOffRepository,
    type DayOffRow,
} from "./users.daysOff.repository.js";
import { MAX_LIST_SPAN_DAYS } from "./users.daysOff.schemas.js";

const RANGE_MESSAGES: Record<DayOffRangeProblem, string> = {
    end_before_start: "The end date is before the start date",
    too_long: `You can mark at most ${DAY_OFF_MAX_RANGE_DAYS} days at once`,
    too_far_back: `Days off can be marked at most ${DAY_OFF_BACKFILL_DAYS} days back`,
    too_far_ahead: `Days off can be marked at most ${DAY_OFF_MAX_FUTURE_DAYS} days ahead`,
};

const requireUser = (userId?: string): string => {
    if (!userId) throw new AppError("User ID is required", 400);
    return userId;
};

const requireRealDate = (date: string, field: string) => {
    if (!isRealDate(date)) throw new AppError(`${field} is not a real date`, 400);
};

/** The allowance rules, sent with every response so the app never hard-codes them. */
const allowance = (counted: Set<string>, today: string) => ({
    limit: DAY_OFF_LIMIT,
    window_days: DAY_OFF_WINDOW_DAYS,
    /** Counted days off in the 30 days ending today. */
    used_in_window: daysOffUsedInWindow(counted, today),
    earliest_date: addDays(today, -DAY_OFF_BACKFILL_DAYS),
    latest_date: addDays(today, DAY_OFF_MAX_FUTURE_DAYS),
});

/**
 * Everything needed to judge the days off between `from` and `to`: today in
 * the user's timezone, their planned weekdays, the days they trained and the
 * stored days off — from a window earlier, since those use up the allowance.
 */
const loadDayOffContext = async (userId: string, from: string, to: string) => {
    const { timezone } = await getUserHealthPreferencesOrDefault(userId);
    const today = localDateString(new Date(), timezone);
    const lookback = addDays(from < today ? from : today, -(DAY_OFF_WINDOW_DAYS - 1));
    const lookahead = to > today ? to : today;

    const assignments = await fetchUserAssignmentsRepository({ userId, activeOnly: true });
    const [weekdays, worked, rows] = await Promise.all([
        fetchRequiredWeekdaysRepository(assignments.map((a) => a.workout_program_version_id)),
        fetchWorkedOutDatesRepository(userId, timezone, lookback),
        fetchDaysOffBetweenRepository(userId, lookback, lookahead),
    ]);
    const requiredWeekdays = new Set(weekdays);
    const workedOutDates = new Set(worked);
    const counted = new Set(rows.filter((r) => isCountedDayOff(r.day, requiredWeekdays, workedOutDates)).map((r) => r.day));
    return { today, requiredWeekdays, workedOutDates, rows, counted };
};

const describe = (row: DayOffRow, counted: Set<string>, protectedDays: Set<string>, today: string) => ({
    date: row.day,
    category: row.category,
    note: row.note,
    /** False when a workout was done that day or the plan no longer trains it. */
    counted: counted.has(row.day),
    protects_streak: protectedDays.has(row.day),
    editable: isDayOffEditable(row.day, today),
});

export const listDaysOffService = async (data: { userId?: string, from: string, to: string }) => {
    const userId = requireUser(data.userId);
    requireRealDate(data.from, "from");
    requireRealDate(data.to, "to");
    if (data.to < data.from) throw new AppError("`to` is before `from`", 400);
    if (daysBetween(data.from, data.to) + 1 > MAX_LIST_SPAN_DAYS) {
        throw new AppError(`At most ${MAX_LIST_SPAN_DAYS} days can be listed at once`, 400);
    }

    const ctx = await loadDayOffContext(userId, data.from, data.to);
    const protectedDays = protectedDaysOff(ctx.counted);
    return {
        days_off: ctx.rows
            .filter((r) => r.day >= data.from && r.day <= data.to)
            .map((r) => describe(r, ctx.counted, protectedDays, ctx.today)),
        allowance: allowance(ctx.counted, ctx.today),
    };
};

export type DayOffSkipReason = "not_planned" | "trained";

/**
 * Marks every planned, not-yet-trained day from start to end as a day off
 * (re-marking a day replaces its category and note). With `dry_run`, only
 * reports what would happen — the sheet uses it to warn before saving when
 * some days would be past the 10-in-30 allowance.
 */
export const markDaysOffService = async (data: {
    userId?: string,
    start_date: string,
    end_date?: string,
    category: DayOffCategory,
    note?: string | null,
    dry_run?: boolean,
}) => {
    const userId = requireUser(data.userId);
    const start = data.start_date;
    const end = data.end_date ?? start;
    requireRealDate(start, "start_date");
    requireRealDate(end, "end_date");
    const note = data.note?.trim() || null;
    if (data.category === "other" && !note) {
        throw new AppError("Add a short note when the reason is Other", 400);
    }

    const ctx = await loadDayOffContext(userId, start, end);
    const problem = checkDayOffRange(start, end, ctx.today);
    if (problem) throw new AppError(RANGE_MESSAGES[problem], 400);
    if (ctx.requiredWeekdays.size === 0) {
        throw new AppError("You don't have an active plan with training days", 400);
    }

    const toMark: string[] = [];
    const skipped: { date: string, reason: DayOffSkipReason }[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
        if (!isCountedDayOff(d, ctx.requiredWeekdays, new Set())) {
            skipped.push({ date: d, reason: "not_planned" });
        } else if (ctx.workedOutDates.has(d)) {
            skipped.push({ date: d, reason: "trained" });
        } else {
            toMark.push(d);
        }
    }

    // Judge the new days together with the ones already stored.
    const counted = new Set([...ctx.counted, ...toMark]);
    const protectedDays = protectedDaysOff(counted);
    const alreadyMarked = new Set(ctx.rows.map((r) => r.day));
    const result = {
        days: toMark.map((date) => ({
            date,
            protects_streak: protectedDays.has(date),
            already_marked: alreadyMarked.has(date),
        })),
        skipped,
        // Days already taken, so a preview doesn't count the ones being added.
        allowance: allowance(ctx.counted, ctx.today),
    };

    if (data.dry_run) return result;
    if (toMark.length === 0) {
        throw new AppError(
            skipped.every((s) => s.reason === "not_planned")
                ? "There are no planned training days in these dates"
                : "You've already trained on these days",
            400,
        );
    }
    await upsertDaysOffRepository(userId, toMark, data.category, note);
    return result;
};

export const deleteDayOffService = async (data: { userId?: string, date: string }) => {
    const userId = requireUser(data.userId);
    requireRealDate(data.date, "date");
    const { timezone } = await getUserHealthPreferencesOrDefault(userId);
    const today = localDateString(new Date(), timezone);
    if (!isDayOffEditable(data.date, today)) {
        throw new AppError(`Days off older than ${DAY_OFF_BACKFILL_DAYS} days can't be changed`, 400);
    }
    const deleted = await deleteDayOffRepository(userId, data.date);
    if (!deleted) throw new AppError("No day off on that date", 404);
};
