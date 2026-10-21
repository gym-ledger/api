import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "../../utils/authentication.js";

// Format rules (10-digit numbers, a valid email) stay in the service; these
// fix the shape and cap the sizes.
const emailIdentity = {
    method: z.literal("email"),
    email: z.string().max(254),
};
const phoneIdentity = {
    method: z.literal("phone"),
    phoneNumber: z.strictObject({
        code: z.string().regex(/^\+?[0-9]{1,4}$/, "must be a country code like +91"),
        number: z.string().max(20),
    }),
};

/** `{ method, email }` or `{ method, phoneNumber }` plus the given fields. */
const withIdentity = <T extends z.ZodRawShape>(fields: T) => z.discriminatedUnion("method", [
    z.strictObject({ ...emailIdentity, ...fields }),
    z.strictObject({ ...phoneIdentity, ...fields }),
]);

const otp = z.string().regex(/^[0-9]{6}$/, "must be 6 digits");
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH);
// A solved ALTCHA payload (base64 JSON); absent when CAPTCHA_PROVIDER=none.
const captcha = z.string().max(10_000).optional();

export const sendOtpBody = withIdentity({ captcha });
export const verifyOtpBody = withIdentity({ otp });
export const passwordLoginBody = withIdentity({ password });

export const resetPasswordBody = z.strictObject({
    resetToken: z.string().max(256),
    newPassword: z.string().max(PASSWORD_MAX_LENGTH),
});
