import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    getUserWeightInViewService,
    createUserWeightEntryService,
    updateUserWeightEntryService,
    importUserWeightEntriesService,
    createUserWeightViewService,
    getUserWeightViewsService,
    deleteUserWeightEntryService,
    getUserWeightEntriesService
} from "./users.weight.service.js";

export const getUserWeightViews = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        const data = await getUserWeightViewsService({
            userId,
        });
        responseSend(res, 200, "User weight views fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getUserWeightInView = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
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
        const userId = req.userId;
        const data = await createUserWeightViewService({ ...req.body, userId });
        responseSend(res, 200, "User weight view created successfully", data);
    } catch (error) {
        next(error);
    }
}
export const createUserWeightEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
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
        const userId = req.userId;
        const entryId = req.params.id as string | null;
        const data = await deleteUserWeightEntryService({
            userId,
            entryId,
        });
        responseSend(res, 200, "User weight entry deleted successfully", data);
    } catch (error) {
        next(error);
    }
}
export const getUserWeightEntries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        const lastEntryId = req.query.lastEntryId as string | null;
        const data = await getUserWeightEntriesService({
            userId,
            lastEntryId,
        });
        responseSend(res, 200, "User weight entries fetched successfully", data);
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