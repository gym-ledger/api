import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../helpers/response-send.js";

export const getUserSelfProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // const user = req.user;
        responseSend(res, 200, "User profile fetched successfully", req.user);
    } catch (error) {
        next(error);
    }
}