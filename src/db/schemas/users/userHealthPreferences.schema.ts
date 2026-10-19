export const USER_HEALTH_PREFERENCES_TABLE = "user_health_preferences";

export type WeightGoal = "lose" | "maintain" | "gain";

export type WeightGoalPreset = "mild_cut" | "extreme_cut" | "clean_bulk" | "dirty_bulk";

/** A preset, or "custom" for a pace the user typed in (`custom_weekly_pace`). */
export type WeightGoalPace = WeightGoalPreset | "custom";

export type CustomPaceUnit = "pct" | "weight";

export const TRAINING_GOALS = ["build_muscle", "get_stronger", "lose_fat", "general_fitness"] as const;
export type TrainingGoal = typeof TRAINING_GOALS[number];

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ExperienceLevel = typeof EXPERIENCE_LEVELS[number];

export const EQUIPMENT_OPTIONS = ["full_gym", "home_dumbbells", "bodyweight"] as const;
export type Equipment = typeof EQUIPMENT_OPTIONS[number];

export interface UserHealthPreferencesInterface {
    id: string;

    user_id: string;

    timezone: string;

    weight_units: string;

    height_units: string;

    height: number;

    weight_goal: WeightGoal | null;

    weight_goal_preset: WeightGoalPace | null;

    /** Unsigned; % of body weight or weight units per week, per `custom_weekly_pace_unit`. */
    custom_weekly_pace: number | null;

    custom_weekly_pace_unit: CustomPaceUnit | null;

    target_weight: number | null;

    goal_date: string | null;

    goal_date_source: "suggested" | "user" | null;

    goal_start_weight: number | null;

    goal_set_on: string | null;

    training_goal: TrainingGoal | null;

    experience_level: ExperienceLevel | null;

    training_days_per_week: number | null;

    equipment: Equipment | null;

    deleted_at: Date;

    updated_at: Date;
}
