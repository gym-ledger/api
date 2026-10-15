import { Router } from "express";
import { asyncHandler } from "../../shared/errors/utils/asyncHandler.js";
import { credentialCheckLimiter, otpSendLimiter, tokenLimiter } from "../../middleware/rateLimiters.js";
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

authRouter.post("/login/send-otp", otpSendLimiter, asyncHandler(sendOtpForLogin));
authRouter.post("/login/verify-otp", credentialCheckLimiter, asyncHandler(verifyOtpForLogin));
authRouter.post("/login/password", credentialCheckLimiter, asyncHandler(loginWithPassword));

authRouter.post("/forgot-password/send-otp", otpSendLimiter, asyncHandler(sendOtpForPasswordReset));
authRouter.post("/forgot-password/verify-otp", credentialCheckLimiter, asyncHandler(verifyOtpForPasswordReset));
authRouter.post("/forgot-password/reset-password", credentialCheckLimiter, asyncHandler(resetPassword));

authRouter.put("/refresh-tokens", tokenLimiter, asyncHandler(refreshTokens));
authRouter.delete("/logout", tokenLimiter, asyncHandler(logout));
export default authRouter;
