import { pg } from "../../../infrastructure/postgres/index.js";
import { AppError } from "../../../shared/errors/AppError.js";

export interface MuscleSignalRow {
    id: string;
    name: string;
    slug: string;
    parent_muscle_id: string | null;
    body_region: string | null;
    display_order: number;
    xp_enabled: boolean;
    recovery_enabled: boolean;
    training_value: number | null;
    fatigue_value: number | null;
    last_computed_at: Date | null;
}

/**
 * Every muscle that participates in at least one of the two signals
 * (`xp_enabled` or `recovery_enabled`), left-joined with this user's raw
 * accumulator state. Muscles never trained by this user still come back with
 * `training_value`/`fatigue_value`/`last_computed_at` all null — the service
 * layer treats that as "0, decayed from right now."
 */
export const fetchMuscleSignalsForUserRepository = async (userId: string): Promise<MuscleSignalRow[]> => {
    const query = `
    SELECT
        m.id,
        m.name,
        m.slug,
        m.parent_muscle_id,
        m.body_region,
        m.display_order,
        m.xp_enabled,
        m.recovery_enabled,
        ums.training_value,
        ums.fatigue_value,
        ums.last_computed_at
    FROM muscles m
    LEFT JOIN user_muscle_signals ums
        ON ums.muscle_id = m.id
        AND ums.user_id = $1
        AND ums.deleted_at IS NULL
    WHERE m.deleted_at IS NULL
        AND (m.xp_enabled = TRUE OR m.recovery_enabled = TRUE)
    ORDER BY m.display_order ASC, m.name ASC
    `;
    try {
        const result = await pg.query(query, [userId]);
        return result.rows.map((row) => ({
            ...row,
            training_value: row.training_value == null ? null : Number(row.training_value),
            fatigue_value: row.fatigue_value == null ? null : Number(row.fatigue_value),
        })) as MuscleSignalRow[];
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch muscle signals", 500);
    }
}
