import { Router } from "express";
import { verifyUserToken } from "../../../middleware/authenticationMiddleware.js";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { noInput, validate } from "../../../middleware/validate.js";
import { deleteDayOff, listDaysOff, markDaysOff } from "./users.daysOff.controller.js";
import { dayParams, listDaysOffQuery, markDaysOffBody } from "./users.daysOff.schemas.js";

const usersDaysOffRouter = Router();

usersDaysOffRouter.get("/", verifyUserToken, validate({ query: listDaysOffQuery, body: noInput }), asyncHandler(listDaysOff));
usersDaysOffRouter.post("/", verifyUserToken, validate({ query: noInput, body: markDaysOffBody }), asyncHandler(markDaysOff));
usersDaysOffRouter.delete("/:date", verifyUserToken, validate({ params: dayParams, query: noInput, body: noInput }), asyncHandler(deleteDayOff));

export default usersDaysOffRouter;
