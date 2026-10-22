import { Router } from "express";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    getIssueSummaryForAdmin,
    getLatencyOverviewForAdmin,
    getMonitoringStatusForAdmin,
    getRouteStatsForAdmin,
    listIssuesForAdmin,
    viewIssueForAdmin,
} from "./adminMonitoring.controller.js";

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";
import { issueSummaryQuery, listIssuesQuery, windowQuery } from "./adminMonitoring.schemas.js";

// Read-only. /performance and /routes read Prometheus (503 when
// PROMETHEUS_URL is unset or it's down); /issues/* read api_request_issues.
const adminMonitoringRouter = Router();

adminMonitoringRouter.get("/status", validate({ query: noInput, body: noInput }), asyncHandler(getMonitoringStatusForAdmin));
adminMonitoringRouter.get("/performance", validate({ query: windowQuery, body: noInput }), asyncHandler(getLatencyOverviewForAdmin));
adminMonitoringRouter.get("/routes", validate({ query: windowQuery, body: noInput }), asyncHandler(getRouteStatsForAdmin));

adminMonitoringRouter.get("/issues/summary", validate({ query: issueSummaryQuery, body: noInput }), asyncHandler(getIssueSummaryForAdmin));
adminMonitoringRouter.get("/issues/list", validate({ query: listIssuesQuery, body: noInput }), asyncHandler(listIssuesForAdmin));
adminMonitoringRouter.get("/issues/view/:id", validate({ params: uuidParams("id"), query: noInput, body: noInput }), asyncHandler(viewIssueForAdmin));

export default adminMonitoringRouter;
