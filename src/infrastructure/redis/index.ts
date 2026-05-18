import { createClient } from "redis";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export const redis = createClient({
    url: env.REDIS_URL,
});

redis.on("error", (error) => {
    logger.error(
        { error },
        "Redis client error"
    );
});

export async function connectRedis() {
    try {
        await redis.connect();

        logger.info("Redis connected");
    } catch (error) {
        logger.fatal(
            { error },
            "Failed to connect Redis"
        );

        throw error;
    }
}