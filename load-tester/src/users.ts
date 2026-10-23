// The simulated people: the seeded accounts, each with a stable IP, an activity level (a few
// regulars, many occasional users) and what their browser remembers between visits: the
// refresh cookie, the access token, their plan.
import type { AuthConfig, Profile, SessionTokens } from "./api.js";
import type { Config } from "./config.js";
import { type Caller, request, type RequestOptions, type Res } from "./http.js";
import { chance, counters, event, inRange, pick, think, warnOnce } from "./runtime.js";

export const LOAD_TEST_EMAIL_DOMAIN = "loadtest.invalid";
export const emailOf = (n: number) => `lt-${String(n).padStart(6, "0")}@${LOAD_TEST_EMAIL_DOMAIN}`;

/** Deterministic per-user randomness (mulberry32), so a resumed run has the same people. */
function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const REFRESH_MARGIN_MS = 60_000;

export interface Assignment {
    id: string;
    versionId: string;
    currentDayId: string | null;
}

export class VirtualUser {
    readonly email: string;
    readonly caller: Caller;
    /** Relative chance of being the one who opens the app next. */
    readonly weight: number;
    /** Opted into AI check-ins (only when paid.aiCheckinsShare allows it). */
    readonly wantsAi: boolean;
    /** Body weight in kg this person hovers around. */
    readonly bodyWeight: number;
    busy = false;
    accessExpiresAt = 0;
    profile: Profile | null = null;
    assignment: Assignment | null = null;

    constructor(readonly n: number, ip: string, c: Config) {
        const rnd = seeded(n * 7919);
        this.email = emailOf(n);
        this.caller = { ip };
        // Log-normal activity: skew 0 = everyone alike, ~1 = a long tail of light users.
        const u1 = 1 - rnd();
        const u2 = rnd();
        const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        this.weight = Math.exp(c.population.activitySkew * g);
        this.wantsAi = rnd() < c.paid.aiCheckinsShare;
        this.bodyWeight = Math.round((52 + rnd() * 48) * 10) / 10;
    }

    get hasValidAccess(): boolean {
        return !!this.caller.access && Date.now() < this.accessExpiresAt - REFRESH_MARGIN_MS;
    }

    /** A new device / cleared browser: the old server session lingers until it expires. */
    forgetDevice(): void {
        this.caller.access = undefined;
        this.caller.refresh = undefined;
        this.accessExpiresAt = 0;
        this.profile = null;
    }

    setTokens(data: SessionTokens | undefined): void {
        this.caller.access = data?.accessToken;
        const at = data?.accessTokenExpiresAt ? Date.parse(data.accessTokenExpiresAt) : NaN;
        this.accessExpiresAt = Number.isFinite(at) ? at : Date.now() + 14 * 60_000;
        if (data?.user) this.profile = data.user;
    }
}

export class Population {
    readonly users: VirtualUser[];
    private readonly cumulative: number[];
    private readonly total: number;
    idle: number;

    constructor(c: Config) {
        const rnd = seeded(c.users.first * 31 + c.users.count);
        const { count, first } = c.users;
        const shared = Math.round(count * c.population.sharedIpShare);
        this.users = [];
        for (let i = 0; i < count; i++) {
            const n = first + i;
            // Shared IPs (gym Wi-Fi, carrier NAT) from 100.64/10; everyone else their own in 10/8.
            const ip = i < shared
                ? `100.64.${Math.floor(i / c.population.sharedIpGroupSize) >> 8 & 255}.${Math.floor(i / c.population.sharedIpGroupSize) & 255}`
                : `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
            this.users.push(new VirtualUser(n, ip, c));
        }
        // Shuffle which users share an IP, so it isn't always the lowest numbers.
        for (let i = this.users.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const a = this.users[i].caller.ip;
            this.users[i].caller.ip = this.users[j].caller.ip;
            this.users[j].caller.ip = a;
        }
        let sum = 0;
        this.cumulative = this.users.map((u) => (sum += u.weight));
        this.total = sum;
        this.idle = count;
    }

    /** An idle user, picked by activity weight; null when (nearly) everyone is in the app. */
    take(): VirtualUser | null {
        if (this.idle <= 0) return null;
        for (let attempt = 0; attempt < 30; attempt++) {
            const r = Math.random() * this.total;
            let lo = 0;
            let hi = this.cumulative.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (this.cumulative[mid] < r) lo = mid + 1;
                else hi = mid;
            }
            const u = this.users[lo];
            if (!u.busy) return this.claim(u);
        }
        // Almost everyone is busy: take any idle one.
        const u = this.users.find((x) => !x.busy);
        return u ? this.claim(u) : null;
    }

    private claim(u: VirtualUser): VirtualUser {
        u.busy = true;
        this.idle--;
        return u;
    }

    release(u: VirtualUser): void {
        if (!u.busy) return;
        u.busy = false;
        this.idle++;
    }

    /**
     * What the browsers remember (refresh cookies), so a restarted soak run doesn't turn every
     * returning user into a fresh login.
     */
    devices(): Record<number, string> {
        const out: Record<number, string> = {};
        for (const u of this.users) if (u.caller.refresh) out[u.n] = u.caller.refresh;
        return out;
    }

    restoreDevices(saved: Record<number, string> | null): number {
        let n = 0;
        for (const u of this.users) {
            const refresh = saved?.[u.n];
            if (refresh) {
                u.caller.refresh = refresh;
                n++;
            }
        }
        return n;
    }
}

// ── Signing in ───────────────────────────────────────────────────────────────────────────

/** Settings the auth flows need (from the config and the environment). */
export interface AuthSettings {
    password: string;
    typoRate: number;
    repeatTypoRate: number;
    maxAttempts: number;
    rememberedDeviceShare: number;
    otpSends: boolean;
}

/** A plausible wrong password: a typo, caps lock, or the old one. */
function mistype(pw: string): string {
    switch (Math.floor(Math.random() * 4)) {
        case 0: { // one character swapped for its neighbour on the keyboard
            const i = Math.floor(Math.random() * pw.length);
            return pw.slice(0, i) + String.fromCharCode(pw.charCodeAt(i) + 1) + pw.slice(i + 1);
        }
        case 1: // caps lock
            return pw.replace(/[a-z]/gi, (ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()));
        case 2: // a character missing
            return pw.slice(0, -1);
        default: // last year's password
            return `${pw.slice(0, -2)}${Math.floor(Math.random() * 90 + 10)}`;
    }
}

export class Auth {
    constructor(private readonly s: AuthSettings) {}

    /**
     * Makes sure the user has a working session at the start of a visit, the way the web app
     * does on open: a remembered device refreshes its token; otherwise the login page.
     */
    async open(u: VirtualUser): Promise<boolean> {
        if (!chance(this.s.rememberedDeviceShare)) u.forgetDevice();
        if (u.hasValidAccess) return true;
        if (u.caller.refresh && await this.refresh(u)) return true;
        return this.login(u);
    }

    async refresh(u: VirtualUser): Promise<boolean> {
        const r = await request<SessionTokens>(u.caller, "PUT /auth/refresh-tokens", "PUT", "/auth/refresh-tokens", { expect: [401] });
        if (r.status === 200) {
            counters.refreshesOk++;
            u.setTokens(r.data);
            return true;
        }
        if (r.status === 401) {
            counters.refreshesExpired++;
            u.forgetDevice();
        }
        return false;
    }

    /** The login page: typed password, with the typos real people make. */
    async login(u: VirtualUser): Promise<boolean> {
        await request(u.caller, "GET /auth/config", "GET", "/auth/config");
        await think([3, 9]);
        for (let attempt = 1; attempt <= this.s.maxAttempts; attempt++) {
            const typo = chance(attempt === 1 ? this.s.typoRate : this.s.repeatTypoRate);
            const r = await request<SessionTokens>(u.caller, "POST /auth/login/password", "POST", "/auth/login/password", {
                body: { method: "email", email: u.email, password: typo ? mistype(this.s.password) : this.s.password },
                expect: typo ? [401] : [],
            });
            if (r.status === 200 && !typo) {
                counters.loginsOk++;
                u.setTokens(r.data);
                return true;
            }
            if (r.status === 200 && typo) {
                // A mistyped password that worked: the seeded password must be the typo itself.
                warnOnce("typo-200", "setup", "a deliberately wrong password logged in; is LOAD_USER_PASSWORD unusual?");
                counters.loginsOk++;
                u.setTokens(r.data);
                return true;
            }
            if (r.status === 401 && typo) {
                counters.loginTypos++;
                await think([3, 12]);
                continue;
            }
            if (r.status === 401) {
                warnOnce("login-401", "setup", `${u.email}: the correct password was refused. Was seed-load-users run with the same LOAD_USER_PASSWORD, and are there ${u.n} accounts?`);
            }
            // 429 (this IP is out of attempts), 5xx, network: the person gives up for now.
            return false;
        }
        counters.loginsGivenUp++;
        if (this.s.otpSends) await this.forgotPassword(u);
        return false;
    }

    /**
     * "Forgot password?" → a code is sent. The simulated person never reads it, so it ends
     * there. Only against an API without CAPTCHA (CAPTCHA_PROVIDER=none): solving ALTCHA's
     * proof-of-work here would mostly load the generator.
     */
    private async forgotPassword(u: VirtualUser): Promise<void> {
        await think([2, 6]);
        const config = await request<AuthConfig>(u.caller, "GET /auth/config", "GET", "/auth/config");
        if (config.data?.captcha) {
            warnOnce("otp-captcha", "setup", "paid.otpSends is on, but this API asks for a CAPTCHA before sending a code: forgot-password is skipped");
            return;
        }
        const r = await request(u.caller, "POST /auth/forgot-password/send-otp", "POST", "/auth/forgot-password/send-otp", {
            body: { method: "email", email: u.email },
        });
        if (r.status === 200) counters.otpSends++;
    }

    async logout(u: VirtualUser): Promise<void> {
        await request(u.caller, "DELETE /auth/logout", "DELETE", "/auth/logout");
        counters.logouts++;
        u.forgetDevice();
    }
}

/** An authenticated request; on 401 it refreshes once (or signs in again) and retries. */
export async function authed<T = unknown>(auth: Auth, u: VirtualUser, key: string, method: string, path: string, o: Omit<RequestOptions, "auth"> = {}): Promise<Res<T>> {
    if (!u.hasValidAccess && u.caller.refresh) await auth.refresh(u);
    const r = await request<T>(u.caller, key, method, path, { ...o, auth: true, expect: [...(o.expect ?? []), 401] });
    if (r.status !== 401) return r;
    if (!(await auth.refresh(u)) && !(await auth.login(u))) return r;
    return request<T>(u.caller, key, method, path, { ...o, auth: true });
}

/** A random existing account's email (for bots that got hold of a real address). */
export const someEmail = (c: Config) => emailOf(c.users.first + Math.floor(Math.random() * c.users.count));

/** A made-up email a credential list might hold. */
export function leakedEmail(): string {
    const names = ["rahul", "priya", "amit", "sneha", "john", "maria", "alex", "sam", "neha", "vikram", "fit", "gym"];
    const domains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "rediffmail.com", "icloud.com"];
    return `${pick(names)}${pick([".", "_", ""])}${pick(names)}${Math.floor(inRange([1, 9999]))}@${pick(domains)}`;
}

export function reportSetupProblem(message: string): void {
    event("error", "setup", message);
}
