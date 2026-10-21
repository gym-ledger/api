import { Router } from "express";
import { verifyUserToken } from '../../../middleware/authenticationMiddleware.js';
import { credentialCheckLimiter } from "../../../middleware/rateLimiters.js";
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
    skipOnboarding,
    acceptPrivacyPolicy,
    setAiCheckins
} from './users.profile.controller.js';
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";

import { noInput, validate } from "../../../middleware/validate.js";
import { acceptPrivacyPolicyBody, changePasswordBody, endGoalBody, goalSuggestionQuery, onboardingBody, saveGoalBody, setAiCheckinsBody, updateNameBody, updatePreferencesBody } from "./users.profile.schemas.js";

const usersProfileRouter = Router();

usersProfileRouter.get("/", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getUserSelfProfile));
usersProfileRouter.put("/name", verifyUserToken, validate({ query: noInput, body: updateNameBody }), asyncHandler(updateUserName));
usersProfileRouter.put("/password", verifyUserToken, credentialCheckLimiter, validate({ query: noInput, body: changePasswordBody }), asyncHandler(changeUserPassword));
usersProfileRouter.get("/preferences", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getUserPreferences));
usersProfileRouter.put("/preferences", verifyUserToken, validate({ query: noInput, body: updatePreferencesBody }), asyncHandler(updateUserPreferences));
usersProfileRouter.get("/goal", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getWeightGoal));
usersProfileRouter.get("/goal/suggestion", verifyUserToken, validate({ query: goalSuggestionQuery, body: noInput }), asyncHandler(suggestWeightGoalDate));
usersProfileRouter.put("/goal", verifyUserToken, validate({ query: noInput, body: saveGoalBody }), asyncHandler(saveWeightGoal));
usersProfileRouter.delete("/goal", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(clearWeightGoal));
usersProfileRouter.post("/goal/end", verifyUserToken, validate({ query: noInput, body: endGoalBody }), asyncHandler(endWeightGoal));
usersProfileRouter.get("/goal/history", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(getWeightGoalHistory));
usersProfileRouter.put("/onboarding", verifyUserToken, validate({ query: noInput, body: onboardingBody }), asyncHandler(completeOnboarding));
usersProfileRouter.post("/onboarding/skip", verifyUserToken, validate({ query: noInput, body: noInput }), asyncHandler(skipOnboarding));
usersProfileRouter.post("/privacy-policy/accept", verifyUserToken, validate({ query: noInput, body: acceptPrivacyPolicyBody }), asyncHandler(acceptPrivacyPolicy));
usersProfileRouter.put("/ai-checkins", verifyUserToken, validate({ query: noInput, body: setAiCheckinsBody }), asyncHandler(setAiCheckins));

export default usersProfileRouter;