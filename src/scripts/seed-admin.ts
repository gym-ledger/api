import "dotenv/config";
import argon2 from "argon2";
import { logger } from "../config/logger.js";
import { pg } from "../infrastructure/postgres/index.js";

const PLACEHOLDER = "generated-by-openssl-rand-hex-32";
const MIN_PASSWORD_LENGTH = 12;
const DEV_FALLBACK = "admin@admin.com";

const isProduction = process.env.NODE_ENV === "production";
const rawEmail = process.env.DEFAULT_ADMIN_EMAIL?.trim() ?? "";
const rawPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? "";

/**
 * In production the first admin's credentials must be set explicitly: a
 * well-known fallback like admin@admin.com would hand the admin panel to
 * anyone who has read this repository. Outside production the old fallback
 * is kept so a fresh local checkout still works.
 */
const resolveCredentials = (): { email: string, password: string } => {
    if (!isProduction) {
        return {
            email: rawEmail || DEV_FALLBACK,
            password: rawPassword || DEV_FALLBACK,
        };
    }

    const problems: string[] = [];
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        problems.push("DEFAULT_ADMIN_EMAIL must be set to a real email address");
    } else if (rawEmail.toLowerCase() === DEV_FALLBACK) {
        problems.push(`DEFAULT_ADMIN_EMAIL must not be ${DEV_FALLBACK}`);
    }
    if (!rawPassword || rawPassword === PLACEHOLDER) {
        problems.push("DEFAULT_ADMIN_PASSWORD must be set (run generate-secrets.sh)");
    } else if (rawPassword.length < MIN_PASSWORD_LENGTH) {
        problems.push(`DEFAULT_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
    } else if (rawPassword.toLowerCase() === DEV_FALLBACK || rawPassword.toLowerCase() === rawEmail.toLowerCase()) {
        problems.push("DEFAULT_ADMIN_PASSWORD must not be a default or equal to the email");
    }

    if (problems.length > 0) {
        console.error("seed-admin refused to run in production:");
        for (const problem of problems) {
            console.error(`  - ${problem}`);
        }
        process.exit(1);
    }
    return { email: rawEmail, password: rawPassword };
};

async function seedAdmin() {
    const { email, password } = resolveCredentials();

    const existing = await pg.query(
        `SELECT id FROM admin_users WHERE email = $1 AND deleted_at IS NULL`,
        [email]
    );

    if (existing.rows.length > 0) {
        // console.log(`Admin already exists (${email}) — skipping`);
        logger.info(`Admin already exists (${email}) — skipping`);
        process.exit(0);
    }

    const passwordHash = await argon2.hash(password);

    await pg.query(
        `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)`,
        [email, passwordHash]
    );

    // console.log(`Admin created: ${email}`);
    logger.info(`Admin created: ${email}`);
    process.exit(0);
}

seedAdmin().catch((err) => {
    console.error("seed-admin failed:", err);
    process.exit(1);
});
