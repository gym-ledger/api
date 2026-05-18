import app from "./app.js";

import { env } from "./config/env.js";
import { connectPostgres } from "./infrastructure/postgres/index.js";
import { connectRedis } from "./infrastructure/redis/index.js";

async function bootstrap() {
    try {
        await connectPostgres();
        // await connectRedis();

        const server = app.listen(env.PORT, () => {
            console.log(`Server running on ${env.PORT}`);
        });

        process.on("SIGTERM", async () => {
            console.log("SIGTERM received");

            server.close(async () => {
                console.log("HTTP server closed");

                process.exit(0);
            });
        });

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

bootstrap();