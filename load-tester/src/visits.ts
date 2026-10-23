// One app open by one person, screen by screen, with the requests the web app makes on each
// screen (gym-app-nextjs) and human pauses in between. Every visit starts on Home with the
// notification stream open; what follows depends on why they opened the app.
import { randomUUID } from "node:crypto";
import type { Config, VisitKind } from "./config.js";
import { openStream } from "./http.js";
import {
    between, chance, counters, gauges, inRange, intIn, pick, sleep, stop, stopping, think, warnOnce,
} from "./runtime.js";
import { type Auth, authed, type VirtualUser } from "./users.js";

const ACCOUNT_SETTINGS = {
    training_goal: ["build_muscle", "get_stronger", "lose_fat", "general_fitness"],
    experience_level: ["beginner", "intermediate", "advanced"],
    equipment: ["full_gym", "home_dumbbells", "bodyweight"],
};

/** Whatever list a response holds: a bare array or a `{ data: [...] }` page. */
const list = (x: any): any[] => (Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : []);

export class Visits {
    private readonly dateFmt: Intl.DateTimeFormat;

    constructor(private readonly c: Config, private readonly auth: Auth) {
        this.dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: c.population.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    }

    private today(offsetDays = 0): string {
        return this.dateFmt.format(Date.now() + offsetDays * 86_400_000);
    }

    private get = (u: VirtualUser, key: string, path: string) => authed(this.auth, u, key, "GET", path);
    private send = (u: VirtualUser, key: string, method: string, path: string, body?: unknown, expect?: number[]) =>
        authed(this.auth, u, key, method, path, { body, expect });

    private screen = () => think(this.c.behaviour.thinkSeconds);

    /** A whole visit. Returns false when it couldn't get past signing in. */
    async run(u: VirtualUser, kind: VisitKind): Promise<boolean> {
        if (!(await this.auth.open(u))) return false;
        const closed = new AbortController();
        const onStop = () => closed.abort();
        stop.signal.addEventListener("abort", onStop, { once: true });
        try {
            if (!(await this.gate(u))) return false;
            if (this.c.behaviour.notificationStream) this.holdStream(u, closed.signal);
            await this.home(u);
            switch (kind) {
                case "workout": await this.workout(u); break;
                case "quickCheck": await this.quickCheck(u); break;
                case "weighIn": await this.weighIn(u); break;
                case "progress": await this.progress(u); break;
                case "explore": await this.explore(u); break;
                case "settings": await this.settings(u); break;
            }
            if (chance(this.c.logins.logoutShare) && !stopping()) await this.auth.logout(u);
            return true;
        } finally {
            closed.abort();
            stop.signal.removeEventListener("abort", onStop);
        }
    }

    /** Signs in once, through privacy, onboarding and a plan, and out again (`prepare`). */
    async prepare(u: VirtualUser): Promise<boolean> {
        if (!(await this.auth.login(u))) return false;
        try {
            if (!(await this.gate(u))) return false;
            if (!u.assignment) {
                const active = list((await this.get(u, "GET /user/workout/assignments/active", "/user/workout/assignments/active")).data);
                if (!active.length) {
                    const pub = list((await this.get(u, "GET /user/workout/plans/public", "/user/workout/plans/public")).data);
                    if (pub.length) await this.selectPlan(u, pick(pub).workout_program_id);
                }
            }
            return true;
        } finally {
            await this.auth.logout(u);
        }
    }

    // ── The app shell ────────────────────────────────────────────────────────────────────

    /**
     * What the layout does before Home: learns who the user is (a refreshed session has no
     * user object), then the privacy and onboarding gates, and AI check-ins kept the way the
     * config wants them (no Groq calls unless paid.aiCheckinsShare).
     */
    private async gate(u: VirtualUser): Promise<boolean> {
        if (!u.profile) {
            const r = await this.get(u, "GET /user/profile", "/user/profile");
            if (r.status !== 200) return false;
            u.profile = r.data;
        }
        const p = u.profile;
        if (p.privacy_policy_accepted === false && p.current_privacy_policy_version) {
            await this.screen();
            const r = await this.send(u, "POST /user/profile/privacy-policy/accept", "POST", "/user/profile/privacy-policy/accept",
                { version: p.current_privacy_policy_version });
            if (r.status === 200) u.profile = { ...p, ...r.data };
        }
        if (!u.profile.onboarded_at) await this.onboard(u);
        if (!!u.profile.ai_checkins_enabled !== u.wantsAi) {
            const r = await this.send(u, "PUT /user/profile/ai-checkins", "PUT", "/user/profile/ai-checkins",
                u.wantsAi ? { enabled: true, consent: true } : { enabled: false });
            if (r.status === 200) u.profile = { ...u.profile, ai_checkins_enabled: u.wantsAi };
        }
        return true;
    }

    /** The onboarding wizard: preferences, a few answers, then a plan. */
    private async onboard(u: VirtualUser): Promise<void> {
        const [, plans] = await Promise.all([
            this.get(u, "GET /user/profile/preferences", "/user/profile/preferences"),
            this.get(u, "GET /user/workout/plans/public", "/user/workout/plans/public"),
        ]);
        await think([20, 60]);
        const r = await this.send(u, "PUT /user/profile/onboarding", "PUT", "/user/profile/onboarding", {
            timezone: this.c.population.timezone,
            weight_units: "kg",
            height_units: "cm",
            height: Math.round(between(150, 192)),
            training_goal: pick(ACCOUNT_SETTINGS.training_goal),
            experience_level: pick(ACCOUNT_SETTINGS.experience_level),
            training_days_per_week: Math.round(between(2, 6)),
            equipment: pick(ACCOUNT_SETTINGS.equipment),
        });
        if (r.status !== 200) return;
        counters.onboardings++;
        u.profile = { ...u.profile, ...(r.data?.user ?? {}), onboarded_at: r.data?.user?.onboarded_at ?? new Date().toISOString() };
        const options = list(plans.data);
        if (options.length) {
            await think([5, 20]);
            await this.selectPlan(u, pick(options).workout_program_id);
        }
    }

    private async selectPlan(u: VirtualUser, programId: string): Promise<void> {
        const r = await this.send(u, "POST /user/workout/plans/select", "POST", "/user/workout/plans/select", { workout_program_id: programId });
        if (r.status === 200 || r.status === 201) {
            counters.plansSelected++;
            u.assignment = null; // re-read with its days on the next visit
        }
    }

    /** The notification stream, held for the whole visit and reconnected like the app does. */
    private holdStream(u: VirtualUser, signal: AbortSignal): void {
        void (async () => {
            let backoff = 2;
            while (!signal.aborted) {
                if (!u.hasValidAccess && u.caller.refresh) await this.auth.refresh(u);
                counters.streamConnects++;
                const end = await openStream(u.caller, "GET /user/notifications/stream (SSE)", "/user/notifications/stream", signal,
                    () => counters.streamMessages++);
                if (end === "aborted" || signal.aborted) return;
                counters.streamDrops++;
                if (end === 401) {
                    await this.auth.refresh(u);
                    backoff = 2;
                } else if (end === "closed") {
                    backoff = 2; // the server ended it (deploy, token expiry): reconnect soon
                } else {
                    backoff = Math.min(backoff * 2, 60);
                }
                await Promise.race([sleep(inRange([backoff * 0.75, backoff * 1.25]) * 1000), new Promise((r) => signal.addEventListener("abort", r, { once: true }))]);
            }
        })();
    }

    /** Home: everything its cards load at once, as the browser fires them in parallel. */
    private async home(u: VirtualUser): Promise<void> {
        const [active] = await Promise.all([
            this.get(u, "GET /user/workout/assignments/active", "/user/workout/assignments/active"),
            this.get(u, "GET /user/workout/stats/dashboard", "/user/workout/stats/dashboard"),
            this.get(u, "GET /user/notifications/unread-count", "/user/notifications/unread-count"),
            this.get(u, "GET /user/workout/stats/progress-overview", "/user/workout/stats/progress-overview"),
            this.get(u, "GET /user/workout/stats/recent-prs", "/user/workout/stats/recent-prs?limit=3"),
            this.get(u, "GET /user/workout/alarms/active", "/user/workout/alarms/active"),
            this.get(u, "GET /user/checkins/weekly", "/user/checkins/weekly"),
            this.get(u, "GET /user/workout/sessions", "/user/workout/sessions?limit=10"),
            this.get(u, "GET /user/weight/view", `/user/weight/view?date=${this.today()}`),
        ]);
        // Today's card: the plan's current day, its sessions and their exercises.
        const plan = list(active.data)[0];
        if (plan) {
            u.assignment = { id: plan.id, versionId: plan.workout_program_version_id, currentDayId: plan.current_program_day_id ?? null };
            const day = await this.planDay(u);
            if (day) {
                const sessions = await this.get(u, "GET /user/workout/assignments/:id/days/:id/sessions", `/user/workout/assignments/${plan.id}/days/${day}/sessions`);
                await Promise.all(list(sessions.data).map((s) =>
                    this.get(u, "GET /user/workout/assignments/:id/days/:id/sessions/:id/exercises", `/user/workout/assignments/${plan.id}/days/${day}/sessions/${s.id}/exercises`)));
            }
        } else {
            u.assignment = null;
        }
        await this.screen();
    }

    /** The plan day the app shows as today's. */
    private async planDay(u: VirtualUser): Promise<string | null> {
        const a = u.assignment;
        if (!a) return null;
        const days = list((await this.get(u, "GET /user/workout/assignments/:id/days", `/user/workout/assignments/${a.id}/days`)).data);
        return a.currentDayId && days.some((d) => d.id === a.currentDayId) ? a.currentDayId : days[0]?.id ?? null;
    }

    // ── Visits ───────────────────────────────────────────────────────────────────────────

    private async quickCheck(u: VirtualUser): Promise<void> {
        if (chance(0.45)) {
            const r = await this.get(u, "GET /user/notifications", "/user/notifications");
            await this.screen();
            const unread = list(r.data?.notifications ?? r.data).filter((n) => !n.read_at);
            if (unread.length && chance(0.5)) {
                if (chance(0.6)) await this.send(u, "POST /user/notifications/read-all", "POST", "/user/notifications/read-all");
                else await this.send(u, "POST /user/notifications/:id/read", "POST", `/user/notifications/${unread[0].id}/read`);
                counters.notificationsRead++;
            }
        }
        if (chance(0.3)) {
            await this.get(u, "GET /user/workout/sessions", "/user/workout/sessions?page=1&limit=20");
            await this.screen();
        }
    }

    private async weighIn(u: VirtualUser): Promise<void> {
        const today = this.today();
        const view = await this.get(u, "GET /user/weight/view", `/user/weight/view?date=${today}`);
        await think([5, 20]);
        const weight = Math.round((u.bodyWeight + between(-1.2, 1.2)) * 10) / 10;
        const existing = list(view.data?.weight_entries).find((e) => e.day === today);
        const r = existing
            ? await this.send(u, "PUT /user/weight/entry/:id", "PUT", `/user/weight/entry/${existing.id}`, { weight })
            : await this.send(u, "POST /user/weight/entry", "POST", "/user/weight/entry", { weight, date: today });
        if (r.status === 200 || r.status === 201) counters.weighIns++;
        // The Body tab: the chart over a month or a few, in 30-day windows.
        await this.screen();
        for (let back = 0; back < intIn([1, 3]); back++) {
            await this.get(u, "GET /user/weight/view", `/user/weight/view?date=${this.today(-30 * back)}`);
        }
        if (chance(0.2)) {
            const goal = await this.get(u, "GET /user/profile/goal", "/user/profile/goal");
            await this.screen();
            if (!goal.data && chance(0.4)) {
                const target = Math.round((u.bodyWeight - between(2, 8)) * 10) / 10;
                await this.get(u, "GET /user/profile/goal/suggestion", `/user/profile/goal/suggestion?target_weight=${target}`);
                await this.screen();
                const r2 = await this.send(u, "PUT /user/profile/goal", "PUT", "/user/profile/goal", { goal: "lose", target_weight: target });
                if (r2.status === 200) counters.goalsSet++;
            } else if (chance(0.3)) {
                await this.get(u, "GET /user/profile/goal/history", "/user/profile/goal/history");
            }
        }
    }

    private async progress(u: VirtualUser): Promise<void> {
        const [prs] = await Promise.all([
            this.get(u, "GET /user/workout/stats/recent-prs", "/user/workout/stats/recent-prs?limit=300"),
            this.get(u, "GET /user/muscle-signals", "/user/muscle-signals"),
            this.get(u, "GET /user/workout/stats/progress-overview", "/user/workout/stats/progress-overview"),
        ]);
        await this.screen();
        for (const pr of list(prs.data).sort(() => Math.random() - 0.5).slice(0, intIn([0, 3]))) {
            await this.get(u, "GET /user/workout/exercises/:id/history", `/user/workout/exercises/${pr.exercise_id}/history?limit=12`);
            await this.screen();
        }
        if (chance(0.5)) {
            const page = await this.get(u, "GET /user/workout/sessions", "/user/workout/sessions?page=1&limit=20");
            await this.screen();
            const s = list(page.data)[Math.floor(Math.random() * 3)];
            if (s) {
                await Promise.all([
                    this.get(u, "GET /user/workout/sessions/:id/detail", `/user/workout/sessions/${s.id}/detail`),
                    this.get(u, "GET /user/workout/sessions/:id/sets", `/user/workout/sessions/${s.id}/sets`),
                ]);
                await this.screen();
            }
            if (chance(0.25)) await this.get(u, "GET /user/workout/sessions", "/user/workout/sessions?page=2&limit=20");
        }
    }

    private async explore(u: VirtualUser): Promise<void> {
        if (chance(0.5)) {
            // The Workout tab: plans.
            const [, pub] = await Promise.all([
                this.get(u, "GET /user/workout/plans/mine", "/user/workout/plans/mine"),
                this.get(u, "GET /user/workout/plans/public", "/user/workout/plans/public"),
            ]);
            await this.screen();
            const plan = pick(list(pub.data));
            if (plan) {
                await this.get(u, "GET /user/workout/plans/:id/detail", `/user/workout/plans/${plan.workout_program_version_id}/detail`);
                await this.screen();
                if (chance(0.08)) await this.selectPlan(u, plan.workout_program_id);
            }
        } else {
            // The exercise library.
            const muscles = chance(0.3) ? await this.get(u, "GET /user/exercises/muscles", "/user/exercises/muscles") : null;
            const region = muscles && list(muscles.data)[0]?.body_region;
            const page = await this.get(u, "GET /user/exercises", `/user/exercises?page=1&limit=30${region ? `&bodyRegion=${encodeURIComponent(region)}` : ""}`);
            await this.screen();
            if (chance(0.3)) await this.get(u, "GET /user/exercises", "/user/exercises?page=2&limit=30");
            const ex = pick(list(page.data));
            if (ex) {
                await Promise.all([
                    this.get(u, "GET /user/exercises/:id", `/user/exercises/${ex.id}`),
                    this.get(u, "GET /user/workout/exercises/:id/history", `/user/workout/exercises/${ex.id}/history?limit=5`),
                ]);
                await this.screen();
            }
        }
    }

    private async settings(u: VirtualUser): Promise<void> {
        await Promise.all([
            this.get(u, "GET /user/profile/preferences", "/user/profile/preferences"),
            this.get(u, "GET /user/profile", "/user/profile"),
            this.get(u, "GET /user/profile/goal", "/user/profile/goal"),
        ]);
        await this.screen();
        if (chance(0.3)) {
            await this.send(u, "PUT /user/profile/preferences", "PUT", "/user/profile/preferences", { training_days_per_week: Math.round(between(2, 6)) });
        } else if (chance(0.2)) {
            await this.get(u, "GET /user/account", "/user/account");
        }
        await this.screen();
    }

    // ── A workout ────────────────────────────────────────────────────────────────────────

    /**
     * The active-workout screen: today's plan session, exercise by exercise, a set at a time
     * with rest in between. Sets go to /sets/batch as the app's sync queue sends them: one at a
     * time online, all at once when the gym's signal comes back.
     */
    private async workout(u: VirtualUser): Promise<void> {
        const w = this.c.behaviour.workout;
        const [active, ongoing] = await Promise.all([
            this.get(u, "GET /user/workout/assignments/active", "/user/workout/assignments/active"),
            this.get(u, "GET /user/workout/sessions/ongoing", "/user/workout/sessions/ongoing"),
        ]);
        let plan = list(active.data)[0];
        if (!plan) {
            // No plan yet: pick one first, as the Workout tab would make them.
            const r = await this.get(u, "GET /user/workout/plans/public", "/user/workout/plans/public");
            const pub = list(r.data);
            if (!pub.length) {
                if (r.status === 200) warnOnce("no-plans", "setup", "no public workout plans: workouts can't be simulated (publish system plans in the admin panel)");
                return;
            }
            await this.screen();
            await this.selectPlan(u, pick(pub).workout_program_id);
            plan = list((await this.get(u, "GET /user/workout/assignments/active", "/user/workout/assignments/active")).data)[0];
            if (!plan) return;
        }
        u.assignment = { id: plan.id, versionId: plan.workout_program_version_id, currentDayId: plan.current_program_day_id ?? null };

        // Resume a workout left open, or start today's.
        let sessionId: string;
        let dayId: string | null;
        let daySessionId: string | null;
        const open = ongoing.data;
        let started = false;
        if (open?.session_id && open.assignment_id === plan.id) {
            sessionId = open.session_id;
            dayId = open.program_day_id;
            daySessionId = open.program_day_session_id;
            await this.get(u, "GET /user/workout/sessions/:id/sets", `/user/workout/sessions/${sessionId}/sets`);
            started = true;
        } else {
            dayId = await this.planDay(u);
            if (!dayId) return;
            const sessions = list((await this.get(u, "GET /user/workout/assignments/:id/days/:id/sessions", `/user/workout/assignments/${plan.id}/days/${dayId}/sessions`)).data);
            daySessionId = sessions[0]?.id ?? null;
            sessionId = randomUUID(); // a draft: created with this id when the first set syncs
        }
        if (!dayId || !daySessionId) return;
        const exercises = list((await this.get(u, "GET /user/workout/assignments/:id/days/:id/sessions/:id/exercises",
            `/user/workout/assignments/${plan.id}/days/${dayId}/sessions/${daySessionId}/exercises`)).data);
        if (!exercises.length) return;
        await this.screen();

        const offline = chance(w.offlineShare);
        const abandonAt = chance(w.abandonShare) ? Math.random() : Infinity;
        const queue: any[] = [];
        const logged: string[] = [];
        let flushes = 0;

        const ensureStarted = async (): Promise<boolean> => {
            if (started) return true;
            const r = await this.send(u, "POST /user/workout/sessions/start", "POST", "/user/workout/sessions/start", {
                assignment_id: plan.id,
                program_day_id: dayId,
                program_day_session_id: daySessionId,
                id: sessionId,
                started_at: new Date().toISOString(),
            });
            if (r.status !== 200 && r.status !== 201) return false;
            sessionId = r.data?.id ?? sessionId;
            started = true;
            counters.workoutsStarted++;
            return true;
        };
        const flush = async (): Promise<void> => {
            if (!queue.length || !(await ensureStarted())) return;
            const batch = queue.splice(0, 100).map((s) => ({ ...s, workout_session_id: sessionId }));
            const r = await this.send(u, "POST /user/workout/sets/batch", "POST", "/user/workout/sets/batch", { sets: batch });
            if (r.status !== 200 && r.status !== 201) {
                queue.unshift(...batch); // retried on the next flush, like the app's queue
                return;
            }
            if (batch.length > 1) counters.offlineBatches++;
            for (const item of list(r.data?.results)) {
                if (item.set?.id) {
                    logged.push(item.set.id);
                    counters.setsLogged++;
                }
            }
            flushes++;
        };

        const count = Math.min(exercises.length, intIn(w.exercises));
        const plannedSets = exercises.slice(0, count).reduce((s, e) => s + (e.target_sets ?? 3), 0);
        let done = 0;
        for (let i = 0; i < count && !stopping(); i++) {
            const pe = exercises[i];
            // Opening the exercise card shows its last sessions.
            if (pe.exercise?.id) await this.get(u, "GET /user/workout/exercises/:id/history", `/user/workout/exercises/${pe.exercise.id}/history?limit=5`);
            const baseWeight = Math.round(between(5, 80) / 2.5) * 2.5;
            const sets = pe.target_sets ? Math.max(1, Math.min(8, pe.target_sets)) : intIn(w.setsPerExercise);
            for (let s = 0; s < sets && !stopping(); s++) {
                await sleep(inRange(w.setSeconds) * 1000);
                const warmup = s === 0 && chance(w.warmupShare);
                queue.push({
                    client_id: randomUUID(),
                    workout_program_exercise_id: pe.id,
                    weight: warmup ? baseWeight / 2 : baseWeight,
                    reps: Math.round(between(pe.min_reps ?? 6, (pe.max_reps ?? 12) + 1)),
                    rir: Math.round(between(0, 3)),
                    is_warmup: warmup,
                    ...(s === sets - 1 && chance(w.dropSetShare)
                        ? { drop_sets: [{ weight: baseWeight * 0.7, reps: Math.round(between(6, 12)) }] }
                        : {}),
                });
                if (!offline) await flush();
                if (logged.length && chance(w.editSetShare)) {
                    await think([3, 10]);
                    await this.send(u, "PUT /user/workout/sets/:id", "PUT", `/user/workout/sets/${logged[logged.length - 1]}`, { reps: Math.round(between(5, 12)) });
                    counters.setsEdited++;
                }
                done++;
                if (done / plannedSets >= abandonAt) {
                    if (offline) await flush();
                    if (started) counters.workoutsAbandoned++;
                    return; // the app is closed; the workout stays open server-side
                }
                await sleep(inRange(w.restSeconds) * 1000);
            }
            if (chance(w.adhocExerciseShare) && started) {
                const lib = await this.get(u, "GET /user/exercises", "/user/exercises?page=1&limit=30");
                const ex = pick(list(lib.data));
                if (ex) {
                    await this.screen();
                    await this.send(u, "POST /user/workout/sessions/:id/adhoc-exercise", "POST", `/user/workout/sessions/${sessionId}/adhoc-exercise`,
                        { exercise_id: ex.id, scope: "session" });
                }
            }
        }
        if (stopping()) return;
        // Signal back (offline workouts sync everything now), then Finish and the summary.
        while (queue.length && flushes < 1000) {
            const before = queue.length;
            await flush();
            if (queue.length === before) break;
        }
        if (!started) return;
        await this.screen();
        const fin = await this.send(u, "POST /user/workout/sessions/:id/finish", "POST", `/user/workout/sessions/${sessionId}/finish`);
        if (fin.status === 200 || fin.status === 201) {
            counters.workoutsFinished++;
            await Promise.all([
                this.get(u, "GET /user/workout/sessions/:id/detail", `/user/workout/sessions/${sessionId}/detail`),
                this.get(u, "GET /user/workout/stats/recent-prs", "/user/workout/stats/recent-prs?limit=3"),
            ]);
            await this.screen();
        }
    }
}

/** Counts a visit of `kind` as in the app while `task` runs. */
export async function asVisit(kind: VisitKind, task: () => Promise<boolean>): Promise<boolean> {
    gauges.visits[kind]++;
    try {
        return await task();
    } finally {
        gauges.visits[kind]--;
    }
}
