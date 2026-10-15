import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    getUserPreferencesService,
    updateUserPreferencesService,
    getUserSelfProfileService,
    updateUserNameService,
    changeUserPasswordService
} from "./users.profile.service.js";


export const getUserSelfProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getUserSelfProfileService({ userId: req.userId as string });
        responseSend(res, 200, "User profile fetched successfully", data);
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

export const updateUserName = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await updateUserNameService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, "Name updated successfully", data);
    } catch (error) {
        next(error);
    }
}

export const changeUserPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await changeUserPasswordService({ userId: req.userId as string, data: req.body });
        responseSend(res, 200, "Password updated successfully", null);
    } catch (error) {
        next(error);
    }
}
