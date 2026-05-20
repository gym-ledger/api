import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../../helpers/response-send.js";
import {
    listProgressionRulesForAdminService,
    viewProgressionRuleForAdminService,
    createProgressionRuleForAdminService,
    updateProgressionRuleForAdminService,
    deleteProgressionRuleForAdminService,
} from "./adminCrudProgressionRules.service.js";

// exercises
export const listProgressionRulesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listProgressionRulesForAdminService(req.query);

        return responseSend(res, 200, "Exercises listed successfully", data);

    } catch (error) {
        next(error);
    }
}

export const viewProgressionRuleForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await viewProgressionRuleForAdminService({ id: req.params.id as string });

        return responseSend(res, 200, "Exercise viewed successfully", data);
    } catch (error) {
        next(error);
    }
}

export const createProgressionRuleForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await createProgressionRuleForAdminService({ ...req.body, added_by_admin_user_id: req.adminUserId as string, file: req.file });

        return responseSend(res, 200, "Exercise created successfully", data);
    } catch (error) {
        next(error);
    }
}

export const updateProgressionRuleForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await updateProgressionRuleForAdminService({ id: req.params.id as string, ...req.body, added_by_admin_user_id: req.adminUserId as string, file: req.file });

        return responseSend(res, 200, "Exercise updated successfully", data);
    } catch (error) {
        next(error);
    }
}

export const deleteProgressionRuleForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await deleteProgressionRuleForAdminService({ id: req.params.id as string });

        return responseSend(res, 200, "Exercise deleted successfully", data);
    } catch (error) {
        next(error);
    }
}
