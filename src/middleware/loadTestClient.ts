import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Request } from "express";

import { env } from "../config/env.js";
import { LOAD_TEST_EMAIL_DOMAIN } from "../config/constants.js";
import { logger } from "../config/logger.js";

const secret = env.LOAD_TEST_SECRET ? Buffer.from(env.LOAD_TEST_SECRET) : null;
const sourceIps = new Set(env.LOAD_TEST_SOURCE_IPS);

if (secret && env.NODE_ENV === "production" && sourceIps.size === 0) {
    logger.warn("LOAD_TEST_SECRET is set without LOAD_TEST_SOURCE_IPS: anyone holding it can choose their own rate-limit bucket");
}

const headerValue = (req: Request, name: string) => {
    const value = req.headers[name];
    return typeof value === "string" ? value : undefined;
}

/** The request comes from the load tester: the right secret, from an allowed address. */
export const isLoadTestRequest = (req: Request): boolean => {
    if (!secret) {
        return false;
    }
    const key = headerValue(req, "x-load-test-key");
    if (!key) {
        return false;
    }
    const given = Buffer.from(key);
    if (given.length !== secret.length || !timingSafeEqual(given, secret)) {
        return false;
    }
    return sourceIps.size === 0 || sourceIps.has(req.ip ?? "");
}

/**
 * The simulated client IP of a load-test request (see LOAD_TEST_SECRET), or
 * undefined for every other request. Only rate limiting uses it: everything
 * else keeps seeing the generator's real address.
 */
export const loadTestClientIp = (req: Request): string | undefined => {
    if (!isLoadTestRequest(req)) {
        return undefined;
    }
    const ip = headerValue(req, "x-load-test-client-ip")?.trim();
    return ip && isIP(ip) ? ip : undefined;
}

/** An account seed-load-users.ts made (emails are case-insensitive, like the column). */
export const isLoadTestEmail = (email: unknown): boolean =>
    typeof email === "string" && email.trim().toLowerCase().endsWith(`@${LOAD_TEST_EMAIL_DOMAIN}`);

/**
 * Whether this request may act as a load-test account. The seeded emails and
 * the way they are made are public (this repository is open source), so in
 * production only the load tester itself may use them; elsewhere anyone can,
 * for manual testing.
 */
export const loadTestAccountsOpenTo = (req: Request): boolean =>
    env.NODE_ENV !== "production" || isLoadTestRequest(req);
