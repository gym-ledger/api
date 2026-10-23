import { NextFunction, Request, Response } from "express";
import {
    sendOtpForLoginService,
    verifyOtpForLoginService,
    loginWithPasswordService,
    sendOtpForPasswordResetService,
    verifyOtpForPasswordResetService,
    resetPasswordService,
    refreshTokensService,
    logoutService,
    getAuthConfigService
} from "./auth.service.js";
import { responseSend } from '../../helpers/response-send.js';
import { captcha } from "../../infrastructure/captcha/index.js";
import { AppError } from "../../shared/errors/AppError.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../../utils/refreshTokenCookie.js";
import { loadTestAccountsOpenTo } from "../../middleware/loadTestClient.js";

/**
 * Moves the refresh token out of the JSON body and into the httpOnly cookie,
 * so it is never readable by page JavaScript.
 */
const sendSession = <T extends { refreshToken: string, refreshTokenExpiresAt: Date }>(
    res: Response,
    message: string,
    session: T,
) => {
    const { refreshToken, refreshTokenExpiresAt, ...body } = session;
    setRefreshCookie(res, "user", refreshToken, refreshTokenExpiresAt);
    responseSend(res, 200, message, body);
}

export const getAuthConfig = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        responseSend(res, 200, "Auth config", getAuthConfigService());
    } catch (error) {
        next(error);
    }
}

/**
 * A fresh CAPTCHA challenge for the widget. Sent as the bare challenge JSON
 * (no response envelope), which is the shape the widget reads.
 */
export const getCaptchaChallenge = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        if (!captcha?.createChallenge) {
            throw new AppError("No CAPTCHA challenge is needed on this server", 404);
        }
        res.set("Cache-Control", "no-store").json(await captcha.createChallenge());
    } catch (error) {
        next(error);
    }
}

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

        sendSession(res, "Login successful", data);
    } catch (error) {
        next(error);
    }
}

export const loginWithPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await loginWithPasswordService(req.body);

        sendSession(res, "Login successful", data);
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
        await resetPasswordService(req.body, loadTestAccountsOpenTo(req));

        responseSend(res, 200, "Password reset successfully. Please log in again", null);
    } catch (error) {
        next(error);
    }
}

export const refreshTokens = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await refreshTokensService(readRefreshCookie(req, "user"), loadTestAccountsOpenTo(req));

        sendSession(res, "Tokens refreshed successfully", data);
    } catch (error) {
        // The cookie is deliberately not cleared on a 401: when two tabs
        // refresh at once, the loser's 401 can arrive after the winner's
        // Set-Cookie, and clearing would wipe the freshly rotated token.
        next(error);
    }
}

export const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await logoutService(readRefreshCookie(req, "user"));

        clearRefreshCookie(res, "user");
        responseSend(res, 200, "Logged out successfully", null);
    } catch (error) {
        next(error);
    }
}
