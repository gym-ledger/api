import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    getIssueSummaryService,
    getLatencyOverviewService,
    getMonitoringStatusService,
    getRouteStatsService,
    listIssuesService,
    viewIssueService,
} from "./adminMonitoring.service.js";

export const getMonitoringStatusForAdmin = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getMonitoringStatusService();
        return responseSend(res, 200, "Monitoring status fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getLatencyOverviewForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getLatencyOverviewService(req.query);
        return responseSend(res, 200, "API performance fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getRouteStatsForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getRouteStatsService(req.query);
        return responseSend(res, 200, "Route stats fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getIssueSummaryForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getIssueSummaryService(req.query);
        return responseSend(res, 200, "Request issue summary fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const listIssuesForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listIssuesService(req.query);
        return responseSend(res, 200, "Request issues listed successfully", data);
    } catch (error) {
        next(error);
    }
}

export const viewIssueForAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await viewIssueService(req.params.id as string);
        return responseSend(res, 200, "Request issue fetched successfully", data);
    } catch (error) {
        next(error);
    }
}
