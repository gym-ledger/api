import { rateLimit } from "express-rate-limit";

// In-memory store: limits are per API process. Swap in a Redis store
// (rate-limit-redis) if the API is ever scaled to more than one instance.
const createLimiter = (windowMs: number, limit: number, message: string) => rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            success: false,
            error: {
                type: "RATE_LIMITED",
                message,
                details: null,
            },
        });
    },
});

const FIFTEEN_MINUTES = 1000 * 60 * 15;

/** Endpoints that deliver an OTP (SMS/email cost + brute-force fuel). */
export const otpSendLimiter = createLimiter(
    FIFTEEN_MINUTES,
    10,
    "Too many OTP requests. Please try again later",
);

/** Endpoints that check a secret (OTP, password). */
export const credentialCheckLimiter = createLimiter(
    FIFTEEN_MINUTES,
    20,
    "Too many attempts. Please try again later",
);

/** Token refresh / logout. */
export const tokenLimiter = createLimiter(
    FIFTEEN_MINUTES,
    100,
    "Too many requests. Please try again later",
);
