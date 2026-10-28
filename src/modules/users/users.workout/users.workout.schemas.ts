import { z } from "zod";
import { pagination, queryInt } from "../../../middleware/validate.js";

/** Most sets one offline-sync batch may carry (S-14); the web app sends larger queues in chunks. */
export const MAX_BATCH_SETS = 100;

// Column limits: weight / tool_weight DECIMAL(6,2), rir DECIMAL(3,1). Reps
// are capped well above anything real. Required-ness and the drop-set count
// stay in the service.
const setFields = {
    weight: z.number().min(0).max(9999).nullish(),
    tool_weight: z.number().min(0).max(9999).nullish(),
    reps: z.number().int().max(10_000).nullish(),
    rir: z.number().min(0).max(99).nullish(),
    effort: z.string().max(1000).nullish(),
    discomfort_notes: z.string().max(1000).nullish(),
};

const dropSet = z.strictObject(setFields);

// 0 = felt nothing, 1–5 = how well it contracted. Main sets only: one score
// covers a set and its drops. Ignored on warmups (the service stores null).
const contraction = z.number().int().min(0).max(5).nullish();

const newSetFields = {
    ...setFields,
    workout_session_id: z.uuid(),
    workout_program_exercise_id: z.uuid(),
    is_warmup: z.boolean().nullish(),
    contraction,
    alarm_message: z.string().max(500).nullish(),
    drop_sets: z.array(dropSet).max(20).nullish(),
};

export const createSetBody = z.strictObject(newSetFields);

/** One item of POST /sets/batch, checked per item in the service so one bad set doesn't fail the rest. */
export const batchSetItem = z.strictObject({
    ...newSetFields,
    client_id: z.string().min(1).max(100),
});

export const createSetsBatchBody = z.strictObject({
    sets: z.array(z.unknown()).min(1).max(MAX_BATCH_SETS),
});

export const updateSetBody = z.strictObject({
    ...setFields,
    is_warmup: z.boolean().nullish(),
    contraction,
});

export const selectPlanBody = z.strictObject({
    workout_program_id: z.uuid(),
});

// Ranges are checked in the service (parsePlanExerciseTargets).
const planTargets = {
    target_sets: z.number().nullish(),
    min_reps: z.number().nullish(),
    max_reps: z.number().nullish(),
    target_rir: z.number().nullish(),
    rest_seconds: z.number().nullish(),
    notes: z.string().max(500).nullish(),
};

export const addPlanExerciseBody = z.strictObject({
    ...planTargets,
    exercise_id: z.uuid(),
});

export const updatePlanExerciseBody = z.strictObject(planTargets);

export const reorderPlanExercisesBody = z.strictObject({
    exercise_ids: z.array(z.uuid()).min(1).max(200),
});

export const startSessionBody = z.strictObject({
    assignment_id: z.uuid(),
    program_day_id: z.uuid(),
    program_day_session_id: z.uuid(),
    // A client-made id and start time for a workout begun offline.
    id: z.uuid().optional(),
    started_at: z.string().max(40).optional(),
});

export const addSessionExerciseBody = z.strictObject({
    exercise_id: z.uuid(),
    scope: z.enum(["session", "plan"]).optional(),
    program_day_session_id: z.uuid().optional(),
});

export const exerciseHistoryQuery = z.strictObject({
    limit: queryInt(1, 200).optional(),
    beforeSessionId: z.uuid().optional(),
});

export const listSessionsQuery = z.strictObject(pagination(100));

export const recentPrsQuery = z.strictObject({
    limit: queryInt(1, 300).optional(),
});
