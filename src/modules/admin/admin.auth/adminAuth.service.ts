import { AppError } from "../../../shared/errors/AppError.js";
import { fetchOneFromTable } from "../../index/index.repository.js";
import { ADMIN_USER_TABLE, AdminUserInterface } from "../../../db/schemas/admin/admin.schema.js";
import { generateAdminAccessToken, generateRefreshToken, verifyPasswordConstantTime } from "../../../utils/authentication.js";
import { decryptGraceToken, encryptGraceToken, hashToken } from "../../../utils/crypto.js";
import { REFRESH_REUSE_GRACE_MS } from "../../../config/constants.js";
import { logger } from "../../../config/logger.js";
import type { RequestDevice } from "../../../utils/requestDevice.js";
import {
    createAdminSessionRepository,
    endAdminSessionByRefreshHashRepository,
    endAdminSessionsRepository,
    fetchAdminSessionByPreviousHashRepository,
    fetchAdminSessionByRefreshHashRepository,
    rotateAdminSessionRepository,
} from "./adminSessions.repository.js";

const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export const loginAdminAuthService = async (data: { email: string, password: string }, device: RequestDevice) => {
    const { email, password } = data ?? {};
    if (!email) {
        throw new AppError("Email is required", 400);
    }
    if (!password) {
        throw new AppError("Password is required", 400);
    }

    const admin = await fetchOneFromTable({
        table: ADMIN_USER_TABLE,
        where: [
            {
                field: "email",
                operator: "=",
                value: email,
            },
        ],
    }) as AdminUserInterface;

    // Same reply, and the same password-check time, for an unknown email and
    // a wrong password, so this can't be used to find out which admin
    // accounts exist.
    const isPasswordCorrect = await verifyPasswordConstantTime(password, admin?.password_hash);

    if (!admin || !isPasswordCorrect) {
        throw new AppError("Invalid email or password", 401);
    }

    // Each sign-in is its own session (one per device), at most
    // ADMIN_MAX_ACTIVE_SESSIONS active at once.
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
    const session = await createAdminSessionRepository({
        adminUserId: admin.id,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        device,
    });
    const { accessToken, accessTokenExpiresAt } = await generateAdminAccessToken({
        userId: admin.id,
        sessionId: session.id,
    });

    return {
        // Explicit fields only — the row also holds password_hash.
        admin: {
            id: admin.id,
            email: admin.email,
            created_at: admin.created_at,
            updated_at: admin.updated_at,
        },
        accessToken,
        accessTokenExpiresAt,
        refreshToken,
        refreshTokenExpiresAt,
        /** Older sessions this sign-in ended to stay within the limit. */
        sessionsReplaced: session.replaced,
    };
}

export const refreshAdminTokensService = async (refreshToken: string | undefined, device: RequestDevice) => {
    if (!refreshToken) {
        throw new AppError("Refresh token is required", 401);
    }
    const oldHash = hashToken(refreshToken);
    const session = await fetchAdminSessionByRefreshHashRepository(oldHash);
    if (session) {
        if (session.revoked_at) {
            throw new AppError("This device was signed out", 401);
        }
        if (session.expires_at < new Date()) {
            throw new AppError("Refresh token expired", 401);
        }
        const newRefreshToken = generateRefreshToken();
        const refreshTokenExpiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
        const rotated = await rotateAdminSessionRepository({
            sessionId: session.id,
            oldHash,
            newHash: hashToken(newRefreshToken),
            newTokenEnc: encryptGraceToken(newRefreshToken),
            expiresAt: refreshTokenExpiresAt,
            device,
        });
        if (rotated) {
            const { accessToken, accessTokenExpiresAt } = await generateAdminAccessToken({
                userId: session.admin_user_id,
                sessionId: session.id,
            });
            return { accessToken, accessTokenExpiresAt, refreshToken: newRefreshToken, refreshTokenExpiresAt };
        }
        // Another refresh with this same token won the race; it is now the
        // previous token, so the grace path below hands back the winner's.
    }
    return await refreshWithPreviousAdminToken(oldHash);
}

/**
 * A refresh token that was already swapped for a new one. Within the grace
 * window this returns that same new token (a retry after a dropped response,
 * or two tabs refreshing at once). After it, the old token showing up again
 * means it was likely copied, so the session is ended ("token_reused").
 */
const refreshWithPreviousAdminToken = async (oldHash: string) => {
    const session = await fetchAdminSessionByPreviousHashRepository(oldHash);
    if (!session || session.revoked_at || session.expires_at < new Date()) {
        throw new AppError("Invalid refresh token", 401);
    }
    const withinGrace = !!session.rotated_at
        && Date.now() - new Date(session.rotated_at).getTime() <= REFRESH_REUSE_GRACE_MS;
    const currentToken = withinGrace ? decryptGraceToken(session.rotated_token_enc) : null;
    if (!currentToken) {
        logger.warn({ sessionId: session.id, adminUserId: session.admin_user_id }, "Replaced admin refresh token reused, session ended");
        await endAdminSessionsRepository({ adminUserId: session.admin_user_id, sessionId: session.id, reason: "token_reused" });
        throw new AppError("Invalid refresh token", 401);
    }
    const { accessToken, accessTokenExpiresAt } = await generateAdminAccessToken({
        userId: session.admin_user_id,
        sessionId: session.id,
    });
    return { accessToken, accessTokenExpiresAt, refreshToken: currentToken, refreshTokenExpiresAt: new Date(session.expires_at) };
}

/**
 * Ends this device's session. Idempotent: an unknown or missing token is
 * already "logged out".
 */
export const logoutAdminService = async (refreshToken: string | undefined) => {
    if (!refreshToken) {
        return;
    }
    await endAdminSessionByRefreshHashRepository(hashToken(refreshToken));
}
