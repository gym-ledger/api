import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "../../../utils/authentication.js";

export const adminLoginBody = z.strictObject({
    email: z.string().max(254),
    password: z.string().max(PASSWORD_MAX_LENGTH),
});
