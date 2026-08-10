import "server-only";

import type { QueryResultRow } from "pg";

import { databaseQuery } from "./query";

type DatabaseHealthRow = QueryResultRow & {
  database_name: string;
  database_user: string;
  server_version: string;
  schema_ready: boolean;
};

export async function checkDatabaseHealth() {
  const result = await databaseQuery<DatabaseHealthRow>({
    name: "database-health-check",
    text: `
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        current_setting('server_version') AS server_version,
        to_regnamespace('aureum') IS NOT NULL AS schema_ready
    `,
    values: [],
  });

  return result.rows[0];
}
