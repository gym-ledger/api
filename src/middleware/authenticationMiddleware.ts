import { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { errors as joseErrors, jwtVerify } from "jose";
import { UsersInterface } from "../db/schemas/users/users.schema.js";
import { fetchUserForActiveSessionRepository } from "../modules/auth/userSessions.repository.js";
import { isLoadTestEmail, loadTestAccountsOpenTo } from "./loadTestClient.js";
import { isValidUUID } from "../utils/validation.js";
import { AdminUserInterface } from "../db/schemas/admin/admin.schema.js";
import { fetchAdminForActiveSessionRepository } from "../modules/admin/admin.auth/adminSessions.repository.js";

export const verifyUserToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accessToken = req.headers.authorization?.split(" ")[1];
        if (!accessToken) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const decoded = await jwtVerify(accessToken, new TextEncoder().encode(env.ACCESS_TOKEN_SECRET));
        if (!decoded.payload) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        // The token is only good while the session (device) it was issued for
        // is active, so logging out or a password change takes effect
        // immediately. Tokens from before migration 038 carry a hash instead
        // of a session id and get a 401, which makes the client refresh.
        const { sub, sessionId } = decoded.payload;
        if (typeof sub !== "string" || typeof sessionId !== "string" || !isValidUUID(sub) || !isValidUUID(sessionId)) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const user = await fetchUserForActiveSessionRepository(sub, sessionId) as UsersInterface | null;
        // Seeded load-test accounts: only the load tester, in production.
        if (!user || (isLoadTestEmail(user.email) && !loadTestAccountsOpenTo(req))) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        req.user = user;
        req.userId = user.id;
        req.userSessionId = sessionId;
        req.userAccessTokenExpiresAt = typeof decoded.payload.exp === "number" ? decoded.payload.exp * 1000 : undefined;
        next();
    } catch (error) {
        // Expired / malformed / badly-signed tokens are a 401, not a server error —
        // clients key their refresh-and-retry logic off the 401.
        if (error instanceof joseErrors.JOSEError) {
            // Expired tokens are the normal refresh path; metrics keep them
            // apart from real auth failures.
            if (error instanceof joseErrors.JWTExpired) res.locals.errorType = "TOKEN_EXPIRED";
            return res.status(401).json({ message: "Unauthorized" });
        }
        next(error);
    }
}

export const verifyAdminToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accessToken = req.headers.authorization?.split(" ")[1];
        if (!accessToken) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const decoded = await jwtVerify(accessToken, new TextEncoder().encode(env.ADMIN_ACCESS_TOKEN_SECRET));
        if (!decoded.payload) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        // The token is only good while the session (device) it was issued
        // for is active, so signing a device out takes effect immediately.
        // Tokens issued before migration 036 carry no session id and get a
        // 401, which makes the client refresh into its migrated session.
        const { sub, sessionId } = decoded.payload;
        if (typeof sub !== "string" || typeof sessionId !== "string" || !isValidUUID(sub) || !isValidUUID(sessionId)) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const adminUser = await fetchAdminForActiveSessionRepository(sub, sessionId) as AdminUserInterface | null;
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        req.adminUser = adminUser;
        req.adminUserId = adminUser.id;
        req.adminSessionId = sessionId;
        next();
    } catch (error) {
        // Expired / malformed / badly-signed tokens are a 401, not a server error —
        // clients key their refresh-and-retry logic off the 401.
        if (error instanceof joseErrors.JOSEError) {
            // Expired tokens are the normal refresh path; metrics keep them
            // apart from real auth failures.
            if (error instanceof joseErrors.JWTExpired) res.locals.errorType = "TOKEN_EXPIRED";
            return res.status(401).json({ message: "Unauthorized" });
        }
        next(error);
    }
}