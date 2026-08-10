import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { projectRoot, requireDatabaseUrl } from "./database.mjs";

function backupFileName() {
  return `aureum-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.dump`;
}

async function run(command, args, environment) {
  await new Promise((resolve, reject) => {
    const process = spawn(command, args, { env: environment, stdio: "inherit" });
    process.once("error", reject);
    process.once("exit", (code) => {
      code === 0
        ? resolve(undefined)
        : reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function backup() {
  const databaseUrl = new URL(requireDatabaseUrl());
  const backupDirectory = path.resolve(
    process.env.DATABASE_BACKUP_DIRECTORY?.trim() || path.join(projectRoot, "backups"),
  );
  const target = path.join(backupDirectory, backupFileName());
  const databaseName = databaseUrl.pathname.replace(/^\//, "");

  if (!databaseName) throw new Error("DATABASE_URL must include a database name.");
  await mkdir(backupDirectory, { recursive: true });

  await run(
    process.env.PG_DUMP_PATH?.trim() || "pg_dump",
    [
      "--host",
      databaseUrl.hostname,
      "--port",
      databaseUrl.port || "5432",
      "--username",
      decodeURIComponent(databaseUrl.username),
      "--format=custom",
      "--no-owner",
      "--file",
      target,
      databaseName,
    ],
    {
      ...process.env,
      PGPASSWORD: decodeURIComponent(databaseUrl.password),
      PGSSLMODE:
        process.env.DATABASE_SSL === "verify-full"
          ? "verify-full"
          : process.env.DATABASE_SSL === "require"
            ? "require"
            : "disable",
    },
  );
  console.log(`Backup created: ${target}`);
}

backup().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
