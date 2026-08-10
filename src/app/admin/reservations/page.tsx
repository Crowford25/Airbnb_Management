import type { Metadata } from "next";

import { PageHeader } from "@/features/admin/components/page-header";
import { ReservationStatusControl } from "@/features/admin/components/reservation-status-control";
import { RefundPaymentControl } from "@/features/admin/components/refund-payment-control";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDate, humanize } from "@/features/admin/format";
import { hasPermission } from "@/features/auth/rbac";
import { requirePermission } from "@/features/auth/server/authorization";
import { listReservations } from "@/server/db/repositories/reservations";
import { fromMinorUnits } from "@/server/payments/money";

export const metadata: Metadata = { title: "Reservation management" };

export default async function AdminReservationsPage() {
  const user = await requirePermission("reservations:view", "/admin/reservations");
  const { items: reservations, total } = await listReservations({
    limit: 100,
    offset: 0,
  });
  const canManage = hasPermission(user.role, "reservations:manage");

  return (
    <>
      <PageHeader
        description="Review booking contents, payment state, refunds and lifecycle status. Direct bookings confirm only after a verified successful payment webhook."
        eyebrow={canManage ? "Booking management" : "Reservation register"}
        title="Reservations"
      />

      <section className="border-border bg-surface mt-8 overflow-hidden rounded-2xl border">
        <div className="border-border flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <p className="text-sm font-semibold">Latest bookings</p>
          <p className="text-muted text-xs">{total} total</p>
        </div>
        {reservations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="text-muted bg-background/60 text-[11px] tracking-wide uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium sm:px-6">Reference / guest</th>
                  <th className="px-4 py-3 font-medium">Stay</th>
                  <th className="px-4 py-3 font-medium">Rooms</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-5 py-3 font-medium sm:px-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {reservations.map((reservation) => (
                  <tr className="align-top" key={reservation.id}>
                    <td className="px-5 py-4 sm:px-6">
                      <p className="font-mono text-xs font-semibold">
                        {reservation.bookingReference}
                      </p>
                      <p className="mt-2 font-semibold">{reservation.guestName}</p>
                      <p className="text-muted mt-1 text-xs">
                        {reservation.guestEmail}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{reservation.propertyName}</p>
                      <p className="text-muted mt-1 text-xs">
                        {formatDate(reservation.checkIn)} –{" "}
                        {formatDate(reservation.checkOut)}
                      </p>
                      <p className="text-muted mt-1 text-xs">
                        {reservation.nights}{" "}
                        {reservation.nights === 1 ? "night" : "nights"} ·{" "}
                        {reservation.adults + reservation.children} guests
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="grid gap-1">
                        {reservation.items.map((item) => (
                          <p className="text-xs" key={item.id}>
                            {item.quantity} × {item.roomName}
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="text-muted px-4 py-4 text-xs">
                      {humanize(reservation.source)}
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {formatCurrency(reservation.totalAmount, reservation.currency)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={reservation.status} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        status={reservation.payment?.status ?? "payment_required"}
                      />
                      {reservation.payment?.amountRefunded ? (
                        <p className="text-muted mt-2 text-[11px]">
                          {formatCurrency(
                            fromMinorUnits(
                              reservation.payment.amountRefunded,
                              reservation.payment.currency,
                            ),
                            reservation.payment.currency,
                          )}{" "}
                          refunded
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      {canManage ? (
                        <div className="grid gap-2">
                          <ReservationStatusControl
                            bookingReference={reservation.bookingReference}
                            paymentStatus={reservation.payment?.status ?? null}
                            source={reservation.source}
                            status={reservation.status}
                          />
                          {reservation.payment?.status === "succeeded" &&
                          reservation.payment.amountReceived >
                            reservation.payment.amountRefunded ? (
                            <RefundPaymentControl
                              bookingReference={reservation.bookingReference}
                              currency={reservation.payment.currency}
                              refundableAmount={fromMinorUnits(
                                reservation.payment.amountReceived -
                                  reservation.payment.amountRefunded,
                                reservation.payment.currency,
                              )}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted text-xs">Read only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">No reservations yet</p>
            <p className="text-muted mt-2 text-sm">
              New customer and manual bookings will appear here automatically.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
