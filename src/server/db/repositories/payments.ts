import "server-only";

import type { QueryResultRow } from "pg";

import type {
  PaymentRecord,
  PaymentRefundRecord,
  PaymentStatus,
  RefundStatus,
} from "../models";
import { databaseQuery, type TransactionContext } from "../query";

type PaymentRow = QueryResultRow & {
  id: string;
  reservation_id: string;
  provider: "stripe";
  provider_payment_id: string;
  status: PaymentStatus;
  amount: string;
  amount_received: string;
  amount_refunded: string;
  currency: string;
  payment_method_type: string | null;
  last_error_message: string | null;
  livemode: boolean;
  succeeded_at: Date | null;
  created_at: Date;
};

type RefundRow = QueryResultRow & {
  id: string;
  provider_refund_id: string;
  status: RefundStatus;
  amount: string;
  currency: string;
  reason: string;
  failure_reason: string | null;
  created_at: Date;
};

type WebhookEventRow = QueryResultRow & {
  provider_event_id: string;
  event_type: string;
  status: "failed" | "ignored" | "processed" | "processing";
  attempt_count: number;
  error_message: string | null;
  received_at: Date;
  processed_at: Date | null;
};

function mapPayment(row: PaymentRow): PaymentRecord {
  return {
    amount: Number(row.amount),
    amountReceived: Number(row.amount_received),
    amountRefunded: Number(row.amount_refunded),
    createdAt: row.created_at,
    currency: row.currency,
    id: row.id,
    lastErrorMessage: row.last_error_message,
    livemode: row.livemode,
    paymentMethodType: row.payment_method_type,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    succeededAt: row.succeeded_at,
  };
}

function mapRefund(row: RefundRow): PaymentRefundRecord {
  return {
    amount: Number(row.amount),
    createdAt: row.created_at,
    currency: row.currency,
    failureReason: row.failure_reason,
    id: row.id,
    providerRefundId: row.provider_refund_id,
    reason: row.reason,
    status: row.status,
  };
}

const paymentSelect = `
  SELECT
    id, reservation_id, provider, provider_payment_id, status,
    amount, amount_received, amount_refunded, currency,
    payment_method_type, last_error_message, livemode,
    succeeded_at, created_at
  FROM aureum.payments
`;

export async function findPaymentForReservation(
  reservationId: string,
  transaction?: TransactionContext,
  lock = false,
) {
  const query = {
    text: `${paymentSelect}
      WHERE reservation_id = $1 AND provider = 'stripe'
      ${lock ? "FOR UPDATE" : ""}
      LIMIT 1
    `,
    values: [reservationId],
  };
  const result = transaction
    ? await transaction.query<PaymentRow>(query)
    : await databaseQuery<PaymentRow>({ ...query, name: "find-reservation-payment" });
  return result.rows[0] ? mapPayment(result.rows[0]) : null;
}

export async function findPaymentByProviderId(
  providerPaymentId: string,
  transaction?: TransactionContext,
) {
  const query = {
    text: `${paymentSelect}
      WHERE provider = 'stripe' AND provider_payment_id = $1
      LIMIT 1
    `,
    values: [providerPaymentId],
  };
  const result = transaction
    ? await transaction.query<PaymentRow>(query)
    : await databaseQuery<PaymentRow>({ ...query, name: "find-provider-payment" });
  return result.rows[0] ? mapPayment(result.rows[0]) : null;
}

export type PaymentSyncInput = {
  amount: number;
  amountReceived: number;
  currency: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  livemode: boolean;
  paymentMethodType: string | null;
  providerCreatedAt: Date;
  providerPaymentId: string;
  reservationId: string;
  status: PaymentStatus;
  succeededAt: Date | null;
};

export async function upsertPayment(
  transaction: TransactionContext,
  input: PaymentSyncInput,
) {
  const result = await transaction.query<PaymentRow>({
    text: `
      INSERT INTO aureum.payments (
        reservation_id, provider, provider_payment_id, status,
        amount, amount_received, currency, payment_method_type,
        last_error_code, last_error_message, livemode, provider_created_at,
        succeeded_at, cancelled_at
      )
      VALUES (
        $1, 'stripe', $2, $3::varchar, $4, $5, $6, $7, $8, $9, $10, $11,
        CASE
          WHEN $3::varchar = 'succeeded' THEN COALESCE($12, now())
          ELSE NULL
        END,
        CASE WHEN $3::varchar = 'cancelled' THEN now() ELSE NULL END
      )
      ON CONFLICT (reservation_id, provider) DO UPDATE SET
        provider_payment_id = EXCLUDED.provider_payment_id,
        status = CASE
          WHEN aureum.payments.status = 'succeeded' THEN 'succeeded'
          ELSE EXCLUDED.status
        END,
        amount = EXCLUDED.amount,
        amount_received = GREATEST(
          aureum.payments.amount_received,
          EXCLUDED.amount_received
        ),
        currency = EXCLUDED.currency,
        payment_method_type = EXCLUDED.payment_method_type,
        last_error_code = EXCLUDED.last_error_code,
        last_error_message = EXCLUDED.last_error_message,
        livemode = EXCLUDED.livemode,
        provider_created_at = EXCLUDED.provider_created_at,
        succeeded_at = CASE
          WHEN EXCLUDED.status = 'succeeded'
            THEN COALESCE(aureum.payments.succeeded_at, EXCLUDED.succeeded_at, now())
          ELSE aureum.payments.succeeded_at
        END,
        cancelled_at = CASE
          WHEN EXCLUDED.status = 'cancelled'
            THEN COALESCE(aureum.payments.cancelled_at, now())
          ELSE aureum.payments.cancelled_at
        END
      RETURNING
        id, reservation_id, provider, provider_payment_id, status,
        amount, amount_received, amount_refunded, currency,
        payment_method_type, last_error_message, livemode,
        succeeded_at, created_at
    `,
    values: [
      input.reservationId,
      input.providerPaymentId,
      input.status,
      input.amount,
      input.amountReceived,
      input.currency,
      input.paymentMethodType,
      input.lastErrorCode,
      input.lastErrorMessage,
      input.livemode,
      input.providerCreatedAt,
      input.succeededAt,
    ],
  });
  return mapPayment(result.rows[0]);
}

export async function findRefundByIdempotencyKey(
  paymentId: string,
  idempotencyKey: string,
) {
  const result = await databaseQuery<RefundRow>({
    name: "find-payment-refund-idempotency",
    text: `
      SELECT id, provider_refund_id, status, amount, currency,
        reason, failure_reason, created_at
      FROM aureum.payment_refunds
      WHERE payment_id = $1 AND idempotency_key = $2
      LIMIT 1
    `,
    values: [paymentId, idempotencyKey],
  });
  return result.rows[0] ? mapRefund(result.rows[0]) : null;
}

export type RefundSyncInput = {
  amount: number;
  currency: string;
  failureReason: string | null;
  idempotencyKey: string;
  paymentId: string;
  providerCreatedAt: Date;
  providerReason: string | null;
  providerRefundId: string;
  reason: string;
  requestedBy: string | null;
  reservationId: string;
  status: RefundStatus;
};

export async function upsertRefund(
  transaction: TransactionContext,
  input: RefundSyncInput,
) {
  const result = await transaction.query<RefundRow>({
    text: `
      INSERT INTO aureum.payment_refunds (
        payment_id, reservation_id, provider, provider_refund_id,
        idempotency_key, status, amount, currency, reason,
        provider_reason, failure_reason, requested_by, provider_created_at,
        succeeded_at, failed_at
      )
      VALUES (
        $1, $2, 'stripe', $3, $4, $5::varchar, $6, $7, $8, $9, $10, $11, $12,
        CASE WHEN $5::varchar = 'succeeded' THEN now() ELSE NULL END,
        CASE WHEN $5::varchar = 'failed' THEN now() ELSE NULL END
      )
      ON CONFLICT (provider, provider_refund_id) DO UPDATE SET
        status = EXCLUDED.status,
        failure_reason = EXCLUDED.failure_reason,
        succeeded_at = CASE
          WHEN EXCLUDED.status = 'succeeded'
            THEN COALESCE(aureum.payment_refunds.succeeded_at, now())
          ELSE aureum.payment_refunds.succeeded_at
        END,
        failed_at = CASE
          WHEN EXCLUDED.status = 'failed'
            THEN COALESCE(aureum.payment_refunds.failed_at, now())
          ELSE aureum.payment_refunds.failed_at
        END
      RETURNING id, provider_refund_id, status, amount, currency,
        reason, failure_reason, created_at
    `,
    values: [
      input.paymentId,
      input.reservationId,
      input.providerRefundId,
      input.idempotencyKey,
      input.status,
      input.amount,
      input.currency,
      input.reason,
      input.providerReason,
      input.failureReason,
      input.requestedBy,
      input.providerCreatedAt,
    ],
  });
  await refreshPaymentRefundedAmount(transaction, input.paymentId);
  return mapRefund(result.rows[0]);
}

export async function refreshPaymentRefundedAmount(
  transaction: TransactionContext,
  paymentId: string,
) {
  await transaction.query({
    text: `
      UPDATE aureum.payments AS payment
      SET amount_refunded = LEAST(payment.amount_received, COALESCE((
        SELECT sum(refund.amount)
        FROM aureum.payment_refunds AS refund
        WHERE refund.payment_id = payment.id
          AND refund.status IN ('pending', 'requires_action', 'succeeded')
      ), 0))
      WHERE payment.id = $1
    `,
    values: [paymentId],
  });
}

export async function registerWebhookEvent(
  transaction: TransactionContext,
  input: {
    apiVersion: string | null;
    eventId: string;
    eventType: string;
    livemode: boolean;
    payloadHash: string;
  },
) {
  await transaction.query({
    text: `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    values: [`stripe:${input.eventId}`],
  });
  const result = await transaction.query<{ status: string }>({
    text: `
      INSERT INTO aureum.payment_webhook_events (
        provider, provider_event_id, event_type, api_version,
        livemode, payload_sha256, status
      )
      VALUES ('stripe', $1, $2, $3, $4, $5, 'processing')
      ON CONFLICT (provider, provider_event_id) DO UPDATE SET
        attempt_count = aureum.payment_webhook_events.attempt_count + 1,
        status = CASE
          WHEN aureum.payment_webhook_events.status IN ('processed', 'ignored')
            THEN aureum.payment_webhook_events.status
          ELSE 'processing'
        END,
        error_message = NULL
      RETURNING status
    `,
    values: [
      input.eventId,
      input.eventType,
      input.apiVersion,
      input.livemode,
      input.payloadHash,
    ],
  });
  return result.rows[0]?.status ?? "processing";
}

export async function completeWebhookEvent(
  transaction: TransactionContext,
  eventId: string,
  ignored: boolean,
) {
  await transaction.query({
    text: `
      UPDATE aureum.payment_webhook_events
      SET status = $2, processed_at = now(), error_message = NULL
      WHERE provider = 'stripe' AND provider_event_id = $1
    `,
    values: [eventId, ignored ? "ignored" : "processed"],
  });
}

export async function recordWebhookFailure(input: {
  apiVersion: string | null;
  eventId: string;
  eventType: string;
  errorMessage: string;
  livemode: boolean;
  payloadHash: string;
}) {
  await databaseQuery({
    name: "record-payment-webhook-failure",
    text: `
      INSERT INTO aureum.payment_webhook_events (
        provider, provider_event_id, event_type, api_version,
        livemode, payload_sha256, status, error_message
      )
      VALUES ('stripe', $1, $2, $3, $4, $5, 'failed', $6)
      ON CONFLICT (provider, provider_event_id) DO UPDATE SET
        status = 'failed',
        error_message = EXCLUDED.error_message
    `,
    values: [
      input.eventId,
      input.eventType,
      input.apiVersion,
      input.livemode,
      input.payloadHash,
      input.errorMessage.slice(0, 2_000),
    ],
  });
}

export async function listRecentPaymentWebhookEvents(limit = 20) {
  const result = await databaseQuery<WebhookEventRow>({
    name: "list-recent-payment-webhook-events",
    text: `
      SELECT provider_event_id, event_type, status, attempt_count,
        error_message, received_at, processed_at
      FROM aureum.payment_webhook_events
      WHERE provider = 'stripe'
      ORDER BY received_at DESC, id DESC
      LIMIT $1
    `,
    values: [Math.max(1, Math.min(limit, 100))],
  });
  return result.rows.map((row) => ({
    attemptCount: row.attempt_count,
    errorMessage: row.error_message,
    eventId: row.provider_event_id,
    eventType: row.event_type,
    processedAt: row.processed_at,
    receivedAt: row.received_at,
    status: row.status,
  }));
}
