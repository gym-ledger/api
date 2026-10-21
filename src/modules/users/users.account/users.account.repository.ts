import type { PoolClient } from "pg";
import { pg } from "../../../infrastructure/postgres/index.js";

/** How long an account waits between asking for deletion and being deleted. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** How long a finished data export can be downloaded. */
export const DATA_EXPORT_TTL_DAYS = 7;

export type DataExportStatus = "pending" | "processing" | "ready" | "failed" | "expired";

/** An export as the app shows it (never its content). */
export interface DataExportRow {
    id: string;
    status: DataExportStatus;
    size_bytes: number | null;
    error: string | null;
    requested_at: Date;
    completed_at: Date | null;
    expires_at: Date | null;
}

const EXPORT_COLUMNS = "id, status, size_bytes, error, requested_at, completed_at, expires_at";

// ---------------------------------------------------------------------------
// Data exports
// ---------------------------------------------------------------------------

export const fetchLatestDataExportRepository = async (userId: string): Promise<DataExportRow | null> => {
    const result = await pg.query(`
    SELECT ${EXPORT_COLUMNS}
    FROM user_data_exports
    WHERE user_id = $1
    ORDER BY requested_at DESC
    LIMIT 1
    `, [userId]);
    return result.rows[0] ?? null;
}

/**
 * Queues a new export unless one is already waiting or being built. Returns
 * null in that case. The user row is locked so two requests at once can't
 * both get through.
 */
export const createDataExportRepository = async (userId: string): Promise<DataExportRow | null> => {
    const client = await pg.connect();
    try {
        await client.query("BEGIN");
        await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
        const open = await client.query(
            `SELECT 1 FROM user_data_exports WHERE user_id = $1 AND status IN ('pending', 'processing')`,
            [userId],
        );
        if (open.rowCount) {
            await client.query("COMMIT");
            return null;
        }
        const inserted = await client.query(
            `INSERT INTO user_data_exports (user_id) VALUES ($1) RETURNING ${EXPORT_COLUMNS}`,
            [userId],
        );
        await client.query("COMMIT");
        return inserted.rows[0];
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

/** A ready, unexpired export's file, if it belongs to this user. */
export const fetchDataExportContentRepository = async (userId: string, exportId: string) => {
    const result = await pg.query(`
    SELECT content, completed_at
    FROM user_data_exports
    WHERE id = $1 AND user_id = $2 AND status = 'ready' AND expires_at > NOW() AND content IS NOT NULL
    `, [exportId, userId]);
    return (result.rows[0] ?? null) as { content: Buffer, completed_at: Date } | null;
}

/**
 * Claims the oldest waiting export for building. One left in 'processing'
 * for 15 minutes (the API restarted mid-build) is picked up again. SKIP
 * LOCKED keeps two API instances from building the same one.
 */
export const claimNextDataExportRepository = async (): Promise<{ id: string, user_id: string, attempts: number } | null> => {
    const result = await pg.query(`
    UPDATE user_data_exports
    SET status = 'processing', started_at = NOW(), attempts = attempts + 1
    WHERE id = (
        SELECT id
        FROM user_data_exports
        WHERE status = 'pending'
            OR (status = 'processing' AND started_at < NOW() - INTERVAL '15 minutes')
        ORDER BY requested_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id, user_id, attempts
    `);
    return result.rows[0] ?? null;
}

export const completeDataExportRepository = async (exportId: string, content: Buffer) => {
    await pg.query(`
    UPDATE user_data_exports
    SET status = 'ready', content = $2, size_bytes = $3, completed_at = NOW(),
        expires_at = NOW() + ($4 || ' days')::interval, error = NULL
    WHERE id = $1
    `, [exportId, content, content.length, String(DATA_EXPORT_TTL_DAYS)]);
}

export const failDataExportRepository = async (exportId: string, error: string) => {
    await pg.query(`
    UPDATE user_data_exports
    SET status = 'failed', completed_at = NOW(), error = $2
    WHERE id = $1
    `, [exportId, error.slice(0, 500)]);
}

/** Puts an export whose build failed back in the queue for another try. */
export const requeueDataExportRepository = async (exportId: string) => {
    await pg.query(`UPDATE user_data_exports SET status = 'pending' WHERE id = $1`, [exportId]);
}

/** Drops the file of exports past their download window; the row stays as history. */
export const expireDataExportsRepository = async (): Promise<number> => {
    const result = await pg.query(`
    UPDATE user_data_exports
    SET status = 'expired', content = NULL
    WHERE status = 'ready' AND expires_at <= NOW()
    `);
    return result.rowCount ?? 0;
}

// Column names that hold secrets; never written into an export.
const SECRET_COLUMN = /(^password|_hash$|_enc$|token)/;

const withoutSecrets = (rows: Record<string, unknown>[]) =>
    rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !SECRET_COLUMN.test(key))));

/**
 * Everything stored about a user, for their data export: the account,
 * settings, body weight, goals, plans they own, every workout and set, check-
 * ins, notifications and signed-in devices. Secrets (password and token
 * hashes) are left out.
 */
export const fetchUserDataForExportRepository = async (userId: string) => {
    const client = await pg.connect();
    const all = async (sql: string) => withoutSecrets((await client.query(sql, [userId])).rows);
    try {
        // One snapshot, so the sections agree with each other.
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const ownVersions = `SELECT id FROM workout_program_versions WHERE added_by_user_id = $1`;
        const data = {
            account: (await all(`SELECT * FROM users WHERE id = $1`))[0] ?? null,
            preferences: (await all(`SELECT * FROM user_health_preferences WHERE user_id = $1`))[0] ?? null,
            body_weight: {
                entries: await all(`SELECT * FROM user_weight_entries WHERE user_id = $1 ORDER BY date`),
                moving_averages: await all(`SELECT * FROM user_weight_moving_averages WHERE user_id = $1 ORDER BY date`),
                saved_views: await all(`SELECT * FROM user_weight_views WHERE user_id = $1 ORDER BY created_at`),
                goals: await all(`SELECT * FROM user_weight_goals WHERE user_id = $1 ORDER BY created_at`),
            },
            plans: {
                assignments: await all(`SELECT * FROM user_program_assignments WHERE user_id = $1 ORDER BY created_at`),
                own_programs: await all(`SELECT * FROM workout_programs WHERE added_by_user_id = $1 ORDER BY created_at`),
                own_versions: await all(`SELECT * FROM workout_program_versions WHERE added_by_user_id = $1 ORDER BY created_at`),
                own_days: await all(`SELECT * FROM program_days WHERE workout_program_version_id IN (${ownVersions}) ORDER BY day_number`),
                own_sessions: await all(`SELECT * FROM program_day_sessions WHERE workout_program_version_id IN (${ownVersions}) ORDER BY created_at`),
                own_exercises: await all(`
                    SELECT wpe.*, e.name AS exercise_name
                    FROM workout_program_exercises wpe
                    INNER JOIN exercises e ON e.id = wpe.exercise_id
                    WHERE wpe.workout_program_version_id IN (${ownVersions}) AND wpe.workout_session_id IS NULL
                    ORDER BY wpe.workout_program_day_session_id, wpe.exercise_order`),
            },
            workouts: {
                sessions: await all(`SELECT * FROM workout_sessions WHERE user_id = $1 ORDER BY started_at`),
                sets: await all(`
                    SELECT ws.*, wpe.exercise_id, e.name AS exercise_name
                    FROM workout_sets ws
                    INNER JOIN workout_sessions s ON s.id = ws.workout_session_id
                    INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
                    INNER JOIN exercises e ON e.id = wpe.exercise_id
                    WHERE s.user_id = $1
                    ORDER BY ws.created_at`),
                alarms: await all(`SELECT * FROM workout_set_alarms WHERE user_id = $1 ORDER BY created_at`),
                muscle_signals: await all(`SELECT * FROM user_muscle_signals WHERE user_id = $1`),
            },
            weekly_checkins: await all(`SELECT * FROM user_weekly_checkins WHERE user_id = $1 ORDER BY created_at`),
            notifications: await all(`SELECT * FROM user_notifications WHERE user_id = $1 ORDER BY created_at`),
            ai_requests: await all(`SELECT * FROM ai_requests WHERE user_id = $1 ORDER BY created_at`),
            signed_in_devices: await all(`SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY created_at`),
            data_exports: await all(`SELECT id, status, requested_at, completed_at, expires_at FROM user_data_exports WHERE user_id = $1 ORDER BY requested_at`),
        };
        await client.query("COMMIT");
        return data;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/**
 * Schedules the account for deletion and signs it out everywhere (every
 * session is removed, so access tokens stop working too). Returns the date
 * it will be deleted.
 */
export const scheduleAccountDeletionRepository = async (userId: string): Promise<Date> => {
    const client = await pg.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(`
        UPDATE users
        SET deletion_requested_at = NOW(),
            deletion_scheduled_for = NOW() + ($2 || ' days')::interval,
            updated_at = NOW()
        WHERE id = $1
        RETURNING deletion_scheduled_for
        `, [userId, String(ACCOUNT_DELETION_GRACE_DAYS)]);
        await client.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
        await client.query("COMMIT");
        return result.rows[0].deletion_scheduled_for;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

export const cancelAccountDeletionRepository = async (userId: string): Promise<void> => {
    await pg.query(`
    UPDATE users
    SET deletion_requested_at = NULL, deletion_scheduled_for = NULL, updated_at = NOW()
    WHERE id = $1
    `, [userId]);
}

/** Up to `limit` accounts whose deletion date has passed. */
export const fetchAccountsDueForDeletionRepository = async (limit: number): Promise<string[]> => {
    const result = await pg.query(`
    SELECT id FROM users
    WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for <= NOW()
    ORDER BY deletion_scheduled_for
    LIMIT $1
    `, [limit]);
    return result.rows.map((row) => row.id);
}

/**
 * Adds the user's training to analytics_exercise_monthly (exercise, month,
 * counts only; see migration 041). Working sets only: no warm-ups, no drop
 * sets. Each exercise-month adds 1 to `people`.
 */
const foldIntoAnonymousTotals = async (client: PoolClient, userId: string) => {
    await client.query(`
    INSERT INTO analytics_exercise_monthly (month, exercise_id, people, sessions, working_sets, reps)
    SELECT date_trunc('month', s.started_at)::date,
        wpe.exercise_id,
        1,
        COUNT(DISTINCT s.id),
        COUNT(*),
        COALESCE(SUM(ws.reps), 0)
    FROM workout_sets ws
    INNER JOIN workout_sessions s ON s.id = ws.workout_session_id
    INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
    WHERE s.user_id = $1
        AND s.deleted_at IS NULL
        AND ws.is_warmup = FALSE
        AND ws.parent_set_id IS NULL
    GROUP BY 1, 2
    ON CONFLICT (month, exercise_id) DO UPDATE
    SET people = analytics_exercise_monthly.people + EXCLUDED.people,
        sessions = analytics_exercise_monthly.sessions + EXCLUDED.sessions,
        working_sets = analytics_exercise_monthly.working_sets + EXCLUDED.working_sets,
        reps = analytics_exercise_monthly.reps + EXCLUDED.reps
    `, [userId]);
}

/**
 * Deletes an account whose deletion date has passed: first its training is
 * folded into the anonymous totals, then every row about the user is deleted,
 * in foreign-key order, and finally the users row. One transaction, so a
 * failure leaves the account whole (it is retried on the next run). Returns
 * false if the account is gone or no longer due (cancelled meanwhile).
 */
export const purgeAccountRepository = async (userId: string): Promise<boolean> => {
    const client = await pg.connect();
    const run = (sql: string) => client.query(sql, [userId]);
    try {
        await client.query("BEGIN");
        // Locks the row, so a sign-in cancelling the deletion right now waits
        // for this, then finds no account (or this sees the cancellation).
        const due = await client.query(`
        SELECT id, email, phone_country_code, phone_number
        FROM users
        WHERE id = $1 AND deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for <= NOW()
        FOR UPDATE
        `, [userId]);
        if (!due.rowCount) {
            await client.query("ROLLBACK");
            return false;
        }
        const { email, phone_country_code, phone_number } = due.rows[0];

        await foldIntoAnonymousTotals(client, userId);

        const sessions = `SELECT id FROM workout_sessions WHERE user_id = $1`;
        const versions = `SELECT id FROM workout_program_versions WHERE added_by_user_id = $1`;

        // Workouts and everything hanging off them.
        await run(`DELETE FROM workout_set_alarms WHERE user_id = $1`);
        await run(`DELETE FROM workout_sets WHERE workout_session_id IN (${sessions})`);
        await run(`UPDATE workout_program_exercises SET targets_from_workout_session_id = NULL WHERE targets_from_workout_session_id IN (${sessions})`);
        await run(`DELETE FROM workout_program_exercises WHERE workout_session_id IN (${sessions})`);
        await run(`DELETE FROM user_weekly_checkins WHERE user_id = $1`);
        await run(`DELETE FROM workout_sessions WHERE user_id = $1`);
        await run(`DELETE FROM user_program_assignments WHERE user_id = $1`);

        // The user's own plan copies, and any plan row they added anywhere.
        // (Rows must have exactly one creator, so they can't be kept without
        // the user; users only ever add rows to their own copies anyway.)
        await run(`DELETE FROM workout_program_exercises WHERE workout_program_version_id IN (${versions}) OR added_by_user_id = $1`);
        await run(`DELETE FROM program_day_sessions WHERE workout_program_version_id IN (${versions}) OR added_by_user_id = $1`);
        await run(`DELETE FROM program_days WHERE workout_program_version_id IN (${versions}) OR added_by_user_id = $1`);
        await run(`DELETE FROM workout_program_versions WHERE added_by_user_id = $1`);
        await run(`DELETE FROM workout_programs WHERE added_by_user_id = $1`);

        // Body weight, settings and the rest.
        for (const table of [
            "user_muscle_signals",
            "user_weight_moving_averages",
            "user_weight_entries",
            "user_weight_views",
            "user_weight_goals",
            "user_health_preferences",
            "user_notifications",
            "user_data_exports",
            "user_sessions",
        ]) {
            await run(`DELETE FROM ${table} WHERE user_id = $1`);
        }
        // Usage counts stay for the daily AI limit; they hold no content.
        await run(`UPDATE ai_requests SET user_id = NULL WHERE user_id = $1`);

        // Sign-in codes are keyed by email / phone, not user id.
        if (email) {
            await client.query(`DELETE FROM otp_auth WHERE email = $1`, [email]);
        }
        if (phone_number) {
            await client.query(
                `DELETE FROM otp_auth WHERE phone_country_code = $1 AND phone_number = $2`,
                [phone_country_code, phone_number],
            );
        }

        await run(`DELETE FROM users WHERE id = $1`);
        await client.query("COMMIT");
        return true;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}
