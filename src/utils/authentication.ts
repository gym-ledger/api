import { SignJWT } from "jose";
import crypto from "crypto";
import argon2 from "argon2";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors/AppError.js";

export const generateUserAccessToken = async ({
    userId,
    sessionId,
}: {
    userId: string;
    sessionId: string;
}) => {
    const accessTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 15);
    const accessToken = await new SignJWT({
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

    return { accessToken, accessTokenExpiresAt };
}
export const generateAdminAccessToken = async ({
    userId,
    sessionId,
}: {
    userId: string;
    sessionId: string;
}) => {
    const accessTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 15);
    const accessToken = await new SignJWT({
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

    return { accessToken, accessTokenExpiresAt };
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

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Throws a 400 AppError unless `password` is acceptable as a new user password. */
export function validateNewPassword(password: unknown): asserts password is string {
    if (typeof password !== "string" || password.length === 0) {
        throw new AppError("New password is required", 400);
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
        throw new AppError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, 400);
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
        throw new AppError(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`, 400);
    }
}
