import { Router } from "express";
import { asyncHandler } from "../../shared/errors/utils/asyncHandler.js";
import { AppError } from "../../shared/errors/AppError.js";
import {
    sendOtpForLogin,
    verifyOtpForLogin,
    loginWithPassword,
    sendOtpForPasswordReset,
    verifyOtpForPasswordReset,
    resetPassword,
    refreshTokens,
    logout
} from './auth.controller.js';

const authRouter = Router();

authRouter.post("/login/send-otp", asyncHandler(sendOtpForLogin));
authRouter.post("/login/verify-otp", asyncHandler(verifyOtpForLogin));
authRouter.post("/login/password", asyncHandler(loginWithPassword));

authRouter.post("/forgot-password/send-otp", asyncHandler(sendOtpForPasswordReset));
authRouter.post("/forgot-password/verify-otp", asyncHandler(verifyOtpForPasswordReset));
authRouter.post("/forgot-password/reset-password", asyncHandler(resetPassword));

authRouter.put("/refresh-tokens", asyncHandler(refreshTokens));
authRouter.delete("/logout", asyncHandler(logout));
export default authRouter;
