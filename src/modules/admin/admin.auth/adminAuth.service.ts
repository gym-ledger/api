import { AppError } from "../../../shared/errors/AppError.js";
import { addOneInTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { ADMIN_USER_TABLE, AdminUserInterface } from "../../../db/schemas/admin/admin.schema.js";
import { generateAdminAccessToken, generateRefreshToken, hashPassword, verifyPassword } from "../../../utils/authentication.js";
import { hashToken } from "../../../utils/crypto.js";

export const loginAdminAuthService = async (data: { email: string, password: string }) => {
    const { email, password } = data;
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

    if (!admin) {
        throw new AppError("Admin not found", 404);
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
    const accessToken = await generateAdminAccessToken({
        userId: admin.id,
        sessionId: refreshTokenHash,
    });

    await updateOneInTable({
        table: ADMIN_USER_TABLE,
        data: {
            refresh_token_hash: refreshTokenHash,
            refresh_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
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
        admin,
        accessToken,
        refreshToken,
    };
}

export const refreshAdminTokensService = async (refreshToken: string) => {
    if (!refreshToken) {
        throw new AppError("Refresh token is required", 400);
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
    const accessToken = await generateAdminAccessToken({
        userId: adminUser.id,
        sessionId: refreshTokenHash,
    });
    await updateOneInTable({
        table: ADMIN_USER_TABLE,
        data: {
            refresh_token_hash: refreshTokenHash,
            refresh_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        },
        where: [{
            field: "id",
            operator: "=",
            value: adminUser.id,
        }],
    });
    return { accessToken, refreshToken: newRefreshToken };
}