import { z } from "zod";
import { logger } from "../../../config/logger.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { isValidUUID } from "../../../utils/validation.js";
import { generateStructuredJson, isLlmConfigured, LlmUnavailableError } from "../../../infrastructure/groq/index.js";
import { UserWeeklyCheckinsInterface } from "../../../db/schemas/users/checkins/userWeeklyCheckins.schema.js";
import {
    assessWeightPace,
    isWeightGoalPreset,
    paceWeeklyPct,
    requiredWeeklyPct,
    WEIGHT_GOAL_PRESETS,
    WeightPaceStatus,
    weeklyWeightSlope,
} from "../../../utils/users/users.weightGoal.utils.js";
import {
    clearNotificationGroupRepository,
    postNotificationRepository,
} from "../users.notifications/users.notifications.repository.js";
import { fetchWeightGoalRepository } from "../users.profile/users.profile.repository.js";
import {
    fetchRequiredWeekdaysRepository,
    fetchUserAssignmentsRepository,
    fetchWeeklyVolumeSeriesRepository,
} from "../users.workout/users.workout.repository.js";
import {
    addDays,
    getUserHealthPreferencesOrDefault,
    isoWeekdayOf,
    localDateString,
} from "../users.workout/users.workout.service.js";
import {
    claimWeeklyCheckinRepository,
    completeWeeklyCheckinRepository,
    dismissWeeklyCheckinRepository,
    failWeeklyCheckinRepository,
    fetchExerciseWeekProgressRepository,
    fetchLastActivityRepository,
    fetchMuscleWeekSetsRepository,
    saveSkippedWeeklyCheckinRepository,
    fetchWeekSessionSummaryRepository,
    fetchWeekSetCountsRepository,
    fetchWeeklyCheckinRepository,
    fetchWeightEntriesBetweenRepository,
} from "./users.checkins.repository.js";

// See algorithms/weekly-checkin.md for what each number means and why. Keep
// the two in sync.

const MAX_LIST_ITEMS = 4;
// Retry delays after a failed model call, by attempt number.
const RETRY_DELAYS_MINUTES = [15, 60, 360];
const NOT_CONFIGURED_RETRY_MINUTES = 60;

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const pctChange = (from: number, to: number) => (from === 0 ? null : round1(((to - from) / from) * 100));

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface WeeklyCheckinStats {
    week_start: string;
    week_end: string;
    weight_units: string;
    training: {
        sessions_completed: number;
        /** Distinct days with a completed workout. */
        days_trained: number;
        planned_sessions: number;
        planned_days_trained: number;
        avg_session_minutes: number | null;
        working_sets: number;
        sets_with_discomfort: number;
        volume: number;
        volume_last_week: number;
        volume_usual: number;
        volume_change_vs_usual_pct: number | null;
    };
    exercises: {
        prs: { name: string, load: number, reps: number, e1rm: number, previous_best_e1rm: number }[];
        stalled: { name: string, best_e1rm: number, sessions_last_3_weeks: number }[];
    };
    muscles: {
        most_trained: { name: string, sets: number }[];
        below_usual: { name: string, sets: number, usual_sets: number }[];
    };
    weight: {
        weigh_ins: number;
        /** Distinct days with at least one weigh-in. */
        weigh_in_days: number;
        avg: number | null;
        avg_last_week: number | null;
        change_vs_last_week: number | null;
        trend_per_week: number | null;
        trend_pct_per_week: number | null;
    };
    goal: {
        type: "lose" | "maintain" | "gain" | null;
        preset: string | null;
        target_weight: number | null;
        goal_date: string | null;
        weeks_left: number | null;
        target_pct_per_week: number | null;
        preset_daily_kcal: string | null;
        pace_status: WeightPaceStatus;
    };
}

const computeWeeklyCheckinStats = async (
    userId: string,
    timezone: string,
    weightUnits: string,
    weekStart: string,
): Promise<WeeklyCheckinStats> => {
    const weekEnd = addDays(weekStart, 6);

    const [sessions, setCounts, muscles, exercises, volumeSeries, weightEntries, goalRow, assignments] = await Promise.all([
        fetchWeekSessionSummaryRepository(userId, timezone, weekStart, weekEnd),
        fetchWeekSetCountsRepository(userId, timezone, weekStart, weekEnd),
        fetchMuscleWeekSetsRepository(userId, timezone, weekStart, weekEnd),
        fetchExerciseWeekProgressRepository(userId, timezone, weekStart, weekEnd),
        fetchWeeklyVolumeSeriesRepository(userId, timezone, addDays(weekStart, -28)),
        fetchWeightEntriesBetweenRepository(userId, addDays(weekEnd, -27), weekEnd),
        fetchWeightGoalRepository(userId),
        fetchUserAssignmentsRepository({ userId, activeOnly: true }),
    ]);

    // Same "required weekday" rule as the dashboard's week strip.
    const requiredWeekdays = new Set(
        await fetchRequiredWeekdaysRepository(assignments.map((a) => a.workout_program_version_id)),
    );
    const plannedDaysTrained = sessions.dates.filter((d) => requiredWeekdays.has(isoWeekdayOf(d))).length;

    const volumeByWeek = new Map(volumeSeries.map((w) => [w.week_start, w.volume]));
    const volume = volumeByWeek.get(weekStart) ?? 0;
    const priorVolumes = [1, 2, 3, 4].map((i) => volumeByWeek.get(addDays(weekStart, -7 * i)) ?? 0);
    const trainedPrior = priorVolumes.filter((v) => v > 0);
    const volumeUsual = trainedPrior.length ? mean(trainedPrior) : 0;

    const prs = exercises
        .filter((e) => e.best_before_e1rm != null && e.best_week_e1rm > e.best_before_e1rm)
        .sort((a, b) => (b.best_week_e1rm / b.best_before_e1rm!) - (a.best_week_e1rm / a.best_before_e1rm!))
        .slice(0, MAX_LIST_ITEMS)
        .map((e) => ({
            name: e.name,
            load: round1(e.best_week_load),
            reps: e.best_week_reps,
            e1rm: round1(e.best_week_e1rm),
            previous_best_e1rm: round1(e.best_before_e1rm!),
        }));

    // Trained at least 3 times in the last 3 weeks and still not past the
    // best from before them.
    const stalled = exercises
        .filter((e) => e.sessions_recent >= 3 && e.best_older_e1rm != null && e.best_recent_e1rm <= e.best_older_e1rm)
        .sort((a, b) => b.sessions_recent - a.sessions_recent)
        .slice(0, MAX_LIST_ITEMS)
        .map((e) => ({ name: e.name, best_e1rm: round1(e.best_older_e1rm!), sessions_last_3_weeks: e.sessions_recent }));

    const mostTrained = muscles
        .filter((m) => m.week_sets > 0)
        .sort((a, b) => b.week_sets - a.week_sets)
        .slice(0, MAX_LIST_ITEMS)
        .map((m) => ({ name: m.name, sets: round1(m.week_sets) }));
    // Usually worked (2+ weighted sets a week) and down by at least half.
    const belowUsual = muscles
        .filter((m) => m.usual_sets >= 2 && m.week_sets <= m.usual_sets * 0.5)
        .sort((a, b) => (b.usual_sets - b.week_sets) - (a.usual_sets - a.week_sets))
        .slice(0, MAX_LIST_ITEMS)
        .map((m) => ({ name: m.name, sets: round1(m.week_sets), usual_sets: round1(m.usual_sets) }));

    const thisWeekWeights = weightEntries.filter((e) => e.date >= weekStart).map((e) => e.weight);
    const lastWeekStart = addDays(weekStart, -7);
    const lastWeekWeights = weightEntries.filter((e) => e.date >= lastWeekStart && e.date < weekStart).map((e) => e.weight);
    const avg = thisWeekWeights.length ? mean(thisWeekWeights) : null;
    const avgLastWeek = lastWeekWeights.length ? mean(lastWeekWeights) : null;
    const slope = weeklyWeightSlope(weightEntries);
    const referenceWeight = avg ?? (weightEntries.length ? weightEntries[weightEntries.length - 1].weight : null);
    const slopePct = slope != null && referenceWeight ? (slope / referenceWeight) * 100 : null;

    const goal = goalRow?.weight_goal ?? null;
    const preset = goalRow?.weight_goal_preset ?? null;
    const targetWeight = goalRow?.target_weight != null ? Number(goalRow.target_weight) : null;
    const goalDate = goalRow?.goal_date ?? null;
    const weeksLeft = goalDate && goalDate > weekEnd
        ? (Date.parse(`${goalDate}T00:00:00Z`) - Date.parse(`${weekEnd}T00:00:00Z`)) / (7 * 86_400_000)
        : null;
    // The goal date sets the pace while there's time left; past it (or with
    // no date), fall back to the pace the user chose.
    const sign = goal === "lose" ? -1 : 1;
    const pacePct = preset && goal !== "maintain" && referenceWeight
        ? sign * paceWeeklyPct({
            pace: preset,
            customPace: goalRow?.custom_weekly_pace != null ? Number(goalRow.custom_weekly_pace) : null,
            customUnit: goalRow?.custom_weekly_pace_unit ?? null,
        }, referenceWeight)
        : null;
    let targetPct: number | null = goal === "maintain" ? 0 : pacePct;
    if (goal !== "maintain" && referenceWeight && targetWeight != null && weeksLeft) {
        targetPct = requiredWeeklyPct(referenceWeight, targetWeight, weeksLeft);
    }
    // ~7700 kcal per kg of body weight (~3500 per lb), spread over 7 days.
    const kcalPerUnitPerDay = weightUnits === "lbs" ? 500 : 1100;
    const dailyKcal = isWeightGoalPreset(preset)
        ? WEIGHT_GOAL_PRESETS[preset].daily_kcal
        : pacePct != null && referenceWeight
            ? `about ${Math.round(Math.abs(pacePct) / 100 * referenceWeight * kcalPerUnitPerDay / 50) * 50} kcal ${pacePct < 0 ? "below" : "above"} maintenance`
            : null;

    const stats: WeeklyCheckinStats = {
        week_start: weekStart,
        week_end: weekEnd,
        weight_units: weightUnits,
        training: {
            sessions_completed: sessions.sessions,
            days_trained: sessions.dates.length,
            planned_sessions: requiredWeekdays.size,
            planned_days_trained: plannedDaysTrained,
            avg_session_minutes: sessions.avg_duration_seconds != null ? Math.round(sessions.avg_duration_seconds / 60) : null,
            working_sets: setCounts.working_sets,
            sets_with_discomfort: setCounts.sets_with_discomfort,
            volume: Math.round(volume),
            volume_last_week: Math.round(priorVolumes[0]),
            volume_usual: Math.round(volumeUsual),
            volume_change_vs_usual_pct: volumeUsual > 0 ? pctChange(volumeUsual, volume) : null,
        },
        exercises: { prs, stalled },
        muscles: { most_trained: mostTrained, below_usual: belowUsual },
        weight: {
            weigh_ins: thisWeekWeights.length,
            weigh_in_days: new Set(weightEntries.filter((e) => e.date >= weekStart).map((e) => e.date)).size,
            avg: avg != null ? round1(avg) : null,
            avg_last_week: avgLastWeek != null ? round1(avgLastWeek) : null,
            change_vs_last_week: avg != null && avgLastWeek != null ? round1(avg - avgLastWeek) : null,
            trend_per_week: slope != null ? round2(slope) : null,
            trend_pct_per_week: slopePct != null ? round2(slopePct) : null,
        },
        goal: {
            type: goal,
            preset: isWeightGoalPreset(preset) ? WEIGHT_GOAL_PRESETS[preset].label : preset === "custom" ? "Custom pace" : null,
            target_weight: targetWeight,
            goal_date: goalDate,
            weeks_left: weeksLeft != null ? round1(weeksLeft) : null,
            target_pct_per_week: targetPct != null ? round2(targetPct) : null,
            preset_daily_kcal: dailyKcal,
            pace_status: assessWeightPace({
                goal,
                preset,
                actualWeeklyPct: slopePct,
                targetWeeklyPct: targetPct,
                currentWeight: referenceWeight,
                targetWeight,
            }),
        },
    };

    return stats;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const CHECKIN_CONTENT_JSON_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["headline", "summary", "wins", "focus"],
    properties: {
        headline: { type: "string" },
        summary: { type: "string" },
        wins: { type: "array", items: { type: "string" } },
        focus: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "detail"],
                properties: {
                    title: { type: "string" },
                    detail: { type: "string" },
                },
            },
        },
    },
};

const clip = (max: number) => z.string().trim().min(1).transform((s) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s));

const checkinContentSchema = z.object({
    headline: clip(80),
    summary: clip(500),
    wins: z.array(z.string().trim()).transform((a) => a.filter(Boolean).slice(0, 3).map((s) => s.slice(0, 160))),
    focus: z.array(z.object({ title: clip(60), detail: clip(260) })).min(1).transform((a) => a.slice(0, 2)),
});

export type WeeklyCheckinContent = z.infer<typeof checkinContentSchema>;

const SYSTEM_PROMPT = `You write the weekly check-in in a gym-tracking app: a short note from a coach about the user's last training week. You get JSON with numbers the app already computed.

Rules:
- Use only facts and numbers that are in the data. Do not calculate new statistics or guess at anything missing. Leave out anything that is null or empty.
- Weights are in weight_units. "volume" is total weight lifted (weight x reps). "e1rm" is estimated one-rep max. Muscle "sets" are weighted, so they can be decimals.
- goal.pace_status is the app's verdict on body weight. Follow it and never contradict it:
  on_track: confirm it and say to keep going. behind: progress is slower than the goal needs. too_fast: faster than is healthy or needed, suggest easing off. wrong_direction: moving away from the goal. goal_reached: congratulate and suggest choosing a new goal. drifting_up / drifting_down: a maintenance goal is drifting. no_goal: describe the trend neutrally and give no food advice. not_enough_data: suggest weighing in at least 4 mornings a week.
- Food advice only when pace_status is behind, too_fast, wrong_direction, drifting_up or drifting_down, and only as a small daily change of 100 to 250 kcal in the needed direction. Never give a total calorie target. Never mention medication, supplements, fasting, diets by name or any extreme method.
- Training advice must be small and concrete, for example one or two extra sets for a muscle in muscles.below_usual, a lighter week or a different rep range for a lift in exercises.stalled, or getting the planned sessions done. Do not prescribe new programs.
- If training.sets_with_discomfort is above 0, mention easing off or checking form on those lifts, and seeing a professional if pain continues. Never diagnose.
- If sessions_completed is 0, be encouraging and not guilt-tripping, and suggest one easy session to restart.
- Voice: direct and warm, like a good coach texting. Second person. No emoji, no hype words, at most one exclamation mark.

Output:
- headline: at most 8 words.
- summary: 2 or 3 sentences, at most 60 words, covering training and body weight.
- wins: 0 to 3 items, each at most 15 words. Only real wins from the data (PRs, planned sessions done, volume up, weight on track).
- focus: 1 or 2 items for next week, each a different change. title at most 6 words; detail at most 30 words saying exactly what to do. Pick them in this order of priority, skipping what doesn't apply: discomfort, body-weight pace, missed planned sessions, stalled lifts, muscles below usual.`;

export const generateCheckinContent = async (stats: WeeklyCheckinStats) => {
    const { data, model } = await generateStructuredJson({
        system: SYSTEM_PROMPT,
        user: JSON.stringify(stats),
        schemaName: "weekly_checkin",
        schema: CHECKIN_CONTENT_JSON_SCHEMA,
    });
    const parsed = checkinContentSchema.safeParse(data);
    if (!parsed.success) {
        throw new LlmUnavailableError("bad_output", "Model output failed validation");
    }
    return { content: parsed.data, model };
}

// ---------------------------------------------------------------------------
// Who gets a model call — algorithms/weekly-checkin.md §2
// ---------------------------------------------------------------------------

export const CHECKIN_MIN_WEIGH_IN_DAYS = 4;
export const CHECKIN_MIN_WORKOUT_SHARE = 0.75;
// No weigh-in / workout for this long counts as "hasn't used it in months":
// the notice invites them back instead of reporting last week's shortfall.
const LONG_INACTIVE_DAYS = 60;
// A skipped week is re-checked at most this often, so weigh-ins or workouts
// logged late for that week can still unlock it.
const SKIPPED_RECHECK_MINUTES = 60;
const CHECKIN_NOTIFICATION_GROUP = "weekly_checkin";

export type CheckinSkipReason =
    | { kind: "weight", logged_days: number, needed_days: number, long_inactive: boolean }
    | { kind: "workouts", done: number, planned: number, needed: number, long_inactive: boolean }
    | { kind: "no_plan" };

const evaluateCheckinEligibility = (
    stats: WeeklyCheckinStats,
    lastActivity: { last_weigh_in: string | null, last_workout: string | null },
): CheckinSkipReason[] => {
    const inactiveSince = addDays(stats.week_end, -LONG_INACTIVE_DAYS);
    const reasons: CheckinSkipReason[] = [];

    if (stats.weight.weigh_in_days < CHECKIN_MIN_WEIGH_IN_DAYS) {
        reasons.push({
            kind: "weight",
            logged_days: stats.weight.weigh_in_days,
            needed_days: CHECKIN_MIN_WEIGH_IN_DAYS,
            long_inactive: !lastActivity.last_weigh_in || lastActivity.last_weigh_in < inactiveSince,
        });
    }

    const planned = stats.training.planned_sessions;
    if (planned === 0) {
        reasons.push({ kind: "no_plan" });
    } else {
        // Any training day counts, not only the plan's own weekdays — moving
        // Monday's session to Tuesday isn't skipping it.
        const done = Math.min(stats.training.days_trained, planned);
        const needed = Math.ceil(planned * CHECKIN_MIN_WORKOUT_SHARE);
        if (done < needed) {
            reasons.push({
                kind: "workouts",
                done,
                planned,
                needed,
                long_inactive: !lastActivity.last_workout || lastActivity.last_workout < inactiveSince,
            });
        }
    }
    return reasons;
}

const formatWeekRange = (start: string, end: string) => {
    const fmt = (d: string, withMonth: boolean) => new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        ...(withMonth && { month: "short" }),
        timeZone: "UTC",
    }).format(new Date(`${d}T00:00:00Z`));
    return start.slice(0, 7) === end.slice(0, 7)
        ? `${fmt(start, false)}–${fmt(end, true)}`
        : `${fmt(start, true)} – ${fmt(end, true)}`;
}

const joinParts = (parts: string[]) =>
    parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/**
 * One notice per skipped week, replacing the last one (same group). Users
 * who haven't logged anything in months get an invitation; everyone else
 * gets the specific numbers they were short by.
 */
const postCheckinSkippedNotification = async (userId: string, stats: WeeklyCheckinStats, reasons: CheckinSkipReason[]) => {
    const invite = reasons.every((r) => r.kind === "no_plan" || r.long_inactive);
    const parts = reasons.map((r) => {
        if (r.kind === "weight") {
            return invite
                ? "log your weight daily (at least 4 days a week)"
                : `log your weight on at least ${r.needed_days} of 7 days (you logged ${r.logged_days})`;
        }
        if (r.kind === "workouts") {
            return invite
                ? "complete at least 75% of your planned workouts"
                : `complete at least ${r.needed} of your ${r.planned} planned workouts (you did ${r.done})`;
        }
        return "follow a workout plan";
    });

    const onlyWeight = reasons.every((r) => r.kind === "weight");
    const onlyTraining = reasons.every((r) => r.kind !== "weight");
    const link = onlyWeight ? "/progress?tab=body" : onlyTraining ? "/workout" : "/home";

    const type = invite ? "weekly_checkin_invite" : "weekly_checkin_skipped";
    const signature = reasons
        .map((r) => (r.kind === "weight" ? `w${r.logged_days}` : r.kind === "workouts" ? `t${r.done}-${r.planned}` : "np"))
        .join(".");
    const sentence = joinParts(parts);

    await postNotificationRepository({
        userId,
        type,
        groupKey: CHECKIN_NOTIFICATION_GROUP,
        dedupeKey: `${CHECKIN_NOTIFICATION_GROUP}:${stats.week_start}:${type}:${signature}`,
        title: invite ? "Get weekly AI insights" : "No AI check-in this week",
        body: invite
            ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}, and you'll get an AI analysis of your training and weight every week.`
            : `We couldn't generate your analysis for ${formatWeekRange(stats.week_start, stats.week_end)}. It needs you to ${sentence}.`,
        link,
    });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type WeeklyCheckinResponseStatus = "ready" | "pending" | "failed" | "skipped";

const toCheckinView = (row: UserWeeklyCheckinsInterface) => ({
    id: row.id,
    week_start: row.week_start,
    week_end: addDays(row.week_start, 6),
    status: row.status,
    stats: row.stats as WeeklyCheckinStats,
    content: (row.content as WeeklyCheckinContent | null) ?? null,
    skip_reasons: (row.skip_reasons as CheckinSkipReason[] | null) ?? null,
    generated_at: row.generated_at,
    dismissed: row.dismissed_at != null,
});

const respond = (row: UserWeeklyCheckinsInterface) => ({
    status: row.status as WeeklyCheckinResponseStatus,
    checkin: toCheckinView(row),
});

const retryAt = (attempts: number, minutes?: number) =>
    new Date(Date.now() + (minutes ?? RETRY_DELAYS_MINUTES[Math.min(attempts, RETRY_DELAYS_MINUTES.length) - 1]) * 60_000);

const isRetryDue = (row: UserWeeklyCheckinsInterface) =>
    (row.status === "failed" || row.status === "skipped")
    && (!row.next_retry_at || new Date(row.next_retry_at) <= new Date());

/**
 * The check-in for the last completed Monday-Sunday week (user's timezone).
 * Decided the first time it's asked for and stored: weeks that meet the data
 * requirements get one model call (plus retries on failure); the rest get a
 * notification saying what was missing, and no call at all.
 */
export const getWeeklyCheckinService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    const { timezone, weight_units } = await getUserHealthPreferencesOrDefault(userId);
    const todayStr = localDateString(new Date(), timezone);
    const currentWeekStart = addDays(todayStr, -(isoWeekdayOf(todayStr) - 1));
    const weekStart = addDays(currentWeekStart, -7);

    const existing = await fetchWeeklyCheckinRepository(userId, weekStart);
    if (existing) {
        const stalePending = existing.status === "pending"
            && Date.now() - new Date(existing.updated_at).getTime() > 2 * 60_000;
        if (existing.status === "ready" || existing.dismissed_at || (!isRetryDue(existing) && !stalePending)) {
            return respond(existing);
        }
    }

    const stats = await computeWeeklyCheckinStats(userId, timezone, weight_units, weekStart);

    // Once a week has passed the gate (pending/failed) it stays on the model path.
    if (!existing || existing.status === "skipped") {
        const lastActivity = await fetchLastActivityRepository(userId, timezone, stats.week_end);
        const reasons = evaluateCheckinEligibility(stats, lastActivity);
        if (reasons.length > 0) {
            const skipped = await saveSkippedWeeklyCheckinRepository(
                userId, weekStart, stats, reasons, new Date(Date.now() + SKIPPED_RECHECK_MINUTES * 60_000),
            );
            if (!skipped) {
                const current = await fetchWeeklyCheckinRepository(userId, weekStart);
                return current ? respond(current) : { status: "pending" as const, checkin: null };
            }
            try {
                await postCheckinSkippedNotification(userId, stats, reasons);
            } catch (error) {
                logger.error({ error }, "Failed to post weekly check-in notification");
            }
            return respond(skipped);
        }
    }

    const claimed = await claimWeeklyCheckinRepository(userId, weekStart, stats);
    if (!claimed) {
        // Another request is writing it right now.
        const current = await fetchWeeklyCheckinRepository(userId, weekStart);
        return current ? respond(current) : { status: "pending" as const, checkin: null };
    }

    if (!isLlmConfigured()) {
        return respond(await failWeeklyCheckinRepository(claimed.id, retryAt(claimed.attempts, NOT_CONFIGURED_RETRY_MINUTES)));
    }

    try {
        const { content, model } = await generateCheckinContent(stats);
        const ready = await completeWeeklyCheckinRepository(claimed.id, content, model);
        // Any "couldn't generate" notice is out of date now.
        await clearNotificationGroupRepository(userId, CHECKIN_NOTIFICATION_GROUP).catch((error) => {
            logger.error({ error }, "Failed to clear weekly check-in notifications");
        });
        return respond(ready);
    } catch (error) {
        if (!(error instanceof LlmUnavailableError)) {
            logger.error({ error }, "Weekly check-in generation crashed");
        } else {
            logger.warn({ reason: error.reason, message: error.message }, "Weekly check-in generation failed");
        }
        return respond(await failWeeklyCheckinRepository(claimed.id, retryAt(claimed.attempts)));
    }
}

/** For callers that only need the week decided (e.g. before listing notifications). */
export const ensureWeeklyCheckinService = getWeeklyCheckinService;

export const dismissWeeklyCheckinService = async (data: { userId?: string, checkinId?: string }) => {
    const { userId, checkinId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!checkinId || !isValidUUID(checkinId)) {
        throw new AppError("Invalid check-in id", 400);
    }
    if (!await dismissWeeklyCheckinRepository(checkinId, userId)) {
        throw new AppError("Check-in not found", 404);
    }
}
