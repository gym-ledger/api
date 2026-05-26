import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import { AppError } from "../../../shared/errors/AppError.js";
import {
    getUserWeightInViewService,
    createUserWeightEntryService,
    updateUserWeightEntryService,
    importUserWeightEntriesService
} from "./users.weight.service.js";

export const getUserWeightViews = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // const user = req.user;
        responseSend(res, 200, "User profile fetched successfully", req.user);
    } catch (error) {
        next(error);
    }
}

export const getUserWeightInView = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        if (!userId) {
            throw new AppError("User not found", 404);
        }
        const viewId = req.params.id as string | null;
        const date = req.query.date as string | null;

        const data = await getUserWeightInViewService({
            userId,
            viewId,
            date,
        });
        responseSend(res, 200, "User weight in view fetched successfully", data);
    } catch (error) {
        next(error);
    }
}
export const createUserWeightView = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // const user = req.user;
        responseSend(res, 200, "User profile fetched successfully", req.user);
    } catch (error) {
        next(error);
    }
}
export const createUserWeightEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        if (!userId) {
            throw new AppError("User not found", 404);
        }
        const data = await createUserWeightEntryService({
            userId,
            weight: req.body.weight as number,
            date: req.body.date as string,
        });
        responseSend(res, 200, "User weight entry created successfully", data);
    } catch (error) {
        next(error);
    }
}
export const updateUserWeightEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId as string;
        const entryId = req.params.id as string | null;
        const weight = req.body.weight as number | null;
        const data = await updateUserWeightEntryService({
            userId,
            entryId,
            weight,
        });
        responseSend(res, 200, "User weight entry updated successfully", data);
    } catch (error) {
        next(error);
    }
}
export const deleteUserWeightEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // const user = req.user;
        responseSend(res, 200, "User profile fetched successfully", req.user);
    } catch (error) {
        next(error);
    }
}
export const getUserWeightEntries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // const user = req.user;
        responseSend(res, 200, "User profile fetched successfully", req.user);
    } catch (error) {
        next(error);
    }
}

export const importUserWeightEntries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;

        const data = await importUserWeightEntriesService({
            userId,
            file: req.file as Express.Multer.File,
        });
        responseSend(res, 200, "User weight entries imported successfully", data);

    } catch (error) {
        next(error);
    }
}