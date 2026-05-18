import { Router } from "express";
import { asyncHandler } from "../../shared/errors/utils/asyncHandler.js";
import { AppError } from "../../shared/errors/AppError.js";
import { sendOtpForLogin } from './auth.controller.js';

const authRouter = Router();

authRouter.post("/login/send-otp", asyncHandler(sendOtpForLogin));

export default authRouter;