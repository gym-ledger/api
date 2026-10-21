import { z } from "zod";
import { pagination } from "../../../middleware/validate.js";
import { PASSWORD_MAX_LENGTH } from "../../../utils/authentication.js";

export const listSessionsQuery = z.strictObject({
    ...pagination(100),
    scope: z.enum(["active", "all"]).optional(),
});

export const changePasswordBody = z.strictObject({
    currentPassword: z.string().max(PASSWORD_MAX_LENGTH),
    newPassword: z.string().max(PASSWORD_MAX_LENGTH),
});
