import "server-only";

import type { QueryResultRow } from "pg";

import { requestTrace } from "@/server/api/request-context";

import { databaseQuery, type TransactionContext } from "../query";

export type NotificationCategory =
  "admin_alert" | "booking_cancellation" | "booking_confirmation" | "booking_reminder";

export type NotificationStatus =
  "cancelled" | "failed" | "pending" | "processing" | "sent";

export async function registerEmailProviderWebhookEvent(
  transaction: TransactionContext,
  input: {
    deliveryId: string;
    emailId: string | null;
    eventCreatedAt: Date | null;
    eventType: string;
    payloadHash: string;
  },
) {
  await transaction.query({
    text: `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    values: [`resend:${input.deliveryId}`],
  });
  const result = await transaction.query<{ status: string }>({
    text: `
      INSERT INTO aureum.email_provider_webhook_events (
        provider, provider_delivery_id, provider_email_id, event_type,
        payload_sha256, event_created_at, status
      )
      VALUES ('resend', $1, $2, $3, $4, $5, 'processing')
      ON CONFLICT (provider, provider_delivery_id) DO UPDATE SET
        attempt_count = aureum.email_provider_webhook_events.attempt_count + 1,
        status = CASE
          WHEN aureum.email_provider_webhook_events.status IN ('processed', 'ignored')
            THEN aureum.email_provider_webhook_events.status
          ELSE 'processing'
        END,
        error_message = NULL
      RETURNING status
    `,
    values: [
      input.deliveryId,
      input.emailId,
      input.eventType.slice(0, 120),
      input.payloadHash,
      input.eventCreatedAt,
    ],
  });
  return result.rows[0]?.status ?? "processing";
}

export async function updateNotificationProviderDelivery(
  transaction: TransactionContext,
  input: {
    detail: string | null;
    emailId: string;
    eventAt: Date | null;
    eventType: string;
    status: string;
  },
) {
  const result = await transaction.query({
    text: `
      UPDATE aureum.notification_outbox
      SET
        provider_delivery_status = $2,
        provider_event_type = $3,
        provider_event_at = COALESCE($4, now()),
        provider_delivery_detail = $5
      WHERE provider = 'resend'
        AND provider_message_id = $1
        AND (
          provider_event_at IS NULL
          OR provider_event_at <= COALESCE($4, now())
        )
      RETURNING id
    `,
    values: [
      input.emailId,
      input.status.slice(0, 40),
      input.eventType.slice(0, 120),
      input.eventAt,
      input.detail?.slice(0, 500) ?? null,
    ],
  });
  return Boolean(result.rowCount);
}

export async function completeEmailProviderWebhookEvent(
  transaction: TransactionContext,
  deliveryId: string,
  ignored: boolean,
) {
  await transaction.query({
    text: `
      UPDATE aureum.email_provider_webhook_events
      SET status = $2, processed_at = now(), error_message = NULL
      WHERE provider = 'resend' AND provider_delivery_id = $1
    `,
    values: [deliveryId, ignored ? "ignored" : "processed"],
  });
}

export async function enqueueEmailNotification(
  transaction: TransactionContext,
  input: {
    availableAt?: Date;
    category: NotificationCategory;
    eventKey: string;
    htmlBody: string;
    recipientEmail: string;
    recipientName?: string | null;
    reservationId?: string | null;
    subject: string;
    templateName?: string | null;
    templateVersion?: string | null;
    textBody: string;
    trace?: {
      correlationId?: string | null;
      originRequestId?: string | null;
      triggeredByUserId?: string | null;
    };
  },
) {
  const trace = input.trace ?? requestTrace();
  const result = await transaction.query<{ id: string }>({
    text: `
      INSERT INTO aureum.notification_outbox (
        reservation_id, event_key, channel, category,
        recipient_email, recipient_name, subject, html_body,
        text_body, status, available_at, origin_request_id, correlation_id,
        triggered_by_user_id, template_name, template_version
      )
      VALUES (
        $1, $2, 'email', $3, lower(btrim($4)), $5, $6, $7, $8,
        'pending', COALESCE($9, now()), $10::uuid, $11::uuid, $12::uuid, $13, $14
      )
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    `,
    values: [
      input.reservationId ?? null,
      input.eventKey,
      input.category,
      input.recipientEmail,
      input.recipientName ?? null,
      input.subject,
      input.htmlBody,
      input.textBody,
      input.availableAt ?? null,
      trace.originRequestId,
      trace.correlationId,
      trace.triggeredByUserId,
      input.templateName ?? null,
      input.templateVersion ?? null,
    ],
  });
  return result.rows[0]?.id ?? null;
}

export async function getReservationNotificationTiming(
  transaction: TransactionContext,
  reservationId: string,
) {
  const result = await transaction.query<
    QueryResultRow & {
      check_in_at: Date;
      check_in_time: string;
      timezone: string;
    }
  >({
    text: `
      SELECT
        (
          reservation.check_in + property.check_in_time
        ) AT TIME ZONE property.timezone AS check_in_at,
        property.check_in_time::text AS check_in_time,
        property.timezone
      FROM aureum.reservations AS reservation
      JOIN aureum.properties AS property ON property.id = reservation.property_id
      WHERE reservation.id = $1
    `,
    values: [reservationId],
  });
  const row = result.rows[0];
  if (!row) throw new Error("Reservation notification timing was not found.");
  return {
    checkInAt: row.check_in_at,
    checkInTime: row.check_in_time.slice(0, 5),
    timezone: row.timezone,
  };
}

export async function listAdminNotificationRecipients(transaction: TransactionContext) {
  const result = await transaction.query<
    QueryResultRow & { display_name: string; email: string }
  >({
    text: `
      SELECT display_name, email
      FROM aureum.users
      WHERE role IN ('lead', 'manager', 'super_admin')
        AND is_active = true
        AND deleted_at IS NULL
      ORDER BY role, email
    `,
    values: [],
  });
  return result.rows.map((row) => ({
    email: row.email,
    name: row.display_name,
  }));
}

export async function cancelPendingReservationReminders(
  transaction: TransactionContext,
  reservationId: string,
) {
  await transaction.query({
    text: `
      UPDATE aureum.notification_outbox
      SET
        status = 'cancelled',
        cancelled_at = now(),
        locked_at = NULL,
        lock_token = NULL,
        last_error = NULL
      WHERE reservation_id = $1
        AND category = 'booking_reminder'
        AND status IN ('pending', 'failed')
    `,
    values: [reservationId],
  });
}

export async function listRecentNotifications(limit = 30) {
  const result = await databaseQuery<
    QueryResultRow & {
      id: string;
      event_key: string;
      category: NotificationCategory;
      recipient_email: string;
      status: NotificationStatus;
      attempt_count: number;
      max_attempts: number;
      provider: string | null;
      provider_message_id: string | null;
      last_error: string | null;
      available_at: Date;
      sent_at: Date | null;
      created_at: Date;
      correlation_id: string | null;
      origin_request_id: string | null;
      template_name: string | null;
      template_version: string | null;
      provider_delivery_status: string | null;
      provider_event_at: Date | null;
      provider_delivery_detail: string | null;
    }
  >({
    name: "list-recent-notification-outbox",
    text: `
      SELECT
        id, event_key, category, recipient_email, status,
        attempt_count, max_attempts, provider, provider_message_id,
        last_error, available_at, sent_at, created_at, correlation_id,
        origin_request_id, template_name, template_version,
        provider_delivery_status, provider_event_at, provider_delivery_detail
      FROM aureum.notification_outbox
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `,
    values: [Math.max(1, Math.min(limit, 100))],
  });
  return result.rows.map((row) => ({
    attemptCount: row.attempt_count,
    availableAt: row.available_at,
    category: row.category,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    eventKey: row.event_key,
    id: row.id,
    lastError: row.last_error,
    maxAttempts: row.max_attempts,
    originRequestId: row.origin_request_id,
    provider: row.provider,
    providerDeliveryDetail: row.provider_delivery_detail,
    providerDeliveryStatus: row.provider_delivery_status,
    providerEventAt: row.provider_event_at,
    providerMessageId: row.provider_message_id,
    recipientEmail: row.recipient_email,
    sentAt: row.sent_at,
    status: row.status,
    templateName: row.template_name,
    templateVersion: row.template_version,
  }));
}
