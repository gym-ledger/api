import { pg } from "../../../../infrastructure/postgres/index.js";
import { AppError } from "../../../../shared/errors/AppError.js";

/**
 * Number of users currently/previously selecting each given workout program
 * version (`user_program_assignments` rows, regardless of `is_active` — a
 * user "has added" the version whether or not it's their currently active
 * one). Returns a Map keyed by version id so callers can look up 0 for
 * versions with no assignments without a sparse-row join.
 */
export const fetchWorkoutProgramVersionUsageCountsRepository = async (
    versionIds: string[],
): Promise<Map<string, number>> => {
    if (versionIds.length === 0) {
        return new Map();
    }
    const query = `
    SELECT workout_program_version_id, COUNT(*) AS usage_count
    FROM user_program_assignments
    WHERE workout_program_version_id = ANY($1::uuid[])
        AND deleted_at IS NULL
    GROUP BY workout_program_version_id
    `;
    try {
        const result = await pg.query(query, [versionIds]);
        return new Map(
            result.rows.map((row) => [row.workout_program_version_id as string, Number(row.usage_count)]),
        );
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch workout program version usage counts", 500);
    }
}
