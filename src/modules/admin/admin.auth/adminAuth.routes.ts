import { Router } from "express";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import { credentialCheckLimiter, tokenLimiter } from "../../../middleware/rateLimiters.js";
import {
    loginAdmin,
    refreshAdminTokens,
    logoutAdmin
} from './adminAuth.controller.js';

import { noInput, validate } from "../../../middleware/validate.js";
import { adminLoginBody } from "./adminAuth.schemas.js";

const adminAuthRouter = Router();

adminAuthRouter.post("/login", credentialCheckLimiter, validate({ query: noInput, body: adminLoginBody }), asyncHandler(loginAdmin));
adminAuthRouter.put("/refresh-tokens", tokenLimiter, validate({ query: noInput, body: noInput }), asyncHandler(refreshAdminTokens));
adminAuthRouter.delete("/logout", tokenLimiter, validate({ query: noInput, body: noInput }), asyncHandler(logoutAdmin));
export default adminAuthRouter;
