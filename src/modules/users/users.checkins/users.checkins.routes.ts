import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { dismissWeeklyCheckin, getWeeklyCheckin } from "./users.checkins.controller.js";

const usersCheckinsRouter = Router();

usersCheckinsRouter.get("/weekly", verifyUserToken, asyncHandler(getWeeklyCheckin));
usersCheckinsRouter.post("/weekly/:checkinId/dismiss", verifyUserToken, asyncHandler(dismissWeeklyCheckin));

export default usersCheckinsRouter;
