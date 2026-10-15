import { logger } from "../../../config/logger.js";
import { addOneInTable, fetchManyFromTable, fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { EXERCISE_MUSCLES_TABLE, ExerciseMusclesInterface } from "../../../db/schemas/muscles/exerciseMuscles.schema.js";
import { WORKOUT_PROGRAM_EXERCISES_TABLE, WorkoutProgramExercisesInterface } from "../../../db/schemas/workoutPrograms/workoutProgramExercises.schema.js";
import { USER_MUSCLE_SIGNALS_TABLE, UserMuscleSignalsInterface } from "../../../db/schemas/users/muscles/userMuscleSignals.schema.js";
import { fetchMuscleSignalsForUserRepository } from "./users.muscleSignals.repository.js";

// See algorithms/muscle-training-fatigue-signal.md for the full derivation —
// this file is the reference implementation of that document. Keep them in
// sync; a change to any constant or formula here belongs in that doc too.
export const MUSCLE_SIGNAL_CONFIG = {
    effectiveRirThreshold: 5,
    missingRirEffectiveness: 0.6,
    warmupMultiplier: 0.15,
    fatigueHalfLifeHours: 48,
    trainingHalfLifeHours: 168,
    fatigueReferenceStimulus: 5.0,
    trainingReferenceStimulus: 10.0,
    // Ceiling on the stored training accumulator. Without it a long block of
    // hard training piles up raw value far above the 100% reference (invisible,
    // since the gauge clamps), which then takes weeks of extra decay to bleed
    // off — keeping untrained muscles visibly "trained" for 5-6 weeks.
    trainingMaxStimulus: 15.0,
    // Exponential decay never reaches 0; below this the training gauge reads 0
    // so a muscle untrained for ~4 weeks drops off the heatmap entirely.
    trainingDisplayFloorPercent: 10,
} as const;

export function setEffectiveness(rir: number | null | undefined): number {
    if (rir == null) return MUSCLE_SIGNAL_CONFIG.missingRirEffectiveness;
    return Math.max(0, Math.min(1, 1 - rir / MUSCLE_SIGNAL_CONFIG.effectiveRirThreshold));
}

/** value decayed forward by `elapsedHours` at the given half-life. Never mutates. */
export function decay(value: number, elapsedHours: number, halfLifeHours: number): number {
    if (elapsedHours <= 0) return value;
    return value * Math.pow(0.5, elapsedHours / halfLifeHours);
}

export function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

export function capTraining(value: number): number {
    return Math.min(value, MUSCLE_SIGNAL_CONFIG.trainingMaxStimulus);
}

export function applyTrainingFloor(percent: number): number {
    return percent < MUSCLE_SIGNAL_CONFIG.trainingDisplayFloorPercent ? 0 : percent;
}

interface StimulusInput {
    rir: number | null;
    is_warmup: boolean;
}

/** Muscle-agnostic "effective set" units for a batch of sets (a main set + its drop sets). */
export function computeSetUnits(sets: StimulusInput[]): number {
    return sets.reduce((sum, s) => {
        const warm = s.is_warmup ? MUSCLE_SIGNAL_CONFIG.warmupMultiplier : 1;
        return sum + setEffectiveness(s.rir) * warm;
    }, 0);
}

/**
 * Applies the stimulus from a just-logged main set (+ its drop sets, if any)
 * to every muscle the exercise is linked to. Called synchronously after a
 * workout set is persisted — deliberately fails silently (logs and returns)
 * since muscle signals are a derived cache, not the source of truth, and
 * must never block or fail the actual workout-logging write they're hooked
 * off. `workout_sets` remains authoritative; signals can be recomputed from
 * it at any time via `recomputeMuscleSignalsForUser`.
 */
export const recordMuscleStimulusForLoggedSets = async (params: {
    userId: string,
    workoutProgramExerciseId: string,
    sets: StimulusInput[],
    at?: Date,
}): Promise<void> => {
    try {
        const { userId, workoutProgramExerciseId, sets } = params;
        const now = params.at ?? new Date();

        const setUnits = computeSetUnits(sets);
        if (setUnits <= 0) return;

        const programExercise = await fetchOneFromTable({
            table: WORKOUT_PROGRAM_EXERCISES_TABLE,
            where: [{ field: "id", operator: "=", value: workoutProgramExerciseId }],
        }) as WorkoutProgramExercisesInterface | null;
        if (!programExercise?.exercise_id) return;

        const links = await fetchManyFromTable({
            table: EXERCISE_MUSCLES_TABLE,
            where: [{ field: "exercise_id", operator: "=", value: programExercise.exercise_id }],
        }) as ExerciseMusclesInterface[];
        if (links.length === 0) return;

        for (const link of links) {
            const stimulus = Number(link.contribution) * setUnits;
            await applyStimulusToMuscleSignal({ userId, muscleId: link.muscle_id, stimulus, now });
        }
    } catch (error) {
        logger.error({ error }, "Failed to update muscle signals for logged set");
    }
}

const applyStimulusToMuscleSignal = async (params: {
    userId: string,
    muscleId: string,
    stimulus: number,
    now: Date,
}): Promise<void> => {
    const { userId, muscleId, stimulus, now } = params;

    const existing = await fetchOneFromTable({
        table: USER_MUSCLE_SIGNALS_TABLE,
        where: [
            { field: "user_id", operator: "=", value: userId },
            { field: "muscle_id", operator: "=", value: muscleId },
        ],
    }) as UserMuscleSignalsInterface | null;

    if (!existing) {
        await addOneInTable({
            table: USER_MUSCLE_SIGNALS_TABLE,
            data: {
                user_id: userId,
                muscle_id: muscleId,
                training_value: capTraining(stimulus),
                fatigue_value: stimulus,
                last_computed_at: now,
            },
        });
        return;
    }

    const elapsedHours = (now.getTime() - new Date(existing.last_computed_at).getTime()) / 3_600_000;
    const nextTraining = capTraining(decay(Number(existing.training_value), elapsedHours, MUSCLE_SIGNAL_CONFIG.trainingHalfLifeHours) + stimulus);
    const nextFatigue = decay(Number(existing.fatigue_value), elapsedHours, MUSCLE_SIGNAL_CONFIG.fatigueHalfLifeHours) + stimulus;

    await updateOneInTable({
        table: USER_MUSCLE_SIGNALS_TABLE,
        data: {
            training_value: nextTraining,
            fatigue_value: nextFatigue,
            last_computed_at: now,
        },
        where: [{ field: "id", operator: "=", value: existing.id }],
    });
}

export interface MuscleSignalView {
    muscle_id: string;
    name: string;
    slug: string;
    parent_muscle_id: string | null;
    body_region: string | null;
    display_order: number;
    /** null when `muscles.xp_enabled` is false for this muscle. */
    training_percent: number | null;
    /** null when `muscles.recovery_enabled` is false for this muscle. */
    fatigue_percent: number | null;
}

export const getMuscleSignalsForUserService = async (userId?: string): Promise<MuscleSignalView[]> => {
    if (!userId) {
        throw new Error("User ID is required");
    }
    const now = new Date();
    const rows = await fetchMuscleSignalsForUserRepository(userId);

    return rows.map((row) => {
        const elapsedHours = row.last_computed_at
            ? (now.getTime() - new Date(row.last_computed_at).getTime()) / 3_600_000
            : 0;
        // capTraining here too so rows written before the cap existed behave as if capped.
        const displayedTraining = decay(capTraining(row.training_value ?? 0), elapsedHours, MUSCLE_SIGNAL_CONFIG.trainingHalfLifeHours);
        const displayedFatigue = decay(row.fatigue_value ?? 0, elapsedHours, MUSCLE_SIGNAL_CONFIG.fatigueHalfLifeHours);

        return {
            muscle_id: row.id,
            name: row.name,
            slug: row.slug,
            parent_muscle_id: row.parent_muscle_id,
            body_region: row.body_region,
            display_order: row.display_order,
            training_percent: row.xp_enabled
                ? applyTrainingFloor(clampPercent((displayedTraining / MUSCLE_SIGNAL_CONFIG.trainingReferenceStimulus) * 100))
                : null,
            fatigue_percent: row.recovery_enabled
                ? clampPercent((displayedFatigue / MUSCLE_SIGNAL_CONFIG.fatigueReferenceStimulus) * 100)
                : null,
        };
    });
}
