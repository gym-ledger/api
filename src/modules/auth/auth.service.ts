import { OTP_AUTH_TABLE, OtpAuthInterface } from "../../db/schemas/auth/otp.auth.schema.js";
import { generateOtpHash, generateRandomOTP } from "../../helpers/otp.js";
import { AppError } from "../../shared/errors/AppError.js";
import { fetchOneFromTable, addOneInTable, updateOneInTable } from "../index/index.repository.js";
import { sendSMS } from "../../utils/sms-utils.js";
import { sendEmail } from "../../utils/email-utils.js";

export const sendOtpForLoginService = async (data: any) => {

    const { method, phoneNumber, email } = data;
    let otpObj: OtpAuthInterface | null = null;
    if (method === "phone") {
        if (!phoneNumber?.code) {
            throw new AppError("Invalid phone number code", 400);
        }
        if (!phoneNumber?.number?.match(/^[0-9]{10}$/)) {
            throw new AppError("Invalid phone number", 400);
        }
        otpObj = await fetchOneFromTable({
            table: OTP_AUTH_TABLE,
            filter: {
                method: "phone",
                phone_country_code: phoneNumber?.code,
                phone_number: phoneNumber?.number,
                is_deleted: false,
            },
            useSoftDelete: false,
        }) as OtpAuthInterface;
    } else if (method === "email") {
        if (!email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            throw new AppError("Invalid email", 400);
        }
        otpObj = await fetchOneFromTable({
            table: OTP_AUTH_TABLE,
            filter: {
                method: "email",
                email: email,
                is_deleted: false,
            },
            useSoftDelete: false,
        }) as OtpAuthInterface;
    } else {
        throw new AppError("Invalid method", 400);
    }
    let otp = "";
    let otpHash = "";
    let expiresAt = new Date(Date.now() + 1000 * 60 * 5);
    if (!otpObj) {
        otp = generateRandomOTP(4);
        otpHash = generateOtpHash(otp);
        otpObj = await addOneInTable({
            table: OTP_AUTH_TABLE,
            data: {
                method: method,
                phone_country_code: phoneNumber?.code,
                phone_number: phoneNumber?.number,
                email: email,
                attempts: 0,
                is_deleted: false,
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
            otpHash = generateOtpHash(otp);
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
                is_deleted: false,
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