import { AppError } from "../../../../shared/errors/AppError.js";
import { addOneInTable, deleteManyInTable, deleteOneFromTable, fetchManyFromTable, fetchOneFromTable, fetchPaginatedResultsFromTable, updateOneInTable } from "../../../index/index.repository.js";
import { WORKOUT_PROGRAM_VERSIONS_TABLE, WORKOUT_PROGRAMS_TABLE, WorkoutProgramsInterface, WorkoutProgramVersionsInterface } from "../../../../db/schemas/workoutPrograms/workoutPrograms.schema.js";
import { fetchWorkoutProgramWithVersionsService } from "../adminCrud.repository.js";
import { isValidUUID } from "../../../../utils/validation.js";
import { PROGRAM_DAYS_TABLE, ProgramDaysInterface } from "../../../../db/schemas/workoutPrograms/programDays.schema.js";
import { PROGRAM_DAY_SESSIONS_TABLE, ProgramDaySessionsInterface } from "../../../../db/schemas/workoutPrograms/programDaySessions.schema.js";
import { WORKOUT_PROGRAM_EXERCISES_TABLE, WorkoutProgramExercisesInterface } from "../../../../db/schemas/workoutPrograms/workoutProgramExercises.schema.js";
import { fetchWorkoutProgramVersionUsageCountsRepository } from "./adminCrudWorkoutPrograms.repository.js";
import slugify from "slugify";


export const listWorkoutProgramsForAdminService = async (data: { page?: number, limit?: number, search?: string, createdBy?: string }) => {
    const { page = 1, limit = 10, search = "", createdBy = "admin_user" } = data;
    const workoutPrograms = await fetchPaginatedResultsFromTable({
        table: WORKOUT_PROGRAMS_TABLE,
        where: [
            {
                field: "name",
                operator: "ILIKE",
                value: `%${search}%`,
            },
        ],
        limit,
        page,
    }) as {
        data: WorkoutProgramsInterface[];
        meta: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
        };
    };
    return workoutPrograms;
}

export const viewWorkoutProgramForAdminService = async (data: { id: string, versionId?: string }) => {
    const { id, versionId } = data;

    if (!id) {
        throw new AppError("Workout program id is required", 400);
    }
    // handle non uuid id
    if (!isValidUUID(id)) {
        throw new AppError("Invalid workout program id", 400);
    }
    if (versionId && !isValidUUID(versionId)) {
        throw new AppError("Invalid version id", 400);
    }

    const workoutProgram = await fetchWorkoutProgramWithVersionsService(id, versionId);
    if (!workoutProgram) {
        throw new AppError("Workout program not found", 404);
    }

    return workoutProgram;
}

export const listWorkoutProgramVersionsForAdminService = async (data: { id: string }) => {
    const { id } = data;
    if (!id) {
        throw new AppError("Workout program id is required", 400);
    }
    if (!isValidUUID(id)) {
        throw new AppError("Invalid workout program id", 400);
    }

    const program = await fetchOneFromTable({
        table: WORKOUT_PROGRAMS_TABLE,
        where: [{ field: "id", operator: "=", value: id }],
    }) as WorkoutProgramsInterface | null;
    if (!program) {
        throw new AppError("Workout program not found", 404);
    }

    const versions = await fetchManyFromTable({
        table: WORKOUT_PROGRAM_VERSIONS_TABLE,
        where: [{ field: "workout_program_id", operator: "=", value: id }],
        sortBy: { version_number: "desc" },
    }) as WorkoutProgramVersionsInterface[];

    const usageCounts = await fetchWorkoutProgramVersionUsageCountsRepository(
        versions.map((v) => v.id),
    );

    return versions.map((version) => ({
        ...version,
        usage_count: usageCounts.get(version.id) ?? 0,
    }));
}

// The create/update payload from the admin panel's program builder is not a
// DB row — it's a nested draft (with client-only fields like `tempId` and
// `exercise_name`) that gets exploded into program_days / program_day_sessions
// / workout_program_exercises rows below. `ProgramDaysInterface` et al. are
// for actual DB rows, so we type the incoming payload separately here.
interface ProgramExerciseInput {
    tempId?: string;
    exercise_id: string;
    exercise_name?: string;
    exercise_order: number;
    target_sets: number;
    min_reps: number;
    max_reps: number;
    target_rir?: number | null;
    rest_seconds?: number | null;
    tempo?: string | null;
    notes?: string | null;
    visibility?: string;
}

interface ProgramSessionInput {
    tempId?: string;
    name: string;
    exercises?: ProgramExerciseInput[];
    visibility?: string;
}

interface ProgramDayInput {
    day_number: number;
    name: string;
    sessions?: ProgramSessionInput[];
    visibility?: string;
}

function validateProgramDaysInput(program_days: ProgramDayInput[]) {
    for (const programDay of program_days) {
        if (!programDay.name) {
            throw new AppError("Program day name is required", 400);
        }
        if (!programDay.day_number) {
            throw new AppError("Program day number is required", 400);
        }
        if (!programDay.sessions || programDay.sessions.length === 0) {
            throw new AppError("Program day sessions are required", 400);
        }
        for (const session of programDay.sessions) {
            if (!session.name) {
                if (programDay.sessions.length > 1) {
                    throw new AppError("Session name is required", 400);
                } else {
                    session.name = "Default";
                }
            }
            for (const exercise of session.exercises ?? []) {
                if (!exercise.exercise_id) {
                    throw new AppError("Exercise id is required", 400);
                }
                if (!isValidUUID(exercise.exercise_id)) {
                    throw new AppError("Invalid exercise id", 400);
                }
                if (!exercise.exercise_order) {
                    throw new AppError("Exercise order is required", 400);
                }
                if (!exercise.target_sets) {
                    throw new AppError("Target sets is required", 400);
                }
                if (!exercise.min_reps) {
                    throw new AppError("Min reps is required", 400);
                }
                if (!exercise.max_reps) {
                    throw new AppError("Max reps is required", 400);
                }
            }
        }
    }
}

function computeTrainingDays(program_days: ProgramDayInput[]) {
    let training_days = 0;
    for (const programDay of program_days) {
        for (const session of programDay.sessions ?? []) {
            if ((session.exercises ?? []).length > 0) {
                training_days++;
            }
        }
    }
    return training_days;
}

/** Always inserts fresh rows — used by create and by "save as new version". */
async function insertProgramDaysTree(params: {
    workoutProgramId: string,
    workoutProgramVersionId: string,
    program_days: ProgramDayInput[],
    added_by_admin_user_id: string,
    fallbackVisibility: string,
}) {
    const { workoutProgramId, workoutProgramVersionId, program_days, added_by_admin_user_id, fallbackVisibility } = params;
    const responseDays: Record<string, unknown>[] = [];

    for (const programDayData of program_days) {
        const programDay = await addOneInTable({
            table: PROGRAM_DAYS_TABLE,
            data: {
                workout_program_id: workoutProgramId,
                workout_program_version_id: workoutProgramVersionId,
                day_number: programDayData.day_number,
                name: programDayData.name,
                added_by_admin_user_id,
                visibility: programDayData.visibility ?? fallbackVisibility,
            },
        }) as ProgramDaysInterface;

        const responseSessions: Record<string, unknown>[] = [];
        for (const sessionData of programDayData.sessions ?? []) {
            const session = await addOneInTable({
                table: PROGRAM_DAY_SESSIONS_TABLE,
                data: {
                    workout_program_day_id: programDay.id,
                    workout_program_version_id: workoutProgramVersionId,
                    name: sessionData.name,
                    added_by_admin_user_id,
                    visibility: sessionData.visibility ?? fallbackVisibility,
                },
            }) as ProgramDaySessionsInterface;

            const responseExercises: Record<string, unknown>[] = [];
            for (const exerciseData of sessionData.exercises ?? []) {
                const exercise = await addOneInTable({
                    table: WORKOUT_PROGRAM_EXERCISES_TABLE,
                    data: {
                        workout_program_day_session_id: session.id,
                        workout_program_version_id: workoutProgramVersionId,
                        exercise_id: exerciseData.exercise_id,
                        exercise_order: exerciseData.exercise_order,
                        target_sets: exerciseData.target_sets,
                        min_reps: exerciseData.min_reps,
                        max_reps: exerciseData.max_reps,
                        target_rir: exerciseData.target_rir ?? null,
                        rest_seconds: exerciseData.rest_seconds ?? null,
                        tempo: exerciseData.tempo || null,
                        notes: exerciseData.notes || null,
                        added_by_admin_user_id,
                        visibility: exerciseData.visibility ?? fallbackVisibility,
                    },
                }) as WorkoutProgramExercisesInterface;
                responseExercises.push({ ...exercise, exercise_name: exerciseData.exercise_name });
            }

            responseSessions.push({ ...session, exercises: responseExercises });
        }

        responseDays.push({ ...programDay, sessions: responseSessions });
    }

    return responseDays;
}

/**
 * Updates a version's day/session/exercise tree in place: rows carried over
 * from the previous save keep their id (matched via `tempId`, which the
 * admin panel sets to the real DB id when loading an existing row — see
 * `mapProgramToBuilderState` — and to a fresh uuid for anything newly added
 * this edit), new rows are inserted, and anything no longer present is
 * soft-deleted. Preserving ids matters because `workout_sets` references
 * `workout_program_exercises.id` directly — wiping and recreating everything
 * on every edit would orphan users' logged history.
 */
async function syncProgramDaysTree(params: {
    workoutProgramId: string,
    workoutProgramVersionId: string,
    program_days: ProgramDayInput[],
    added_by_admin_user_id: string,
    fallbackVisibility: string,
}) {
    const { workoutProgramId, workoutProgramVersionId, program_days, added_by_admin_user_id, fallbackVisibility } = params;

    const existingDays = await fetchManyFromTable({
        table: PROGRAM_DAYS_TABLE,
        where: [{ field: "workout_program_version_id", operator: "=", value: workoutProgramVersionId }],
    }) as ProgramDaysInterface[];
    const existingDaysByNumber = new Map(existingDays.map((d) => [d.day_number, d]));
    const seenDayIds = new Set<string>();
    const responseDays: Record<string, unknown>[] = [];

    for (const programDayData of program_days) {
        const existingDay = existingDaysByNumber.get(programDayData.day_number);
        const programDay = existingDay
            ? await updateOneInTable({
                table: PROGRAM_DAYS_TABLE,
                data: { name: programDayData.name, visibility: programDayData.visibility ?? fallbackVisibility },
                where: [{ field: "id", operator: "=", value: existingDay.id }],
            }) as ProgramDaysInterface
            : await addOneInTable({
                table: PROGRAM_DAYS_TABLE,
                data: {
                    workout_program_id: workoutProgramId,
                    workout_program_version_id: workoutProgramVersionId,
                    day_number: programDayData.day_number,
                    name: programDayData.name,
                    added_by_admin_user_id,
                    visibility: programDayData.visibility ?? fallbackVisibility,
                },
            }) as ProgramDaysInterface;
        seenDayIds.add(programDay.id);

        const existingSessions = await fetchManyFromTable({
            table: PROGRAM_DAY_SESSIONS_TABLE,
            where: [{ field: "workout_program_day_id", operator: "=", value: programDay.id }],
        }) as ProgramDaySessionsInterface[];
        const existingSessionsById = new Map(existingSessions.map((s) => [s.id, s]));
        const seenSessionIds = new Set<string>();
        const responseSessions: Record<string, unknown>[] = [];

        for (const sessionData of programDayData.sessions ?? []) {
            const existingSession = sessionData.tempId ? existingSessionsById.get(sessionData.tempId) : undefined;
            const session = existingSession
                ? await updateOneInTable({
                    table: PROGRAM_DAY_SESSIONS_TABLE,
                    data: { name: sessionData.name, visibility: sessionData.visibility ?? fallbackVisibility },
                    where: [{ field: "id", operator: "=", value: existingSession.id }],
                }) as ProgramDaySessionsInterface
                : await addOneInTable({
                    table: PROGRAM_DAY_SESSIONS_TABLE,
                    data: {
                        workout_program_day_id: programDay.id,
                        workout_program_version_id: workoutProgramVersionId,
                        name: sessionData.name,
                        added_by_admin_user_id,
                        visibility: sessionData.visibility ?? fallbackVisibility,
                    },
                }) as ProgramDaySessionsInterface;
            seenSessionIds.add(session.id);

            const existingExercises = await fetchManyFromTable({
                table: WORKOUT_PROGRAM_EXERCISES_TABLE,
                where: [{ field: "workout_program_day_session_id", operator: "=", value: session.id }],
            }) as WorkoutProgramExercisesInterface[];
            const existingExercisesById = new Map(existingExercises.map((e) => [e.id, e]));
            const seenExerciseIds = new Set<string>();
            const responseExercises: Record<string, unknown>[] = [];

            for (const exerciseData of sessionData.exercises ?? []) {
                const existingExercise = exerciseData.tempId ? existingExercisesById.get(exerciseData.tempId) : undefined;
                const exercisePayload = {
                    exercise_id: exerciseData.exercise_id,
                    exercise_order: exerciseData.exercise_order,
                    target_sets: exerciseData.target_sets,
                    min_reps: exerciseData.min_reps,
                    max_reps: exerciseData.max_reps,
                    target_rir: exerciseData.target_rir ?? null,
                    rest_seconds: exerciseData.rest_seconds ?? null,
                    tempo: exerciseData.tempo || null,
                    notes: exerciseData.notes || null,
                    visibility: exerciseData.visibility ?? fallbackVisibility,
                };
                const exercise = existingExercise
                    ? await updateOneInTable({
                        table: WORKOUT_PROGRAM_EXERCISES_TABLE,
                        data: exercisePayload,
                        where: [{ field: "id", operator: "=", value: existingExercise.id }],
                    }) as WorkoutProgramExercisesInterface
                    : await addOneInTable({
                        table: WORKOUT_PROGRAM_EXERCISES_TABLE,
                        data: {
                            workout_program_day_session_id: session.id,
                            workout_program_version_id: workoutProgramVersionId,
                            added_by_admin_user_id,
                            ...exercisePayload,
                        },
                    }) as WorkoutProgramExercisesInterface;
                seenExerciseIds.add(exercise.id);
                responseExercises.push({ ...exercise, exercise_name: exerciseData.exercise_name });
            }

            const exercisesToRemove = existingExercises.filter((e) => !seenExerciseIds.has(e.id));
            if (exercisesToRemove.length > 0) {
                await deleteManyInTable({
                    table: WORKOUT_PROGRAM_EXERCISES_TABLE,
                    where: [{ field: "id", operator: "IN", value: exercisesToRemove.map((e) => e.id) }],
                });
            }

            responseSessions.push({ ...session, exercises: responseExercises });
        }

        const sessionsToRemove = existingSessions.filter((s) => !seenSessionIds.has(s.id));
        if (sessionsToRemove.length > 0) {
            const sessionIds = sessionsToRemove.map((s) => s.id);
            await deleteManyInTable({
                table: WORKOUT_PROGRAM_EXERCISES_TABLE,
                where: [{ field: "workout_program_day_session_id", operator: "IN", value: sessionIds }],
            });
            await deleteManyInTable({
                table: PROGRAM_DAY_SESSIONS_TABLE,
                where: [{ field: "id", operator: "IN", value: sessionIds }],
            });
        }

        responseDays.push({ ...programDay, sessions: responseSessions });
    }

    const daysToRemove = existingDays.filter((d) => !seenDayIds.has(d.id));
    if (daysToRemove.length > 0) {
        const dayIds = daysToRemove.map((d) => d.id);
        const sessionsUnderRemovedDays = await fetchManyFromTable({
            table: PROGRAM_DAY_SESSIONS_TABLE,
            where: [{ field: "workout_program_day_id", operator: "IN", value: dayIds }],
        }) as ProgramDaySessionsInterface[];
        if (sessionsUnderRemovedDays.length > 0) {
            const sessionIds = sessionsUnderRemovedDays.map((s) => s.id);
            await deleteManyInTable({
                table: WORKOUT_PROGRAM_EXERCISES_TABLE,
                where: [{ field: "workout_program_day_session_id", operator: "IN", value: sessionIds }],
            });
            await deleteManyInTable({
                table: PROGRAM_DAY_SESSIONS_TABLE,
                where: [{ field: "id", operator: "IN", value: sessionIds }],
            });
        }
        await deleteManyInTable({
            table: PROGRAM_DAYS_TABLE,
            where: [{ field: "id", operator: "IN", value: dayIds }],
        });
    }

    return responseDays;
}

export const createWorkoutProgramForAdminService = async (data: {
    name: string,
    description: string,
    image: string,
    video: string,
    program_days?: ProgramDayInput[],
    split_type: string,
    session_ordering_logic: string,
    duration_type: string,
    duration_weeks: number,
    visibility: string,
    version_visibility?: string,
    added_by_admin_user_id: string,
}) => {

    const {
        name,
        description,
        split_type,
        session_ordering_logic,
        duration_type,
        duration_weeks,
        visibility,
        version_visibility,
        program_days = [],
        added_by_admin_user_id,
    } = data;

    if (!name) {
        throw new AppError("Name is required", 400);
    }
    validateProgramDaysInput(program_days);

    const slug = slugify(name, { lower: true, strict: true });
    const workoutPayload = {
        name: name,
        slug: slug,
        visibility: visibility,
        added_by_admin_user_id: added_by_admin_user_id,
    }
    const training_days = computeTrainingDays(program_days);
    const versionPayload = {
        description: description,
        training_days: training_days,
        split_type: split_type,
        session_ordering_logic: session_ordering_logic,
        duration_type: duration_type,
        duration_weeks: duration_weeks,
        visibility: version_visibility ?? visibility,
        added_by_admin_user_id: added_by_admin_user_id,
        version_number: 1,
        workout_program_id: '',
    }
    const duplciateSlug = await fetchOneFromTable({
        table: WORKOUT_PROGRAMS_TABLE,
        where: [
            {
                field: "slug",
                operator: "=",
                value: slug,
            },
        ],
    }) as WorkoutProgramsInterface;
    if (duplciateSlug) {
        throw new AppError("Workout program with this slug already exists", 400);
    }

    const workoutProgram = await addOneInTable({
        table: WORKOUT_PROGRAMS_TABLE,
        data: workoutPayload,
    }) as WorkoutProgramsInterface;

    try {
        versionPayload.workout_program_id = workoutProgram.id;
        const workoutProgramVersion = await addOneInTable({
            table: WORKOUT_PROGRAM_VERSIONS_TABLE,
            data: versionPayload
        }) as WorkoutProgramVersionsInterface;

        const responseDays = await insertProgramDaysTree({
            workoutProgramId: workoutProgram.id,
            workoutProgramVersionId: workoutProgramVersion.id,
            program_days,
            added_by_admin_user_id,
            fallbackVisibility: visibility,
        });

        return {
            ...workoutProgram,
            description: workoutProgramVersion.description,
            split_type: workoutProgramVersion.split_type,
            session_ordering_logic: workoutProgramVersion.session_ordering_logic,
            duration_type: workoutProgramVersion.duration_type,
            duration_weeks: workoutProgramVersion.duration_weeks,
            version_visibility: workoutProgramVersion.visibility,
            program_days: responseDays,
        };
    } catch (error) {
        console.log(error);
        await deleteOneFromTable({
            table: WORKOUT_PROGRAMS_TABLE,
            where: [
                {
                    field: "id",
                    operator: "=",
                    value: workoutProgram.id,
                },
            ],
        }) as WorkoutProgramsInterface;
        throw new AppError("Failed to create workout program", 500);
    }
}

export const updateWorkoutProgramForAdminService = async (data: {
    id: string,
    name: string,
    description: string,
    program_days?: ProgramDayInput[],
    split_type: string,
    session_ordering_logic: string,
    duration_type: string,
    duration_weeks: number,
    visibility: string,
    version_visibility?: string,
    added_by_admin_user_id: string,
}) => {
    const {
        id,
        name,
        description,
        split_type,
        session_ordering_logic,
        duration_type,
        duration_weeks,
        visibility,
        version_visibility,
        program_days = [],
        added_by_admin_user_id,
    } = data;

    if (!id) {
        throw new AppError("Workout program id is required", 400);
    }
    if (!isValidUUID(id)) {
        throw new AppError("Invalid workout program id", 400);
    }

    const existingProgram = await fetchOneFromTable({
        table: WORKOUT_PROGRAMS_TABLE,
        where: [{ field: "id", operator: "=", value: id }],
    }) as WorkoutProgramsInterface | null;
    if (!existingProgram) {
        throw new AppError("Workout program not found", 404);
    }

    if (!name) {
        throw new AppError("Name is required", 400);
    }
    validateProgramDaysInput(program_days);

    let slug = existingProgram.slug;
    if (name !== existingProgram.name) {
        slug = slugify(name, { lower: true, strict: true });
        const duplicateSlug = await fetchOneFromTable({
            table: WORKOUT_PROGRAMS_TABLE,
            where: [
                { field: "slug", operator: "=", value: slug },
                { field: "id", operator: "!=", value: id },
            ],
        }) as WorkoutProgramsInterface | null;
        if (duplicateSlug) {
            throw new AppError("Workout program with this slug already exists", 400);
        }
    }

    const latestVersion = await fetchOneFromTable({
        table: WORKOUT_PROGRAM_VERSIONS_TABLE,
        where: [{ field: "workout_program_id", operator: "=", value: id }],
        sortBy: { version_number: "desc" },
    }) as WorkoutProgramVersionsInterface | null;
    if (!latestVersion) {
        throw new AppError("Workout program has no versions to update", 400);
    }

    const updatedProgram = await updateOneInTable({
        table: WORKOUT_PROGRAMS_TABLE,
        data: { name, slug, visibility },
        where: [{ field: "id", operator: "=", value: id }],
    }) as WorkoutProgramsInterface;

    const training_days = computeTrainingDays(program_days);
    const updatedVersion = await updateOneInTable({
        table: WORKOUT_PROGRAM_VERSIONS_TABLE,
        data: {
            description,
            training_days,
            split_type,
            session_ordering_logic,
            duration_type,
            duration_weeks,
            visibility: version_visibility ?? latestVersion.visibility,
        },
        where: [{ field: "id", operator: "=", value: latestVersion.id }],
    }) as WorkoutProgramVersionsInterface;

    const responseDays = await syncProgramDaysTree({
        workoutProgramId: id,
        workoutProgramVersionId: updatedVersion.id,
        program_days,
        added_by_admin_user_id,
        fallbackVisibility: visibility,
    });

    return {
        ...updatedProgram,
        description: updatedVersion.description,
        split_type: updatedVersion.split_type,
        session_ordering_logic: updatedVersion.session_ordering_logic,
        duration_type: updatedVersion.duration_type,
        duration_weeks: updatedVersion.duration_weeks,
        version_visibility: updatedVersion.visibility,
        program_days: responseDays,
    };
}

/**
 * Saves the given draft as a brand-new version of an existing program,
 * leaving all previous versions (and the `workout_sets` history logged
 * against them) untouched.
 */
export const createWorkoutProgramVersionForAdminService = async (data: {
    id: string,
    description: string,
    program_days?: ProgramDayInput[],
    split_type: string,
    session_ordering_logic: string,
    duration_type: string,
    duration_weeks: number,
    visibility: string,
    version_visibility?: string,
    added_by_admin_user_id: string,
}) => {
    const {
        id,
        description,
        split_type,
        session_ordering_logic,
        duration_type,
        duration_weeks,
        visibility,
        version_visibility,
        program_days = [],
        added_by_admin_user_id,
    } = data;

    if (!id) {
        throw new AppError("Workout program id is required", 400);
    }
    if (!isValidUUID(id)) {
        throw new AppError("Invalid workout program id", 400);
    }

    const existingProgram = await fetchOneFromTable({
        table: WORKOUT_PROGRAMS_TABLE,
        where: [{ field: "id", operator: "=", value: id }],
    }) as WorkoutProgramsInterface | null;
    if (!existingProgram) {
        throw new AppError("Workout program not found", 404);
    }
    validateProgramDaysInput(program_days);

    const latestVersion = await fetchOneFromTable({
        table: WORKOUT_PROGRAM_VERSIONS_TABLE,
        where: [{ field: "workout_program_id", operator: "=", value: id }],
        sortBy: { version_number: "desc" },
    }) as WorkoutProgramVersionsInterface | null;
    const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

    const training_days = computeTrainingDays(program_days);
    const newVersion = await addOneInTable({
        table: WORKOUT_PROGRAM_VERSIONS_TABLE,
        data: {
            workout_program_id: id,
            description,
            training_days,
            split_type,
            session_ordering_logic,
            duration_type,
            duration_weeks,
            visibility: version_visibility ?? visibility,
            added_by_admin_user_id,
            version_number: nextVersionNumber,
        },
    }) as WorkoutProgramVersionsInterface;

    try {
        const responseDays = await insertProgramDaysTree({
            workoutProgramId: id,
            workoutProgramVersionId: newVersion.id,
            program_days,
            added_by_admin_user_id,
            fallbackVisibility: visibility,
        });

        return {
            ...existingProgram,
            description: newVersion.description,
            split_type: newVersion.split_type,
            session_ordering_logic: newVersion.session_ordering_logic,
            duration_type: newVersion.duration_type,
            duration_weeks: newVersion.duration_weeks,
            version_visibility: newVersion.visibility,
            program_days: responseDays,
        };
    } catch (error) {
        console.log(error);
        await deleteOneFromTable({
            table: WORKOUT_PROGRAM_VERSIONS_TABLE,
            where: [{ field: "id", operator: "=", value: newVersion.id }],
        });
        throw new AppError("Failed to save new version", 500);
    }
}

export const deleteWorkoutProgramForAdminService = async (data: { id: string }) => {
}
