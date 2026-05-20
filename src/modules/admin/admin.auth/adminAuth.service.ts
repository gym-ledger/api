import { AppError } from "../../../shared/errors/AppError.js";
import { addOneInTable, fetchOneFromTable } from "../../index/index.repository.js";
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
        filter: {
            email: email,
        },
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

    return {
        admin,
        accessToken,
        refreshToken,
    };
}