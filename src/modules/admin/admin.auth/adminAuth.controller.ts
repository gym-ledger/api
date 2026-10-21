import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import { loginAdminAuthService, logoutAdminService, refreshAdminTokensService } from "./adminAuth.service.js";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../../../utils/refreshTokenCookie.js";
import { requestDevice } from "../../../utils/requestDevice.js";

export const loginAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { refreshToken, refreshTokenExpiresAt, ...data } = await loginAdminAuthService(req.body, requestDevice(req));

        // The refresh token goes only into the httpOnly cookie, never the body.
        setRefreshCookie(res, "admin", refreshToken, refreshTokenExpiresAt);
        return responseSend(res, 200, "Admin login successful", data);

    } catch (error) {
        next(error);
    }
}

export const refreshAdminTokens = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { refreshToken, refreshTokenExpiresAt, ...data } = await refreshAdminTokensService(readRefreshCookie(req, "admin"), requestDevice(req));

        setRefreshCookie(res, "admin", refreshToken, refreshTokenExpiresAt);
        return responseSend(res, 200, "Tokens refreshed successfully", data);
    } catch (error) {
        // Not cleared on 401 — see refreshTokens in auth.controller.ts (multi-tab race).
        next(error);
    }
}

export const logoutAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await logoutAdminService(readRefreshCookie(req, "admin"));

        clearRefreshCookie(res, "admin");
        return responseSend(res, 200, "Logged out successfully", null);
    } catch (error) {
        next(error);
    }
}
