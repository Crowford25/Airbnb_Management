import { randomUUID } from "node:crypto";

import { createDatabasePool, databaseTarget } from "./database.mjs";
import { recordWorkerHeartbeat } from "./worker-heartbeat.mjs";

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

const batchSize = positiveInteger(
  process.env.HOLD_SWEEP_BATCH_SIZE,
  100,
  "HOLD_SWEEP_BATCH_SIZE",
);
const intervalMs = positiveInteger(
  process.env.HOLD_SWEEP_INTERVAL_MS,
  30_000,
  "HOLD_SWEEP_INTERVAL_MS",
);
const once = process.argv.includes("--once");
const workerInstanceId = randomUUID();
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sweep(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        WITH picked AS (
          SELECT id
          FROM aureum.reservations
          WHERE status = 'pending'
            AND hold_expires_at <= now()
          ORDER BY hold_expires_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        ),
        expired AS (
          UPDATE aureum.reservations AS reservation
          SET
            status = 'cancelled',
            cancelled_at = now(),
            cancellation_reason = 'Pending hold expired',
            hold_expires_at = NULL
          FROM picked
          WHERE reservation.id = picked.id
          RETURNING reservation.id
        )
        INSERT INTO aureum.audit_events (
          action, entity_type, entity_id, previous_data, new_data
        )
        SELECT
          'reservation.hold_expired',
          'reservation',
          expired.id,
          '{"status":"pending"}'::jsonb,
          '{"status":"cancelled","reason":"Pending hold expired"}'::jsonb
        FROM expired
        RETURNING entity_id
      `,
      [batchSize],
    );
    await client.query("COMMIT");
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  const pool = createDatabasePool({ applicationName: "aureum-hold-expiry-worker" });
  console.log(`Hold expiry worker connected to ${databaseTarget()}`);

  try {
    if (!once) {
      await recordWorkerHeartbeat(pool, {
        details: { heartbeatIntervalMs: intervalMs, state: "started" },
        instanceId: workerInstanceId,
        status: "healthy",
        workerName: "hold-expiry",
      });
    }
    do {
      try {
        let expired = 0;
        let expiredTotal = 0;
        do {
          expired = await sweep(pool);
          expiredTotal += expired;
          if (expired > 0) console.log(`Expired ${expired} unpaid booking hold(s).`);
        } while (!stopping && expired === batchSize);
        if (!once) {
          await recordWorkerHeartbeat(pool, {
            details: { expiredTotal, heartbeatIntervalMs: intervalMs },
            instanceId: workerInstanceId,
            status: "healthy",
            workerName: "hold-expiry",
          });
        }
      } catch (error) {
        console.error("Hold expiry sweep failed; the worker will retry.", error);
        if (!once) {
          await recordWorkerHeartbeat(pool, {
            details: { heartbeatIntervalMs: intervalMs },
            error,
            instanceId: workerInstanceId,
            status: "degraded",
            workerName: "hold-expiry",
          });
        }
        if (once) throw error;
      }

      if (!once && !stopping) await wait(intervalMs);
    } while (!once && !stopping);
  } finally {
    if (!once) {
      await recordWorkerHeartbeat(pool, {
        details: { heartbeatIntervalMs: intervalMs, state: "stopped" },
        instanceId: workerInstanceId,
        status: "stopped",
        workerName: "hold-expiry",
      });
    }
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
