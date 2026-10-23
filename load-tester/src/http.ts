// The one function every request goes through: adds what a browser of this user would send
// (and the load-test headers), times it including the body download, and records it.
import type { Config } from "./config.js";
import { gauges, recordRequest, stop, warnOnce } from "./runtime.js";
import type { Outcome } from "./stats.js";

const REFRESH_COOKIE = "wg_refresh";

let base = "";
let timeoutMs = 30_000;
let userAgent = "";
let loadTestKey: string | undefined;

export function configureHttp(c: Config): void {
    base = c.target.apiUrl;
    timeoutMs = c.target.requestTimeoutMs;
    userAgent = c.target.userAgent;
    loadTestKey = process.env[c.target.loadTestKeyEnv] || undefined;
}

export const hasLoadTestKey = () => !!loadTestKey;

/** Who is calling: the simulated IP rate limits count against, and the browser's credentials. */
export interface Caller {
    ip: string;
    access?: string;
    /** The httpOnly refresh cookie, as the browser holds it. */
    refresh?: string;
}

export interface Res {
    status: number;
    /** The response envelope's `data` (or the raw body when it isn't the envelope). */
    data: any;
    body: any;
    ms: number;
}

export interface RequestOptions {
    body?: unknown;
    /** Send the access token. */
    auth?: boolean;
    /** Statuses the caller handles itself: recorded as ok, not as client errors. */
    expect?: number[];
}

/** A request, timed and recorded under `key` (the route with its ids replaced). Never throws. */
export async function request(caller: Caller, key: string, method: string, path: string, o: RequestOptions = {}): Promise<Res> {
    const headers: Record<string, string> = {
        "user-agent": userAgent,
        accept: "application/json",
        "accept-encoding": "gzip, br",
    };
    if (loadTestKey) {
        headers["x-load-test-key"] = loadTestKey;
        headers["x-load-test-client-ip"] = caller.ip;
    }
    if (o.auth && caller.access) headers.authorization = `Bearer ${caller.access}`;
    // The browser only sends the cookie to its path (/auth); so does this.
    if (caller.refresh && path.startsWith("/auth/")) headers.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(caller.refresh)}`;
    if (o.body !== undefined) headers["content-type"] = "application/json";

    const started = performance.now();
    gauges.inFlight++;
    try {
        const res = await fetch(base + path, {
            method,
            headers,
            body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
            signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), stop.signal]),
        });
        // The whole body, like a client: transfer time is part of the latency.
        const text = await res.text();
        const ms = performance.now() - started;
        let body: any;
        try {
            body = text ? JSON.parse(text) : undefined;
        } catch {
            body = text;
        }
        for (const cookie of res.headers.getSetCookie()) {
            const m = new RegExp(`^${REFRESH_COOKIE}=([^;]*)`).exec(cookie);
            if (m) caller.refresh = decodeURIComponent(m[1]) || undefined;
        }
        const outcome = outcomeOf(res.status, o.expect);
        recordRequest(key, ms, String(res.status), outcome);
        if (outcome === "client") {
            warnOnce(`${key} ${res.status}`, "client-error", `${key} → ${res.status}: ${JSON.stringify(body?.error ?? body)?.slice(0, 300)}`);
        } else if (outcome === "server") {
            warnOnce(`${key} ${res.status}`, "server-error", `${key} → ${res.status}: ${JSON.stringify(body?.error ?? body)?.slice(0, 300)}`);
        }
        const data = body && typeof body === "object" && "data" in body ? body.data : body;
        return { status: res.status, data, body, ms };
    } catch (err) {
        const ms = performance.now() - started;
        const name = (err as Error)?.name;
        if (stop.signal.aborted && name === "AbortError") {
            return { status: 0, data: undefined, body: undefined, ms };
        }
        const timeout = name === "TimeoutError";
        recordRequest(key, ms, timeout ? "timeout" : "network", "network");
        if (!timeout) {
            const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
            warnOnce(`${key} net ${cause?.code}`, "network", `${key}: ${cause?.code ?? ""} ${cause?.message ?? (err as Error)?.message}`);
        }
        return { status: 0, data: undefined, body: undefined, ms };
    } finally {
        gauges.inFlight--;
    }
}

function outcomeOf(status: number, expect: number[] = []): Outcome {
    if (status < 400 || expect.includes(status)) return "ok";
    if (status === 429) return "limited";
    if (status >= 500) return "server";
    return "client";
}

/**
 * Opens the notification stream (SSE over fetch, as the web app reads it) and keeps reading
 * until `signal` aborts or the server ends it. Records the time to the response headers.
 * Resolves with how it ended.
 */
export async function openStream(
    caller: Caller,
    key: string,
    path: string,
    signal: AbortSignal,
    onMessage: () => void,
): Promise<"closed" | "aborted" | number> {
    const started = performance.now();
    const headers: Record<string, string> = {
        "user-agent": userAgent,
        accept: "text/event-stream",
        authorization: `Bearer ${caller.access ?? ""}`,
    };
    if (loadTestKey) {
        headers["x-load-test-key"] = loadTestKey;
        headers["x-load-test-client-ip"] = caller.ip;
    }
    let res: Response;
    try {
        res = await fetch(base + path, {
            headers,
            signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
    } catch (err) {
        if (signal.aborted) return "aborted";
        const timeout = (err as Error)?.name === "TimeoutError";
        recordRequest(key, performance.now() - started, timeout ? "timeout" : "network", "network");
        return 0;
    }
    const outcome = outcomeOf(res.status, [401]);
    recordRequest(key, performance.now() - started, String(res.status), outcome);
    if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => undefined);
        return res.status;
    }
    gauges.streamsOpen++;
    try {
        // The headers' timeout no longer applies once the stream is open.
        const reader = res.body.getReader();
        const onAbort = () => void reader.cancel().catch(() => undefined);
        signal.addEventListener("abort", onAbort, { once: true });
        const decoder = new TextDecoder();
        let buffered = "";
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffered += decoder.decode(value, { stream: true });
            let end: number;
            while ((end = buffered.indexOf("\n\n")) !== -1) {
                const frame = buffered.slice(0, end);
                buffered = buffered.slice(end + 2);
                if (/^data:/m.test(frame)) onMessage();
            }
        }
        signal.removeEventListener("abort", onAbort);
        return signal.aborted ? "aborted" : "closed";
    } catch {
        return signal.aborted ? "aborted" : "closed";
    } finally {
        gauges.streamsOpen--;
    }
}
