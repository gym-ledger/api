import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { pg } from "../infrastructure/postgres/index.js";
import { EXERCISE_SEED_FILE, ExerciseSeedFile } from "./exercise-seed-file.js";

/**
 * Writes the public exercise library — admin-made exercises, the muscles
 * they map to, and the contribution of each — to seeds/exercises.json, the
 * file `npm run seed:exercises` loads into a fresh database. Users' private
 * exercises are never exported.
 */
async function exportExercises() {
    const muscles = await pg.query(`
    SELECT m.slug, m.name, parent.slug AS parent_slug, m.body_region,
        m.display_order, m.xp_enabled, m.recovery_enabled
    FROM muscles m
    LEFT JOIN muscles parent ON parent.id = m.parent_muscle_id
    WHERE m.deleted_at IS NULL
    ORDER BY m.display_order, m.slug
    `);

    const exercises = await pg.query(`
    SELECT
        e.slug,
        e.name,
        e.description,
        e.image_url,
        COALESCE(
            json_agg(
                json_build_object('muscle', m.slug, 'contribution', em.contribution::float8)
                ORDER BY em.contribution DESC, m.slug
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'
        ) AS muscles
    FROM exercises e
    LEFT JOIN exercise_muscles em ON em.exercise_id = e.id AND em.deleted_at IS NULL
    LEFT JOIN muscles m ON m.id = em.muscle_id AND m.deleted_at IS NULL
    WHERE e.deleted_at IS NULL
        AND e.added_by_admin_user_id IS NOT NULL
        AND e.visibility = 'public'
    GROUP BY e.id
    ORDER BY e.slug
    `);

    const file: ExerciseSeedFile = {
        exported_at: new Date().toISOString(),
        muscles: muscles.rows,
        exercises: exercises.rows,
    };
    await writeFile(EXERCISE_SEED_FILE, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    console.log(`Exported ${file.exercises.length} exercises and ${file.muscles.length} muscles to seeds/exercises.json`);
    process.exit(0);
}

exportExercises().catch((err) => {
    console.error("export-exercises failed:", err);
    process.exit(1);
});
