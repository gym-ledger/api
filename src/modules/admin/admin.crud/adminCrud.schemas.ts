import { z } from "zod";
import { pagination, text } from "../../../middleware/validate.js";

const visibility = z.enum(["public", "private"]);

// ---- Muscles ----------------------------------------------------------------

export const listMusclesQuery = z.strictObject({
    ...pagination(100),
    search: text(100).optional(),
    parentsOnly: z.enum(["true", "false"]).optional(),
});

// The muscle picker loads every muscle at once (a few dozen in practice).
export const musclesDropdownQuery = z.strictObject({
    ...pagination(500),
    search: text(100).optional(),
    sendInHierarchy: z.enum(["true", "false"]).optional(),
});

export const exportMusclesQuery = z.strictObject({
    search: text(100).optional(),
});

export const muscleBody = z.strictObject({
    name: text(255),
    parent_muscle_id: z.uuid().nullable(),
    xp_enabled: z.boolean(),
    recovery_enabled: z.boolean(),
    body_region: text(50).nullable(),
    display_order: z.number().int().min(0).max(100_000),
    children_muscles: z.array(z.uuid()).max(100).optional(),
});

// ---- Exercises --------------------------------------------------------------

export const listExercisesQuery = z.strictObject({
    ...pagination(100),
    search: text(100).optional(),
});

/**
 * Multipart form fields of exercise create/update (the image is the file
 * part). `exerciseMuscles` is a JSON array of { muscle_id, contribution },
 * parsed and checked in the service.
 */
export const exerciseFormBody = z.strictObject({
    name: text(255).optional(),
    description: z.string().max(5000).optional(),
    visibility: visibility.optional(),
    exerciseMuscles: z.string().max(20_000).optional(),
    // "true" removes the current image (update only).
    remove_image: z.enum(["true", "false"]).optional(),
});

// ---- Progression rules ------------------------------------------------------

export const listProgressionRulesQuery = z.strictObject(pagination(100));

const progressionRuleFields = {
    name: text(255),
    type: z.enum(["double_progression", "static_load", "rir_based", "rir_cycling", "percentage_based"]),
    // Free-form per type; capped in size.
    config: z.record(z.string().max(100), z.unknown())
        .refine((c) => JSON.stringify(c).length <= 10_000, "config is too large"),
};

export const createProgressionRuleBody = z.strictObject(progressionRuleFields);
export const updateProgressionRuleBody = z.strictObject(progressionRuleFields).partial();

// ---- Workout programs -------------------------------------------------------

export const listWorkoutProgramsQuery = z.strictObject({
    ...pagination(100),
    search: text(100).optional(),
});

export const viewWorkoutProgramQuery = z.strictObject({
    versionId: z.uuid().optional(),
});

// The program builder's nested draft; `tempId` matches rows of the previous
// save, `exercise_name` is display-only. Required-ness and ranges are
// checked in the service (validateProgramDaysInput).
const programExercise = z.strictObject({
    tempId: text(64).optional(),
    exercise_id: z.string().max(64),
    exercise_name: text(255).optional(),
    exercise_order: z.number().int().min(0).max(1000),
    target_sets: z.number().int().min(0).max(100),
    min_reps: z.number().int().min(0).max(10_000),
    max_reps: z.number().int().min(0).max(10_000),
    target_rir: z.number().min(0).max(99).nullish(),
    rest_seconds: z.number().int().min(0).max(86_400).nullish(),
    tempo: text(50).nullish(),
    notes: z.string().max(2000).nullish(),
    visibility: visibility.optional(),
});

const programSession = z.strictObject({
    tempId: text(64).optional(),
    name: text(255),
    exercises: z.array(programExercise).max(100).optional(),
    visibility: visibility.optional(),
});

const programDay = z.strictObject({
    day_number: z.number().int().min(1).max(7),
    name: text(255),
    sessions: z.array(programSession).max(20).optional(),
    visibility: visibility.optional(),
});

const programFields = {
    name: text(255),
    description: z.string().max(5000).optional(),
    visibility: visibility.optional(),
    split_type: z.enum(["ppl", "upper-lower", "full-body", "custom"]).optional(),
    session_ordering_logic: z.enum(["sequential", "cyclic", "random"]).optional(),
    duration_type: z.enum(["indefinite", "finite"]).optional(),
    duration_weeks: z.number().int().min(0).max(520).nullish(),
    version_visibility: visibility.optional(),
    program_days: z.array(programDay).max(7).optional(),
};

export const workoutProgramBody = z.strictObject(programFields);
// The builder sends the program's name with a new version too; it is ignored there.
export const workoutProgramVersionBody = z.strictObject(programFields);
