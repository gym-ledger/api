import { CustomPaceUnit, WeightGoal, WeightGoalPace, WeightGoalPreset } from "../../db/schemas/users/userHealthPreferences.schema.js";

// See algorithms/weekly-checkin.md §5 for where these rates come from. Rates
// are % of body weight per week — a fixed kg/lbs figure would be far too
// fast for a light lifter and too slow for a heavy one.
export interface WeightGoalPresetConfig {
    key: WeightGoalPreset;
    label: string;
    direction: Exclude<WeightGoal, "maintain">;
    /** Signed target pace, % of body weight per week. */
    weekly_pct: number;
    /** Unsigned band that still counts as "on pace", % of body weight per week. */
    min_weekly_pct: number;
    max_weekly_pct: number;
    /** Rough daily calorie difference from maintenance that produces this pace. */
    daily_kcal: string;
    description: string;
}

export const WEIGHT_GOAL_PRESETS: Record<WeightGoalPreset, WeightGoalPresetConfig> = {
    mild_cut: {
        key: "mild_cut",
        label: "Mild cut",
        direction: "lose",
        weekly_pct: -0.5,
        min_weekly_pct: 0.25,
        max_weekly_pct: 0.75,
        daily_kcal: "300–500 kcal below maintenance",
        description: "Slow, sustainable fat loss that keeps strength and muscle.",
    },
    extreme_cut: {
        key: "extreme_cut",
        label: "Extreme cut",
        direction: "lose",
        weekly_pct: -1.0,
        min_weekly_pct: 0.75,
        max_weekly_pct: 1.25,
        daily_kcal: "750–1000 kcal below maintenance",
        description: "Fast loss for a short phase. Higher risk of losing muscle and strength.",
    },
    clean_bulk: {
        key: "clean_bulk",
        label: "Clean bulk",
        direction: "gain",
        weekly_pct: 0.25,
        min_weekly_pct: 0.1,
        max_weekly_pct: 0.5,
        daily_kcal: "200–350 kcal above maintenance",
        description: "Slow gain that is mostly muscle, with little extra fat.",
    },
    dirty_bulk: {
        key: "dirty_bulk",
        label: "Dirty bulk",
        direction: "gain",
        weekly_pct: 0.75,
        min_weekly_pct: 0.5,
        max_weekly_pct: 1.0,
        daily_kcal: "500–1000 kcal above maintenance",
        description: "Fast gain. More of it is fat, which a later cut has to remove.",
    },
};

/** Weight within this % of body weight per week counts as holding steady. */
export const MAINTAIN_BAND_WEEKLY_PCT = 0.25;

/** Faster than this (either direction) is flagged whatever the goal says. */
export const UNSAFE_LOSS_WEEKLY_PCT = 1.5;
export const UNSAFE_GAIN_WEEKLY_PCT = 1.0;

/** A custom pace can't be set faster than this, % of body weight per week. */
export const MAX_CUSTOM_WEEKLY_PCT = 2;

export const isWeightGoalPreset = (value: unknown): value is WeightGoalPreset =>
    typeof value === "string" && value in WEIGHT_GOAL_PRESETS;

export const isWeightGoalPace = (value: unknown): value is WeightGoalPace =>
    value === "custom" || isWeightGoalPreset(value);

export interface GoalPace {
    pace: WeightGoalPace;
    /** Only for "custom": unsigned, in `customUnit` per week. */
    customPace: number | null;
    customUnit: CustomPaceUnit | null;
}

/**
 * Unsigned weekly pace as % of body weight. A custom pace given in weight
 * units is converted at `currentWeight`, so "0.5 kg a week" stays 0.5 kg a
 * week as the user's weight changes.
 */
export const paceWeeklyPct = (goalPace: GoalPace, currentWeight: number): number => {
    if (goalPace.pace !== "custom") {
        return Math.abs(WEIGHT_GOAL_PRESETS[goalPace.pace].weekly_pct);
    }
    const value = goalPace.customPace ?? 0;
    return goalPace.customUnit === "weight" ? (value / currentWeight) * 100 : value;
}

/**
 * Whole weeks needed to go from `currentWeight` to `targetWeight` at
 * `weeklyPct` (unsigned, % of body weight). The pace is taken off the
 * current weight and held flat — simple, and the difference from
 * compounding is under a week for any realistic goal.
 */
export const weeksToReachTarget = (params: {
    currentWeight: number,
    targetWeight: number,
    weeklyPct: number,
}): number => {
    const { currentWeight, targetWeight, weeklyPct } = params;
    const perWeek = currentWeight * weeklyPct / 100;
    if (perWeek <= 0) return 1;
    return Math.max(1, Math.ceil(Math.abs(targetWeight - currentWeight) / perWeek));
}

/** Signed % of body weight per week needed to hit `targetWeight` in `weeks`. */
export const requiredWeeklyPct = (currentWeight: number, targetWeight: number, weeks: number): number =>
    weeks <= 0 ? 0 : ((targetWeight - currentWeight) / currentWeight) * 100 / weeks;

export type WeightPaceStatus =
    | "no_goal"
    | "not_enough_data"
    | "goal_reached"
    | "on_track"
    | "behind"
    | "too_fast"
    | "wrong_direction"
    | "drifting_up"
    | "drifting_down";

/**
 * Judges the measured weekly trend against the goal. The pace to beat is
 * what the goal date needs, if there is one, else the preset's pace.
 */
export const assessWeightPace = (params: {
    goal: WeightGoal | null,
    preset: WeightGoalPace | null,
    actualWeeklyPct: number | null,
    targetWeeklyPct: number | null,
    currentWeight: number | null,
    targetWeight: number | null,
}): WeightPaceStatus => {
    const { goal, preset, actualWeeklyPct, targetWeeklyPct, currentWeight, targetWeight } = params;
    if (!goal) return "no_goal";
    if (actualWeeklyPct == null) return "not_enough_data";

    if (goal === "maintain") {
        if (actualWeeklyPct > MAINTAIN_BAND_WEEKLY_PCT) return "drifting_up";
        if (actualWeeklyPct < -MAINTAIN_BAND_WEEKLY_PCT) return "drifting_down";
        return "on_track";
    }

    const sign = goal === "lose" ? -1 : 1;
    if (currentWeight != null && targetWeight != null && sign * (currentWeight - targetWeight) >= 0) {
        return "goal_reached";
    }

    const actual = sign * actualWeeklyPct; // positive = moving toward the goal
    // A custom pace has no band of its own; it's judged against ±50% of itself.
    const config = isWeightGoalPreset(preset) ? WEIGHT_GOAL_PRESETS[preset] : null;
    const target = Math.abs(targetWeeklyPct ?? config?.weekly_pct ?? 0);
    const unsafe = goal === "lose" ? UNSAFE_LOSS_WEEKLY_PCT : UNSAFE_GAIN_WEEKLY_PCT;

    if (actual < -MAINTAIN_BAND_WEEKLY_PCT / 2) return "wrong_direction";
    if (actual > unsafe) return "too_fast";
    const upper = Math.max(config?.max_weekly_pct ?? 0, target * 1.5);
    if (target > 0 && actual > upper) return "too_fast";
    const lower = Math.min(config?.min_weekly_pct ?? Infinity, target * 0.5);
    if (actual < lower) return "behind";
    return "on_track";
}

/**
 * Least-squares slope of weight over time, in weight units per week. Needs
 * at least 4 weigh-ins spread over 10+ days, or day-to-day water swings
 * swamp the trend.
 */
export const weeklyWeightSlope = (entries: { date: string, weight: number }[]): number | null => {
    if (entries.length < 4) return null;
    const days = entries.map((e) => Date.parse(`${e.date}T00:00:00Z`) / 86_400_000);
    const span = Math.max(...days) - Math.min(...days);
    if (span < 10) return null;
    const meanX = days.reduce((s, x) => s + x, 0) / days.length;
    const meanY = entries.reduce((s, e) => s + e.weight, 0) / entries.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < entries.length; i++) {
        num += (days[i] - meanX) * (entries[i].weight - meanY);
        den += (days[i] - meanX) ** 2;
    }
    return den === 0 ? null : (num / den) * 7;
}
