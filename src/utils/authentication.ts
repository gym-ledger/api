import { SignJWT } from "jose";
import crypto from "crypto";
import argon2 from "argon2";
import { env } from "../config/env.js";

export const generateUserAccessToken = async ({
    userId,
    sessionId,
}: {
    userId: string;
    sessionId: string;
}) => {
    return await new SignJWT({
        sessionId,
    })
        .setProtectedHeader({
            alg: "HS256",
        })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(
            new TextEncoder().encode(
                env.ACCESS_TOKEN_SECRET
            )
        );
}
export const generateAdminAccessToken = async ({
    userId,
    sessionId,
}: {
    userId: string;
    sessionId: string;
}) => {
    return await new SignJWT({
        sessionId,
    })
        .setProtectedHeader({
            alg: "HS256",
        })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(
            new TextEncoder().encode(
                env.ADMIN_ACCESS_TOKEN_SECRET
            )
        );
}
export function generateRefreshToken() {
    return crypto.randomBytes(64).toString("hex");
}

export const hashPassword = async (password: string) => {
    return await argon2.hash(password);
}

export const verifyPassword = async (password: string, passwordHash: string) => {
    return await argon2.verify(passwordHash, password);
}
