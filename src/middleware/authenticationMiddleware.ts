import { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { errors as joseErrors, jwtVerify } from "jose";
import { fetchOneFromTable } from "../modules/index/index.repository.js";
import { USERS_TABLE, UsersInterface } from "../db/schemas/users/users.schema.js";
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
        const user = await fetchOneFromTable({
            table: USERS_TABLE,
            filter: {
                id: decoded.payload.sub,
            },
            select: [
                "id",
                "phone_country_code",
                "phone_number",
                "email",
                "first_name",
                "last_name",
                "created_at",
                "updated_at",
                "deleted_at",
            ]
        }) as UsersInterface;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        req.user = user;
        req.userId = user.id;
        next();
    } catch (error) {
        // Expired / malformed / badly-signed tokens are a 401, not a server error —
        // clients key their refresh-and-retry logic off the 401.
        if (error instanceof joseErrors.JOSEError) {
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
            return res.status(401).json({ message: "Unauthorized" });
        }
        next(error);
    }
}