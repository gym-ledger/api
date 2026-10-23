import { z } from "zod";
import { dateString, pagination, queryInt, text } from "../../../middleware/validate.js";

export const windowQuery = z.strictObject({
    window: z.enum(["1h", "6h", "24h", "7d", "30d"]).optional(),
});

const issueFilters = {
    from: dateString.optional(),
    to: dateString.optional(),
    kind: z.enum(["error", "slow"]).optional(),
    statusClass: z.enum(["4xx", "5xx"]).optional(),
    statusCode: queryInt(100, 599).optional(),
    errorType: text(50).optional(),
    route: text(255).optional(),
    userId: z.uuid().optional(),
};

export const issueSummaryQuery = z.strictObject(issueFilters);

export const listIssuesQuery = z.strictObject({
    ...pagination(100),
    ...issueFilters,
});
