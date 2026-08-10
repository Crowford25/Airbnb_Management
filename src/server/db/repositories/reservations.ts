import "server-only";

import type { QueryResultRow } from "pg";

import type {
  ChargeCalculation,
  ChargeType,
  ReservationChargeRecord,
  ReservationItemRecord,
  PaymentRecord,
  PaymentRefundRecord,
  ReservationRecord,
  ReservationSource,
  ReservationStatus,
} from "../models";
import { databaseQuery, type TransactionContext } from "../query";

type ReservationRow = QueryResultRow & {
  id: string;
  booking_reference: string;
  property_id: string;
  property_name: string;
  property_slug: string;
  guest_user_id: string | null;
  origin_request_id: string | null;
  correlation_id: string | null;
  status: ReservationStatus;
  source: ReservationSource;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  rooms_count: number;
  accommodation_subtotal: string;
  fee_total: string;
  tax_total: string;
  discount_total: string;
  total_amount: string;
  currency: string;
  hold_active: boolean;
  hold_expires_at: Date | null;
  cancellation_policy_snapshot: Record<string, unknown>;
  created_at: Date;
  items: ReservationItemRecord[];
  charges: ReservationChargeRecord[];
  payment:
    | (Omit<PaymentRecord, "createdAt" | "succeededAt"> & {
        createdAt: string;
        succeededAt: string | null;
      })
    | null;
  refunds: Array<Omit<PaymentRefundRecord, "createdAt"> & { createdAt: string }>;
};

export type ReservationCreateInput = {
  bookingReference: string;
  propertyId: string;
  guestUserId: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  accommodationSubtotal: number;
  feeTotal: number;
  taxTotal: number;
  discountTotal: number;
  totalAmount: number;
  currency: string;
  idempotencyKey: string;
  originRequestId?: string | null;
  correlationId?: string | null;
  pricingSnapshot: Record<string, unknown>;
  cancellationPolicySnapshot: Record<string, unknown>;
  specialRequests?: string | null;
};

export type ReservationItemCreateInput = {
  unitTypeId: string;
  ratePlanId: string;
  quantity: number;
  adults: number;
  children: number;
  roomName: string;
  ratePlanSnapshot: Record<string, unknown>;
  averageNightlyRate: number;
  accommodationSubtotal: number;
  actorId: string;
};

export type ReservationChargeCreateInput = {
  reservationItemId?: string | null;
  type: ChargeType;
  code: string;
  name: string;
  calculation: ChargeCalculation;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  currency: string;
  metadata?: Record<string, unknown>;
};

function mapReservation(row: ReservationRow): ReservationRecord {
  return {
    accommodationSubtotal: row.accommodation_subtotal,
    adults: row.adults,
    bookingReference: row.booking_reference,
    charges: row.charges ?? [],
    cancellationPolicySnapshot: row.cancellation_policy_snapshot,
    checkIn: row.check_in,
    checkOut: row.check_out,
    children: row.children,
    createdAt: row.created_at,
    currency: row.currency,
    discountTotal: row.discount_total,
    feeTotal: row.fee_total,
    guestEmail: row.guest_email,
    guestName: row.guest_name,
    guestUserId: row.guest_user_id,
    originRequestId: row.origin_request_id,
    correlationId: row.correlation_id,
    holdActive: row.hold_active,
    holdExpiresAt: row.hold_expires_at,
    id: row.id,
    items: row.items ?? [],
    nights: row.nights,
    propertyId: row.property_id,
    propertyName: row.property_name,
    propertySlug: row.property_slug,
    roomsCount: Number(row.rooms_count),
    source: row.source,
    status: row.status,
    taxTotal: row.tax_total,
    totalAmount: row.total_amount,
    payment: row.payment
      ? {
          ...row.payment,
          createdAt: new Date(row.payment.createdAt),
          succeededAt: row.payment.succeededAt
            ? new Date(row.payment.succeededAt)
            : null,
        }
      : null,
    refunds: (row.refunds ?? []).map((refund) => ({
      ...refund,
      createdAt: new Date(refund.createdAt),
    })),
  };
}

const reservationSelect = `
  SELECT
    reservation.id,
    reservation.booking_reference,
    reservation.property_id,
    property.name AS property_name,
    property.slug AS property_slug,
    reservation.guest_user_id,
    reservation.origin_request_id,
    reservation.correlation_id,
    reservation.status,
    reservation.source,
    reservation.guest_name,
    reservation.guest_email,
    reservation.check_in::text AS check_in,
    reservation.check_out::text AS check_out,
    reservation.nights,
    reservation.adults,
    reservation.children,
    COALESCE(items.rooms_count, 0) AS rooms_count,
    reservation.accommodation_subtotal,
    reservation.fee_total,
    reservation.tax_total,
    reservation.discount_total,
    reservation.total_amount,
    reservation.currency,
    (
      reservation.status = 'pending'
      AND reservation.hold_expires_at > statement_timestamp()
    ) AS hold_active,
    reservation.hold_expires_at,
    reservation.cancellation_policy_snapshot,
    reservation.created_at,
    COALESCE(items.records, '[]'::jsonb) AS items,
    COALESCE(charges.records, '[]'::jsonb) AS charges,
    payment.record AS payment,
    COALESCE(refunds.records, '[]'::jsonb) AS refunds
  FROM aureum.reservations AS reservation
  JOIN aureum.properties AS property ON property.id = reservation.property_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(sum(item.quantity), 0)::integer AS rooms_count,
      jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'roomKey', unit_type.code,
          'roomName', item.unit_name_snapshot,
          'rateKey', rate_plan.code,
          'rateName', item.rate_plan_snapshot ->> 'name',
          'quantity', item.quantity,
          'adults', item.adults,
          'children', item.children,
          'averageNightlyRate', item.average_nightly_rate,
          'accommodationSubtotal', item.accommodation_subtotal
        ) ORDER BY item.created_at, item.id
      ) AS records
    FROM aureum.reservation_items AS item
    JOIN aureum.unit_types AS unit_type ON unit_type.id = item.unit_type_id
    LEFT JOIN aureum.rate_plans AS rate_plan ON rate_plan.id = item.rate_plan_id
    WHERE item.reservation_id = reservation.id
  ) AS items ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', charge.id,
        'type', charge.charge_type,
        'code', charge.code,
        'name', charge.public_name_snapshot,
        'calculation', charge.calculation,
        'quantity', charge.quantity,
        'unitAmount', charge.unit_amount,
        'totalAmount', charge.total_amount
      ) ORDER BY charge.created_at, charge.id
    ) AS records
    FROM aureum.reservation_charges AS charge
    WHERE charge.reservation_id = reservation.id
  ) AS charges ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', payment.id,
      'provider', payment.provider,
      'providerPaymentId', payment.provider_payment_id,
      'status', payment.status,
      'amount', payment.amount,
      'amountReceived', payment.amount_received,
      'amountRefunded', payment.amount_refunded,
      'currency', payment.currency,
      'paymentMethodType', payment.payment_method_type,
      'lastErrorMessage', payment.last_error_message,
      'livemode', payment.livemode,
      'succeededAt', payment.succeeded_at,
      'createdAt', payment.created_at
    ) AS record
    FROM aureum.payments AS payment
    WHERE payment.reservation_id = reservation.id
      AND payment.provider = 'stripe'
    LIMIT 1
  ) AS payment ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', refund.id,
        'providerRefundId', refund.provider_refund_id,
        'status', refund.status,
        'amount', refund.amount,
        'currency', refund.currency,
        'reason', refund.reason,
        'failureReason', refund.failure_reason,
        'createdAt', refund.created_at
      ) ORDER BY refund.created_at, refund.id
    ) AS records
    FROM aureum.payment_refunds AS refund
    WHERE refund.reservation_id = reservation.id
  ) AS refunds ON true
`;

export async function findReservationByReference(
  reference: string,
  transaction?: TransactionContext,
  lock = false,
) {
  const query = {
    text: `${reservationSelect}
      WHERE reservation.booking_reference = $1
      ${lock ? "FOR UPDATE OF reservation" : ""}
      LIMIT 1
    `,
    values: [reference.trim().toUpperCase()],
  };
  const result = transaction
    ? await transaction.query<ReservationRow>(query)
    : await databaseQuery<ReservationRow>({
        ...query,
        name: "find-reservation-by-reference",
      });
  return result.rows[0] ? mapReservation(result.rows[0]) : null;
}

export async function findReservationByIdempotencyKey(
  transaction: TransactionContext,
  userId: string,
  idempotencyKey: string,
) {
  const result = await transaction.query<ReservationRow>({
    text: `${reservationSelect}
      WHERE reservation.guest_user_id = $1
        AND reservation.idempotency_key = $2
      LIMIT 1
    `,
    values: [userId, idempotencyKey],
  });
  return result.rows[0] ? mapReservation(result.rows[0]) : null;
}

export async function lockReservationIdempotencyKey(
  transaction: TransactionContext,
  userId: string,
  idempotencyKey: string,
) {
  await transaction.query({
    text: `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    values: [`${userId}:${idempotencyKey}`],
  });
}

export async function createReservation(
  transaction: TransactionContext,
  input: ReservationCreateInput,
) {
  const result = await transaction.query<{ id: string }>({
    text: `
      INSERT INTO aureum.reservations (
        booking_reference, property_id, guest_user_id, status, source,
        guest_name, guest_email, check_in, check_out, adults, children,
        accommodation_subtotal, fee_total, tax_total, discount_total,
        total_amount, currency, pricing_snapshot, cancellation_policy_snapshot,
        special_requests, idempotency_key, origin_request_id, correlation_id,
        hold_expires_at, created_by, updated_by
      )
      VALUES (
        $1, $2, $3, 'pending', 'direct', $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18, $19, $20::uuid, $21::uuid,
        now() + interval '30 minutes', $3, $3
      )
      RETURNING id
    `,
    values: [
      input.bookingReference,
      input.propertyId,
      input.guestUserId,
      input.guestName,
      input.guestEmail,
      input.checkIn,
      input.checkOut,
      input.adults,
      input.children,
      input.accommodationSubtotal,
      input.feeTotal,
      input.taxTotal,
      input.discountTotal,
      input.totalAmount,
      input.currency,
      JSON.stringify(input.pricingSnapshot),
      JSON.stringify(input.cancellationPolicySnapshot),
      input.specialRequests ?? null,
      input.idempotencyKey,
      input.originRequestId ?? null,
      input.correlationId ?? null,
    ],
  });
  return result.rows[0].id;
}

export async function createReservationItem(
  transaction: TransactionContext,
  reservationId: string,
  input: ReservationItemCreateInput,
) {
  const result = await transaction.query<{ id: string }>({
    text: `
      INSERT INTO aureum.reservation_items (
        reservation_id, unit_type_id, rate_plan_id, quantity, adults,
        children, unit_name_snapshot, rate_plan_snapshot,
        average_nightly_rate, accommodation_subtotal, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11)
      RETURNING id
    `,
    values: [
      reservationId,
      input.unitTypeId,
      input.ratePlanId,
      input.quantity,
      input.adults,
      input.children,
      input.roomName,
      JSON.stringify(input.ratePlanSnapshot),
      input.averageNightlyRate,
      input.accommodationSubtotal,
      input.actorId,
    ],
  });
  return result.rows[0].id;
}

export async function createReservationCharge(
  transaction: TransactionContext,
  reservationId: string,
  input: ReservationChargeCreateInput,
) {
  await transaction.query({
    text: `
      INSERT INTO aureum.reservation_charges (
        reservation_id, reservation_item_id, charge_type, code,
        public_name_snapshot, calculation, quantity, unit_amount,
        total_amount, currency, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    `,
    values: [
      reservationId,
      input.reservationItemId ?? null,
      input.type,
      input.code,
      input.name,
      input.calculation,
      input.quantity,
      input.unitAmount,
      input.totalAmount,
      input.currency,
      JSON.stringify(input.metadata ?? {}),
    ],
  });
}

export async function findReservationById(
  transaction: TransactionContext,
  reservationId: string,
  lock = false,
) {
  const result = await transaction.query<ReservationRow>({
    text: `${reservationSelect}
      WHERE reservation.id = $1
      ${lock ? "FOR UPDATE OF reservation" : ""}
      LIMIT 1
    `,
    values: [reservationId],
  });
  return result.rows[0] ? mapReservation(result.rows[0]) : null;
}

export async function expireReservationHold(
  transaction: TransactionContext,
  reservationId: string,
) {
  await transaction.query({
    text: `
      UPDATE aureum.reservations
      SET
        status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = 'Pending hold expired',
        hold_expires_at = NULL
      WHERE id = $1
        AND status = 'pending'
    `,
    values: [reservationId],
  });
}

export async function listReservations({
  guestUserId,
  limit,
  offset,
  status,
}: {
  guestUserId?: string;
  limit: number;
  offset: number;
  status?: ReservationStatus;
}) {
  const result = await databaseQuery<ReservationRow>({
    name: "list-reservations-api",
    text: `${reservationSelect}
      WHERE ($1::uuid IS NULL OR reservation.guest_user_id = $1)
        AND ($2::aureum.reservation_status IS NULL OR reservation.status = $2)
      ORDER BY reservation.created_at DESC, reservation.id
      LIMIT $3 OFFSET $4
    `,
    values: [guestUserId ?? null, status ?? null, limit, offset],
  });
  const countResult = await databaseQuery<{ total: number }>({
    name: "count-reservations-api",
    text: `
      SELECT count(*)::integer AS total
      FROM aureum.reservations
      WHERE ($1::uuid IS NULL OR guest_user_id = $1)
        AND ($2::aureum.reservation_status IS NULL OR status = $2)
    `,
    values: [guestUserId ?? null, status ?? null],
  });
  return {
    items: result.rows.map(mapReservation),
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function setReservationStatus(
  transaction: TransactionContext,
  reservationId: string,
  status: ReservationStatus,
  actorId: string | null,
  cancellationReason?: string | null,
) {
  await transaction.query({
    text: `
      UPDATE aureum.reservations
      SET
        status = $2::aureum.reservation_status,
        confirmed_at = CASE
          WHEN $2::aureum.reservation_status = 'confirmed'
            THEN COALESCE(confirmed_at, now())
          ELSE confirmed_at
        END,
        cancelled_at = CASE
          WHEN $2::aureum.reservation_status = 'cancelled' THEN now()
          ELSE NULL
        END,
        cancellation_reason = CASE
          WHEN $2::aureum.reservation_status = 'cancelled' THEN $4
          ELSE NULL
        END,
        hold_expires_at = CASE
          WHEN $2::aureum.reservation_status = 'pending' THEN hold_expires_at
          ELSE NULL
        END,
        updated_by = $3
      WHERE id = $1
    `,
    values: [reservationId, status, actorId, cancellationReason ?? null],
  });
}
