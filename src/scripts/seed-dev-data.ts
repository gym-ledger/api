import "dotenv/config";
import { pg } from "../infrastructure/postgres/index.js";
import { PRIVACY_POLICY_VERSION } from "../config/constants.js";
import { createWorkoutProgramForAdminService } from "../modules/admin/admin.crud/admin.crud.workoutPrograms/adminCrudWorkoutPrograms.service.js";
import { selectWorkoutPlanService } from "../modules/users/users.workout/users.workout.service.js";
import { addDays, isoWeekdayOf } from "../utils/dates.js";

/**
 * Local test data, on top of seed:admin and seed:exercises: a public demo
 * plan (Mon / Wed / Fri full body) and a demo user who has followed it for
 * 6 weeks, with a completed workout (3 sets per exercise) on every planned
 * day up to yesterday — so Home shows a real streak, volume and week strip.
 *
 *   npm run seed:dev            # safe to re-run: skips what already exists
 *
 * Sign in as demo@local.test with MASTER_LOGIN_OTP (see CLAUDE.md).
 * Refuses to run with NODE_ENV=production.
 */

const PLAN_NAME = "Local demo: Full body (Mon/Wed/Fri)";
const DEMO_EMAIL = "demo@local.test";
const DEMO_TIMEZONE = "Asia/Kolkata";
const HISTORY_DAYS = 42;
const TRAINING_WEEKDAYS = [1, 3, 5];

const localToday = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: DEMO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function ensurePlan(): Promise<string> {
    const existing = await pg.query(`SELECT id FROM workout_programs WHERE name = $1 AND deleted_at IS NULL LIMIT 1`, [PLAN_NAME]);
    if (existing.rowCount) {
        console.log(`seed-dev: plan "${PLAN_NAME}" already exists`);
        return existing.rows[0].id;
    }
    const admin = await pg.query(`SELECT id FROM admin_users ORDER BY created_at LIMIT 1`);
    if (!admin.rowCount) throw new Error("No admin user: run `npm run seed:admin` first");
    const exercises = await pg.query(`SELECT id, name FROM exercises WHERE deleted_at IS NULL ORDER BY name LIMIT 9`);
    if (exercises.rowCount! < 9) throw new Error("Not enough exercises: run `npm run seed:exercises` first");

    const days = TRAINING_WEEKDAYS.map((dayNumber, i) => ({
        day_number: dayNumber,
        name: `Full body ${String.fromCharCode(65 + i)}`,
        sessions: [{
            name: "Main",
            exercises: exercises.rows.slice(i * 3, i * 3 + 3).map((e, order) => ({
                exercise_id: e.id,
                exercise_name: e.name,
                exercise_order: order + 1,
                target_sets: 3,
                min_reps: 8,
                max_reps: 12,
                rest_seconds: 90,
            })),
        }],
    }));
    await createWorkoutProgramForAdminService({
        name: PLAN_NAME,
        description: "Seeded for local testing (npm run seed:dev).",
        image: "",
        video: "",
        program_days: days as never,
        split_type: "full-body",
        session_ordering_logic: "sequential",
        duration_type: "indefinite",
        duration_weeks: 0,
        visibility: "public",
        version_visibility: "public",
        added_by_admin_user_id: admin.rows[0].id,
    });
    const created = await pg.query(`SELECT id FROM workout_programs WHERE name = $1 AND deleted_at IS NULL LIMIT 1`, [PLAN_NAME]);
    console.log(`seed-dev: created plan "${PLAN_NAME}"`);
    return created.rows[0].id;
}

async function ensureDemoUser(): Promise<string> {
    const found = await pg.query(`SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`, [DEMO_EMAIL]);
    if (found.rowCount) return found.rows[0].id;
    const user = await pg.query(
        `INSERT INTO users (email, first_name, last_name, onboarded_at, privacy_policy_version, privacy_policy_accepted_at)
        VALUES ($1, 'Demo', 'User', NOW(), $2, NOW()) RETURNING id`,
        [DEMO_EMAIL, PRIVACY_POLICY_VERSION],
    );
    const userId = user.rows[0].id as string;
    await pg.query(
        `INSERT INTO user_health_preferences (user_id, timezone, weight_units, height_units, height)
        VALUES ($1, $2, 'kg', 'cm', 175)`,
        [userId, DEMO_TIMEZONE],
    );
    console.log(`seed-dev: created ${DEMO_EMAIL}`);
    return userId;
}

async function ensureHistory(userId: string, programId: string) {
    let assignment = await pg.query(
        `SELECT upa.id, upa.workout_program_version_id FROM user_program_assignments upa
        WHERE upa.user_id = $1 AND upa.is_active AND upa.deleted_at IS NULL LIMIT 1`,
        [userId],
    );
    if (!assignment.rowCount) {
        await selectWorkoutPlanService({ userId, workout_program_id: programId });
        assignment = await pg.query(
            `SELECT id, workout_program_version_id FROM user_program_assignments WHERE user_id = $1 AND is_active LIMIT 1`,
            [userId],
        );
    }
    const { id: assignmentId, workout_program_version_id: versionId } = assignment.rows[0];

    const sessions = await pg.query(`SELECT 1 FROM workout_sessions WHERE user_id = $1 LIMIT 1`, [userId]);
    if (sessions.rowCount) {
        console.log("seed-dev: demo user already has workouts");
        return;
    }

    const today = localToday();
    const start = addDays(today, -HISTORY_DAYS);
    await pg.query(
        `UPDATE user_program_assignments SET started_at = ($2::date + TIME '09:00') AT TIME ZONE $3 WHERE id = $1`,
        [assignmentId, start, DEMO_TIMEZONE],
    );

    const exercisesByWeekday = new Map<number, string[]>();
    const planExercises = await pg.query(
        `SELECT pd.day_number, wpe.id FROM workout_program_exercises wpe
        INNER JOIN program_day_sessions pds ON pds.id = wpe.workout_program_day_session_id
        INNER JOIN program_days pd ON pd.id = pds.workout_program_day_id
        WHERE pd.workout_program_version_id = $1 AND wpe.workout_session_id IS NULL AND wpe.deleted_at IS NULL
        ORDER BY wpe.exercise_order`,
        [versionId],
    );
    for (const row of planExercises.rows) {
        const list = exercisesByWeekday.get(Number(row.day_number)) ?? [];
        list.push(row.id);
        exercisesByWeekday.set(Number(row.day_number), list);
    }

    let workouts = 0;
    for (let day = start; day < today; day = addDays(day, 1)) {
        const planned = exercisesByWeekday.get(isoWeekdayOf(day));
        if (!planned) continue;
        const session = await pg.query(
            `INSERT INTO workout_sessions (user_id, program_assignment_id, started_at, completed_at)
            VALUES ($1, $2, ($3::date + TIME '18:00') AT TIME ZONE $4, ($3::date + TIME '19:00') AT TIME ZONE $4)
            RETURNING id`,
            [userId, assignmentId, day, DEMO_TIMEZONE],
        );
        // Slow, steady progress: +1 kg a week.
        const weight = 40 + Math.floor((HISTORY_DAYS - (Date.parse(today) - Date.parse(day)) / 86_400_000) / 7);
        for (const exerciseId of planned) {
            for (let set = 1; set <= 3; set++) {
                await pg.query(
                    // created_at is when the set was logged; stats date sets by it.
                    `INSERT INTO workout_sets (workout_session_id, workout_program_exercise_id, set_order, weight, reps, rir, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, 10, 2, ($5::date + TIME '18:05') AT TIME ZONE $6, ($5::date + TIME '18:05') AT TIME ZONE $6)`,
                    [session.rows[0].id, exerciseId, set, weight, day, DEMO_TIMEZONE],
                );
            }
        }
        workouts++;
    }
    console.log(`seed-dev: logged ${workouts} workouts for ${DEMO_EMAIL} (${start} … yesterday)`);
}

async function main() {
    if (process.env.NODE_ENV === "production") {
        console.error("seed-dev: refusing to run with NODE_ENV=production");
        process.exit(1);
    }
    const programId = await ensurePlan();
    const userId = await ensureDemoUser();
    await ensureHistory(userId, programId);
    await pg.end();
}

main().catch(async (error) => {
    console.error(error);
    await pg.end().catch(() => undefined);
    process.exit(1);
});
