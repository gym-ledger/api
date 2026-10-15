import argon2 from "argon2";
import crypto from "crypto";

export const OTP_LENGTH = 6;

export const generateRandomOTP = (length: number = OTP_LENGTH) => {
    // crypto.randomInt (CSPRNG), not Math.random — these OTPs authorize logins and password resets.
    return crypto.randomInt(10 ** (length - 1), 10 ** length).toString();
}

export const generateOtpHash = async (otp: string) => {
    return await argon2.hash(otp)
}

export const verifyOtpHash = async (otpHash: string, otp: string) => {
    if (!otpHash || !otp) {
        return false;
    }
    return await argon2.verify(otpHash, otp);
}
