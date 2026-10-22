/**
 * Rebuilds `user_muscle_signals` from scratch by replaying `workout_sets`
 * history in chronological order. Safe to run any time — the signals are a
 * pure function of set history (see users.muscleSignals.service.ts), so
 * this is how you recover from a bug, a retuned constant, or just
 * cold-starting the feature against existing data.
 *
 * Usage:
 *   npm run recompute:muscle-signals            # all users
 *   npm run recompute:muscle-signals -- <userId> # one user
 */
import "dotenv/config";
import { logger } from "../config/logger.js";
import { pg } from "../infrastructure/postgres/index.js";
import { recordMuscleStimulusForLoggedSets } from "../modules/users/users.muscleSignals/users.muscleSignals.service.js";

interface SetRow {
    id: string;
    user_id: string;
    workout_program_exercise_id: string;
    parent_set_id: string | null;
    rir: number | null;
    is_warmup: boolean;
    created_at: Date;
}

async function recomputeMuscleSignals(userId?: string) {
    const params: unknown[] = [];
    let userFilter = "";
    if (userId) {
        params.push(userId);
        userFilter = `AND wsess.user_id = $${params.length}`;
    }

    await pg.query(
        `DELETE FROM user_muscle_signals ${userId ? "WHERE user_id = $1" : ""}`,
        userId ? [userId] : [],
    );

    const result = await pg.query(
        `
        SELECT
            ws.id,
            wsess.user_id,
            ws.workout_program_exercise_id,
            ws.parent_set_id,
            ws.rir,
            ws.is_warmup,
            ws.created_at
        FROM workout_sets ws
        INNER JOIN workout_sessions wsess ON wsess.id = ws.workout_session_id
        WHERE ws.deleted_at IS NULL AND wsess.deleted_at IS NULL ${userFilter}
        ORDER BY wsess.user_id, ws.created_at ASC
        `,
        params,
    );
    const sets = result.rows as SetRow[];

    // Group each main set with its drop sets (same unit `recordMuscleStimulusForLoggedSets`
    // expects) — a "unit" is keyed by its main set's id; drops point back via parent_set_id.
    const unitsByMainId = new Map<string, { mainSet: SetRow; drops: SetRow[] }>();
    for (const s of sets) {
        if (s.parent_set_id == null) {
            unitsByMainId.set(s.id, { mainSet: s, drops: [] });
        }
    }
    for (const s of sets) {
        if (s.parent_set_id != null) {
            unitsByMainId.get(s.parent_set_id)?.drops.push(s);
        }
    }

    const units = Array.from(unitsByMainId.values()).sort(
        (a, b) => a.mainSet.created_at.getTime() - b.mainSet.created_at.getTime(),
    );

    // console.log(`Replaying ${units.length} logged sets (+ drop sets)...`);
    logger.info(`Replaying ${units.length} logged sets (+ drop sets)...`);

    for (const { mainSet, drops } of units) {
        await recordMuscleStimulusForLoggedSets({
            userId: mainSet.user_id,
            workoutProgramExerciseId: mainSet.workout_program_exercise_id,
            sets: [mainSet, ...drops].map((s) => ({ rir: s.rir, is_warmup: s.is_warmup })),
            at: mainSet.created_at,
        });
    }

    // console.log("Muscle signals recomputed.");
    logger.info("Muscle signals recomputed.");
}

const userIdArg = process.argv[2];
recomputeMuscleSignals(userIdArg)
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("recompute-muscle-signals failed:", err);
        process.exit(1);
    });
