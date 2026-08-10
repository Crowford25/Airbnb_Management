"use client";

import Link from "next/link";
import { useState } from "react";

import { env } from "@/config/env";
import { ApiClient, ApiError } from "@/services/http/api-client";

export type AccountReservation = {
  bookingReference: string;
  checkIn: string;
  checkOut: string;
  currency: string;
  holdActive: boolean;
  propertyName: string;
  propertySlug: string;
  roomsCount: number;
  items: Array<{ roomName: string; quantity: number }>;
  holdExpiresAt: string | null;
  payment: {
    amountReceived: number;
    amountRefunded: number;
    status: string;
  } | null;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  totalAmount: string;
};

const client = new ApiClient(env.apiBaseUrl);

export function AccountReservations({
  initialReservations,
}: {
  initialReservations: AccountReservation[];
}) {
  const [reservations, setReservations] = useState(initialReservations);
  const [workingReference, setWorkingReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancel(reference: string) {
    if (
      !window.confirm(
        "Cancel this reservation? Any refund will follow the cancellation policy shown when you booked.",
      )
    ) {
      return;
    }
    setError(null);
    setWorkingReference(reference);

    try {
      const basePath = env.apiBaseUrl ? "/reservations" : "/api/reservations";
      const result = await client.request<{
        reservation: AccountReservation;
      }>(`${basePath}/${encodeURIComponent(reference)}`, {
        body: { cancellationReason: "Cancelled by customer", status: "cancelled" },
        method: "PATCH",
      });
      setReservations((current) =>
        current.map((reservation) =>
          reservation.bookingReference === reference ? result.reservation : reservation,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "The reservation could not be cancelled.",
      );
    } finally {
      setWorkingReference(null);
    }
  }

  if (reservations.length === 0) {
    return (
      <div className="border-border mt-10 rounded-2xl border border-dashed p-8 text-center">
        <p className="text-muted text-sm">You do not have any reservations yet.</p>
        <Link
          className="text-gold mt-4 inline-flex text-sm font-semibold"
          href="/properties"
        >
          Browse available stays
        </Link>
      </div>
    );
  }

  return (
    <section className="mt-12" aria-labelledby="reservations-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-gold text-xs font-semibold tracking-[0.2em] uppercase">
            Live booking data
          </p>
          <h2 className="mt-2 text-2xl font-semibold" id="reservations-heading">
            Your reservations
          </h2>
        </div>
        <span className="text-muted text-sm">{reservations.length} total</span>
      </div>

      {error ? (
        <p className="mt-5 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4">
        {reservations.map((reservation) => {
          const amount = new Intl.NumberFormat("en-MY", {
            currency: reservation.currency,
            style: "currency",
          }).format(Number(reservation.totalAmount));
          const canCancel = ["pending", "confirmed"].includes(reservation.status);
          const canPay =
            reservation.status === "pending" &&
            (Boolean(reservation.payment) ||
              (reservation.holdActive &&
                !["processing", "succeeded"].includes(
                  reservation.payment?.status ?? "requires_payment_method",
                )));
          const paymentNeedsStatusCheck =
            Boolean(reservation.payment) &&
            (!reservation.holdActive ||
              ["processing", "succeeded"].includes(
                reservation.payment?.status ?? "requires_payment_method",
              ));
          const paymentLabel = reservation.payment
            ? reservation.payment.status === "succeeded"
              ? reservation.payment.amountRefunded > 0
                ? "Refunded"
                : "Paid"
              : reservation.payment.status === "processing"
                ? "Payment processing"
                : "Payment pending"
            : reservation.status === "pending"
              ? "Payment required"
              : "No online payment";

          return (
            <article
              className="border-border bg-surface rounded-2xl border p-5 sm:p-6"
              key={reservation.bookingReference}
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-gold text-xs font-semibold tracking-wider uppercase">
                    {reservation.bookingReference}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">
                    {reservation.propertyName}
                  </h3>
                  <p className="text-muted mt-2 text-sm">
                    {reservation.checkIn} → {reservation.checkOut} ·{" "}
                    {reservation.roomsCount}{" "}
                    {reservation.roomsCount === 1 ? "room" : "rooms"}
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    {reservation.items
                      .map((item) => `${item.quantity} × ${item.roomName}`)
                      .join(" · ")}
                  </p>
                </div>
                <div className="sm:text-right">
                  <span className="border-border rounded-full border px-3 py-1 text-xs font-semibold uppercase">
                    {reservation.status}
                  </span>
                  <p className="text-gold mt-2 text-xs font-semibold">{paymentLabel}</p>
                  <p className="mt-3 font-semibold">{amount}</p>
                </div>
              </div>
              <div className="border-border mt-5 flex flex-wrap gap-3 border-t pt-5">
                <Link
                  className="border-border hover:border-gold hover:text-gold rounded-lg border px-4 py-2 text-sm transition"
                  href={`/properties/${reservation.propertySlug}`}
                >
                  View property
                </Link>
                {canPay ? (
                  <Link
                    className="bg-gold text-background hover:bg-gold-light rounded-lg px-4 py-2 text-sm font-semibold transition"
                    href={`/account/reservations/${encodeURIComponent(reservation.bookingReference)}/pay`}
                  >
                    {paymentNeedsStatusCheck ? "Check payment" : "Pay now"}
                  </Link>
                ) : null}
                {canCancel ? (
                  <button
                    className="rounded-lg border border-red-900/70 px-4 py-2 text-sm text-red-200 transition hover:bg-red-950/40 disabled:opacity-50"
                    disabled={workingReference === reservation.bookingReference}
                    onClick={() => cancel(reservation.bookingReference)}
                    type="button"
                  >
                    {workingReference === reservation.bookingReference
                      ? "Cancelling…"
                      : "Cancel reservation"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
