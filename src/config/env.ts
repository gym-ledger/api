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

    OTP_SALT: z.string().min(1),
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