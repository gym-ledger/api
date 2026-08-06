import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    getExerciseForUserService,
    listExercisesForUserService,
    listMusclesForUserService,
} from "./users.exercises.service.js";

export const listMusclesForUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listMusclesForUserService();
        return responseSend(res, 200, "Muscles fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const listExercisesForUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listExercisesForUserService({
            search: req.query.search as string | undefined,
            bodyRegion: req.query.bodyRegion as string | undefined,
            page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        });
        return responseSend(res, 200, "Exercises fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getExerciseForUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getExerciseForUserService({ id: req.params.id as string });
        return responseSend(res, 200, "Exercise fetched successfully", data);
    } catch (error) {
        next(error);
    }
}
