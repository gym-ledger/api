import { Router } from "express";
import { asyncHandler } from "../../shared/errors/utils/asyncHandler.js";
import { AppError } from "../../shared/errors/AppError.js";
import {
    sendOtpForLogin,
    verifyOtpForLogin,
    refreshTokens,
    logout
} from './auth.controller.js';

const authRouter = Router();

authRouter.post("/login/send-otp", asyncHandler(sendOtpForLogin));
authRouter.post("/login/verify-otp", asyncHandler(verifyOtpForLogin));

authRouter.put("/refresh-tokens", asyncHandler(refreshTokens));
authRouter.delete("/logout", asyncHandler(logout));
export default authRouter;