import "dotenv/config";
import argon2 from "argon2";
import { pg } from "../infrastructure/postgres/index.js";

const email = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@admin.com";
const password = process.env.DEFAULT_ADMIN_PASSWORD ?? "admin@admin.com";

async function seedAdmin() {
    const existing = await pg.query(
        `SELECT id FROM admin_users WHERE email = $1 AND deleted_at IS NULL`,
        [email]
    );

    if (existing.rows.length > 0) {
        console.log(`Admin already exists (${email}) — skipping`);
        process.exit(0);
    }

    const passwordHash = await argon2.hash(password);

    await pg.query(
        `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)`,
        [email, passwordHash]
    );

    console.log(`Admin created: ${email}`);
    process.exit(0);
}

seedAdmin().catch((err) => {
    console.error("seed-admin failed:", err);
    process.exit(1);
});
