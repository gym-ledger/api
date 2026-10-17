import { pg } from "../../../infrastructure/postgres/index.js";

/**
 * Read-only queries behind the admin analytics pages. "Active" follows
 * algorithms/user-activity.md everywhere: completed workouts, logged
 * weigh-ins and session sign-ins/refreshes, over rolling windows in UTC.
 *
 * Date ranges are inclusive "YYYY-MM-DD" UTC days, already validated by the
 * service. COUNT/SUM are cast so `pg` returns numbers, not strings.
 */

/** created_at falls on one of the days from..to (UTC). */
const IN_RANGE = (column: string, fromParam: string, toParam: string) =>
    `${column} >= ${fromParam}::date AND ${column} < ${toParam}::date + 1`;

// ---------------------------------------------------------------------------
// AI usage
// ---------------------------------------------------------------------------

export interface AiTotalsRow {
    total: number;
    prompt_tokens: number;
    completion_tokens: number;
    latency_p50_ms: number | null;
    latency_p95_ms: number | null;
}

export const fetchAiTotalsRepository = async (from: string, to: string): Promise<AiTotalsRow> => {
    const result = await pg.query(`
    SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(prompt_tokens), 0)::float8 AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::float8 AS completion_tokens,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)
            FILTER (WHERE latency_ms IS NOT NULL) AS latency_p50_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
            FILTER (WHERE latency_ms IS NOT NULL) AS latency_p95_ms
    FROM ai_requests
    WHERE ${IN_RANGE("created_at", "$1", "$2")}
    `, [from, to]);
    return result.rows[0] as AiTotalsRow;
}

export type AiBreakdownDimension = "status" | "feature" | "model";

export const fetchAiBreakdownRepository = async (
    dimension: AiBreakdownDimension,
    from: string,
    to: string,
): Promise<{ key: string, count: number, tokens: number }[]> => {
    // `dimension` is a fixed union, never user input, so it is safe to inline.
    const result = await pg.query(`
    SELECT
        ${dimension} AS key,
        COUNT(*)::int AS count,
        (COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0))::float8 AS tokens
    FROM ai_requests
    WHERE ${IN_RANGE("created_at", "$1", "$2")}
    GROUP BY ${dimension}
    ORDER BY count DESC
    `, [from, to]);
    return result.rows;
}

/** Today (UTC) by status. */
export const fetchAiTodayByStatusRepository = async (): Promise<{ status: string, count: number }[]> => {
    const result = await pg.query(`
    SELECT status, COUNT(*)::int AS count
    FROM ai_requests
    WHERE created_at >= CURRENT_DATE
    GROUP BY status
    `);
    return result.rows;
}

export interface AiDailyRow {
    date: string;
    total: number;
    success: number;
    failed: number;
    tokens: number;
}

export const fetchAiDailyRepository = async (from: string, to: string, feature: string | null): Promise<AiDailyRow[]> => {
    const result = await pg.query(`
    SELECT
        to_char(d, 'YYYY-MM-DD') AS date,
        COUNT(r.id)::int AS total,
        COUNT(r.id) FILTER (WHERE r.status = 'success')::int AS success,
        COUNT(r.id) FILTER (WHERE r.status <> 'success')::int AS failed,
        COALESCE(SUM(COALESCE(r.prompt_tokens, 0) + COALESCE(r.completion_tokens, 0)), 0)::float8 AS tokens
    FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS d
    LEFT JOIN ai_requests r
        ON r.created_at >= d
        AND r.created_at < d + INTERVAL '1 day'
        AND ($3::text IS NULL OR r.feature = $3::text)
    GROUP BY d
    ORDER BY d
    `, [from, to, feature]);
    return result.rows as AiDailyRow[];
}

export interface CheckinWeekRow {
    week_start: string;
    ready: number;
    failed: number;
    skipped: number;
    pending: number;
}

/** One row per Monday in the range, zero-filled. */
export const fetchCheckinWeeklyOutcomesRepository = async (from: string, to: string): Promise<CheckinWeekRow[]> => {
    const result = await pg.query(`
    SELECT
        to_char(w, 'YYYY-MM-DD') AS week_start,
        COUNT(c.id) FILTER (WHERE c.status = 'ready')::int AS ready,
        COUNT(c.id) FILTER (WHERE c.status = 'failed')::int AS failed,
        COUNT(c.id) FILTER (WHERE c.status = 'skipped')::int AS skipped,
        COUNT(c.id) FILTER (WHERE c.status = 'pending')::int AS pending
    FROM generate_series(date_trunc('week', $1::date), $2::date, INTERVAL '1 week') AS w
    LEFT JOIN user_weekly_checkins c
        ON c.week_start = w::date
        AND c.deleted_at IS NULL
    GROUP BY w
    ORDER BY w
    `, [from, to]);
    return result.rows as CheckinWeekRow[];
}

/**
 * How often each gate requirement (weekly-checkin.md §2) blocked a model
 * call. A skipped week can have more than one reason.
 */
export const fetchCheckinSkipReasonsRepository = async (from: string, to: string): Promise<{
    kind: string,
    count: number,
    long_inactive: number,
}[]> => {
    const result = await pg.query(`
    WITH skipped AS (
        SELECT skip_reasons
        FROM user_weekly_checkins
        WHERE status = 'skipped'
            AND deleted_at IS NULL
            AND jsonb_typeof(skip_reasons) = 'array'
            AND week_start >= date_trunc('week', $1::date)::date
            AND week_start <= $2::date
    )
    SELECT
        r->>'kind' AS kind,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE (r->>'long_inactive')::boolean)::int AS long_inactive
    FROM skipped, jsonb_array_elements(skipped.skip_reasons) AS r
    GROUP BY r->>'kind'
    ORDER BY count DESC
    `, [from, to]);
    return result.rows;
}

/** Totals of model attempts made for check-ins in the range (all weeks). */
export const fetchCheckinTotalsRepository = async (from: string, to: string): Promise<{
    weeks: number,
    users: number,
    attempts: number,
}> => {
    const result = await pg.query(`
    SELECT
        COUNT(*)::int AS weeks,
        COUNT(DISTINCT user_id)::int AS users,
        COALESCE(SUM(attempts), 0)::int AS attempts
    FROM user_weekly_checkins
    WHERE deleted_at IS NULL
        AND week_start >= date_trunc('week', $1::date)::date
        AND week_start <= $2::date
    `, [from, to]);
    return result.rows[0];
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export const fetchActiveUserCountsRepository = async (): Promise<{ dau: number, wau: number, mau: number }> => {
    const result = await pg.query(`
    WITH events AS (
        SELECT user_id, completed_at AS at
        FROM workout_sessions
        WHERE deleted_at IS NULL AND completed_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT user_id, created_at
        FROM user_weight_entries
        WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT user_id, created_at
        FROM user_sessions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT user_id, last_used_at
        FROM user_sessions
        WHERE last_used_at >= NOW() - INTERVAL '30 days'
    )
    SELECT
        COUNT(DISTINCT e.user_id) FILTER (WHERE e.at >= NOW() - INTERVAL '24 hours')::int AS dau,
        COUNT(DISTINCT e.user_id) FILTER (WHERE e.at >= NOW() - INTERVAL '7 days')::int AS wau,
        COUNT(DISTINCT e.user_id)::int AS mau
    FROM events e
    INNER JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL
    `);
    return result.rows[0];
}

export const fetchUserTotalsRepository = async (from: string, to: string): Promise<{
    total_users: number,
    new_users_in_range: number,
    users_with_active_plan: number,
    users_with_goal: number,
}> => {
    const result = await pg.query(`
    SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE ${IN_RANGE("u.created_at", "$1", "$2")})::int AS new_users_in_range,
        COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM user_program_assignments upa
            WHERE upa.user_id = u.id AND upa.is_active = TRUE AND upa.deleted_at IS NULL
        ))::int AS users_with_active_plan,
        COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM user_health_preferences hp
            WHERE hp.user_id = u.id AND hp.deleted_at IS NULL AND hp.weight_goal IS NOT NULL
        ))::int AS users_with_goal
    FROM users u
    WHERE u.deleted_at IS NULL
    `, [from, to]);
    return result.rows[0];
}

/** New sign-ups per Monday-starting week (UTC), zero-filled. */
export const fetchNewUsersPerWeekRepository = async (from: string, to: string): Promise<{ week_start: string, count: number }[]> => {
    const result = await pg.query(`
    SELECT
        to_char(w, 'YYYY-MM-DD') AS week_start,
        COUNT(u.id)::int AS count
    FROM generate_series(date_trunc('week', $1::date), $2::date, INTERVAL '1 week') AS w
    LEFT JOIN users u
        ON u.created_at >= w
        AND u.created_at < w + INTERVAL '1 week'
        AND u.deleted_at IS NULL
    GROUP BY w
    ORDER BY w
    `, [from, to]);
    return result.rows;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserActivityRow {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone_country_code: string | null;
    phone_number: string | null;
    created_at: Date;
    last_active_at: Date | null;
    workouts_7d: number;
    workouts_30d: number;
    weigh_in_days_30d: number;
    has_active_plan: boolean;
    has_goal: boolean;
    ai_calls: number;
}

export type UserSortField = "last_active" | "created_at";
export type UserActivityFilter = "active_7d" | "inactive_30d";

/**
 * Users with their activity figures. Aggregates are grouped per table first,
 * then joined, so sorting/filtering on last-active works over every user.
 * Fine at the current scale; past ~100k users this wants a materialised
 * per-user summary.
 */
export const fetchUsersWithActivityRepository = async (data: {
    userId?: string,
    search?: string,
    activity?: UserActivityFilter | null,
    hasPlan?: boolean,
    sort?: UserSortField,
    order?: "asc" | "desc",
    page?: number,
    limit?: number,
}): Promise<{ rows: UserActivityRow[], totalCount: number }> => {
    const {
        userId,
        search = "",
        activity = null,
        hasPlan = false,
        sort = "last_active",
        order = "desc",
        page = 1,
        limit = 20,
    } = data;

    const values: unknown[] = [];
    const baseConditions: string[] = ["u.deleted_at IS NULL"];
    if (userId) {
        values.push(userId);
        baseConditions.push(`u.id = $${values.length}`);
    }
    const term = search.trim();
    if (term) {
        values.push(`%${term}%`);
        const like = `$${values.length}`;
        const parts = [
            `u.email ILIKE ${like}`,
            `concat_ws(' ', u.first_name, u.last_name) ILIKE ${like}`,
        ];
        // Phones are stored as country code + number; match on digits only so
        // "+91 98765" and "9198765" both find the user.
        const digits = term.replace(/\D/g, "");
        if (digits) {
            values.push(`%${digits}%`);
            parts.push(`regexp_replace(COALESCE(u.phone_country_code, '') || COALESCE(u.phone_number, ''), '\\D', '', 'g') LIKE $${values.length}`);
        }
        baseConditions.push(`(${parts.join(" OR ")})`);
    }

    const outerConditions: string[] = [];
    if (activity === "active_7d") {
        outerConditions.push("last_active_at >= NOW() - INTERVAL '7 days'");
    } else if (activity === "inactive_30d") {
        outerConditions.push("(last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '30 days')");
    }
    if (hasPlan) {
        outerConditions.push("has_active_plan");
    }

    const sortColumn = sort === "created_at" ? "created_at" : "last_active_at";
    const direction = order === "asc" ? "ASC" : "DESC";
    values.push(limit, (page - 1) * limit);
    const limitParam = `$${values.length - 1}`;
    const offsetParam = `$${values.length}`;

    const query = `
    WITH base AS (
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone_country_code, u.phone_number, u.created_at
        FROM users u
        WHERE ${baseConditions.join(" AND ")}
    ),
    workouts AS (
        SELECT
            ws.user_id,
            MAX(ws.completed_at) AS last_workout_at,
            COUNT(*) FILTER (WHERE ws.completed_at >= NOW() - INTERVAL '7 days')::int AS workouts_7d,
            COUNT(*) FILTER (WHERE ws.completed_at >= NOW() - INTERVAL '30 days')::int AS workouts_30d
        FROM workout_sessions ws
        INNER JOIN base b ON b.id = ws.user_id
        WHERE ws.deleted_at IS NULL AND ws.completed_at IS NOT NULL
        GROUP BY ws.user_id
    ),
    weigh_ins AS (
        SELECT
            we.user_id,
            MAX(we.created_at) AS last_weigh_in_at,
            COUNT(DISTINCT we.date) FILTER (WHERE we.date >= CURRENT_DATE - 29)::int AS weigh_in_days_30d
        FROM user_weight_entries we
        INNER JOIN base b ON b.id = we.user_id
        WHERE we.deleted_at IS NULL
        GROUP BY we.user_id
    ),
    sessions AS (
        SELECT
            s.user_id,
            MAX(GREATEST(s.created_at, s.last_used_at)) AS last_session_at
        FROM user_sessions s
        INNER JOIN base b ON b.id = s.user_id
        GROUP BY s.user_id
    ),
    ai AS (
        SELECT r.user_id, COUNT(*)::int AS ai_calls
        FROM ai_requests r
        INNER JOIN base b ON b.id = r.user_id
        GROUP BY r.user_id
    ),
    combined AS (
        SELECT
            b.*,
            GREATEST(w.last_workout_at, wi.last_weigh_in_at, s.last_session_at) AS last_active_at,
            COALESCE(w.workouts_7d, 0) AS workouts_7d,
            COALESCE(w.workouts_30d, 0) AS workouts_30d,
            COALESCE(wi.weigh_in_days_30d, 0) AS weigh_in_days_30d,
            EXISTS (
                SELECT 1 FROM user_program_assignments upa
                WHERE upa.user_id = b.id AND upa.is_active = TRUE AND upa.deleted_at IS NULL
            ) AS has_active_plan,
            EXISTS (
                SELECT 1 FROM user_health_preferences hp
                WHERE hp.user_id = b.id AND hp.deleted_at IS NULL AND hp.weight_goal IS NOT NULL
            ) AS has_goal,
            COALESCE(ai.ai_calls, 0) AS ai_calls
        FROM base b
        LEFT JOIN workouts w ON w.user_id = b.id
        LEFT JOIN weigh_ins wi ON wi.user_id = b.id
        LEFT JOIN sessions s ON s.user_id = b.id
        LEFT JOIN ai ON ai.user_id = b.id
    )
    SELECT *, COUNT(*) OVER ()::int AS total_count
    FROM combined
    ${outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : ""}
    ORDER BY ${sortColumn} ${direction} NULLS LAST, created_at DESC, id
    LIMIT ${limitParam} OFFSET ${offsetParam}
    `;
    const result = await pg.query(query, values);
    const rows = result.rows as (UserActivityRow & { total_count: number })[];
    return {
        rows: rows.map(({ total_count: _totalCount, ...row }) => row),
        totalCount: rows[0]?.total_count ?? 0,
    };
}

export const fetchUserProfileRepository = async (userId: string): Promise<{
    timezone: string | null,
    weight_units: string | null,
    weight_goal: string | null,
    weight_goal_preset: string | null,
    target_weight: number | null,
    goal_date: string | null,
    goal_set_on: string | null,
} | null> => {
    const result = await pg.query(`
    SELECT
        timezone,
        weight_units,
        weight_goal,
        weight_goal_preset,
        target_weight,
        to_char(goal_date, 'YYYY-MM-DD') AS goal_date,
        to_char(goal_set_on, 'YYYY-MM-DD') AS goal_set_on
    FROM user_health_preferences
    WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
    `, [userId]);
    return result.rows[0] ?? null;
}

export const fetchUserPlansRepository = async (userId: string): Promise<{
    id: string,
    program_name: string,
    version_number: number,
    is_active: boolean,
    started_at: Date | null,
    created_at: Date,
}[]> => {
    const result = await pg.query(`
    SELECT
        upa.id,
        wp.name AS program_name,
        wpv.version_number,
        upa.is_active,
        upa.started_at,
        upa.created_at
    FROM user_program_assignments upa
    INNER JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
    INNER JOIN workout_programs wp ON wp.id = wpv.workout_program_id
    WHERE upa.user_id = $1 AND upa.deleted_at IS NULL
    ORDER BY upa.is_active DESC, upa.created_at DESC
    LIMIT 20
    `, [userId]);
    return result.rows;
}

export const fetchUserRecentWorkoutsRepository = async (userId: string, limit = 20): Promise<{
    id: string,
    program_name: string | null,
    started_at: Date,
    completed_at: Date | null,
    working_sets: number,
}[]> => {
    const result = await pg.query(`
    SELECT
        ws.id,
        wp.name AS program_name,
        ws.started_at,
        ws.completed_at,
        (
            SELECT COUNT(*)::int FROM workout_sets st
            WHERE st.workout_session_id = ws.id
                AND st.deleted_at IS NULL
                AND st.is_warmup = FALSE
        ) AS working_sets
    FROM workout_sessions ws
    LEFT JOIN user_program_assignments upa ON upa.id = ws.program_assignment_id
    LEFT JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
    LEFT JOIN workout_programs wp ON wp.id = wpv.workout_program_id
    WHERE ws.user_id = $1 AND ws.deleted_at IS NULL
    ORDER BY ws.started_at DESC
    LIMIT $2
    `, [userId, limit]);
    return result.rows;
}

/** Weigh-ins over the last `days` days, oldest first. */
export const fetchUserWeightTrendRepository = async (userId: string, days = 180): Promise<{ date: string, weight: number }[]> => {
    const result = await pg.query(`
    SELECT to_char(date, 'YYYY-MM-DD') AS date, weight
    FROM user_weight_entries
    WHERE user_id = $1
        AND deleted_at IS NULL
        AND date >= CURRENT_DATE - $2::int
    ORDER BY date ASC, created_at ASC
    `, [userId, days]);
    return result.rows;
}

/** Check-in metadata only: the stats and the written note are not returned. */
export const fetchUserCheckinHistoryRepository = async (userId: string, limit = 26): Promise<{
    id: string,
    week_start: string,
    status: string,
    skip_reasons: unknown,
    attempts: number,
    model: string | null,
    generated_at: Date | null,
    dismissed_at: Date | null,
    next_retry_at: Date | null,
}[]> => {
    const result = await pg.query(`
    SELECT
        id,
        to_char(week_start, 'YYYY-MM-DD') AS week_start,
        status,
        skip_reasons,
        attempts,
        model,
        generated_at,
        dismissed_at,
        next_retry_at
    FROM user_weekly_checkins
    WHERE user_id = $1 AND deleted_at IS NULL
    ORDER BY week_start DESC
    LIMIT $2
    `, [userId, limit]);
    return result.rows;
}

export const fetchUserAiRequestsRepository = async (userId: string, limit = 20): Promise<{
    id: string,
    feature: string,
    model: string,
    status: string,
    prompt_tokens: number | null,
    completion_tokens: number | null,
    latency_ms: number | null,
    created_at: Date,
}[]> => {
    const result = await pg.query(`
    SELECT id, feature, model, status, prompt_tokens, completion_tokens, latency_ms, created_at
    FROM ai_requests
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `, [userId, limit]);
    return result.rows;
}
