import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/features/admin/components/page-header";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDate } from "@/features/admin/format";
import { hasPermission, roleLabels } from "@/features/auth/rbac";
import { requirePermission } from "@/features/auth/server/authorization";
import {
  getAdminDashboardSummary,
  listOperationalReservations,
} from "@/server/db/repositories/admin";

export const metadata: Metadata = { title: "Admin overview" };

type AdminPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await requirePermission("dashboard:view", "/admin");
  const [{ error }, summary, upcoming] = await Promise.all([
    searchParams,
    getAdminDashboardSummary(),
    listOperationalReservations(8),
  ]);
  const errorCode = Array.isArray(error) ? error[0] : error;

  const metrics = [
    {
      detail: "Confirmed and completed this month",
      label: "Month revenue",
      value: formatCurrency(summary.monthRevenue),
    },
    {
      detail: "Occupied room nights this month",
      label: "Occupancy",
      value: `${summary.occupancyPercentage}%`,
    },
    {
      detail: "Computed from rooms, blocks and bookings",
      label: "Rooms available today",
      value: String(summary.roomsAvailableToday),
    },
    {
      detail: "Awaiting booking confirmation or payment",
      label: "Active booking holds",
      value: String(summary.pendingHolds),
    },
  ];

  return (
    <>
      <PageHeader
        actions={
          <span className="border-gold/30 bg-gold/10 text-gold w-fit rounded-full border px-3 py-1.5 text-xs font-semibold">
            {roleLabels[user.role]}
          </span>
        }
        description="Live booking, room, customer and revenue signals from PostgreSQL. Access and actions adjust to your staff role."
        eyebrow="Live control centre"
        title={`Good day, ${user.name.split(" ")[0]}`}
      />

      {errorCode === "forbidden" ? (
        <p className="mt-6 rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          Your current staff role does not include access to that section.
        </p>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article
            className="border-border bg-surface rounded-2xl border p-5"
            key={metric.label}
          >
            <p className="text-muted text-xs font-medium tracking-wide uppercase">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</p>
            <p className="text-muted mt-3 text-xs leading-5">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <article className="border-border bg-surface overflow-hidden rounded-2xl border">
          <div className="border-border flex items-center justify-between border-b px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold">Upcoming stay operations</h2>
              <p className="text-muted mt-1 text-xs">Next eight days</p>
            </div>
            <Link
              className="text-gold inline-flex items-center gap-1.5 text-sm font-semibold"
              href="/admin/operations"
            >
              View all <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
          </div>
          {upcoming.length ? (
            <div className="divide-border divide-y">
              {upcoming.slice(0, 6).map((reservation) => (
                <div
                  className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6"
                  key={reservation.bookingReference}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {reservation.guestName}
                    </p>
                    <p className="text-muted mt-1 truncate text-xs">
                      {reservation.propertyName} · {reservation.rooms}
                    </p>
                  </div>
                  <p className="text-muted text-xs sm:text-right">
                    {formatDate(reservation.checkIn)} –{" "}
                    {formatDate(reservation.checkOut)}
                  </p>
                  <StatusBadge status={reservation.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium">No upcoming arrivals or departures</p>
              <p className="text-muted mt-2 text-xs">
                Confirmed reservations will appear here automatically.
              </p>
            </div>
          )}
        </article>

        <div className="grid gap-6">
          <article className="border-border bg-surface rounded-2xl border p-6">
            <h2 className="font-semibold">Today at a glance</h2>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div className="bg-background rounded-xl p-4">
                <dt className="text-muted text-xs">Arrivals</dt>
                <dd className="mt-2 text-2xl font-semibold">{summary.arrivalsToday}</dd>
              </div>
              <div className="bg-background rounded-xl p-4">
                <dt className="text-muted text-xs">Departures</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {summary.departuresToday}
                </dd>
              </div>
              <div className="bg-background rounded-xl p-4">
                <dt className="text-muted text-xs">Properties</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {summary.publishedProperties}
                </dd>
              </div>
              <div className="bg-background rounded-xl p-4">
                <dt className="text-muted text-xs">Customers</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {summary.activeCustomers}
                </dd>
              </div>
            </dl>
          </article>

          <article className="border-border bg-surface rounded-2xl border p-6">
            <h2 className="font-semibold">Your working scope</h2>
            <div className="mt-4 grid gap-2">
              <QuickLink href="/admin/properties" label="Property and room inventory" />
              <QuickLink href="/admin/reservations" label="Reservation records" />
              <QuickLink href="/admin/customers" label="Customer records" />
              {hasPermission(user.role, "team:view") ? (
                <QuickLink href="/admin/team" label="Staff access" />
              ) : null}
              {hasPermission(user.role, "reports:view") ? (
                <QuickLink
                  href="/admin/reports"
                  label="Revenue and occupancy reports"
                />
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="border-border hover:border-gold/50 flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition"
      href={href}
    >
      {label}
      <ArrowUpRight aria-hidden="true" className="text-gold" size={14} />
    </Link>
  );
}
