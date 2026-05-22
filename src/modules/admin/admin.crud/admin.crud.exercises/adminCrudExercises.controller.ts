import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../../helpers/response-send.js";
import {
    listExercisesForAdminService,
    viewExerciseForAdminService,
    createExerciseForAdminService,
    updateExerciseForAdminService,
    deleteExerciseForAdminService,
    importExercisesForAdminService,
    exportExercisesForAdminService
} from "./adminCrudExercises.service.js";
import { AppError } from "../../../../shared/errors/AppError.js";

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

export const importExercisesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) {
            throw new AppError("File is required", 400);
        }
        const data = await importExercisesForAdminService({ file: req.file as Express.Multer.File });

        return responseSend(res, 200, "Exercises imported successfully", data);
    } catch (error) {
        next(error);
    }
}

export const exportExercisesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await exportExercisesForAdminService();

        return responseSend(res, 200, "Exercises exported successfully", data);
    } catch (error) {
        next(error);
    }
}