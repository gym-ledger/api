import { Router } from "express";
import { asyncHandler } from "../../shared/errors/utils/asyncHandler.js";
import { captchaChallengeLimiter, credentialCheckLimiter, otpSendLimiter, tokenLimiter } from "../../middleware/rateLimiters.js";
import { requireCaptcha } from "../../middleware/requireCaptcha.js";
import { noInput, validate } from "../../middleware/validate.js";
import { passwordLoginBody, resetPasswordBody, sendOtpBody, verifyOtpBody } from "./auth.schemas.js";
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

authRouter.get("/config", validate({ query: noInput, body: noInput }), asyncHandler(getAuthConfig));
authRouter.get("/captcha/challenge", captchaChallengeLimiter, validate({ query: noInput, body: noInput }), asyncHandler(getCaptchaChallenge));

authRouter.post("/login/send-otp", otpSendLimiter, validate({ query: noInput, body: sendOtpBody }), requireCaptcha, asyncHandler(sendOtpForLogin));
authRouter.post("/login/verify-otp", credentialCheckLimiter, validate({ query: noInput, body: verifyOtpBody }), asyncHandler(verifyOtpForLogin));
authRouter.post("/login/password", credentialCheckLimiter, validate({ query: noInput, body: passwordLoginBody }), asyncHandler(loginWithPassword));

authRouter.post("/forgot-password/send-otp", otpSendLimiter, validate({ query: noInput, body: sendOtpBody }), requireCaptcha, asyncHandler(sendOtpForPasswordReset));
authRouter.post("/forgot-password/verify-otp", credentialCheckLimiter, validate({ query: noInput, body: verifyOtpBody }), asyncHandler(verifyOtpForPasswordReset));
authRouter.post("/forgot-password/reset-password", credentialCheckLimiter, validate({ query: noInput, body: resetPasswordBody }), asyncHandler(resetPassword));

authRouter.put("/refresh-tokens", tokenLimiter, validate({ query: noInput, body: noInput }), asyncHandler(refreshTokens));
authRouter.delete("/logout", tokenLimiter, validate({ query: noInput, body: noInput }), asyncHandler(logout));
export default authRouter;
