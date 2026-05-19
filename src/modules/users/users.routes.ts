import { Router } from "express";
import { asyncHandler } from "../../shared/errors/utils/asyncHandler.js";
import { AppError } from "../../shared/errors/AppError.js";
import { verifyUserToken } from '../../middleware/authenticationMiddleware.js';
import { getUserSelfProfile } from './users.controller.js';

const authRouter = Router();

authRouter.get("/profile", verifyUserToken, asyncHandler(getUserSelfProfile));
export default authRouter;