import { OTP_AUTH_TABLE, OtpAuthInterface } from "../../db/schemas/auth/otp.auth.schema.js";
import { generateOtpHash, generateRandomOTP, verifyOtpHash } from "../../helpers/otp.js";
import { AppError } from "../../shared/errors/AppError.js";
import { fetchOneFromTable, addOneInTable, updateOneInTable, deleteOneFromTable } from "../index/index.repository.js";
import { sendSMS } from "../../utils/sms-utils.js";
import { sendEmail } from "../../utils/email-utils.js";
import { USERS_TABLE, UsersInterface } from "../../db/schemas/users/users.schemas.js";
import { generateRefreshToken, generateUserAccessToken } from "../../utils/authentication.js";
import { hashToken } from "../../utils/crypto.js";
import { USER_SESSIONS_TABLE } from "../../db/schemas/auth/user_sessions.schema.js";
import { UserSessionsInterface } from "../../db/schemas/auth/user_sessions.schema.js";


const getOtpObj = async (method: string, phoneNumber: any, email: any) => {
    if (method === "phone") {
        if (!phoneNumber?.code) {
            throw new AppError("Invalid phone number code", 400);
        }
        if (!phoneNumber?.number?.match(/^[0-9]{10}$/)) {
            throw new AppError("Invalid phone number", 400);
        }
        return await fetchOneFromTable({
            table: OTP_AUTH_TABLE,
            filter: {
                method: "phone",
                phone_country_code: phoneNumber?.code,
                phone_number: phoneNumber?.number,
            },
            useSoftDelete: false,
        }) as OtpAuthInterface;
    } else if (method === "email") {
        if (!email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            throw new AppError("Invalid email", 400);
        }
        return await fetchOneFromTable({
            table: OTP_AUTH_TABLE,
            filter: {
                method: "email",
                email: email,
            },
            useSoftDelete: false,
        }) as OtpAuthInterface;
    } else {
        throw new AppError("Invalid method", 400);
    }
}

export const sendOtpForLoginService = async (data: any) => {

    const { method, phoneNumber, email } = data;
    let otpObj: OtpAuthInterface | null = await getOtpObj(method, phoneNumber, email);
    let otp = "";
    let otpHash = "";
    let expiresAt = new Date(Date.now() + 1000 * 60 * 5);
    if (!otpObj) {
        otp = generateRandomOTP(4);
        otpHash = await generateOtpHash(otp);
        otpObj = await addOneInTable({
            table: OTP_AUTH_TABLE,
            data: {
                method: method,
                phone_country_code: phoneNumber?.code,
                phone_number: phoneNumber?.number,
                email: email,
                attempts: 0,
                deleted_at: null,
                otp: otp,
                otp_hash: otpHash,
                expires_at: expiresAt,
                generated_at: new Date(),
            },
        }) as OtpAuthInterface;
    } else {
        otp = otpObj.otp ?? "";
        otpHash = otpObj.otp_hash;
        let generated_at = otpObj.generated_at;
        // if more than 1 minute since generated, generate a new otp
        if (new Date(generated_at).getTime() + 1000 * 60 < Date.now()) {
            otp = generateRandomOTP(4);
            otpHash = await generateOtpHash(otp);
        } else {
            generated_at = new Date();
        }
        otpObj = await updateOneInTable({
            table: OTP_AUTH_TABLE,
            data: {
                otp: otp,
                otp_hash: otpHash,
                expires_at: expiresAt,
                attempts: 0,
                deleted_at: null,
                generated_at: generated_at,
            },
            filter: {
                id: otpObj.id,
            },
        }) as OtpAuthInterface;
    }
    if (method === "phone") {
        await sendSMS(phoneNumber, otp, 'otp-login');
    } else if (method === "email") {
        await sendEmail(email, otp, 'otp-login');
    }
}

export const verifyOtpForLoginService = async (data: any) => {
    const { method, phoneNumber, email, otp } = data;
    let otpObj: OtpAuthInterface | null = await getOtpObj(method, phoneNumber, email);
    if (!otpObj) {
        throw new AppError("OTP not found. Please try again", 400);
    }
    // if 3 attempts already made, throw error
    if (otpObj.attempts >= 3) {
        await deleteOneFromTable({
            table: OTP_AUTH_TABLE,
            filter: {
                id: otpObj.id,
            },
            useSoftDelete: false,
        });
        throw new AppError("Maximum attempts reached. Please try again later", 400);
    }

    // if expired, throw error
    if (otpObj.expires_at < new Date()) {
        await deleteOneFromTable({
            table: OTP_AUTH_TABLE,
            filter: {
                id: otpObj.id,
            },
            useSoftDelete: false,
        });
        throw new AppError("OTP expired. Please try again", 400);
    }

    // if otp hash is not correct, throw error
    if (!await verifyOtpHash(otpObj.otp_hash, otp)) {
        if (otpObj.attempts >= 2) {
            await deleteOneFromTable({
                table: OTP_AUTH_TABLE,
                filter: {
                    id: otpObj.id,
                },
                useSoftDelete: false,
            });
            throw new AppError("Invalid OTP 3 times. Please send a new OTP", 400);
        } else {
            await updateOneInTable({
                table: OTP_AUTH_TABLE,
                data: {
                    attempts: otpObj.attempts + 1,
                },
                filter: {
                    id: otpObj.id,
                },
            });
            throw new AppError("Invalid OTP. Please try again", 400);
        }
    }
    console.log('correct otp')
    await deleteOneFromTable({
        table: OTP_AUTH_TABLE,
        filter: {
            id: otpObj.id,
        },
        useSoftDelete: false,
    });
    // fetch user by phone number or email
    let userObj: UsersInterface | null = null;
    if (method === "phone") {
        userObj = await fetchOneFromTable({
            table: USERS_TABLE,
            filter: {
                phone_number: phoneNumber,
                phone_country_code: phoneNumber?.code,
            },
        }) as UsersInterface;
    } else if (method === "email") {
        userObj = await fetchOneFromTable({
            table: USERS_TABLE,
            filter: {
                email: email,
            },
        }) as UsersInterface;
    } else {
        throw new AppError("Invalid method", 400);
    }

    // sign-up if user is not found
    if (!userObj) {
        userObj = await addOneInTable({
            table: USERS_TABLE,
            data: {
                phone_number: phoneNumber?.number,
                phone_country_code: phoneNumber?.code,
                email: email,
            },
        }) as UsersInterface;
    }

    // generate access token and refresh token
    const refreshToken = generateRefreshToken();
    const sessionObj = await addOneInTable({
        table: USER_SESSIONS_TABLE,
        data: {
            user_id: userObj.id,
            refresh_token_hash: hashToken(refreshToken),
            expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        },
    }) as UserSessionsInterface;
    const accessToken = await generateUserAccessToken({
        userId: userObj.id,
        sessionId: sessionObj.id,
    });
    // return access token and refresh token
    return { user: userObj, accessToken, refreshToken };
}