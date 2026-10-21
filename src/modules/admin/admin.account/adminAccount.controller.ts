import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    changePasswordService,
    endOtherSessionsService,
    endSessionService,
    getAccountService,
    listSessionsService,
} from "./adminAccount.service.js";

// verifyAdminToken sets adminUserId and adminSessionId on every route here.

export const getAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getAccountService({ adminUserId: req.adminUserId as string });
        return responseSend(res, 200, "Account fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const listSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listSessionsService({
            adminUserId: req.adminUserId as string,
            currentSessionId: req.adminSessionId as string,
            query: req.query,
        });
        return responseSend(res, 200, "Sessions fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const endSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await endSessionService({
            adminUserId: req.adminUserId as string,
            currentSessionId: req.adminSessionId as string,
            sessionId: String(req.params.id),
        });
        return responseSend(res, 200, "Device signed out", null);
    } catch (error) {
        next(error);
    }
}

export const endOtherSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await endOtherSessionsService({
            adminUserId: req.adminUserId as string,
            currentSessionId: req.adminSessionId as string,
        });
        return responseSend(res, 200, "Other devices signed out", data);
    } catch (error) {
        next(error);
    }
}

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await changePasswordService({
            adminUserId: req.adminUserId as string,
            currentSessionId: req.adminSessionId as string,
            data: req.body,
        });
        return responseSend(res, 200, "Password changed", data);
    } catch (error) {
        next(error);
    }
}
