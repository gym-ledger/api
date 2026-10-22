import { pg } from "../../../infrastructure/postgres/index.js";
import { publishUserEvent } from "../../../infrastructure/redis/userEvents.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { UserNotificationsInterface } from "../../../db/schemas/users/notifications/userNotifications.schema.js";

const NOTIFICATION_COLUMNS = `
    id,
    user_id,
    type,
    group_key,
    dedupe_key,
    title,
    body,
    link,
    read_at,
    deleted_at,
    created_at,
    updated_at
`;

/**
 * Posts a notification. If one with the same `dedupeKey` is already live
 * nothing changes (so re-posting doesn't bump it back to unread); otherwise
 * the user's older live notifications in the same `groupKey` are removed
 * first, so only the newest of a kind is ever shown.
 */
export const postNotificationRepository = async (data: {
    userId: string,
    type: string,
    groupKey?: string | null,
    dedupeKey?: string | null,
    title: string,
    body: string,
    link?: string | null,
}): Promise<UserNotificationsInterface | null> => {
    const { userId, type, groupKey = null, dedupeKey = null, title, body, link = null } = data;
    // One connection for the whole transaction — see run-migrations.ts.
    const client = await pg.connect();
    try {
        await client.query("BEGIN");
        if (dedupeKey) {
            const existing = await client.query(
                `SELECT 1 FROM user_notifications WHERE user_id = $1 AND dedupe_key = $2 AND deleted_at IS NULL`,
                [userId, dedupeKey],
            );
            if (existing.rowCount) {
                await client.query("COMMIT");
                return null;
            }
        }
        if (groupKey) {
            await client.query(
                `UPDATE user_notifications SET deleted_at = NOW() WHERE user_id = $1 AND group_key = $2 AND deleted_at IS NULL`,
                [userId, groupKey],
            );
        }
        const inserted = await client.query(
            `
            INSERT INTO user_notifications (user_id, type, group_key, dedupe_key, title, body, link)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id, dedupe_key) WHERE deleted_at IS NULL AND dedupe_key IS NOT NULL DO NOTHING
            RETURNING ${NOTIFICATION_COLUMNS}
            `,
            [userId, type, groupKey, dedupeKey, title, body, link],
        );
        await client.query("COMMIT");
        // Open apps refetch, whether a notice was added or only older ones in its group were removed.
        publishUserEvent({ type: "notifications", userId });
        return inserted.rows[0] ?? null;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        // console.log(error);
        throw new AppError("Failed to post notification", 500);
    } finally {
        client.release();
    }
}

/** Removes every live notification in a group (e.g. once what they warned about is resolved). */
export const clearNotificationGroupRepository = async (userId: string, groupKey: string): Promise<void> => {
    const query = `
    UPDATE user_notifications
    SET deleted_at = NOW()
    WHERE user_id = $1
        AND group_key = $2
        AND deleted_at IS NULL
    `;
    try {
        const result = await pg.query(query, [userId, groupKey]);
        if (result.rowCount) publishUserEvent({ type: "notifications", userId });
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to clear notifications", 500);
    }
}

export const fetchNotificationsRepository = async (
    userId: string,
    limit: number,
): Promise<UserNotificationsInterface[]> => {
    const query = `
    SELECT ${NOTIFICATION_COLUMNS}
    FROM user_notifications
    WHERE user_id = $1
        AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT $2
    `;
    try {
        const result = await pg.query(query, [userId, limit]);
        return result.rows;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to fetch notifications", 500);
    }
}

export const countUnreadNotificationsRepository = async (userId: string): Promise<number> => {
    const query = `
    SELECT COUNT(*) AS unread
    FROM user_notifications
    WHERE user_id = $1
        AND deleted_at IS NULL
        AND read_at IS NULL
    `;
    try {
        const result = await pg.query(query, [userId]);
        return Number(result.rows[0]?.unread ?? 0);
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to count notifications", 500);
    }
}

/** `notificationId` null marks every unread notification read. Returns how many changed. */
export const markNotificationsReadRepository = async (
    userId: string,
    notificationId: string | null,
): Promise<number> => {
    const query = `
    UPDATE user_notifications
    SET read_at = NOW()
    WHERE user_id = $1
        AND deleted_at IS NULL
        AND read_at IS NULL
        ${notificationId ? "AND id = $2" : ""}
    `;
    try {
        const result = await pg.query(query, notificationId ? [userId, notificationId] : [userId]);
        // The user's other devices update their unread badge.
        if (result.rowCount) publishUserEvent({ type: "notifications", userId });
        return result.rowCount ?? 0;
    } catch (error) {
        // console.log(query);
        // console.log(error);
        throw new AppError("Failed to mark notifications read", 500);
    }
}
