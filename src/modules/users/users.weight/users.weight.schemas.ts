import { z } from "zod";
import { text } from "../../../middleware/validate.js";

// weight is DECIMAL(5,2) and must be positive.
const weight = z.number().positive().max(999);
// ISO dates or date-times; parsed and checked in the service.
const isoDate = text(40);

export const createViewBody = z.strictObject({
    fromDate: isoDate,
    durationType: z.enum(["till-now", "till-date"]),
    toDate: isoDate.optional(),
});

export const weightInViewQuery = z.strictObject({
    date: isoDate.optional(),
});

export const createEntryBody = z.strictObject({
    weight,
    date: isoDate,
});

export const updateEntryBody = z.strictObject({
    weight,
});

export const entriesQuery = z.strictObject({
    lastEntryId: z.uuid().optional(),
});
