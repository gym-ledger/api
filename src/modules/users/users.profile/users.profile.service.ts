import {
    EQUIPMENT_OPTIONS,
    EXPERIENCE_LEVELS,
    TRAINING_GOALS,
    USER_HEALTH_PREFERENCES_TABLE,
    UserHealthPreferencesInterface,
} from "../../../db/schemas/users/userHealthPreferences.schema.js";
import { USERS_TABLE, UsersInterface } from "../../../db/schemas/users/users.schema.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { resolveSupportedTimezone } from "../../../utils/timezone.js";
import { addOneInTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { hashPassword, validateNewPassword, verifyPassword } from "../../../utils/authentication.js";
import { toPublicUser } from "../../../utils/users/users.utils.js";
import {
    assessWeightPace,
    GoalPace,
    isWeightGoalEndReason,
    isWeightGoalPace,
    MAX_CUSTOM_WEEKLY_PCT,
    paceWeeklyPct,
    requiredWeeklyPct,
    UNSAFE_GAIN_WEEKLY_PCT,
    UNSAFE_LOSS_WEEKLY_PCT,
    WEIGHT_GOAL_END_REASONS,
    WEIGHT_GOAL_END_STATUSES,
    WEIGHT_GOAL_PRESETS,
    WeightGoalEndStatus,
    weeklyWeightSlope,
    weeksToReachTarget,
} from "../../../utils/users/users.weightGoal.utils.js";
import { addDays, localDateString } from "../users.workout/users.workout.service.js";
import { fetchWeightEntriesBetweenRepository } from "../users.checkins/users.checkins.repository.js";
import {
    CurrentBodyWeight,
    endWeightGoalRepository,
    fetchCurrentBodyWeightRepository,
    fetchWeightGoalHistoryRepository,
    fetchWeightGoalRepository,
    insertWeightGoalRepository,
    updateWeightGoalRepository,
    WeightGoalEntry,
    WeightGoalFields,
    WeightGoalRow,
} from "./users.profile.repository.js";

const NAME_MAX_LENGTH = 100;

const PREFERENCE_FIELDS = [
    "timezone",
    "weight_units",
    "height_units",
    "height",
    "training_goal",
    "experience_level",
    "training_days_per_week",
    "equipment",
] as const;

const TRAINING_FIELDS = ["training_goal", "experience_level", "training_days_per_week", "equipment"] as const;

const toPreferencesView = (preferences: UserHealthPreferencesInterface) => ({
    timezone: preferences.timezone,
    weight_units: preferences.weight_units,
    height_units: preferences.height_units,
    height: preferences.height,
    training_goal: preferences.training_goal ?? null,
    experience_level: preferences.experience_level ?? null,
    training_days_per_week: preferences.training_days_per_week ?? null,
    equipment: preferences.equipment ?? null,
});

const assertOneOf = (value: unknown, options: readonly string[], label: string) => {
    if (typeof value !== "string" || !options.includes(value)) {
        throw new AppError(`${label} must be one of: ${options.join(", ")}`, 400);
    }
}

export const getUserPreferencesService = async ({
    userId,
}: {
    userId: string;
}) => {
    const preferences = await fetchOneFromTable({
        table: USER_HEALTH_PREFERENCES_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }],
        select: [...PREFERENCE_FIELDS],
    }) as UserHealthPreferencesInterface | null;
    return {
        preferences,
    }
}

export const updateUserPreferencesService = async ({
    userId,
    data,
}: {
    userId: string;
    data: Partial<UserHealthPreferencesInterface>;
}) => {
    if (!data) {
        throw new AppError("Data is required", 400);
    }
    const toUpdate: Partial<UserHealthPreferencesInterface> = {};;
    if (data.timezone !== undefined) {
        const timezone = await resolveSupportedTimezone(data.timezone);
        if (!timezone) {
            throw new AppError(`Unsupported timezone: ${String(data.timezone)}`, 400);
        }
        toUpdate.timezone = timezone;
    }
    if (data.weight_units) {
        toUpdate.weight_units = data.weight_units;
    }
    if (data.height_units) {
        toUpdate.height_units = data.height_units;
    }
    if (data.height) {
        toUpdate.height = data.height;
    }
    if (data.training_goal !== undefined) {
        assertOneOf(data.training_goal, TRAINING_GOALS, "Training goal");
        toUpdate.training_goal = data.training_goal;
    }
    if (data.experience_level !== undefined) {
        assertOneOf(data.experience_level, EXPERIENCE_LEVELS, "Experience level");
        toUpdate.experience_level = data.experience_level;
    }
    if (data.training_days_per_week !== undefined) {
        const days = Number(data.training_days_per_week);
        if (!Number.isInteger(days) || days < 1 || days > 7) {
            throw new AppError("Training days per week must be a whole number from 1 to 7", 400);
        }
        toUpdate.training_days_per_week = days;
    }
    if (data.equipment !== undefined) {
        assertOneOf(data.equipment, EQUIPMENT_OPTIONS, "Equipment");
        toUpdate.equipment = data.equipment;
    }
    let preferences = await fetchOneFromTable({
        table: USER_HEALTH_PREFERENCES_TABLE,
        where: [{
            field: "user_id",
            operator: "=",
            value: userId,
        }],
    }) as UserHealthPreferencesInterface | null;
    if (!preferences) {
        if (!toUpdate.timezone) {
            throw new AppError("Timezone is required", 400);
        }
        if (!toUpdate.weight_units) {
            throw new AppError("Weight units are required", 400);
        }
        if (!toUpdate.height_units) {
            throw new AppError("Height units are required", 400);
        }
        if (!toUpdate.height) {
            throw new AppError("Height is required", 400);
        }
        preferences = await addOneInTable({
            table: USER_HEALTH_PREFERENCES_TABLE,
            data: {
                user_id: userId,
                ...toUpdate,
            },
        }) as UserHealthPreferencesInterface;
    } else {
        preferences = await updateOneInTable({
            table: USER_HEALTH_PREFERENCES_TABLE,
            where: [{
                field: "user_id",
                operator: "=",
                value: userId,
            }],
            data: toUpdate,
        }) as UserHealthPreferencesInterface;
    }
    return {
        preferences: toPreferencesView(preferences),
    }
}

const fetchUserOrThrow = async (userId: string) => {
    const user = await fetchOneFromTable({
        table: USERS_TABLE,
        where: [{ field: "id", operator: "=", value: userId }],
    }) as UsersInterface | null;
    if (!user) {
        throw new AppError("User not found", 404);
    }
    return user;
}

export const getUserSelfProfileService = async ({ userId }: { userId: string }) => {
    return toPublicUser(await fetchUserOrThrow(userId));
}

/** Leaves an earlier `onboarded_at` in place, so finishing after a skip keeps the first date. */
const markOnboarded = async (userId: string) => {
    const user = await fetchUserOrThrow(userId);
    if (user.onboarded_at) {
        return user;
    }
    return await updateOneInTable({
        table: USERS_TABLE,
        data: { onboarded_at: new Date(), updated_at: new Date() },
        where: [{ field: "id", operator: "=", value: userId }],
    }) as UsersInterface;
}

/**
 * Saves the onboarding wizard: the four training answers plus timezone,
 * units and height (which the preferences row needs to exist), then marks
 * the user onboarded.
 */
export const completeOnboardingService = async ({
    userId,
    data,
}: {
    userId: string;
    data: Partial<UserHealthPreferencesInterface>;
}) => {
    for (const field of TRAINING_FIELDS) {
        if (data?.[field] == null) {
            throw new AppError(`${field} is required`, 400);
        }
    }
    const { preferences } = await updateUserPreferencesService({ userId, data });
    const user = await markOnboarded(userId);
    return { user: toPublicUser(user), preferences };
}

export const skipOnboardingService = async ({ userId }: { userId: string }) => {
    return toPublicUser(await markOnboarded(userId));
}

/**
 * Sets the user's name. `firstName` is required and non-empty; `lastName`
 * is optional — omit it to leave it unchanged, send null or "" to clear it.
 */
export const updateUserNameService = async ({
    userId,
    data,
}: {
    userId: string;
    data: { firstName?: unknown; lastName?: unknown };
}) => {
    const firstName = typeof data?.firstName === "string" ? data.firstName.trim() : "";
    if (!firstName) {
        throw new AppError("First name is required", 400);
    }
    if (firstName.length > NAME_MAX_LENGTH) {
        throw new AppError(`First name must be at most ${NAME_MAX_LENGTH} characters`, 400);
    }
    const toUpdate: Record<string, unknown> = {
        first_name: firstName,
        updated_at: new Date(),
    };
    if (data.lastName !== undefined) {
        if (data.lastName !== null && typeof data.lastName !== "string") {
            throw new AppError("Last name must be a string", 400);
        }
        const lastName = data.lastName?.trim() || null;
        if (lastName && lastName.length > NAME_MAX_LENGTH) {
            throw new AppError(`Last name must be at most ${NAME_MAX_LENGTH} characters`, 400);
        }
        toUpdate.last_name = lastName;
    }
    const user = await updateOneInTable({
        table: USERS_TABLE,
        data: toUpdate,
        where: [{ field: "id", operator: "=", value: userId }],
    }) as UsersInterface | null;
    if (!user) {
        throw new AppError("User not found", 404);
    }
    return toPublicUser(user);
}

/**
 * Sets a new password for the logged-in user. If they already have one,
 * `currentPassword` must match it; users who have only ever logged in via
 * OTP have no password yet and can set one directly.
 */
export const changeUserPasswordService = async ({
    userId,
    data,
}: {
    userId: string;
    data: { currentPassword?: unknown; newPassword?: unknown };
}) => {
    const { currentPassword, newPassword } = data ?? {};
    validateNewPassword(newPassword);
    const user = await fetchUserOrThrow(userId);
    if (user.password_hash) {
        if (typeof currentPassword !== "string" || !currentPassword) {
            throw new AppError("Current password is required", 400);
        }
        if (!await verifyPassword(currentPassword, user.password_hash)) {
            throw new AppError("Current password is incorrect", 400);
        }
        if (await verifyPassword(newPassword, user.password_hash)) {
            throw new AppError("New password must be different from the current password", 400);
        }
    }
    await updateOneInTable({
        table: USERS_TABLE,
        data: {
            password_hash: await hashPassword(newPassword),
            updated_at: new Date(),
        },
        where: [{ field: "id", operator: "=", value: userId }],
    });
}


// ---------------------------------------------------------------------------
// Body-weight goal — see algorithms/weekly-checkin.md §5
// ---------------------------------------------------------------------------

const GOAL_MAX_WEEKS = 156;
const START_DATE_MAX_DAYS_BACK = 365;
const TARGET_WEIGHT_MIN = 20;
const TARGET_WEIGHT_MAX = 400;
const END_NOTE_MAX_LENGTH = 500;
const HISTORY_LIMIT = 50;
/** Weigh-ins this far back (within the goal) set the measured trend. */
const TREND_WINDOW_DAYS = 28;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const round2 = (value: number) => Math.round(value * 100) / 100;

const weeksBetween = (fromDate: string, toDate: string) =>
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / (7 * 86_400_000);

const todayForTimezone = async (timezone: string | null | undefined) =>
    localDateString(new Date(), (timezone && await resolveSupportedTimezone(timezone)) || "UTC");

const isIsoDate = (value: unknown): value is string =>
    typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));

const parseTargetWeight = (value: unknown): number => {
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < TARGET_WEIGHT_MIN || n > TARGET_WEIGHT_MAX) {
        throw new AppError(`Target weight must be a number between ${TARGET_WEIGHT_MIN} and ${TARGET_WEIGHT_MAX}`, 400);
    }
    return round2(n);
}

/** "Goal starts from": today by default, or a past date up to a year back. */
const parseStartDate = (value: unknown, today: string, fallback: string): string => {
    if (value == null || value === "") return fallback;
    if (!isIsoDate(value)) {
        throw new AppError("Start date must be a date like 2026-10-01", 400);
    }
    if (value > today) {
        throw new AppError("Start date can't be in the future", 400);
    }
    if (value < addDays(today, -START_DATE_MAX_DAYS_BACK)) {
        throw new AppError("Start date must be within the last year", 400);
    }
    return value;
}

const requireWeight = (current: CurrentBodyWeight | null): CurrentBodyWeight => {
    if (!current) {
        throw new AppError("Log your body weight first — the goal is measured from it", 400);
    }
    return current;
}

/**
 * The weight a goal is measured from: the 7-day average as of `startDate`,
 * or the current one when there are no weigh-ins that early. Editing a goal
 * without moving its start keeps the weight it started from.
 */
const resolveStartWeight = async (userId: string, active: WeightGoalRow | null, startDate: string) => {
    if (active?.id && active.start_date === startDate && active.start_weight != null) {
        return { weight: active.start_weight, as_of: startDate } satisfies CurrentBodyWeight;
    }
    return await fetchCurrentBodyWeightRepository(userId, startDate) ?? await fetchCurrentBodyWeightRepository(userId);
}

/**
 * The pace for a cut or bulk: a preset matching the direction, or "custom"
 * with an unsigned `customPace` in % of body weight or weight units per week.
 */
const parseGoalPace = (params: {
    preset: unknown,
    customPace: unknown,
    customUnit: unknown,
    direction: "lose" | "gain",
    currentWeight: number,
    weightUnits: string,
}): GoalPace => {
    const { preset, direction, currentWeight, weightUnits } = params;
    if (!isWeightGoalPace(preset)) {
        throw new AppError(`Pick a pace: ${[...Object.keys(WEIGHT_GOAL_PRESETS), "custom"].join(", ")}`, 400);
    }
    if (preset !== "custom") {
        if (WEIGHT_GOAL_PRESETS[preset].direction !== direction) {
            throw new AppError(`${WEIGHT_GOAL_PRESETS[preset].label} doesn't match a goal to ${direction} weight`, 400);
        }
        return { pace: preset, customPace: null, customUnit: null };
    }

    const unit = params.customUnit;
    if (unit !== "pct" && unit !== "weight") {
        throw new AppError("Custom pace unit must be pct or weight", 400);
    }
    const raw = typeof params.customPace === "string" ? parseFloat(params.customPace) : params.customPace;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw === 0) {
        throw new AppError("Enter your weekly pace", 400);
    }
    // Direction comes from the goal; a sign typed by the user is ignored.
    const value = Math.round(Math.abs(raw) * 1000) / 1000;
    const goalPace: GoalPace = { pace: "custom", customPace: value, customUnit: unit };
    if (paceWeeklyPct(goalPace, currentWeight) > MAX_CUSTOM_WEEKLY_PCT) {
        const maxWeight = round2(currentWeight * MAX_CUSTOM_WEEKLY_PCT / 100);
        throw new AppError(`Pace can be at most ${MAX_CUSTOM_WEEKLY_PCT}% of body weight a week (${maxWeight} ${weightUnits})`, 400);
    }
    return goalPace;
}

const assertTargetMatchesDirection = (direction: "lose" | "gain", startWeight: number, targetWeight: number) => {
    if (direction === "lose" && targetWeight >= startWeight) {
        throw new AppError("For a cut, the target must be below your starting weight", 400);
    }
    if (direction === "gain" && targetWeight <= startWeight) {
        throw new AppError("For a bulk, the target must be above your starting weight", 400);
    }
}

const suggestedGoalDate = (startDate: string, startWeight: number, targetWeight: number, goalPace: GoalPace) => {
    const weeks = weeksToReachTarget({ currentWeight: startWeight, targetWeight, weeklyPct: paceWeeklyPct(goalPace, startWeight) });
    return { weeks, goal_date: addDays(startDate, weeks * 7) };
}

type GoalLike = Pick<WeightGoalEntry,
    "weight_goal" | "weight_goal_preset" | "custom_weekly_pace" | "custom_weekly_pace_unit" |
    "target_weight" | "start_date" | "start_weight" | "goal_date">;

/** Signed pace the user chose, % of body weight per week at `atWeight`. */
const chosenPacePct = (goal: GoalLike, atWeight: number | null) => {
    if (!goal.weight_goal_preset || goal.weight_goal === "maintain" || !atWeight) return null;
    const sign = goal.weight_goal === "lose" ? -1 : 1;
    return sign * paceWeeklyPct({
        pace: goal.weight_goal_preset,
        customPace: goal.custom_weekly_pace,
        customUnit: goal.custom_weekly_pace_unit,
    }, atWeight);
}

const targetReached = (goal: GoalLike, weight: number | null) => {
    if (weight == null || goal.target_weight == null || goal.weight_goal === "maintain") return false;
    return goal.weight_goal === "lose" ? weight <= goal.target_weight : weight >= goal.target_weight;
}

/** Share of the way from the start weight to the target, 0–1. */
const progressFraction = (goal: GoalLike, weight: number | null) => {
    if (weight == null || goal.start_weight == null || goal.target_weight == null) return null;
    const total = goal.target_weight - goal.start_weight;
    if (total === 0) return null;
    return Math.min(1, Math.max(0, (weight - goal.start_weight) / total));
}

/**
 * Where the plan says the user should be on `date`: a straight line from the
 * start weight on the start date to the target on the goal date. A goal with
 * no date (maintain) holds the start weight.
 */
const plannedWeightOn = (goal: GoalLike, date: string) => {
    if (goal.start_weight == null) return null;
    if (goal.target_weight == null || !goal.goal_date) return goal.start_weight;
    const total = weeksBetween(goal.start_date, goal.goal_date);
    if (total <= 0) return goal.target_weight;
    const t = Math.min(1, Math.max(0, weeksBetween(goal.start_date, date) / total));
    return goal.start_weight + (goal.target_weight - goal.start_weight) * t;
}

/**
 * The active goal plus where the user stands against it: the planned weight
 * for today, the measured trend over the last few weeks of the goal, and the
 * date that trend would reach the target.
 */
const toWeightGoalView = (
    goal: WeightGoalEntry,
    current: CurrentBodyWeight | null,
    today: string,
    trendEntries: { date: string, weight: number }[],
) => {
    const weeksLeft = goal.goal_date ? Math.max(0, weeksBetween(today, goal.goal_date)) : null;
    const required = current && goal.target_weight != null && weeksLeft
        ? requiredWeeklyPct(current.weight, goal.target_weight, weeksLeft)
        : null;
    const unsafe = required != null && (
        (required < 0 && -required > UNSAFE_LOSS_WEEKLY_PCT) ||
        (required > 0 && required > UNSAFE_GAIN_WEEKLY_PCT)
    );
    const pacePct = chosenPacePct(goal, current?.weight ?? goal.start_weight);

    // Measured trend, weight units per week (null until there's enough data).
    const slope = weeklyWeightSlope(trendEntries);
    const actualPct = slope != null && current ? (slope / current.weight) * 100 : null;
    const reached = targetReached(goal, current?.weight ?? null);
    const datePassed = goal.goal_date != null && today >= goal.goal_date;
    const status = assessWeightPace({
        goal: goal.weight_goal,
        preset: goal.weight_goal_preset,
        actualWeeklyPct: actualPct,
        targetWeeklyPct: required ?? pacePct,
        currentWeight: current?.weight ?? null,
        targetWeight: goal.target_weight,
    });

    // When the measured trend would reach the target, if it's heading there.
    let projectedDate: string | null = null;
    if (slope != null && current && goal.target_weight != null && !reached) {
        const remaining = goal.target_weight - current.weight;
        if (Math.sign(remaining) === Math.sign(slope) && slope !== 0) {
            const weeks = remaining / slope;
            if (weeks <= GOAL_MAX_WEEKS) projectedDate = addDays(today, Math.ceil(weeks * 7));
        }
    }
    const planned = plannedWeightOn(goal, today);

    return {
        id: goal.id,
        status: goal.status,
        goal: goal.weight_goal,
        preset: goal.weight_goal_preset,
        custom_pace: goal.custom_weekly_pace,
        custom_pace_unit: goal.custom_weekly_pace_unit,
        /** Signed pace the user chose, % of body weight per week at their current weight. */
        pace_weekly_pct: pacePct == null ? null : round2(pacePct),
        target_weight: goal.target_weight,
        start_date: goal.start_date,
        start_weight: goal.start_weight,
        goal_date: goal.goal_date,
        goal_date_source: goal.goal_date_source,
        weeks_left: weeksLeft == null ? null : Math.round(weeksLeft * 10) / 10,
        /** Signed % of body weight per week still needed to hit the target by the date. */
        required_weekly_pct: required == null ? null : round2(required),
        /** The date needs a pace faster than any preset allows. */
        pace_warning: unsafe,
        trajectory: {
            /** Where the straight-line plan puts the user today. */
            planned_weight_today: planned == null ? null : round2(planned),
            /** Measured trend in weight units per week, signed; null until 4 weigh-ins over 10+ days. */
            actual_weekly_change: slope == null ? null : round2(slope),
            actual_weekly_pct: actualPct == null ? null : round2(actualPct),
            /** Same verdicts as the weekly check-in (assessWeightPace). */
            pace_status: status,
            /** The date the measured trend reaches the target; null if it isn't heading there. */
            projected_date: projectedDate,
            /** 0–1 of the way from the start weight to the target. */
            progress: (() => { const p = progressFraction(goal, current?.weight ?? null); return p == null ? null : round2(p); })(),
        },
        target_reached: reached,
        date_passed: datePassed,
        /** "Mark complete" is offered once the date passes or the target is reached; a maintain goal any time. */
        can_complete: goal.weight_goal === "maintain" || reached || datePassed,
    };
}

const toHistoryView = (goal: WeightGoalEntry) => {
    const change = goal.end_weight != null && goal.start_weight != null ? round2(goal.end_weight - goal.start_weight) : null;
    const progress = progressFraction(goal, goal.end_weight);
    return {
        id: goal.id,
        status: goal.status,
        goal: goal.weight_goal,
        preset: goal.weight_goal_preset,
        custom_pace: goal.custom_weekly_pace,
        custom_pace_unit: goal.custom_weekly_pace_unit,
        target_weight: goal.target_weight,
        start_date: goal.start_date,
        start_weight: goal.start_weight,
        goal_date: goal.goal_date,
        end_date: goal.end_date,
        end_weight: goal.end_weight,
        end_reason: goal.end_reason,
        end_note: goal.end_note,
        /** Signed, end weight minus start weight. */
        change,
        /** 0–1 of the way from the start weight to the target. */
        progress: progress == null ? null : round2(progress),
        weeks: goal.end_date ? Math.round(weeksBetween(goal.start_date, goal.end_date) * 10) / 10 : null,
    };
}

/** The WeightGoalRow from fetchWeightGoalRepository as an entry, or null without an active goal. */
const activeGoalOf = (row: WeightGoalRow | null): WeightGoalEntry | null =>
    row?.id ? row as WeightGoalEntry : null;

const buildGoalView = async (userId: string, goal: WeightGoalEntry, current: CurrentBodyWeight | null, today: string) => {
    const from = goal.start_date > addDays(today, -TREND_WINDOW_DAYS) ? goal.start_date : addDays(today, -TREND_WINDOW_DAYS);
    const entries = await fetchWeightEntriesBetweenRepository(userId, from, today);
    return toWeightGoalView(goal, current, today, entries);
}

export const getWeightGoalService = async ({ userId }: { userId: string }) => {
    const [row, current] = await Promise.all([
        fetchWeightGoalRepository(userId),
        fetchCurrentBodyWeightRepository(userId),
    ]);
    const today = await todayForTimezone(row?.timezone);
    const active = activeGoalOf(row);
    return {
        goal: active ? await buildGoalView(userId, active, current, today) : null,
        has_preferences: row !== null,
        weight_units: row?.weight_units ?? "kg",
        current_weight: current,
        today,
        presets: Object.values(WEIGHT_GOAL_PRESETS),
        max_custom_weekly_pct: MAX_CUSTOM_WEEKLY_PCT,
        end_reasons: WEIGHT_GOAL_END_REASONS,
    };
}

/** The date the chosen pace would reach `targetWeight` by, from the weight on the start date. */
export const suggestWeightGoalDateService = async ({
    userId,
    query,
}: {
    userId: string;
    query: { preset?: unknown; target_weight?: unknown; custom_pace?: unknown; custom_pace_unit?: unknown; start_date?: unknown };
}) => {
    const targetWeight = parseTargetWeight(query.target_weight);
    const row = await fetchWeightGoalRepository(userId);
    const today = await todayForTimezone(row?.timezone);
    const active = activeGoalOf(row);
    const startDate = parseStartDate(query.start_date, today, active?.start_date ?? today);
    const start = requireWeight(await resolveStartWeight(userId, row, startDate));
    const weightUnits = row?.weight_units ?? "kg";
    // The direction follows from the target; the pace must agree with it.
    const direction = targetWeight < start.weight ? "lose" : "gain";
    const goalPace = parseGoalPace({
        preset: query.preset,
        customPace: query.custom_pace,
        customUnit: query.custom_pace_unit,
        direction,
        currentWeight: start.weight,
        weightUnits,
    });
    assertTargetMatchesDirection(direction, start.weight, targetWeight);
    const { weeks, goal_date } = suggestedGoalDate(startDate, start.weight, targetWeight, goalPace);
    const sign = direction === "lose" ? -1 : 1;
    return {
        preset: goalPace.pace,
        start_date: startDate,
        goal_date,
        /** A backdated start can put the suggested date in the past; the user then picks one. */
        goal_date_passed: goal_date <= today,
        weeks,
        start_weight: round2(start.weight),
        target_weight: targetWeight,
        weekly_change: round2(sign * start.weight * paceWeeklyPct(goalPace, start.weight) / 100),
        weekly_pct: round2(sign * paceWeeklyPct(goalPace, start.weight)),
        weight_units: weightUnits,
    };
}

/**
 * Saves the goal: edits the active one, or starts a new one when there is
 * none. A cut or bulk needs a pace (a preset, or "custom" with `custom_pace`
 * + `custom_pace_unit`) and a target; without `goal_date` the pace's
 * suggested date is used. "maintain" takes neither — it holds the start
 * weight. `start_date` defaults to today for a new goal and to the current
 * start when editing.
 */
export const saveWeightGoalService = async ({
    userId,
    data,
}: {
    userId: string;
    data: {
        goal?: unknown;
        preset?: unknown;
        custom_pace?: unknown;
        custom_pace_unit?: unknown;
        target_weight?: unknown;
        goal_date?: unknown;
        start_date?: unknown;
    };
}) => {
    const row = await fetchWeightGoalRepository(userId);
    if (!row) {
        throw new AppError("Save your units and height in settings first", 400);
    }
    const goal = data?.goal;
    if (goal !== "lose" && goal !== "maintain" && goal !== "gain") {
        throw new AppError("Goal must be lose, maintain or gain", 400);
    }
    const today = await todayForTimezone(row.timezone);
    const active = activeGoalOf(row);
    const startDate = parseStartDate(data.start_date, today, active?.start_date ?? today);
    const start = await resolveStartWeight(userId, row, startDate);

    let fields: WeightGoalFields;
    if (goal === "maintain") {
        fields = {
            weight_goal: "maintain",
            weight_goal_preset: null,
            custom_weekly_pace: null,
            custom_weekly_pace_unit: null,
            target_weight: null,
            start_date: startDate,
            start_weight: start ? round2(start.weight) : null,
            goal_date: null,
            goal_date_source: null,
        };
    } else {
        const startWeight = requireWeight(start).weight;
        const goalPace = parseGoalPace({
            preset: data.preset,
            customPace: data.custom_pace,
            customUnit: data.custom_pace_unit,
            direction: goal,
            currentWeight: startWeight,
            weightUnits: row.weight_units,
        });
        const targetWeight = parseTargetWeight(data.target_weight);
        assertTargetMatchesDirection(goal, startWeight, targetWeight);
        const suggestion = suggestedGoalDate(startDate, startWeight, targetWeight, goalPace);

        let goalDate = suggestion.goal_date;
        let source: "suggested" | "user" = "suggested";
        if (data.goal_date != null && data.goal_date !== "") {
            if (!isIsoDate(data.goal_date)) {
                throw new AppError("Goal date must be a date like 2027-03-01", 400);
            }
            goalDate = data.goal_date;
            source = data.goal_date === suggestion.goal_date ? "suggested" : "user";
        }
        if (goalDate <= today) {
            throw new AppError("Goal date must be in the future", 400);
        }
        if (weeksBetween(startDate, goalDate) > GOAL_MAX_WEEKS) {
            throw new AppError("Goal date must be within 3 years of the start", 400);
        }

        fields = {
            weight_goal: goal,
            weight_goal_preset: goalPace.pace,
            custom_weekly_pace: goalPace.customPace,
            custom_weekly_pace_unit: goalPace.customUnit,
            target_weight: targetWeight,
            start_date: startDate,
            start_weight: round2(startWeight),
            goal_date: goalDate,
            goal_date_source: source,
        };
    }

    const saved = active
        ? await updateWeightGoalRepository(userId, active.id, fields)
        : await insertWeightGoalRepository(userId, fields);
    if (!saved) {
        throw new AppError("This goal has already ended — set a new one", 409);
    }
    const current = await fetchCurrentBodyWeightRepository(userId);
    return { goal: await buildGoalView(userId, saved, current, today) };
}

/**
 * Ends the active goal. "completed" needs the date to have passed or the
 * target to be reached (any time for maintain). "finished_early" and
 * "cancelled" take an optional `reason` from WEIGHT_GOAL_END_REASONS and an
 * optional `note`.
 */
export const endWeightGoalService = async ({
    userId,
    data,
}: {
    userId: string;
    data: { status?: unknown; reason?: unknown; note?: unknown };
}) => {
    const status = data?.status;
    if (!WEIGHT_GOAL_END_STATUSES.includes(status as WeightGoalEndStatus)) {
        throw new AppError(`Status must be one of: ${WEIGHT_GOAL_END_STATUSES.join(", ")}`, 400);
    }
    const endStatus = status as WeightGoalEndStatus;
    const row = await fetchWeightGoalRepository(userId);
    const active = activeGoalOf(row);
    if (!active) {
        throw new AppError("There is no active goal", 404);
    }
    const today = await todayForTimezone(row?.timezone);
    const current = await fetchCurrentBodyWeightRepository(userId);

    let reason: string | null = null;
    if (endStatus === "completed") {
        const datePassed = active.goal_date != null && today >= active.goal_date;
        if (active.weight_goal !== "maintain" && !datePassed && !targetReached(active, current?.weight ?? null)) {
            throw new AppError("A goal can be marked complete once its date passes or you reach the target", 400);
        }
    } else if (data.reason != null && data.reason !== "") {
        if (!isWeightGoalEndReason(endStatus, data.reason)) {
            throw new AppError("Unknown reason", 400);
        }
        reason = data.reason;
    }

    let note: string | null = null;
    if (data.note != null) {
        if (typeof data.note !== "string") {
            throw new AppError("Note must be text", 400);
        }
        note = data.note.trim() || null;
        if (note && note.length > END_NOTE_MAX_LENGTH) {
            throw new AppError(`Note must be at most ${END_NOTE_MAX_LENGTH} characters`, 400);
        }
    }

    const ended = await endWeightGoalRepository(userId, active.id, {
        status: endStatus,
        end_date: today,
        end_weight: current ? round2(current.weight) : null,
        end_reason: reason,
        end_note: note,
    });
    if (!ended) {
        throw new AppError("This goal has already ended", 409);
    }
    return { goal: toHistoryView(ended) };
}

/** Kept for older clients: ends the active goal as cancelled, with no reason. */
export const clearWeightGoalService = async ({ userId }: { userId: string }) => {
    const active = activeGoalOf(await fetchWeightGoalRepository(userId));
    if (!active) return;
    await endWeightGoalService({ userId, data: { status: "cancelled" } });
}

export const getWeightGoalHistoryService = async ({ userId }: { userId: string }) => {
    const goals = await fetchWeightGoalHistoryRepository(userId, HISTORY_LIMIT);
    return { goals: goals.map(toHistoryView) };
}
