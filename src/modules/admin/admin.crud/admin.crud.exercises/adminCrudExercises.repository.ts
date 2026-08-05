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
    // output {...exercise, exerciseMuscles: [{muscle: {...}, contribution: number}]}
    const query = `
    SELECT e.*, em.*, m.*
    FROM exercises e
    INNER JOIN exercise_muscles em ON em.exercise_id = e.id
    INNER JOIN muscles m on m.id = em.muscle_id
    WHERE e.id = $1
    `;
    try {
        const result = await pg.query(query, [exerciseId]);

        return result.rows as { exercise: ExercisesInterface, exerciseMuscles: { muscle: MusclesInterface, contribution: number }[] }[];
    } catch (error) {
        console.log(query);
        console.log(exerciseId);
        console.log(error);
        throw new AppError("Failed to fetch exercise muscles from exercise id", 500);
    }
}