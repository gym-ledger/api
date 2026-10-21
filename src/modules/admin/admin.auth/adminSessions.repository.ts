import { pg } from "../../../infrastructure/postgres/index.js";
import { AppError } from "../../../shared/errors/AppError.js";
import type { RequestDevice } from "../../../utils/requestDevice.js";

/** Sign-ins an admin can have active at once; a new one replaces the least recently used. */
export const ADMIN_MAX_ACTIVE_SESSIONS = 5;

export type AdminSessionEndReason =
    | "logout"
    | "signed_out_remotely"
    | "signed_out_others"
    | "password_changed"
    | "session_limit";

export interface AdminSessionRow {
    id: string;
    admin_user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
    revoked_reason: AdminSessionEndReason | null;
}

/** A session as the My Devices list shows it. */
export interface AdminSessionListRow {
    id: string;
    status: "active" | "expired" | "ended";
    ended_reason: AdminSessionEndReason | null;
    /** revoked_at, or expires_at once it has passed. */
    ended_at: Date | null;
    created_at: Date;
    last_used_at: Date;
    expires_at: Date;
    ip_address: string | null;
    last_ip_address: string | null;
    user_agent: string | null;
    browser: string | null;
    os: string | null;
    device_type: string;
    city: string | null;
    region: string | null;
    country: string | null;
}

const active = (alias = "") => `${alias}revoked_at IS NULL AND ${alias}expires_at > NOW()`;

const deviceValues = (device: RequestDevice) => [
    device.ip,
    device.user_agent,
    device.browser,
    device.os,
    device.device_type,
    device.city,
    device.region,
    device.country,
];

/**
 * Starts a session for a sign-in. With ADMIN_MAX_ACTIVE_SESSIONS already
 * active, the least recently used ones are ended ("session_limit") first.
 * The admin row is locked so two sign-ins at once can't both slip under the
 * limit.
 */
export const createAdminSessionRepository = async (data: {
    adminUserId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    device: RequestDevice,
}): Promise<{ id: string, replaced: number }> => {
    const client = await pg.connect();
    try {
        await client.query("BEGIN");
        await client.query(`SELECT id FROM admin_users WHERE id = $1 FOR UPDATE`, [data.adminUserId]);
        const replaced = await client.query(`
        UPDATE admin_sessions
        SET revoked_at = NOW(), revoked_reason = 'session_limit'
        WHERE id IN (
            SELECT id
            FROM admin_sessions
            WHERE admin_user_id = $1 AND ${active()}
            ORDER BY last_used_at DESC
            OFFSET $2
        )
        `, [data.adminUserId, ADMIN_MAX_ACTIVE_SESSIONS - 1]);
        const inserted = await client.query(`
        INSERT INTO admin_sessions (
            admin_user_id, refresh_token_hash, expires_at,
            ip_address, user_agent, browser, os, device_type, city, region, country,
            last_ip_address
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $4)
        RETURNING id
        `, [data.adminUserId, data.refreshTokenHash, data.expiresAt, ...deviceValues(data.device)]);
        await client.query("COMMIT");
        return { id: inserted.rows[0].id, replaced: replaced.rowCount ?? 0 };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        // console.log(error);
        throw new AppError("Failed to start session", 500);
    } finally {
        client.release();
    }
}

/** The session a refresh token belongs to (ended or expired ones too), if its admin still exists. */
export const fetchAdminSessionByRefreshHashRepository = async (refreshTokenHash: string): Promise<AdminSessionRow | null> => {
    const result = await pg.query(`
    SELECT s.id, s.admin_user_id, s.expires_at, s.revoked_at, s.revoked_reason
    FROM admin_sessions s
    INNER JOIN admin_users a ON a.id = s.admin_user_id AND a.deleted_at IS NULL
    WHERE s.refresh_token_hash = $1
    `, [refreshTokenHash]);
    return result.rows[0] ?? null;
}

/**
 * Swaps the session's refresh token for a new one and records the device
 * that used it. Matches on the old hash too, so of two refreshes racing with
 * the same token only one wins. `false` when this one lost or the session
 * has ended.
 */
export const rotateAdminSessionRepository = async (data: {
    sessionId: string,
    oldHash: string,
    newHash: string,
    expiresAt: Date,
    device: RequestDevice,
}): Promise<boolean> => {
    const result = await pg.query(`
    UPDATE admin_sessions
    SET refresh_token_hash = $3,
        expires_at = $4,
        last_used_at = NOW(),
        last_ip_address = $5,
        user_agent = COALESCE($6, user_agent),
        browser = COALESCE($7, browser),
        os = COALESCE($8, os),
        device_type = CASE WHEN $9::varchar = 'unknown' THEN device_type ELSE $9::varchar END,
        city = $10,
        region = $11,
        country = $12
    WHERE id = $1
        AND refresh_token_hash = $2
        AND ${active()}
    `, [data.sessionId, data.oldHash, data.newHash, data.expiresAt, ...deviceValues(data.device)]);
    return (result.rowCount ?? 0) > 0;
}

/**
 * Ends active sessions of one admin: a single one (`sessionId`), or all but
 * `exceptSessionId`. Returns how many ended.
 */
export const endAdminSessionsRepository = async (data: {
    adminUserId: string,
    reason: AdminSessionEndReason,
    sessionId?: string,
    exceptSessionId?: string,
}): Promise<number> => {
    const params: unknown[] = [data.adminUserId, data.reason];
    let filter = "";
    if (data.sessionId) {
        params.push(data.sessionId);
        filter += ` AND id = $${params.length}`;
    }
    if (data.exceptSessionId) {
        params.push(data.exceptSessionId);
        filter += ` AND id <> $${params.length}`;
    }
    const result = await pg.query(`
    UPDATE admin_sessions
    SET revoked_at = NOW(), revoked_reason = $2
    WHERE admin_user_id = $1 AND ${active()}${filter}
    `, params);
    return result.rowCount ?? 0;
}

/** Ends the session holding this refresh token (sign-out on that device). */
export const endAdminSessionByRefreshHashRepository = async (refreshTokenHash: string): Promise<void> => {
    await pg.query(`
    UPDATE admin_sessions
    SET revoked_at = NOW(), revoked_reason = 'logout'
    WHERE refresh_token_hash = $1 AND revoked_at IS NULL
    `, [refreshTokenHash]);
}

/** The admin behind an access token, if the session it was issued for is still active. */
export const fetchAdminForActiveSessionRepository = async (adminUserId: string, sessionId: string) => {
    const result = await pg.query(`
    SELECT a.id, a.email, a.created_at, a.updated_at
    FROM admin_users a
    INNER JOIN admin_sessions s ON s.admin_user_id = a.id
    WHERE a.id = $1
        AND a.deleted_at IS NULL
        AND s.id = $2
        AND ${active("s.")}
    `, [adminUserId, sessionId]);
    return result.rows[0] ?? null;
}

const LIST_COLUMNS = `
    id,
    CASE
        WHEN revoked_at IS NOT NULL THEN 'ended'
        WHEN expires_at <= NOW() THEN 'expired'
        ELSE 'active'
    END AS status,
    revoked_reason AS ended_reason,
    CASE
        WHEN revoked_at IS NOT NULL THEN revoked_at
        WHEN expires_at <= NOW() THEN expires_at
    END AS ended_at,
    created_at,
    last_used_at,
    expires_at,
    ip_address,
    last_ip_address,
    user_agent,
    browser,
    os,
    COALESCE(device_type, 'unknown') AS device_type,
    city,
    region,
    country
`;

/** Active sessions, most recently used first (at most ADMIN_MAX_ACTIVE_SESSIONS). */
export const fetchActiveAdminSessionsRepository = async (adminUserId: string): Promise<AdminSessionListRow[]> => {
    const result = await pg.query(`
    SELECT ${LIST_COLUMNS}
    FROM admin_sessions
    WHERE admin_user_id = $1 AND ${active()}
    ORDER BY last_used_at DESC
    `, [adminUserId]);
    return result.rows;
}

/** Every session ever, newest sign-in first. */
export const fetchAdminSessionHistoryRepository = async (adminUserId: string, page: number, limit: number) => {
    const [rows, count] = await Promise.all([
        pg.query(`
        SELECT ${LIST_COLUMNS}
        FROM admin_sessions
        WHERE admin_user_id = $1
        ORDER BY created_at DESC, id
        LIMIT $2 OFFSET $3
        `, [adminUserId, limit, (page - 1) * limit]),
        pg.query(`SELECT COUNT(*)::int AS total FROM admin_sessions WHERE admin_user_id = $1`, [adminUserId]),
    ]);
    return { rows: rows.rows as AdminSessionListRow[], totalCount: count.rows[0].total as number };
}
