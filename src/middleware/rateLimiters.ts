import { rateLimit } from "express-rate-limit";

import { RedisRateLimitStore } from "../infrastructure/redis/rateLimitStore.js";
import { loadTestClientIp } from "./loadTestClient.js";

// Counters live in Redis, so limits hold across API instances and restarts.
// Limits are per client IP — set TRUST_PROXY_HOPS when behind a proxy, or
// every client shares the proxy's bucket. Load-test requests (LOAD_TEST_SECRET)
// count against the simulated user's IP instead.
const createLimiter = ({
    name,
    windowMs,
    limit,
    message,
    failOpen = false,
}: {
    name: string;
    windowMs: number;
    limit: number;
    message: string;
    /** Let requests through if Redis is down. Off for anything guarding a secret. */
    failOpen?: boolean;
}) => rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: new RedisRateLimitStore(name),
    keyGenerator: (req) => loadTestClientIp(req) ?? req.ip ?? "",
    passOnStoreError: failOpen,
    handler: (_req, res) => {
        res.locals.errorType = "RATE_LIMITED";
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

/**
 * Every API route. Generous: an offline workout syncing its queued sets
 * sends a burst, and a gym's Wi-Fi puts many users behind one IP.
 */
export const apiLimiter = createLimiter({
    name: "api",
    windowMs: FIFTEEN_MINUTES,
    limit: 3000,
    message: "Too many requests. Please slow down and try again shortly",
    failOpen: true,
});

/** Endpoints that deliver an OTP (SMS/email cost + brute-force fuel). */
export const otpSendLimiter = createLimiter({
    name: "otp-send",
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    message: "Too many OTP requests. Please try again later",
});

/**
 * CAPTCHA challenges. Issuing one costs the server a key derivation, so it
 * is capped too; a real user needs one per code they ask for.
 */
export const captchaChallengeLimiter = createLimiter({
    name: "captcha-challenge",
    windowMs: FIFTEEN_MINUTES,
    limit: 60,
    message: "Too many requests. Please try again later",
});

/** Endpoints that check a secret (OTP, password). */
export const credentialCheckLimiter = createLimiter({
    name: "credential",
    windowMs: FIFTEEN_MINUTES,
    limit: 20,
    message: "Too many attempts. Please try again later",
});

/** Token refresh / logout. */
export const tokenLimiter = createLimiter({
    name: "token",
    windowMs: FIFTEEN_MINUTES,
    limit: 100,
    message: "Too many requests. Please try again later",
});

/** File uploads and CSV imports: each one parses a file and writes many rows. */
export const uploadLimiter = createLimiter({
    name: "upload",
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    message: "Too many uploads. Please try again later",
    failOpen: true,
});

/** Anything that can start a paid AI (Groq) request. */
export const aiLimiter = createLimiter({
    name: "ai",
    windowMs: FIFTEEN_MINUTES,
    limit: 30,
    message: "Too many check-in requests. Please try again later",
    failOpen: true,
});
