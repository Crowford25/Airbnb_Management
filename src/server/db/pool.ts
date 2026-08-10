import "server-only";

import { Pool, type PoolConfig } from "pg";

type DatabaseGlobals = typeof globalThis & {
  aureumDatabasePool?: Pool;
};

const databaseGlobals = globalThis as DatabaseGlobals;

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function databaseSsl(): PoolConfig["ssl"] {
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

function poolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Add a PostgreSQL connection URL to .env.local.",
    );
  }

  return {
    connectionString,
    ssl: databaseSsl(),
    application_name: "aureum-next-app",
    max: positiveInteger(
      process.env.DATABASE_POOL_MAX,
      process.env.NODE_ENV === "production" ? 10 : 5,
      "DATABASE_POOL_MAX",
    ),
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
    allowExitOnIdle: process.env.NODE_ENV !== "production",
  };
}

export function getDatabasePool() {
  if (!databaseGlobals.aureumDatabasePool) {
    const pool = new Pool(poolConfig());

    pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL pool error", error);
    });

    databaseGlobals.aureumDatabasePool = pool;
  }

  return databaseGlobals.aureumDatabasePool;
}

export async function closeDatabasePool() {
  const pool = databaseGlobals.aureumDatabasePool;

  if (pool) {
    databaseGlobals.aureumDatabasePool = undefined;
    await pool.end();
  }
}
