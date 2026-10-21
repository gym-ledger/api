/** Mount point of every API route (see app.ts). Refresh cookies are scoped under it. */
export const API_PREFIX = "/api/v1";

/**
 * Version (date) of the privacy policy the web app shows at /privacy. Bump it
 * together with the policy text there; every user is asked to accept again.
 */
export const PRIVACY_POLICY_VERSION = "2026-10-21";

/**
 * How long a refresh token that was just swapped for a new one still works
 * (migration 038). Within it, the old token gets the same new token back:
 * covers a retry after a dropped response and two tabs refreshing at once.
 * After it, the old token coming back ends the session as likely stolen.
 */
export const REFRESH_REUSE_GRACE_MS = 60_000;
