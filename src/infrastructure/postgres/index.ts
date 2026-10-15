import pgLib, { Pool } from "pg";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

// NUMERIC/DECIMAL columns (set weights, RIR, height, body weight, muscle
// signals…) come back from `pg` as strings by default, so clients doing
// `weight + tool_weight` concatenated instead of adding. All of ours fit
// comfortably in a double, so parse them as numbers once, here.
pgLib.types.setTypeParser(pgLib.types.builtins.NUMERIC, (value) => parseFloat(value));

export const pg = new Pool({
    connectionString: env.DATABASE_URL,

    max: 20,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 5000,
});

pg.on("connect", async (client) => {
    await client.query(`
        SET TIME ZONE 'UTC'
    `);
    await client.query(`
        SET statement_timeout = '30s'
    `);
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
process.on("SIGTERM", async () => {
    await pg.end();
});