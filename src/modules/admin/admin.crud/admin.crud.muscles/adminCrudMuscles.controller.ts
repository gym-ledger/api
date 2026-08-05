import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../../helpers/response-send.js";
import {
    listMusclesForAdminService,
    viewMuscleForAdminService,
    createMuscleForAdminService,
    updateMuscleForAdminService,
    deleteMuscleForAdminService,
    getMusclesDropdownForAdminService,
    importMusclesForAdminService,
    exportMusclesForAdminService,
} from "./adminCrudMuscles.service.js";

export const listMusclesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const muscles = await listMusclesForAdminService({
            ...req.query,
            parentsOnly: req.query.parentsOnly === "true",
        });
        return responseSend(res, 200, "Muscles listed successfully", muscles);
    } catch (error) {
        next(error);
    }
}

export const viewMuscleForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const muscle = await viewMuscleForAdminService(req.params.id as string);
        return responseSend(res, 200, "Muscle fetched successfully", muscle);
    } catch (error) {
        next(error);
    }
}

export const createMuscleForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const muscle = await createMuscleForAdminService({ ...req.body, added_by_admin_user_id: req.adminUserId as string });
        return responseSend(res, 200, "Muscle created successfully", muscle);
    } catch (error) {
        next(error);
    }
}

export const updateMuscleForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const muscle = await updateMuscleForAdminService({ id: req.params.id as string, ...req.body, added_by_admin_user_id: req.adminUserId as string });
        return responseSend(res, 200, "Muscle updated successfully", muscle);
    } catch (error) {
        next(error);
    }
}

export const deleteMuscleForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const muscle = await deleteMuscleForAdminService(req.params.id as string);
        return responseSend(res, 200, "Muscle deleted successfully", muscle);
    } catch (error) {
        next(error);
    }
}

export const getMusclesDropdownForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const muscles = await getMusclesDropdownForAdminService(req.query);
        return responseSend(res, 200, "Muscles dropdown fetched successfully", muscles);
    } catch (error) {
        next(error);
    }
}

export const importMusclesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await importMusclesForAdminService({ file: req.file as Express.Multer.File, added_by_admin_user_id: req.adminUserId as string });
        return responseSend(res, 200, "Muscles imported successfully", data);
    } catch (error) {
        next(error);
    }
}

export const exportMusclesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const muscles = await exportMusclesForAdminService(req.query);
        return responseSend(res, 200, "Muscles exported successfully", muscles);
    } catch (error) {
        next(error);
    }
}