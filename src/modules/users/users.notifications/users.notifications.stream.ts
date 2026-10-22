import { Request, Response } from "express";
import { logger } from "../../../config/logger.js";
import { subscribeToUserEvents, UserEvent } from "../../../infrastructure/redis/userEvents.js";

// Proxies drop a quiet connection (Cloudflare after ~100s), so say something well before that.
const HEARTBEAT_MS = 25_000;
// A few devices and tabs; beyond that the oldest stream gives way.
const MAX_STREAMS_PER_USER = 5;
// A client that stops reading gets cut off instead of piling up unsent data.
const MAX_BUFFERED_BYTES = 64 * 1024;

interface Stream {
    res: Response;
    sessionId: string;
    expiryTimer: ReturnType<typeof setTimeout>;
}

const streamsByUser = new Map<string, Set<Stream>>();

const write = (stream: Stream, chunk: string) => {
    if (stream.res.writableLength > MAX_BUFFERED_BYTES) {
        stream.res.end();
        return;
    }
    stream.res.write(chunk);
}

const sendEvent = (stream: Stream, event: string, data: unknown = {}) => {
    write(stream, `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Tells the client why the stream ended, then ends it (cleanup runs on "close"). */
const endStream = (stream: Stream, reason: "expired" | "session-ended" | "replaced" | "shutdown") => {
    if (stream.res.writableEnded) return;
    sendEvent(stream, "end", { reason });
    stream.res.end();
}

const handleUserEvent = (event: UserEvent) => {
    const streams = streamsByUser.get(event.userId);
    if (!streams) return;
    for (const stream of streams) {
        if (event.type === "notifications") {
            sendEvent(stream, "notifications");
        } else if (
            event.sessionId ? stream.sessionId === event.sessionId
            : event.exceptSessionId ? stream.sessionId !== event.exceptSessionId
            : true
        ) {
            endStream(stream, "session-ended");
        }
    }
}

/**
 * Starts listening for user events and the shared heartbeat. Call once,
 * after Redis is connected.
 */
export const startNotificationStreams = async () => {
    await subscribeToUserEvents(handleUserEvent);
    setInterval(() => {
        for (const streams of streamsByUser.values()) {
            for (const stream of streams) write(stream, ": ping\n\n");
        }
    }, HEARTBEAT_MS).unref();
}

/** Ends every open stream so the HTTP server can finish closing on shutdown. */
export const closeAllNotificationStreams = () => {
    for (const streams of streamsByUser.values()) {
        for (const stream of streams) endStream(stream, "shutdown");
    }
}

/**
 * GET /user/notifications/stream — Server-Sent Events. Only signals are
 * sent ("notifications" = refetch them); the data itself still comes from
 * the REST endpoints, so a missed event costs nothing beyond a late badge.
 *
 * The stream lives no longer than the access token that opened it: it is
 * ended when the token expires, and the client reconnects with a fresh one.
 * Signing a session out (logout, "sign out other devices", password reset,
 * account deletion) ends its streams at once.
 */
export const openNotificationStream = (req: Request, res: Response) => {
    const userId = req.userId!;
    const sessionId = req.userSessionId!;
    const remainingMs = (req.userAccessTokenExpiresAt ?? 0) - Date.now();
    if (remainingMs <= 0) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    res.status(200).set({
        "Content-Type": "text/event-stream; charset=utf-8",
        // no-transform keeps the compression middleware from buffering events.
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.socket?.setNoDelay(true);

    const stream: Stream = {
        res,
        sessionId,
        expiryTimer: setTimeout(() => endStream(stream, "expired"), remainingMs),
    };

    let streams = streamsByUser.get(userId);
    if (!streams) {
        streams = new Set();
        streamsByUser.set(userId, streams);
    }
    if (streams.size >= MAX_STREAMS_PER_USER) {
        const oldest = streams.values().next().value;
        if (oldest) {
            streams.delete(oldest);
            endStream(oldest, "replaced");
        }
    }
    streams.add(stream);

    res.on("close", () => {
        clearTimeout(stream.expiryTimer);
        const current = streamsByUser.get(userId);
        current?.delete(stream);
        if (current?.size === 0) streamsByUser.delete(userId);
    });
    res.on("error", (error) => {
        logger.warn({ error }, "Notification stream error");
    });

    sendEvent(stream, "ready");
}
