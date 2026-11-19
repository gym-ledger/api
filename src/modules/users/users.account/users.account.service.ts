import { AppError } from "../../../shared/errors/AppError.js";
import { fetchOneFromTable } from "../../index/index.repository.js";
import { USERS_TABLE, UsersInterface } from "../../../db/schemas/users/users.schema.js";
import { verifyPassword } from "../../../utils/authentication.js";
import { toPublicUser } from "../../../utils/users/users.utils.js";
import { env } from "../../../config/env.js";
import { publishUserEvent } from "../../../infrastructure/redis/userEvents.js";
import {
    assertValidEmail,
    sendAccountDeletionCodeService,
    sendIdentityConfirmationCodeService,
    sendNewEmailCodeService,
    verifyAccountDeletionCodeService,
    verifyIdentityConfirmationCodeService,
    verifyNewEmailCodeService,
} from "../../auth/auth.service.js";
import { createEmailChangeToken, isValidEmailChangeToken } from "../../../utils/crypto.js";
import { isEmailDeliveryConfigured, sendEmailChangedNotice } from "../../../utils/email-utils.js";
import { OtpDeliveryError } from "../../../shared/errors/OtpDeliveryError.js";
import { isLoadTestEmail } from "../../../middleware/loadTestClient.js";
import { logger } from "../../../config/logger.js";
import {
    ACCOUNT_DELETION_GRACE_DAYS,
    DATA_EXPORT_TTL_DAYS,
    cancelAccountDeletionRepository,
    createDataExportRepository,
    fetchDataExportContentRepository,
    fetchLatestDataExportRepository,
    scheduleAccountDeletionRepository,
    updateUserEmailRepository,
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
 * How this user confirms a sensitive action (deleting the account, changing
 * its email): their password, or else a code sent to their email, or to their
 * phone over WhatsApp when they have no email (only possible when phone codes
 * are on).
 */
const confirmationMethod = (user: UsersInterface) => {
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
            confirm_with: confirmationMethod(user),
        },
        email_change: {
            confirm_with: confirmationMethod(user),
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
    const method = confirmationMethod(user);
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
    const method = confirmationMethod(user);
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

// ---------------------------------------------------------------------------
// Email change (or adding one, for accounts without an email)
//
// 1. The user confirms it's them: their password, or (without one) a code
//    sent to their current email/phone (POST /email/confirm-code).
// 2. POST /email/send-code checks that and sends a code to the new address.
//    It returns a short-lived change token, so a resend needs no re-confirming.
// 3. POST /email/verify with the token and that code sets the new email and
//    tells the old address. Nothing changes until this succeeds.
// ---------------------------------------------------------------------------

/** How long the confirmation from step 1 lasts (resends and the final verify). */
export const EMAIL_CHANGE_TOKEN_TTL_MS = 1000 * 60 * 15;

const EMAIL_CHANGE_EXPIRED_MESSAGE = "That took too long. Start again to change your email";

/** Throws unless `email` can become this user's new email. */
const assertNewEmailAllowed = async (user: UsersInterface, email: string) => {
    assertValidEmail(email);
    // Seeded load-test accounts are found and purged by their domain.
    if (isLoadTestEmail(user.email)) {
        throw new AppError("This account's email can't be changed", 403);
    }
    if (isLoadTestEmail(email)) {
        throw new AppError("Use a different email address", 400);
    }
    if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
        throw new AppError("That's already your email", 400);
    }
    const owner = await fetchOneFromTable({
        table: USERS_TABLE,
        where: [{ field: "email", operator: "=", value: email }],
    }) as UsersInterface | null;
    if (owner && owner.id !== user.id) {
        throw new AppError("This email is already in use by another account", 409);
    }
}

/** Step 1, for users without a password: a code to their current email/phone. */
export const sendEmailChangeConfirmCodeService = async (userId: string) => {
    const user = await fetchUserOrThrow(userId);
    const method = confirmationMethod(user);
    if (method === "password") {
        throw new AppError("Confirm with your password", 400);
    }
    if (!method) {
        throw new AppError("Set a password in Settings first, then use it to confirm", 400);
    }
    return await sendIdentityConfirmationCodeService(user, "email_change_auth");
}

/** Step 2: checks the confirmation (or an earlier change token), then sends a code to the new address. */
export const sendEmailChangeCodeService = async (userId: string, data: {
    email: string,
    password?: string,
    code?: string,
    change_token?: string,
}) => {
    const user = await fetchUserOrThrow(userId);
    const email = data.email.trim();
    // Before using up the confirmation code, so a typo or a taken address doesn't cost one.
    await assertNewEmailAllowed(user, email);

    let changeToken = data.change_token;
    if (!changeToken || !isValidEmailChangeToken(changeToken, userId)) {
        if (changeToken && !data.password && !data.code) {
            throw new AppError(EMAIL_CHANGE_EXPIRED_MESSAGE, 400);
        }
        const method = confirmationMethod(user);
        if (method === "password") {
            if (!data.password || !await verifyPassword(data.password, user.password_hash!)) {
                throw new AppError("That password isn't right", 400);
            }
        } else if (method) {
            if (!data.code) {
                throw new AppError("Enter the code we sent you", 400);
            }
            await verifyIdentityConfirmationCodeService(user, data.code, "email_change_auth");
        } else {
            throw new AppError("Set a password in Settings first, then use it to confirm", 400);
        }
        changeToken = createEmailChangeToken(userId, EMAIL_CHANGE_TOKEN_TTL_MS);
    }

    await sendNewEmailCodeService(email);
    return { email, change_token: changeToken };
}

/** Step 3: the code sent to the new address; only now does the email change. */
export const verifyEmailChangeService = async (userId: string, data: { email: string, code: string, change_token: string }) => {
    if (!isValidEmailChangeToken(data.change_token, userId)) {
        throw new AppError(EMAIL_CHANGE_EXPIRED_MESSAGE, 400);
    }
    const user = await fetchUserOrThrow(userId);
    const email = data.email.trim();
    await assertNewEmailAllowed(user, email);
    await verifyNewEmailCodeService(email, data.code);

    const updated = await updateUserEmailRepository(userId, email) as UsersInterface | null;
    if (!updated) {
        throw new AppError("This email is already in use by another account", 409);
    }
    if (user.email) {
        await notifyOldEmail(user.email, email);
    }
    return { user: toPublicUser(updated) };
}

/** Best effort: the change has happened, so a failed notice is only logged. */
const notifyOldEmail = async (oldEmail: string, newEmail: string) => {
    if (!isEmailDeliveryConfigured() && env.NODE_ENV !== "production") {
        return;
    }
    try {
        await sendEmailChangedNotice({ to: oldEmail, newEmail });
    } catch (error) {
        if (!(error instanceof OtpDeliveryError)) {
            throw error;
        }
        logger.error({ provider: error.provider, details: error.details }, "Email-changed notice failed");
    }
}
