import { Router } from "express";
import { asyncHandler } from "../../../shared/errors/utils/asyncHandler.js";
import {
    loginAdmin,
    refreshAdminTokens
} from './adminAuth.controller.js';

const adminAuthRouter = Router();

adminAuthRouter.post("/login", asyncHandler(loginAdmin));
adminAuthRouter.put("/refresh-tokens", asyncHandler(refreshAdminTokens));
export default adminAuthRouter;