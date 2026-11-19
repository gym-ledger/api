import crypto from "crypto";
import { env } from "../config/env.js";

export function hashToken(token: string) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

// Key for the refresh tokens kept for the reuse grace window (migration 038).
// Derived from the access-token secret, so a database dump alone can't read them.
const graceKey = crypto.hkdfSync("sha256", env.ACCESS_TOKEN_SECRET, "", "refresh-token-grace", 32);

/** AES-256-GCM, as "iv.tag.ciphertext" in base64url. */
export function encryptGraceToken(token: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(graceKey), iv);
    const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString("base64url")).join(".");
}

/** The token, or null when the value is missing or doesn't decrypt. */
export function decryptGraceToken(value: string | null | undefined) {
    if (!value) {
        return null;
    }
    try {
        const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
        const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(graceKey), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
}

// Key for email-change tokens; its own HKDF label, so it can't be mixed up with any other token.
const emailChangeKey = Buffer.from(crypto.hkdfSync("sha256", env.ACCESS_TOKEN_SECRET, "", "email-change-token", 32));

const signEmailChange = (userId: string, expiresAtMs: number) => crypto
    .createHmac("sha256", emailChangeKey)
    .update(`${userId}.${expiresAtMs}`)
    .digest("base64url");

/**
 * A short-lived token showing that `userId` just confirmed it's them (password
 * or code), so the rest of the email change needn't ask again. "expiresAtMs.mac".
 */
export function createEmailChangeToken(userId: string, ttlMs: number, now = Date.now()) {
    const expiresAtMs = now + ttlMs;
    return `${expiresAtMs}.${signEmailChange(userId, expiresAtMs)}`;
}

/** True only for an unexpired token made by createEmailChangeToken for this user. */
export function isValidEmailChangeToken(token: string | null | undefined, userId: string, now = Date.now()) {
    const [expires, mac, ...rest] = (token ?? "").split(".");
    const expiresAtMs = Number(expires);
    if (rest.length || !mac || !/^[0-9]+$/.test(expires) || expiresAtMs < now) {
        return false;
    }
    const expected = Buffer.from(signEmailChange(userId, expiresAtMs));
    const given = Buffer.from(mac);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
