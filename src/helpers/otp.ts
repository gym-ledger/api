import argon2 from "argon2";

export const generateRandomOTP = (length: number) => {
    return Math.floor(10 ** (length - 1) + Math.random() * 9 * 10 ** (length - 1)).toString();
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