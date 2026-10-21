/**
 * One CAPTCHA implementation. To add a provider (e.g. Cloudflare Turnstile):
 * implement this, register it in ./index.ts, add its name to
 * CAPTCHA_PROVIDER in config/env.ts, and teach the web app's CaptchaWidget
 * to render it from `clientConfig()`.
 */
export interface CaptchaProvider {
    name: string;
    /** Sent to the apps in GET /auth/config so they know what to render. */
    clientConfig: () => Record<string, unknown>;
    /** Self-hosted providers issue their own challenges (GET /auth/captcha/challenge). */
    createChallenge?: () => Promise<unknown>;
    /** The token the widget produced. False for anything missing, invalid, expired or reused. */
    verify: (token: unknown, ip?: string) => Promise<boolean>;
}
