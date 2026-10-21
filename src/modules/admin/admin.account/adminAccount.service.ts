import { AppError } from "../../../shared/errors/AppError.js";
import { fetchOneFromTable, updateOneInTable } from "../../index/index.repository.js";
import { ADMIN_USER_TABLE, AdminUserInterface } from "../../../db/schemas/admin/admin.schema.js";
import { hashPassword, PASSWORD_MAX_LENGTH, verifyPassword } from "../../../utils/authentication.js";
import { isValidUUID } from "../../../utils/validation.js";
import {
    ADMIN_MAX_ACTIVE_SESSIONS,
    AdminSessionListRow,
    endAdminSessionsRepository,
    fetchActiveAdminSessionsRepository,
    fetchAdminSessionHistoryRepository,
} from "../admin.auth/adminSessions.repository.js";

type Query = Record<string, unknown>;

/** Same floor seed-admin enforces for the first admin's password. */
const ADMIN_PASSWORD_MIN_LENGTH = 12;

const parsePositiveInt = (value: unknown, fallback: number, max: number) => {
    const n = parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(n) || n < 1) {
        return fallback;
    }
    return Math.min(n, max);
}

const fetchAdminOrThrow = async (adminUserId: string) => {
    const admin = await fetchOneFromTable({
        table: ADMIN_USER_TABLE,
        where: [{ field: "id", operator: "=", value: adminUserId }],
    }) as AdminUserInterface | null;
    if (!admin) {
        throw new AppError("Admin not found", 404);
    }
    return admin;
}

export const getAccountService = async ({ adminUserId }: { adminUserId: string }) => {
    const admin = await fetchAdminOrThrow(adminUserId);
    return {
        // Explicit fields only — the row also holds password_hash.
        admin: {
            id: admin.id,
            email: admin.email,
            created_at: admin.created_at,
            password_changed_at: admin.password_changed_at,
        },
        max_active_sessions: ADMIN_MAX_ACTIVE_SESSIONS,
        password_min_length: ADMIN_PASSWORD_MIN_LENGTH,
    };
}

const toSessionView = (row: AdminSessionListRow, currentSessionId: string) => ({
    ...row,
    /** The device making this request. */
    current: row.id === currentSessionId,
});

/**
 * The admin's sign-ins. `scope=active` (default): the active ones, at most
 * ADMIN_MAX_ACTIVE_SESSIONS, unpaginated. `scope=all`: every sign-in ever,
 * ended and expired ones too, newest first, paginated.
 */
export const listSessionsService = async ({
    adminUserId,
    currentSessionId,
    query,
}: {
    adminUserId: string;
    currentSessionId: string;
    query: Query;
}) => {
    if (query.scope === "all") {
        const page = parsePositiveInt(query.page, 1, 100_000);
        const limit = parsePositiveInt(query.limit, 20, 100);
        const { rows, totalCount } = await fetchAdminSessionHistoryRepository(adminUserId, page, limit);
        return {
            data: rows.map((row) => toSessionView(row, currentSessionId)),
            meta: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
            },
        };
    }
    const rows = await fetchActiveAdminSessionsRepository(adminUserId);
    return {
        data: rows.map((row) => toSessionView(row, currentSessionId)),
        meta: { max_active_sessions: ADMIN_MAX_ACTIVE_SESSIONS },
    };
}

/** Signs one other device out. This device signs out through /admin/auth/logout. */
export const endSessionService = async ({
    adminUserId,
    currentSessionId,
    sessionId,
}: {
    adminUserId: string;
    currentSessionId: string;
    sessionId: string;
}) => {
    if (!isValidUUID(sessionId)) {
        throw new AppError("Invalid session id", 400);
    }
    if (sessionId === currentSessionId) {
        throw new AppError("That's this device. Use Log out instead", 400);
    }
    const ended = await endAdminSessionsRepository({ adminUserId, sessionId, reason: "signed_out_remotely" });
    if (ended === 0) {
        throw new AppError("That device is already signed out", 404);
    }
}

export const endOtherSessionsService = async ({
    adminUserId,
    currentSessionId,
}: {
    adminUserId: string;
    currentSessionId: string;
}) => {
    const ended = await endAdminSessionsRepository({
        adminUserId,
        exceptSessionId: currentSessionId,
        reason: "signed_out_others",
    });
    return { signed_out: ended };
}

/**
 * Changes the password after checking the current one, then signs every
 * other device out: if the password leaked, a session may have too. A wrong
 * current password is a 400, not a 401, because the client treats 401 as an
 * expired session.
 */
export const changePasswordService = async ({
    adminUserId,
    currentSessionId,
    data,
}: {
    adminUserId: string;
    currentSessionId: string;
    data: { currentPassword?: unknown; newPassword?: unknown };
}) => {
    const { currentPassword, newPassword } = data ?? {};
    if (typeof currentPassword !== "string" || !currentPassword) {
        throw new AppError("Current password is required", 400);
    }
    if (typeof newPassword !== "string" || !newPassword) {
        throw new AppError("New password is required", 400);
    }
    if (newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
        throw new AppError(`New password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`, 400);
    }
    if (newPassword.length > PASSWORD_MAX_LENGTH) {
        throw new AppError(`New password must be at most ${PASSWORD_MAX_LENGTH} characters`, 400);
    }
    const admin = await fetchAdminOrThrow(adminUserId);
    if (!await verifyPassword(currentPassword, admin.password_hash)) {
        throw new AppError("Current password is incorrect", 400);
    }
    if (newPassword === currentPassword) {
        throw new AppError("New password must be different from the current password", 400);
    }
    if (newPassword.toLowerCase() === admin.email.toLowerCase()) {
        throw new AppError("New password must not be your email", 400);
    }
    const changedAt = new Date();
    await updateOneInTable({
        table: ADMIN_USER_TABLE,
        data: {
            password_hash: await hashPassword(newPassword),
            password_changed_at: changedAt,
        },
        where: [{ field: "id", operator: "=", value: adminUserId }],
    });
    const ended = await endAdminSessionsRepository({
        adminUserId,
        exceptSessionId: currentSessionId,
        reason: "password_changed",
    });
    return { password_changed_at: changedAt, signed_out: ended };
}
