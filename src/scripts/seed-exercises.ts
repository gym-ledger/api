import "dotenv/config";
import { readFile } from "node:fs/promises";
import { logger } from "../config/logger.js";
import { pg } from "../infrastructure/postgres/index.js";
import { EXERCISE_SEED_FILE, ExerciseSeedFile } from "./exercise-seed-file.js";

/**
 * Loads seeds/exercises.json (written by `npm run export:exercises`) so a
 * fresh install starts with a usable library. Safe to run any number of
 * times: muscles and exercises are matched by slug, and any slug that has
 * ever existed — including ones an admin deleted — is left alone, so admin
 * edits and deletions are never undone. Needs an admin user to own the
 * rows — run `npm run seed:admin` first.
 */
async function seedExercises() {
    const file = JSON.parse(await readFile(EXERCISE_SEED_FILE, "utf8")) as ExerciseSeedFile;

    const admin = await pg.query(
        `SELECT id FROM admin_users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`
    );
    if (admin.rows.length === 0) {
        console.error("seed-exercises: no admin user yet — run `npm run seed:admin` first");
        process.exit(1);
    }
    const adminId: string = admin.rows[0].id;

    const client = await pg.connect();
    let musclesAdded = 0;
    let exercisesAdded = 0;
    try {
        await client.query("BEGIN");

        // Parents before children, so parent_slug always resolves.
        const pending = [...file.muscles];
        const known = new Set(
            (await client.query(`SELECT slug FROM muscles`)).rows.map((r) => r.slug as string)
        );
        while (pending.length > 0) {
            const ready = pending.filter((m) => !m.parent_slug || known.has(m.parent_slug));
            if (ready.length === 0) {
                throw new Error(`Muscles with a missing parent: ${pending.map((m) => m.slug).join(", ")}`);
            }
            for (const m of ready) {
                pending.splice(pending.indexOf(m), 1);
                if (known.has(m.slug)) continue;
                await client.query(`
                INSERT INTO muscles (name, slug, parent_muscle_id, xp_enabled, recovery_enabled,
                    body_region, display_order, added_by_admin_user_id)
                VALUES ($1, $2,
                    (SELECT id FROM muscles WHERE slug = $3 AND deleted_at IS NULL),
                    $4, $5, $6, $7, $8)
                `, [m.name, m.slug, m.parent_slug, m.xp_enabled, m.recovery_enabled, m.body_region, m.display_order, adminId]);
                known.add(m.slug);
                musclesAdded++;
            }
        }

        for (const e of file.exercises) {
            const inserted = await client.query(`
            INSERT INTO exercises (name, slug, description, image_url, visibility, added_by_admin_user_id)
            SELECT $1, $2, $3, $4, 'public', $5
            WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE slug = $2)
            RETURNING id
            `, [e.name, e.slug, e.description, e.image_url, adminId]);
            if (inserted.rows.length === 0) continue;
            exercisesAdded++;
            for (const link of e.muscles) {
                await client.query(`
                INSERT INTO exercise_muscles (exercise_id, muscle_id, contribution)
                SELECT $1, id, $3 FROM muscles WHERE slug = $2 AND deleted_at IS NULL
                `, [inserted.rows[0].id, link.muscle, link.contribution]);
            }
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    // console.log(
    //     `Seeded ${exercisesAdded} of ${file.exercises.length} exercises and ${musclesAdded} of ${file.muscles.length} muscles ` +
    //     `(the rest already existed)`
    // );
    logger.info(
        `Seeded ${exercisesAdded} of ${file.exercises.length} exercises and ${musclesAdded} of ${file.muscles.length} muscles ` +
        `(the rest already existed)`
    );
    process.exit(0);
}

seedExercises().catch((err) => {
    console.error("seed-exercises failed:", err);
    process.exit(1);
});
