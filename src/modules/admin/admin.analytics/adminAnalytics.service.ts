import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import { isLlmConfigured } from "../../../infrastructure/groq/index.js";
import { redis } from "../../../infrastructure/redis/index.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { isValidUUID } from "../../../utils/validation.js";
import {
    fetchActiveUserCountsRepository,
    fetchAiBreakdownRepository,
    fetchAiDailyRepository,
    fetchAiTodayByStatusRepository,
    fetchAiTotalsRepository,
    fetchCheckinSkipReasonsRepository,
    fetchCheckinTotalsRepository,
    fetchCheckinWeeklyOutcomesRepository,
    fetchNewUsersPerWeekRepository,
    fetchUserAiRequestsRepository,
    fetchUserCheckinHistoryRepository,
    fetchUserPlansRepository,
    fetchUserProfileRepository,
    fetchUserRecentWorkoutsRepository,
    fetchUsersWithActivityRepository,
    fetchUserTotalsRepository,
    fetchUserWeightTrendRepository,
    UserActivityFilter,
    UserActivityRow,
    UserSortField,
} from "./adminAnalytics.repository.js";
import {
    fetchAttentionCountsRepository,
    fetchContentHealthRepository,
    fetchRecentSignupsRepository,
    fetchTopExercisesRepository,
    fetchTopProgramsRepository,
    fetchWeeklyPulseRepository,
    fetchWorkoutsPerDayRepository,
} from "./adminDashboard.repository.js";

type Query = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

const todayUtc = () => new Date().toISOString().slice(0, 10);

const shiftDays = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

const parseDateParam = (value: unknown, name: string): string | null => {
    if (value === undefined || value === "") {
        return null;
    }
    if (typeof value !== "string" || !DATE_RE.test(value)) {
        throw new AppError(`${name} must be a date like 2026-01-31`, 400);
    }
    // Rejects dates like 2026-02-31 that match the pattern but don't exist.
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
        throw new AppError(`${name} is not a valid date`, 400);
    }
    return value;
}

/**
 * Inclusive UTC day range from `from`/`to` (YYYY-MM-DD). Defaults to the
 * `defaultDays` days ending today.
 */
const parseRange = (query: Query, defaultDays = 30) => {
    const to = parseDateParam(query.to, "to") ?? todayUtc();
    const from = parseDateParam(query.from, "from") ?? shiftDays(to, -(defaultDays - 1));
    if (from > to) {
        throw new AppError("from must be on or before to", 400);
    }
    if (shiftDays(from, MAX_RANGE_DAYS - 1) < to) {
        throw new AppError(`The date range can be at most ${MAX_RANGE_DAYS} days`, 400);
    }
    return { from, to };
}

const parsePositiveInt = (value: unknown, fallback: number, max: number) => {
    const n = parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(n) || n < 1) {
        return fallback;
    }
    return Math.min(n, max);
}

// ---------------------------------------------------------------------------
// Contact masking — the list shows masked contacts, the detail page shows
// them in full (decided with the product owner).
// ---------------------------------------------------------------------------

export const maskEmail = (email: string | null): string | null => {
    if (!email) {
        return null;
    }
    const at = email.lastIndexOf("@");
    if (at < 1) {
        return "***";
    }
    return `${email[0]}***${email.slice(at)}`;
}

export const maskPhone = (countryCode: string | null, number: string | null): string | null => {
    if (!number) {
        return null;
    }
    const digits = number.replace(/\D/g, "");
    const visible = digits.slice(-4);
    const masked = `${"*".repeat(Math.max(digits.length - visible.length, 2))}${visible}`;
    return countryCode ? `${countryCode} ${masked}` : masked;
}

const fullPhone = (countryCode: string | null, number: string | null) =>
    number ? (countryCode ? `${countryCode} ${number}` : number) : null;

const displayName = (row: Pick<UserActivityRow, "first_name" | "last_name">) =>
    [row.first_name, row.last_name].filter(Boolean).join(" ") || null;

const toActivity = (row: UserActivityRow) => ({
    created_at: row.created_at,
    last_active_at: row.last_active_at,
    workouts_7d: row.workouts_7d,
    workouts_30d: row.workouts_30d,
    weigh_in_days_30d: row.weigh_in_days_30d,
    has_active_plan: row.has_active_plan,
    has_goal: row.has_goal,
    ai_calls: row.ai_calls,
});

// ---------------------------------------------------------------------------
// AI usage
// ---------------------------------------------------------------------------

/** Statuses that reached the provider, i.e. used up part of the daily budget. */
const BUDGET_STATUSES = new Set(["success", "rate_limited", "timeout", "provider_error", "bad_output"]);

/** The same counter `reserveDailyRequest` enforces the limit with. Null if Redis is unreachable. */
const readDailyBudgetCounter = async (): Promise<number | null> => {
    try {
        const value = await redis.get(`groq:requests:${todayUtc()}`);
        return value ? parseInt(value, 10) : 0;
    } catch (error) {
        logger.warn({ error }, "Could not read the Groq daily request counter");
        return null;
    }
}

export const getAiSummaryService = async (query: Query) => {
    const { from, to } = parseRange(query);
    const [totals, byStatus, byFeature, byModel, today, counter] = await Promise.all([
        fetchAiTotalsRepository(from, to),
        fetchAiBreakdownRepository("status", from, to),
        fetchAiBreakdownRepository("feature", from, to),
        fetchAiBreakdownRepository("model", from, to),
        fetchAiTodayByStatusRepository(),
        readDailyBudgetCounter(),
    ]);
    const todayTotal = today.reduce((sum, row) => sum + row.count, 0);
    const todayBudgeted = today
        .filter((row) => BUDGET_STATUSES.has(row.status))
        .reduce((sum, row) => sum + row.count, 0);
    const success = byStatus.find((row) => row.key === "success")?.count ?? 0;

    return {
        range: { from, to },
        config: {
            configured: isLlmConfigured(),
            model: env.GROQ_MODEL,
            daily_limit: env.GROQ_DAILY_REQUEST_LIMIT,
        },
        today: {
            date: todayUtc(),
            calls: todayTotal,
            // Calls that went out to Groq today, from ai_requests.
            budget_used: todayBudgeted,
            // Redis counter the limit is enforced with. It also counts calls
            // refused by the cap, so it can run past the limit.
            budget_counter: counter,
            by_status: today,
        },
        totals: {
            calls: totals.total,
            success,
            success_rate: totals.total > 0 ? success / totals.total : null,
            prompt_tokens: totals.prompt_tokens,
            completion_tokens: totals.completion_tokens,
            total_tokens: totals.prompt_tokens + totals.completion_tokens,
            latency_p50_ms: totals.latency_p50_ms === null ? null : Math.round(totals.latency_p50_ms),
            latency_p95_ms: totals.latency_p95_ms === null ? null : Math.round(totals.latency_p95_ms),
        },
        by_status: byStatus,
        by_feature: byFeature,
        by_model: byModel,
    };
}

export const getAiDailyService = async (query: Query) => {
    const { from, to } = parseRange(query);
    const feature = typeof query.feature === "string" && query.feature.trim() ? query.feature.trim() : null;
    const days = await fetchAiDailyRepository(from, to, feature);
    return { range: { from, to }, feature, days };
}

export const getCheckinOutcomesService = async (query: Query) => {
    // Weeks are short series; default to the last 12 weeks.
    const { from, to } = parseRange(query, 12 * 7);
    const [weeks, skipReasons, totals] = await Promise.all([
        fetchCheckinWeeklyOutcomesRepository(from, to),
        fetchCheckinSkipReasonsRepository(from, to),
        fetchCheckinTotalsRepository(from, to),
    ]);
    return { range: { from, to }, totals, weeks, skip_reasons: skipReasons };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export const getOverviewService = async (query: Query) => {
    const { from, to } = parseRange(query, 12 * 7);
    const [totals, active, newUsersPerWeek] = await Promise.all([
        fetchUserTotalsRepository(from, to),
        fetchActiveUserCountsRepository(),
        fetchNewUsersPerWeekRepository(from, to),
    ]);
    return {
        range: { from, to },
        users: totals,
        active,
        new_users_per_week: newUsersPerWeek,
    };
}

// ---------------------------------------------------------------------------
// Dashboard — the admin home page: this week against last, what users
// train with, and what needs fixing. Takes no range; every window is fixed.
// ---------------------------------------------------------------------------

const DASHBOARD_DAYS = 30;
const DASHBOARD_TOP = 5;

export const getDashboardService = async () => {
    const [pulse, perDay, topPrograms, topExercises, content, attention, signups, aiCounter] = await Promise.all([
        fetchWeeklyPulseRepository(),
        fetchWorkoutsPerDayRepository(DASHBOARD_DAYS),
        fetchTopProgramsRepository(DASHBOARD_TOP),
        fetchTopExercisesRepository(DASHBOARD_TOP),
        fetchContentHealthRepository(),
        fetchAttentionCountsRepository(),
        fetchRecentSignupsRepository(DASHBOARD_TOP),
        readDailyBudgetCounter(),
    ]);
    return {
        generated_at: new Date().toISOString(),
        pulse,
        workouts_per_day: perDay,
        top_programs: topPrograms,
        top_exercises: topExercises,
        content,
        attention: {
            ...attention,
            ai_configured: isLlmConfigured(),
            ai_daily_limit: env.GROQ_DAILY_REQUEST_LIMIT,
            // Calls counted against today's limit; null if Redis is unreachable.
            ai_budget_used_today: aiCounter,
        },
        recent_signups: signups.map((row) => ({
            id: row.id,
            name: displayName(row),
            email: maskEmail(row.email),
            phone: maskPhone(row.phone_country_code, row.phone_number),
            created_at: row.created_at,
            onboarded: row.onboarded_at != null,
        })),
    };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const ACTIVITY_FILTERS: UserActivityFilter[] = ["active_7d", "inactive_30d"];
const SORT_FIELDS: UserSortField[] = ["last_active", "created_at"];

export const listUsersService = async (query: Query) => {
    const page = parsePositiveInt(query.page, 1, 100_000);
    const limit = parsePositiveInt(query.limit, 20, 100);
    const search = typeof query.search === "string" ? query.search.slice(0, 100) : "";
    const activity = ACTIVITY_FILTERS.find((f) => f === query.activity) ?? null;
    const sort = SORT_FIELDS.find((f) => f === query.sort) ?? "last_active";
    const order = query.order === "asc" ? "asc" : "desc";
    const hasPlan = query.hasPlan === "true";

    const { rows, totalCount } = await fetchUsersWithActivityRepository({
        search, activity, hasPlan, sort, order, page, limit,
    });
    return {
        data: rows.map((row) => ({
            id: row.id,
            name: displayName(row),
            email: maskEmail(row.email),
            phone: maskPhone(row.phone_country_code, row.phone_number),
            ...toActivity(row),
        })),
        meta: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
        },
    };
}

export const viewUserService = async (id?: string) => {
    if (!id || !isValidUUID(id)) {
        throw new AppError("Invalid user id", 400);
    }
    const { rows } = await fetchUsersWithActivityRepository({ userId: id, limit: 1 });
    const row = rows[0];
    if (!row) {
        throw new AppError("User not found", 404);
    }
    const [profile, plans, workouts, weights, checkins, aiRequests] = await Promise.all([
        fetchUserProfileRepository(id),
        fetchUserPlansRepository(id),
        fetchUserRecentWorkoutsRepository(id),
        fetchUserWeightTrendRepository(id),
        fetchUserCheckinHistoryRepository(id),
        fetchUserAiRequestsRepository(id),
    ]);
    return {
        user: {
            id: row.id,
            name: displayName(row),
            email: row.email,
            phone: fullPhone(row.phone_country_code, row.phone_number),
            timezone: profile?.timezone ?? null,
            weight_units: profile?.weight_units ?? null,
        },
        activity: toActivity(row),
        goal: profile?.weight_goal ? {
            weight_goal: profile.weight_goal,
            preset: profile.weight_goal_preset,
            target_weight: profile.target_weight,
            goal_date: profile.goal_date,
            set_on: profile.goal_set_on,
        } : null,
        plans,
        recent_workouts: workouts,
        weight_trend: weights,
        checkins,
        ai_requests: aiRequests,
    };
}
