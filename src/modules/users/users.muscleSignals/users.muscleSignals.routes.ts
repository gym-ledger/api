import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { getMuscleSignalsForUser } from "./users.muscleSignals.controller.js";

import { noInput, validate } from "../../../middleware/validate.js";

const usersMuscleSignalsRouter = Router();

usersMuscleSignalsRouter.get("/", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getMuscleSignalsForUser));

export default usersMuscleSignalsRouter;
