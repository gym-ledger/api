import { env } from "../../config/env.js";
import { altchaProvider } from "./altcha.js";
import type { CaptchaProvider } from "./types.js";

export type { CaptchaProvider } from "./types.js";

const PROVIDERS: Record<Exclude<typeof env.CAPTCHA_PROVIDER, "none">, CaptchaProvider> = {
    altcha: altchaProvider,
};

/** null when CAPTCHA_PROVIDER=none: requireCaptcha lets everything through. */
export const captcha: CaptchaProvider | null =
    env.CAPTCHA_PROVIDER === "none" ? null : PROVIDERS[env.CAPTCHA_PROVIDER];
