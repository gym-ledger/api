import { Router } from "express";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { aiLimiter } from "../../../middleware/rateLimiters.js";
import {
    getAiDailyForAdmin,
    getAiSummaryForAdmin,
    getCheckinOutcomesForAdmin,
    getDashboardForAdmin,
    getOverviewForAdmin,
    listUsersForAdmin,
    retryCheckinForAdmin,
    viewUserForAdmin,
} from "./adminAnalytics.controller.js";

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";
import { aiSummaryQuery, listUsersQuery, rangeQuery } from "./adminAnalytics.schemas.js";
import { auditAdminAction } from "../admin.audit/adminAudit.middleware.js";
// Read-only, except the check-in retry. Every endpoint takes optional
// `from`/`to` (YYYY-MM-DD, UTC days) where a date range applies. "Active" is
// defined in algorithms/user-activity.md.
const adminAnalyticsRouter = Router();

adminAnalyticsRouter.get("/dashboard", validate({ query: noInput, body: noInput }), asyncHandler(getDashboardForAdmin));
adminAnalyticsRouter.get("/overview", validate({ query: rangeQuery, body: noInput }), asyncHandler(getOverviewForAdmin));

adminAnalyticsRouter.get("/ai/summary", validate({ query: aiSummaryQuery, body: noInput }), asyncHandler(getAiSummaryForAdmin));
adminAnalyticsRouter.get("/ai/daily", validate({ query: rangeQuery, body: noInput }), asyncHandler(getAiDailyForAdmin));
adminAnalyticsRouter.get("/ai/checkins", validate({ query: rangeQuery, body: noInput }), asyncHandler(getCheckinOutcomesForAdmin));
adminAnalyticsRouter.post("/checkins/:id/retry", aiLimiter, auditAdminAction("weekly_checkin", "retry"), validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(retryCheckinForAdmin));

adminAnalyticsRouter.get("/users/list", validate({ query: listUsersQuery, body: noInput }), asyncHandler(listUsersForAdmin));
adminAnalyticsRouter.get("/users/view/:id", validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(viewUserForAdmin));

export default adminAnalyticsRouter;
