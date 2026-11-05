import type { Request } from "express";
import { z } from "zod";
import { AppError } from "../../shared/errors/AppError.js";

/**
 * How a user's refresh token travels between the API and the client.
 *
 * - Browser (web): an httpOnly cookie, so page JavaScript can never read it.
 * - Native app (ios / android): the native app's page and the API are
 *   different sites, so the WebView drops the API's cookie as third-party.
 *   The app keeps the token in the device's secure storage instead: it gets
 *   it in the sign-in response body and sends it back as
 *   `Authorization: Refresh <token>`.
 *
 * The two never mix. A session remembers which platform signed it in
 * (`user_sessions.platform`, migration 046), and its token is only accepted
 * over that platform's transport. A request that carries the header is
 * handled in header mode, which never reads the cookie. So a script injected
 * into the web app can't turn the web cookie into a token it can read.
 */

export const SESSION_PLATFORMS = ["web", "ios", "android"] as const;
export type SessionPlatform = (typeof SESSION_PLATFORMS)[number];

const CLIENT_PLATFORM_HEADER = "x-client-platform";

// generateRefreshToken() makes 128 hex characters; a little headroom either way.
const refreshAuthorization = z.string().regex(/^Refresh [0-9a-f]{64,256}$/);

/**
 * The platform a sign-in comes from: the `X-Client-Platform` header the native
 * app sends ("ios" / "android"), or "web" without it. Any other value is a 400,
 * so a typo can't silently fall back to the cookie.
 */
export const clientPlatformOf = (req: Request): SessionPlatform => {
    const raw = req.headers[CLIENT_PLATFORM_HEADER];
    if (raw === undefined) {
        return "web";
    }
    if (raw === "ios" || raw === "android") {
        return raw;
    }
    throw new AppError("X-Client-Platform must be ios or android", 400);
};

export type RefreshTokenSource =
    | { mode: "header", token: string }
    | { mode: "cookie" };

/**
 * Header mode when the request has `Authorization: Refresh <token>` (the
 * native app). Otherwise cookie mode: the caller reads the cookie itself.
 * A malformed `Refresh` value is a 401, like any unusable refresh token.
 */
export const refreshTokenSourceOf = (req: Request): RefreshTokenSource => {
    const authorization = req.headers.authorization;
    if (authorization === undefined || !/^Refresh\b/i.test(authorization)) {
        return { mode: "cookie" };
    }
    const parsed = refreshAuthorization.safeParse(authorization);
    if (!parsed.success) {
        throw new AppError("Invalid refresh token", 401);
    }
    return { mode: "header", token: parsed.data.slice("Refresh ".length) };
};

/** Whether a session signed in on `platform` may be refreshed or ended in `mode`. */
export const platformMatchesMode = (platform: SessionPlatform, mode: RefreshTokenSource["mode"]) =>
    mode === "header" ? platform !== "web" : platform === "web";
