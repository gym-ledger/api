import { z } from "zod";
import { dateString, pagination, text } from "../../../middleware/validate.js";

// Range rules (order, span) are checked in the service.
const range = {
    from: dateString.optional(),
    to: dateString.optional(),
};

export const rangeQuery = z.strictObject(range);

export const aiSummaryQuery = z.strictObject({
    ...range,
    feature: text(50).optional(),
});

export const listUsersQuery = z.strictObject({
    ...pagination(100),
    search: text(100).optional(),
    activity: z.enum(["active_7d", "inactive_30d"]).optional(),
    sort: z.enum(["last_active", "created_at"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    hasPlan: z.enum(["true", "false"]).optional(),
});
