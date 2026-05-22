import { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import {
    sendOtpForLoginService,
    verifyOtpForLoginService,
    refreshTokensService
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

export const refreshTokens = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // refreshTOken is in headers: { "refresh-token": "refresh_token" }
        const data = await refreshTokensService(req.headers["refresh-token"] as string);

        responseSend(res, 200, "Tokens refreshed successfully", data);
    } catch (error) {
        next(error);
    }
}