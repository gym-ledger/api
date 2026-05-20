import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    listWorkoutProgramsForAdminService,
    viewWorkoutProgramForAdminService,
    createWorkoutProgramForAdminService,
    updateWorkoutProgramForAdminService,
    deleteWorkoutProgramForAdminService,
    listExercisesForAdminService,
    viewExerciseForAdminService,
    createExerciseForAdminService,
    updateExerciseForAdminService,
    deleteExerciseForAdminService,
} from "./adminCrud.service.js";

// exercises
export const listExercisesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listExercisesForAdminService(req.query);

        return responseSend(res, 200, "Exercises listed successfully", data);

    } catch (error) {
        next(error);
    }
}

export const viewExerciseForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await viewExerciseForAdminService({ id: req.params.id as string });

        return responseSend(res, 200, "Exercise viewed successfully", data);
    } catch (error) {
        next(error);
    }
}

export const createExerciseForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await createExerciseForAdminService({ ...req.body, added_by_admin_user_id: req.adminUserId as string, file: req.file });

        return responseSend(res, 200, "Exercise created successfully", data);
    } catch (error) {
        next(error);
    }
}

export const updateExerciseForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await updateExerciseForAdminService({ id: req.params.id as string, ...req.body, added_by_admin_user_id: req.adminUserId as string, file: req.file });

        return responseSend(res, 200, "Exercise updated successfully", data);
    } catch (error) {
        next(error);
    }
}

export const deleteExerciseForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await deleteExerciseForAdminService({ id: req.params.id as string });

        return responseSend(res, 200, "Exercise deleted successfully", data);
    } catch (error) {
        next(error);
    }
}

// workout programs
export const listWorkoutProgramsForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listWorkoutProgramsForAdminService(req.query);

        return responseSend(res, 200, "Workout programs listed successfully", data);

    } catch (error) {
        next(error);
    }
}

export const viewWorkoutProgramForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await viewWorkoutProgramForAdminService({ id: req.params.id as string });

        return responseSend(res, 200, "Workout program viewed successfully", data);

    } catch (error) {
        next(error);
    }
}

export const createWorkoutProgramForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await createWorkoutProgramForAdminService(req.body);

        return responseSend(res, 200, "Workout program created successfully", data);

    } catch (error) {
        next(error);
    }
}

export const updateWorkoutProgramForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await updateWorkoutProgramForAdminService(req.body);

        return responseSend(res, 200, "Workout program updated successfully", data);

    } catch (error) {
        next(error);
    }
}

export const deleteWorkoutProgramForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await deleteWorkoutProgramForAdminService(req.body);

        return responseSend(res, 200, "Workout program deleted successfully", data);

    } catch (error) {
        next(error);
    }
}