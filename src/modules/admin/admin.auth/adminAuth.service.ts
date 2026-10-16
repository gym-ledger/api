import { AppError } from "../../../shared/errors/AppError.js";
import { addOneInTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { ADMIN_USER_TABLE, AdminUserInterface } from "../../../db/schemas/admin/admin.schema.js";
import { generateAdminAccessToken, generateRefreshToken, hashPassword, verifyPassword } from "../../../utils/authentication.js";
import { hashToken } from "../../../utils/crypto.js";

const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export const loginAdminAuthService = async (data: { email: string, password: string }) => {
    const { email, password } = data ?? {};
    if (!email) {
        throw new AppError("Email is required", 400);
    }
    if (!password) {
        throw new AppError("Password is required", 400);
    }

    let admin = await fetchOneFromTable({
        table: ADMIN_USER_TABLE,
        where: [
            {
                field: "email",
                operator: "=",
                value: email,
            },
        ],
    }) as AdminUserInterface;

    // Same reply for an unknown email and a wrong password, so this can't be
    // used to find out which admin accounts exist.
    if (!admin) {
        throw new AppError("Invalid email or password", 401);
        // init admin
        // const passwordHash = await hashPassword('test@test.com');
        // admin = await addOneInTable({
        //     table: ADMIN_USER_TABLE,
        //     data: {
        //         email: 'test@test.com',
        //         password_hash: passwordHash,
        //     },
        // }) as AdminUserInterface;
    }

    const isPasswordCorrect = await verifyPassword(password, admin.password_hash);

    if (!isPasswordCorrect) {
        throw new AppError("Invalid email or password", 401);
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
    const { accessToken, accessTokenExpiresAt } = await generateAdminAccessToken({
        userId: admin.id,
        sessionId: refreshTokenHash,
    });

    await updateOneInTable({
        table: ADMIN_USER_TABLE,
        data: {
            refresh_token_hash: refreshTokenHash,
            refresh_token_expires_at: refreshTokenExpiresAt,
        },
        where: [
            {
                field: "id",
                operator: "=",
                value: admin.id,
            },
        ],
    });

    return {
        // Explicit fields only — the row also holds password_hash and refresh_token_hash.
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
    };
}

export const refreshAdminTokensService = async (refreshToken: string | undefined) => {
    if (!refreshToken) {
        throw new AppError("Refresh token is required", 401);
    }
    const adminUser = await fetchOneFromTable({
        table: ADMIN_USER_TABLE,
        where: [{
            field: "refresh_token_hash",
            operator: "=",
            value: hashToken(refreshToken),
        }],
        useSoftDelete: false,
    }) as AdminUserInterface;
    if (!adminUser) {
        throw new AppError("Invalid refresh token", 401);
    }
    if (adminUser.refresh_token_expires_at < new Date()) {
        throw new AppError("Refresh token expired", 401);
    }
    const newRefreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(newRefreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
    const { accessToken, accessTokenExpiresAt } = await generateAdminAccessToken({
        userId: adminUser.id,
        sessionId: refreshTokenHash,
    });
    await updateOneInTable({
        table: ADMIN_USER_TABLE,
        data: {
            refresh_token_hash: refreshTokenHash,
            refresh_token_expires_at: refreshTokenExpiresAt,
        },
        where: [{
            field: "id",
            operator: "=",
            value: adminUser.id,
        }],
    });
    return { accessToken, accessTokenExpiresAt, refreshToken: newRefreshToken, refreshTokenExpiresAt };
}

/**
 * Ends the admin's session by clearing the stored refresh-token hash.
 * Idempotent: an unknown or missing token is already "logged out".
 */
export const logoutAdminService = async (refreshToken: string | undefined) => {
    if (!refreshToken) {
        return;
    }
    const adminUser = await fetchOneFromTable({
        table: ADMIN_USER_TABLE,
        where: [{
            field: "refresh_token_hash",
            operator: "=",
            value: hashToken(refreshToken),
        }],
        useSoftDelete: false,
    }) as AdminUserInterface | null;
    if (!adminUser) {
        return;
    }
    await updateOneInTable({
        table: ADMIN_USER_TABLE,
        data: {
            refresh_token_hash: null,
            refresh_token_expires_at: null,
        },
        where: [{
            field: "id",
            operator: "=",
            value: adminUser.id,
        }],
    });
}
