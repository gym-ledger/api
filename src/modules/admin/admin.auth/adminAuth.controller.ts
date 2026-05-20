import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import { loginAdminAuthService } from "./adminAuth.service.js";

export const loginAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await loginAdminAuthService(req.body);

        return responseSend(res, 200, "Admin login successful", data);

    } catch (error) {
        next(error);
    }
} 