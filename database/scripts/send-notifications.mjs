import { randomUUID } from "node:crypto";
import { Resend } from "resend";

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

function configuredValue(name) {
  const value = process.env[name]?.trim();
  if (!value || /(?:replace|\.\.\.)/i.test(value)) return null;
  return value;
}

const batchSize = positiveInteger(
  process.env.NOTIFICATION_BATCH_SIZE,
  25,
  "NOTIFICATION_BATCH_SIZE",
);
const intervalMs = positiveInteger(
  process.env.NOTIFICATION_POLL_INTERVAL_MS,
  5_000,
  "NOTIFICATION_POLL_INTERVAL_MS",
);
const lockTimeoutMs = positiveInteger(
  process.env.NOTIFICATION_LOCK_TIMEOUT_MS,
  15 * 60 * 1_000,
  "NOTIFICATION_LOCK_TIMEOUT_MS",
);
const providerName = (configuredValue("EMAIL_PROVIDER") ?? "console").toLowerCase();
const testEventPrefix =
  process.env.NODE_ENV === "production"
    ? null
    : configuredValue("NOTIFICATION_TEST_EVENT_PREFIX");
const once = process.argv.includes("--once");
const workerExecutionId = randomUUID();
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class EmailProviderError extends Error {
  constructor(message, permanent = false) {
    super(message);
    this.name = "EmailProviderError";
    this.permanent = permanent;
  }
}

function emailProvider() {
  if (providerName === "console") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EMAIL_PROVIDER=console is not permitted in production.");
    }
    return {
      name: "console",
      async send(notification) {
        console.log(
          `[email preview] ${notification.category} -> ${notification.recipient_email} (${notification.event_key})`,
        );
        return { messageId: `console-${notification.id}` };
      },
    };
  }

  if (providerName !== "resend") {
    throw new Error('EMAIL_PROVIDER must be either "console" or "resend".');
  }
  const apiKey = configuredValue("RESEND_API_KEY");
  const from = configuredValue("EMAIL_FROM");
  if (!apiKey?.startsWith("re_")) {
    throw new Error("RESEND_API_KEY is not configured for the notification worker.");
  }
  if (!from) {
    throw new Error("EMAIL_FROM is not configured for the notification worker.");
  }
  const resend = new Resend(apiKey);
  return {
    name: "resend",
    async send(notification) {
      const { data, error } = await resend.emails.send(
        {
          from,
          html: notification.html_body,
          subject: notification.subject,
          text: notification.text_body,
          to: [notification.recipient_email],
        },
        { idempotencyKey: notification.event_key },
      );
      if (error) {
        throw new EmailProviderError(
          error.message,
          [400, 401, 403, 404, 422].includes(error.statusCode ?? 0),
        );
      }
      if (!data?.id) {
        throw new EmailProviderError("Email provider response did not include an ID.");
      }
      return { messageId: data.id };
    },
  };
}

async function closeExhaustedStaleClaims(pool) {
  await pool.query(
    `
      UPDATE aureum.notification_outbox
      SET
        status = 'failed',
        locked_at = NULL,
        lock_token = NULL,
        last_error = COALESCE(
          last_error,
          'Notification worker stopped during the final delivery attempt'
        )
      WHERE status = 'processing'
        AND attempt_count >= max_attempts
        AND locked_at <= now() - ($1::integer * interval '1 millisecond')
    `,
    [lockTimeoutMs],
  );
}

async function claim(pool, provider) {
  const client = await pool.connect();
  const lockToken = randomUUID();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        WITH picked AS (
          SELECT id
          FROM aureum.notification_outbox
          WHERE (
              (
                status = 'pending'
                AND available_at <= now()
              ) OR (
                status = 'processing'
                AND locked_at <= now() - ($2::integer * interval '1 millisecond')
              )
            )
            AND attempt_count < max_attempts
            AND ($5::text IS NULL OR event_key LIKE $5 || '%')
          ORDER BY available_at, created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE aureum.notification_outbox AS notification
        SET
          status = 'processing',
          locked_at = now(),
          lock_token = $3,
          attempt_count = notification.attempt_count + 1,
          provider = $4,
          last_error = NULL
        FROM picked
        WHERE notification.id = picked.id
        RETURNING
          notification.id,
          notification.reservation_id,
          notification.event_key,
          notification.category,
          notification.recipient_email,
          notification.subject,
          notification.html_body,
          notification.text_body,
          notification.attempt_count,
          notification.max_attempts,
          notification.lock_token
      `,
      [batchSize, lockTimeoutMs, lockToken, provider, testEventPrefix],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cancelInvalidReminder(pool, notification, provider) {
  if (notification.category !== "booking_reminder" || !notification.reservation_id) {
    return false;
  }
  const result = await pool.query(
    `SELECT status FROM aureum.reservations WHERE id = $1`,
    [notification.reservation_id],
  );
  if (result.rows[0]?.status === "confirmed") return false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `
        UPDATE aureum.notification_outbox
        SET
          status = 'cancelled',
          cancelled_at = now(),
          locked_at = NULL,
          lock_token = NULL,
          last_error = 'Reservation is no longer confirmed'
        WHERE id = $1 AND status = 'processing' AND lock_token = $2
        RETURNING id
      `,
      [notification.id, notification.lock_token],
    );
    if (updated.rowCount) {
      await client.query(
        `
          INSERT INTO aureum.notification_attempts (
            notification_id, attempt_number, provider, outcome, error_message,
            worker_execution_id
          ) VALUES ($1, $2, $3, 'cancelled', $4, $5::uuid)
        `,
        [
          notification.id,
          notification.attempt_count,
          provider,
          "Reservation is no longer confirmed",
          workerExecutionId,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return true;
}

async function markSent(pool, notification, provider, messageId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `
        UPDATE aureum.notification_outbox
        SET
          status = 'sent',
          sent_at = now(),
          provider_message_id = $3,
          locked_at = NULL,
          lock_token = NULL,
          last_error = NULL
        WHERE id = $1 AND status = 'processing' AND lock_token = $2
        RETURNING id
      `,
      [notification.id, notification.lock_token, messageId],
    );
    if (updated.rowCount) {
      await client.query(
        `
          INSERT INTO aureum.notification_attempts (
            notification_id, attempt_number, provider, outcome,
            provider_message_id, worker_execution_id
          ) VALUES ($1, $2, $3, 'sent', $4, $5::uuid)
        `,
        [
          notification.id,
          notification.attempt_count,
          provider,
          messageId,
          workerExecutionId,
        ],
      );
      if (provider === "resend") {
        await client.query(
          `
            WITH latest_event AS (
              SELECT event_type, event_created_at
              FROM aureum.email_provider_webhook_events
              WHERE provider = 'resend'
                AND provider_email_id = $2
                AND event_type IN (
                  'email.sent', 'email.delivered', 'email.delivery_delayed',
                  'email.bounced', 'email.complained', 'email.failed', 'email.suppressed'
                )
              ORDER BY event_created_at DESC NULLS LAST, received_at DESC
              LIMIT 1
            )
            UPDATE aureum.notification_outbox AS notification
            SET
              provider_delivery_status = CASE latest_event.event_type
                WHEN 'email.sent' THEN 'sent'
                WHEN 'email.delivered' THEN 'delivered'
                WHEN 'email.delivery_delayed' THEN 'delivery_delayed'
                WHEN 'email.bounced' THEN 'bounced'
                WHEN 'email.complained' THEN 'complained'
                WHEN 'email.failed' THEN 'failed'
                WHEN 'email.suppressed' THEN 'suppressed'
              END,
              provider_event_type = latest_event.event_type,
              provider_event_at = COALESCE(latest_event.event_created_at, now())
            FROM latest_event
            WHERE notification.id = $1
              AND (
                notification.provider_event_at IS NULL
                OR notification.provider_event_at <= COALESCE(latest_event.event_created_at, now())
              )
          `,
          [notification.id, messageId],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markFailed(pool, notification, provider, error) {
  const permanent = error instanceof EmailProviderError && error.permanent;
  const exhausted = notification.attempt_count >= notification.max_attempts;
  const retrySeconds = Math.min(
    3_600,
    30 * 2 ** Math.max(0, notification.attempt_count - 1),
  );
  const message = error instanceof Error ? error.message : "Email delivery failed";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `
        UPDATE aureum.notification_outbox
        SET
          status = CASE WHEN $3 THEN 'failed' ELSE 'pending' END,
          available_at = CASE
            WHEN $3 THEN available_at
            ELSE now() + ($4::integer * interval '1 second')
          END,
          locked_at = NULL,
          lock_token = NULL,
          last_error = $5
        WHERE id = $1 AND status = 'processing' AND lock_token = $2
        RETURNING id
      `,
      [
        notification.id,
        notification.lock_token,
        permanent || exhausted,
        retrySeconds,
        message.slice(0, 2_000),
      ],
    );
    if (updated.rowCount) {
      await client.query(
        `
          INSERT INTO aureum.notification_attempts (
            notification_id, attempt_number, provider, outcome, error_message,
            worker_execution_id
          ) VALUES ($1, $2, $3, 'failed', $4, $5::uuid)
        `,
        [
          notification.id,
          notification.attempt_count,
          provider,
          message.slice(0, 2_000),
          workerExecutionId,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (databaseError) {
    await client.query("ROLLBACK");
    throw databaseError;
  } finally {
    client.release();
  }
}

async function run() {
  const pool = createDatabasePool({ applicationName: "aureum-notification-worker" });
  const provider = emailProvider();
  let failed = false;
  console.log(
    `Notification worker connected to ${databaseTarget()} using ${provider.name}.`,
  );

  try {
    if (!once) {
      await recordWorkerHeartbeat(pool, {
        details: {
          heartbeatIntervalMs: intervalMs,
          provider: provider.name,
          state: "started",
        },
        instanceId: workerExecutionId,
        status: "healthy",
        workerName: "notifications",
      });
    }
    do {
      await closeExhaustedStaleClaims(pool);
      const notifications = await claim(pool, provider.name);
      let deliveryFailures = 0;
      let delivered = 0;
      for (const notification of notifications) {
        if (stopping) break;
        try {
          if (await cancelInvalidReminder(pool, notification, provider.name)) continue;
          const result = await provider.send(notification);
          await markSent(pool, notification, provider.name, result.messageId);
          delivered += 1;
        } catch (error) {
          await markFailed(pool, notification, provider.name, error);
          deliveryFailures += 1;
          console.error(
            `Notification ${notification.event_key} failed and was recorded for retry.`,
          );
        }
      }

      if (!once) {
        await recordWorkerHeartbeat(pool, {
          details: {
            claimed: notifications.length,
            delivered,
            deliveryFailures,
            heartbeatIntervalMs: intervalMs,
            provider: provider.name,
          },
          instanceId: workerExecutionId,
          status: "healthy",
          workerName: "notifications",
        });
      }

      if (once) break;
      if (!stopping && notifications.length < batchSize) await wait(intervalMs);
    } while (!stopping);
  } catch (error) {
    failed = true;
    if (!once) {
      await recordWorkerHeartbeat(pool, {
        details: { heartbeatIntervalMs: intervalMs, provider: provider.name },
        error,
        instanceId: workerExecutionId,
        status: "degraded",
        workerName: "notifications",
      });
    }
    throw error;
  } finally {
    if (!once) {
      await recordWorkerHeartbeat(pool, {
        details: {
          heartbeatIntervalMs: intervalMs,
          provider: provider.name,
          state: failed ? "failed" : "stopped",
        },
        instanceId: workerExecutionId,
        status: failed ? "degraded" : "stopped",
        workerName: "notifications",
      });
    }
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
