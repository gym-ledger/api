import { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import { sendOtpForLoginService } from "./auth.service.js";
import { responseSend } from '../../helpers/response-send.js';

export const sendOtpForLogin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = sendOtpForLoginService(req.body);

        responseSend(res, 200, "OTP sent successfully", data);
    } catch (error) {
        next(error);
    }
}