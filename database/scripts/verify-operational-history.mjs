import { createDatabasePool, databaseTarget } from "./database.mjs";

async function verify() {
  const pool = createDatabasePool({ applicationName: "aureum-history-verify" });
  try {
    const result = await pool.query(`
      SELECT
        to_regclass('aureum.api_request_logs') IS NOT NULL AS api_request_logs,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'aureum' AND table_name = 'audit_events'
            AND column_name = 'correlation_id'
        ) AS audit_correlation,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'aureum' AND table_name = 'notification_outbox'
            AND column_name = 'template_name'
        ) AS email_template_metadata,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'aureum' AND table_name = 'notification_attempts'
            AND column_name = 'worker_execution_id'
        ) AS worker_execution_history,
        to_regclass('aureum.email_provider_webhook_events') IS NOT NULL
          AS email_provider_webhooks,
        to_regclass('aureum.worker_heartbeats') IS NOT NULL AS worker_monitoring
    `);
    console.log(`Connected to ${databaseTarget()}`);
    console.table(result.rows);
    if (!Object.values(result.rows[0] ?? {}).every(Boolean)) {
      throw new Error("Operational history schema verification failed.");
    }
  } finally {
    await pool.end();
  }
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
