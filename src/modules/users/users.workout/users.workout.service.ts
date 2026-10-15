import { AppError } from "../../../shared/errors/AppError.js";
import { isValidUUID } from "../../../utils/validation.js";
import { resolveSupportedTimezone } from "../../../utils/timezone.js";
import { addOneInTable, fetchManyFromTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { EXERCISES_TABLE, ExercisesInterface } from "../../../db/schemas/exercises/exercises.schema.js";
import { PROGRAM_DAYS_TABLE, ProgramDaysInterface } from "../../../db/schemas/workoutPrograms/programDays.schema.js";
import { PROGRAM_DAY_SESSIONS_TABLE, ProgramDaySessionsInterface } from "../../../db/schemas/workoutPrograms/programDaySessions.schema.js";
import { WORKOUT_PROGRAM_EXERCISES_TABLE, WorkoutProgramExercisesInterface } from "../../../db/schemas/workoutPrograms/workoutProgramExercises.schema.js";
import { USER_PROGRAM_ASSIGNMENTS_TABLE, UserProgramAssignmentsInterface } from "../../../db/schemas/users/workout/userProgramAssignments.schema.js";
import { WORKOUT_SESSIONS_TABLE, WorkoutSessionsInterface } from "../../../db/schemas/users/workout/workoutSessions.schema.js";
import { WORKOUT_SETS_TABLE, WorkoutSetsInterface } from "../../../db/schemas/users/workout/workoutSets.schema.js";
import { WORKOUT_SET_ALARMS_TABLE, WorkoutSetAlarmsInterface } from "../../../db/schemas/users/workout/workoutSetAlarms.schema.js";
import { USER_HEALTH_PREFERENCES_TABLE, UserHealthPreferencesInterface } from "../../../db/schemas/users/userHealthPreferences.schema.js";
import {
    fetchActiveAlarmsRepository,
    fetchExerciseHistoryRepository,
    fetchLatestPublicVersionForProgramRepository,
    fetchNonEmptyProgramDaysRepository,
    fetchNonEmptyProgramDaySessionsRepository,
    fetchPlanVersionForAccessCheckRepository,
    userHasAssignmentForVersionRepository,
    fetchPlanDetailTreeRepository,
    fetchPublicWorkoutPlansRepository,
    fetchUserAssignmentsRepository,
    fetchWorkoutSessionsRepository,
    fetchWorkoutSessionDetailRepository,
    fetchOngoingWorkoutSessionRepository,
    fetchRequiredWeekdaysRepository,
    fetchWorkedOutDatesRepository,
    fetchTonnageSinceRepository,
    fetchRecentPRsRepository,
    fetchWorkoutCountAndAvgDurationRepository,
    fetchWeeklyVolumeSeriesRepository,
} from "./users.workout.repository.js";
import { recordMuscleStimulusForLoggedSets } from "../users.muscleSignals/users.muscleSignals.service.js";

// ---------------------------------------------------------------------------
// Ownership helpers — shared by the browsing/session/set endpoints below.
// ---------------------------------------------------------------------------

const getOwnedAssignmentOrThrow = async (userId: string, assignmentId: string) => {
    if (!isValidUUID(assignmentId)) {
        throw new AppError("Invalid assignment id", 400);
    }
    const assignment = await fetchOneFromTable({
        table: USER_PROGRAM_ASSIGNMENTS_TABLE,
        where: [
            { field: "id", operator: "=", value: assignmentId },
            { field: "user_id", operator: "=", value: userId },
        ],
    }) as UserProgramAssignmentsInterface | null;
    if (!assignment) {
        throw new AppError("Workout plan selection not found", 404);
    }
    return assignment;
}

const getOwnedProgramDayOrThrow = async (assignment: UserProgramAssignmentsInterface, dayId: string) => {
    if (!isValidUUID(dayId)) {
        throw new AppError("Invalid day id", 400);
    }
    const day = await fetchOneFromTable({
        table: PROGRAM_DAYS_TABLE,
        where: [
            { field: "id", operator: "=", value: dayId },
            { field: "workout_program_version_id", operator: "=", value: assignment.workout_program_version_id },
        ],
    }) as ProgramDaysInterface | null;
    if (!day) {
        throw new AppError("Day not found", 404);
    }
    return day;
}

const getOwnedProgramDaySessionOrThrow = async (day: ProgramDaysInterface, sessionId: string) => {
    if (!isValidUUID(sessionId)) {
        throw new AppError("Invalid session id", 400);
    }
    const session = await fetchOneFromTable({
        table: PROGRAM_DAY_SESSIONS_TABLE,
        where: [
            { field: "id", operator: "=", value: sessionId },
            { field: "workout_program_day_id", operator: "=", value: day.id },
        ],
    }) as ProgramDaySessionsInterface | null;
    if (!session) {
        throw new AppError("Session not found", 404);
    }
    return session;
}

const getOwnedWorkoutSessionOrThrow = async (userId: string, sessionId: string) => {
    if (!isValidUUID(sessionId)) {
        throw new AppError("Invalid session id", 400);
    }
    const session = await fetchOneFromTable({
        table: WORKOUT_SESSIONS_TABLE,
        where: [
            { field: "id", operator: "=", value: sessionId },
            { field: "user_id", operator: "=", value: userId },
        ],
    }) as WorkoutSessionsInterface | null;
    if (!session) {
        throw new AppError("Workout session not found", 404);
    }
    return session;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const listPublicWorkoutPlansService = async () => {
    return await fetchPublicWorkoutPlansRepository();
}

export const listMyWorkoutPlansService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    return await fetchUserAssignmentsRepository({ userId });
}

export const listActiveWorkoutPlansService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    return await fetchUserAssignmentsRepository({ userId, activeOnly: true });
}

export const selectWorkoutPlanService = async (data: {
    userId?: string,
    workout_program_id?: string,
}) => {
    const { userId, workout_program_id } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!workout_program_id) {
        throw new AppError("workout_program_id is required", 400);
    }
    if (!isValidUUID(workout_program_id)) {
        throw new AppError("Invalid workout_program_id", 400);
    }

    const plan = await fetchLatestPublicVersionForProgramRepository(workout_program_id);
    if (!plan) {
        throw new AppError("Workout plan not found", 404);
    }

    const existing = await fetchOneFromTable({
        table: USER_PROGRAM_ASSIGNMENTS_TABLE,
        where: [
            { field: "user_id", operator: "=", value: userId },
            { field: "workout_program_version_id", operator: "=", value: plan.workout_program_version_id },
        ],
    }) as UserProgramAssignmentsInterface | null;

    if (existing) {
        if (existing.is_active) {
            return existing;
        }
        return await updateOneInTable({
            table: USER_PROGRAM_ASSIGNMENTS_TABLE,
            data: { is_active: true },
            where: [{ field: "id", operator: "=", value: existing.id }],
        }) as UserProgramAssignmentsInterface;
    }

    return await addOneInTable({
        table: USER_PROGRAM_ASSIGNMENTS_TABLE,
        data: {
            user_id: userId,
            workout_program_version_id: plan.workout_program_version_id,
            started_at: new Date(),
            is_active: true,
        },
    }) as UserProgramAssignmentsInterface;
}

export const deactivateWorkoutPlanService = async (data: {
    userId?: string,
    assignmentId?: string,
}) => {
    const { userId, assignmentId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!assignmentId) {
        throw new AppError("Assignment ID is required", 400);
    }
    const assignment = await getOwnedAssignmentOrThrow(userId, assignmentId);

    return await updateOneInTable({
        table: USER_PROGRAM_ASSIGNMENTS_TABLE,
        data: { is_active: false },
        where: [{ field: "id", operator: "=", value: assignment.id }],
    }) as UserProgramAssignmentsInterface;
}

/**
 * Full read-only configuration of one program version — every day (1–7,
 * including empty rest days), every session, every exercise. Distinct from
 * the pick-a-day-to-train flow below, which deliberately hides empty days.
 *
 * Access: either the version is currently public (Browse Plans), or the
 * user has (or once had) an assignment pointing at this exact version (My
 * Plans) — covers a plan the admin later made private after the user
 * already added it.
 */
export const getPlanDetailService = async (data: {
    userId?: string,
    workoutProgramVersionId?: string,
}) => {
    const { userId, workoutProgramVersionId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!workoutProgramVersionId) {
        throw new AppError("workout_program_version_id is required", 400);
    }
    if (!isValidUUID(workoutProgramVersionId)) {
        throw new AppError("Invalid workout_program_version_id", 400);
    }

    const planVersion = await fetchPlanVersionForAccessCheckRepository(workoutProgramVersionId);
    if (!planVersion) {
        throw new AppError("Workout plan not found", 404);
    }

    const isPublic = planVersion.program_visibility === "public" && planVersion.version_visibility === "public";
    if (!isPublic) {
        const owns = await userHasAssignmentForVersionRepository(userId, workoutProgramVersionId);
        if (!owns) {
            throw new AppError("You don't have access to this workout plan", 403);
        }
    }

    const program_days = await fetchPlanDetailTreeRepository(workoutProgramVersionId);

    return { ...planVersion, program_days };
}

// ---------------------------------------------------------------------------
// Day / session / exercise browsing
// ---------------------------------------------------------------------------

export const listDaysForAssignmentService = async (data: {
    userId?: string,
    assignmentId?: string,
}) => {
    const { userId, assignmentId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!assignmentId) {
        throw new AppError("Assignment ID is required", 400);
    }
    const assignment = await getOwnedAssignmentOrThrow(userId, assignmentId);

    return await fetchNonEmptyProgramDaysRepository(assignment.workout_program_version_id);
}

export const listSessionsForDayService = async (data: {
    userId?: string,
    assignmentId?: string,
    dayId?: string,
}) => {
    const { userId, assignmentId, dayId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!assignmentId) {
        throw new AppError("Assignment ID is required", 400);
    }
    if (!dayId) {
        throw new AppError("Day ID is required", 400);
    }
    const assignment = await getOwnedAssignmentOrThrow(userId, assignmentId);
    const day = await getOwnedProgramDayOrThrow(assignment, dayId);

    return await fetchNonEmptyProgramDaySessionsRepository(day.id);
}

export const listExercisesForSessionService = async (data: {
    userId?: string,
    assignmentId?: string,
    dayId?: string,
    sessionId?: string,
}) => {
    const { userId, assignmentId, dayId, sessionId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!assignmentId) {
        throw new AppError("Assignment ID is required", 400);
    }
    if (!dayId) {
        throw new AppError("Day ID is required", 400);
    }
    if (!sessionId) {
        throw new AppError("Session ID is required", 400);
    }
    const assignment = await getOwnedAssignmentOrThrow(userId, assignmentId);
    const day = await getOwnedProgramDayOrThrow(assignment, dayId);
    const session = await getOwnedProgramDaySessionOrThrow(day, sessionId);

    const programExercises = await fetchManyFromTable({
        table: WORKOUT_PROGRAM_EXERCISES_TABLE,
        where: [{ field: "workout_program_day_session_id", operator: "=", value: session.id }],
        sortBy: { exercise_order: "asc" },
    }) as WorkoutProgramExercisesInterface[];

    const exerciseIds = programExercises
        .map((pe) => pe.exercise_id)
        .filter((id): id is string => !!id);

    const exercises = exerciseIds.length > 0
        ? await fetchManyFromTable({
            table: EXERCISES_TABLE,
            where: [{ field: "id", operator: "IN", value: exerciseIds }],
        }) as ExercisesInterface[]
        : [];
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));

    return programExercises.map((pe) => ({
        ...pe,
        exercise: pe.exercise_id ? exerciseById.get(pe.exercise_id) ?? null : null,
    }));
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export const startWorkoutSessionService = async (data: {
    userId?: string,
    assignment_id?: string,
    program_day_id?: string,
    program_day_session_id?: string,
}) => {
    const { userId, assignment_id, program_day_id, program_day_session_id } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!assignment_id) {
        throw new AppError("assignment_id is required", 400);
    }
    if (!program_day_id) {
        throw new AppError("program_day_id is required", 400);
    }
    if (!program_day_session_id) {
        throw new AppError("program_day_session_id is required", 400);
    }

    const assignment = await getOwnedAssignmentOrThrow(userId, assignment_id);
    if (!assignment.is_active) {
        throw new AppError("This workout plan is not currently active", 400);
    }
    const day = await getOwnedProgramDayOrThrow(assignment, program_day_id);
    await getOwnedProgramDaySessionOrThrow(day, program_day_session_id);

    await updateOneInTable({
        table: USER_PROGRAM_ASSIGNMENTS_TABLE,
        data: {
            current_program_day_id: program_day_id,
            current_program_day_session_id: program_day_session_id,
        },
        where: [{ field: "id", operator: "=", value: assignment.id }],
    });

    // Resume any workout in progress for this plan rather than starting a
    // second, orphaning the first.
    const existing = await fetchOneFromTable({
        table: WORKOUT_SESSIONS_TABLE,
        where: [
            { field: "user_id", operator: "=", value: userId },
            { field: "program_assignment_id", operator: "=", value: assignment.id },
            { field: "completed_at", operator: "IS NULL" },
        ],
    }) as WorkoutSessionsInterface | null;
    if (existing) {
        return existing;
    }

    return await addOneInTable({
        table: WORKOUT_SESSIONS_TABLE,
        data: {
            user_id: userId,
            program_assignment_id: assignment.id,
            started_at: new Date(),
        },
    }) as WorkoutSessionsInterface;
}

/**
 * Adds an exercise to a live session that isn't part of the admin-authored
 * plan (e.g. a planned machine was occupied). Creates a session-scoped
 * `workout_program_exercises` row with no day/session/order — set logging,
 * history, and alarms all key off `workout_program_exercise_id` with no
 * day/session scoping, so nothing else needs to change to support it.
 */
export const addAdhocExerciseToSessionService = async (data: {
    userId?: string,
    sessionId?: string,
    exercise_id?: string,
}) => {
    const { userId, sessionId, exercise_id } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!sessionId) {
        throw new AppError("Session ID is required", 400);
    }
    if (!exercise_id) {
        throw new AppError("exercise_id is required", 400);
    }
    if (!isValidUUID(exercise_id)) {
        throw new AppError("Invalid exercise_id", 400);
    }

    const session = await getOwnedWorkoutSessionOrThrow(userId, sessionId);
    if (session.completed_at) {
        throw new AppError("This workout session has already finished", 400);
    }

    const assignment = await fetchOneFromTable({
        table: USER_PROGRAM_ASSIGNMENTS_TABLE,
        where: [{ field: "id", operator: "=", value: session.program_assignment_id }],
    }) as UserProgramAssignmentsInterface | null;
    if (!assignment) {
        throw new AppError("Workout plan selection not found", 404);
    }

    const exercise = await fetchOneFromTable({
        table: EXERCISES_TABLE,
        where: [{ field: "id", operator: "=", value: exercise_id }],
    }) as ExercisesInterface | null;
    if (!exercise) {
        throw new AppError("Exercise not found", 404);
    }

    const programExercise = await addOneInTable({
        table: WORKOUT_PROGRAM_EXERCISES_TABLE,
        data: {
            workout_program_version_id: assignment.workout_program_version_id,
            workout_session_id: session.id,
            workout_program_day_session_id: null,
            exercise_id,
            exercise_order: null,
            target_sets: null,
            min_reps: null,
            max_reps: null,
            added_by_user_id: userId,
            visibility: "private",
        },
    }) as WorkoutProgramExercisesInterface;

    return { ...programExercise, exercise };
}

export const getSessionSetsService = async (data: {
    userId?: string,
    sessionId?: string,
}) => {
    const { userId, sessionId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!sessionId) {
        throw new AppError("Session ID is required", 400);
    }
    const session = await getOwnedWorkoutSessionOrThrow(userId, sessionId);

    return await fetchManyFromTable({
        table: WORKOUT_SETS_TABLE,
        where: [{ field: "workout_session_id", operator: "=", value: session.id }],
        sortBy: { set_order: "asc" },
    }) as WorkoutSetsInterface[];
}

export const finishWorkoutSessionService = async (data: {
    userId?: string,
    sessionId?: string,
}) => {
    const { userId, sessionId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!sessionId) {
        throw new AppError("Session ID is required", 400);
    }
    const session = await getOwnedWorkoutSessionOrThrow(userId, sessionId);

    return await updateOneInTable({
        table: WORKOUT_SESSIONS_TABLE,
        data: { completed_at: new Date() },
        where: [{ field: "id", operator: "=", value: session.id }],
    }) as WorkoutSessionsInterface;
}

export const getOngoingWorkoutSessionService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    return await fetchOngoingWorkoutSessionRepository(userId);
}

// ---------------------------------------------------------------------------
// Set logging
// ---------------------------------------------------------------------------

export interface DropSetInput {
    weight?: number | null;
    tool_weight?: number | null;
    reps?: number | null;
    rir?: number | null;
    effort?: string | null;
    discomfort_notes?: string | null;
}

const MAX_DROP_SETS = 10;

const validateSetFields = (fields: {
    weight?: number | null,
    tool_weight?: number | null,
    reps?: number | null,
}, label: string) => {
    const { weight, tool_weight, reps } = fields;
    if (reps == null || reps <= 0) {
        throw new AppError(`Reps is required${label}`, 400);
    }
    if (weight != null && weight < 0) {
        throw new AppError(`Weight cannot be negative${label}`, 400);
    }
    if (tool_weight != null && tool_weight < 0) {
        throw new AppError(`Tool weight cannot be negative${label}`, 400);
    }
}

/**
 * Inserts one "main" set row plus, if given, its dropset children
 * (`parent_set_id`/`drop_order` on each). `setOrder` is passed in rather than
 * computed here so callers (single-create vs. batch-create) can control how
 * it's resolved — batch inserts for the same exercise must share an
 * in-memory running counter instead of each re-querying the DB.
 */
const insertSetWithDropsets = async (params: {
    workout_session_id: string,
    workout_program_exercise_id: string,
    setOrder: number,
    weight?: number | null,
    tool_weight?: number | null,
    reps?: number | null,
    rir?: number | null,
    effort?: string | null,
    discomfort_notes?: string | null,
    is_warmup?: boolean | null,
    drop_sets?: DropSetInput[] | null,
}): Promise<{ set: WorkoutSetsInterface, dropSets: WorkoutSetsInterface[] }> => {
    const {
        workout_session_id,
        workout_program_exercise_id,
        setOrder,
        weight,
        tool_weight,
        reps,
        rir,
        effort,
        discomfort_notes,
        is_warmup,
        drop_sets,
    } = params;

    const set = await addOneInTable({
        table: WORKOUT_SETS_TABLE,
        data: {
            workout_session_id,
            workout_program_exercise_id,
            set_order: setOrder,
            weight: weight ?? null,
            tool_weight: tool_weight ?? null,
            reps: reps ?? null,
            rir: rir ?? null,
            effort: effort || null,
            discomfort_notes: discomfort_notes || null,
            is_warmup: is_warmup ?? false,
        },
    }) as WorkoutSetsInterface;

    const dropSets: WorkoutSetsInterface[] = [];
    if (drop_sets && drop_sets.length > 0) {
        for (let i = 0; i < drop_sets.length; i++) {
            const drop = drop_sets[i];
            const dropRow = await addOneInTable({
                table: WORKOUT_SETS_TABLE,
                data: {
                    workout_session_id,
                    workout_program_exercise_id,
                    set_order: setOrder,
                    parent_set_id: set.id,
                    drop_order: i + 1,
                    weight: drop.weight ?? null,
                    tool_weight: drop.tool_weight ?? null,
                    reps: drop.reps ?? null,
                    rir: drop.rir ?? null,
                    effort: drop.effort || null,
                    discomfort_notes: drop.discomfort_notes || null,
                },
            }) as WorkoutSetsInterface;
            dropSets.push(dropRow);
        }
    }

    return { set, dropSets };
}

export const createWorkoutSetService = async (data: {
    userId?: string,
    workout_session_id?: string,
    workout_program_exercise_id?: string,
    weight?: number | null,
    tool_weight?: number | null,
    reps?: number | null,
    rir?: number | null,
    effort?: string | null,
    discomfort_notes?: string | null,
    is_warmup?: boolean | null,
    alarm_message?: string | null,
    drop_sets?: DropSetInput[] | null,
}) => {
    const {
        userId,
        workout_session_id,
        workout_program_exercise_id,
        weight,
        tool_weight,
        reps,
        rir,
        effort,
        discomfort_notes,
        is_warmup,
        alarm_message,
        drop_sets,
    } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!workout_session_id) {
        throw new AppError("workout_session_id is required", 400);
    }
    if (!workout_program_exercise_id) {
        throw new AppError("workout_program_exercise_id is required", 400);
    }
    if (!isValidUUID(workout_program_exercise_id)) {
        throw new AppError("Invalid workout_program_exercise_id", 400);
    }
    validateSetFields({ weight, tool_weight, reps }, "");
    if (drop_sets && drop_sets.length > MAX_DROP_SETS) {
        throw new AppError(`A set can have at most ${MAX_DROP_SETS} drop sets`, 400);
    }
    for (const drop of drop_sets ?? []) {
        validateSetFields(drop, " for drop set");
    }

    const session = await getOwnedWorkoutSessionOrThrow(userId, workout_session_id);

    const programExercise = await fetchOneFromTable({
        table: WORKOUT_PROGRAM_EXERCISES_TABLE,
        where: [{ field: "id", operator: "=", value: workout_program_exercise_id }],
    }) as WorkoutProgramExercisesInterface | null;
    if (!programExercise) {
        throw new AppError("Exercise not found in plan", 404);
    }

    // Only main sets (parent_set_id IS NULL) count toward "Set N" numbering —
    // dropset children share their parent's set_order, not their own slot.
    const existingMainSets = await fetchManyFromTable({
        table: WORKOUT_SETS_TABLE,
        where: [
            { field: "workout_session_id", operator: "=", value: session.id },
            { field: "workout_program_exercise_id", operator: "=", value: workout_program_exercise_id },
            { field: "parent_set_id", operator: "IS NULL" },
        ],
    }) as WorkoutSetsInterface[];
    const setOrder = existingMainSets.length + 1;

    const { set, dropSets } = await insertSetWithDropsets({
        workout_session_id: session.id,
        workout_program_exercise_id,
        setOrder,
        weight,
        tool_weight,
        reps,
        rir,
        effort,
        discomfort_notes,
        is_warmup,
        drop_sets,
    });

    let alarm: WorkoutSetAlarmsInterface | null = null;
    if (alarm_message && alarm_message.trim()) {
        if (!programExercise.exercise_id) {
            throw new AppError("Cannot raise an alarm for this plan entry", 400);
        }
        alarm = await addOneInTable({
            table: WORKOUT_SET_ALARMS_TABLE,
            data: {
                user_id: userId,
                workout_set_id: set.id,
                exercise_id: programExercise.exercise_id,
                message: alarm_message.trim(),
            },
        }) as WorkoutSetAlarmsInterface;
    }

    await recordMuscleStimulusForLoggedSets({
        userId,
        workoutProgramExerciseId: workout_program_exercise_id,
        sets: [set, ...dropSets].map((s) => ({ rir: s.rir, is_warmup: s.is_warmup })),
    });

    return { set, dropSets, alarm };
}

export const updateWorkoutSetService = async (data: {
    userId?: string,
    setId?: string,
    weight?: number | null,
    tool_weight?: number | null,
    reps?: number | null,
    rir?: number | null,
    effort?: string | null,
    discomfort_notes?: string | null,
    is_warmup?: boolean | null,
}) => {
    const { userId, setId, weight, tool_weight, reps, rir, effort, discomfort_notes, is_warmup } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!setId) {
        throw new AppError("Set ID is required", 400);
    }
    if (!isValidUUID(setId)) {
        throw new AppError("Invalid set id", 400);
    }
    validateSetFields({ weight, tool_weight, reps }, "");

    const set = await fetchOneFromTable({
        table: WORKOUT_SETS_TABLE,
        where: [{ field: "id", operator: "=", value: setId }],
    }) as WorkoutSetsInterface | null;
    if (!set) {
        throw new AppError("Set not found", 404);
    }
    // Sets don't carry user_id directly — ownership is proven via the
    // session they were logged against.
    await getOwnedWorkoutSessionOrThrow(userId, set.workout_session_id);

    return await updateOneInTable({
        table: WORKOUT_SETS_TABLE,
        data: {
            weight: weight ?? null,
            tool_weight: tool_weight ?? null,
            reps: reps ?? null,
            rir: rir ?? null,
            effort: effort || null,
            discomfort_notes: discomfort_notes || null,
            is_warmup: is_warmup ?? false,
        },
        where: [{ field: "id", operator: "=", value: setId }],
    }) as WorkoutSetsInterface;
}

// ---------------------------------------------------------------------------
// Batch set logging (offline-sync flush)
// ---------------------------------------------------------------------------

export interface BatchSetInput {
    client_id?: string,
    workout_session_id?: string,
    workout_program_exercise_id?: string,
    weight?: number | null,
    tool_weight?: number | null,
    reps?: number | null,
    rir?: number | null,
    effort?: string | null,
    discomfort_notes?: string | null,
    is_warmup?: boolean | null,
    alarm_message?: string | null,
    drop_sets?: DropSetInput[] | null,
}

export type BatchSetResult =
    | { client_id: string, set: WorkoutSetsInterface, dropSets: WorkoutSetsInterface[], alarm: WorkoutSetAlarmsInterface | null }
    | { client_id: string, error: string };

/**
 * Flushes a batch of queued (offline-logged) sets in one call. Items may
 * span multiple exercises/sessions; each is validated and inserted
 * independently so one bad item doesn't fail the whole batch. `set_order` is
 * seeded once per (session, exercise) group from the DB and then tracked
 * in-memory across the batch, since sibling items in the same flush haven't
 * been persisted yet and can't each ask the DB "what's next".
 */
export const createWorkoutSetsBatchService = async (data: {
    userId?: string,
    sets?: BatchSetInput[],
}): Promise<{ results: BatchSetResult[] }> => {
    const { userId, sets } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!sets || sets.length === 0) {
        throw new AppError("sets is required", 400);
    }

    const sessionCache = new Map<string, WorkoutSessionsInterface>();
    const programExerciseCache = new Map<string, WorkoutProgramExercisesInterface>();
    const nextSetOrderByGroup = new Map<string, number>();

    const results: BatchSetResult[] = [];

    for (const item of sets) {
        const {
            client_id,
            workout_session_id,
            workout_program_exercise_id,
            weight,
            tool_weight,
            reps,
            rir,
            effort,
            discomfort_notes,
            is_warmup,
            alarm_message,
            drop_sets,
        } = item;

        if (!client_id) {
            // Can't report a per-item failure without a client_id to key it by.
            continue;
        }

        try {
            if (!workout_session_id) {
                throw new AppError("workout_session_id is required", 400);
            }
            if (!workout_program_exercise_id || !isValidUUID(workout_program_exercise_id)) {
                throw new AppError("Invalid workout_program_exercise_id", 400);
            }
            validateSetFields({ weight, tool_weight, reps }, "");
            if (drop_sets && drop_sets.length > MAX_DROP_SETS) {
                throw new AppError(`A set can have at most ${MAX_DROP_SETS} drop sets`, 400);
            }
            for (const drop of drop_sets ?? []) {
                validateSetFields(drop, " for drop set");
            }

            let session = sessionCache.get(workout_session_id);
            if (!session) {
                session = await getOwnedWorkoutSessionOrThrow(userId, workout_session_id);
                sessionCache.set(workout_session_id, session);
            }

            let programExercise = programExerciseCache.get(workout_program_exercise_id);
            if (!programExercise) {
                const found = await fetchOneFromTable({
                    table: WORKOUT_PROGRAM_EXERCISES_TABLE,
                    where: [{ field: "id", operator: "=", value: workout_program_exercise_id }],
                }) as WorkoutProgramExercisesInterface | null;
                if (!found) {
                    throw new AppError("Exercise not found in plan", 404);
                }
                programExercise = found;
                programExerciseCache.set(workout_program_exercise_id, programExercise);
            }

            const groupKey = `${session.id}::${workout_program_exercise_id}`;
            let setOrder = nextSetOrderByGroup.get(groupKey);
            if (setOrder == null) {
                const existingMainSets = await fetchManyFromTable({
                    table: WORKOUT_SETS_TABLE,
                    where: [
                        { field: "workout_session_id", operator: "=", value: session.id },
                        { field: "workout_program_exercise_id", operator: "=", value: workout_program_exercise_id },
                        { field: "parent_set_id", operator: "IS NULL" },
                    ],
                }) as WorkoutSetsInterface[];
                setOrder = existingMainSets.length + 1;
            }
            nextSetOrderByGroup.set(groupKey, setOrder + 1);

            const { set, dropSets } = await insertSetWithDropsets({
                workout_session_id: session.id,
                workout_program_exercise_id,
                setOrder,
                weight,
                tool_weight,
                reps,
                rir,
                effort,
                discomfort_notes,
                is_warmup,
                drop_sets,
            });

            let alarm: WorkoutSetAlarmsInterface | null = null;
            if (alarm_message && alarm_message.trim()) {
                if (!programExercise.exercise_id) {
                    throw new AppError("Cannot raise an alarm for this plan entry", 400);
                }
                alarm = await addOneInTable({
                    table: WORKOUT_SET_ALARMS_TABLE,
                    data: {
                        user_id: userId,
                        workout_set_id: set.id,
                        exercise_id: programExercise.exercise_id,
                        message: alarm_message.trim(),
                    },
                }) as WorkoutSetAlarmsInterface;
            }

            await recordMuscleStimulusForLoggedSets({
                userId,
                workoutProgramExerciseId: workout_program_exercise_id,
                sets: [set, ...dropSets].map((s) => ({ rir: s.rir, is_warmup: s.is_warmup })),
            });

            results.push({ client_id, set, dropSets, alarm });
        } catch (error) {
            results.push({
                client_id,
                error: error instanceof AppError ? error.message : "Failed to log set",
            });
        }
    }

    return { results };
}

// ---------------------------------------------------------------------------
// Exercise history
// ---------------------------------------------------------------------------

export const getExerciseHistoryService = async (data: {
    userId?: string,
    exerciseId?: string,
    limit?: number,
    beforeSessionId?: string,
}) => {
    const { userId, exerciseId, beforeSessionId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!exerciseId) {
        throw new AppError("Exercise ID is required", 400);
    }
    if (!isValidUUID(exerciseId)) {
        throw new AppError("Invalid exercise id", 400);
    }
    const limit = Math.min(Math.max(data.limit ?? 5, 1), 200);

    let beforeDate: Date | undefined;
    if (beforeSessionId) {
        const beforeSession = await getOwnedWorkoutSessionOrThrow(userId, beforeSessionId);
        beforeDate = beforeSession.started_at;
    }

    return await fetchExerciseHistoryRepository({ userId, exerciseId, limit, beforeDate });
}

// ---------------------------------------------------------------------------
// Past workout sessions
// ---------------------------------------------------------------------------

export const listWorkoutSessionsService = async (data: {
    userId?: string,
    page?: number,
    limit?: number,
}) => {
    const { userId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    const page = Math.max(data.page ?? 1, 1);
    const limit = Math.min(Math.max(data.limit ?? 20, 1), 100);

    const { data: sessions, totalCount } = await fetchWorkoutSessionsRepository({ userId, page, limit });
    return {
        data: sessions,
        meta: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
        },
    };
}

export const getWorkoutSessionDetailService = async (data: {
    userId?: string,
    sessionId?: string,
}) => {
    const { userId, sessionId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!sessionId) {
        throw new AppError("Session ID is required", 400);
    }
    if (!isValidUUID(sessionId)) {
        throw new AppError("Invalid session id", 400);
    }

    const detail = await fetchWorkoutSessionDetailRepository({ userId, sessionId });
    if (!detail) {
        throw new AppError("Workout session not found", 404);
    }
    return detail;
}

// ---------------------------------------------------------------------------
// Dashboard alarms
// ---------------------------------------------------------------------------

export const listActiveAlarmsService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    return await fetchActiveAlarmsRepository(userId);
}

export const discardAlarmService = async (data: {
    userId?: string,
    alarmId?: string,
}) => {
    const { userId, alarmId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!alarmId) {
        throw new AppError("Alarm ID is required", 400);
    }
    if (!isValidUUID(alarmId)) {
        throw new AppError("Invalid alarm id", 400);
    }

    const alarm = await fetchOneFromTable({
        table: WORKOUT_SET_ALARMS_TABLE,
        where: [
            { field: "id", operator: "=", value: alarmId },
            { field: "user_id", operator: "=", value: userId },
        ],
        useSoftDelete: false,
    }) as WorkoutSetAlarmsInterface | null;
    if (!alarm) {
        throw new AppError("Alarm not found", 404);
    }

    return await updateOneInTable({
        table: WORKOUT_SET_ALARMS_TABLE,
        data: { discarded_at: new Date() },
        where: [{ field: "id", operator: "=", value: alarmId }],
        useSoftDelete: false,
    }) as WorkoutSetAlarmsInterface;
}

// ---------------------------------------------------------------------------
// Dashboard stats — streak, weekly consistency, weekly volume
// ---------------------------------------------------------------------------

const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_WEIGHT_UNITS = "kg";

const getUserHealthPreferencesOrDefault = async (
    userId: string,
): Promise<{ timezone: string, weight_units: string }> => {
    const prefs = await fetchOneFromTable({
        table: USER_HEALTH_PREFERENCES_TABLE,
        where: [{ field: "user_id", operator: "=", value: userId }],
        select: ["timezone", "weight_units"],
    }) as UserHealthPreferencesInterface | null;
    // Stored values may predate validation — map legacy aliases and fall back
    // to UTC rather than let an unknown zone fail the `AT TIME ZONE` queries.
    return {
        timezone: (prefs?.timezone && await resolveSupportedTimezone(prefs.timezone)) || DEFAULT_TIMEZONE,
        weight_units: prefs?.weight_units || DEFAULT_WEIGHT_UNITS,
    };
}

/** "YYYY-MM-DD" for `date` as seen in `timezone` — the user's local calendar day. */
const localDateString = (date: Date, timezone: string): string => {
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(date);
    } catch {
        // Invalid/unknown IANA zone stored on the user's prefs — fall back to UTC rather than throw.
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: DEFAULT_TIMEZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(date);
    }
}

/** 1=Mon..7=Sun for a "YYYY-MM-DD" date string. */
const isoWeekdayOf = (dateStr: string): number => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return day === 0 ? 7 : day;
}

const addDays = (dateStr: string, delta: number): string => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
}

/**
 * Current streak + this week's trained/not-trained days.
 *
 * Streak = consecutive calendar days, walking back from today, that were
 * "required" (that weekday is a non-empty training day for *any* currently
 * active plan) and "satisfied" (a workout was completed that day, under any
 * plan). A day required by overlapping plans only counts once. Non-required
 * days don't break the streak. Today, if required but not yet satisfied,
 * doesn't break the streak either — it's just not counted yet.
 *
 * Known limitation: there's no history of which plans were active on a past
 * date, only current `is_active` state — the walk applies the user's
 * *current* active plans' schedules retroactively across the whole
 * lookback window. A future "mark a sick/injury day" feature would need its
 * own exceptions table; not built here.
 */
export const getWorkoutConsistencyService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }

    const { timezone } = await getUserHealthPreferencesOrDefault(userId);
    const activeAssignments = await fetchUserAssignmentsRepository({ userId, activeOnly: true });

    // Computed unconditionally — zero active plans just means every weekday
    // comes back required=false, which is exactly "every day is a rest day."
    const requiredWeekdays = new Set(
        await fetchRequiredWeekdaysRepository(activeAssignments.map((a) => a.workout_program_version_id)),
    );

    const todayStr = localDateString(new Date(), timezone);
    const weekStartStr = addDays(todayStr, -(isoWeekdayOf(todayStr) - 1));
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStartStr, i));

    let earliestStartStr: string | null = null;
    for (const a of activeAssignments) {
        if (!a.started_at) continue;
        const s = localDateString(new Date(a.started_at), timezone);
        if (!earliestStartStr || s < earliestStartStr) earliestStartStr = s;
    }

    const sinceStr = earliestStartStr && earliestStartStr < weekStartStr ? earliestStartStr : weekStartStr;
    const workedOutDates = new Set(await fetchWorkedOutDatesRepository(userId, timezone, sinceStr));

    const week = weekDates.map((date) => ({
        date,
        trained: workedOutDates.has(date),
        required: requiredWeekdays.has(isoWeekdayOf(date)),
    }));

    if (activeAssignments.length === 0 || !earliestStartStr) {
        return { current_streak: 0, week };
    }

    let streak = 0;
    let cursor = todayStr;
    let isToday = true;
    while (cursor >= earliestStartStr) {
        if (requiredWeekdays.has(isoWeekdayOf(cursor))) {
            if (workedOutDates.has(cursor)) {
                streak++;
            } else if (!isToday) {
                break;
            }
        }
        cursor = addDays(cursor, -1);
        isToday = false;
    }

    return { current_streak: streak, week };
}

/**
 * Tonnage for the current calendar week: Σ (weight + tool_weight) × reps
 * across non-warmup sets. See workout-gym-api/algorithms/weekly-volume.md
 * for the full formula and its unit-handling caveat.
 */
export const getWeeklyVolumeService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }

    const { timezone, weight_units } = await getUserHealthPreferencesOrDefault(userId);
    const todayStr = localDateString(new Date(), timezone);
    const weekStartStr = addDays(todayStr, -(isoWeekdayOf(todayStr) - 1));

    const weekly_volume = await fetchTonnageSinceRepository(userId, timezone, weekStartStr);
    return { weekly_volume, weight_units };
}

/**
 * The user's current PR for every exercise they've logged, most-recently-set
 * first. See workout-gym-api/algorithms/personal-records.md.
 */
export const getRecentPRsService = async (data: {
    userId?: string,
    limit?: number,
}) => {
    const { userId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    // Cap high enough to comfortably cover "every exercise this user has
    // ever logged" for the Strength tab's full PR list, not just a
    // dashboard-card-sized preview.
    const limit = Math.min(Math.max(data.limit ?? 10, 1), 300);
    return await fetchRecentPRsRepository(userId, limit);
}

const PROGRESS_SERIES_WEEKS = 16;
const PROGRESS_CHART_WEEKS = 8;

const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

const percentChange = (from: number, to: number): number | null =>
    from === 0 ? null : ((to - from) / from) * 100;

/**
 * All-time volume/workout-count/avg-duration, plus a 16-week tonnage series
 * (oldest first) used to derive the 8-week chart, week-over-week change,
 * best/avg week, and a ~3-months-ago growth rate — one query for all of it.
 * Backs both the Progress tab's Overview and Volume sub-tabs.
 */
/**
 * Full completed weeks (Monday-start) from the earliest currently-active
 * assignment's start through the most recent completed week, and how many
 * of those were "consistent" (every required weekday that week was
 * trained). The current, still-in-progress week is excluded — a week can't
 * be judged consistent until it's actually over. Same known limitation as
 * getWorkoutConsistencyService: required weekdays are derived from the
 * user's *current* active assignments, applied retroactively across the
 * whole window (no historical activation-window data exists).
 */
const computeWeeklyConsistencyHistory = async (
    userId: string,
    timezone: string,
): Promise<{ consistent_weeks: number, total_tracked_weeks: number }> => {
    const activeAssignments = await fetchUserAssignmentsRepository({ userId, activeOnly: true });
    if (activeAssignments.length === 0) {
        return { consistent_weeks: 0, total_tracked_weeks: 0 };
    }

    let earliestStartStr: string | null = null;
    for (const a of activeAssignments) {
        if (!a.started_at) continue;
        const s = localDateString(new Date(a.started_at), timezone);
        if (!earliestStartStr || s < earliestStartStr) earliestStartStr = s;
    }
    if (!earliestStartStr) {
        return { consistent_weeks: 0, total_tracked_weeks: 0 };
    }

    const todayStr = localDateString(new Date(), timezone);
    const currentWeekStartStr = addDays(todayStr, -(isoWeekdayOf(todayStr) - 1));
    const earliestWeekStartStr = addDays(earliestStartStr, -(isoWeekdayOf(earliestStartStr) - 1));
    const lastFullWeekStartStr = addDays(currentWeekStartStr, -7);

    // The active assignment(s) started this week or later — no fully
    // completed tracked week exists yet.
    if (earliestWeekStartStr > lastFullWeekStartStr) {
        return { consistent_weeks: 0, total_tracked_weeks: 0 };
    }

    const [requiredWeekdays, workedOutDates] = await Promise.all([
        fetchRequiredWeekdaysRepository(activeAssignments.map((a) => a.workout_program_version_id)),
        fetchWorkedOutDatesRepository(userId, timezone, earliestWeekStartStr),
    ]);
    const requiredSet = new Set(requiredWeekdays);
    const workedSet = new Set(workedOutDates);

    let consistent_weeks = 0;
    let total_tracked_weeks = 0;
    for (
        let weekStart = earliestWeekStartStr;
        weekStart <= lastFullWeekStartStr;
        weekStart = addDays(weekStart, 7)
    ) {
        total_tracked_weeks++;
        let hasRequiredDay = false;
        let allRequiredDaysTrained = true;
        for (let i = 0; i < 7; i++) {
            const day = addDays(weekStart, i);
            if (requiredSet.has(isoWeekdayOf(day))) {
                hasRequiredDay = true;
                if (!workedSet.has(day)) allRequiredDaysTrained = false;
            }
        }
        if (hasRequiredDay && allRequiredDaysTrained) consistent_weeks++;
    }

    return { consistent_weeks, total_tracked_weeks };
}

export const getProgressOverviewService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }

    const { timezone, weight_units } = await getUserHealthPreferencesOrDefault(userId);
    const todayStr = localDateString(new Date(), timezone);
    const currentWeekStartStr = addDays(todayStr, -(isoWeekdayOf(todayStr) - 1));
    const seriesStartStr = addDays(currentWeekStartStr, -7 * (PROGRESS_SERIES_WEEKS - 1));

    const [totalVolume, { total_workouts, avg_duration_seconds }, rawSeries, weeklyConsistency] = await Promise.all([
        fetchTonnageSinceRepository(userId, timezone),
        fetchWorkoutCountAndAvgDurationRepository(userId),
        fetchWeeklyVolumeSeriesRepository(userId, timezone, seriesStartStr),
        computeWeeklyConsistencyHistory(userId, timezone),
    ]);

    const volumeByWeek = new Map(rawSeries.map((w) => [w.week_start, w.volume]));
    const weekStarts = Array.from({ length: PROGRESS_SERIES_WEEKS }, (_, i) =>
        addDays(seriesStartStr, 7 * i),
    );
    const series = weekStarts.map((week_start) => ({
        week_start,
        volume: volumeByWeek.get(week_start) ?? 0,
    }));

    const chartWeeks = series.slice(-PROGRESS_CHART_WEEKS);
    const chartVolumes = chartWeeks.map((w) => w.volume);

    const lastWeek = series[series.length - 1].volume;
    const priorWeek = series[series.length - 2]?.volume ?? 0;

    // "~3 months ago" comparison: last 4 weeks vs. the 4 weeks from 9-12 weeks back.
    const last4 = series.slice(-4).map((w) => w.volume);
    const earlier4 = series.slice(-13, -9).map((w) => w.volume);

    return {
        total_volume: totalVolume,
        total_workouts,
        avg_duration_seconds,
        weight_units,
        weekly_volume_series: chartWeeks,
        week_over_week_change_pct: percentChange(priorWeek, lastWeek),
        best_week_volume: Math.max(...chartVolumes),
        avg_week_volume: mean(chartVolumes),
        growth_rate_pct: percentChange(mean(earlier4), mean(last4)),
        consistent_weeks: weeklyConsistency.consistent_weeks,
        total_tracked_weeks: weeklyConsistency.total_tracked_weeks,
    };
}

export const getDashboardStatsService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    const [consistency, volume] = await Promise.all([
        getWorkoutConsistencyService(userId),
        getWeeklyVolumeService(userId),
    ]);
    return {
        current_streak: consistency.current_streak,
        week: consistency.week,
        weekly_volume: volume.weekly_volume,
        weight_units: volume.weight_units,
    };
}
