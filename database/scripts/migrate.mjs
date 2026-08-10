import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { createDatabasePool, databaseTarget, projectRoot } from "./database.mjs";

const migrationsDirectory = path.join(projectRoot, "database", "migrations");
const migrationNamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;
const advisoryLockName = "aureum-schema-migrations-v1";

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function migrationFiles() {
  return (await readdir(migrationsDirectory))
    .filter((file) => migrationNamePattern.test(file))
    .sort((left, right) => left.localeCompare(right));
}

async function migrate() {
  const pool = createDatabasePool({ applicationName: "aureum-migrate" });
  const client = await pool.connect();

  try {
    console.log(`Connecting to ${databaseTarget()}`);
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [advisoryLockName]);
    await client.query("CREATE SCHEMA IF NOT EXISTS aureum");
    await client.query(`
      CREATE TABLE IF NOT EXISTS aureum.schema_migrations (
        version varchar(255) PRIMARY KEY,
        checksum char(64) NOT NULL,
        execution_ms integer NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query(
      "SELECT version, checksum FROM aureum.schema_migrations ORDER BY version",
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.version, row.checksum.trim()]),
    );

    for (const file of await migrationFiles()) {
      const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
      const fileChecksum = checksum(sql);
      const appliedChecksum = applied.get(file);

      if (appliedChecksum) {
        if (appliedChecksum !== fileChecksum) {
          throw new Error(
            `Applied migration ${file} has changed. Add a new migration instead of editing migration history.`,
          );
        }

        console.log(`Already applied ${file}`);
        continue;
      }

      const startedAt = Date.now();
      await client.query("BEGIN");

      try {
        await client.query(sql);
        await client.query(
          `
            INSERT INTO aureum.schema_migrations (version, checksum, execution_ms)
            VALUES ($1, $2, $3)
          `,
          [file, fileChecksum, Date.now() - startedAt],
        );
        await client.query("COMMIT");
        console.log(`Applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("Database migrations are current.");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [advisoryLockName]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

migrate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
