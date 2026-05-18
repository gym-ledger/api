import fs from "fs";
import path from "path";
import { pg } from "../infrastructure/postgres/index.js";

const migrationsDir = path.join(
  process.cwd(),
  "src/db/migrations"
);

async function runMigrations() {
  // Ensure tracking table exists

  await pg.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Get already-run migrations

  const executedResult = await pg.query(`
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
      console.log(`Skipping ${file}`);
      continue;
    }

    console.log(`Running ${file}`);

    const sql = fs.readFileSync(
      path.join(migrationsDir, file),
      "utf8"
    );

    try {
      await pg.query("BEGIN");

      await pg.query(sql);

      await pg.query(
        `
        INSERT INTO schema_migrations(filename)
        VALUES ($1)
        `,
        [file]
      );

      await pg.query("COMMIT");

      console.log(`Completed ${file}`);
    } catch (err) {
      await pg.query("ROLLBACK");

      console.error(
        `Failed migration ${file}`
      );

      throw err;
    }
  }

  console.log("All migrations complete");

  process.exit(0);
}

runMigrations();