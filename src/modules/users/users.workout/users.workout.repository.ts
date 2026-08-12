import { pg } from "../../../infrastructure/postgres/index.js";
import { AppError } from "../../../shared/errors/AppError.js";

export interface PublicWorkoutPlanRow {
    workout_program_id: string;
    name: string;
    slug: string;
    workout_program_version_id: string;
    version_number: number;
    version_name: string | null;
    description: string;
    training_days: number;
    split_type: string;
    session_ordering_logic: string;
    duration_type: string;
    duration_weeks: number;
}

/** One row per public program, at its latest public version. */
export const fetchPublicWorkoutPlansRepository = async (): Promise<PublicWorkoutPlanRow[]> => {
    const query = `
    SELECT * FROM (
        SELECT DISTINCT ON (wp.id)
            wp.id AS workout_program_id,
            wp.name,
            wp.slug,
            wpv.id AS workout_program_version_id,
            wpv.version_number,
            wpv.version_name,
            wpv.description,
            wpv.training_days,
            wpv.split_type,
            wpv.session_ordering_logic,
            wpv.duration_type,
            wpv.duration_weeks
        FROM workout_programs wp
        INNER JOIN workout_program_versions wpv
            ON wpv.workout_program_id = wp.id
            AND wpv.deleted_at IS NULL
            AND wpv.visibility = 'public'
        WHERE wp.deleted_at IS NULL
            AND wp.visibility = 'public'
        ORDER BY wp.id, wpv.version_number DESC
    ) t
    ORDER BY t.name ASC
    `;
    try {
        const result = await pg.query(query);
        return result.rows as PublicWorkoutPlanRow[];
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch public workout plans", 500);
    }
}

/** Latest public version for a single public program, or null if not found. */
export const fetchLatestPublicVersionForProgramRepository = async (
    workoutProgramId: string,
): Promise<PublicWorkoutPlanRow | null> => {
    const query = `
    SELECT
        wp.id AS workout_program_id,
        wp.name,
        wp.slug,
        wpv.id AS workout_program_version_id,
        wpv.version_number,
        wpv.version_name,
        wpv.description,
        wpv.training_days,
        wpv.split_type,
        wpv.session_ordering_logic,
        wpv.duration_type,
        wpv.duration_weeks
    FROM workout_programs wp
    INNER JOIN workout_program_versions wpv
        ON wpv.workout_program_id = wp.id
        AND wpv.deleted_at IS NULL
        AND wpv.visibility = 'public'
    WHERE wp.deleted_at IS NULL
        AND wp.visibility = 'public'
        AND wp.id = $1
    ORDER BY wpv.version_number DESC
    LIMIT 1
    `;
    try {
        const result = await pg.query(query, [workoutProgramId]);
        return (result.rows[0] as PublicWorkoutPlanRow) ?? null;
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to resolve workout plan version", 500);
    }
}

export interface PlanVersionAccessRow {
    workout_program_id: string;
    program_name: string;
    program_slug: string;
    program_visibility: string;
    workout_program_version_id: string;
    version_number: number;
    version_name: string | null;
    version_visibility: string;
    description: string;
    training_days: number;
    split_type: string;
    session_ordering_logic: string;
    duration_type: string;
    duration_weeks: number;
}

/** A program version + its parent program, regardless of visibility — the caller decides access. */
export const fetchPlanVersionForAccessCheckRepository = async (
    workoutProgramVersionId: string,
): Promise<PlanVersionAccessRow | null> => {
    const query = `
    SELECT
        wp.id AS workout_program_id,
        wp.name AS program_name,
        wp.slug AS program_slug,
        wp.visibility AS program_visibility,
        wpv.id AS workout_program_version_id,
        wpv.version_number,
        wpv.version_name,
        wpv.visibility AS version_visibility,
        wpv.description,
        wpv.training_days,
        wpv.split_type,
        wpv.session_ordering_logic,
        wpv.duration_type,
        wpv.duration_weeks
    FROM workout_program_versions wpv
    INNER JOIN workout_programs wp ON wp.id = wpv.workout_program_id
    WHERE wpv.id = $1
        AND wpv.deleted_at IS NULL
        AND wp.deleted_at IS NULL
    `;
    try {
        const result = await pg.query(query, [workoutProgramVersionId]);
        return (result.rows[0] as PlanVersionAccessRow) ?? null;
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch workout plan version", 500);
    }
}

/** True if the user has (or has ever had) an assignment pointing at this exact version. */
export const userHasAssignmentForVersionRepository = async (
    userId: string,
    workoutProgramVersionId: string,
): Promise<boolean> => {
    const query = `
    SELECT 1 FROM user_program_assignments
    WHERE user_id = $1 AND workout_program_version_id = $2 AND deleted_at IS NULL
    LIMIT 1
    `;
    try {
        const result = await pg.query(query, [userId, workoutProgramVersionId]);
        return (result.rowCount ?? 0) > 0;
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to check workout plan access", 500);
    }
}

export interface PlanDetailExerciseRow {
    id: string;
    workout_program_day_session_id: string;
    exercise_order: number;
    target_sets: number | null;
    min_reps: number | null;
    max_reps: number | null;
    target_rir: number | null;
    rest_seconds: number | null;
    tempo: string | null;
    notes: string | null;
    exercise: {
        id: string;
        name: string;
        slug: string;
        image_url: string | null;
        description: string | null;
    } | null;
}

export interface PlanDetailSessionRow {
    id: string;
    workout_program_day_id: string;
    name: string;
    exercises: PlanDetailExerciseRow[];
}

export interface PlanDetailDayRow {
    id: string;
    day_number: number;
    name: string;
    sessions: PlanDetailSessionRow[];
}

/**
 * Every day (1–7, including empty rest days — this is a "view the whole
 * plan's config" read, unlike the pick-a-day-to-train flow which hides empty
 * days) → its sessions → each session's exercises with the full joined
 * exercise, for the user-facing plan-detail page.
 */
export const fetchPlanDetailTreeRepository = async (
    workoutProgramVersionId: string,
): Promise<PlanDetailDayRow[]> => {
    const daysQuery = `
    SELECT id, day_number, name
    FROM program_days
    WHERE workout_program_version_id = $1 AND deleted_at IS NULL
    ORDER BY day_number ASC
    `;
    try {
        const daysResult = await pg.query(daysQuery, [workoutProgramVersionId]);
        const days = daysResult.rows as { id: string, day_number: number, name: string }[];
        if (days.length === 0) return [];

        const sessionsResult = await pg.query(
            `SELECT id, workout_program_day_id, name
            FROM program_day_sessions
            WHERE workout_program_day_id = ANY($1::uuid[]) AND deleted_at IS NULL
            ORDER BY created_at ASC`,
            [days.map((d) => d.id)],
        );
        const sessions = sessionsResult.rows as { id: string, workout_program_day_id: string, name: string }[];

        const exercisesResult = sessions.length > 0
            ? await pg.query(
                `SELECT
                    wpe.id, wpe.workout_program_day_session_id, wpe.exercise_order,
                    wpe.target_sets, wpe.min_reps, wpe.max_reps, wpe.target_rir,
                    wpe.rest_seconds, wpe.tempo, wpe.notes,
                    e.id AS exercise_id, e.name AS exercise_name, e.slug AS exercise_slug,
                    e.image_url AS exercise_image_url, e.description AS exercise_description
                FROM workout_program_exercises wpe
                LEFT JOIN exercises e ON e.id = wpe.exercise_id
                WHERE wpe.workout_program_day_session_id = ANY($1::uuid[]) AND wpe.deleted_at IS NULL
                ORDER BY wpe.exercise_order ASC NULLS LAST`,
                [sessions.map((s) => s.id)],
            )
            : { rows: [] as any[] };

        const exercisesBySession = new Map<string, PlanDetailExerciseRow[]>();
        for (const row of exercisesResult.rows) {
            const list = exercisesBySession.get(row.workout_program_day_session_id) ?? [];
            list.push({
                id: row.id,
                workout_program_day_session_id: row.workout_program_day_session_id,
                exercise_order: row.exercise_order,
                target_sets: row.target_sets,
                min_reps: row.min_reps,
                max_reps: row.max_reps,
                target_rir: row.target_rir,
                rest_seconds: row.rest_seconds,
                tempo: row.tempo,
                notes: row.notes,
                exercise: row.exercise_id ? {
                    id: row.exercise_id,
                    name: row.exercise_name,
                    slug: row.exercise_slug,
                    image_url: row.exercise_image_url,
                    description: row.exercise_description,
                } : null,
            });
            exercisesBySession.set(row.workout_program_day_session_id, list);
        }

        const sessionsByDay = new Map<string, PlanDetailSessionRow[]>();
        for (const session of sessions) {
            const list = sessionsByDay.get(session.workout_program_day_id) ?? [];
            list.push({
                id: session.id,
                workout_program_day_id: session.workout_program_day_id,
                name: session.name,
                exercises: exercisesBySession.get(session.id) ?? [],
            });
            sessionsByDay.set(session.workout_program_day_id, list);
        }

        return days.map((day) => ({
            id: day.id,
            day_number: day.day_number,
            name: day.name,
            sessions: sessionsByDay.get(day.id) ?? [],
        }));
    } catch (error) {
        console.log(daysQuery);
        console.log(error);
        throw new AppError("Failed to fetch workout plan detail", 500);
    }
}

export interface UserProgramAssignmentRow {
    id: string;
    user_id: string;
    workout_program_version_id: string;
    started_at: Date | null;
    current_program_day_id: string | null;
    current_program_day_session_id: string | null;
    is_active: boolean;
    program_name: string;
    version_name: string | null;
    version_number: number;
    training_days: number;
    split_type: string;
    workout_program_id: string;
    created_at: Date;
    updated_at: Date;
}

export const fetchUserAssignmentsRepository = async (data: {
    userId: string,
    activeOnly?: boolean,
}): Promise<UserProgramAssignmentRow[]> => {
    const { userId, activeOnly = false } = data;
    const query = `
    SELECT
        upa.id,
        upa.user_id,
        upa.workout_program_version_id,
        upa.started_at,
        upa.current_program_day_id,
        upa.current_program_day_session_id,
        upa.is_active,
        upa.created_at,
        upa.updated_at,
        wp.id AS workout_program_id,
        wp.name AS program_name,
        wpv.version_name,
        wpv.version_number,
        wpv.training_days,
        wpv.split_type
    FROM user_program_assignments upa
    INNER JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
    INNER JOIN workout_programs wp ON wp.id = wpv.workout_program_id
    WHERE upa.user_id = $1
        AND upa.deleted_at IS NULL
        ${activeOnly ? "AND upa.is_active = TRUE" : ""}
    ORDER BY upa.created_at DESC
    `;
    try {
        const result = await pg.query(query, [userId]);
        return result.rows as UserProgramAssignmentRow[];
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch workout plan selections", 500);
    }
}

export interface ProgramDayRow {
    id: string;
    workout_program_id: string;
    workout_program_version_id: string;
    day_number: number;
    name: string;
    visibility: string;
    created_at: Date;
    updated_at: Date;
}

/**
 * Days for a program version, excluding any day with no session that has at
 * least one exercise — an empty day (e.g. a rest-day placeholder row) isn't
 * a workout day and shouldn't be offered as one to pick.
 */
export const fetchNonEmptyProgramDaysRepository = async (
    workoutProgramVersionId: string,
): Promise<ProgramDayRow[]> => {
    const query = `
    SELECT pd.id, pd.workout_program_id, pd.workout_program_version_id, pd.day_number, pd.name,
           pd.visibility, pd.created_at, pd.updated_at
    FROM program_days pd
    WHERE pd.workout_program_version_id = $1
        AND pd.deleted_at IS NULL
        AND EXISTS (
            SELECT 1
            FROM program_day_sessions pds
            INNER JOIN workout_program_exercises wpe
                ON wpe.workout_program_day_session_id = pds.id
                AND wpe.deleted_at IS NULL
            WHERE pds.workout_program_day_id = pd.id
                AND pds.deleted_at IS NULL
        )
    ORDER BY pd.day_number ASC
    `;
    try {
        const result = await pg.query(query, [workoutProgramVersionId]);
        return result.rows as ProgramDayRow[];
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch program days", 500);
    }
}

export interface ProgramDaySessionRow {
    id: string;
    workout_program_day_id: string;
    workout_program_version_id: string;
    name: string;
    visibility: string;
    created_at: Date;
    updated_at: Date;
}

/** Sessions for a day, excluding any session with zero exercises. */
export const fetchNonEmptyProgramDaySessionsRepository = async (
    workoutProgramDayId: string,
): Promise<ProgramDaySessionRow[]> => {
    const query = `
    SELECT pds.id, pds.workout_program_day_id, pds.workout_program_version_id, pds.name,
           pds.visibility, pds.created_at, pds.updated_at
    FROM program_day_sessions pds
    WHERE pds.workout_program_day_id = $1
        AND pds.deleted_at IS NULL
        AND EXISTS (
            SELECT 1
            FROM workout_program_exercises wpe
            WHERE wpe.workout_program_day_session_id = pds.id
                AND wpe.deleted_at IS NULL
        )
    ORDER BY pds.created_at ASC
    `;
    try {
        const result = await pg.query(query, [workoutProgramDayId]);
        return result.rows as ProgramDaySessionRow[];
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch program day sessions", 500);
    }
}

/** Union of weekdays (1=Mon..7=Sun) that have at least one non-empty training day across the given program versions. */
export const fetchRequiredWeekdaysRepository = async (
    workoutProgramVersionIds: string[],
): Promise<number[]> => {
    if (workoutProgramVersionIds.length === 0) return [];
    const query = `
    SELECT DISTINCT pd.day_number
    FROM program_days pd
    WHERE pd.workout_program_version_id = ANY($1::uuid[])
        AND pd.deleted_at IS NULL
        AND EXISTS (
            SELECT 1
            FROM program_day_sessions pds
            INNER JOIN workout_program_exercises wpe
                ON wpe.workout_program_day_session_id = pds.id
                AND wpe.deleted_at IS NULL
            WHERE pds.workout_program_day_id = pd.id
                AND pds.deleted_at IS NULL
        )
    `;
    try {
        const result = await pg.query(query, [workoutProgramVersionIds]);
        return result.rows.map((row) => Number(row.day_number));
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch required training weekdays", 500);
    }
}

/** Distinct calendar dates (in the given IANA timezone) the user completed a workout, on or after `sinceDate`. */
export const fetchWorkedOutDatesRepository = async (
    userId: string,
    timezone: string,
    sinceDate: string,
): Promise<string[]> => {
    // Cast to text (not date) so node-postgres never parses it into a JS
    // Date — that parsing anchors to the Node process's *local* system
    // timezone, not UTC, silently shifting the calendar day on any
    // deployment whose TZ isn't UTC.
    const query = `
    SELECT DISTINCT to_char((wsess.completed_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS worked_date
    FROM workout_sessions wsess
    WHERE wsess.user_id = $1
        AND wsess.completed_at IS NOT NULL
        AND wsess.deleted_at IS NULL
        AND (wsess.completed_at AT TIME ZONE $2)::date >= $3::date
    `;
    try {
        const result = await pg.query(query, [userId, timezone, sinceDate]);
        return result.rows.map((row) => row.worked_date as string);
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch workout dates", 500);
    }
}

/**
 * Sum of (weight + tool_weight) * reps across non-warmup, non-deleted sets,
 * optionally restricted to on-or-after `sinceDate` (in the given timezone).
 * Omitting `sinceDate` gives the user's all-time total.
 */
export const fetchTonnageSinceRepository = async (
    userId: string,
    timezone: string,
    sinceDate?: string,
): Promise<number> => {
    const params: unknown[] = [userId];
    let sinceClause = "";
    if (sinceDate) {
        params.push(timezone, sinceDate);
        sinceClause = `AND (ws.created_at AT TIME ZONE $2)::date >= $3::date`;
    }
    const query = `
    SELECT COALESCE(SUM((COALESCE(ws.weight, 0) + COALESCE(ws.tool_weight, 0)) * COALESCE(ws.reps, 0)), 0) AS total
    FROM workout_sets ws
    INNER JOIN workout_sessions wsess ON wsess.id = ws.workout_session_id
    WHERE wsess.user_id = $1
        AND ws.deleted_at IS NULL
        AND wsess.deleted_at IS NULL
        AND ws.is_warmup = FALSE
        ${sinceClause}
    `;
    try {
        const result = await pg.query(query, params);
        return Number(result.rows[0]?.total ?? 0);
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to compute training volume", 500);
    }
}

export interface PersonalRecordRow {
    exercise_id: string;
    exercise_name: string;
    exercise_slug: string;
    image_url: string | null;
    achieved_at: Date;
    load: number;
    reps: number;
    e1rm: number;
}

/**
 * The user's current personal record (best estimated 1RM — Epley formula)
 * for every exercise they've logged, newest-achieved first. See
 * workout-gym-api/algorithms/personal-records.md for the full model.
 */
export const fetchRecentPRsRepository = async (
    userId: string,
    limit: number,
): Promise<PersonalRecordRow[]> => {
    const query = `
    WITH eligible_sets AS (
        SELECT
            wpe.exercise_id,
            ws.created_at,
            (COALESCE(ws.weight, 0) + COALESCE(ws.tool_weight, 0)) AS load,
            ws.reps
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
    ),
    scored AS (
        SELECT *, load * (1 + reps / 30.0) AS e1rm
        FROM eligible_sets
    ),
    ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY e1rm DESC, created_at ASC) AS rn
        FROM scored
    )
    SELECT
        r.exercise_id,
        e.name AS exercise_name,
        e.slug AS exercise_slug,
        e.image_url,
        r.created_at AS achieved_at,
        r.load,
        r.reps,
        r.e1rm
    FROM ranked r
    INNER JOIN exercises e ON e.id = r.exercise_id
    WHERE r.rn = 1
    ORDER BY r.created_at DESC
    LIMIT $2
    `;
    try {
        const result = await pg.query(query, [userId, limit]);
        return result.rows.map((row) => ({
            exercise_id: row.exercise_id,
            exercise_name: row.exercise_name,
            exercise_slug: row.exercise_slug,
            image_url: row.image_url,
            achieved_at: row.achieved_at,
            load: Number(row.load),
            reps: Number(row.reps),
            e1rm: Number(row.e1rm),
        }));
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch personal records", 500);
    }
}

/** All-time count of completed workouts and their average duration (seconds). */
export const fetchWorkoutCountAndAvgDurationRepository = async (
    userId: string,
): Promise<{ total_workouts: number, avg_duration_seconds: number | null }> => {
    const query = `
    SELECT
        COUNT(*) AS total_workouts,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) AS avg_duration_seconds
    FROM workout_sessions
    WHERE user_id = $1
        AND completed_at IS NOT NULL
        AND deleted_at IS NULL
    `;
    try {
        const result = await pg.query(query, [userId]);
        const row = result.rows[0];
        return {
            total_workouts: Number(row?.total_workouts ?? 0),
            avg_duration_seconds: row?.avg_duration_seconds != null ? Number(row.avg_duration_seconds) : null,
        };
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to compute workout stats", 500);
    }
}

/**
 * Tonnage per calendar week (Monday-start, in the given timezone) for the
 * last `weeksBack` weeks including the current one, oldest first. Weeks with
 * no logged sets are omitted by the query — the caller zero-fills them.
 */
export const fetchWeeklyVolumeSeriesRepository = async (
    userId: string,
    timezone: string,
    sinceWeekStart: string,
): Promise<{ week_start: string, volume: number }[]> => {
    // Cast to text (not date) so node-postgres never parses it into a JS
    // Date — see the identical note in fetchWorkedOutDatesRepository.
    const query = `
    SELECT
        to_char(date_trunc('week', (ws.created_at AT TIME ZONE $2)), 'YYYY-MM-DD') AS week_start,
        SUM((COALESCE(ws.weight, 0) + COALESCE(ws.tool_weight, 0)) * COALESCE(ws.reps, 0)) AS volume
    FROM workout_sets ws
    INNER JOIN workout_sessions wsess ON wsess.id = ws.workout_session_id
    WHERE wsess.user_id = $1
        AND ws.deleted_at IS NULL
        AND wsess.deleted_at IS NULL
        AND ws.is_warmup = FALSE
        AND (ws.created_at AT TIME ZONE $2)::date >= $3::date
    GROUP BY week_start
    ORDER BY week_start ASC
    `;
    try {
        const result = await pg.query(query, [userId, timezone, sinceWeekStart]);
        return result.rows.map((row) => ({
            week_start: row.week_start as string,
            volume: Number(row.volume),
        }));
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to compute weekly volume series", 500);
    }
}

export interface ExerciseHistorySetRow {
    id: string;
    set_order: number;
    weight: number | null;
    tool_weight: number | null;
    reps: number | null;
    rir: number | null;
    effort: string | null;
    discomfort_notes: string | null;
    alarm_message: string | null;
    parent_set_id: string | null;
    drop_order: number | null;
    created_at: Date;
}

export interface ExerciseHistorySessionRow {
    workout_session_id: string;
    started_at: Date;
    plan_name: string;
    /** Null when this occurrence of the exercise was logged ad-hoc, not as part of an admin-authored day/session. */
    day_name: string | null;
    session_name: string | null;
    sets: ExerciseHistorySetRow[];
}

/**
 * Last `limit` distinct sessions (any plan, any day) this exercise was
 * logged in for this user, each carrying the plan/day/session names it was
 * logged under and the sets from that session.
 *
 * `beforeDate`, when given, restricts this to sessions that started strictly
 * before it — used when viewing exercise history from within a past
 * session's detail view, so it doesn't leak sets from that session or later.
 */
export const fetchExerciseHistoryRepository = async (data: {
    userId: string,
    exerciseId: string,
    limit: number,
    beforeDate?: Date,
}): Promise<ExerciseHistorySessionRow[]> => {
    const { userId, exerciseId, limit, beforeDate } = data;
    const params: unknown[] = [exerciseId, userId, limit];
    let beforeClause = "";
    if (beforeDate) {
        params.push(beforeDate);
        beforeClause = `AND wsess.started_at < $${params.length}`;
    }
    const query = `
    WITH matching_sessions AS (
        SELECT DISTINCT wsess.id AS workout_session_id, wsess.started_at
        FROM workout_sets ws
        INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
        INNER JOIN workout_sessions wsess ON wsess.id = ws.workout_session_id
        WHERE wpe.exercise_id = $1
            AND wsess.user_id = $2
            AND ws.deleted_at IS NULL
            AND wsess.deleted_at IS NULL
            ${beforeClause}
        ORDER BY wsess.started_at DESC
        LIMIT $3
    )
    SELECT
        ms.workout_session_id,
        ms.started_at,
        wp.name AS plan_name,
        pd.name AS day_name,
        pds.name AS session_name,
        ws.id AS set_id,
        ws.set_order,
        ws.weight,
        ws.tool_weight,
        ws.reps,
        ws.rir,
        ws.effort,
        ws.discomfort_notes,
        wsa.message AS alarm_message,
        ws.parent_set_id,
        ws.drop_order,
        ws.created_at
    FROM matching_sessions ms
    INNER JOIN workout_sets ws ON ws.workout_session_id = ms.workout_session_id
    INNER JOIN workout_program_exercises wpe
        ON wpe.id = ws.workout_program_exercise_id
        AND wpe.exercise_id = $1
    LEFT JOIN program_day_sessions pds ON pds.id = wpe.workout_program_day_session_id
    LEFT JOIN program_days pd ON pd.id = pds.workout_program_day_id
    INNER JOIN workout_sessions wsess ON wsess.id = ms.workout_session_id
    INNER JOIN user_program_assignments upa ON upa.id = wsess.program_assignment_id
    INNER JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
    INNER JOIN workout_programs wp ON wp.id = wpv.workout_program_id
    LEFT JOIN workout_set_alarms wsa ON wsa.workout_set_id = ws.id
    WHERE ws.deleted_at IS NULL
    ORDER BY ms.started_at DESC, ws.set_order ASC, ws.drop_order ASC NULLS FIRST
    `;
    try {
        const result = await pg.query(query, params);
        const sessionsById = new Map<string, ExerciseHistorySessionRow>();
        for (const row of result.rows) {
            let session = sessionsById.get(row.workout_session_id);
            if (!session) {
                session = {
                    workout_session_id: row.workout_session_id,
                    started_at: row.started_at,
                    plan_name: row.plan_name,
                    day_name: row.day_name,
                    session_name: row.session_name,
                    sets: [],
                };
                sessionsById.set(row.workout_session_id, session);
            }
            session.sets.push({
                id: row.set_id,
                set_order: row.set_order,
                weight: row.weight,
                tool_weight: row.tool_weight,
                reps: row.reps,
                rir: row.rir,
                effort: row.effort,
                discomfort_notes: row.discomfort_notes,
                alarm_message: row.alarm_message,
                parent_set_id: row.parent_set_id,
                drop_order: row.drop_order,
                created_at: row.created_at,
            });
        }
        return Array.from(sessionsById.values());
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch exercise history", 500);
    }
}

export interface WorkoutSessionListRow {
    id: string;
    program_assignment_id: string;
    started_at: Date;
    completed_at: Date | null;
    plan_name: string;
    day_name: string | null;
    session_name: string | null;
    total_sets: number;
    total_exercises: number;
}

/**
 * Past workout sessions for this user, newest first. Day/session name and
 * set/exercise counts are derived from whatever was actually logged in each
 * session — `workout_sessions` itself doesn't store which day/session it
 * was for, only the sets logged against it do (via `workout_program_exercises`).
 */
export const fetchWorkoutSessionsRepository = async (data: {
    userId: string,
    page: number,
    limit: number,
}): Promise<{ data: WorkoutSessionListRow[], totalCount: number }> => {
    const { userId, page, limit } = data;
    const offset = (page - 1) * limit;
    const query = `
    SELECT
        wsess.id,
        wsess.program_assignment_id,
        wsess.started_at,
        wsess.completed_at,
        wp.name AS plan_name,
        day_info.day_name,
        day_info.session_name,
        COALESCE(day_info.total_sets, 0) AS total_sets,
        COALESCE(day_info.total_exercises, 0) AS total_exercises,
        COUNT(*) OVER() AS total_count
    FROM workout_sessions wsess
    INNER JOIN user_program_assignments upa ON upa.id = wsess.program_assignment_id
    INNER JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
    INNER JOIN workout_programs wp ON wp.id = wpv.workout_program_id
    LEFT JOIN LATERAL (
        -- Totals count every logged set regardless of whether it's tied to an
        -- admin-authored day/session (program exercise) or was added ad-hoc —
        -- day/session naming below is a separate, best-effort lookup so an
        -- ad-hoc-only session doesn't get its counts silently dropped.
        SELECT
            day_session.day_name,
            day_session.session_name,
            totals.total_sets,
            totals.total_exercises
        FROM (
            SELECT
                COUNT(ws.id) AS total_sets,
                COUNT(DISTINCT ws.workout_program_exercise_id) AS total_exercises
            FROM workout_sets ws
            WHERE ws.workout_session_id = wsess.id
                AND ws.deleted_at IS NULL
        ) totals
        LEFT JOIN LATERAL (
            SELECT pd.name AS day_name, pds.name AS session_name
            FROM workout_sets ws
            INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
            INNER JOIN program_day_sessions pds ON pds.id = wpe.workout_program_day_session_id
            INNER JOIN program_days pd ON pd.id = pds.workout_program_day_id
            WHERE ws.workout_session_id = wsess.id
                AND ws.deleted_at IS NULL
            GROUP BY pd.name, pds.name
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) day_session ON true
    ) day_info ON true
    WHERE wsess.user_id = $1
        AND wsess.deleted_at IS NULL
    ORDER BY wsess.started_at DESC
    LIMIT $2 OFFSET $3
    `;
    try {
        const result = await pg.query(query, [userId, limit, offset]);
        const totalCount = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
        return {
            data: result.rows.map((row) => ({
                id: row.id,
                program_assignment_id: row.program_assignment_id,
                started_at: row.started_at,
                completed_at: row.completed_at,
                plan_name: row.plan_name,
                day_name: row.day_name,
                session_name: row.session_name,
                total_sets: Number(row.total_sets),
                total_exercises: Number(row.total_exercises),
            })),
            totalCount,
        };
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch workout sessions", 500);
    }
}

export interface OngoingWorkoutSessionRow {
    session_id: string;
    started_at: Date;
    assignment_id: string;
    program_day_id: string | null;
    program_day_session_id: string | null;
    program_name: string;
    day_name: string | null;
    session_name: string | null;
}

/**
 * The user's single in-progress (unfinished) workout session, if any, along
 * with the day/session it was started under — read off
 * `user_program_assignments.current_program_day_id/_session_id`, which
 * `startWorkoutSessionService` stamps at start time, rather than derived
 * from logged sets (there may be none yet if the user backgrounded the app
 * immediately after starting).
 */
export const fetchOngoingWorkoutSessionRepository = async (
    userId: string,
): Promise<OngoingWorkoutSessionRow | null> => {
    const query = `
    SELECT
        wsess.id AS session_id,
        wsess.started_at,
        wsess.program_assignment_id AS assignment_id,
        upa.current_program_day_id AS program_day_id,
        upa.current_program_day_session_id AS program_day_session_id,
        wp.name AS program_name,
        pd.name AS day_name,
        pds.name AS session_name
    FROM workout_sessions wsess
    INNER JOIN user_program_assignments upa ON upa.id = wsess.program_assignment_id
    INNER JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
    INNER JOIN workout_programs wp ON wp.id = wpv.workout_program_id
    LEFT JOIN program_days pd ON pd.id = upa.current_program_day_id
    LEFT JOIN program_day_sessions pds ON pds.id = upa.current_program_day_session_id
    WHERE wsess.user_id = $1
        AND wsess.completed_at IS NULL
        AND wsess.deleted_at IS NULL
    ORDER BY wsess.started_at DESC
    LIMIT 1
    `;
    try {
        const result = await pg.query(query, [userId]);
        return result.rows[0] ?? null;
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch ongoing workout session", 500);
    }
}

export interface WorkoutSessionDetailSetRow {
    id: string;
    set_order: number;
    weight: number | null;
    tool_weight: number | null;
    reps: number | null;
    rir: number | null;
    effort: string | null;
    discomfort_notes: string | null;
    created_at: Date;
    parent_set_id: string | null;
    drop_order: number | null;
}

export interface WorkoutSessionDetailExerciseRow {
    workout_program_exercise_id: string;
    exercise_id: string;
    exercise_name: string;
    /** Null for an exercise added ad-hoc mid-session — it has no plan-defined ordering. */
    exercise_order: number | null;
    /** True if this exercise wasn't part of the admin-authored plan for this session. */
    is_adhoc: boolean;
    sets: WorkoutSessionDetailSetRow[];
}

export interface WorkoutSessionDetail {
    id: string;
    started_at: Date;
    completed_at: Date | null;
    plan_name: string;
    day_name: string | null;
    session_name: string | null;
    exercises: WorkoutSessionDetailExerciseRow[];
}

/** Full detail of one past session: every exercise logged, with all its sets. */
export const fetchWorkoutSessionDetailRepository = async (data: {
    userId: string,
    sessionId: string,
}): Promise<WorkoutSessionDetail | null> => {
    const { userId, sessionId } = data;

    const sessionQuery = `
    SELECT wsess.id, wsess.started_at, wsess.completed_at, wp.name AS plan_name
    FROM workout_sessions wsess
    INNER JOIN user_program_assignments upa ON upa.id = wsess.program_assignment_id
    INNER JOIN workout_program_versions wpv ON wpv.id = upa.workout_program_version_id
    INNER JOIN workout_programs wp ON wp.id = wpv.workout_program_id
    WHERE wsess.id = $1 AND wsess.user_id = $2 AND wsess.deleted_at IS NULL
    `;
    const setsQuery = `
    SELECT
        ws.id,
        ws.set_order,
        ws.weight,
        ws.tool_weight,
        ws.reps,
        ws.rir,
        ws.effort,
        ws.discomfort_notes,
        ws.created_at,
        ws.parent_set_id,
        ws.drop_order,
        wpe.id AS workout_program_exercise_id,
        wpe.exercise_order,
        wpe.workout_program_day_session_id IS NULL AS is_adhoc,
        e.id AS exercise_id,
        e.name AS exercise_name,
        pd.name AS day_name,
        pds.name AS session_name
    FROM workout_sets ws
    INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
    INNER JOIN exercises e ON e.id = wpe.exercise_id
    LEFT JOIN program_day_sessions pds ON pds.id = wpe.workout_program_day_session_id
    LEFT JOIN program_days pd ON pd.id = pds.workout_program_day_id
    WHERE ws.workout_session_id = $1 AND ws.deleted_at IS NULL
    ORDER BY wpe.exercise_order ASC NULLS LAST, ws.set_order ASC, ws.drop_order ASC NULLS FIRST
    `;
    try {
        const [sessionResult, setsResult] = await Promise.all([
            pg.query(sessionQuery, [sessionId, userId]),
            pg.query(setsQuery, [sessionId]),
        ]);

        const session = sessionResult.rows[0];
        if (!session) {
            return null;
        }

        const exercisesById = new Map<string, WorkoutSessionDetailExerciseRow>();
        // A session mixing program-authored and ad-hoc exercises should still
        // report the real day/session name — don't let a later ad-hoc row's
        // nulls overwrite a name an earlier row already gave us.
        let dayName: string | null = null;
        let sessionName: string | null = null;
        for (const row of setsResult.rows) {
            if (row.day_name) dayName = row.day_name;
            if (row.session_name) sessionName = row.session_name;
            let exercise = exercisesById.get(row.workout_program_exercise_id);
            if (!exercise) {
                exercise = {
                    workout_program_exercise_id: row.workout_program_exercise_id,
                    exercise_id: row.exercise_id,
                    exercise_name: row.exercise_name,
                    exercise_order: row.exercise_order,
                    is_adhoc: row.is_adhoc,
                    sets: [],
                };
                exercisesById.set(row.workout_program_exercise_id, exercise);
            }
            exercise.sets.push({
                id: row.id,
                set_order: row.set_order,
                weight: row.weight,
                tool_weight: row.tool_weight,
                reps: row.reps,
                rir: row.rir,
                effort: row.effort,
                discomfort_notes: row.discomfort_notes,
                created_at: row.created_at,
                parent_set_id: row.parent_set_id,
                drop_order: row.drop_order,
            });
        }

        // Ad-hoc exercises (null exercise_order) sort after all plan-ordered ones.
        const exercises = Array.from(exercisesById.values()).sort(
            (a, b) => (a.exercise_order ?? Infinity) - (b.exercise_order ?? Infinity),
        );

        return {
            id: session.id,
            started_at: session.started_at,
            completed_at: session.completed_at,
            plan_name: session.plan_name,
            day_name: dayName,
            session_name: sessionName,
            exercises,
        };
    } catch (error) {
        console.log(sessionQuery, setsQuery);
        console.log(error);
        throw new AppError("Failed to fetch workout session detail", 500);
    }
}

export interface ActiveAlarmRow {
    id: string;
    workout_set_id: string;
    exercise_id: string;
    exercise_name: string;
    message: string;
    created_at: Date;
}

export const fetchActiveAlarmsRepository = async (userId: string): Promise<ActiveAlarmRow[]> => {
    const query = `
    SELECT
        wsa.id,
        wsa.workout_set_id,
        wsa.exercise_id,
        e.name AS exercise_name,
        wsa.message,
        wsa.created_at
    FROM workout_set_alarms wsa
    INNER JOIN exercises e ON e.id = wsa.exercise_id
    WHERE wsa.user_id = $1
        AND wsa.discarded_at IS NULL
    ORDER BY wsa.created_at DESC
    `;
    try {
        const result = await pg.query(query, [userId]);
        return result.rows as ActiveAlarmRow[];
    } catch (error) {
        console.log(query);
        console.log(error);
        throw new AppError("Failed to fetch active alarms", 500);
    }
}
