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
}

export interface ExerciseHistorySessionRow {
    workout_session_id: string;
    started_at: Date;
    plan_name: string;
    day_name: string;
    session_name: string;
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
        ws.drop_order
    FROM matching_sessions ms
    INNER JOIN workout_sets ws ON ws.workout_session_id = ms.workout_session_id
    INNER JOIN workout_program_exercises wpe
        ON wpe.id = ws.workout_program_exercise_id
        AND wpe.exercise_id = $1
    INNER JOIN program_day_sessions pds ON pds.id = wpe.workout_program_day_session_id
    INNER JOIN program_days pd ON pd.id = pds.workout_program_day_id
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
        SELECT
            pd.name AS day_name,
            pds.name AS session_name,
            COUNT(ws.id) AS total_sets,
            COUNT(DISTINCT ws.workout_program_exercise_id) AS total_exercises
        FROM workout_sets ws
        INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
        INNER JOIN program_day_sessions pds ON pds.id = wpe.workout_program_day_session_id
        INNER JOIN program_days pd ON pd.id = pds.workout_program_day_id
        WHERE ws.workout_session_id = wsess.id
            AND ws.deleted_at IS NULL
        GROUP BY pd.name, pds.name
        LIMIT 1
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
    exercise_order: number;
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
        e.id AS exercise_id,
        e.name AS exercise_name,
        pd.name AS day_name,
        pds.name AS session_name
    FROM workout_sets ws
    INNER JOIN workout_program_exercises wpe ON wpe.id = ws.workout_program_exercise_id
    INNER JOIN exercises e ON e.id = wpe.exercise_id
    INNER JOIN program_day_sessions pds ON pds.id = wpe.workout_program_day_session_id
    INNER JOIN program_days pd ON pd.id = pds.workout_program_day_id
    WHERE ws.workout_session_id = $1 AND ws.deleted_at IS NULL
    ORDER BY wpe.exercise_order ASC, ws.set_order ASC, ws.drop_order ASC NULLS FIRST
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
        let dayName: string | null = null;
        let sessionName: string | null = null;
        for (const row of setsResult.rows) {
            dayName = row.day_name;
            sessionName = row.session_name;
            let exercise = exercisesById.get(row.workout_program_exercise_id);
            if (!exercise) {
                exercise = {
                    workout_program_exercise_id: row.workout_program_exercise_id,
                    exercise_id: row.exercise_id,
                    exercise_name: row.exercise_name,
                    exercise_order: row.exercise_order,
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

        const exercises = Array.from(exercisesById.values()).sort(
            (a, b) => a.exercise_order - b.exercise_order,
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
