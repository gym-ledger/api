import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import { deleteDayOffService, listDaysOffService, markDaysOffService } from "./users.daysOff.service.js";

export const listDaysOff = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listDaysOffService({
            userId: req.userId,
            from: req.query.from as string,
            to: req.query.to as string,
        });
        responseSend(res, 200, "Days off fetched successfully", data);
    } catch (error) {
        next(error);
    }
};

export const markDaysOff = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await markDaysOffService({ ...req.body, userId: req.userId });
        responseSend(res, 200, req.body.dry_run ? "Days off previewed" : "Days off saved successfully", data);
    } catch (error) {
        next(error);
    }
};

export const deleteDayOff = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await deleteDayOffService({ userId: req.userId, date: req.params.date as string });
        responseSend(res, 200, "Day off removed successfully", null);
    } catch (error) {
        next(error);
    }
};
