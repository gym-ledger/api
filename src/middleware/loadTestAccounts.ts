import type { NextFunction, Request, Response } from "express";

import { responseSend } from "../helpers/response-send.js";
import { AppError } from "../shared/errors/AppError.js";
import { isLoadTestEmail, loadTestAccountsOpenTo } from "./loadTestClient.js";

/**
 * How an auth endpoint answers when a load-test account is used by anyone but
 * the load tester in production: exactly as it answers a wrong password or a
 * code that was never sent, so nothing is sent, nobody is signed in, and the
 * reply looks like any other failed attempt.
 */
const DISGUISES = {
    /** POST /auth/login/password with a wrong password. */
    wrongPassword: (_res: Response, next: NextFunction) => next(new AppError("Invalid credentials", 401)),
    /** POST /auth/login/send-otp: claims a code went out (none does). */
    loginCodeSent: (res: Response) => responseSend(res, 200, "OTP sent successfully", null),
    /** POST /auth/forgot-password/send-otp: its usual reply. */
    resetCodeSent: (res: Response) => responseSend(res, 200, "If an account exists, an OTP has been sent", null),
    /** POST …/verify-otp for a code that was never sent. */
    noSuchCode: (_res: Response, next: NextFunction) => next(new AppError("OTP not found. Please try again", 400)),
};

/**
 * Keeps the seeded load-test accounts (seed-load-users.ts) to the load tester
 * in production. Goes after validation (and after the CAPTCHA, where there is
 * one) so a blocked attempt fails at the same step a real one would.
 */
export const guardLoadTestAccounts = (disguise: keyof typeof DISGUISES) =>
    (req: Request, res: Response, next: NextFunction) => {
        if (req.body?.method === "email" && isLoadTestEmail(req.body.email) && !loadTestAccountsOpenTo(req)) {
            return DISGUISES[disguise](res, next);
        }
        next();
    };
