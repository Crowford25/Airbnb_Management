import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { createDatabasePool, projectRoot } from "./database.mjs";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3017";
const smokeCustomerEmail =
  process.env.AUTH_CUSTOMER_EMAIL?.trim() || "demo.customer@aureum.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sessionToken(user) {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  assert(secret && secret.length >= 32, "AUTH_SESSION_SECRET is not configured.");
  const issuedAt = Math.floor(Date.now() / 1000);
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

async function smoke() {
  const pool = createDatabasePool({ applicationName: "aureum-api-smoke" });
  const createdReservationIds = [];

  try {
    const userResult = await pool.query(
      `SELECT id, email, display_name, role FROM aureum.users WHERE email = $1 AND is_active = true`,
      [smokeCustomerEmail],
    );
    const user = userResult.rows[0];
    assert(user, "Configured customer was not found in the database.");
    const cookie = `aureum_session=${sessionToken(user)}`;
    const headers = {
      "Content-Type": "application/json",
      Cookie: cookie,
    };

    const propertyResponse = await jsonRequest("/api/properties/the-opaline-residence");
    const publicProperty = propertyResponse.body.property;
    assert(publicProperty.unitTypes.length >= 2, "Public room types are missing.");
    assert(
      publicProperty.unitTypes.every((room) => !("id" in room)),
      "A public room payload leaked a database UUID.",
    );
    assert(
      !JSON.stringify(publicProperty).includes("KL-201"),
      "A public property payload leaked a physical room code.",
    );

    const dateResult = await pool.query(`
      SELECT candidate::date::text AS check_in, (candidate::date + 2)::text AS check_out
      FROM generate_series(current_date + 7, current_date + 180, interval '1 day') candidate
      JOIN aureum.unit_types room
        ON room.code = 'skyline-king'
      JOIN aureum.properties property
        ON property.id = room.property_id
        AND property.slug = 'the-opaline-residence'
      WHERE aureum.unit_type_remaining_units(room.id, candidate::date) >= 2
        AND aureum.unit_type_remaining_units(room.id, candidate::date + 1) >= 2
      ORDER BY candidate
      LIMIT 1
    `);
    const dates = dateResult.rows[0];
    assert(dates, "Could not find a two-night smoke-test window.");

    const inventoryPath = `/api/properties/the-opaline-residence/inventory?from=${dates.check_in}&to=${dates.check_out}&roomKey=skyline-king`;
    const before = await jsonRequest(inventoryPath);
    const beforeRemaining = before.body.rooms[0].ratePlans[0].days[0].remainingUnits;

    const first = await jsonRequest("/api/reservations", {
      body: JSON.stringify({
        checkIn: dates.check_in,
        checkOut: dates.check_out,
        idempotencyKey: `smoke-${randomUUID()}`,
        items: [
          {
            adults: 4,
            children: 0,
            quantity: 2,
            roomKey: "skyline-king",
          },
        ],
        propertySlug: "the-opaline-residence",
      }),
      headers,
      method: "POST",
    });
    assert(first.status === 201, "The multi-room hold was not created.");
    assert(
      first.body.reservation.items[0].quantity === 2,
      "Multi-room quantity was not persisted.",
    );
    assert(first.body.reservation.roomsCount === 2, "Derived room count is wrong.");
    assert(first.body.reservation.feeTotal !== "0.00", "Fees were not calculated.");
    assert(first.body.reservation.taxTotal !== "0.00", "Taxes were not calculated.");
    createdReservationIds.push(first.body.reservation.id);

    const during = await jsonRequest(inventoryPath);
    assert(
      during.body.rooms[0].ratePlans[0].days[0].remainingUnits === beforeRemaining - 2,
      "The pending multi-room hold did not reduce computed inventory.",
    );

    await jsonRequest(
      `/api/reservations/${encodeURIComponent(first.body.reservation.bookingReference)}`,
      {
        body: JSON.stringify({
          status: "cancelled",
          cancellationReason: "API smoke cleanup",
        }),
        headers,
        method: "PATCH",
      },
    );
    const afterCancellation = await jsonRequest(inventoryPath);
    assert(
      afterCancellation.body.rooms[0].ratePlans[0].days[0].remainingUnits ===
        beforeRemaining,
      "Cancellation did not release computed inventory.",
    );
    const cancellationNotifications = await pool.query(
      `
        SELECT category, count(*)::integer AS count
        FROM aureum.notification_outbox
        WHERE reservation_id = $1
        GROUP BY category
      `,
      [first.body.reservation.id],
    );
    const cancellationNotificationCounts = new Map(
      cancellationNotifications.rows.map((row) => [row.category, row.count]),
    );
    assert(
      cancellationNotificationCounts.get("booking_cancellation") === 1,
      "Cancellation did not queue exactly one customer email.",
    );
    assert(
      (cancellationNotificationCounts.get("admin_alert") ?? 0) >= 1,
      "Cancellation did not queue an administrator alert.",
    );

    const mixed = await jsonRequest("/api/reservations", {
      body: JSON.stringify({
        checkIn: dates.check_in,
        checkOut: dates.check_out,
        idempotencyKey: `smoke-${randomUUID()}`,
        items: [
          { adults: 2, children: 0, quantity: 1, roomKey: "skyline-king" },
          { adults: 2, children: 0, quantity: 1, roomKey: "opaline-suite" },
        ],
        propertySlug: "the-opaline-residence",
      }),
      headers,
      method: "POST",
    });
    assert(
      mixed.body.reservation.items.length === 2,
      "Mixed room items were not persisted.",
    );
    createdReservationIds.push(mixed.body.reservation.id);

    await pool.query(
      `UPDATE aureum.reservations SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`,
      [mixed.body.reservation.id],
    );
    execFileSync(
      process.execPath,
      [path.join(projectRoot, "database", "scripts", "expire-holds.mjs"), "--once"],
      { cwd: projectRoot, stdio: "pipe" },
    );
    const expired = await jsonRequest(
      `/api/reservations/${encodeURIComponent(mixed.body.reservation.bookingReference)}`,
      { headers },
    );
    assert(
      expired.body.reservation.status === "cancelled",
      "The hold worker did not expire the hold.",
    );

    console.log(
      "API smoke test passed: public privacy, computed inventory, multi-room items, pricing, cancellation, and hold expiry.",
    );
  } finally {
    if (createdReservationIds.length > 0) {
      await pool.query("BEGIN");
      try {
        await pool.query(
          `DELETE FROM aureum.audit_events WHERE entity_type = 'reservation' AND entity_id = ANY($1::uuid[])`,
          [createdReservationIds],
        );
        await pool.query(`DELETE FROM aureum.reservations WHERE id = ANY($1::uuid[])`, [
          createdReservationIds,
        ]);
        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }
    await pool.end();
  }
}

smoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
