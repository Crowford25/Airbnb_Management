import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

import Stripe from "stripe";

import { createDatabasePool } from "./database.mjs";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3017";
const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_aureum_payment_smoke_secret";
const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY ??
    "sk_test_aureum_payment_smoke_key_not_for_provider_requests",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sessionToken(user) {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  assert(secret && secret.length >= 32, "AUTH_SESSION_SECRET is not configured.");
  const issuedAt = Math.floor(Date.now() / 1_000);
  const payload = {
    email: user.email,
    exp: issuedAt + 900,
    iat: issuedAt,
    name: user.display_name,
    role: user.role,
    sub: user.id,
    v: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${pathname}: ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return { body, status: response.status };
}

function stripeEvent(type, object, id) {
  return JSON.stringify({
    api_version: "2026-07-29.clover",
    created: Math.floor(Date.now() / 1_000),
    data: { object },
    id,
    livemode: false,
    object: "event",
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  });
}

async function sendWebhook(payload) {
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
  return jsonRequest("/api/webhooks/stripe", {
    body: payload,
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": signature,
    },
    method: "POST",
  });
}

async function startStripeApiMock() {
  const configured = process.env.STRIPE_TEST_API_BASE_URL?.trim();
  if (!configured) return null;
  const url = new URL(configured);
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.method !== "POST" || request.url !== "/v1/refunds") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Mock route not found" } }));
      return;
    }
    const body = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        amount: Number(body.get("amount")),
        created: Math.floor(Date.now() / 1_000),
        currency: "myr",
        failure_reason: null,
        id: `re_mock_${randomUUID().replaceAll("-", "")}`,
        metadata: {
          internalReason: body.get("metadata[internalReason]") ?? "",
          reservationId: body.get("metadata[reservationId]") ?? "",
        },
        object: "refund",
        payment_intent: body.get("payment_intent"),
        reason: body.get("reason"),
        status: "succeeded",
      }),
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(url.port), url.hostname, resolve);
  });
  return server;
}

async function smoke() {
  const pool = createDatabasePool({ applicationName: "aureum-payment-smoke" });
  const reservationIds = [];
  const blockIds = [];
  let passed = false;
  const webhookIds = [];
  const stripeApiMock = await startStripeApiMock();

  try {
    await pool.query(
      `DELETE FROM aureum.payment_webhook_events
       WHERE provider = 'stripe' AND provider_event_id LIKE 'evt_smoke_%'`,
    );
    const userResult = await pool.query(
      `SELECT id, email, display_name, role
       FROM aureum.users
       WHERE email = $1 AND is_active = true`,
      [process.env.AUTH_CUSTOMER_EMAIL],
    );
    const user = userResult.rows[0];
    assert(user, "Configured customer was not found in the database.");
    const headers = {
      "Content-Type": "application/json",
      Cookie: `aureum_session=${sessionToken(user)}`,
    };

    const dateResult = await pool.query(`
      SELECT candidate::date::text AS check_in, (candidate::date + 2)::text AS check_out
      FROM generate_series(current_date + 7, current_date + 180, interval '1 day') candidate
      JOIN aureum.unit_types room ON room.code = 'skyline-king'
      JOIN aureum.properties property
        ON property.id = room.property_id
        AND property.slug = 'the-opaline-residence'
      WHERE aureum.unit_type_remaining_units(room.id, candidate::date) >= 1
        AND aureum.unit_type_remaining_units(room.id, candidate::date + 1) >= 1
      ORDER BY candidate
      LIMIT 1
    `);
    const dates = dateResult.rows[0];
    assert(dates, "Could not find an available payment smoke-test window.");

    const created = await jsonRequest("/api/reservations", {
      body: JSON.stringify({
        checkIn: dates.check_in,
        checkOut: dates.check_out,
        idempotencyKey: `payment-smoke-${randomUUID()}`,
        items: [
          {
            adults: 2,
            children: 0,
            quantity: 1,
            roomKey: "skyline-king",
          },
        ],
        propertySlug: "the-opaline-residence",
      }),
      headers,
      method: "POST",
    });
    const reservation = created.body.reservation;
    const reservationId = reservation.id;
    reservationIds.push(reservationId);
    const paymentIntentId = `pi_smoke_${randomUUID().replaceAll("-", "")}`;
    const paymentAmount = Math.round(Number(reservation.totalAmount) * 100);
    const currency = reservation.currency.toUpperCase();

    await pool.query(
      `INSERT INTO aureum.payments (
         reservation_id, provider, provider_payment_id, status,
         amount, amount_received, currency, livemode, provider_created_at
       )
       VALUES ($1, 'stripe', $2, 'requires_payment_method', $3, 0, $4, false, now())`,
      [reservationId, paymentIntentId, paymentAmount, currency],
    );

    const paymentEventId = `evt_smoke_${randomUUID().replaceAll("-", "")}`;
    webhookIds.push(paymentEventId);
    const paymentIntent = {
      amount: paymentAmount,
      amount_received: paymentAmount,
      client_secret: `${paymentIntentId}_secret_smoke`,
      created: Math.floor(Date.now() / 1_000),
      currency: currency.toLowerCase(),
      id: paymentIntentId,
      last_payment_error: null,
      livemode: false,
      metadata: {
        bookingReference: reservation.bookingReference,
        reservationId,
      },
      object: "payment_intent",
      payment_method: null,
      payment_method_types: ["card"],
      status: "succeeded",
    };
    const paymentPayload = stripeEvent(
      "payment_intent.succeeded",
      paymentIntent,
      paymentEventId,
    );
    await sendWebhook(paymentPayload);
    await sendWebhook(paymentPayload);

    const confirmed = await jsonRequest(
      `/api/reservations/${encodeURIComponent(reservation.bookingReference)}`,
      { headers },
    );
    assert(
      confirmed.body.reservation.status === "confirmed",
      "The verified payment webhook did not confirm the reservation.",
    );
    assert(
      confirmed.body.reservation.payment?.status === "succeeded",
      "The successful payment was not persisted.",
    );
    const notificationResult = await pool.query(
      `
        SELECT category, count(*)::integer AS count
        FROM aureum.notification_outbox
        WHERE reservation_id = $1
        GROUP BY category
      `,
      [reservationId],
    );
    const notificationCounts = new Map(
      notificationResult.rows.map((row) => [row.category, row.count]),
    );
    assert(
      notificationCounts.get("booking_confirmation") === 1,
      "Payment confirmation did not queue exactly one customer confirmation email.",
    );
    assert(
      notificationCounts.get("booking_reminder") === 2,
      "Payment confirmation did not schedule the 72-hour and 24-hour reminders.",
    );
    assert(
      (notificationCounts.get("admin_alert") ?? 0) >= 1,
      "Payment confirmation did not queue an administrator alert.",
    );
    const paymentEventResult = await pool.query(
      `SELECT status, attempt_count
       FROM aureum.payment_webhook_events
       WHERE provider = 'stripe' AND provider_event_id = $1`,
      [paymentEventId],
    );
    assert(
      paymentEventResult.rows[0]?.status === "processed" &&
        paymentEventResult.rows[0]?.attempt_count === 2,
      "Webhook replay was not handled idempotently.",
    );

    const refundId = `re_smoke_${randomUUID().replaceAll("-", "")}`;
    const refundEventId = `evt_smoke_${randomUUID().replaceAll("-", "")}`;
    webhookIds.push(refundEventId);
    const refundPayload = stripeEvent(
      "refund.created",
      {
        amount: paymentAmount,
        created: Math.floor(Date.now() / 1_000),
        currency: currency.toLowerCase(),
        failure_reason: null,
        id: refundId,
        metadata: {
          internalReason: "Payment smoke-test refund",
          reservationId,
        },
        object: "refund",
        payment_intent: paymentIntentId,
        status: "succeeded",
      },
      refundEventId,
    );
    await sendWebhook(refundPayload);

    const refundResult = await pool.query(
      `SELECT payment.amount_refunded, refund.status
       FROM aureum.payments payment
       JOIN aureum.payment_refunds refund ON refund.payment_id = payment.id
       WHERE payment.reservation_id = $1 AND refund.provider_refund_id = $2`,
      [reservationId, refundId],
    );
    assert(
      Number(refundResult.rows[0]?.amount_refunded) === paymentAmount &&
        refundResult.rows[0]?.status === "succeeded",
      "The signed refund webhook did not update the refundable balance.",
    );

    if (stripeApiMock) {
      const conflictCreated = await jsonRequest("/api/reservations", {
        body: JSON.stringify({
          checkIn: dates.check_in,
          checkOut: dates.check_out,
          idempotencyKey: `payment-conflict-smoke-${randomUUID()}`,
          items: [
            {
              adults: 2,
              children: 0,
              quantity: 1,
              roomKey: "skyline-king",
            },
          ],
          propertySlug: "the-opaline-residence",
        }),
        headers,
        method: "POST",
      });
      const conflictReservation = conflictCreated.body.reservation;
      reservationIds.push(conflictReservation.id);
      const conflictPaymentIntentId = `pi_smoke_${randomUUID().replaceAll("-", "")}`;
      const conflictPaymentAmount = Math.round(
        Number(conflictReservation.totalAmount) * 100,
      );
      const blocks = await pool.query(
        `
          INSERT INTO aureum.unit_blocks (
            unit_id, start_date, end_date, reason, note
          )
          SELECT
            unit.id, $1::date, $2::date, 'maintenance',
            'Payment inventory conflict smoke test'
          FROM aureum.units AS unit
          JOIN aureum.unit_types AS unit_type ON unit_type.id = unit.unit_type_id
          WHERE unit_type.code = 'skyline-king'
            AND unit.status = 'operational'
            AND unit.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM aureum.unit_blocks AS existing
              WHERE existing.unit_id = unit.id
                AND existing.deleted_at IS NULL
                AND existing.stay_period && daterange($1::date, $2::date, '[)')
            )
          RETURNING id
        `,
        [dates.check_in, dates.check_out],
      );
      blockIds.push(...blocks.rows.map((row) => row.id));
      assert(blockIds.length > 0, "No physical rooms were available to block.");
      await pool.query(
        `
          INSERT INTO aureum.payments (
            reservation_id, provider, provider_payment_id, status,
            amount, amount_received, currency, livemode, provider_created_at
          )
          VALUES ($1, 'stripe', $2, 'requires_payment_method', $3, 0, $4, false, now())
        `,
        [
          conflictReservation.id,
          conflictPaymentIntentId,
          conflictPaymentAmount,
          conflictReservation.currency.toUpperCase(),
        ],
      );
      const conflictEventId = `evt_smoke_${randomUUID().replaceAll("-", "")}`;
      webhookIds.push(conflictEventId);
      const conflictPayload = stripeEvent(
        "payment_intent.succeeded",
        {
          amount: conflictPaymentAmount,
          amount_received: conflictPaymentAmount,
          client_secret: `${conflictPaymentIntentId}_secret_smoke`,
          created: Math.floor(Date.now() / 1_000),
          currency: conflictReservation.currency.toLowerCase(),
          id: conflictPaymentIntentId,
          last_payment_error: null,
          livemode: false,
          metadata: {
            bookingReference: conflictReservation.bookingReference,
            reservationId: conflictReservation.id,
          },
          object: "payment_intent",
          payment_method: null,
          payment_method_types: ["card"],
          status: "succeeded",
        },
        conflictEventId,
      );
      await sendWebhook(conflictPayload);
      const conflictResult = await jsonRequest(
        `/api/reservations/${encodeURIComponent(conflictReservation.bookingReference)}`,
        { headers },
      );
      assert(
        conflictResult.body.reservation.status === "cancelled",
        "A paid reservation without final room capacity was not cancelled.",
      );
      assert(
        conflictResult.body.reservation.payment?.amountRefunded ===
          conflictPaymentAmount,
        "The unavailable paid reservation was not automatically refunded.",
      );
      const conflictNotifications = await pool.query(
        `
          SELECT category, count(*)::integer AS count
          FROM aureum.notification_outbox
          WHERE reservation_id = $1
          GROUP BY category
        `,
        [conflictReservation.id],
      );
      const conflictNotificationCounts = new Map(
        conflictNotifications.rows.map((row) => [row.category, row.count]),
      );
      assert(
        conflictNotificationCounts.get("booking_cancellation") === 1 &&
          (conflictNotificationCounts.get("admin_alert") ?? 0) >= 1,
        "The inventory-conflict cancellation notifications were not queued.",
      );
    }

    console.log(
      "Payment smoke test passed: final inventory confirmation, automatic conflict refund, replay idempotency, notifications, refund synchronization, and customer visibility.",
    );
    passed = true;
  } finally {
    if (reservationIds.length > 0 || blockIds.length > 0) {
      await pool.query("BEGIN");
      try {
        await pool.query(
          `DELETE FROM aureum.audit_events
           WHERE entity_type = 'reservation' AND entity_id = ANY($1::uuid[])`,
          [reservationIds],
        );
        await pool.query(
          `DELETE FROM aureum.payment_refunds
           WHERE reservation_id = ANY($1::uuid[])`,
          [reservationIds],
        );
        await pool.query(
          `DELETE FROM aureum.payments WHERE reservation_id = ANY($1::uuid[])`,
          [reservationIds],
        );
        await pool.query(`DELETE FROM aureum.reservations WHERE id = ANY($1::uuid[])`, [
          reservationIds,
        ]);
        await pool.query(`DELETE FROM aureum.unit_blocks WHERE id = ANY($1::uuid[])`, [
          blockIds,
        ]);
        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }
    if (!passed && webhookIds.length > 0) {
      const failures = await pool.query(
        `SELECT provider_event_id, status, error_message
         FROM aureum.payment_webhook_events
         WHERE provider = 'stripe' AND provider_event_id = ANY($1::text[])`,
        [webhookIds],
      );
      for (const failure of failures.rows) {
        console.error(
          `Webhook ${failure.provider_event_id}: ${failure.status} ${failure.error_message ?? ""}`,
        );
      }
    }
    if (passed && webhookIds.length > 0) {
      await pool.query(
        `DELETE FROM aureum.payment_webhook_events
         WHERE provider = 'stripe' AND provider_event_id = ANY($1::text[])`,
        [webhookIds],
      );
    }
    await pool.end();
    if (stripeApiMock) {
      await new Promise((resolve, reject) => {
        stripeApiMock.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

smoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
