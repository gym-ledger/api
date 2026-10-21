import fs from "fs";
import path from "path";
import { logger } from "../config/logger.js";
import { pg } from "../infrastructure/postgres/index.js";

const migrationsDir = path.join(
  process.cwd(),
  "src/db/migrations"
);

// Arbitrary app-specific key; serializes concurrent runners (e.g. two
// containers booting at once — entrypoint.sh migrates on every start).
const MIGRATION_LOCK_KEY = 7_340_211;

async function runMigrations() {
  // A transaction must run on ONE connection. `pg.query` on the Pool checks out
  // any idle client per call, so BEGIN / migration / COMMIT could otherwise land
  // on different connections and a failed migration would not roll back.
  const client = await pg.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    // Ensure tracking table exists

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Get already-run migrations (read after taking the lock, so a runner that
    // waited sees what the other one applied)

    const executedResult = await client.query(`
      SELECT filename
      FROM schema_migrations
    `);

    const executedMigrations = new Set(
      executedResult.rows.map(
        row => row.filename
      )
    );

    // Read migration files

    const files = fs
      .readdirSync(migrationsDir)
      .filter(file => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (executedMigrations.has(file)) {
        // console.log(`Skipping ${file}`);
        logger.info(`Skipping ${file}`);
        continue;
      }

      // console.log(`Running ${file}`);
      logger.info(`Running ${file}`);

      const sql = fs.readFileSync(
        path.join(migrationsDir, file),
        "utf8"
      );

      try {
        await client.query("BEGIN");

        await client.query(sql);

        await client.query(
          `
          INSERT INTO schema_migrations(filename)
          VALUES ($1)
          `,
          [file]
        );

        await client.query("COMMIT");

        // console.log(`Completed ${file}`);
        logger.info(`Completed ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");

        console.error(
          `Failed migration ${file}`
        );

        throw err;
      }
    }

    // console.log("All migrations complete");
    logger.info("All migrations complete");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
