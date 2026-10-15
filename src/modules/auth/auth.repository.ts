import { pg } from "../../infrastructure/postgres/index.js";
import { OTP_AUTH_TABLE } from "../../db/schemas/auth/otp.auth.schema.js";

/**
 * Atomically consumes one verification attempt for an OTP row. Returns the
 * new attempt count, or null when the row has no attempts left (or is gone /
 * already verified). Claiming *before* checking the code means parallel
 * guesses can't all read the same stale count and slip past the limit.
 */
export const claimOtpAttemptRepository = async (otpId: string, maxAttempts: number): Promise<number | null> => {
    const result = await pg.query(
        `UPDATE ${OTP_AUTH_TABLE}
        SET attempts = attempts + 1, last_attempted_at = NOW()
        WHERE id = $1 AND attempts < $2 AND verified_at IS NULL
        RETURNING attempts`,
        [otpId, maxAttempts],
    );
    return result.rows[0]?.attempts ?? null;
}
