import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../../helpers/response-send.js";
import {
    listWorkoutProgramsForAdminService,
    viewWorkoutProgramForAdminService,
    listWorkoutProgramVersionsForAdminService,
    createWorkoutProgramForAdminService,
    updateWorkoutProgramForAdminService,
    createWorkoutProgramVersionForAdminService,
    deleteWorkoutProgramForAdminService,
} from "./adminCrudWorkoutPrograms.service.js";

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
        const data = await viewWorkoutProgramForAdminService({
            id: req.params.id as string,
            versionId: req.query.versionId as string | undefined,
        });

        return responseSend(res, 200, "Workout program viewed successfully", data);

    } catch (error) {
        next(error);
    }
}

export const listWorkoutProgramVersionsForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listWorkoutProgramVersionsForAdminService({ id: req.params.id as string });

        return responseSend(res, 200, "Workout program versions listed successfully", data);

    } catch (error) {
        next(error);
    }
}

export const createWorkoutProgramForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const data = await createWorkoutProgramForAdminService({ ...req.body, added_by_admin_user_id: req.adminUserId as string });

        return responseSend(res, 200, "Workout program created successfully", data);

    } catch (error) {
        next(error);
    }
}

export const updateWorkoutProgramForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await updateWorkoutProgramForAdminService({
            ...req.body,
            id: req.params.id as string,
            added_by_admin_user_id: req.adminUserId as string,
        });

        return responseSend(res, 200, "Workout program updated successfully", data);

    } catch (error) {
        next(error);
    }
}

export const createWorkoutProgramVersionForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await createWorkoutProgramVersionForAdminService({
            ...req.body,
            id: req.params.id as string,
            added_by_admin_user_id: req.adminUserId as string,
        });

        return responseSend(res, 200, "Workout program version saved successfully", data);

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
