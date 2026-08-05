import { AppError } from "../../../../shared/errors/AppError.js";
import { addOneInTable, deleteManyInTable, deleteOneFromTable, fetchManyFromTable, fetchOneFromTable, fetchPaginatedResultsFromTable, updateOneInTable } from "../../../index/index.repository.js";
import { ADMIN_USER_TABLE, AdminUserInterface } from "../../../../db/schemas/admin/admin.schema.js";
import { generateAdminAccessToken, generateRefreshToken, hashPassword, verifyPassword } from "../../../../utils/authentication.js";
import { hashToken } from "../../../../utils/crypto.js";
import { WORKOUT_PROGRAMS_TABLE, WorkoutProgramsInterface } from "../../../../db/schemas/workoutPrograms/workoutPrograms.schema.js";
import { fetchWorkoutProgramWithVersionsService } from "../adminCrud.repository.js";
import { isValidUUID } from "../../../../utils/validation.js";
import { EXERCISES_TABLE, ExercisesInterface } from "../../../../db/schemas/exercises/exercises.schema.js";
import slugify from "slugify";
import { ProgramDaysInterface } from "../../../../db/schemas/workoutPrograms/programDays.schema.js";
import { parseCsv } from "../../../../utils/csv.js";
import { FetchPaginatedResultsFromTableParams } from "../../../index/index.repository.js";
import { EXERCISE_MUSCLES_TABLE, ExerciseMusclesInterface } from "../../../../db/schemas/muscles/exerciseMuscles.schema.js";
import { fetchExerciseWithMusclesByIdRepository } from "./adminCrudExercises.repository.js";
import { MUSCLES_TABLE, MusclesInterface } from "../../../../db/schemas/muscles/muscles.schema.js";

// exercises
export const listExercisesForAdminService = async (data: { page?: number, limit?: number, search?: string, createdBy?: string }) => {
    const { page = 1, limit = 10, search = "", createdBy = "admin_user" } = data;
    const filter = {
        // search: search,
        // createdBy: createdBy,
    };
    const exercises = await fetchPaginatedResultsFromTable({
        table: "exercises",

        where: [
            {
                operator: "FTS",
                value: search,
            },
        ],

        limit,
        page,
    }) as {
        data: ExercisesInterface[];
        meta: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
        };
    };
    return exercises;
}

export const viewExerciseForAdminService = async (data: { id: string }) => {
    const { id } = data;

    if (!id) {
        throw new AppError("Exercise id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid exercise id", 400);
    }

    const exercise = await fetchExerciseWithMusclesByIdRepository(id);

    return exercise;
}

export const createExerciseForAdminService = async (data: {
    name: string,
    description: string,
    added_by_admin_user_id: string,
    visibility?: string,
    exerciseMuscles?: string,
    file?: Express.Multer.File
}) => {
    const { name, description, added_by_admin_user_id, visibility = "public", exerciseMuscles } = data;

    let parsedExerciseMuscles: { muscle_id: string, contribution: number }[] = [];
    if (exerciseMuscles) {
        parsedExerciseMuscles = JSON.parse(exerciseMuscles);
    }
    if (!name) {
        throw new AppError("Name is required", 400);
    }
    const slug = slugify(name, { lower: true, strict: true });
    if (!slug) {
        throw new AppError("Failed to generate slug. Choose a different name.", 400);
    }

    const duplicateBySlug = await fetchOneFromTable({
        table: EXERCISES_TABLE,
        where: [{
            field: "slug",
            operator: "=",
            value: slug,
        }],
    }) as ExercisesInterface;
    if (duplicateBySlug) {
        throw new AppError("Exercise with this slug already exists", 400);
    }

    const exercise = await addOneInTable({
        table: EXERCISES_TABLE,
        data: { name, slug, description, added_by_admin_user_id, visibility, added_by_user_id: null },
    }) as ExercisesInterface;

    await Promise.all(parsedExerciseMuscles.map(async (exerciseMuscle) => {
        if (!exerciseMuscle.muscle_id) {
            throw new AppError("Muscle id is required", 400);
        }
        if (!exerciseMuscle.contribution) {
            throw new AppError("Contribution is required", 400);
        }
        if (exerciseMuscle.contribution <= 0 || exerciseMuscle.contribution > 1) {
            throw new AppError("Contribution must be between 0 and 1", 400);
        }
        if (!isValidUUID(exerciseMuscle.muscle_id)) {
            throw new AppError("Invalid muscle id", 400);
        }
        const muscle = await fetchOneFromTable({
            table: MUSCLES_TABLE,
            where: [{
                field: "id",
                operator: "=",
                value: exerciseMuscle.muscle_id,
            }],
        }) as MusclesInterface;
        if (!muscle) {
            throw new AppError("Muscle not found", 404);
        }
        await addOneInTable({
            table: EXERCISE_MUSCLES_TABLE,
            data: { exercise_id: exercise.id, muscle_id: exerciseMuscle.muscle_id, contribution: exerciseMuscle.contribution },
        });
    }));
    return exercise;
}

export const updateExerciseForAdminService = async (data: {
    id: string,
    name: string,
    description: string,
    added_by_admin_user_id: string,
    visibility?: string,
    exerciseMuscles?: string,
    file?: Express.Multer.File
}) => {
    const { id, name, description, added_by_admin_user_id, visibility = "public", exerciseMuscles } = data;

    let parsedExerciseMuscles: { muscle_id: string, contribution: number }[] = [];
    if (exerciseMuscles) {
        parsedExerciseMuscles = JSON.parse(exerciseMuscles);
    }

    if (!id) {
        throw new AppError("Exercise id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid exercise id", 400);
    }

    const exercise = await fetchOneFromTable({
        table: EXERCISES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    }) as ExercisesInterface;
    if (!exercise) {
        throw new AppError("Exercise not found", 404);
    }
    const toUpdate: Partial<ExercisesInterface> = {};
    if (name) {
        const slug = slugify(name, { lower: true, strict: true });
        if (!slug) {
            throw new AppError("Failed to generate slug. Choose a different name.", 400);
        }
        const otherDuplicateBySlug = await fetchOneFromTable({
            table: EXERCISES_TABLE,
            where: [{
                field: "slug",
                operator: "=",
                value: slug,
            }, {
                field: "id",
                operator: "!=",
                value: id,
            }],
        }) as ExercisesInterface;
        if (otherDuplicateBySlug) {
            throw new AppError("Exercise with this slug already exists", 400);
        }
        toUpdate.slug = slug;
        toUpdate.name = name;
    }
    if (description) {
        toUpdate.description = description;
    }
    if (visibility) {
        toUpdate.visibility = visibility;
    }

    const updatedExercise = await updateOneInTable({
        table: EXERCISES_TABLE,
        data: toUpdate,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    }) as ExercisesInterface;


    await Promise.all(parsedExerciseMuscles.map(async (exerciseMuscle) => {
        if (!exerciseMuscle.muscle_id) {
            throw new AppError("Muscle id is required", 400);
        }
        if (!exerciseMuscle.contribution) {
            throw new AppError("Contribution is required", 400);
        }
        if (exerciseMuscle.contribution <= 0 || exerciseMuscle.contribution > 1) {
            throw new AppError("Contribution must be between 0 and 1", 400);
        }
        if (!isValidUUID(exerciseMuscle.muscle_id)) {
            throw new AppError("Invalid muscle id", 400);
        }
        const muscle = await fetchOneFromTable({
            table: MUSCLES_TABLE,
            where: [{
                field: "id",
                operator: "=",
                value: exerciseMuscle.muscle_id,
            }],
        }) as MusclesInterface;
        if (!muscle) {
            throw new AppError("Muscle not found", 404);
        }
        const exists = await fetchOneFromTable({
            table: EXERCISE_MUSCLES_TABLE,
            where: [{
                field: "exercise_id",
                operator: "=",
                value: exercise.id,
            }, {
                field: "muscle_id",
                operator: "=",
                value: exerciseMuscle.muscle_id,
            }],
        }) as ExerciseMusclesInterface;
        if (exists) {
            await updateOneInTable({
                table: EXERCISE_MUSCLES_TABLE,
                data: { contribution: exerciseMuscle.contribution },
                where: [{
                    field: "id",
                    operator: "=",
                    value: exists.id,
                }],
            });
        } else {
            await addOneInTable({
                table: EXERCISE_MUSCLES_TABLE,
                data: { exercise_id: exercise.id, muscle_id: exerciseMuscle.muscle_id, contribution: exerciseMuscle.contribution },
            });
        }
    }));

    return updatedExercise;
}
export const deleteExerciseForAdminService = async (data: { id: string }) => {
    const { id } = data;

    if (!id) {
        throw new AppError("Exercise id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid exercise id", 400);
    }

    const exercise = await fetchOneFromTable({
        table: EXERCISES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    }) as ExercisesInterface;
    if (!exercise) {
        throw new AppError("Exercise not found", 404);
    }
    await deleteManyInTable({
        table: EXERCISE_MUSCLES_TABLE,
        where: [{
            field: "exercise_id",
            operator: "=",
            value: id,
        }],
    });
    await deleteOneFromTable({
        table: EXERCISES_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: id,
        }],
    });
    return exercise;
}

export const importExercisesForAdminService = async (data: { file: Express.Multer.File }, added_by_admin_user_id: string) => {
    const { file } = data;

    if (!file) {
        throw new AppError("File is required", 400);
    }
    const errors: {
        row: number;
        message: string;
    }[] = [];
    const success = [];
    const exercises = await parseCsv({
        buffer: file.buffer, mapRow: (row) => {
            return {
                id: row.id || null,
                name: row.name,
                description: row.description,
                visibility: row.visibility || 'public' as 'public' | 'private',
                exerciseMuscles: row.exerciseMuscles || '',
            };
        }
    }) as {
        id: string | null;
        name: string;
        description: string;
        visibility: 'public' | 'private';
        exerciseMuscles: string | null;
    }[];
    const exercisesToMap: { exercise: ExercisesInterface, exerciseMuscles: { muscleSlug: string, contribution: number }[] }[] = [];
    await Promise.all(exercises.map(async (exercise) => {
        try {
            let savedExercise: ExercisesInterface | null = null;
            if (exercise.id) {
                savedExercise = await updateExerciseForAdminService({
                    id: exercise.id,
                    name: exercise.name,
                    description: exercise.description,
                    added_by_admin_user_id: added_by_admin_user_id,
                    visibility: exercise.visibility,
                });
            } else {
                savedExercise = await createExerciseForAdminService({
                    name: exercise.name,
                    description: exercise.description,
                    added_by_admin_user_id: added_by_admin_user_id,
                    visibility: exercise.visibility,
                });
            }
            let parsedExercieMuscles: { muscleSlug: string, contribution: number }[] = [];
            const _muscles = exercise.exerciseMuscles ? exercise.exerciseMuscles?.split(',') : [];
            for (const muscle of _muscles) {
                const [muscleSlug, contribution] = muscle.split(':');
                parsedExercieMuscles.push({ muscleSlug, contribution: parseFloat(contribution) });
            }
            if (parsedExercieMuscles.length > 0) {
                exercisesToMap.push({ exercise: savedExercise, exerciseMuscles: parsedExercieMuscles });
            }
        } catch (error: any) {
            errors.push({
                row: exercise.id ? exercises.indexOf(exercise) + 1 : exercises.length + 1,
                message: error instanceof AppError ? error.message : "Unknown error",
            });
        }
    }));
    await Promise.all(exercisesToMap.map(async (exerciseData) => {
        const { exercise, exerciseMuscles } = exerciseData;
        await Promise.all(exerciseMuscles.map(async (exerciseMuscle) => {
            const { muscleSlug, contribution } = exerciseMuscle;
            const muscle = await fetchOneFromTable({
                table: MUSCLES_TABLE,
                where: [{
                    field: "slug",
                    operator: "=",
                    value: muscleSlug,
                }],
            }) as MusclesInterface;
            if (!muscle) {
                throw new AppError("Muscle not found: " + muscleSlug, 404);
            }
            await addOneInTable({
                table: EXERCISE_MUSCLES_TABLE,
                data: { exercise_id: exercise.id, muscle_id: muscle.id, contribution: contribution },
            });
        }));
    }));

    const toAddRaw = [];
    const toUpdate = [];
    return { errors, success: exercises };
}

export const exportExercisesForAdminService = async () => {
    const exercises = await fetchManyFromTable({
        table: EXERCISES_TABLE,
        where: [],
    }) as ExercisesInterface[];
    const dataToSend = [];
    // for (const exercise of exercises) {
    //     dataToSend.push({
    //         id: exercise.id,
    //         name: exercise.name,
    //         description: exercise.description,
    //         visibility: exercise.visibility,
    //     });
    // }
    return exercises;
}
