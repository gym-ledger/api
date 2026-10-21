import { createHmac } from "node:crypto";
import { createChallenge, randomInt, verifySolution, type Challenge, type Solution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { redis } from "../redis/index.js";
import type { CaptchaProvider } from "./types.js";

// Self-hosted proof-of-work (https://altcha.org): the API signs a challenge,
// the browser spends ~a second of CPU solving it, and the API checks the
// answer. Nothing is sent to a third party. See research/CAPTCHA_RESEARCH.md
// in the parent folder for why this one.

const CHALLENGE_TTL_SECONDS = 10 * 60;
// Work per solve ≈ cost × counter PBKDF2 rounds. The library's documented
// example (5,000 × 5,000–10,000) took 21 s single-threaded on a desktop;
// these took 1–2 s there, and the widget spreads the work over several
// workers. Raise them if abuse gets through.
const PBKDF2_COST = 2_000;
const COUNTER_MIN = 1_000;
const COUNTER_MAX = 2_500;

// Production must set CAPTCHA_SECRET (env.ts enforces it). In development a
// key is derived from the access-token secret so local setups need nothing.
const signatureSecret = env.CAPTCHA_SECRET
    ?? createHmac("sha256", env.ACCESS_TOKEN_SECRET).update("altcha-signature").digest("hex");
const keySignatureSecret = createHmac("sha256", signatureSecret).update("altcha-key-signature").digest("hex");

interface AltchaPayload {
    challenge: Challenge;
    solution: Solution;
}

/** The widget sends base64-encoded JSON `{ challenge, solution }`. */
const parsePayload = (value: unknown): AltchaPayload | null => {
    if (typeof value !== "string" || value.length === 0 || value.length > 8_192) return null;
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Partial<AltchaPayload>;
        if (!parsed?.challenge?.parameters || !parsed.solution) return null;
        return parsed as AltchaPayload;
    } catch {
        return null;
    }
};

/**
 * Marks a solved challenge as used, atomically, so one solution can't be
 * replayed. Kept only as long as the challenge could still be valid.
 */
const claimChallenge = async (nonce: string) =>
    (await redis.set(`captcha:altcha:used:${nonce}`, "1", { NX: true, EX: CHALLENGE_TTL_SECONDS })) === "OK";

export const altchaProvider: CaptchaProvider = {
    name: "altcha",

    clientConfig: () => ({ provider: "altcha", challenge_path: "/auth/captcha/challenge" }),

    createChallenge: () => createChallenge({
        algorithm: "PBKDF2/SHA-256",
        cost: PBKDF2_COST,
        counter: randomInt(COUNTER_MAX, COUNTER_MIN),
        deriveKey,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000),
        hmacSignatureSecret: signatureSecret,
        hmacKeySignatureSecret: keySignatureSecret,
    }),

    verify: async (token) => {
        const payload = parsePayload(token);
        if (!payload) return false;
        try {
            const result = await verifySolution({
                challenge: payload.challenge,
                solution: payload.solution,
                deriveKey,
                hmacSignatureSecret: signatureSecret,
                hmacKeySignatureSecret: keySignatureSecret,
            });
            // Unsigned or expired challenges fail here: the signature covers expiresAt.
            if (!result.verified) return false;
        } catch (error) {
            // Malformed parameters make the library throw; that's a failed check, not a 500.
            logger.debug({ err: error }, "ALTCHA payload rejected");
            return false;
        }
        // Only a verified payload is recorded, so failed attempts can't fill Redis.
        return claimChallenge(payload.challenge.parameters.nonce);
    },
};
