import { logger } from "../../../config/logger.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { isValidUUID } from "../../../utils/validation.js";
import { ensureWeeklyCheckinService } from "../users.checkins/users.checkins.service.js";
import {
    countUnreadNotificationsRepository,
    fetchNotificationsRepository,
    markNotificationsReadRepository,
} from "./users.notifications.repository.js";

const NOTIFICATION_LIST_LIMIT = 50;

/**
 * Notifications are posted lazily — the weekly check-in notice is decided
 * the first time the user shows up in a new week — so make sure that has
 * happened before reading. Never fails the read itself.
 */
const ensureFreshNotifications = async (userId: string) => {
    try {
        await ensureWeeklyCheckinService(userId);
    } catch (error) {
        logger.error({ error }, "Weekly check-in evaluation failed while loading notifications");
    }
}

export const listNotificationsService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    await ensureFreshNotifications(userId);
    const [notifications, unread] = await Promise.all([
        fetchNotificationsRepository(userId, NOTIFICATION_LIST_LIMIT),
        countUnreadNotificationsRepository(userId),
    ]);
    return {
        unread,
        notifications: notifications.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            link: n.link,
            read: n.read_at != null,
            created_at: n.created_at,
        })),
    };
}

export const getUnreadNotificationCountService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    await ensureFreshNotifications(userId);
    return { unread: await countUnreadNotificationsRepository(userId) };
}

export const markNotificationReadService = async (data: { userId?: string, notificationId?: string }) => {
    const { userId, notificationId } = data;
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    if (!notificationId || !isValidUUID(notificationId)) {
        throw new AppError("Invalid notification id", 400);
    }
    await markNotificationsReadRepository(userId, notificationId);
}

export const markAllNotificationsReadService = async (userId?: string) => {
    if (!userId) {
        throw new AppError("User ID is required", 400);
    }
    await markNotificationsReadRepository(userId, null);
}
