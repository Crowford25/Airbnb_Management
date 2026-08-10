import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { createDatabasePool, projectRoot } from "./database.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function smoke() {
  const pool = createDatabasePool({ applicationName: "aureum-notification-smoke" });
  const prefix = `smoke-notification:${randomUUID()}:`;
  try {
    await pool.query(
      `
        INSERT INTO aureum.notification_outbox (
          event_key, category, recipient_email, subject,
          html_body, text_body, status, available_at
        ) VALUES
          ($1, 'admin_alert', 'admin-smoke@example.com', 'Due notification',
            '<p>Due</p>', 'Due', 'pending', now()),
          ($2, 'booking_reminder', 'customer-smoke@example.com', 'Future reminder',
            '<p>Future</p>', 'Future', 'pending', now() + interval '1 day')
      `,
      [`${prefix}due`, `${prefix}future`],
    );

    execFileSync(
      process.execPath,
      [
        path.join(projectRoot, "database", "scripts", "send-notifications.mjs"),
        "--once",
      ],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          EMAIL_PROVIDER: "console",
          NODE_ENV: "development",
          NOTIFICATION_TEST_EVENT_PREFIX: prefix,
        },
        stdio: "pipe",
      },
    );

    const result = await pool.query(
      `
        SELECT event_key, status, attempt_count, provider, provider_message_id
        FROM aureum.notification_outbox
        WHERE event_key LIKE $1 || '%'
        ORDER BY event_key
      `,
      [prefix],
    );
    const due = result.rows.find((row) => row.event_key === `${prefix}due`);
    const future = result.rows.find((row) => row.event_key === `${prefix}future`);
    assert(
      due?.status === "sent" &&
        due.attempt_count === 1 &&
        due.provider === "console" &&
        due.provider_message_id,
      "The due notification was not delivered exactly once.",
    );
    assert(
      future?.status === "pending" && future.attempt_count === 0,
      "A future reminder was delivered before its scheduled time.",
    );
    const attempts = await pool.query(
      `
        SELECT count(*)::integer AS count
        FROM aureum.notification_attempts AS attempt
        JOIN aureum.notification_outbox AS notification
          ON notification.id = attempt.notification_id
        WHERE notification.event_key LIKE $1 || '%'
          AND attempt.outcome = 'sent'
      `,
      [prefix],
    );
    assert(
      attempts.rows[0]?.count === 1,
      "Notification attempt history was not recorded.",
    );
    console.log(
      "Notification smoke test passed: due delivery, future scheduling, provider idempotency key, and attempt history.",
    );
  } finally {
    await pool.query(
      `DELETE FROM aureum.notification_outbox WHERE event_key LIKE $1 || '%'`,
      [prefix],
    );
    await pool.end();
  }
}

smoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
