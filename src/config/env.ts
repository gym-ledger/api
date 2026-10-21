import "dotenv/config";
import { z } from "zod";

// Empty strings in .env files ("FOO=") mean "unset", not "set to empty".
const optionalString = z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().optional()
);

const booleanFlag = (defaultValue: boolean) => z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(["true", "false"]).default(defaultValue ? "true" : "false").transform((v) => v === "true")
);

const envSchema = z.object({
    NODE_ENV: z.enum([
        "development",
        "production",
        "test"
    ]),

    PORT: z.coerce.number(),

    DATABASE_URL: z.string().min(1),

    REDIS_URL: z.string().min(1),

    LOG_LEVEL: z.enum([
        "fatal",
        "error",
        "warn",
        "info",
        "debug",
        "trace"
    ]).default("info"),

    ACCESS_TOKEN_SECRET: z.string().min(10),
    ADMIN_ACCESS_TOKEN_SECRET: z.string().min(10),

    // Number of reverse-proxy hops in front of the API (e.g. 1 behind nginx).
    // Unset = trust none, so req.ip is the direct peer. Must be set when
    // proxied, otherwise every client shares the proxy's rate-limit bucket.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).optional(),

    // Optional universal login OTP (dev/testing). Unset or empty = no OTP
    // bypass at all. Never accepted by the forgot-password flow.
    MASTER_LOGIN_OTP: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z.string().regex(/^[0-9]{6}$/, "must be exactly 6 digits").optional()
    ),

    // Comma-separated browser origins allowed to call the API, e.g.
    // "https://app.example.com,https://admin.example.com". Required in
    // production. Unset in development = any origin is allowed.
    CORS_ORIGINS: optionalString.transform((v) =>
        v ? v.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean) : []
    ),

    // Refresh tokens live in an httpOnly cookie. Secure (HTTPS-only) defaults
    // to on in production; set COOKIE_SECURE=false only if the API is served
    // over plain HTTP, or browsers will drop the cookie.
    COOKIE_SECURE: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true"))
    ),
    // "strict"/"lax" when the front-ends share a site with the API (e.g.
    // app.example.com + api.example.com, or the same host on other ports).
    // "none" when they are on unrelated domains — that also requires HTTPS.
    COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("strict"),
    // Optional cookie Domain attribute. Leave unset to scope the cookie to
    // the API host only, which is right for nearly every setup.
    COOKIE_DOMAIN: optionalString,

    // Product name shown in OTP emails.
    APP_NAME: optionalString.transform((v) => v ?? "Gym Ledger"),

    // Email OTP delivery (Resend). Required in production.
    RESEND_API_KEY: optionalString,
    // Verified sender in Resend, e.g. "Gym Ledger <no-reply@example.com>".
    EMAIL_FROM: optionalString,

    // Phone OTP delivery over WhatsApp (Twilio). Off by default; when off,
    // phone numbers can still sign in with a password but cannot get codes.
    PHONE_OTP_ENABLED: booleanFlag(false),
    TWILIO_ACCOUNT_SID: optionalString,
    TWILIO_AUTH_TOKEN: optionalString,
    // Sender: either a WhatsApp-enabled number in E.164 ("+14155238886") or
    // a Messaging Service SID ("MG..."). One of the two is required.
    TWILIO_WHATSAPP_FROM: optionalString,
    TWILIO_MESSAGING_SERVICE_SID: optionalString,
    // Content SID ("HX...") of an approved WhatsApp *authentication* template
    // whose variable {{1}} is the code.
    TWILIO_WHATSAPP_CONTENT_SID: optionalString,

    // AI weekly check-ins (Groq, OpenAI-compatible API). Unset key = the
    // check-in card still shows the week's numbers, just without the
    // written coach note.
    GROQ_API_KEY: optionalString,
    // Must support strict JSON-schema output on Groq (gpt-oss-120b/20b do).
    GROQ_MODEL: optionalString.transform((v) => v ?? "openai/gpt-oss-120b"),
    // Our own ceiling on model calls per UTC day, kept under Groq's free
    // per-day quota (about 1,000 on the large models) so a burst of users
    // can't push every request into 429s.
    GROQ_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).default(900),

    // CAPTCHA on the "send code" endpoints (infrastructure/captcha).
    //   altcha  self-hosted proof-of-work, nothing sent to a third party (default)
    //   none    no CAPTCHA (local testing, or behind your own bot protection)
    CAPTCHA_PROVIDER: z.enum(["altcha", "none"]).default("altcha"),
    // Signs ALTCHA challenges. Required in production (generate-secrets.sh
    // fills it in); in development one is derived from ACCESS_TOKEN_SECRET.
    CAPTCHA_SECRET: optionalString.pipe(z.string().min(32, "must be at least 32 characters").optional()),
}).superRefine((env, ctx) => {
    const requireKey = (key: keyof typeof env, why: string) => {
        if (!env[key]) {
            ctx.addIssue({ code: "custom", path: [key], message: `required ${why}` });
        }
    };

    if (env.NODE_ENV === "production") {
        // Without these no new user can sign up (accounts are created by
        // email OTP), so refuse to boot rather than ship a silent stub.
        requireKey("RESEND_API_KEY", "in production (email OTP delivery)");
        requireKey("EMAIL_FROM", "in production (email OTP delivery)");
        if (env.CORS_ORIGINS.length === 0) {
            ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "required in production" });
        }
        if (env.CAPTCHA_PROVIDER === "altcha") {
            requireKey("CAPTCHA_SECRET", "in production when CAPTCHA_PROVIDER=altcha");
        }
        // A universal login code for every account; dev/testing only.
        if (env.MASTER_LOGIN_OTP) {
            ctx.addIssue({ code: "custom", path: ["MASTER_LOGIN_OTP"], message: "must not be set in production (it logs anyone in as any account)" });
        }
    }
    if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
        requireKey("EMAIL_FROM", "when RESEND_API_KEY is set");
    }

    if (env.PHONE_OTP_ENABLED) {
        requireKey("TWILIO_ACCOUNT_SID", "when PHONE_OTP_ENABLED=true");
        requireKey("TWILIO_AUTH_TOKEN", "when PHONE_OTP_ENABLED=true");
        requireKey("TWILIO_WHATSAPP_CONTENT_SID", "when PHONE_OTP_ENABLED=true");
        if (!env.TWILIO_WHATSAPP_FROM && !env.TWILIO_MESSAGING_SERVICE_SID) {
            ctx.addIssue({
                code: "custom",
                path: ["TWILIO_WHATSAPP_FROM"],
                message: "TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID is required when PHONE_OTP_ENABLED=true",
            });
        }
    }
    if (env.TWILIO_WHATSAPP_FROM && !/^\+[1-9][0-9]{6,14}$/.test(env.TWILIO_WHATSAPP_FROM.replace(/^whatsapp:/, ""))) {
        ctx.addIssue({ code: "custom", path: ["TWILIO_WHATSAPP_FROM"], message: "must be an E.164 number like +14155238886" });
    }
    if (env.TWILIO_MESSAGING_SERVICE_SID && !/^MG[0-9a-fA-F]{32}$/.test(env.TWILIO_MESSAGING_SERVICE_SID)) {
        ctx.addIssue({ code: "custom", path: ["TWILIO_MESSAGING_SERVICE_SID"], message: "must look like MG followed by 32 hex characters" });
    }
    if (env.TWILIO_WHATSAPP_CONTENT_SID && !/^HX[0-9a-fA-F]{32}$/.test(env.TWILIO_WHATSAPP_CONTENT_SID)) {
        ctx.addIssue({ code: "custom", path: ["TWILIO_WHATSAPP_CONTENT_SID"], message: "must look like HX followed by 32 hex characters" });
    }

    if (env.COOKIE_SAMESITE === "none" && env.COOKIE_SECURE === false) {
        ctx.addIssue({ code: "custom", path: ["COOKIE_SAMESITE"], message: "\"none\" requires COOKIE_SECURE=true (browsers reject it otherwise)" });
    }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error(
        "Invalid environment variables:",
        parsed.error.flatten().fieldErrors
    );

    process.exit(1);
}

export const env = parsed.data;
