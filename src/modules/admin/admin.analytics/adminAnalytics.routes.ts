import { Router } from "express";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    getAiDailyForAdmin,
    getAiSummaryForAdmin,
    getCheckinOutcomesForAdmin,
    getOverviewForAdmin,
    listUsersForAdmin,
    viewUserForAdmin,
} from "./adminAnalytics.controller.js";

// Read-only. Every endpoint takes optional `from`/`to` (YYYY-MM-DD, UTC days)
// where a date range applies. "Active" is defined in algorithms/user-activity.md.
const adminAnalyticsRouter = Router();

adminAnalyticsRouter.get("/overview", asyncHandler(getOverviewForAdmin));

adminAnalyticsRouter.get("/ai/summary", asyncHandler(getAiSummaryForAdmin));
adminAnalyticsRouter.get("/ai/daily", asyncHandler(getAiDailyForAdmin));
adminAnalyticsRouter.get("/ai/checkins", asyncHandler(getCheckinOutcomesForAdmin));

adminAnalyticsRouter.get("/users/list", asyncHandler(listUsersForAdmin));
adminAnalyticsRouter.get("/users/view/:id", asyncHandler(viewUserForAdmin));

export default adminAnalyticsRouter;
