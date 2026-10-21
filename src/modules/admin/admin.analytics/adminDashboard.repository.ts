import { pg } from "../../../infrastructure/postgres/index.js";

// Queries behind the admin Dashboard: this week's pulse, what users train
// with, and the content and AI issues an admin can act on. Windows are
// rolling from NOW(); days are UTC.

export interface PulseRow {
    workouts: number;
    sets: number;
    active_users: number;
    new_users: number;
    weigh_ins: number;
}

/**
 * Totals for the last 7 days (`current`) and the 7 days before (`previous`).
 * "Active" here means trained: completed a workout or logged a weigh-in.
 * The Analytics page's DAU/WAU/MAU also count sign-ins.
 */
export const fetchWeeklyPulseRepository = async (): Promise<{ current: PulseRow, previous: PulseRow }> => {
    const result = await pg.query(`
    WITH workouts AS (
        SELECT ws.user_id, ws.completed_at AS at
        FROM workout_sessions ws
        INNER JOIN users u ON u.id = ws.user_id AND u.deleted_at IS NULL
        WHERE ws.deleted_at IS NULL AND ws.completed_at >= NOW() - INTERVAL '14 days'
    ),
    sets AS (
        SELECT s.created_at AS at
        FROM workout_sets s
        INNER JOIN workout_sessions ws ON ws.id = s.workout_session_id AND ws.deleted_at IS NULL
        INNER JOIN users u ON u.id = ws.user_id AND u.deleted_at IS NULL
        WHERE s.deleted_at IS NULL AND s.created_at >= NOW() - INTERVAL '14 days'
    ),
    weigh_ins AS (
        SELECT w.user_id, w.created_at AS at
        FROM user_weight_entries w
        INNER JOIN users u ON u.id = w.user_id AND u.deleted_at IS NULL
        WHERE w.deleted_at IS NULL AND w.created_at >= NOW() - INTERVAL '14 days'
    ),
    actives AS (
        SELECT user_id, at FROM workouts
        UNION ALL
        SELECT user_id, at FROM weigh_ins
    ),
    signups AS (
        SELECT created_at AS at
        FROM users
        WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '14 days'
    )
    SELECT
        (SELECT COUNT(*) FROM workouts WHERE at >= NOW() - INTERVAL '7 days')::int AS cur_workouts,
        (SELECT COUNT(*) FROM workouts WHERE at < NOW() - INTERVAL '7 days')::int AS prev_workouts,
        (SELECT COUNT(*) FROM sets WHERE at >= NOW() - INTERVAL '7 days')::int AS cur_sets,
        (SELECT COUNT(*) FROM sets WHERE at < NOW() - INTERVAL '7 days')::int AS prev_sets,
        (SELECT COUNT(DISTINCT user_id) FROM actives WHERE at >= NOW() - INTERVAL '7 days')::int AS cur_active_users,
        (SELECT COUNT(DISTINCT user_id) FROM actives WHERE at < NOW() - INTERVAL '7 days')::int AS prev_active_users,
        (SELECT COUNT(*) FROM signups WHERE at >= NOW() - INTERVAL '7 days')::int AS cur_new_users,
        (SELECT COUNT(*) FROM signups WHERE at < NOW() - INTERVAL '7 days')::int AS prev_new_users,
        (SELECT COUNT(*) FROM weigh_ins WHERE at >= NOW() - INTERVAL '7 days')::int AS cur_weigh_ins,
        (SELECT COUNT(*) FROM weigh_ins WHERE at < NOW() - INTERVAL '7 days')::int AS prev_weigh_ins
    `);
    const r = result.rows[0];
    return {
        current: {
            workouts: r.cur_workouts,
            sets: r.cur_sets,
            active_users: r.cur_active_users,
            new_users: r.cur_new_users,
            weigh_ins: r.cur_weigh_ins,
        },
        previous: {
            workouts: r.prev_workouts,
            sets: r.prev_sets,
            active_users: r.prev_active_users,
            new_users: r.prev_new_users,
            weigh_ins: r.prev_weigh_ins,
        },
    };
}

/** Completed workouts and distinct users who trained, per UTC day, for the last `days` days (zero-filled). */
export const fetchWorkoutsPerDayRepository = async (days: number): Promise<{ date: string, workouts: number, users: number }[]> => {
    const result = await pg.query(`
    WITH days AS (
        SELECT generate_series(
            (NOW() AT TIME ZONE 'UTC')::date - ($1::int - 1),
            (NOW() AT TIME ZONE 'UTC')::date,
            INTERVAL '1 day'
        )::date AS day
    )
    SELECT
        to_char(d.day, 'YYYY-MM-DD') AS date,
        COUNT(ws.id)::int AS workouts,
        COUNT(DISTINCT ws.user_id)::int AS users
    FROM days d
    LEFT JOIN workout_sessions ws
        ON (ws.completed_at AT TIME ZONE 'UTC')::date = d.day
        AND ws.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = ws.user_id AND u.deleted_at IS NULL)
    GROUP BY d.day
    ORDER BY d.day
    `, [days]);
    return result.rows;
}

/**
 * System (admin-made) programs by how many users currently follow them,
 * counting a user's own copy of a program (030) as following the original.
 */
export const fetchTopProgramsRepository = async (limit: number): Promise<{ id: string, name: string, active_users: number }[]> => {
    const result = await pg.query(`
    SELECT
        p.id,
        p.name,
        COUNT(DISTINCT upa.user_id)::int AS active_users
    FROM workout_programs p
    INNER JOIN workout_programs followed
        ON (followed.id = p.id OR followed.source_workout_program_id = p.id)
        AND followed.deleted_at IS NULL
    INNER JOIN workout_program_versions v
        ON v.workout_program_id = followed.id AND v.deleted_at IS NULL
    INNER JOIN user_program_assignments upa
        ON upa.workout_program_version_id = v.id
        AND upa.is_active = TRUE
        AND upa.deleted_at IS NULL
    INNER JOIN users u ON u.id = upa.user_id AND u.deleted_at IS NULL
    WHERE p.added_by_admin_user_id IS NOT NULL
        AND p.deleted_at IS NULL
    GROUP BY p.id, p.name
    ORDER BY active_users DESC, p.name
    LIMIT $1
    `, [limit]);
    return result.rows;
}

/** Exercises by working sets logged in the last 30 days. */
export const fetchTopExercisesRepository = async (limit: number): Promise<{ id: string, name: string, sets: number, users: number }[]> => {
    const result = await pg.query(`
    SELECT
        e.id,
        e.name,
        COUNT(s.id)::int AS sets,
        COUNT(DISTINCT ws.user_id)::int AS users
    FROM workout_sets s
    INNER JOIN workout_sessions ws ON ws.id = s.workout_session_id AND ws.deleted_at IS NULL
    INNER JOIN users u ON u.id = ws.user_id AND u.deleted_at IS NULL
    INNER JOIN workout_program_exercises wpe ON wpe.id = s.workout_program_exercise_id
    INNER JOIN exercises e ON e.id = wpe.exercise_id AND e.deleted_at IS NULL
    WHERE s.deleted_at IS NULL
        AND s.is_warmup = FALSE
        AND s.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY e.id, e.name
    ORDER BY sets DESC, e.name
    LIMIT $1
    `, [limit]);
    return result.rows;
}

/**
 * Gaps in the public library an admin can fix: exercises with no image or no
 * muscles mapped (muscle signals and the body map need them), and system
 * programs with no version (users can't start them).
 */
export const fetchContentHealthRepository = async (): Promise<{
    exercises: number,
    exercises_without_image: number,
    exercises_without_muscles: number,
    muscles: number,
    programs: number,
    programs_without_version: number,
}> => {
    const result = await pg.query(`
    SELECT
        (SELECT COUNT(*) FROM exercises e
            WHERE e.deleted_at IS NULL AND e.added_by_admin_user_id IS NOT NULL)::int AS exercises,
        (SELECT COUNT(*) FROM exercises e
            WHERE e.deleted_at IS NULL AND e.added_by_admin_user_id IS NOT NULL
                AND (e.image_url IS NULL OR e.image_url = ''))::int AS exercises_without_image,
        (SELECT COUNT(*) FROM exercises e
            WHERE e.deleted_at IS NULL AND e.added_by_admin_user_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM exercise_muscles em WHERE em.exercise_id = e.id))::int AS exercises_without_muscles,
        (SELECT COUNT(*) FROM muscles m WHERE m.deleted_at IS NULL)::int AS muscles,
        (SELECT COUNT(*) FROM workout_programs p
            WHERE p.deleted_at IS NULL AND p.added_by_admin_user_id IS NOT NULL)::int AS programs,
        (SELECT COUNT(*) FROM workout_programs p
            WHERE p.deleted_at IS NULL AND p.added_by_admin_user_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM workout_program_versions v
                    WHERE v.workout_program_id = p.id AND v.deleted_at IS NULL
                ))::int AS programs_without_version
    `);
    return result.rows[0];
}

/** AI calls that failed in the last 24 hours, and weekly check-ins stuck as failed in the last 7 days. */
export const fetchAttentionCountsRepository = async (): Promise<{
    ai_calls_24h: number,
    ai_failures_24h: number,
    checkins_failed_7d: number,
}> => {
    const result = await pg.query(`
    SELECT
        (SELECT COUNT(*) FROM ai_requests
            WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS ai_calls_24h,
        (SELECT COUNT(*) FROM ai_requests
            WHERE created_at >= NOW() - INTERVAL '24 hours' AND status <> 'success')::int AS ai_failures_24h,
        (SELECT COUNT(*) FROM user_weekly_checkins c
            WHERE c.deleted_at IS NULL AND c.status = 'failed'
                AND c.updated_at >= NOW() - INTERVAL '7 days')::int AS checkins_failed_7d
    `);
    return result.rows[0];
}

export interface RecentSignupRow {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone_country_code: string | null;
    phone_number: string | null;
    created_at: Date;
    onboarded_at: Date | null;
}

export const fetchRecentSignupsRepository = async (limit: number): Promise<RecentSignupRow[]> => {
    const result = await pg.query(`
    SELECT id, first_name, last_name, email, phone_country_code, phone_number, created_at, onboarded_at
    FROM users
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $1
    `, [limit]);
    return result.rows;
}
