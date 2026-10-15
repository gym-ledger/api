import "dotenv/config";
import { z } from "zod";

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