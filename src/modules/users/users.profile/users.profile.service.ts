import { USER_HEALTH_PREFERENCES_TABLE, UserHealthPreferencesInterface } from "../../../db/schemas/users/userHealthPreferences.schema.js";
import { USERS_TABLE, UsersInterface } from "../../../db/schemas/users/users.schema.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { resolveSupportedTimezone } from "../../../utils/timezone.js";
import { addOneInTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { hashPassword, validateNewPassword, verifyPassword } from "../../../utils/authentication.js";
import { toPublicUser } from "../../../utils/users/users.utils.js";
import {
    GoalPace,
    isWeightGoalPace,
    MAX_CUSTOM_WEEKLY_PCT,
    paceWeeklyPct,
    requiredWeeklyPct,
    UNSAFE_GAIN_WEEKLY_PCT,
    UNSAFE_LOSS_WEEKLY_PCT,
    WEIGHT_GOAL_PRESETS,
    weeksToReachTarget,
} from "../../../utils/users/users.weightGoal.utils.js";
import { addDays, localDateString } from "../users.workout/users.workout.service.js";
import {
    CurrentBodyWeight,
    fetchCurrentBodyWeightRepository,
    fetchWeightGoalRepository,
    saveWeightGoalRepository,
    WeightGoalRow,
} from "./users.profile.repository.js";

const NAME_MAX_LENGTH = 100;

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
        select: ["timezone", "weight_units", "height_units", "height"],
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
        preferences: {
            timezone: preferences.timezone,
            weight_units: preferences.weight_units,
            height_units: preferences.height_units,
            height: preferences.height,
        },
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
const TARGET_WEIGHT_MIN = 20;
const TARGET_WEIGHT_MAX = 400;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const round2 = (value: number) => Math.round(value * 100) / 100;

const weeksBetween = (fromDate: string, toDate: string) =>
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / (7 * 86_400_000);

const todayForTimezone = async (timezone: string | undefined) =>
    localDateString(new Date(), (timezone && await resolveSupportedTimezone(timezone)) || "UTC");

const parseTargetWeight = (value: unknown): number => {
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < TARGET_WEIGHT_MIN || n > TARGET_WEIGHT_MAX) {
        throw new AppError(`Target weight must be a number between ${TARGET_WEIGHT_MIN} and ${TARGET_WEIGHT_MAX}`, 400);
    }
    return round2(n);
}

const requireCurrentWeight = (current: CurrentBodyWeight | null): CurrentBodyWeight => {
    if (!current) {
        throw new AppError("Log your body weight first — the goal is measured from it", 400);
    }
    return current;
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

const assertTargetMatchesDirection = (direction: "lose" | "gain", currentWeight: number, targetWeight: number) => {
    if (direction === "lose" && targetWeight >= currentWeight) {
        throw new AppError("For a cut, the target must be below your current weight", 400);
    }
    if (direction === "gain" && targetWeight <= currentWeight) {
        throw new AppError("For a bulk, the target must be above your current weight", 400);
    }
}

const suggestedGoalDate = (today: string, currentWeight: number, targetWeight: number, goalPace: GoalPace) => {
    const weeks = weeksToReachTarget({ currentWeight, targetWeight, weeklyPct: paceWeeklyPct(goalPace, currentWeight) });
    return { weeks, goal_date: addDays(today, weeks * 7) };
}

const toWeightGoalView = (row: WeightGoalRow, current: CurrentBodyWeight | null, today: string) => {
    const weeksLeft = row.goal_date ? Math.max(0, weeksBetween(today, row.goal_date)) : null;
    const required = current && row.target_weight != null && weeksLeft
        ? requiredWeeklyPct(current.weight, row.target_weight, weeksLeft)
        : null;
    const unsafe = required != null && (
        (required < 0 && -required > UNSAFE_LOSS_WEEKLY_PCT) ||
        (required > 0 && required > UNSAFE_GAIN_WEEKLY_PCT)
    );
    const sign = row.weight_goal === "lose" ? -1 : 1;
    const paceWeight = current?.weight ?? row.goal_start_weight;
    const pacePct = row.weight_goal_preset && row.weight_goal !== "maintain" && paceWeight
        ? sign * paceWeeklyPct({
            pace: row.weight_goal_preset,
            customPace: row.custom_weekly_pace,
            customUnit: row.custom_weekly_pace_unit,
        }, paceWeight)
        : null;
    return {
        goal: row.weight_goal,
        preset: row.weight_goal_preset,
        custom_pace: row.custom_weekly_pace,
        custom_pace_unit: row.custom_weekly_pace_unit,
        /** Signed pace the user chose, % of body weight per week at their current weight. */
        pace_weekly_pct: pacePct == null ? null : round2(pacePct),
        target_weight: row.target_weight,
        goal_date: row.goal_date,
        goal_date_source: row.goal_date_source,
        start_weight: row.goal_start_weight,
        set_on: row.goal_set_on,
        weeks_left: weeksLeft == null ? null : Math.round(weeksLeft * 10) / 10,
        /** Signed % of body weight per week still needed to hit the target by the date. */
        required_weekly_pct: required == null ? null : round2(required),
        /** The date needs a pace faster than any preset allows. */
        pace_warning: unsafe,
    };
}

export const getWeightGoalService = async ({ userId }: { userId: string }) => {
    const [row, current] = await Promise.all([
        fetchWeightGoalRepository(userId),
        fetchCurrentBodyWeightRepository(userId),
    ]);
    const today = await todayForTimezone(row?.timezone);
    return {
        goal: row?.weight_goal ? toWeightGoalView(row, current, today) : null,
        has_preferences: row !== null,
        weight_units: row?.weight_units ?? "kg",
        current_weight: current,
        presets: Object.values(WEIGHT_GOAL_PRESETS),
        max_custom_weekly_pct: MAX_CUSTOM_WEEKLY_PCT,
    };
}

/** The date the chosen pace would reach `targetWeight` by, from the user's current weight. */
export const suggestWeightGoalDateService = async ({
    userId,
    query,
}: {
    userId: string;
    query: { preset?: unknown; target_weight?: unknown; custom_pace?: unknown; custom_pace_unit?: unknown };
}) => {
    const targetWeight = parseTargetWeight(query.target_weight);
    const [row, rawCurrent] = await Promise.all([
        fetchWeightGoalRepository(userId),
        fetchCurrentBodyWeightRepository(userId),
    ]);
    const current = requireCurrentWeight(rawCurrent);
    const weightUnits = row?.weight_units ?? "kg";
    // The direction follows from the target; the pace must agree with it.
    const direction = targetWeight < current.weight ? "lose" : "gain";
    const goalPace = parseGoalPace({
        preset: query.preset,
        customPace: query.custom_pace,
        customUnit: query.custom_pace_unit,
        direction,
        currentWeight: current.weight,
        weightUnits,
    });
    assertTargetMatchesDirection(direction, current.weight, targetWeight);
    const today = await todayForTimezone(row?.timezone);
    const { weeks, goal_date } = suggestedGoalDate(today, current.weight, targetWeight, goalPace);
    const sign = direction === "lose" ? -1 : 1;
    return {
        preset: goalPace.pace,
        goal_date,
        weeks,
        current_weight: round2(current.weight),
        target_weight: targetWeight,
        weekly_change: round2(sign * current.weight * paceWeeklyPct(goalPace, current.weight) / 100),
        weekly_pct: round2(sign * paceWeeklyPct(goalPace, current.weight)),
        weight_units: weightUnits,
    };
}

/**
 * Saves the goal. A cut or bulk needs a pace (a preset, or "custom" with
 * `custom_pace` + `custom_pace_unit`) and a target; without `goal_date` the
 * pace's suggested date is used. "maintain" takes neither — it holds the
 * current weight.
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
    const current = await fetchCurrentBodyWeightRepository(userId);

    let saved: WeightGoalRow | null;
    if (goal === "maintain") {
        saved = await saveWeightGoalRepository(userId, {
            weight_goal: "maintain",
            weight_goal_preset: null,
            custom_weekly_pace: null,
            custom_weekly_pace_unit: null,
            target_weight: null,
            goal_date: null,
            goal_date_source: null,
            goal_start_weight: current ? round2(current.weight) : null,
            goal_set_on: today,
        });
    } else {
        const start = requireCurrentWeight(current);
        const goalPace = parseGoalPace({
            preset: data.preset,
            customPace: data.custom_pace,
            customUnit: data.custom_pace_unit,
            direction: goal,
            currentWeight: start.weight,
            weightUnits: row.weight_units,
        });
        const targetWeight = parseTargetWeight(data.target_weight);
        assertTargetMatchesDirection(goal, start.weight, targetWeight);
        const suggestion = suggestedGoalDate(today, start.weight, targetWeight, goalPace);

        let goalDate = suggestion.goal_date;
        let source: "suggested" | "user" = "suggested";
        if (data.goal_date != null && data.goal_date !== "") {
            if (typeof data.goal_date !== "string" || !ISO_DATE.test(data.goal_date) || Number.isNaN(Date.parse(data.goal_date))) {
                throw new AppError("Goal date must be a date like 2027-03-01", 400);
            }
            if (data.goal_date <= today) {
                throw new AppError("Goal date must be in the future", 400);
            }
            if (weeksBetween(today, data.goal_date) > GOAL_MAX_WEEKS) {
                throw new AppError("Goal date must be within 3 years", 400);
            }
            goalDate = data.goal_date;
            source = data.goal_date === suggestion.goal_date ? "suggested" : "user";
        }

        saved = await saveWeightGoalRepository(userId, {
            weight_goal: goal,
            weight_goal_preset: goalPace.pace,
            custom_weekly_pace: goalPace.customPace,
            custom_weekly_pace_unit: goalPace.customUnit,
            target_weight: targetWeight,
            goal_date: goalDate,
            goal_date_source: source,
            goal_start_weight: round2(start.weight),
            goal_set_on: today,
        });
    }
    if (!saved) {
        throw new AppError("Save your units and height in settings first", 400);
    }
    return { goal: toWeightGoalView(saved, current, today) };
}

export const clearWeightGoalService = async ({ userId }: { userId: string }) => {
    await saveWeightGoalRepository(userId, {
        weight_goal: null,
        weight_goal_preset: null,
        custom_weekly_pace: null,
        custom_weekly_pace_unit: null,
        target_weight: null,
        goal_date: null,
        goal_date_source: null,
        goal_start_weight: null,
        goal_set_on: null,
    });
}
