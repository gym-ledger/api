import { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import {
    sendOtpForLoginService,
    verifyOtpForLoginService
} from "./auth.service.js";
import { responseSend } from '../../helpers/response-send.js';

export const sendOtpForLogin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await sendOtpForLoginService(req.body);

        responseSend(res, 200, "OTP sent successfully", data);
    } catch (error) {
        next(error);
    }
}

export const verifyOtpForLogin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await verifyOtpForLoginService(req.body);

        responseSend(res, 200, "Login successful", data);
    } catch (error) {
        next(error);
    }
}