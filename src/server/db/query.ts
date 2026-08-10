import "server-only";

import type { PoolClient, QueryConfig, QueryResult, QueryResultRow } from "pg";

import { getDatabasePool } from "./pool";

export type DatabaseQuery = QueryConfig<unknown[]>;

export type TransactionIsolation =
  "read committed" | "repeatable read" | "serializable";

export type TransactionOptions = {
  isolation?: TransactionIsolation;
  readOnly?: boolean;
};

export type TransactionContext = {
  query<Row extends QueryResultRow>(query: DatabaseQuery): Promise<QueryResult<Row>>;
};

export async function databaseQuery<Row extends QueryResultRow>(query: DatabaseQuery) {
  return getDatabasePool().query<Row>(query);
}

function beginStatement(options: TransactionOptions) {
  const isolation = options.isolation ?? "read committed";
  const isolationSql = {
    "read committed": "READ COMMITTED",
    "repeatable read": "REPEATABLE READ",
    serializable: "SERIALIZABLE",
  }[isolation];
  const accessMode = options.readOnly ? " READ ONLY" : "";

  return `BEGIN ISOLATION LEVEL ${isolationSql}${accessMode}`;
}

function transactionContext(client: PoolClient): TransactionContext {
  return {
    query<Row extends QueryResultRow>(query: DatabaseQuery) {
      return client.query<Row>(query);
    },
  };
}

export async function withDatabaseTransaction<T>(
  callback: (transaction: TransactionContext) => Promise<T>,
  options: TransactionOptions = {},
) {
  const client = await getDatabasePool().connect();

  try {
    await client.query(beginStatement(options));
    const result = await callback(transactionContext(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["40001", "40P01"].includes(String(error.code))
  );
}

export async function withSerializableRetry<T>(
  callback: (transaction: TransactionContext) => Promise<T>,
  maximumAttempts = 3,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await withDatabaseTransaction(callback, { isolation: "serializable" });
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error) || attempt === maximumAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
  throw lastError;
}
