import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    getUnreadNotificationCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from "./users.notifications.controller.js";

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";

const usersNotificationsRouter = Router();

usersNotificationsRouter.get("/", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(listNotifications));
usersNotificationsRouter.get("/unread-count", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getUnreadNotificationCount));
usersNotificationsRouter.post("/read-all", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(markAllNotificationsRead));
usersNotificationsRouter.post("/:notificationId/read", verifyUserToken, validate({ params: uuidParams("notificationId"), query: noInput, body: noInput }), asyncHandler(markNotificationRead));

export default usersNotificationsRouter;
