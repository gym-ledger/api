import crypto from "crypto";
import { env } from "../config/env.js";
export const generateRandomOTP = (length: number) => {
    return Math.floor(10 ** (length - 1) + Math.random() * 9 * 10 ** (length - 1)).toString();
}

export const generateOtpHash = (otp: string) => {
    const salt = env.OTP_SALT;
    return crypto.createHash('sha256').update(otp + salt).digest('hex');
}

export const verifyOtpHash = (otpHash: string, otp: string) => {
    const salt = env.OTP_SALT;
    return crypto.createHash('sha256').update(otp + salt).digest('hex') === otpHash;
}