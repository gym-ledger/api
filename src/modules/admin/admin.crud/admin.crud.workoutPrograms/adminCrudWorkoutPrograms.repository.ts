import { pg } from "../../../../infrastructure/postgres/index.js";
import { AppError } from "../../../../shared/errors/AppError.js";

/**
 * Number of users currently/previously selecting each given workout program
 * version (`user_program_assignments` rows, regardless of `is_active` — a
 * user "has added" the version whether or not it's their currently active
 * one). Selecting a plan gives the user their own copy of the version, so
 * this counts selections of copies made from each version (plus any legacy
 * selection pointing at the version directly). Returns a Map keyed by
 * version id so callers can look up 0 for versions with no assignments
 * without a sparse-row join.
 */
export const fetchWorkoutProgramVersionUsageCountsRepository = async (
    versionIds: string[],
): Promise<Map<string, number>> => {
    if (versionIds.length === 0) {
        return new Map();
    }
    const query = `
    SELECT
        COALESCE(wpv.source_workout_program_version_id, wpv.id) AS version_id,
        COUNT(*) AS usage_count
    FROM user_program_assignments upa
    INNER JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
    WHERE COALESCE(wpv.source_workout_program_version_id, wpv.id) = ANY($1::uuid[])
        AND upa.deleted_at IS NULL
        AND wpv.deleted_at IS NULL
    GROUP BY 1
    `;
    try {
        const result = await pg.query(query, [versionIds]);
        return new Map(
            result.rows.map((row) => [row.version_id as string, Number(row.usage_count)]),
        );
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch workout program version usage counts", 500);
    }
}
