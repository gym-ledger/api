import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import { loginAdminAuthService, refreshAdminTokensService } from "./adminAuth.service.js";
import { env } from "../../../config/env.js";

export const loginAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await loginAdminAuthService(req.body);

        return responseSend(res, 200, "Admin login successful", data);

    } catch (error) {
        next(error);
    }
}

export const refreshAdminTokens = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // refreshTOken is in headers: { "refresh-token": "refresh_token" }
        const data = await refreshAdminTokensService(req.headers["refresh-token"] as string);

        res.cookie("refresh-token", data.refreshToken, {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            maxAge: 1000 * 60 * 60 * 24 * 30,
            sameSite: "strict",
            path: "/",
        });

        return responseSend(res, 200, "Tokens refreshed successfully", { accessToken: data.accessToken, refreshToken: data.refreshToken });
    } catch (error) {
        next(error);
    }
}