import { Router } from "express";
import { verifyUserToken } from '../../../middleware/authenticationMiddleware.js';
import {
    getUserPreferences,
    getUserSelfProfile,
    updateUserPreferences,
    updateUserName,
    changeUserPassword,
    getWeightGoal,
    suggestWeightGoalDate,
    saveWeightGoal,
    clearWeightGoal,
    endWeightGoal,
    getWeightGoalHistory,
    completeOnboarding,
    skipOnboarding
} from './users.profile.controller.js';
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";

const usersProfileRouter = Router();

usersProfileRouter.get("/", verifyUserToken, asyncHandler(getUserSelfProfile));
usersProfileRouter.put("/name", verifyUserToken, asyncHandler(updateUserName));
usersProfileRouter.put("/password", verifyUserToken, asyncHandler(changeUserPassword));
usersProfileRouter.get("/preferences", verifyUserToken, asyncHandler(getUserPreferences));
usersProfileRouter.put("/preferences", verifyUserToken, asyncHandler(updateUserPreferences));
usersProfileRouter.get("/goal", verifyUserToken, asyncHandler(getWeightGoal));
usersProfileRouter.get("/goal/suggestion", verifyUserToken, asyncHandler(suggestWeightGoalDate));
usersProfileRouter.put("/goal", verifyUserToken, asyncHandler(saveWeightGoal));
usersProfileRouter.delete("/goal", verifyUserToken, asyncHandler(clearWeightGoal));
usersProfileRouter.post("/goal/end", verifyUserToken, asyncHandler(endWeightGoal));
usersProfileRouter.get("/goal/history", verifyUserToken, asyncHandler(getWeightGoalHistory));
usersProfileRouter.put("/onboarding", verifyUserToken, asyncHandler(completeOnboarding));
usersProfileRouter.post("/onboarding/skip", verifyUserToken, asyncHandler(skipOnboarding));

export default usersProfileRouter;