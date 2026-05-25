import { Router } from "express";
import { verifyUserToken } from '../../../middleware/authenticationMiddleware.js';
import {
    getUserPreferences,
    getUserSelfProfile,
    updateUserPreferences
} from './users.profile.controller.js';
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";

const usersProfileRouter = Router();

usersProfileRouter.get("/", verifyUserToken, asyncHandler(getUserSelfProfile));
usersProfileRouter.get("/preferences", verifyUserToken, asyncHandler(getUserPreferences));
usersProfileRouter.put("/preferences", verifyUserToken, asyncHandler(updateUserPreferences));

export default usersProfileRouter;