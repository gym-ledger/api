import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    getUnreadNotificationCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from "./users.notifications.controller.js";

const usersNotificationsRouter = Router();

usersNotificationsRouter.get("/", verifyUserToken, asyncHandler(listNotifications));
usersNotificationsRouter.get("/unread-count", verifyUserToken, asyncHandler(getUnreadNotificationCount));
usersNotificationsRouter.post("/read-all", verifyUserToken, asyncHandler(markAllNotificationsRead));
usersNotificationsRouter.post("/:notificationId/read", verifyUserToken, asyncHandler(markNotificationRead));

export default usersNotificationsRouter;
