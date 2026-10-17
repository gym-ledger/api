import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import { dismissWeeklyCheckinService, getWeeklyCheckinService } from "./users.checkins.service.js";

export const getWeeklyCheckin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getWeeklyCheckinService(req.userId);
        return responseSend(res, 200, "Weekly check-in fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const dismissWeeklyCheckin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await dismissWeeklyCheckinService({ userId: req.userId, checkinId: req.params.checkinId as string });
        return responseSend(res, 200, "Weekly check-in dismissed successfully", null);
    } catch (error) {
        next(error);
    }
}
