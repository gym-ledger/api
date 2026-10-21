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

// Read-only, except the check-in retry. Every endpoint takes optional
// `from`/`to` (YYYY-MM-DD, UTC days) where a date range applies. "Active" is
// defined in algorithms/user-activity.md.
const adminAnalyticsRouter = Router();

adminAnalyticsRouter.get("/dashboard", asyncHandler(getDashboardForAdmin));
adminAnalyticsRouter.get("/overview", asyncHandler(getOverviewForAdmin));

adminAnalyticsRouter.get("/ai/summary", asyncHandler(getAiSummaryForAdmin));
adminAnalyticsRouter.get("/ai/daily", asyncHandler(getAiDailyForAdmin));
adminAnalyticsRouter.get("/ai/checkins", asyncHandler(getCheckinOutcomesForAdmin));
adminAnalyticsRouter.post("/checkins/:id/retry", aiLimiter, asyncHandler(retryCheckinForAdmin));

adminAnalyticsRouter.get("/users/list", asyncHandler(listUsersForAdmin));
adminAnalyticsRouter.get("/users/view/:id", asyncHandler(viewUserForAdmin));

export default adminAnalyticsRouter;
