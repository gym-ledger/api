import { Router } from "express";
import { asyncHandler } from "../../shared/errors/utils/asyncHandler.js";
import { AppError } from "../../shared/errors/AppError.js";
import {
    sendOtpForLogin,
    verifyOtpForLogin,
    refreshTokens
} from './auth.controller.js';

const authRouter = Router();

authRouter.post("/login/send-otp", asyncHandler(sendOtpForLogin));
authRouter.post("/login/verify-otp", asyncHandler(verifyOtpForLogin));

authRouter.put("/login/refresh-tokens", asyncHandler(refreshTokens));
export default authRouter;