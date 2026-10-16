import { Router } from "express";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { credentialCheckLimiter, tokenLimiter } from "../../../middleware/rateLimiters.js";
import {
    loginAdmin,
    refreshAdminTokens,
    logoutAdmin
} from './adminAuth.controller.js';

const adminAuthRouter = Router();

adminAuthRouter.post("/login", credentialCheckLimiter, asyncHandler(loginAdmin));
adminAuthRouter.put("/refresh-tokens", tokenLimiter, asyncHandler(refreshAdminTokens));
adminAuthRouter.delete("/logout", tokenLimiter, asyncHandler(logoutAdmin));
export default adminAuthRouter;
