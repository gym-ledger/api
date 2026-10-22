import { AppError } from "../../../shared/errors/AppError.js";
import { fetchOneFromTable } from "../../index/index.repository.js";
import { USERS_TABLE, UsersInterface } from "../../../db/schemas/users/users.schema.js";
import { verifyPassword } from "../../../utils/authentication.js";
import { toPublicUser } from "../../../utils/users/users.utils.js";
import { env } from "../../../config/env.js";
import { publishUserEvent } from "../../../infrastructure/redis/userEvents.js";
import { sendAccountDeletionCodeService, verifyAccountDeletionCodeService } from "../../auth/auth.service.js";
import {
    ACCOUNT_DELETION_GRACE_DAYS,
    DATA_EXPORT_TTL_DAYS,
    cancelAccountDeletionRepository,
    createDataExportRepository,
    fetchDataExportContentRepository,
    fetchLatestDataExportRepository,
    scheduleAccountDeletionRepository,
} from "./users.account.repository.js";

const fetchUserOrThrow = async (userId: string) => {
    const user = await fetchOneFromTable({
        table: USERS_TABLE,
        where: [{ field: "id", operator: "=", value: userId }],
    }) as UsersInterface | null;
    if (!user) {
        throw new AppError("User not found", 404);
    }
    return user;
}

/**
 * How this user confirms a deletion: their password, or else a code sent to
 * their email, or to their phone over WhatsApp when they have no email (only
 * possible when phone codes are on).
 */
const deletionConfirmationMethod = (user: UsersInterface) => {
    if (user.password_hash) return "password" as const;
    if (user.email) return "email_code" as const;
    return env.PHONE_OTP_ENABLED ? "phone_code" as const : null;
}

export const getAccountDataService = async (userId: string) => {
    const user = await fetchUserOrThrow(userId);
    return {
        deletion: {
            scheduled_for: user.deletion_scheduled_for ?? null,
            requested_at: user.deletion_requested_at ?? null,
            grace_days: ACCOUNT_DELETION_GRACE_DAYS,
            confirm_with: deletionConfirmationMethod(user),
        },
        export: {
            latest: await fetchLatestDataExportRepository(userId),
            ttl_days: DATA_EXPORT_TTL_DAYS,
        },
    };
}

// ---------------------------------------------------------------------------
// Data export
// ---------------------------------------------------------------------------

export const requestDataExportService = async (userId: string) => {
    const created = await createDataExportRepository(userId);
    if (!created) {
        throw new AppError("Your data export is already being prepared", 409);
    }
    return created;
}

export const downloadDataExportService = async (userId: string, exportId: string) => {
    const file = await fetchDataExportContentRepository(userId, exportId);
    if (!file) {
        throw new AppError("This export isn't available. Request a new one", 404);
    }
    const day = new Date(file.completed_at).toISOString().slice(0, 10);
    return { content: file.content, fileName: `gym-ledger-data-${day}.json` };
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

export const sendDeletionCodeService = async (userId: string) => {
    const user = await fetchUserOrThrow(userId);
    const method = deletionConfirmationMethod(user);
    if (method === "password") {
        throw new AppError("Confirm with your password", 400);
    }
    if (!method) {
        throw new AppError("Set a password in Settings first, then use it to confirm", 400);
    }
    return await sendAccountDeletionCodeService(user);
}

/**
 * Schedules the account for deletion in ACCOUNT_DELETION_GRACE_DAYS, after
 * the user confirms with their password (or a code, without one), and signs
 * it out on every device.
 */
export const requestAccountDeletionService = async (userId: string, data: { password?: string, code?: string }) => {
    const user = await fetchUserOrThrow(userId);
    if (user.deletion_scheduled_for) {
        throw new AppError("Your account is already scheduled for deletion", 409);
    }
    const method = deletionConfirmationMethod(user);
    if (method === "password") {
        if (!data.password || !await verifyPassword(data.password, user.password_hash!)) {
            throw new AppError("That password isn't right", 400);
        }
    } else if (method) {
        if (!data.code) {
            throw new AppError("Enter the code we sent you", 400);
        }
        await verifyAccountDeletionCodeService(user, data.code);
    } else {
        throw new AppError("Set a password in Settings first, then use it to confirm", 400);
    }
    const scheduledFor = await scheduleAccountDeletionRepository(userId);
    // Scheduling signs out every device; their open streams end with them.
    publishUserEvent({ type: "sessions-ended", userId });
    return { deletion_scheduled_for: scheduledFor };
}

/** Called after signing in during the grace period, when the user chooses to keep the account. */
export const cancelAccountDeletionService = async (userId: string) => {
    const user = await fetchUserOrThrow(userId);
    if (!user.deletion_scheduled_for) {
        return { user: toPublicUser(user) };
    }
    await cancelAccountDeletionRepository(userId);
    return { user: toPublicUser({ ...user, deletion_requested_at: null, deletion_scheduled_for: null }) };
}
