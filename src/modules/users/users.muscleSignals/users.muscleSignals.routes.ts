import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { getMuscleSignalsForUser } from "./users.muscleSignals.controller.js";

const usersMuscleSignalsRouter = Router();

usersMuscleSignalsRouter.get("/", verifyUserToken, asyncHandler(getMuscleSignalsForUser));

export default usersMuscleSignalsRouter;
