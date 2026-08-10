import { fileURLToPath } from "node:url";
import path from "node:path";

import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptsDirectory, "..", "..");

dotenv.config({ path: path.join(projectRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function sslConfig() {
  const mode = process.env.DATABASE_SSL ?? "disable";

  if (mode === "disable") {
    return false;
  }

  if (mode === "require") {
    return { rejectUnauthorized: false };
  }

  if (mode === "verify-full") {
    return { rejectUnauthorized: true };
  }

  throw new Error(
    'DATABASE_SSL must be one of "disable", "require", or "verify-full".',
  );
}

export function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. Add it to .env.local before running database commands.",
    );
  }

  return databaseUrl;
}

export function databaseTarget() {
  const parsed = new URL(requireDatabaseUrl());
  const database = parsed.pathname.replace(/^\//, "") || "postgres";
  const port = parsed.port || "5432";

  return `${parsed.hostname}:${port}/${database}`;
}

export function createDatabasePool(options = {}) {
  return new Pool({
    connectionString: requireDatabaseUrl(),
    ssl: sslConfig(),
    application_name: options.applicationName ?? "aureum-database-tooling",
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 5, "DATABASE_POOL_MAX"),
    connectionTimeoutMillis: positiveInteger(
      process.env.DATABASE_CONNECTION_TIMEOUT_MS,
      10_000,
      "DATABASE_CONNECTION_TIMEOUT_MS",
    ),
    statement_timeout: positiveInteger(
      process.env.DATABASE_STATEMENT_TIMEOUT_MS,
      15_000,
      "DATABASE_STATEMENT_TIMEOUT_MS",
    ),
    idle_in_transaction_session_timeout: positiveInteger(
      process.env.DATABASE_IDLE_TRANSACTION_TIMEOUT_MS,
      15_000,
      "DATABASE_IDLE_TRANSACTION_TIMEOUT_MS",
    ),
    allowExitOnIdle: true,
  });
}
