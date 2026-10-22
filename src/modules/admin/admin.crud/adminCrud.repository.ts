import { pg } from "../../../infrastructure/postgres/index.js";

/**
 * Fetches a workout program (its latest version) with the full nested
 * program_days -> sessions -> exercises tree, matching what the admin panel's
 * program builder expects to prefill an edit. Previously this only joined
 * `workout_programs`/`workout_program_versions` with `wp.*, wpv.*` — since
 * both tables share column names (id, visibility, added_by_admin_user_id,
 * deleted_at, created_at, updated_at), the version's values silently
 * overwrote the program's in the returned row, and no day/session/exercise
 * data was ever included at all.
 */
export const fetchWorkoutProgramWithVersionsService = async (id: string, versionId?: string) => {
    const programResult = await pg.query(
        `SELECT * FROM workout_programs WHERE id = $1 AND deleted_at IS NULL`,
        [id],
    );
    const program = programResult.rows[0];
    if (!program) {
        return null;
    }

    const versionResult = versionId
        ? await pg.query(
            `SELECT * FROM workout_program_versions
            WHERE id = $1 AND workout_program_id = $2 AND deleted_at IS NULL`,
            [versionId, id],
        )
        : await pg.query(
            `SELECT * FROM workout_program_versions
            WHERE workout_program_id = $1 AND deleted_at IS NULL
            ORDER BY version_number DESC
            LIMIT 1`,
            [id],
        );
    const version = versionResult.rows[0];
    if (!version) {
        return { ...program, program_days: [] };
    }

    const daysResult = await pg.query(
        `SELECT * FROM program_days
        WHERE workout_program_version_id = $1 AND deleted_at IS NULL
        ORDER BY day_number ASC`,
        [version.id],
    );
    const days = daysResult.rows;

    const sessionsResult = days.length > 0
        ? await pg.query(
            `SELECT * FROM program_day_sessions
            WHERE workout_program_day_id = ANY($1::uuid[]) AND deleted_at IS NULL
            ORDER BY created_at ASC`,
            [days.map((d) => d.id)],
        )
        : { rows: [] };
    const sessions = sessionsResult.rows;

    const exercisesResult = sessions.length > 0
        ? await pg.query(
            `SELECT wpe.*, e.name AS exercise_name
            FROM workout_program_exercises wpe
            INNER JOIN exercises e ON e.id = wpe.exercise_id
            WHERE wpe.workout_program_day_session_id = ANY($1::uuid[]) AND wpe.deleted_at IS NULL
            ORDER BY wpe.exercise_order ASC`,
            [sessions.map((s) => s.id)],
        )
        : { rows: [] };
    const exercises = exercisesResult.rows;

    const exercisesBySession = new Map<string, Record<string, unknown>[]>();
    for (const exercise of exercises) {
        const list = exercisesBySession.get(exercise.workout_program_day_session_id) ?? [];
        list.push(exercise);
        exercisesBySession.set(exercise.workout_program_day_session_id, list);
    }

    const sessionsByDay = new Map<string, Record<string, unknown>[]>();
    for (const session of sessions) {
        const list = sessionsByDay.get(session.workout_program_day_id) ?? [];
        list.push({
            ...session,
            exercises: exercisesBySession.get(session.id) ?? [],
        });
        sessionsByDay.set(session.workout_program_day_id, list);
    }

    const program_days = days.map((day) => ({
        ...day,
        sessions: sessionsByDay.get(day.id) ?? [],
    }));

    return {
        ...program,
        description: version.description,
        split_type: version.split_type,
        session_ordering_logic: version.session_ordering_logic,
        duration_type: version.duration_type,
        duration_weeks: version.duration_weeks,
        version_visibility: version.visibility,
        program_days,
    };
}
