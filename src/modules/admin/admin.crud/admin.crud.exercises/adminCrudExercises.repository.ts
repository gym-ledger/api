import { ExercisesInterface } from "../../../../db/schemas/exercises/exercises.schema.js";
import { EXERCISE_MUSCLES_TABLE, ExerciseMusclesInterface } from "../../../../db/schemas/muscles/exerciseMuscles.schema.js";
import { MUSCLES_TABLE, MusclesInterface } from "../../../../db/schemas/muscles/muscles.schema.js";
import { pg } from "../../../../infrastructure/postgres/index.js";
import { AppError } from "../../../../shared/errors/AppError.js";
import { isValidUUID } from "../../../../utils/validation.js";

export const fetchExerciseWithMusclesByIdRepository = async (exerciseId: string) => {
    if (!exerciseId) {
        throw new AppError("Exercise id is required", 400);
    }

    if (!isValidUUID(exerciseId)) {
        throw new AppError("Invalid exercise id", 400);
    }

    const exerciseQuery = `
    SELECT *
    FROM exercises
    WHERE id = $1 AND deleted_at IS NULL
    `;
    const musclesQuery = `
    SELECT em.id AS exercise_muscle_id, em.contribution, m.*
    FROM exercise_muscles em
    INNER JOIN muscles m ON m.id = em.muscle_id AND m.deleted_at IS NULL
    WHERE em.exercise_id = $1 AND em.deleted_at IS NULL
    ORDER BY em.contribution DESC
    `;
    try {
        const [exerciseResult, musclesResult] = await Promise.all([
            pg.query(exerciseQuery, [exerciseId]),
            pg.query(musclesQuery, [exerciseId]),
        ]);

        const exercise = exerciseResult.rows[0] as ExercisesInterface | undefined;
        if (!exercise) {
            throw new AppError("Exercise not found", 404);
        }

        const exerciseMuscles = musclesResult.rows.map((row) => {
            const { exercise_muscle_id, contribution, ...muscle } = row;
            return {
                id: exercise_muscle_id as string,
                contribution: Number(contribution),
                muscle: muscle as MusclesInterface,
            };
        });

        return {
            exercise,
            exerciseMuscles,
        } as {
            exercise: ExercisesInterface;
            exerciseMuscles: { id: string, muscle: MusclesInterface, contribution: number }[];
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        // console.log(exerciseQuery, musclesQuery);
        // console.log(exerciseId);
        // console.log(error);
        throw new AppError("Failed to fetch exercise muscles from exercise id", 500);
    }
}

/**
 * Exports exercises with their linked muscles flattened into a single
 * "slug:contribution,slug:contribution" string under `exerciseMuscles`,
 * matching the format `importExercisesForAdminService` expects back on
 * re-import.
 */
export const fetchExercisesForExportRepository = async () => {
    const query = `
    SELECT
        e.*,
        COALESCE(
            string_agg(m.slug || ':' || em.contribution, ',' ORDER BY m.slug),
            ''
        ) AS "exerciseMuscles"
    FROM exercises e
    LEFT JOIN exercise_muscles em
        ON em.exercise_id = e.id AND em.deleted_at IS NULL
    LEFT JOIN muscles m
        ON m.id = em.muscle_id AND m.deleted_at IS NULL
    WHERE e.deleted_at IS NULL
    GROUP BY e.id
    ORDER BY e.name ASC
    `;
    try {
        const result = await pg.query(query);
        return result.rows as (ExercisesInterface & { exerciseMuscles: string })[];
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to export exercises", 500);
    }
}