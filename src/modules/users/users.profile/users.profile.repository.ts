import { pg } from "../../../infrastructure/postgres/index.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { CustomPaceUnit, WeightGoal, WeightGoalPace } from "../../../db/schemas/users/userHealthPreferences.schema.js";
import { WeightGoalEndStatus } from "../../../utils/users/users.weightGoal.utils.js";

export interface CurrentBodyWeight {
    /** Mean of the weigh-ins in the 7 days up to the latest one — smooths day-to-day water swings. */
    weight: number;
    /** "YYYY-MM-DD" of the latest weigh-in. */
    as_of: string;
}

/** 7-day average up to the latest weigh-in on or before `onOrBefore` (any date when omitted). */
export const fetchCurrentBodyWeightRepository = async (userId: string, onOrBefore?: string): Promise<CurrentBodyWeight | null> => {
    const query = `
    WITH latest AS (
        SELECT MAX(date) AS d
        FROM user_weight_entries
        WHERE user_id = $1
            AND deleted_at IS NULL
            AND ($2::date IS NULL OR date <= $2::date)
    )
    SELECT
        AVG(uwe.weight) AS weight,
        to_char(latest.d, 'YYYY-MM-DD') AS as_of
    FROM user_weight_entries uwe, latest
    WHERE uwe.user_id = $1
        AND uwe.deleted_at IS NULL
        AND uwe.date > latest.d - 7
        AND uwe.date <= latest.d
    GROUP BY latest.d
    `;
    try {
        const result = await pg.query(query, [userId, onOrBefore ?? null]);
        const row = result.rows[0];
        if (!row || row.weight == null) return null;
        return { weight: Number(row.weight), as_of: row.as_of };
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch current body weight", 500);
    }
}

export type WeightGoalStatus = "active" | WeightGoalEndStatus;

export interface WeightGoalFields {
    weight_goal: WeightGoal;
    weight_goal_preset: WeightGoalPace | null;
    custom_weekly_pace: number | null;
    custom_weekly_pace_unit: CustomPaceUnit | null;
    target_weight: number | null;
    start_date: string;
    start_weight: number | null;
    goal_date: string | null;
    goal_date_source: "suggested" | "user" | null;
}

export interface WeightGoalEntry extends WeightGoalFields {
    id: string;
    status: WeightGoalStatus;
    end_date: string | null;
    end_weight: number | null;
    end_reason: string | null;
    end_note: string | null;
    created_at: Date;
}

/** The active goal (its fields all null when there is none) plus the preferences it's read with. */
export type WeightGoalRow = { [K in keyof WeightGoalEntry]: WeightGoalEntry[K] | null } & {
    weight_units: string;
    timezone: string;
};

// DATE columns go out as text so node-postgres never turns them into a JS
// Date anchored to the server's local timezone; DECIMALs go out as numbers.
const goalColumns = (alias: string) => `
    ${alias}.id,
    ${alias}.status,
    ${alias}.weight_goal,
    ${alias}.weight_goal_preset,
    ${alias}.custom_weekly_pace::float8 AS custom_weekly_pace,
    ${alias}.custom_weekly_pace_unit,
    ${alias}.target_weight::float8 AS target_weight,
    to_char(${alias}.start_date, 'YYYY-MM-DD') AS start_date,
    ${alias}.start_weight::float8 AS start_weight,
    to_char(${alias}.goal_date, 'YYYY-MM-DD') AS goal_date,
    ${alias}.goal_date_source,
    to_char(${alias}.end_date, 'YYYY-MM-DD') AS end_date,
    ${alias}.end_weight::float8 AS end_weight,
    ${alias}.end_reason,
    ${alias}.end_note,
    ${alias}.created_at
`;

/** `null` when the user has never saved health preferences (units and timezone live on that row). */
export const fetchWeightGoalRepository = async (userId: string): Promise<WeightGoalRow | null> => {
    const query = `
    SELECT ${goalColumns("g")}, hp.weight_units, hp.timezone
    FROM user_health_preferences hp
    LEFT JOIN user_weight_goals g
        ON g.user_id = hp.user_id
        AND g.status = 'active'
        AND g.deleted_at IS NULL
    WHERE hp.user_id = $1
        AND hp.deleted_at IS NULL
    LIMIT 1
    `;
    try {
        const result = await pg.query(query, [userId]);
        return (result.rows[0] as WeightGoalRow | undefined) ?? null;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch weight goal", 500);
    }
}

// Column order for the parameterised INSERT/UPDATE below.
const GOAL_FIELDS = [
    "weight_goal",
    "weight_goal_preset",
    "custom_weekly_pace",
    "custom_weekly_pace_unit",
    "target_weight",
    "start_date",
    "start_weight",
    "goal_date",
    "goal_date_source",
] as const satisfies readonly (keyof WeightGoalFields)[];

const castFor = (field: string) => field.endsWith("_date") ? "::date" : "";

/** Starts a new active goal. 409 if one is already active. */
export const insertWeightGoalRepository = async (userId: string, goal: WeightGoalFields): Promise<WeightGoalEntry> => {
    const query = `
    INSERT INTO user_weight_goals (user_id, ${GOAL_FIELDS.join(", ")})
    VALUES ($1, ${GOAL_FIELDS.map((f, i) => `$${i + 2}${castFor(f)}`).join(", ")})
    RETURNING ${goalColumns("user_weight_goals")}
    `;
    try {
        const result = await pg.query(query, [userId, ...GOAL_FIELDS.map((f) => goal[f])]);
        return result.rows[0] as WeightGoalEntry;
    } catch (error) {
        // Unique index uq_user_weight_goals_one_active: two saves raced.
        if ((error as { code?: string }).code === "23505") {
            throw new AppError("You already have an active goal", 409);
        }
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to save weight goal", 500);
    }
}

/** Overwrites the active goal's settings. `null` when it is no longer active. */
export const updateWeightGoalRepository = async (userId: string, goalId: string, goal: WeightGoalFields): Promise<WeightGoalEntry | null> => {
    const query = `
    UPDATE user_weight_goals
    SET ${GOAL_FIELDS.map((f, i) => `${f} = $${i + 3}${castFor(f)}`).join(", ")}
    WHERE id = $1
        AND user_id = $2
        AND status = 'active'
        AND deleted_at IS NULL
    RETURNING ${goalColumns("user_weight_goals")}
    `;
    try {
        const result = await pg.query(query, [goalId, userId, ...GOAL_FIELDS.map((f) => goal[f])]);
        return (result.rows[0] as WeightGoalEntry | undefined) ?? null;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to save weight goal", 500);
    }
}

/** Closes the active goal. `null` when it had already ended. */
export const endWeightGoalRepository = async (userId: string, goalId: string, end: {
    status: WeightGoalEndStatus,
    end_date: string,
    end_weight: number | null,
    end_reason: string | null,
    end_note: string | null,
}): Promise<WeightGoalEntry | null> => {
    const query = `
    UPDATE user_weight_goals
    SET status = $3,
        end_date = $4::date,
        end_weight = $5,
        end_reason = $6,
        end_note = $7
    WHERE id = $1
        AND user_id = $2
        AND status = 'active'
        AND deleted_at IS NULL
    RETURNING ${goalColumns("user_weight_goals")}
    `;
    try {
        const result = await pg.query(query, [goalId, userId, end.status, end.end_date, end.end_weight, end.end_reason, end.end_note]);
        return (result.rows[0] as WeightGoalEntry | undefined) ?? null;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to end weight goal", 500);
    }
}

/** Ended goals, most recent first. */
export const fetchWeightGoalHistoryRepository = async (userId: string, limit: number): Promise<WeightGoalEntry[]> => {
    const query = `
    SELECT ${goalColumns("g")}
    FROM user_weight_goals g
    WHERE g.user_id = $1
        AND g.status <> 'active'
        AND g.deleted_at IS NULL
    ORDER BY g.end_date DESC, g.created_at DESC
    LIMIT $2
    `;
    try {
        const result = await pg.query(query, [userId, limit]);
        return result.rows as WeightGoalEntry[];
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch weight goal history", 500);
    }
}
