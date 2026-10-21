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
