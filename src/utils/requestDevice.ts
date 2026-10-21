import type { Request } from "express";

export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export interface RequestDevice {
    /** `req.ip`: the client's address when TRUST_PROXY_HOPS matches the proxies in front of the API. */
    ip: string | null;
    user_agent: string | null;
    browser: string | null;
    os: string | null;
    device_type: DeviceType;
    city: string | null;
    region: string | null;
    country: string | null;
}

// Order matters: Edge, Opera and Samsung Internet also say "Chrome", and
// Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"],
    [/(?:OPR|Opera)\/(\d+)/, "Opera"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/Firefox\/(\d+)|FxiOS\/(\d+)/, "Firefox"],
    [/CriOS\/(\d+)|Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
];

const parseBrowser = (ua: string): string | null => {
    for (const [pattern, name] of BROWSERS) {
        const match = ua.match(pattern);
        if (match) {
            const version = match.slice(1).find(Boolean);
            return version ? `${name} ${version}` : name;
        }
    }
    return null;
}

const parseOs = (ua: string): string | null => {
    if (/iPad/.test(ua)) return "iPadOS";
    if (/iPhone|iPod/.test(ua)) {
        const v = ua.match(/OS (\d+)_/);
        return v ? `iOS ${v[1]}` : "iOS";
    }
    if (/Android/.test(ua)) {
        const v = ua.match(/Android (\d+)/);
        return v ? `Android ${v[1]}` : "Android";
    }
    if (/CrOS/.test(ua)) return "ChromeOS";
    // Browsers freeze the Windows and macOS versions in the user agent, so
    // the version there isn't worth showing.
    if (/Windows/.test(ua)) return "Windows";
    if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
    if (/Linux/.test(ua)) return "Linux";
    return null;
}

const parseDeviceType = (ua: string): DeviceType => {
    if (/iPad|Tablet|(?=.*Android)(?!.*Mobile)/.test(ua)) return "tablet";
    if (/Mobi|iPhone|iPod|Android/.test(ua)) return "mobile";
    if (/Windows|Macintosh|Mac OS X|Linux|CrOS/.test(ua)) return "desktop";
    return "unknown";
}

const header = (req: Request, name: string, max: number): string | null => {
    const value = req.headers[name];
    const text = Array.isArray(value) ? value[0] : value;
    if (!text) return null;
    const trimmed = text.trim();
    return trimmed && trimmed.toUpperCase() !== "XX" ? trimmed.slice(0, max) : null;
}

/**
 * Who is making this request: IP, browser, OS and device type from the
 * User-Agent, and location from Cloudflare's visitor-location headers when
 * the API sits behind Cloudflare (cf-ipcountry is on by default; city and
 * region need the "Add visitor location headers" managed transform). No
 * third-party lookup is made.
 */
export const requestDevice = (req: Request): RequestDevice => {
    const ua = header(req, "user-agent", 512);
    return {
        ip: req.ip ? req.ip.replace(/^::ffff:/, "").slice(0, 64) : null,
        user_agent: ua,
        browser: ua ? parseBrowser(ua) : null,
        os: ua ? parseOs(ua) : null,
        device_type: ua ? parseDeviceType(ua) : "unknown",
        city: header(req, "cf-ipcity", 100),
        region: header(req, "cf-region", 100),
        country: header(req, "cf-ipcountry", 2)?.toUpperCase() ?? null,
    };
}
