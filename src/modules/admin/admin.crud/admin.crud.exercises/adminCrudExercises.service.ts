import { IMPORT_CONCURRENCY, mapWithConcurrency } from "../../../../utils/concurrency.js";
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
import { fetchExerciseWithMusclesByIdRepository, fetchExercisesForExportRepository } from "./adminCrudExercises.repository.js";
import { MUSCLES_TABLE, MusclesInterface } from "../../../../db/schemas/muscles/muscles.schema.js";
import { deleteStoredImage, storeExerciseImage } from "../../../../infrastructure/storage/index.js";

const parseAndValidateExerciseMuscles = (exerciseMuscles: string): { muscle_id: string, contribution: number }[] => {
    let parsed: { muscle_id: string, contribution: number }[];
    try {
        parsed = JSON.parse(exerciseMuscles);
    } catch {
        throw new AppError("exerciseMuscles must be valid JSON", 400);
    }
    if (!Array.isArray(parsed)) {
        throw new AppError("exerciseMuscles must be an array", 400);
    }
    const seen = new Set<string>();
    for (const entry of parsed) {
        if (!entry.muscle_id) {
            throw new AppError("Muscle id is required", 400);
        }
        if (!isValidUUID(entry.muscle_id)) {
            throw new AppError("Invalid muscle id", 400);
        }
        if (!entry.contribution) {
            throw new AppError("Contribution is required", 400);
        }
        if (entry.contribution <= 0 || entry.contribution > 1) {
            throw new AppError("Contribution must be between 0 and 1", 400);
        }
        if (seen.has(entry.muscle_id)) {
            throw new AppError("Duplicate muscle selected", 400);
        }
        seen.add(entry.muscle_id);
    }
    return parsed;
}

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

        extraSelects: [`(
            SELECT COUNT(*)
            FROM exercise_muscles em
            WHERE em.exercise_id = exercises.id
            AND em.deleted_at IS NULL
        ) AS muscle_count`],

        limit,
        page,
    }) as {
        data: (ExercisesInterface & { muscle_count: string })[];
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
    const { name, description, added_by_admin_user_id, visibility = "public", exerciseMuscles, file } = data;

    const parsedExerciseMuscles = exerciseMuscles
        ? parseAndValidateExerciseMuscles(exerciseMuscles)
        : [];
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

    // Stored first, so a file that isn't a readable image fails before anything is created.
    const image = file ? await storeExerciseImage(file.buffer) : null;
    let exercise: ExercisesInterface;
    try {
        exercise = await addOneInTable({
            table: EXERCISES_TABLE,
            data: {
                name, slug, description, added_by_admin_user_id, visibility, added_by_user_id: null,
                image_url: image?.url ?? null,
                image_key: image?.key ?? null,
            },
        }) as ExercisesInterface;
    } catch (error) {
        await deleteStoredImage(image?.key);
        throw error;
    }

    await Promise.all(parsedExerciseMuscles.map(async (exerciseMuscle) => {
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
    file?: Express.Multer.File,
    /** "true" removes the current image when no new one is uploaded. */
    remove_image?: string,
}) => {
    const { id, name, description, added_by_admin_user_id, visibility = "public", exerciseMuscles, file, remove_image } = data;

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
    const newImage = file ? await storeExerciseImage(file.buffer) : null;
    const replacesImage = !!newImage || remove_image === "true";
    if (replacesImage) {
        toUpdate.image_url = newImage?.url ?? null;
        toUpdate.image_key = newImage?.key ?? null;
    }

    let updatedExercise: ExercisesInterface;
    try {
        updatedExercise = await updateOneInTable({
            table: EXERCISES_TABLE,
            data: toUpdate,
            where: [{
                field: "id",
                operator: "=",
                value: id,
            }],
        }) as ExercisesInterface;
    } catch (error) {
        await deleteStoredImage(newImage?.key);
        throw error;
    }
    if (replacesImage) {
        await deleteStoredImage(exercise.image_key);
    }


    // `exerciseMuscles` omitted entirely => leave existing muscle links untouched
    // (e.g. the CSV import flow updates exercise fields and syncs muscles separately).
    // `exerciseMuscles` provided => treated as the full desired state: anything
    // linked but not in the list gets removed, the rest is upserted.
    if (exerciseMuscles !== undefined) {
        const parsedExerciseMuscles = parseAndValidateExerciseMuscles(exerciseMuscles);

        const existingLinks = await fetchManyFromTable({
            table: EXERCISE_MUSCLES_TABLE,
            where: [{ field: "exercise_id", operator: "=", value: id }],
        }) as ExerciseMusclesInterface[];

        const incomingMuscleIds = new Set(parsedExerciseMuscles.map((m) => m.muscle_id));
        const linksToRemove = existingLinks.filter((link) => !incomingMuscleIds.has(link.muscle_id));

        if (linksToRemove.length > 0) {
            await deleteManyInTable({
                table: EXERCISE_MUSCLES_TABLE,
                where: [{ field: "id", operator: "IN", value: linksToRemove.map((link) => link.id) }],
            });
        }

        await Promise.all(parsedExerciseMuscles.map(async (exerciseMuscle) => {
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
            const existingLink = existingLinks.find((link) => link.muscle_id === exerciseMuscle.muscle_id);
            if (existingLink) {
                await updateOneInTable({
                    table: EXERCISE_MUSCLES_TABLE,
                    data: { contribution: exerciseMuscle.contribution },
                    where: [{
                        field: "id",
                        operator: "=",
                        value: existingLink.id,
                    }],
                });
            } else {
                await addOneInTable({
                    table: EXERCISE_MUSCLES_TABLE,
                    data: { exercise_id: id, muscle_id: exerciseMuscle.muscle_id, contribution: exerciseMuscle.contribution },
                });
            }
        }));
    }

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

/**
 * Resolves a "slug:contribution,slug:contribution" CSV cell into the JSON
 * payload `createExerciseForAdminService`/`updateExerciseForAdminService`
 * expect. Returns `undefined` for a blank cell so the caller can leave
 * existing muscle links untouched rather than wiping them.
 */
const resolveExerciseMusclesCsvCell = async (cell: string | null): Promise<string | undefined> => {
    if (!cell || !cell.trim()) {
        return undefined;
    }
    const pairs = cell.split(',').map((entry) => entry.trim()).filter(Boolean);
    const resolved = await Promise.all(pairs.map(async (pair) => {
        const [muscleSlug, contributionRaw] = pair.split(':').map((part) => part?.trim());
        const contribution = parseFloat(contributionRaw);
        if (!muscleSlug || Number.isNaN(contribution)) {
            throw new AppError(`Invalid exerciseMuscles entry: "${pair}"`, 400);
        }
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
        return { muscle_id: muscle.id, contribution };
    }));
    return JSON.stringify(resolved);
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
    const rows = await parseCsv({
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

    const success: ExercisesInterface[] = [];

    await mapWithConcurrency(rows, IMPORT_CONCURRENCY, async (row, index) => {
        try {
            const exerciseMuscles = await resolveExerciseMusclesCsvCell(row.exerciseMuscles);

            let savedExercise: ExercisesInterface;
            if (row.id) {
                savedExercise = await updateExerciseForAdminService({
                    id: row.id,
                    name: row.name,
                    description: row.description,
                    added_by_admin_user_id,
                    visibility: row.visibility,
                    exerciseMuscles,
                });
            } else {
                savedExercise = await createExerciseForAdminService({
                    name: row.name,
                    description: row.description,
                    added_by_admin_user_id,
                    visibility: row.visibility,
                    exerciseMuscles,
                });
            }
            success.push(savedExercise);
        } catch (error) {
            errors.push({
                row: index + 1,
                message: error instanceof AppError ? error.message : "Unknown error",
            });
        }
    });

    return { errors, success };
}

export const exportExercisesForAdminService = async () => {
    const exercises = await fetchExercisesForExportRepository();
    return exercises;
}
