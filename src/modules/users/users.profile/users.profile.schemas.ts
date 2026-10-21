import { z } from "zod";
import { EQUIPMENT_OPTIONS, EXPERIENCE_LEVELS, TRAINING_GOALS } from "../../../db/schemas/users/userHealthPreferences.schema.js";
import { WEIGHT_GOAL_END_STATUSES } from "../../../utils/users/users.weightGoal.utils.js";
import { PASSWORD_MAX_LENGTH } from "../../../utils/authentication.js";
import { dateString, text } from "../../../middleware/validate.js";

// The settings page sends back every field it was given, so a training answer
// the user never gave arrives as null: that means "leave it as it is".
const unchangedIfNull = <T extends z.ZodType>(schema: T) =>
    schema.nullish().transform((v) => v ?? undefined);

const preferenceFields = {
    timezone: text(100).min(1),
    weight_units: z.enum(["kg", "lbs"]),
    height_units: z.enum(["cm", "ft"]),
    height: z.number().positive().max(999),
    training_goal: unchangedIfNull(z.enum(TRAINING_GOALS)),
    experience_level: unchangedIfNull(z.enum(EXPERIENCE_LEVELS)),
    training_days_per_week: unchangedIfNull(z.number().int().min(1).max(7)),
    equipment: unchangedIfNull(z.enum(EQUIPMENT_OPTIONS)),
};

export const updatePreferencesBody = z.strictObject(preferenceFields).partial();

export const onboardingBody = z.strictObject({
    ...preferenceFields,
    training_goal: z.enum(TRAINING_GOALS),
    experience_level: z.enum(EXPERIENCE_LEVELS),
    training_days_per_week: z.number().int().min(1).max(7),
    equipment: z.enum(EQUIPMENT_OPTIONS),
});

export const updateNameBody = z.strictObject({
    firstName: z.string().max(200),
    lastName: z.string().max(200).nullish(),
});

export const changePasswordBody = z.strictObject({
    currentPassword: z.string().max(PASSWORD_MAX_LENGTH).optional(),
    newPassword: z.string().max(PASSWORD_MAX_LENGTH),
});

export const acceptPrivacyPolicyBody = z.strictObject({
    version: text(20),
});

export const setAiCheckinsBody = z.strictObject({
    enabled: z.boolean(),
    consent: z.boolean().optional(),
});

// Pace, target and dates are checked against each other in the service.
const paceFields = {
    preset: text(30).optional(),
    custom_pace_unit: z.enum(["pct", "weight"]).optional(),
};

export const goalSuggestionQuery = z.strictObject({
    ...paceFields,
    custom_pace: text(20).optional(),
    target_weight: text(20),
    start_date: dateString.optional(),
});

export const saveGoalBody = z.strictObject({
    ...paceFields,
    goal: z.enum(["lose", "maintain", "gain"]),
    custom_pace: z.number().finite().optional(),
    target_weight: z.number().finite().optional(),
    // "" = not given, like null.
    start_date: dateString.or(z.literal("")).nullish(),
    goal_date: dateString.or(z.literal("")).nullish(),
});

export const endGoalBody = z.strictObject({
    status: z.enum(WEIGHT_GOAL_END_STATUSES),
    reason: text(50).nullish(),
    note: z.string().max(500).nullish(),
});
