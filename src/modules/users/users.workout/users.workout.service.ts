import { AppError } from "../../../shared/errors/AppError.js";
import { isValidUUID } from "../../../utils/validation.js";
import { addOneInTable, fetchManyFromTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { EXERCISES_TABLE, ExercisesInterface } from "../../../db/schemas/exercises/exercises.schema.js";
import { PROGRAM_DAYS_TABLE, ProgramDaysInterface } from "../../../db/schemas/workoutPrograms/programDays.schema.js";
import { PROGRAM_DAY_SESSIONS_TABLE, ProgramDaySessionsInterface } from "../../../db/schemas/workoutPrograms/programDaySessions.schema.js";
import { WORKOUT_PROGRAM_EXERCISES_TABLE, WorkoutProgramExercisesInterface } from "../../../db/schemas/workoutPrograms/workoutProgramExercises.schema.js";
import { USER_PROGRAM_ASSIGNMENTS_TABLE, UserProgramAssignmentsInterface } from "../../../db/schemas/users/workout/userProgramAssignments.schema.js";
import { WORKOUT_SESSIONS_TABLE, WorkoutSessionsInterface } from "../../../db/schemas/users/workout/workoutSessions.schema.js";
import { WORKOUT_SETS_TABLE, WorkoutSetsInterface } from "../../../db/schemas/users/workout/workoutSets.schema.js";
import { WORKOUT_SET_ALARMS_TABLE, WorkoutSetAlarmsInterface } from "../../../db/schemas/users/workout/workoutSetAlarms.schema.js";
import {
    fetchActiveAlarmsRepository,
    fetchExerciseHistoryRepository,
    fetchLatestPublicVersionForProgramRepository,
    fetchPublicWorkoutPlansRepository,
    fetchUserAssignmentsRepository,
    fetchWorkoutSessionsRepository,
    fetchWorkoutSessionDetailRepository,
} from "./users.workout.repository.js";

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

    return await fetchManyFromTable({
        table: PROGRAM_DAYS_TABLE,
        where: [{ field: "workout_program_version_id", operator: "=", value: assignment.workout_program_version_id }],
        sortBy: { day_number: "asc" },
    }) as ProgramDaysInterface[];
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

    return await fetchManyFromTable({
        table: PROGRAM_DAY_SESSIONS_TABLE,
        where: [{ field: "workout_program_day_id", operator: "=", value: day.id }],
    }) as ProgramDaySessionsInterface[];
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

    return { set, dropSets, alarm };
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
