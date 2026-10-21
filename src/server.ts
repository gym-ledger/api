import app from "./app.js";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectPostgres } from "./infrastructure/postgres/index.js";
import { connectRedis } from "./infrastructure/redis/index.js";
import { startBackgroundJobs } from "./jobs/index.js";

async function bootstrap() {
    try {
        await connectPostgres();
        await connectRedis();

        startBackgroundJobs();

        const server = app.listen(env.PORT, () => {
            // console.log(`Server running on ${env.PORT}`);
            logger.info(`Server running on ${env.PORT}`);
        });

        process.on("SIGTERM", async () => {
            // console.log("SIGTERM received");
            logger.info("SIGTERM received");

            server.close(async () => {
                // console.log("HTTP server closed");
                logger.info("HTTP server closed");

                process.exit(0);
            });
        });

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

bootstrap();