import { NextFunction, Request, Response } from "express";
import { responseSend } from "../../../helpers/response-send.js";
import {
    getUnreadNotificationCountService,
    listNotificationsService,
    markAllNotificationsReadService,
    markNotificationReadService,
} from "./users.notifications.service.js";

export const listNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await listNotificationsService(req.userId);
        return responseSend(res, 200, "Notifications fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const getUnreadNotificationCount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getUnreadNotificationCountService(req.userId);
        return responseSend(res, 200, "Unread count fetched successfully", data);
    } catch (error) {
        next(error);
    }
}

export const markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await markNotificationReadService({ userId: req.userId, notificationId: req.params.notificationId as string });
        return responseSend(res, 200, "Notification marked read", null);
    } catch (error) {
        next(error);
    }
}

export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await markAllNotificationsReadService(req.userId);
        return responseSend(res, 200, "Notifications marked read", null);
    } catch (error) {
        next(error);
    }
}
