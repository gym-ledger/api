import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env.js";
import { API_PREFIX } from "../config/constants.js";

/**
 * Refresh tokens travel only in httpOnly cookies, so page JavaScript (and any
 * XSS) can never read them. Each cookie is scoped to its own auth routes:
 * the browser sends it to refresh / logout and nowhere else.
 */
const REFRESH_COOKIES = {
    user: { name: "wg_refresh", path: `${API_PREFIX}/auth` },
    admin: { name: "wg_admin_refresh", path: `${API_PREFIX}/admin/auth` },
} as const;

export type RefreshCookieKind = keyof typeof REFRESH_COOKIES;

const baseOptions = (kind: RefreshCookieKind): CookieOptions => ({
    httpOnly: true,
    secure: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
    sameSite: env.COOKIE_SAMESITE,
    path: REFRESH_COOKIES[kind].path,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const setRefreshCookie = (res: Response, kind: RefreshCookieKind, refreshToken: string, expiresAt: Date) => {
    res.cookie(REFRESH_COOKIES[kind].name, refreshToken, {
        ...baseOptions(kind),
        expires: expiresAt,
    });
}

export const clearRefreshCookie = (res: Response, kind: RefreshCookieKind) => {
    // Attributes must match the ones the cookie was set with, or it survives.
    res.clearCookie(REFRESH_COOKIES[kind].name, baseOptions(kind));
}

/** Reads the refresh cookie from the raw Cookie header (no cookie-parser needed). */
export const readRefreshCookie = (req: Request, kind: RefreshCookieKind): string | undefined => {
    const header = req.headers.cookie;
    if (!header) {
        return undefined;
    }
    const name = REFRESH_COOKIES[kind].name;
    for (const part of header.split(";")) {
        const separator = part.indexOf("=");
        if (separator === -1 || part.slice(0, separator).trim() !== name) {
            continue;
        }
        const raw = part.slice(separator + 1).trim();
        try {
            return decodeURIComponent(raw) || undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
}
