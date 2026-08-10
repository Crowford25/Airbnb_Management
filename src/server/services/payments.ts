import "server-only";

import { createHash } from "node:crypto";

import type { AuthUser } from "@/features/auth/types";
import { ApiError } from "@/server/api/errors";
import type { PaymentRecord, ReservationRecord } from "@/server/db/models";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import { findReservationInventoryConflict } from "@/server/db/repositories/inventory";
import {
  completeWebhookEvent,
  findPaymentByProviderId,
  findRefundByIdempotencyKey,
  recordWebhookFailure,
  registerWebhookEvent,
  upsertPayment,
  upsertRefund,
  type PaymentSyncInput,
} from "@/server/db/repositories/payments";
import {
  findReservationById,
  findReservationByReference,
  setReservationStatus,
} from "@/server/db/repositories/reservations";
import {
  enqueueReservationCancellationNotifications,
  enqueueReservationConfirmationNotifications,
} from "@/server/notifications/enqueue";
import {
  withDatabaseTransaction,
  withSerializableRetry,
  type TransactionContext,
} from "@/server/db/query";
import {
  PaymentConfigurationError,
  stripeKeys,
  stripeWebhookSecret,
} from "@/server/payments/config";
import { getPaymentProvider } from "@/server/payments";
import { toMinorUnits } from "@/server/payments/money";
import type {
  ProviderPaymentIntent,
  ProviderRefund,
  ProviderWebhookEvent,
} from "@/server/payments/types";

function paymentProviderError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof PaymentConfigurationError) {
    throw new ApiError(503, "PAYMENTS_NOT_CONFIGURED", error.message);
  }
  console.error("Payment provider operation failed", error);
  throw new ApiError(
    502,
    "PAYMENT_PROVIDER_ERROR",
    "The payment provider could not complete the request. Please try again.",
  );
}

function paymentSyncInput(
  reservationId: string,
  intent: ProviderPaymentIntent,
): PaymentSyncInput {
  return {
    amount: intent.amount,
    amountReceived: intent.amountReceived,
    currency: intent.currency,
    lastErrorCode: intent.lastErrorCode,
    lastErrorMessage: intent.lastErrorMessage,
    livemode: intent.livemode,
    paymentMethodType: intent.paymentMethodType,
    providerCreatedAt: intent.createdAt,
    providerPaymentId: intent.id,
    reservationId,
    status: intent.status,
    succeededAt: intent.succeededAt,
  };
}

function assertReservationOwner(reservation: ReservationRecord, user: AuthUser) {
  if (reservation.guestUserId !== user.id) {
    throw new ApiError(403, "FORBIDDEN", "You cannot pay for this reservation.");
  }
}

function assertPayableReservation(reservation: ReservationRecord) {
  if (reservation.status !== "pending") {
    throw new ApiError(409, "CONFLICT", "Only a pending reservation can be paid.");
  }
  if (!reservation.holdExpiresAt || reservation.holdExpiresAt.getTime() <= Date.now()) {
    throw new ApiError(409, "CONFLICT", "The reservation hold has expired.");
  }
}

export async function createReservationPaymentIntent(
  reference: string,
  user: AuthUser,
  requestId: string,
) {
  const reservation = await findReservationByReference(reference);
  if (!reservation) {
    throw new ApiError(404, "NOT_FOUND", "The reservation was not found.");
  }
  assertReservationOwner(reservation, user);

  const provider = getPaymentProvider();
  const expectedAmount = toMinorUnits(reservation.totalAmount, reservation.currency);
  let intent: ProviderPaymentIntent;

  try {
    // Do not create payable intents until signed webhook delivery is configured;
    // the webhook is the only authority allowed to confirm a direct reservation.
    stripeWebhookSecret();
    if (reservation.payment) {
      intent = await provider.retrievePaymentIntent(
        reservation.payment.providerPaymentId,
      );
    } else {
      assertPayableReservation(reservation);
      intent = await provider.createPaymentIntent(
        {
          amount: expectedAmount,
          bookingReference: reservation.bookingReference,
          currency: reservation.currency,
          customerEmail: reservation.guestEmail,
          reservationId: reservation.id,
        },
        `payment-intent:${reservation.id}:v1`,
      );
    }
  } catch (error) {
    paymentProviderError(error);
  }

  if (intent.status === "succeeded") {
    await reconcilePaymentIntent(intent);
    const reconciled = await findReservationByReference(reference);
    return {
      completed: true,
      payment: reconciled?.payment ?? null,
      reservationStatus: reconciled?.status ?? "pending",
    };
  }

  assertPayableReservation(reservation);
  if (
    intent.amount !== expectedAmount ||
    intent.currency !== reservation.currency.toUpperCase()
  ) {
    throw new ApiError(
      409,
      "PAYMENT_AMOUNT_MISMATCH",
      "The payment amount no longer matches the reservation.",
    );
  }
  if (!intent.clientSecret) {
    throw new ApiError(
      409,
      "PAYMENT_NOT_ACTIONABLE",
      "This payment can no longer be completed from the checkout page.",
    );
  }

  try {
    const payment = await withDatabaseTransaction(async (transaction) => {
      const locked = await findReservationByReference(
        reservation.bookingReference,
        transaction,
        true,
      );
      if (!locked) {
        throw new ApiError(404, "NOT_FOUND", "The reservation was not found.");
      }
      assertPayableReservation(locked);
      const saved = await upsertPayment(
        transaction,
        paymentSyncInput(locked.id, intent),
      );
      await writeAuditEvent(
        {
          action: "payment.intent_created",
          actorUserId: user.id,
          entityId: locked.id,
          entityType: "reservation",
          newData: {
            amount: intent.amount,
            currency: intent.currency,
            provider: "stripe",
            status: intent.status,
          },
          requestId,
        },
        transaction,
      );
      return saved;
    });
    return {
      clientSecret: intent.clientSecret,
      payment,
      publishableKey: stripeKeys().publishableKey,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "CONFLICT") {
      try {
        await provider.cancelPaymentIntent(intent.id);
      } catch {
        // The verified webhook remains authoritative if cancellation races payment.
      }
    }
    throw error;
  }
}

export async function getReservationPayment(
  reference: string,
  user: AuthUser,
  canViewAll: boolean,
) {
  const reservation = await findReservationByReference(reference);
  if (!reservation) {
    throw new ApiError(404, "NOT_FOUND", "The reservation was not found.");
  }
  if (!canViewAll && reservation.guestUserId !== user.id) {
    throw new ApiError(403, "FORBIDDEN", "You cannot view this payment.");
  }
  return {
    payment: reservation.payment,
    refunds: reservation.refunds,
    reservationStatus: reservation.status,
  };
}

async function saveRefund(
  reservation: ReservationRecord,
  payment: PaymentRecord,
  refund: ProviderRefund,
  input: {
    idempotencyKey: string;
    reason: string;
    requestedBy: string | null;
    requestId?: string;
  },
) {
  return withDatabaseTransaction(async (transaction) => {
    const saved = await upsertRefund(transaction, {
      amount: refund.amount,
      currency: refund.currency,
      failureReason: refund.failureReason,
      idempotencyKey: input.idempotencyKey,
      paymentId: payment.id,
      providerCreatedAt: refund.createdAt,
      providerReason: "requested_by_customer",
      providerRefundId: refund.id,
      reason: input.reason,
      requestedBy: input.requestedBy,
      reservationId: reservation.id,
      status: refund.status,
    });
    await writeAuditEvent(
      {
        action: "payment.refund_requested",
        actorUserId: input.requestedBy,
        entityId: reservation.id,
        entityType: "reservation",
        newData: {
          amount: refund.amount,
          currency: refund.currency,
          refundStatus: refund.status,
        },
        requestId: input.requestId,
      },
      transaction,
    );
    return saved;
  });
}

export async function requestReservationRefund(
  reference: string,
  input: { amount?: number; idempotencyKey: string; reason: string },
  user: AuthUser,
  requestId: string,
) {
  const reservation = await findReservationByReference(reference);
  if (!reservation) {
    throw new ApiError(404, "NOT_FOUND", "The reservation was not found.");
  }
  const payment = reservation.payment;
  if (!payment || payment.status !== "succeeded") {
    throw new ApiError(409, "CONFLICT", "No settled payment is available to refund.");
  }
  const existing = await findRefundByIdempotencyKey(payment.id, input.idempotencyKey);
  if (existing) return existing;

  const refundableAmount = payment.amountReceived - payment.amountRefunded;
  const requestedAmount =
    input.amount === undefined
      ? refundableAmount
      : toMinorUnits(input.amount, payment.currency);
  if (requestedAmount <= 0 || requestedAmount > refundableAmount) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "The refund must be greater than zero and cannot exceed the refundable balance.",
    );
  }

  try {
    const refund = await getPaymentProvider().createRefund(
      {
        amount: requestedAmount,
        paymentIntentId: payment.providerPaymentId,
        reason: input.reason,
        reservationId: reservation.id,
      },
      `admin-refund:${payment.id}:${input.idempotencyKey}`,
    );
    return saveRefund(reservation, payment, refund, {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      requestedBy: user.id,
      requestId,
    });
  } catch (error) {
    paymentProviderError(error);
  }
}

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
}

function customerRefundPercentage(reservation: ReservationRecord) {
  const checkIn = Date.parse(`${reservation.checkIn}T00:00:00Z`);
  const today = Date.parse(`${malaysiaToday()}T00:00:00Z`);
  const daysBefore = Math.floor((checkIn - today) / 86_400_000);
  const snapshot = reservation.cancellationPolicySnapshot as {
    items?: Array<{
      policy?: {
        noShowRefundPercentage?: string | number;
        rules?: Array<{
          daysBeforeCheckIn?: number;
          refundPercentage?: string | number;
        }>;
      } | null;
    }>;
  };
  const percentages = (snapshot.items ?? []).map(({ policy }) => {
    const rule = [...(policy?.rules ?? [])]
      .filter((candidate) => Number.isFinite(candidate.daysBeforeCheckIn))
      .sort(
        (left, right) =>
          Number(right.daysBeforeCheckIn) - Number(left.daysBeforeCheckIn),
      )
      .find((candidate) => daysBefore >= Number(candidate.daysBeforeCheckIn));
    return Number(rule?.refundPercentage ?? policy?.noShowRefundPercentage ?? 0);
  });
  return Math.max(0, Math.min(100, percentages.length ? Math.min(...percentages) : 0));
}

export async function preparePaymentForCancellation(
  reservation: ReservationRecord,
  user: AuthUser,
  canManage: boolean,
  reason: string,
  requestId: string,
) {
  const payment = reservation.payment;
  if (!payment || payment.status === "cancelled" || payment.status === "failed") {
    return;
  }

  if (payment.status !== "succeeded") {
    if (payment.status === "processing") {
      throw new ApiError(
        409,
        "PAYMENT_PROCESSING",
        "The payment is still processing. Please wait before cancelling.",
      );
    }
    try {
      const cancelled = await getPaymentProvider().cancelPaymentIntent(
        payment.providerPaymentId,
      );
      await withDatabaseTransaction(async (transaction) => {
        await upsertPayment(transaction, paymentSyncInput(reservation.id, cancelled));
      });
      return;
    } catch (error) {
      paymentProviderError(error);
    }
  }

  const refundableAmount = payment.amountReceived - payment.amountRefunded;
  const percentage = canManage ? 100 : customerRefundPercentage(reservation);
  const refundAmount = Math.floor((refundableAmount * percentage) / 100);
  if (refundAmount <= 0) return;
  const idempotencyKey = `cancellation:${reservation.id}:v1`;
  const existing = await findRefundByIdempotencyKey(payment.id, idempotencyKey);
  if (existing) return;

  try {
    const refund = await getPaymentProvider().createRefund(
      {
        amount: refundAmount,
        paymentIntentId: payment.providerPaymentId,
        reason,
        reservationId: reservation.id,
      },
      idempotencyKey,
    );
    await saveRefund(reservation, payment, refund, {
      idempotencyKey,
      reason,
      requestedBy: user.id,
      requestId,
    });
  } catch (error) {
    paymentProviderError(error);
  }
}

async function handlePaymentIntentEvent(
  transaction: TransactionContext,
  intent: ProviderPaymentIntent,
) {
  const reservationId = intent.metadata.reservationId;
  if (!reservationId) return { ignored: true as const, latePayment: null };
  const reservation = await findReservationById(transaction, reservationId, true);
  if (!reservation) return { ignored: true as const, latePayment: null };
  const expectedAmount = toMinorUnits(reservation.totalAmount, reservation.currency);
  const payment = await upsertPayment(
    transaction,
    paymentSyncInput(reservation.id, intent),
  );

  if (intent.status !== "succeeded") {
    return { ignored: false as const, latePayment: null };
  }

  const validAmount =
    intent.amount === expectedAmount &&
    intent.amountReceived >= expectedAmount &&
    intent.currency === reservation.currency.toUpperCase();

  // Provider event delivery is at-least-once and may be out of order. Once this
  // exact paid reservation is confirmed, later equivalent events are harmless.
  if (reservation.status === "confirmed" && validAmount) {
    return { ignored: false as const, latePayment: null };
  }
  const paymentWasWithinHold =
    reservation.status === "pending" &&
    Boolean(reservation.holdExpiresAt) &&
    (intent.succeededAt
      ? intent.succeededAt.getTime() <= reservation.holdExpiresAt!.getTime()
      : reservation.holdExpiresAt!.getTime() > Date.now());

  const inventoryConflict =
    validAmount && paymentWasWithinHold
      ? await findReservationInventoryConflict(transaction, reservation.id)
      : null;

  if (validAmount && paymentWasWithinHold && !inventoryConflict) {
    await setReservationStatus(
      transaction,
      reservation.id,
      "confirmed",
      reservation.guestUserId,
    );
    await writeAuditEvent(
      {
        action: "reservation.confirmed_by_payment",
        actorUserId: null,
        correlationId: reservation.correlationId,
        entityId: reservation.id,
        entityType: "reservation",
        newData: { paymentStatus: "succeeded", status: "confirmed" },
        previousData: { status: "pending" },
        requestId: reservation.originRequestId,
      },
      transaction,
    );
    await enqueueReservationConfirmationNotifications(transaction, reservation, {
      correlationId: reservation.correlationId,
      originRequestId: reservation.originRequestId,
      triggeredByUserId: reservation.guestUserId,
    });
    return { ignored: false as const, latePayment: null };
  }

  if (reservation.status === "pending") {
    const cancellationReason =
      validAmount && paymentWasWithinHold && inventoryConflict
        ? `${inventoryConflict.roomName} no longer had ${inventoryConflict.requiredUnits} room(s) available on ${inventoryConflict.date}`
        : validAmount
          ? "Payment completed after the booking hold expired"
          : "Payment amount or currency did not match the reservation";
    await setReservationStatus(
      transaction,
      reservation.id,
      "cancelled",
      reservation.guestUserId,
      cancellationReason,
    );
    await enqueueReservationCancellationNotifications(
      transaction,
      reservation,
      cancellationReason,
      {
        correlationId: reservation.correlationId,
        originRequestId: reservation.originRequestId,
        triggeredByUserId: reservation.guestUserId,
      },
    );
  }
  return {
    ignored: false as const,
    latePayment: {
      payment,
      reason:
        validAmount && paymentWasWithinHold && inventoryConflict
          ? `Automatic refund: ${inventoryConflict.roomName} was no longer available for ${inventoryConflict.date}`
          : validAmount
            ? "Automatic refund: booking hold expired before confirmation"
            : "Automatic refund: payment did not match reservation total",
      reservation,
    },
  };
}

async function handleRefundEvent(
  transaction: TransactionContext,
  refund: ProviderRefund,
) {
  const reservationId = refund.metadata.reservationId;
  const payment = refund.paymentIntentId
    ? await findPaymentByProviderId(refund.paymentIntentId, transaction)
    : null;
  if (!reservationId || !payment) return true;
  await upsertRefund(transaction, {
    amount: refund.amount,
    currency: refund.currency,
    failureReason: refund.failureReason,
    idempotencyKey: `webhook:${refund.id}`,
    paymentId: payment.id,
    providerCreatedAt: refund.createdAt,
    providerReason: "requested_by_customer",
    providerRefundId: refund.id,
    reason: refund.metadata.internalReason ?? "Stripe refund",
    requestedBy: null,
    reservationId,
    status: refund.status,
  });
  return false;
}

async function refundLatePayment(input: {
  payment: PaymentRecord;
  reason: string;
  reservation: ReservationRecord;
}) {
  const idempotencyKey = `late-payment:${input.payment.id}:v1`;
  const existing = await findRefundByIdempotencyKey(input.payment.id, idempotencyKey);
  if (existing) return;
  const refundable = input.payment.amountReceived - input.payment.amountRefunded;
  if (refundable <= 0) return;
  const refund = await getPaymentProvider().createRefund(
    {
      amount: refundable,
      paymentIntentId: input.payment.providerPaymentId,
      reason: input.reason,
      reservationId: input.reservation.id,
    },
    idempotencyKey,
  );
  await saveRefund(input.reservation, input.payment, refund, {
    idempotencyKey,
    reason: input.reason,
    requestedBy: null,
  });
}

async function reconcilePaymentIntent(intent: ProviderPaymentIntent) {
  let latePayment: Awaited<ReturnType<typeof handlePaymentIntentEvent>>["latePayment"] =
    null;
  await withSerializableRetry(async (transaction) => {
    const result = await handlePaymentIntentEvent(transaction, intent);
    latePayment = result.latePayment;
  });
  if (latePayment) await refundLatePayment(latePayment);
}

const paymentEventTypes = new Set([
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
]);
const refundEventTypes = new Set(["refund.created", "refund.updated", "refund.failed"]);

export async function processPaymentWebhook(
  event: ProviderWebhookEvent,
  rawPayload: string,
) {
  const payloadHash = createHash("sha256").update(rawPayload).digest("hex");
  try {
    const registrationStatus = await withDatabaseTransaction((transaction) =>
      registerWebhookEvent(transaction, {
        apiVersion: event.apiVersion,
        eventId: event.id,
        eventType: event.type,
        livemode: event.livemode,
        payloadHash,
      }),
    );
    if (["processed", "ignored"].includes(registrationStatus)) return;

    let ignored = true;
    let latePayment: Awaited<
      ReturnType<typeof handlePaymentIntentEvent>
    >["latePayment"] = null;
    await withSerializableRetry(async (transaction) => {
      if (paymentEventTypes.has(event.type) && event.paymentIntent) {
        const result = await handlePaymentIntentEvent(transaction, event.paymentIntent);
        ignored = result.ignored;
        latePayment = result.latePayment;
      } else if (refundEventTypes.has(event.type) && event.refund) {
        ignored = await handleRefundEvent(transaction, event.refund);
      }
    });
    if (latePayment) await refundLatePayment(latePayment);
    await withDatabaseTransaction((transaction) =>
      completeWebhookEvent(transaction, event.id, ignored),
    );
  } catch (error) {
    await recordWebhookFailure({
      apiVersion: event.apiVersion,
      errorMessage:
        error instanceof Error ? error.message : "Webhook processing failed",
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      payloadHash,
    });
    throw error;
  }
}
