import { pg } from "../../../infrastructure/postgres/index.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { UserWeeklyCheckinsInterface } from "../../../db/schemas/users/checkins/userWeeklyCheckins.schema.js";

// All date parameters are "YYYY-MM-DD" calendar days in the user's timezone
// ($2); dates come back as text for the reason given in
// fetchWorkedOutDatesRepository.

export interface WeekSessionSummaryRow {
    sessions: number;
    avg_duration_seconds: number | null;
    /** Completed workouts in the 3 weeks before this one. */
    prior_sessions: number;
    dates: string[];
}

export const fetchWeekSessionSummaryRepository = async (
    userId: string,
    timezone: string,
    weekStart: string,
    weekEnd: string,
): Promise<WeekSessionSummaryRow> => {
    const query = `
    WITH sessions AS (
        SELECT
            started_at,
            completed_at,
            (completed_at AT TIME ZONE $2)::date AS d
        FROM workout_sessions
        WHERE user_id = $1
            AND completed_at IS NOT NULL
            AND deleted_at IS NULL
            AND (completed_at AT TIME ZONE $2)::date BETWEEN ($3::date - 21) AND $4::date
    )
    SELECT
        COUNT(*) FILTER (WHERE d >= $3::date) AS sessions,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE d >= $3::date) AS avg_duration_seconds,
        COUNT(*) FILTER (WHERE d < $3::date) AS prior_sessions,
        COALESCE(ARRAY_AGG(DISTINCT to_char(d, 'YYYY-MM-DD')) FILTER (WHERE d >= $3::date), '{}') AS dates
    FROM sessions
    `;
    try {
        const result = await pg.query(query, [userId, timezone, weekStart, weekEnd]);
        const row = result.rows[0];
        return {
            sessions: Number(row?.sessions ?? 0),
            avg_duration_seconds: row?.avg_duration_seconds != null ? Number(row.avg_duration_seconds) : null,
            prior_sessions: Number(row?.prior_sessions ?? 0),
            dates: row?.dates ?? [],
        };
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to summarise the week's workouts", 500);
    }
}

/** Non-warmup main sets logged in the week, and how many of them carried a discomfort note. */
export const fetchWeekSetCountsRepository = async (
    userId: string,
    timezone: string,
    weekStart: string,
    weekEnd: string,
): Promise<{ working_sets: number, sets_with_discomfort: number }> => {
    const query = `
    SELECT
        COUNT(*) FILTER (WHERE ws.parent_set_id IS NULL) AS working_sets,
        COUNT(*) FILTER (WHERE NULLIF(TRIM(ws.discomfort_notes), '') IS NOT NULL) AS sets_with_discomfort
    FROM workout_sets ws
    INNER JOIN workout_sessions wsess ON wsess.id = ws.workout_session_id
    WHERE wsess.user_id = $1
        AND ws.deleted_at IS NULL
        AND wsess.deleted_at IS NULL
        AND ws.is_warmup = FALSE
        AND (ws.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
    `;
    try {
        const result = await pg.query(query, [userId, timezone, weekStart, weekEnd]);
        return {
            working_sets: Number(result.rows[0]?.working_sets ?? 0),
            sets_with_discomfort: Number(result.rows[0]?.sets_with_discomfort ?? 0),
        };
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to count the week's sets", 500);
    }
}

export interface MuscleContractionRow {
    muscle_id: string;
    muscle_name: string;
    exercise_name: string;
    /** Rated working sets of this exercise in the 3 weeks ending week_end. */
    rated_sets: number;
    /** Of those, how many were logged in the week itself. */
    week_rated_sets: number;
    avg_contraction: number;
}

/**
 * Contraction scores per (muscle, exercise) over this week and the 2 before,
 * counting only exercises where the muscle is a main target (contribution
 * >= minContribution). Main, non-warmup, rated sets only.
 */
export const fetchMuscleContractionRepository = async (
    userId: string,
    timezone: string,
    weekStart: string,
    weekEnd: string,
    minContribution: number,
): Promise<MuscleContractionRow[]> => {
    const query = `
    SELECT
        m.id AS muscle_id,
        m.name AS muscle_name,
        e.name AS exercise_name,
        COUNT(*) AS rated_sets,
        COUNT(*) FILTER (WHERE (ws.created_at AT TIME ZONE $2)::date >= $3::date) AS week_rated_sets,
        AVG(ws.contraction) AS avg_contraction
    FROM workout_sets ws
    INNER JOIN workout_sessions wsess ON wsess.id = ws.workout_session_id
    INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
    INNER JOIN exercises e ON e.id = wpe.exercise_id
    INNER JOIN exercise_muscles em
        ON em.exercise_id = wpe.exercise_id
        AND em.deleted_at IS NULL
        AND em.contribution >= $5
    INNER JOIN muscles m
        ON m.id = em.muscle_id
        AND m.deleted_at IS NULL
        AND m.xp_enabled = TRUE
    WHERE wsess.user_id = $1
        AND ws.deleted_at IS NULL
        AND wsess.deleted_at IS NULL
        AND ws.is_warmup = FALSE
        AND ws.parent_set_id IS NULL
        AND ws.contraction IS NOT NULL
        AND (ws.created_at AT TIME ZONE $2)::date BETWEEN ($3::date - 14) AND $4::date
    GROUP BY m.id, m.name, e.id, e.name
    `;
    try {
        const result = await pg.query(query, [userId, timezone, weekStart, weekEnd, minContribution]);
        return result.rows.map((row) => ({
            muscle_id: row.muscle_id,
            muscle_name: row.muscle_name,
            exercise_name: row.exercise_name,
            rated_sets: Number(row.rated_sets),
            week_rated_sets: Number(row.week_rated_sets),
            avg_contraction: Number(row.avg_contraction),
        }));
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to summarise contraction scores", 500);
    }
}

export interface MuscleWeekSetsRow {
    name: string;
    /** Sets this week, each weighted by the exercise's contribution to the muscle. */
    week_sets: number;
    /** Same, averaged over the 3 weeks before. */
    usual_sets: number;
}

export const fetchMuscleWeekSetsRepository = async (
    userId: string,
    timezone: string,
    weekStart: string,
    weekEnd: string,
): Promise<MuscleWeekSetsRow[]> => {
    const query = `
    WITH muscle_sets AS (
        SELECT
            (ws.created_at AT TIME ZONE $2)::date AS d,
            em.muscle_id,
            em.contribution
        FROM workout_sets ws
        INNER JOIN workout_sessions wsess ON wsess.id = ws.workout_session_id
        INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
        INNER JOIN exercise_muscles em
            ON em.exercise_id = wpe.exercise_id
            AND em.deleted_at IS NULL
        WHERE wsess.user_id = $1
            AND ws.deleted_at IS NULL
            AND wsess.deleted_at IS NULL
            AND ws.is_warmup = FALSE
            AND ws.parent_set_id IS NULL
            AND (ws.created_at AT TIME ZONE $2)::date BETWEEN ($3::date - 21) AND $4::date
    )
    SELECT
        m.name,
        COALESCE(SUM(ms.contribution) FILTER (WHERE ms.d >= $3::date), 0) AS week_sets,
        COALESCE(SUM(ms.contribution) FILTER (WHERE ms.d < $3::date), 0) / 3.0 AS usual_sets
    FROM muscle_sets ms
    INNER JOIN muscles m
        ON m.id = ms.muscle_id
        AND m.deleted_at IS NULL
        AND m.xp_enabled = TRUE
    GROUP BY m.id, m.name
    `;
    try {
        const result = await pg.query(query, [userId, timezone, weekStart, weekEnd]);
        return result.rows.map((row) => ({
            name: row.name,
            week_sets: Number(row.week_sets),
            usual_sets: Number(row.usual_sets),
        }));
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to compute sets per muscle", 500);
    }
}

export interface ExerciseWeekProgressRow {
    name: string;
    best_week_e1rm: number;
    best_week_load: number;
    best_week_reps: number;
    /** Best e1RM ever before this week; null if the exercise is new this week. */
    best_before_e1rm: number | null;
    /** Best e1RM in the last 3 weeks (this week + the 2 before). */
    best_recent_e1rm: number;
    /** Best e1RM before those 3 weeks; null if there is no older history. */
    best_older_e1rm: number | null;
    sessions_recent: number;
}

/**
 * Every exercise trained this week, with its best set (Epley e1RM, same
 * eligibility as personal records, fetchRecentPRsRepository) this week, before this
 * week, and over the last 3 weeks vs. before them.
 */
export const fetchExerciseWeekProgressRepository = async (
    userId: string,
    timezone: string,
    weekStart: string,
    weekEnd: string,
): Promise<ExerciseWeekProgressRow[]> => {
    const query = `
    WITH eligible_sets AS (
        SELECT
            wpe.exercise_id,
            ws.workout_session_id,
            (ws.created_at AT TIME ZONE $2)::date AS d,
            (COALESCE(ws.weight, 0) + COALESCE(ws.tool_weight, 0)) AS load,
            ws.reps,
            (COALESCE(ws.weight, 0) + COALESCE(ws.tool_weight, 0)) * (1 + ws.reps / 30.0) AS e1rm
        FROM workout_sets ws
        INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
        INNER JOIN workout_sessions wsess ON wsess.id = ws.workout_session_id
        WHERE wsess.user_id = $1
            AND ws.deleted_at IS NULL
            AND wsess.deleted_at IS NULL
            AND ws.is_warmup = FALSE
            AND ws.parent_set_id IS NULL
            AND ws.reps IS NOT NULL
            AND ws.reps > 0
            AND (COALESCE(ws.weight, 0) + COALESCE(ws.tool_weight, 0)) > 0
            AND (ws.created_at AT TIME ZONE $2)::date <= $4::date
    )
    SELECT
        e.name,
        MAX(s.e1rm) FILTER (WHERE s.d >= $3::date) AS best_week_e1rm,
        (ARRAY_AGG(s.load ORDER BY s.e1rm DESC) FILTER (WHERE s.d >= $3::date))[1] AS best_week_load,
        (ARRAY_AGG(s.reps ORDER BY s.e1rm DESC) FILTER (WHERE s.d >= $3::date))[1] AS best_week_reps,
        MAX(s.e1rm) FILTER (WHERE s.d < $3::date) AS best_before_e1rm,
        MAX(s.e1rm) FILTER (WHERE s.d >= $3::date - 14) AS best_recent_e1rm,
        MAX(s.e1rm) FILTER (WHERE s.d < $3::date - 14) AS best_older_e1rm,
        COUNT(DISTINCT s.workout_session_id) FILTER (WHERE s.d >= $3::date - 14) AS sessions_recent
    FROM eligible_sets s
    INNER JOIN exercises e ON e.id = s.exercise_id
    GROUP BY s.exercise_id, e.name
    HAVING MAX(s.d) >= $3::date
    `;
    const num = (v: unknown) => (v == null ? null : Number(v));
    try {
        const result = await pg.query(query, [userId, timezone, weekStart, weekEnd]);
        return result.rows.map((row) => ({
            name: row.name,
            best_week_e1rm: Number(row.best_week_e1rm),
            best_week_load: Number(row.best_week_load),
            best_week_reps: Number(row.best_week_reps),
            best_before_e1rm: num(row.best_before_e1rm),
            best_recent_e1rm: Number(row.best_recent_e1rm),
            best_older_e1rm: num(row.best_older_e1rm),
            sessions_recent: Number(row.sessions_recent),
        }));
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to compute exercise progress", 500);
    }
}

export const fetchWeightEntriesBetweenRepository = async (
    userId: string,
    fromDate: string,
    toDate: string,
): Promise<{ date: string, weight: number }[]> => {
    const query = `
    SELECT to_char(date, 'YYYY-MM-DD') AS date, weight
    FROM user_weight_entries
    WHERE user_id = $1
        AND deleted_at IS NULL
        AND date BETWEEN $2::date AND $3::date
    ORDER BY date ASC
    `;
    try {
        const result = await pg.query(query, [userId, fromDate, toDate]);
        return result.rows.map((row) => ({ date: row.date, weight: Number(row.weight) }));
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch weight entries", 500);
    }
}

/** Latest weigh-in and latest completed workout on or before `onOrBefore` (user's timezone). */
export const fetchLastActivityRepository = async (
    userId: string,
    timezone: string,
    onOrBefore: string,
): Promise<{ last_weigh_in: string | null, last_workout: string | null }> => {
    const query = `
    SELECT
        (
            SELECT to_char(MAX(date), 'YYYY-MM-DD')
            FROM user_weight_entries
            WHERE user_id = $1
                AND deleted_at IS NULL
                AND date <= $3::date
        ) AS last_weigh_in,
        (
            SELECT to_char(MAX((completed_at AT TIME ZONE $2)::date), 'YYYY-MM-DD')
            FROM workout_sessions
            WHERE user_id = $1
                AND completed_at IS NOT NULL
                AND deleted_at IS NULL
                AND (completed_at AT TIME ZONE $2)::date <= $3::date
        ) AS last_workout
    `;
    try {
        const result = await pg.query(query, [userId, timezone, onOrBefore]);
        return {
            last_weigh_in: result.rows[0]?.last_weigh_in ?? null,
            last_workout: result.rows[0]?.last_workout ?? null,
        };
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch last activity", 500);
    }
}

// ---------------------------------------------------------------------------
// Check-in rows
// ---------------------------------------------------------------------------

const CHECKIN_COLUMNS = `
    id,
    user_id,
    to_char(week_start, 'YYYY-MM-DD') AS week_start,
    status,
    stats,
    skip_reasons,
    content,
    model,
    attempts,
    next_retry_at,
    generated_at,
    dismissed_at,
    deleted_at,
    created_at,
    updated_at
`;

/** A 'pending' claim older than this is assumed to belong to a crashed request. */
const STALE_PENDING_INTERVAL = "2 minutes";

export const fetchWeeklyCheckinRepository = async (
    userId: string,
    weekStart: string,
): Promise<UserWeeklyCheckinsInterface | null> => {
    const query = `
    SELECT ${CHECKIN_COLUMNS}
    FROM user_weekly_checkins
    WHERE user_id = $1
        AND week_start = $2::date
        AND deleted_at IS NULL
    `;
    try {
        const result = await pg.query(query, [userId, weekStart]);
        return result.rows[0] ?? null;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch weekly check-in", 500);
    }
}

export const fetchWeeklyCheckinByIdRepository = async (
    id: string,
): Promise<UserWeeklyCheckinsInterface | null> => {
    const query = `
    SELECT ${CHECKIN_COLUMNS}
    FROM user_weekly_checkins
    WHERE id = $1
        AND deleted_at IS NULL
    `;
    try {
        const result = await pg.query(query, [id]);
        return result.rows[0] ?? null;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch weekly check-in", 500);
    }
}

/**
 * Makes a failed check-in due for retry right now (NULL counts as due both
 * here and in the claim). Returns null unless the row exists and is 'failed'.
 */
export const makeWeeklyCheckinRetryDueRepository = async (
    id: string,
): Promise<UserWeeklyCheckinsInterface | null> => {
    const query = `
    UPDATE user_weekly_checkins
    SET next_retry_at = NULL
    WHERE id = $1
        AND status = 'failed'
        AND deleted_at IS NULL
    RETURNING ${CHECKIN_COLUMNS}
    `;
    try {
        const result = await pg.query(query, [id]);
        return result.rows[0] ?? null;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to update weekly check-in", 500);
    }
}

/**
 * Claims the week for generation: inserts a 'pending' row, or takes over one
 * that is due a retry (failed past its retry time, or pending and stale).
 * Returns null when another request holds the claim — the unique index and
 * the conditional UPDATE make exactly one caller win.
 */
export const claimWeeklyCheckinRepository = async (
    userId: string,
    weekStart: string,
    stats: unknown,
): Promise<UserWeeklyCheckinsInterface | null> => {
    const insert = `
    INSERT INTO user_weekly_checkins (user_id, week_start, status, stats, attempts)
    VALUES ($1, $2::date, 'pending', $3::jsonb, 1)
    ON CONFLICT (user_id, week_start) WHERE deleted_at IS NULL DO NOTHING
    RETURNING ${CHECKIN_COLUMNS}
    `;
    const takeOver = `
    UPDATE user_weekly_checkins
    SET status = 'pending',
        stats = $3::jsonb,
        skip_reasons = NULL,
        attempts = attempts + 1
    WHERE user_id = $1
        AND week_start = $2::date
        AND deleted_at IS NULL
        AND (
            (status IN ('failed', 'skipped') AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
            OR (status = 'pending' AND updated_at < NOW() - INTERVAL '${STALE_PENDING_INTERVAL}')
        )
    RETURNING ${CHECKIN_COLUMNS}
    `;
    const params = [userId, weekStart, JSON.stringify(stats)];
    try {
        const inserted = await pg.query(insert, params);
        if (inserted.rows[0]) return inserted.rows[0];
        const updated = await pg.query(takeOver, params);
        return updated.rows[0] ?? null;
    } catch (error) {
        // console.log(error);
        throw new AppError("Failed to claim weekly check-in", 500);
    }
}

/**
 * Records that the week didn't qualify for a model call. Only creates the
 * row or refreshes one that is already 'skipped' — a check-in that was
 * claimed or written in the meantime is left alone (returns null).
 */
export const saveSkippedWeeklyCheckinRepository = async (
    userId: string,
    weekStart: string,
    stats: unknown,
    skipReasons: unknown,
    nextRetryAt: Date,
): Promise<UserWeeklyCheckinsInterface | null> => {
    const query = `
    INSERT INTO user_weekly_checkins (user_id, week_start, status, stats, skip_reasons, next_retry_at)
    VALUES ($1, $2::date, 'skipped', $3::jsonb, $4::jsonb, $5)
    ON CONFLICT (user_id, week_start) WHERE deleted_at IS NULL DO UPDATE
    SET stats = EXCLUDED.stats,
        skip_reasons = EXCLUDED.skip_reasons,
        next_retry_at = EXCLUDED.next_retry_at
    WHERE user_weekly_checkins.status = 'skipped'
    RETURNING ${CHECKIN_COLUMNS}
    `;
    try {
        const result = await pg.query(query, [userId, weekStart, JSON.stringify(stats), JSON.stringify(skipReasons), nextRetryAt]);
        return result.rows[0] ?? null;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to save weekly check-in", 500);
    }
}

export const completeWeeklyCheckinRepository = async (
    id: string,
    content: unknown,
    model: string,
): Promise<UserWeeklyCheckinsInterface> => {
    const query = `
    UPDATE user_weekly_checkins
    SET status = 'ready',
        content = $2::jsonb,
        model = $3,
        next_retry_at = NULL,
        generated_at = NOW()
    WHERE id = $1
    RETURNING ${CHECKIN_COLUMNS}
    `;
    try {
        const result = await pg.query(query, [id, JSON.stringify(content), model]);
        return result.rows[0];
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to save weekly check-in", 500);
    }
}

export const failWeeklyCheckinRepository = async (
    id: string,
    nextRetryAt: Date,
): Promise<UserWeeklyCheckinsInterface> => {
    const query = `
    UPDATE user_weekly_checkins
    SET status = 'failed',
        next_retry_at = $2
    WHERE id = $1
    RETURNING ${CHECKIN_COLUMNS}
    `;
    try {
        const result = await pg.query(query, [id, nextRetryAt]);
        return result.rows[0];
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to update weekly check-in", 500);
    }
}

export const dismissWeeklyCheckinRepository = async (
    id: string,
    userId: string,
): Promise<boolean> => {
    const query = `
    UPDATE user_weekly_checkins
    SET dismissed_at = COALESCE(dismissed_at, NOW())
    WHERE id = $1
        AND user_id = $2
        AND deleted_at IS NULL
    `;
    try {
        const result = await pg.query(query, [id, userId]);
        return (result.rowCount ?? 0) > 0;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to dismiss weekly check-in", 500);
    }
}
