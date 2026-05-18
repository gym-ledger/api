import { Pool } from "pg";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export const pg = new Pool({
    connectionString: env.DATABASE_URL,

    max: 20,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 5000,
});

export async function connectPostgres() {
    try {
        const client = await pg.connect();

        const result = await client.query("SELECT NOW()");

        logger.info(
            {
                now: result.rows[0].now,
            },
            "Postgres connected"
        );

        client.release();
    } catch (error) {
        logger.fatal(
            { error },
            "Failed to connect to Postgres"
        );

        throw error;
    }
}