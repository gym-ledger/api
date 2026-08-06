import { AppError } from "../../../shared/errors/AppError.js";
import { isValidUUID } from "../../../utils/validation.js";
import {
    fetchExerciseDetailForUserRepository,
    fetchExercisesForUserRepository,
    fetchMusclesForUserRepository,
} from "./users.exercises.repository.js";

export const listMusclesForUserService = async () => {
    return await fetchMusclesForUserRepository();
}

export const listExercisesForUserService = async (data: {
    search?: string,
    bodyRegion?: string,
    page?: number,
    limit?: number,
}) => {
    const page = Math.max(data.page ?? 1, 1);
    const limit = Math.min(Math.max(data.limit ?? 20, 1), 100);

    const { data: exercises, totalCount } = await fetchExercisesForUserRepository({
        search: data.search,
        bodyRegion: data.bodyRegion,
        page,
        limit,
    });
    return {
        data: exercises,
        meta: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
        },
    };
}

export const getExerciseForUserService = async (data: { id?: string }) => {
    const { id } = data;
    if (!id) {
        throw new AppError("Exercise id is required", 400);
    }
    if (!isValidUUID(id)) {
        throw new AppError("Invalid exercise id", 400);
    }
    const exercise = await fetchExerciseDetailForUserRepository(id);
    if (!exercise) {
        throw new AppError("Exercise not found", 404);
    }
    return exercise;
}
