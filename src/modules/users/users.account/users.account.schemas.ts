import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "../../../utils/authentication.js";

/** One of the two, depending on how the account confirms (see the service). */
export const requestDeletionBody = z.strictObject({
    password: z.string().max(PASSWORD_MAX_LENGTH).optional(),
    code: z.string().regex(/^[0-9]{6}$/, "must be 6 digits").optional(),
});
