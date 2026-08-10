import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/features/admin/components/page-header";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDate } from "@/features/admin/format";
import { requirePermission } from "@/features/auth/server/authorization";
import {
  getAdminDashboardSummary,
  listOperationalReservations,
} from "@/server/db/repositories/admin";

export const metadata: Metadata = { title: "Daily operations" };

export default async function AdminOperationsPage() {
  await requirePermission("reservations:view", "/admin/operations");
  const [summary, reservations] = await Promise.all([
    getAdminDashboardSummary(),
    listOperationalReservations(14),
  ]);

  return (
    <>
      <PageHeader
        actions={
          <Link
            className="border-gold text-gold hover:bg-gold hover:text-background w-fit rounded-lg border px-4 py-2.5 text-sm font-semibold transition"
            href="/admin/reservations"
          >
            Reservation register
          </Link>
        }
        description="The next 14 days of arrivals, departures and active holds. This workspace is readable by every staff level."
        eyebrow="Front desk view"
        title="Daily operations"
      />

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <OperationMetric label="Arrivals today" value={summary.arrivalsToday} />
        <OperationMetric label="Departures today" value={summary.departuresToday} />
        <OperationMetric label="Active booking holds" value={summary.pendingHolds} />
      </section>

      <section className="border-border bg-surface mt-6 overflow-hidden rounded-2xl border">
        <div className="border-border flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <h2 className="font-semibold">Two-week stay board</h2>
          <p className="text-muted text-xs">{reservations.length} active stays</p>
        </div>
        {reservations.length ? (
          <div className="divide-border divide-y">
            {reservations.map((reservation) => (
              <div
                className="grid gap-4 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] md:items-center"
                key={reservation.bookingReference}
              >
                <div>
                  <p className="font-semibold">{reservation.guestName}</p>
                  <p className="text-muted mt-1 text-xs">
                    {reservation.propertyName} · {reservation.rooms}
                  </p>
                  <p className="text-muted mt-1 font-mono text-[11px]">
                    {reservation.bookingReference}
                  </p>
                </div>
                <p className="text-muted text-xs">
                  {formatDate(reservation.checkIn)} – {formatDate(reservation.checkOut)}
                </p>
                <p className="text-sm font-semibold">
                  {formatCurrency(reservation.totalAmount, reservation.currency)}
                </p>
                <StatusBadge status={reservation.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">No active stays in the next 14 days</p>
            <p className="text-muted mt-2 text-sm">The board is clear.</p>
          </div>
        )}
      </section>
    </>
  );
}

function OperationMetric({ label, value }: { label: string; value: number }) {
  return (
    <article className="border-border bg-surface rounded-2xl border p-5">
      <p className="text-muted text-xs tracking-wide uppercase">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </article>
  );
}
