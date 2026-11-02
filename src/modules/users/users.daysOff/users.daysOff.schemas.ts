import { z } from "zod";
import { dateString, text } from "../../../middleware/validate.js";
import { DAY_OFF_CATEGORIES } from "../../../db/schemas/users/workout/userDaysOff.schema.js";

/** Longest span GET /days-off returns in one call. */
export const MAX_LIST_SPAN_DAYS = 92;

export const listDaysOffQuery = z.strictObject({
    from: dateString,
    to: dateString,
});

export const markDaysOffBody = z.strictObject({
    start_date: dateString,
    /** Same as start_date when left out (a single day). */
    end_date: dateString.optional(),
    category: z.enum(DAY_OFF_CATEGORIES),
    note: text(280).nullish(),
    /** Work out what would be marked without saving (the sheet's preview). */
    dry_run: z.boolean().optional(),
});

export const dayParams = z.strictObject({ date: dateString });
