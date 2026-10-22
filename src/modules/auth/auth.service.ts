import { OTP_AUTH_TABLE, OtpAuthInterface, OtpPurpose } from "../../db/schemas/auth/otp.auth.schema.js";
import { generateOtpHash, generateRandomOTP, OTP_LENGTH, verifyOtpHash } from "../../helpers/otp.js";
import { AppError } from "../../shared/errors/AppError.js";
import { fetchOneFromTable, addOneInTable, updateOneInTable, deleteOneFromTable, deleteManyInTable } from "../index/index.repository.js";
import { sendOtpWhatsApp } from "../../utils/whatsapp-utils.js";
import { isEmailDeliveryConfigured, OtpTemplate, sendOtpEmail } from "../../utils/email-utils.js";
import { OtpDeliveryError } from "../../shared/errors/OtpDeliveryError.js";
import { USERS_TABLE, UsersInterface } from "../../db/schemas/users/users.schema.js";
import { generateRefreshToken, generateUserAccessToken, hashPassword, validateNewPassword, verifyPasswordConstantTime } from "../../utils/authentication.js";
import { decryptGraceToken, encryptGraceToken, hashToken } from "../../utils/crypto.js";
import { toPublicUser } from "../../utils/users/users.utils.js";
import { captcha } from "../../infrastructure/captcha/index.js";
import { env } from "../../config/env.js";
import { USER_SESSIONS_TABLE } from "../../db/schemas/auth/user_sessions.schema.js";
import { UserSessionsInterface } from "../../db/schemas/auth/user_sessions.schema.js";
import { logger } from "../../config/logger.js";
import { claimOtpAttemptRepository } from "./auth.repository.js";
import { deleteUserSessionRepository, fetchUserSessionByHashRepository, rotateUserSessionRepository } from "./userSessions.repository.js";
import { REFRESH_REUSE_GRACE_MS } from "../../config/constants.js";

const OTP_TTL_MS = 1000 * 60 * 5;
const OTP_MAX_ATTEMPTS = 3;
const OTP_RESEND_COOLDOWN_MS = 1000 * 60;
const OTP_SEND_WINDOW_MS = 1000 * 60 * 60;
const OTP_MAX_SENDS_PER_WINDOW = 5;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 10;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;


/** A phone number as stored: country code (e.g. "+91") and national number. */
type PhoneNumber = { code?: string | null, number?: string | null };

/** How a user identifies themselves to sign in: an email, or a phone number. */
type IdentityInput = { method: string, phoneNumber?: PhoneNumber, email?: string | null };

const validateIdentity = (method: string, phoneNumber: PhoneNumber | undefined, email: string | null | undefined) => {
    if (method === "phone") {
        if (!phoneNumber?.code) {
            throw new AppError("Invalid phone number code", 400);
        }
        if (!phoneNumber?.number?.match(/^[0-9]{10}$/)) {
            throw new AppError("Invalid phone number", 400);
        }
    } else if (method === "email") {
        if (!email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            throw new AppError("Invalid email", 400);
        }
    } else {
        throw new AppError("Invalid method", 400);
    }
}

const getOtpObj = async (method: string, phoneNumber: PhoneNumber | undefined, email: string | null | undefined, purpose: OtpPurpose) => {
    validateIdentity(method, phoneNumber, email);
    const identityWhere = method === "phone"
        ? [
            { field: "phone_country_code", operator: "=" as const, value: phoneNumber?.code },
            { field: "phone_number", operator: "=" as const, value: phoneNumber?.number },
        ]
        : [
            { field: "email", operator: "=" as const, value: email },
        ];
    return await fetchOneFromTable({
        table: OTP_AUTH_TABLE,
        where: [
            { field: "method", operator: "=", value: method },
            { field: "purpose", operator: "=", value: purpose },
            ...identityWhere,
        ],
        useSoftDelete: false,
    }) as OtpAuthInterface | null;
}

const findUserByIdentity = async (method: string, phoneNumber: PhoneNumber | undefined, email: string | null | undefined) => {
    validateIdentity(method, phoneNumber, email);
    const where = method === "phone"
        ? [
            { field: "phone_number", operator: "=" as const, value: phoneNumber?.number },
            { field: "phone_country_code", operator: "=" as const, value: phoneNumber?.code },
        ]
        : [
            { field: "email", operator: "=" as const, value: email },
        ];
    return await fetchOneFromTable({
        table: USERS_TABLE,
        where,
    }) as UsersInterface | null;
}

const deleteOtpObj = async (otpObj: OtpAuthInterface) => {
    await deleteOneFromTable({
        table: OTP_AUTH_TABLE,
        where: [{ field: "id", operator: "=", value: otpObj.id }],
        useSoftDelete: false,
    });
}

/** Phone codes go out over WhatsApp, which an instance may not have set up (PHONE_OTP_ENABLED). */
const assertOtpMethodAvailable = (method: string) => {
    if (method === "phone" && !env.PHONE_OTP_ENABLED) {
        throw new AppError("Codes can't be sent to phone numbers. Sign in with your password or use email", 400);
    }
}

/** What the front-ends need to know to render the sign-in options. */
export const getAuthConfigService = () => ({
    phoneOtpEnabled: env.PHONE_OTP_ENABLED,
    // null = no CAPTCHA; otherwise what the widget needs (provider, challenge path).
    captcha: captcha?.clientConfig() ?? null,
});

/**
 * Issues a brand-new OTP for this identity + purpose and delivers it. A code
 * is never re-sent, and a resend never resets the attempt counter or extends
 * the expiry of an existing code — every send is a fresh random code with a
 * fresh 3-attempt budget, so total guesses are bounded by how many codes an
 * identity can get: at most one per OTP_RESEND_COOLDOWN_MS and
 * OTP_MAX_SENDS_PER_WINDOW per OTP_SEND_WINDOW_MS.
 *
 * With `silentThrottle`, a throttled request returns quietly instead of
 * throwing 429 (forgot-password: a 429 would reveal that the account exists,
 * since only existing accounts ever get a reset OTP row).
 */
const issueOtp = async ({ method, phoneNumber, email, purpose, silentThrottle = false }: {
    method: string,
    phoneNumber: PhoneNumber | undefined,
    email: string | null | undefined,
    purpose: OtpPurpose,
    silentThrottle?: boolean,
}) => {
    assertOtpMethodAvailable(method);
    const existing = await getOtpObj(method, phoneNumber, email, purpose);
    const now = Date.now();

    let sendCount = 1;
    let sendWindowStartedAt = new Date(now);
    if (existing) {
        const sinceLastSendMs = now - new Date(existing.generated_at).getTime();
        if (sinceLastSendMs < OTP_RESEND_COOLDOWN_MS) {
            if (silentThrottle) {
                return;
            }
            const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLastSendMs) / 1000);
            throw new AppError(`Please wait ${waitSeconds}s before requesting a new OTP`, 429);
        }
        const windowStartedAt = existing.send_window_started_at
            ? new Date(existing.send_window_started_at).getTime()
            : null;
        if (windowStartedAt !== null && now - windowStartedAt < OTP_SEND_WINDOW_MS) {
            if (existing.send_count >= OTP_MAX_SENDS_PER_WINDOW) {
                if (silentThrottle) {
                    return;
                }
                throw new AppError("Too many OTP requests. Please try again later", 429);
            }
            sendCount = existing.send_count + 1;
            sendWindowStartedAt = new Date(windowStartedAt);
        }
    }

    const otp = generateRandomOTP(OTP_LENGTH);
    const codeFields = {
        otp_hash: await generateOtpHash(otp),
        generated_at: new Date(now),
        expires_at: new Date(now + OTP_TTL_MS),
        attempts: 0,
        verified_at: null,
        reset_token_hash: null,
        send_count: sendCount,
        send_window_started_at: sendWindowStartedAt,
        deleted_at: null,
    };
    if (existing) {
        await updateOneInTable({
            table: OTP_AUTH_TABLE,
            data: codeFields,
            where: [{ field: "id", operator: "=", value: existing.id }],
            useSoftDelete: false,
        });
    } else {
        await addOneInTable({
            table: OTP_AUTH_TABLE,
            data: {
                method: method,
                purpose: purpose,
                phone_country_code: phoneNumber?.code,
                phone_number: phoneNumber?.number,
                email: email,
                ...codeFields,
            },
        });
    }

    await deliverOtp({ method, phoneNumber, email, otp, purpose, swallowFailure: silentThrottle });
}

/**
 * Hands the code to Resend (email) or Twilio (WhatsApp). In development the
 * code is also logged, and an unconfigured email provider is tolerated so
 * the app runs locally without credentials; production refuses to boot
 * without one (see config/env.ts).
 *
 * A provider failure becomes a generic 502 — unless `swallowFailure`
 * (forgot-password), where any non-uniform response would reveal that the
 * account exists, so the failure is only logged.
 */
const deliverOtp = async ({ method, phoneNumber, email, otp, purpose, swallowFailure }: {
    method: string,
    phoneNumber: PhoneNumber | undefined,
    email: string | null | undefined,
    otp: string,
    purpose: OtpPurpose,
    swallowFailure: boolean,
}) => {
    if (env.NODE_ENV === "development") {
        logger.info({ purpose, method, otp }, "OTP issued (development only)");
    }

    const template: OtpTemplate = purpose === "reset_password"
        ? "otp-reset-password"
        : purpose === "delete_account" ? "otp-delete-account" : "otp-login";
    try {
        // validateIdentity (via getOtpObj in issueOtp) has checked these are set.
        if (method === "phone") {
            await sendOtpWhatsApp({ phoneNumber: phoneNumber as { code: string, number: string }, otp });
        } else if (method === "email") {
            if (!isEmailDeliveryConfigured() && env.NODE_ENV !== "production") {
                return;
            }
            await sendOtpEmail({ email: email as string, otp, template, ttlMinutes: OTP_TTL_MS / 60_000 });
        }
    } catch (error) {
        if (!(error instanceof OtpDeliveryError)) {
            throw error;
        }
        logger.error({ provider: error.provider, details: error.details, purpose, method }, error.message);
        if (swallowFailure) {
            return;
        }
        throw new AppError("We couldn't send your code. Please try again in a minute", 502);
    }
}

/**
 * Checks `otp` against the stored row, enforcing expiry and the per-code
 * attempt limit. Throws on any failure; returns normally only when the OTP is
 * correct. Does not consume the row. Failed/expired rows are kept (not
 * deleted) so the per-identity send counters in `issueOtp` survive.
 */
const assertOtpValid = async (otpObj: OtpAuthInterface | null, otp: string, { allowMasterOtp }: { allowMasterOtp: boolean }) => {
    if (!otpObj || otpObj.verified_at) {
        throw new AppError("OTP not found. Please try again", 400);
    }
    if (new Date(otpObj.expires_at) < new Date()) {
        throw new AppError("OTP expired. Please request a new OTP", 400);
    }

    // Claim the attempt atomically before checking the code, so parallel
    // guesses can't all see the same count.
    const attempts = await claimOtpAttemptRepository(otpObj.id, OTP_MAX_ATTEMPTS);
    if (attempts === null) {
        throw new AppError("Maximum attempts reached. Please request a new OTP", 400);
    }

    // Universal OTP from env.MASTER_LOGIN_OTP — login flow only (never forgot-password,
    // where it would let anyone reset any account). Unset in env = no bypass.
    const isMasterOtp = allowMasterOtp && !!env.MASTER_LOGIN_OTP && otp === env.MASTER_LOGIN_OTP;
    if (isMasterOtp) {
        return;
    }
    if (!await verifyOtpHash(otpObj.otp_hash, String(otp ?? ""))) {
        if (attempts >= OTP_MAX_ATTEMPTS) {
            throw new AppError(`Invalid OTP ${OTP_MAX_ATTEMPTS} times. Please request a new OTP`, 400);
        }
        throw new AppError("Invalid OTP. Please try again", 400);
    }
}

/** Opens a new refresh-token session for the user and returns the login payload. */
const createUserSession = async (userObj: UsersInterface) => {
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const sessionObj = await addOneInTable({
        table: USER_SESSIONS_TABLE,
        data: {
            user_id: userObj.id,
            refresh_token_hash: hashToken(refreshToken),
            expires_at: refreshTokenExpiresAt,
        },
    }) as UserSessionsInterface;
    const { accessToken, accessTokenExpiresAt } = await generateUserAccessToken({
        userId: userObj.id,
        sessionId: sessionObj.id,
    });
    return { user: toPublicUser(userObj), accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt };
}

export const sendOtpForLoginService = async (data: IdentityInput) => {
    const { method, phoneNumber, email } = data ?? {};
    await issueOtp({ method, phoneNumber, email, purpose: "login" });
}

export const verifyOtpForLoginService = async (data: IdentityInput & { otp: string }) => {
    const { method, phoneNumber, email, otp } = data ?? {};
    const otpObj = await getOtpObj(method, phoneNumber, email, "login");
    await assertOtpValid(otpObj, otp, { allowMasterOtp: true });
    await deleteOtpObj(otpObj!);

    // fetch user by phone number or email
    let userObj = await findUserByIdentity(method, phoneNumber, email);

    // sign-up if user is not found
    if (!userObj) {
        userObj = await addOneInTable({
            table: USERS_TABLE,
            data: {
                phone_number: phoneNumber?.number,
                phone_country_code: phoneNumber?.code,
                email: email,
            },
        }) as UsersInterface;
    }

    return await createUserSession(userObj);
}

export const loginWithPasswordService = async (data: IdentityInput & { password: string }) => {
    const { method, phoneNumber, email, password } = data ?? {};
    if (!password || typeof password !== "string") {
        throw new AppError("Password is required", 400);
    }
    const userObj = await findUserByIdentity(method, phoneNumber, email);
    // Same error for "no such user", "no password set" and "wrong password"
    // so this endpoint can't be used to probe which accounts exist; the
    // password check always runs so the timing doesn't give it away either.
    if (!await verifyPasswordConstantTime(password, userObj?.password_hash) || !userObj) {
        throw new AppError("Invalid credentials", 401);
    }
    return await createUserSession(userObj);
}

/**
 * Step 1 of forgot-password. Always resolves the same way whether or not an
 * account exists for this email/phone, so it can't be used to enumerate users;
 * the OTP is only generated and delivered when the account exists.
 */
export const sendOtpForPasswordResetService = async (data: IdentityInput) => {
    const { method, phoneNumber, email } = data ?? {};
    // Checked before the account lookup so the reply can't depend on whether it exists.
    assertOtpMethodAvailable(method);
    const userObj = await findUserByIdentity(method, phoneNumber, email);
    if (!userObj) {
        return;
    }
    await issueOtp({ method, phoneNumber, email, purpose: "reset_password", silentThrottle: true });
}

/**
 * Step 2 of forgot-password. Exchanges a correct OTP for a short-lived,
 * single-use reset token. The OTP row is kept and marked verified so the
 * token (stored hashed) can be checked in step 3.
 */
export const verifyOtpForPasswordResetService = async (data: IdentityInput & { otp: string }) => {
    const { method, phoneNumber, email, otp } = data ?? {};
    const otpObj = await getOtpObj(method, phoneNumber, email, "reset_password");
    await assertOtpValid(otpObj, otp, { allowMasterOtp: true });

    const resetToken = generateRefreshToken();
    const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await updateOneInTable({
        table: OTP_AUTH_TABLE,
        data: {
            verified_at: new Date(),
            reset_token_hash: hashToken(resetToken),
            expires_at: resetTokenExpiresAt,
        },
        where: [{ field: "id", operator: "=", value: otpObj!.id }],
        useSoftDelete: false,
    });
    return { resetToken, resetTokenExpiresAt };
}

/**
 * Step 3 of forgot-password. Sets the new password, burns the reset token,
 * and logs the user out of every existing session.
 */
export const resetPasswordService = async (data: { resetToken: string, newPassword: string }) => {
    const { resetToken, newPassword } = data ?? {};
    if (!resetToken || typeof resetToken !== "string") {
        throw new AppError("Reset token is required", 400);
    }
    validateNewPassword(newPassword);

    const otpObj = await fetchOneFromTable({
        table: OTP_AUTH_TABLE,
        where: [
            { field: "reset_token_hash", operator: "=", value: hashToken(resetToken) },
            { field: "purpose", operator: "=", value: "reset_password" },
        ],
        useSoftDelete: false,
    }) as (OtpAuthInterface & { phone_country_code: string | null, phone_number: string | null, email: string | null }) | null;
    if (!otpObj || !otpObj.verified_at) {
        throw new AppError("Invalid or expired reset token", 400);
    }
    // single-use: burn it before doing anything else
    await deleteOtpObj(otpObj);
    if (otpObj.expires_at < new Date()) {
        throw new AppError("Invalid or expired reset token", 400);
    }

    const userObj = await findUserByIdentity(
        otpObj.method,
        { code: otpObj.phone_country_code, number: otpObj.phone_number },
        otpObj.email,
    );
    if (!userObj) {
        throw new AppError("Invalid or expired reset token", 400);
    }

    await updateOneInTable({
        table: USERS_TABLE,
        data: {
            password_hash: await hashPassword(newPassword),
            updated_at: new Date(),
        },
        where: [{ field: "id", operator: "=", value: userObj.id }],
    });
    await deleteManyInTable({
        table: USER_SESSIONS_TABLE,
        where: [{ field: "user_id", operator: "=", value: userObj.id }],
        useSoftDelete: false,
    });
}

/**
 * Where a signed-in user's confirmation codes go: their email, or their
 * phone (WhatsApp) when they have no email.
 */
const identityOf = (user: Pick<UsersInterface, "email" | "phone_country_code" | "phone_number">) => user.email
    ? { method: "email", email: user.email, phoneNumber: undefined }
    : { method: "phone", email: undefined, phoneNumber: { code: user.phone_country_code, number: user.phone_number } };

/** Sends a code that confirms deleting the account, for users without a password. */
export const sendAccountDeletionCodeService = async (user: UsersInterface) => {
    await issueOtp({ ...identityOf(user), purpose: "delete_account" });
    return { sent_to: user.email ? "email" : "phone" };
}

/** Throws unless `otp` is the current account-deletion code; the code is used up either way it succeeds. */
export const verifyAccountDeletionCodeService = async (user: UsersInterface, otp: string) => {
    const { method, email, phoneNumber } = identityOf(user);
    const otpObj = await getOtpObj(method, phoneNumber, email, "delete_account");
    await assertOtpValid(otpObj, otp, { allowMasterOtp: false });
    await deleteOtpObj(otpObj!);
}

export const refreshTokensService = async (refreshToken: string | undefined) => {
    // 401, not 400: the clients treat any non-401 failure as transient and keep the session.
    if (!refreshToken) {
        throw new AppError("Refresh token is required", 401);
    }
    const oldHash = hashToken(refreshToken);
    const sessionObj = await fetchUserSessionByHashRepository("refresh_token_hash", oldHash);
    if (sessionObj) {
        if (sessionObj.expires_at < new Date()) {
            throw new AppError("Refresh token expired", 401);
        }
        if (sessionObj.revoked_at) {
            await deleteUserSessionRepository(sessionObj.id);
            throw new AppError("Refresh token revoked", 401);
        }
        const newRefreshToken = generateRefreshToken();
        const refreshTokenExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
        const rotated = await rotateUserSessionRepository({
            sessionId: sessionObj.id,
            oldHash,
            newHash: hashToken(newRefreshToken),
            newTokenEnc: encryptGraceToken(newRefreshToken),
            expiresAt: refreshTokenExpiresAt,
        });
        if (rotated) {
            const { accessToken, accessTokenExpiresAt } = await generateUserAccessToken({
                userId: sessionObj.user_id,
                sessionId: sessionObj.id,
            });
            return { accessToken, accessTokenExpiresAt, refreshToken: newRefreshToken, refreshTokenExpiresAt };
        }
        // Another refresh with this same token won the race; it is now the
        // previous token, so the grace path below hands back the winner's.
    }
    return await refreshWithPreviousToken(oldHash);
}

/**
 * A refresh token that was already swapped for a new one. Within the grace
 * window this returns that same new token (a retry after a dropped response,
 * or two tabs refreshing at once). After it, the old token showing up again
 * means it was likely copied, so the session is ended.
 */
const refreshWithPreviousToken = async (oldHash: string) => {
    const sessionObj = await fetchUserSessionByHashRepository("previous_refresh_token_hash", oldHash);
    if (!sessionObj || sessionObj.revoked_at || sessionObj.expires_at < new Date()) {
        throw new AppError("Invalid refresh token", 401);
    }
    const withinGrace = !!sessionObj.rotated_at
        && Date.now() - new Date(sessionObj.rotated_at).getTime() <= REFRESH_REUSE_GRACE_MS;
    const currentToken = withinGrace ? decryptGraceToken(sessionObj.rotated_token_enc) : null;
    if (!currentToken) {
        logger.warn({ sessionId: sessionObj.id, userId: sessionObj.user_id }, "Replaced refresh token reused, session ended");
        await deleteUserSessionRepository(sessionObj.id);
        throw new AppError("Invalid refresh token", 401);
    }
    const { accessToken, accessTokenExpiresAt } = await generateUserAccessToken({
        userId: sessionObj.user_id,
        sessionId: sessionObj.id,
    });
    return { accessToken, accessTokenExpiresAt, refreshToken: currentToken, refreshTokenExpiresAt: new Date(sessionObj.expires_at) };
}

/**
 * Invalidates a single session by deleting its `user_sessions` row so the
 * given refresh token can never be used again. Idempotent — a refresh token
 * that doesn't match any session (already logged out, expired and cleaned
 * up, etc.) is treated as a no-op rather than an error, since the caller's
 * goal ("this token should no longer work") is already satisfied.
 */
export const logoutService = async (refreshToken: string | undefined) => {
    if (!refreshToken) {
        return;
    }
    const sessionObj = await fetchOneFromTable({
        table: USER_SESSIONS_TABLE,
        where: [{
            field: "refresh_token_hash",
            operator: "=",
            value: hashToken(refreshToken),
        }],
        useSoftDelete: false,
    }) as UserSessionsInterface | null;
    if (!sessionObj) {
        return;
    }
    await deleteOneFromTable({
        table: USER_SESSIONS_TABLE,
        where: [{
            field: "id",
            operator: "=",
            value: sessionObj.id,
        }],
        useSoftDelete: false,
    });
}
