function safeError(error) {
  const message = error instanceof Error ? error.message : "Worker cycle failed";
  return message.replace(/\b[^\s@]+@[^\s@]+\b/g, "[email redacted]").slice(0, 500);
}

export async function recordWorkerHeartbeat(
  pool,
  { details = {}, instanceId, status, workerName, error = null },
) {
  try {
    await pool.query(
      `
        INSERT INTO aureum.worker_heartbeats (
          worker_name, instance_id, status, details, last_heartbeat_at,
          last_success_at, last_error_at, last_error_message
        )
        VALUES (
          $1, $2::uuid, $3, $4::jsonb, now(),
          CASE WHEN $3 = 'healthy' THEN now() ELSE NULL END,
          CASE WHEN $3 = 'degraded' THEN now() ELSE NULL END,
          CASE WHEN $3 = 'degraded' THEN $5 ELSE NULL END
        )
        ON CONFLICT (worker_name, instance_id) DO UPDATE SET
          status = EXCLUDED.status,
          details = EXCLUDED.details,
          last_heartbeat_at = now(),
          last_success_at = CASE
            WHEN EXCLUDED.status = 'healthy' THEN now()
            ELSE aureum.worker_heartbeats.last_success_at
          END,
          last_error_at = CASE
            WHEN EXCLUDED.status = 'degraded' THEN now()
            ELSE aureum.worker_heartbeats.last_error_at
          END,
          last_error_message = CASE
            WHEN EXCLUDED.status = 'degraded' THEN EXCLUDED.last_error_message
            WHEN EXCLUDED.status = 'healthy' THEN NULL
            ELSE aureum.worker_heartbeats.last_error_message
          END
      `,
      [
        workerName,
        instanceId,
        status,
        JSON.stringify(details),
        error ? safeError(error) : null,
      ],
    );
  } catch (heartbeatError) {
    console.error("Worker heartbeat could not be recorded.", heartbeatError);
  }
}
