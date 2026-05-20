import { AppError } from "../../../shared/errors/AppError.js";
import { addOneInTable, deleteOneFromTable, fetchManyFromTable, fetchOneFromTable, fetchPaginatedResultsFromTable, updateOneInTable } from "../../index/index.repository.js";
import { ADMIN_USER_TABLE, AdminUserInterface } from "../../../db/schemas/admin/admin.schema.js";
import { generateAdminAccessToken, generateRefreshToken, hashPassword, verifyPassword } from "../../../utils/authentication.js";
import { hashToken } from "../../../utils/crypto.js";
import { WORKOUT_PROGRAMS_TABLE, WorkoutProgramsInterface } from "../../../db/schemas/workoutPrograms/workoutPrograms.schema.js";
import { fetchWorkoutProgramWithVersionsService } from "./adminCrud.repository.js";
import { isValidUUID } from "../../../utils/validation.js";
import { EXERCISES_TABLE, ExercisesInterface } from "../../../db/schemas/exercises/exercises.schema.js";
import slugify from "slugify";
import { ProgramDaysInterface } from "../../../db/schemas/workoutPrograms/programDays.schema.js";

// exercises
export const listExercisesForAdminService = async (data: { page?: number, limit?: number, search?: string, createdBy?: string }) => {
    const { page = 1, limit = 10, search = "", createdBy = "admin_user" } = data;
    const filter = {
        // search: search,
        // createdBy: createdBy,
    };
    const exercises = await fetchPaginatedResultsFromTable({
        table: EXERCISES_TABLE,
        filter,

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

    const exercise = await fetchOneFromTable({
        table: EXERCISES_TABLE,
        filter: { id },
    }) as ExercisesInterface;
    if (!exercise) {
        throw new AppError("Exercise not found", 404);
    }
    return exercise;
}

export const createExerciseForAdminService = async (data: { name: string, description: string, added_by_admin_user_id: string, visibility?: string, file?: Express.Multer.File }) => {
    const { name, description, added_by_admin_user_id, visibility = "public" } = data;

    if (!name) {
        throw new AppError("Name is required", 400);
    }
    const slug = slugify(name, { lower: true, strict: true });
    if (!slug) {
        throw new AppError("Failed to generate slug. Choose a different name.", 400);
    }

    const duplicateBySlug = await fetchOneFromTable({
        table: EXERCISES_TABLE,
        filter: { slug },
    }) as ExercisesInterface;
    if (duplicateBySlug) {
        throw new AppError("Exercise with this slug already exists", 400);
    }

    const exercise = await addOneInTable({
        table: EXERCISES_TABLE,
        data: { name, slug, description, added_by_admin_user_id, visibility, added_by_user_id: null },
    }) as ExercisesInterface;
    return exercise;
}

export const updateExerciseForAdminService = async (data: { id: string, name: string, description: string, added_by_admin_user_id: string, visibility?: string, file?: Express.Multer.File }) => {
    const { id, name, description, added_by_admin_user_id, visibility = "public" } = data;

    if (!id) {
        throw new AppError("Exercise id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid exercise id", 400);
    }

    const exercise = await fetchOneFromTable({
        table: EXERCISES_TABLE,
        filter: { id },
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
        toUpdate.slug = slug;
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
        filter: { id },
    }) as ExercisesInterface;
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
        filter: { id },
    }) as ExercisesInterface;
    if (!exercise) {
        throw new AppError("Exercise not found", 404);
    }
    await deleteOneFromTable({
        table: EXERCISES_TABLE,
        filter: { id },
    });
    return exercise;
}

export const listWorkoutProgramsForAdminService = async (data: { page?: number, limit?: number, search?: string, createdBy?: string }) => {
    const { page = 1, limit = 10, search = "", createdBy = "admin_user" } = data;
    const filter = {
        // search: search,
        // createdBy: createdBy,
    };
    const workoutPrograms = await fetchPaginatedResultsFromTable({
        table: WORKOUT_PROGRAMS_TABLE,
        filter,
        limit,
        page,
    }) as {
        data: WorkoutProgramsInterface[];
        meta: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
        };
    };
    return workoutPrograms;
}

export const viewWorkoutProgramForAdminService = async (data: { id: string }) => {
    const { id } = data;

    if (!id) {
        throw new AppError("Workout program id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid workout program id", 400);
    }

    const workoutProgram = await fetchWorkoutProgramWithVersionsService(id);
    if (!workoutProgram) {
        throw new AppError("Workout program not found", 404);
    }

    return workoutProgram;
}

export const createWorkoutProgramForAdminService = async (data: { name: string, description: string, image: string, video: string, program_days: ProgramDaysInterface[] }) => {

    const {
        name,
        description,
        // training_days,
        // split_type,
        // session_ordering_logic,
        // duration_type,
        // duration_weeks,
        // visibility,
        program_days,

    } = data;

    if (!name) {
        throw new AppError("Name is required", 400);
    }
    if (program_days) {
        for (const programDay of program_days) {
            if (!programDay.name) {
                throw new AppError("Program day name is required", 400);
            }
            if (!programDay.day_number) {
                throw new AppError("Program day day number is required", 400);
            }
            if (!programDay.workout_program_id) {
                throw new AppError("Program day workout program id is required", 400);
            }
            if (!isValidUUID(programDay.workout_program_id)) {
                throw new AppError("Invalid program day workout program id", 400);
            }
        }
    }

}

export const updateWorkoutProgramForAdminService = async (data: { id: string, name: string, description: string, image: string, video: string }) => {
}

export const deleteWorkoutProgramForAdminService = async (data: { id: string }) => {
}