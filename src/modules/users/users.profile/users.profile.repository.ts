import { pg } from "../../../infrastructure/postgres/index.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { CustomPaceUnit, WeightGoal, WeightGoalPace } from "../../../db/schemas/users/userHealthPreferences.schema.js";

export interface CurrentBodyWeight {
    /** Mean of the weigh-ins in the 7 days up to the latest one — smooths day-to-day water swings. */
    weight: number;
    /** "YYYY-MM-DD" of the latest weigh-in. */
    as_of: string;
}

export const fetchCurrentBodyWeightRepository = async (userId: string): Promise<CurrentBodyWeight | null> => {
    const query = `
    WITH latest AS (
        SELECT MAX(date) AS d
        FROM user_weight_entries
        WHERE user_id = $1
            AND deleted_at IS NULL
    )
    SELECT
        AVG(uwe.weight) AS weight,
        to_char(latest.d, 'YYYY-MM-DD') AS as_of
    FROM user_weight_entries uwe, latest
    WHERE uwe.user_id = $1
        AND uwe.deleted_at IS NULL
        AND uwe.date > latest.d - 7
    GROUP BY latest.d
    `;
    try {
        const result = await pg.query(query, [userId]);
        const row = result.rows[0];
        if (!row || row.weight == null) return null;
        return { weight: Number(row.weight), as_of: row.as_of };
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch current body weight", 500);
    }
}

export interface WeightGoalRow {
    weight_goal: WeightGoal | null;
    weight_goal_preset: WeightGoalPace | null;
    custom_weekly_pace: number | null;
    custom_weekly_pace_unit: CustomPaceUnit | null;
    target_weight: number | null;
    goal_date: string | null;
    goal_date_source: "suggested" | "user" | null;
    goal_start_weight: number | null;
    goal_set_on: string | null;
    weight_units: string;
    timezone: string;
}

// DATE columns go out as text so node-postgres never turns them into a JS
// Date anchored to the server's local timezone.
const GOAL_COLUMNS = `
    weight_goal,
    weight_goal_preset,
    custom_weekly_pace,
    custom_weekly_pace_unit,
    target_weight,
    to_char(goal_date, 'YYYY-MM-DD') AS goal_date,
    goal_date_source,
    goal_start_weight,
    to_char(goal_set_on, 'YYYY-MM-DD') AS goal_set_on,
    weight_units,
    timezone
`;

/** `null` when the user has never saved health preferences (the goal lives on that row). */
export const fetchWeightGoalRepository = async (userId: string): Promise<WeightGoalRow | null> => {
    const query = `
    SELECT ${GOAL_COLUMNS}
    FROM user_health_preferences
    WHERE user_id = $1
        AND deleted_at IS NULL
    LIMIT 1
    `;
    try {
        const result = await pg.query(query, [userId]);
        return (result.rows[0] as WeightGoalRow | undefined) ?? null;
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch weight goal", 500);
    }
}

/** Overwrites every goal column at once; pass nulls to clear the goal. */
export const saveWeightGoalRepository = async (userId: string, goal: {
    weight_goal: WeightGoal | null,
    weight_goal_preset: WeightGoalPace | null,
    custom_weekly_pace: number | null,
    custom_weekly_pace_unit: CustomPaceUnit | null,
    target_weight: number | null,
    goal_date: string | null,
    goal_date_source: "suggested" | "user" | null,
    goal_start_weight: number | null,
    goal_set_on: string | null,
}): Promise<WeightGoalRow | null> => {
    const query = `
    UPDATE user_health_preferences
    SET weight_goal = $2,
        weight_goal_preset = $3,
        target_weight = $4,
        goal_date = $5::date,
        goal_date_source = $6,
        goal_start_weight = $7,
        goal_set_on = $8::date,
        custom_weekly_pace = $9,
        custom_weekly_pace_unit = $10
    WHERE user_id = $1
        AND deleted_at IS NULL
    RETURNING ${GOAL_COLUMNS}
    `;
    try {
        const result = await pg.query(query, [
            userId,
            goal.weight_goal,
            goal.weight_goal_preset,
            goal.target_weight,
            goal.goal_date,
            goal.goal_date_source,
            goal.goal_start_weight,
            goal.goal_set_on,
            goal.custom_weekly_pace,
            goal.custom_weekly_pace_unit,
        ]);
        return (result.rows[0] as WeightGoalRow | undefined) ?? null;
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to save weight goal", 500);
    }
}
