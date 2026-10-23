import { pg } from "../../infrastructure/postgres/index.js";

export interface UserSessionRow {
    id: string;
    user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
    rotated_token_enc: string | null;
    rotated_at: Date | null;
    /** The user's, so callers can tell load-test accounts apart. */
    email: string | null;
}

const SESSION_COLUMNS = "s.id, s.user_id, s.expires_at, s.revoked_at, s.rotated_token_enc, s.rotated_at, u.email";

/**
 * The session whose current refresh token (`column` = refresh_token_hash) or
 * just-replaced one (previous_refresh_token_hash) has this hash, if its user
 * still exists.
 */
export const fetchUserSessionByHashRepository = async (
    column: "refresh_token_hash" | "previous_refresh_token_hash",
    hash: string,
): Promise<UserSessionRow | null> => {
    const result = await pg.query(`
    SELECT ${SESSION_COLUMNS}
    FROM user_sessions s
    INNER JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
    WHERE s.${column} = $1
    `, [hash]);
    return result.rows[0] ?? null;
}

/**
 * Swaps the session's refresh token for a new one, keeping the old hash and
 * the new token (encrypted) for the reuse grace window. Matches on the old
 * hash too, so of two refreshes racing with the same token only one wins.
 * `false` when this one lost or the session has ended.
 */
export const rotateUserSessionRepository = async (data: {
    sessionId: string,
    oldHash: string,
    newHash: string,
    newTokenEnc: string,
    expiresAt: Date,
}): Promise<boolean> => {
    const result = await pg.query(`
    UPDATE user_sessions
    SET refresh_token_hash = $3,
        previous_refresh_token_hash = $2,
        rotated_token_enc = $4,
        rotated_at = NOW(),
        expires_at = $5,
        last_used_at = NOW()
    WHERE id = $1
        AND refresh_token_hash = $2
        AND revoked_at IS NULL
        AND expires_at > NOW()
    `, [data.sessionId, data.oldHash, data.newHash, data.newTokenEnc, data.expiresAt]);
    return (result.rowCount ?? 0) > 0;
}

export const deleteUserSessionRepository = async (sessionId: string): Promise<void> => {
    await pg.query(`DELETE FROM user_sessions WHERE id = $1`, [sessionId]);
}

/** Signs the user out everywhere except `exceptSessionId`. Returns how many sessions ended. */
export const deleteOtherUserSessionsRepository = async (userId: string, exceptSessionId: string): Promise<number> => {
    const result = await pg.query(`DELETE FROM user_sessions WHERE user_id = $1 AND id <> $2`, [userId, exceptSessionId]);
    return result.rowCount ?? 0;
}

/** The user behind an access token, if the session it was issued for is still active. */
export const fetchUserForActiveSessionRepository = async (userId: string, sessionId: string) => {
    const result = await pg.query(`
    SELECT u.id, u.phone_country_code, u.phone_number, u.email, u.first_name, u.last_name,
        u.created_at, u.updated_at, u.deleted_at
    FROM users u
    INNER JOIN user_sessions s ON s.user_id = u.id
    WHERE u.id = $1
        AND u.deleted_at IS NULL
        AND s.id = $2
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
    `, [userId, sessionId]);
    return result.rows[0] ?? null;
}
