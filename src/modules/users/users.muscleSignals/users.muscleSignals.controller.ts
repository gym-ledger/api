import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import { getMuscleSignalsForUserService } from "./users.muscleSignals.service.js";

export const getMuscleSignalsForUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getMuscleSignalsForUserService(req.userId);
        return responseSend(res, 200, "Muscle signals fetched successfully", data);
    } catch (error) {
        next(error);
    }
}
