/** Mount point of every API route (see app.ts). Refresh cookies are scoped under it. */
export const API_PREFIX = "/api/v1";

/**
 * Version (date) of the privacy policy the web app shows at /privacy. Bump it
 * together with the policy text there; every user is asked to accept again.
 */
export const PRIVACY_POLICY_VERSION = "2026-10-21";
