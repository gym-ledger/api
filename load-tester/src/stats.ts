// Latency histograms and request counts. Constant memory however long the run, and
// serialisable, so the dashboard can merge any span of minutes into exact percentiles.

/** Log-spaced buckets ~3% wide: bucket i holds latencies up to 1.03^i ms. */
const BASE = Math.log(1.03);
export const bucketOf = (ms: number) => (ms <= 1 ? 0 : Math.ceil(Math.log(ms) / BASE));
export const bucketUpper = (i: number) => Math.exp(i * BASE);

/** Sparse [bucket, count] pairs, sorted by bucket. */
export type HistJson = [number, number][];

export class Histogram {
    private readonly buckets = new Map<number, number>();
    count = 0;
    max = 0;

    add(ms: number): void {
        const i = bucketOf(ms);
        this.buckets.set(i, (this.buckets.get(i) ?? 0) + 1);
        this.count++;
        if (ms > this.max) this.max = ms;
    }

    merge(other: Histogram): void {
        for (const [i, n] of other.buckets) this.buckets.set(i, (this.buckets.get(i) ?? 0) + n);
        this.count += other.count;
        this.max = Math.max(this.max, other.max);
    }

    quantile(q: number): number {
        if (!this.count) return 0;
        const target = Math.ceil(q * this.count);
        let seen = 0;
        for (const i of [...this.buckets.keys()].sort((a, b) => a - b)) {
            seen += this.buckets.get(i)!;
            if (seen >= target) return Math.min(bucketUpper(i), this.max);
        }
        return this.max;
    }

    toJSON(): HistJson {
        return [...this.buckets.entries()].sort((a, b) => a[0] - b[0]);
    }

    static fromJSON(pairs: HistJson | undefined, max = 0): Histogram {
        const h = new Histogram();
        for (const [i, n] of pairs ?? []) {
            h.buckets.set(i, (h.buckets.get(i) ?? 0) + n);
            h.count += n;
        }
        // The exact max when known; otherwise the top bucket's bound.
        const top = pairs?.length ? pairs[pairs.length - 1][0] : 0;
        h.max = max || (h.count ? bucketUpper(top) : 0);
        return h;
    }
}

/**
 * What a response says about the server:
 * ok        2xx/3xx, or a 4xx the simulated client expected (a typo'd password's 401)
 * client    a 4xx nobody expected: the generator's request or the API's contract is off
 * limited   429: a rate limiter said no
 * server    5xx
 * network   connection refused/reset, or no response within the timeout
 */
export type Outcome = "ok" | "client" | "limited" | "server" | "network";

export interface Counts {
    n: number;
    ok: number;
    client: number;
    limited: number;
    server: number;
    network: number;
}

export const emptyCounts = (): Counts => ({ n: 0, ok: 0, client: 0, limited: 0, server: 0, network: 0 });

export function addCounts(into: Counts, from: Counts): void {
    into.n += from.n;
    into.ok += from.ok;
    into.client += from.client;
    into.limited += from.limited;
    into.server += from.server;
    into.network += from.network;
}

export interface EndpointJson {
    h: HistJson;
    max: number;
    c: Counts;
    st: Record<string, number>;
}

export class EndpointStats {
    hist = new Histogram();
    readonly counts = emptyCounts();
    /** Status code (or "timeout"/"network") → count. */
    readonly statuses: Record<string, number> = {};

    static fromJSON(j: EndpointJson): EndpointStats {
        const s = new EndpointStats();
        s.hist = Histogram.fromJSON(j.h, j.max);
        addCounts(s.counts, j.c);
        Object.assign(s.statuses, j.st);
        return s;
    }

    merge(other: EndpointStats): void {
        this.hist.merge(other.hist);
        addCounts(this.counts, other.counts);
        for (const [k, n] of Object.entries(other.statuses)) this.statuses[k] = (this.statuses[k] ?? 0) + n;
    }

    add(ms: number, status: string, outcome: Outcome): void {
        this.hist.add(ms);
        this.counts.n++;
        this.counts[outcome]++;
        this.statuses[status] = (this.statuses[status] ?? 0) + 1;
    }

    toJSON(): EndpointJson {
        return { h: this.hist.toJSON(), max: Math.round(this.hist.max), c: this.counts, st: this.statuses };
    }
}

export type EndpointMap = Map<string, EndpointStats>;

/** Requests of one span: per endpoint, and all of them merged. */
export class Window {
    readonly endpoints: EndpointMap = new Map();
    readonly all = new Histogram();
    readonly counts = emptyCounts();
    readonly startedAt = Date.now();

    add(key: string, ms: number, status: string, outcome: Outcome): void {
        let s = this.endpoints.get(key);
        if (!s) this.endpoints.set(key, (s = new EndpointStats()));
        s.add(ms, status, outcome);
        this.all.add(ms);
        this.counts.n++;
        this.counts[outcome]++;
    }
}

/** What the simulated people did (requests are in the windows). Cumulative; ticks store deltas. */
export const newCounters = () => ({
    visitsStarted: 0,
    visitsFinished: 0,
    visitsFailed: 0,
    /** Arrivals dropped: every user was already in the app, or the concurrency cap was hit. */
    visitsDropped: 0,
    loginsOk: 0,
    loginTypos: 0,
    loginsGivenUp: 0,
    refreshesOk: 0,
    refreshesExpired: 0,
    logouts: 0,
    onboardings: 0,
    plansSelected: 0,
    workoutsStarted: 0,
    workoutsFinished: 0,
    workoutsAbandoned: 0,
    setsLogged: 0,
    setsEdited: 0,
    offlineBatches: 0,
    weighIns: 0,
    goalsSet: 0,
    notificationsRead: 0,
    streamConnects: 0,
    streamDrops: 0,
    streamMessages: 0,
    botAttempts: 0,
    botBlocked: 0,
    /** A bot got a 200: the leaked password matched (it never should for made-up pairs). */
    botSuccesses: 0,
    otpSends: 0,
});
export type Counters = ReturnType<typeof newCounters>;

export function diffCounters(now: Counters, before: Counters): Partial<Counters> {
    const out: Partial<Counters> = {};
    for (const k of Object.keys(now) as (keyof Counters)[]) {
        const d = now[k] - before[k];
        if (d) out[k] = d;
    }
    return out;
}

/** Rounded latency summary of a histogram. */
export const latency = (h: Histogram) => ({
    p50: Math.round(h.quantile(0.5)),
    p95: Math.round(h.quantile(0.95)),
    p99: Math.round(h.quantile(0.99)),
    max: Math.round(h.max),
});

/** Server-side failure share: 5xx and network errors over all requests. */
export const errorRate = (c: Counts) => (c.n ? (c.server + c.network) / c.n : 0);
