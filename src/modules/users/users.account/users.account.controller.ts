import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import { clearRefreshCookie } from "../../../utils/refreshTokenCookie.js";
import {
    cancelAccountDeletionService,
    downloadDataExportService,
    getAccountDataService,
    requestAccountDeletionService,
    requestDataExportService,
    sendDeletionCodeService,
} from "./users.account.service.js";

export const getAccountData = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getAccountDataService(req.userId as string);
        return responseSend(res, 200, "Account data fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const requestDataExport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await requestDataExportService(req.userId as string);
        return responseSend(res, 200, "Data export requested successfully", data);
    } catch (error) {
        next(error);
    }
}

/** The export file itself, as a download (not the usual JSON envelope). */
export const downloadDataExport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { content, fileName } = await downloadDataExportService(req.userId as string, req.params.id as string);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Cache-Control", "no-store");
        res.send(content);
    } catch (error) {
        next(error);
    }
}

export const sendDeletionCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await sendDeletionCodeService(req.userId as string);
        return responseSend(res, 200, "Code sent successfully", data);
    } catch (error) {
        next(error);
    }
}

export const requestAccountDeletion = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await requestAccountDeletionService(req.userId as string, req.body);
        // Every session was just ended; this device's cookie goes too.
        clearRefreshCookie(res, "user");
        return responseSend(res, 200, "Account scheduled for deletion", data);
    } catch (error) {
        next(error);
    }
}

export const cancelAccountDeletion = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await cancelAccountDeletionService(req.userId as string);
        return responseSend(res, 200, "Account deletion cancelled", data);
    } catch (error) {
        next(error);
    }
}
