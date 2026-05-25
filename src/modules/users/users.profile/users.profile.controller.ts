import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    getUserPreferencesService,
    updateUserPreferencesService
} from "./users.profile.service.js";


export const getUserSelfProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        responseSend(res, 200, "User profile fetched successfully", {
            id: req.user.id,
            phone_country_code: req.user.phone_country_code,
            phone_number: req.user.phone_number,
            email: req.user.email,
        });
    } catch (error) {
        next(error);
    }
}

export const getUserPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        const data = await getUserPreferencesService({ userId: userId as string });
        responseSend(res, 200, "User preferences fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const updateUserPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        const data = await updateUserPreferencesService({ userId: userId as string, data: req.body });
        responseSend(res, 200, "User preferences updated successfully", data);
    } catch (error) {
        next(error);
    }
}   