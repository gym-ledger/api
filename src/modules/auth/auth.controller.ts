import { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import {
    sendOtpForLoginService,
    verifyOtpForLoginService,
    loginWithPasswordService,
    sendOtpForPasswordResetService,
    verifyOtpForPasswordResetService,
    resetPasswordService,
    refreshTokensService,
    logoutService
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

export const loginWithPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await loginWithPasswordService(req.body);

        responseSend(res, 200, "Login successful", data);
    } catch (error) {
        next(error);
    }
}

export const sendOtpForPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await sendOtpForPasswordResetService(req.body);

        // Same response whether or not the account exists (see service).
        responseSend(res, 200, "If an account exists, an OTP has been sent", null);
    } catch (error) {
        next(error);
    }
}

export const verifyOtpForPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await verifyOtpForPasswordResetService(req.body);

        responseSend(res, 200, "OTP verified", data);
    } catch (error) {
        next(error);
    }
}

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await resetPasswordService(req.body);

        responseSend(res, 200, "Password reset successfully. Please log in again", null);
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

export const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // refreshToken is in headers: { "refresh-token": "refresh_token" }, same as refresh-tokens
        await logoutService(req.headers["refresh-token"] as string);

        responseSend(res, 200, "Logged out successfully", null);
    } catch (error) {
        next(error);
    }
}