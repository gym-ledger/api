import { NextFunction, Request, Response } from "express";

import { captcha } from "../infrastructure/captcha/index.js";
import { AppError } from "../shared/errors/AppError.js";

/**
 * Requires a solved CAPTCHA in `req.body.captcha` (see infrastructure/captcha).
 * Goes after the rate limiter, so a flood is turned away before any
 * verification work is done. A no-op when CAPTCHA_PROVIDER=none.
 */
export const requireCaptcha = async (req: Request, _res: Response, next: NextFunction) => {
    if (!captcha) return next();
    try {
        if (!await captcha.verify(req.body?.captcha, req.ip)) {
            return next(new AppError("Security check failed. Please try again", 400, { reason: "captcha" }));
        }
        next();
    } catch (error) {
        next(error);
    }
}
