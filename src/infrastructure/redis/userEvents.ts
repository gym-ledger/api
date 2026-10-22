import { logger } from "../../config/logger.js";
import { redis } from "./index.js";

const CHANNEL = "user-events";

/**
 * Something a signed-in user's open app should hear about right away.
 * Published through Redis so every API instance can reach its own open
 * notification streams, whichever instance made the change.
 */
export type UserEvent =
    /** The user's notifications changed (new, cleared or read) — refetch them. */
    | { type: "notifications", userId: string }
    /**
     * Sessions were signed out: just `sessionId`, every session but
     * `exceptSessionId`, or (neither set) all of the user's sessions.
     */
    | { type: "sessions-ended", userId: string, sessionId?: string, exceptSessionId?: string };

/** Fire-and-forget: a lost event only delays an update, so it never fails the caller. */
export const publishUserEvent = (event: UserEvent): void => {
    redis.publish(CHANNEL, JSON.stringify(event)).catch((error) => {
        logger.error({ error, type: event.type }, "Failed to publish user event");
    });
}

/** One dedicated subscriber connection per API process (a subscribed client can't run other commands). */
export const subscribeToUserEvents = async (handler: (event: UserEvent) => void): Promise<void> => {
    const subscriber = redis.duplicate();
    subscriber.on("error", (error) => {
        logger.error({ error }, "Redis user-events subscriber error");
    });
    await subscriber.connect();
    await subscriber.subscribe(CHANNEL, (message) => {
        try {
            handler(JSON.parse(message) as UserEvent);
        } catch (error) {
            logger.error({ error }, "Bad user event");
        }
    });
}
