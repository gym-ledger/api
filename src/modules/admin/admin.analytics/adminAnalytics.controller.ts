import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    getAiDailyService,
    getAiSummaryService,
    getCheckinOutcomesService,
    getOverviewService,
    listUsersService,
    viewUserService,
} from "./adminAnalytics.service.js";

export const getOverviewForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getOverviewService(req.query);
        return responseSend(res, 200, "Overview fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getAiSummaryForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getAiSummaryService(req.query);
        return responseSend(res, 200, "AI usage summary fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getAiDailyForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getAiDailyService(req.query);
        return responseSend(res, 200, "AI usage per day fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getCheckinOutcomesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getCheckinOutcomesService(req.query);
        return responseSend(res, 200, "Check-in outcomes fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const listUsersForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listUsersService(req.query);
        return responseSend(res, 200, "Users listed successfully", data);
    } catch (error) {
        next(error);
    }
}

export const viewUserForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await viewUserService(req.params.id as string);
        return responseSend(res, 200, "User fetched successfully", data);
    } catch (error) {
        next(error);
    }
}
