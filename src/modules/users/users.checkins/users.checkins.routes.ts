import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { dismissWeeklyCheckin, getWeeklyCheckin } from "./users.checkins.controller.js";

import { noInput, uuidParams, validate } from "../../../middleware/validate.js";

const usersCheckinsRouter = Router();

usersCheckinsRouter.get("/weekly", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getWeeklyCheckin));
usersCheckinsRouter.post("/weekly/:checkinId/dismiss", verifyUserToken, validate({ params: uuidParams("checkinId"), query: noInput, body: noInput }), asyncHandler(dismissWeeklyCheckin));

export default usersCheckinsRouter;
