import { createDatabasePool, databaseTarget } from "./database.mjs";

async function status() {
  const pool = createDatabasePool({ applicationName: "aureum-db-status" });

  try {
    const server = await pool.query(`
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        current_setting('server_version') AS server_version,
        to_regnamespace('aureum') IS NOT NULL AS schema_exists
    `);
    const migrations = await pool.query(`
      SELECT version, applied_at
      FROM aureum.schema_migrations
      ORDER BY version
    `);
    const counts = await pool.query(`
      SELECT
        (SELECT count(*)::integer FROM aureum.users WHERE deleted_at IS NULL) AS users,
        (SELECT count(*)::integer FROM aureum.properties WHERE deleted_at IS NULL) AS properties,
        (SELECT count(*)::integer FROM aureum.reservations) AS reservations,
        (SELECT count(*)::integer FROM aureum.payments) AS payments,
        (SELECT count(*)::integer FROM aureum.payment_refunds) AS refunds,
        (SELECT count(*)::integer FROM aureum.notification_outbox) AS notifications,
        (SELECT count(*)::integer FROM aureum.notification_outbox WHERE status = 'pending') AS notifications_pending,
        (SELECT count(*)::integer FROM aureum.worker_heartbeats
          WHERE status <> 'stopped') AS active_worker_instances,
        (SELECT count(*)::integer FROM aureum.unit_types WHERE deleted_at IS NULL) AS unit_types,
        (SELECT count(*)::integer FROM aureum.units WHERE deleted_at IS NULL) AS physical_units,
        (SELECT count(*)::integer FROM aureum.unit_blocks WHERE deleted_at IS NULL) AS room_blocks
    `);

    console.log(`Connected to ${databaseTarget()}`);
    console.table(server.rows);
    console.table(migrations.rows);
    console.table(counts.rows);
  } finally {
    await pool.end();
  }
}

status().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
