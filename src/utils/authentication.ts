import { SignJWT } from "jose";
import crypto from "crypto";
import { env } from "../config/env.js";

export async function generateUserAccessToken({
    userId,
    sessionId,
}: {
    userId: string;
    sessionId: string;
}) {
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

export function generateRefreshToken() {
    return crypto.randomBytes(64).toString("hex");
}
