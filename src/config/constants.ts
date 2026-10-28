/** Mount point of every API route (see app.ts). Refresh cookies are scoped under it. */
export const API_PREFIX = "/api/v1";

/**
 * Version of the terms of use (/terms) and privacy policy (/privacy) the web
 * app shows; users accept both together. Bump it together with either page's
 * text there; every user is asked to accept again.
 */
export const PRIVACY_POLICY_VERSION = "2026-10-28.1";

/**
 * How long a refresh token that was just swapped for a new one still works
 * (migration 038). Within it, the old token gets the same new token back:
 * covers a retry after a dropped response and two tabs refreshing at once.
 * After it, the old token coming back ends the session as likely stolen.
 */
export const REFRESH_REUSE_GRACE_MS = 60_000;

/**
 * Email domain of the accounts seed-load-users.ts creates for load testing
 * (load-tester/). `.invalid` is reserved (RFC 2606): no real address uses it,
 * so these accounts can always be told apart and purged.
 */
export const LOAD_TEST_EMAIL_DOMAIN = "loadtest.invalid";
