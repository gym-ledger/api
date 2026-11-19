import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "../../../utils/authentication.js";

/** One of the two, depending on how the account confirms (see the service). */
export const requestDeletionBody = z.strictObject({
    password: z.string().max(PASSWORD_MAX_LENGTH).optional(),
    code: z.string().regex(/^[0-9]{6}$/, "must be 6 digits").optional(),
});

// Format rules for the address stay in the service (the same as sign-in).
const newEmail = z.string().trim().min(1).max(254);
const changeToken = z.string().max(200);

/** The confirmation (password or code) on the first send; the change token on resends. */
export const sendEmailChangeCodeBody = z.strictObject({
    email: newEmail,
    password: z.string().max(PASSWORD_MAX_LENGTH).optional(),
    code: z.string().regex(/^[0-9]{6}$/, "must be 6 digits").optional(),
    change_token: changeToken.optional(),
});

export const verifyEmailChangeBody = z.strictObject({
    email: newEmail,
    code: z.string().regex(/^[0-9]{6}$/, "must be 6 digits"),
    change_token: changeToken,
});
