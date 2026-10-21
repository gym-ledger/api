import { Router } from "express";
import { asyncHandler } from "../../shared/errors/utils/asyncHandler.js";
import { captchaChallengeLimiter, credentialCheckLimiter, otpSendLimiter, tokenLimiter } from "../../middleware/rateLimiters.js";
import { requireCaptcha } from "../../middleware/requireCaptcha.js";
import {
    sendOtpForLogin,
    verifyOtpForLogin,
    loginWithPassword,
    sendOtpForPasswordReset,
    verifyOtpForPasswordReset,
    resetPassword,
    refreshTokens,
    logout,
    getAuthConfig,
    getCaptchaChallenge
} from './auth.controller.js';

const authRouter = Router();

authRouter.get("/config", asyncHandler(getAuthConfig));
authRouter.get("/captcha/challenge", captchaChallengeLimiter, asyncHandler(getCaptchaChallenge));

authRouter.post("/login/send-otp", otpSendLimiter, requireCaptcha, asyncHandler(sendOtpForLogin));
authRouter.post("/login/verify-otp", credentialCheckLimiter, asyncHandler(verifyOtpForLogin));
authRouter.post("/login/password", credentialCheckLimiter, asyncHandler(loginWithPassword));

authRouter.post("/forgot-password/send-otp", otpSendLimiter, requireCaptcha, asyncHandler(sendOtpForPasswordReset));
authRouter.post("/forgot-password/verify-otp", credentialCheckLimiter, asyncHandler(verifyOtpForPasswordReset));
authRouter.post("/forgot-password/reset-password", credentialCheckLimiter, asyncHandler(resetPassword));

authRouter.put("/refresh-tokens", tokenLimiter, asyncHandler(refreshTokens));
authRouter.delete("/logout", tokenLimiter, asyncHandler(logout));
export default authRouter;
