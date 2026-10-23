import "dotenv/config";
import argon2 from "argon2";
import { LOAD_TEST_EMAIL_DOMAIN } from "../config/constants.js";
import { pg } from "../infrastructure/postgres/index.js";
import { purgeLoadTestAccountRepository } from "../modules/users/users.account/users.account.repository.js";

/**
 * Accounts for the load tester (load-tester/), which logs in as them with a
 * password like a real user would. Sign-up only works through an OTP, so
 * they are written here instead.
 *
 *   node dist/scripts/seed-load-users.js --count 5000      # creates lt-000001 … lt-005000
 *   node dist/scripts/seed-load-users.js --purge           # deletes them and all they wrote
 *
 * Emails are lt-NNNNNN@loadtest.invalid and every account shares the password
 * in LOAD_USER_PASSWORD (the load tester needs the same one). They start
 * un-onboarded: the load tester walks each one through onboarding on its
 * first visit (or up front with `load-tester prepare`). Re-running with a
 * bigger count only adds the missing ones.
 */

const MIN_PASSWORD_LENGTH = 12;
const BATCH = 1000;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
};

const loadUserEmail = (n: number) => `lt-${String(n).padStart(6, "0")}@${LOAD_TEST_EMAIL_DOMAIN}`;

async function seed(count: number) {
    const password = process.env.LOAD_USER_PASSWORD ?? "";
    if (password.length < MIN_PASSWORD_LENGTH) {
        console.error(`seed-load-users: set LOAD_USER_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters)`);
        process.exit(1);
    }
    // One hash for every account: same password, and hashing 10,000 times would take minutes.
    const passwordHash = await argon2.hash(password);
    let created = 0;
    for (let from = 1; from <= count; from += BATCH) {
        const numbers = Array.from({ length: Math.min(BATCH, count - from + 1) }, (_, i) => from + i);
        const result = await pg.query(`
        INSERT INTO users (email, password_hash, first_name, last_name)
        SELECT e.email, $2, 'Load test', e.label
        FROM unnest($1::text[], $3::text[]) AS e(email, label)
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = e.email AND u.deleted_at IS NULL)
        `, [numbers.map(loadUserEmail), passwordHash, numbers.map((n) => `User ${n}`)]);
        created += result.rowCount ?? 0;
    }
    console.log(`seed-load-users: ${created} created, ${count - created} already there (${loadUserEmail(1)} … ${loadUserEmail(count)})`);
}

async function purge() {
    const { rows } = await pg.query<{ id: string }>(
        `SELECT id FROM users WHERE email LIKE $1`,
        [`%@${LOAD_TEST_EMAIL_DOMAIN}`],
    );
    let deleted = 0;
    for (const { id } of rows) {
        if (await purgeLoadTestAccountRepository(id)) {
            deleted++;
            if (deleted % 500 === 0) console.log(`  … ${deleted} of ${rows.length}`);
        }
    }
    console.log(`seed-load-users: purged ${deleted} load-test accounts and everything they wrote`);
}

async function main() {
    if (flag("purge")) {
        return purge();
    }
    const count = Number(option("count"));
    if (!Number.isInteger(count) || count < 1 || count > 1_000_000) {
        console.error("usage: seed-load-users --count <1-1000000> | --purge");
        process.exit(1);
    }
    return seed(count);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("seed-load-users failed:", err);
        process.exit(1);
    });
