// State every simulated client shares: the stop signal, randomness, live gauges, counters,
// and the sinks requests and events are reported to (the recorder plugs into them).
import { setTimeout as sleepFor } from "node:timers/promises";
import type { Range, VisitKind } from "./config.js";
import { newCounters, type Outcome } from "./stats.js";

// ── Stopping and waiting ─────────────────────────────────────────────────────────────────

export const stop = new AbortController();
export const stopping = () => stop.signal.aborted;

/** Resolves after `ms`, or as soon as the run stops. */
export async function sleep(ms: number): Promise<void> {
    if (stopping() || ms <= 0) return;
    try {
        await sleepFor(ms, undefined, { signal: stop.signal });
    } catch {
        // Stopped.
    }
}

// ── Randomness ───────────────────────────────────────────────────────────────────────────

export const between = (min: number, max: number) => min + Math.random() * (max - min);
export const inRange = ([min, max]: Range) => between(min, max);
export const intIn = ([min, max]: Range) => Math.floor(between(Math.ceil(min), Math.floor(max) + 1));
export const chance = (p: number) => Math.random() < p;
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Picks a key by weight. */
export function weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of entries) {
        if ((r -= w) < 0) return k;
    }
    return entries[entries.length - 1][0];
}

/** Scales every human pause (0 = none: `prepare` onboards users as fast as the API allows). */
export const pace = { scale: 1 };

/** Waits a random time in `range` seconds. */
export const think = (range: Range) => sleep(inRange(range) * 1000 * pace.scale);

// ── Live state ───────────────────────────────────────────────────────────────────────────

export const gauges = {
    inFlight: 0,
    streamsOpen: 0,
    visits: { workout: 0, quickCheck: 0, weighIn: 0, progress: 0, explore: 0, settings: 0 } as Record<VisitKind, number>,
};
export const activeVisits = () => Object.values(gauges.visits).reduce((a, b) => a + b, 0);

export const counters = newCounters();

// ── Sinks ────────────────────────────────────────────────────────────────────────────────

type RequestSink = (key: string, ms: number, status: string, outcome: Outcome) => void;
type EventSink = (e: RunEvent) => void;

export interface RunEvent {
    t: number;
    level: "info" | "warn" | "error";
    kind: string;
    message: string;
    data?: unknown;
}

let requestSink: RequestSink = () => {};
let eventSink: EventSink = (e) => console.log(`[${e.level}] ${e.message}`);

export function setSinks(r: RequestSink, e: EventSink): void {
    requestSink = r;
    eventSink = e;
}

export const recordRequest: RequestSink = (...args) => requestSink(...args);

export function event(level: RunEvent["level"], kind: string, message: string, data?: unknown): void {
    eventSink({ t: Date.now(), level, kind, message, data });
}

// Each distinct problem is reported a few times, then counted quietly: a broken endpoint hit
// 50,000 times a day mustn't fill the disk.
const seen = new Map<string, number>();
const REPEATS = 3;
export function warnOnce(key: string, kind: string, message: string, data?: unknown): void {
    const n = (seen.get(key) ?? 0) + 1;
    if (seen.size > 2000) seen.clear();
    seen.set(key, n);
    if (n <= REPEATS) event("warn", kind, n === REPEATS ? `${message} (further repeats not logged)` : message, data);
}
/** Lets problems that went quiet be reported again (each new day of a long run). */
export const resetWarnings = () => seen.clear();

// ── Background tasks ─────────────────────────────────────────────────────────────────────

/** Client tasks still running; awaited (bounded) at shutdown. */
export const running = new Set<Promise<unknown>>();

export function background(task: Promise<unknown>): void {
    const tracked = task.catch((err: unknown) =>
        warnOnce(`task ${String(err)}`, "crash", `simulated client crashed: ${(err as Error)?.stack ?? String(err)}`));
    running.add(tracked);
    void tracked.finally(() => running.delete(tracked));
}
