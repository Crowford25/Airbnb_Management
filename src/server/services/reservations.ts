import "server-only";

import { randomBytes } from "node:crypto";

import type { AuthUser } from "@/features/auth/types";
import { ApiError } from "@/server/api/errors";
import { requestTrace } from "@/server/api/request-context";
import type { ChargeCalculation, ReservationStatus } from "@/server/db/models";
import {
  getLockedInventoryDays,
  listActiveFeeRules,
  listActiveTaxRules,
  lockRoomRatesForBooking,
  type LockedRoomRate,
  type PricingRule,
} from "@/server/db/repositories/inventory";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import {
  findPropertyByIdForBooking,
  findPropertyBySlug,
} from "@/server/db/repositories/properties";
import {
  createReservation,
  createReservationCharge,
  createReservationItem,
  findReservationById,
  findReservationByIdempotencyKey,
  findReservationByReference,
  setReservationStatus,
  lockReservationIdempotencyKey,
  type ReservationChargeCreateInput,
} from "@/server/db/repositories/reservations";
import {
  withDatabaseTransaction,
  withSerializableRetry,
  type TransactionContext,
} from "@/server/db/query";
import { preparePaymentForCancellation } from "@/server/services/payments";
import {
  enqueueReservationCancellationNotifications,
  enqueueReservationConfirmationNotifications,
} from "@/server/notifications/enqueue";

export type CreateReservationInput = {
  propertySlug: string;
  checkIn: string;
  checkOut: string;
  items: Array<{
    roomKey: string;
    rateKey?: string;
    quantity: number;
    adults: number;
    children: number;
  }>;
  idempotencyKey: string;
  specialRequests?: string | null;
};

type PricedItem = {
  input: CreateReservationInput["items"][number];
  roomRate: LockedRoomRate;
  nightlyPrices: number[];
  accommodationSubtotal: number;
  averageNightlyRate: number;
};

function differenceInNights(checkIn: string, checkOut: string) {
  const arrival = Date.parse(`${checkIn}T00:00:00.000Z`);
  const departure = Date.parse(`${checkOut}T00:00:00.000Z`);
  return Math.round((departure - arrival) / 86_400_000);
}

function todayInMalaysia() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
  }).format(new Date());
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function bookingReference() {
  const date = todayInMalaysia().replaceAll("-", "");
  return `EV-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function ruleQuantity(
  calculation: ChargeCalculation,
  nights: number,
  roomQuantity: number,
  guests: number,
) {
  switch (calculation) {
    case "fixed_per_night":
      return nights;
    case "per_unit_per_stay":
      return roomQuantity;
    case "per_unit_per_night":
      return roomQuantity * nights;
    case "per_guest_per_night":
      return guests * nights;
    default:
      return 1;
  }
}

function priceRule(
  rule: PricingRule,
  pricedItems: PricedItem[],
  nights: number,
  taxableFees = 0,
) {
  const scopedItems = rule.unitTypeId
    ? pricedItems.filter((item) => item.roomRate.unitTypeId === rule.unitTypeId)
    : pricedItems;
  if (scopedItems.length === 0) return null;

  const accommodation = scopedItems.reduce(
    (sum, item) => sum + item.accommodationSubtotal,
    0,
  );
  const rooms = scopedItems.reduce((sum, item) => sum + item.input.quantity, 0);
  const guests = scopedItems.reduce(
    (sum, item) => sum + item.input.adults + item.input.children,
    0,
  );
  const amount = Number(rule.amount);

  if (rule.calculation === "percentage_of_accommodation") {
    const base = accommodation + taxableFees;
    return {
      quantity: base,
      totalAmount: money((base * amount) / 100),
      unitAmount: amount,
    };
  }

  const quantity = ruleQuantity(rule.calculation, nights, rooms, guests);
  return { quantity, totalAmount: money(quantity * amount), unitAmount: amount };
}

async function resolveAndPriceItems(
  transaction: TransactionContext,
  propertyId: string,
  currency: string,
  input: CreateReservationInput,
  nights: number,
) {
  const roomKeys = [...new Set(input.items.map((item) => item.roomKey))].sort();
  const roomRates = await lockRoomRatesForBooking(transaction, propertyId, roomKeys);
  const pricedItems: PricedItem[] = [];

  for (const item of input.items) {
    const candidates = roomRates.filter((rate) => rate.roomKey === item.roomKey);
    const roomRate = item.rateKey
      ? candidates.find((rate) => rate.rateKey === item.rateKey)
      : candidates.find((rate) => rate.isDefault);

    if (!roomRate) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `The selected room or rate plan (${item.roomKey}) is unavailable.`,
      );
    }

    if (roomRate.currency !== currency) {
      throw new ApiError(
        409,
        "CONFLICT",
        "The selected rate plan uses a different property currency.",
      );
    }

    if (
      item.adults > item.quantity * roomRate.maxAdults ||
      item.children > item.quantity * roomRate.maxChildren ||
      item.adults + item.children > item.quantity * roomRate.maxGuests
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `${roomRate.roomName} cannot accommodate the selected guests and room quantity.`,
      );
    }

    const days = await getLockedInventoryDays(
      transaction,
      roomRate.unitTypeId,
      roomRate.ratePlanId,
      input.checkIn,
      input.checkOut,
    );
    if (days.length !== nights + 1) {
      throw new ApiError(409, "CONFLICT", "The requested rate window is incomplete.");
    }

    const stayDays = days.slice(0, -1);
    const departureDay = days.at(-1);
    const unavailableDay = stayDays.find(
      (day, index) =>
        day.remainingUnits < item.quantity ||
        (index === 0 && day.closedToArrival) ||
        nights < day.minimumNights,
    );
    if (unavailableDay || departureDay?.closedToDeparture) {
      const restrictedDate = unavailableDay?.date ?? departureDay?.date;
      throw new ApiError(
        409,
        "CONFLICT",
        `${roomRate.roomName} is unavailable from ${restrictedDate}.`,
      );
    }

    const nightlyPrices = stayDays.map((day) => Number(day.nightlyRate));
    const accommodationSubtotal = money(
      nightlyPrices.reduce((sum, rate) => sum + rate, 0) * item.quantity,
    );
    pricedItems.push({
      accommodationSubtotal,
      averageNightlyRate: money(accommodationSubtotal / nights / item.quantity),
      input: item,
      nightlyPrices,
      roomRate,
    });
  }
  return pricedItems;
}

async function calculateCharges(
  transaction: TransactionContext,
  propertyId: string,
  checkIn: string,
  pricedItems: PricedItem[],
  nights: number,
  currency: string,
) {
  const feeRules = await listActiveFeeRules(transaction, propertyId, checkIn);
  const taxRules = await listActiveTaxRules(transaction, propertyId, checkIn);
  const fees: Array<ReservationChargeCreateInput & { taxable: boolean }> = [];

  for (const rule of feeRules) {
    const amount = priceRule(rule, pricedItems, nights);
    if (!amount || amount.totalAmount === 0) continue;
    fees.push({
      calculation: rule.calculation,
      code: rule.code,
      currency,
      metadata: { pricingRuleId: rule.id, unitTypeId: rule.unitTypeId },
      name: rule.name,
      quantity: amount.quantity,
      taxable: rule.isTaxable,
      totalAmount: amount.totalAmount,
      type: "fee",
      unitAmount: amount.unitAmount,
    });
  }

  const taxableFees = fees
    .filter((fee) => fee.taxable)
    .reduce((sum, fee) => sum + fee.totalAmount, 0);
  const taxes: ReservationChargeCreateInput[] = [];
  for (const rule of taxRules) {
    const amount = priceRule(rule, pricedItems, nights, taxableFees);
    if (!amount || amount.totalAmount === 0) continue;
    taxes.push({
      calculation: rule.calculation,
      code: rule.code,
      currency,
      metadata: { includedInPrice: rule.includedInPrice, pricingRuleId: rule.id },
      name: rule.name,
      quantity: amount.quantity,
      totalAmount: amount.totalAmount,
      type: "tax",
      unitAmount: amount.unitAmount,
    });
  }

  const feeTotal = money(fees.reduce((sum, fee) => sum + fee.totalAmount, 0));
  const taxTotal = money(
    taxes
      .filter((tax) => tax.metadata?.includedInPrice !== true)
      .reduce((sum, tax) => sum + tax.totalAmount, 0),
  );
  return { fees, feeTotal, taxes, taxTotal };
}

export async function createReservationHold(
  input: CreateReservationInput,
  user: AuthUser,
  requestId: string,
) {
  const trace = requestTrace();
  if (input.checkIn < todayInMalaysia()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Check-in cannot be in the past.");
  }

  const nights = differenceInNights(input.checkIn, input.checkOut);
  if (nights < 1 || nights > 90) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "A reservation must be between 1 and 90 nights.",
    );
  }

  const publicProperty = await findPropertyBySlug(input.propertySlug);
  if (!publicProperty) {
    throw new ApiError(404, "NOT_FOUND", "The property was not found.");
  }

  return withSerializableRetry(async (transaction) => {
    const property = await findPropertyByIdForBooking(transaction, publicProperty.id);
    if (!property || property.status !== "published") {
      throw new ApiError(404, "NOT_FOUND", "The property is not available.");
    }

    await lockReservationIdempotencyKey(transaction, user.id, input.idempotencyKey);
    const priorReservation = await findReservationByIdempotencyKey(
      transaction,
      user.id,
      input.idempotencyKey,
    );
    if (priorReservation) {
      return { created: false, reservation: priorReservation };
    }

    const pricedItems = await resolveAndPriceItems(
      transaction,
      property.id,
      property.currency,
      input,
      nights,
    );
    const accommodationSubtotal = money(
      pricedItems.reduce((sum, item) => sum + item.accommodationSubtotal, 0),
    );
    const { fees, feeTotal, taxes, taxTotal } = await calculateCharges(
      transaction,
      property.id,
      input.checkIn,
      pricedItems,
      nights,
      property.currency,
    );
    const discountTotal = 0;
    const totalAmount = money(
      accommodationSubtotal + feeTotal + taxTotal - discountTotal,
    );
    const adults = input.items.reduce((sum, item) => sum + item.adults, 0);
    const children = input.items.reduce((sum, item) => sum + item.children, 0);
    const cancellationPolicies = pricedItems.map((item) => ({
      policy: item.roomRate.cancellationPolicy,
      rateKey: item.roomRate.rateKey,
      roomKey: item.roomRate.roomKey,
    }));

    const reservationId = await createReservation(transaction, {
      accommodationSubtotal,
      adults,
      bookingReference: bookingReference(),
      cancellationPolicySnapshot: { items: cancellationPolicies },
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      children,
      currency: property.currency,
      discountTotal,
      feeTotal,
      guestEmail: user.email,
      guestName: user.name,
      guestUserId: user.id,
      idempotencyKey: input.idempotencyKey,
      originRequestId: requestId,
      correlationId: trace.correlationId,
      pricingSnapshot: {
        currency: property.currency,
        items: pricedItems.map((item) => ({
          nightlyPrices: item.nightlyPrices,
          quantity: item.input.quantity,
          rateKey: item.roomRate.rateKey,
          roomKey: item.roomRate.roomKey,
        })),
      },
      propertyId: property.id,
      specialRequests: input.specialRequests,
      taxTotal,
      totalAmount,
    });

    for (const item of pricedItems) {
      const reservationItemId = await createReservationItem(
        transaction,
        reservationId,
        {
          accommodationSubtotal: item.accommodationSubtotal,
          actorId: user.id,
          adults: item.input.adults,
          averageNightlyRate: item.averageNightlyRate,
          children: item.input.children,
          quantity: item.input.quantity,
          ratePlanId: item.roomRate.ratePlanId,
          ratePlanSnapshot: {
            cancellationPolicy: item.roomRate.cancellationPolicy,
            code: item.roomRate.rateKey,
            currency: item.roomRate.currency,
            name: item.roomRate.rateName,
            nightlyPrices: item.nightlyPrices,
          },
          roomName: item.roomRate.roomName,
          unitTypeId: item.roomRate.unitTypeId,
        },
      );
      await createReservationCharge(transaction, reservationId, {
        calculation: "per_unit_per_night",
        code: "accommodation",
        currency: property.currency,
        name: item.roomRate.roomName,
        quantity: item.input.quantity * nights,
        reservationItemId,
        totalAmount: item.accommodationSubtotal,
        type: "accommodation",
        unitAmount: item.averageNightlyRate,
      });
    }

    for (const fee of fees) {
      const { taxable, ...charge } = fee;
      void taxable;
      await createReservationCharge(transaction, reservationId, charge);
    }
    for (const tax of taxes) {
      await createReservationCharge(transaction, reservationId, tax);
    }

    await writeAuditEvent(
      {
        action: "reservation.created",
        actorUserId: user.id,
        entityId: reservationId,
        entityType: "reservation",
        newData: {
          adults,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          items: input.items.map(({ roomKey, quantity }) => ({ quantity, roomKey })),
          status: "pending",
          totalAmount,
        },
        requestId,
      },
      transaction,
    );
    const reservation = await findReservationById(transaction, reservationId);
    if (!reservation) {
      throw new Error("The reservation could not be reloaded after creation.");
    }
    return { created: true, reservation };
  });
}

export async function changeReservationStatus(
  reference: string,
  nextStatus: ReservationStatus,
  user: AuthUser,
  canManage: boolean,
  requestId: string,
  cancellationReason?: string | null,
) {
  if (nextStatus === "cancelled") {
    const current = await findReservationByReference(reference);
    if (!current) {
      throw new ApiError(404, "NOT_FOUND", "The reservation was not found.");
    }
    const isOwner = current.guestUserId === user.id;
    if (!canManage && !isOwner) {
      throw new ApiError(403, "FORBIDDEN", "You cannot update this reservation.");
    }
    if (!["pending", "confirmed"].includes(current.status)) {
      throw new ApiError(
        409,
        "CONFLICT",
        `A ${current.status} reservation cannot become cancelled.`,
      );
    }
    await preparePaymentForCancellation(
      current,
      user,
      canManage,
      cancellationReason?.trim() ||
        (canManage ? "Cancelled by staff" : "Cancelled by customer"),
      requestId,
    );
  }

  return withDatabaseTransaction(
    async (transaction) => {
      const reservation = await findReservationByReference(
        reference,
        transaction,
        true,
      );
      if (!reservation) {
        throw new ApiError(404, "NOT_FOUND", "The reservation was not found.");
      }

      const isOwner = reservation.guestUserId === user.id;
      if (!canManage && !isOwner) {
        throw new ApiError(403, "FORBIDDEN", "You cannot update this reservation.");
      }
      if (!canManage && nextStatus !== "cancelled") {
        throw new ApiError(403, "FORBIDDEN", "Customers can only cancel a stay.");
      }
      if (reservation.status === nextStatus) return reservation;

      const allowedTransitions: Record<ReservationStatus, ReservationStatus[]> = {
        cancelled: [],
        completed: [],
        confirmed: ["completed", "cancelled"],
        pending: ["confirmed", "cancelled"],
      };
      if (!allowedTransitions[reservation.status].includes(nextStatus)) {
        throw new ApiError(
          409,
          "CONFLICT",
          `A ${reservation.status} reservation cannot become ${nextStatus}.`,
        );
      }
      if (
        nextStatus === "confirmed" &&
        reservation.holdExpiresAt &&
        reservation.holdExpiresAt.getTime() <= Date.now()
      ) {
        throw new ApiError(409, "CONFLICT", "The pending reservation hold expired.");
      }
      if (
        nextStatus === "confirmed" &&
        reservation.source === "direct" &&
        reservation.payment?.status !== "succeeded"
      ) {
        throw new ApiError(
          409,
          "PAYMENT_REQUIRED",
          "Direct reservations are confirmed only by a verified successful payment.",
        );
      }

      await setReservationStatus(
        transaction,
        reservation.id,
        nextStatus,
        user.id,
        cancellationReason,
      );
      if (nextStatus === "confirmed") {
        await enqueueReservationConfirmationNotifications(transaction, reservation);
      } else if (nextStatus === "cancelled") {
        await enqueueReservationCancellationNotifications(
          transaction,
          reservation,
          cancellationReason?.trim() ||
            (canManage ? "Cancelled by staff" : "Cancelled by customer"),
        );
      }
      await writeAuditEvent(
        {
          action: `reservation.${nextStatus}`,
          actorUserId: user.id,
          entityId: reservation.id,
          entityType: "reservation",
          newData: { status: nextStatus },
          previousData: { status: reservation.status },
          requestId,
        },
        transaction,
      );
      const updated = await findReservationById(transaction, reservation.id);
      if (!updated) {
        throw new Error("The reservation could not be reloaded after updating.");
      }
      return updated;
    },
    { isolation: "serializable" },
  );
}
