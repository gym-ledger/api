import { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { jwtVerify } from "jose";
import { fetchOneFromTable } from "../modules/index/index.repository.js";
import { USERS_TABLE, UsersInterface } from "../db/schemas/users/users.schema.js";
import { ADMIN_USER_TABLE, AdminUserInterface } from "../db/schemas/admin/admin.schema.js";

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
        const adminUser = await fetchOneFromTable({
            table: ADMIN_USER_TABLE,
            filter: {
                id: decoded.payload.sub,
            },
            select: [
                "id",
                "email",
                "created_at",
                "updated_at",
            ]
        }) as AdminUserInterface;
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        req.adminUser = adminUser;
        req.adminUserId = adminUser.id;
        next();
    } catch (error) {
        next(error);
    }
}