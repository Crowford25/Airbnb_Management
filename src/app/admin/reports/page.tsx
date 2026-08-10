import type { Metadata } from "next";

import { PageHeader } from "@/features/admin/components/page-header";
import { formatCurrency } from "@/features/admin/format";
import { requirePermission } from "@/features/auth/server/authorization";
import {
  getAdminDashboardSummary,
  listMonthlyPerformance,
  listPropertyPerformance,
} from "@/server/db/repositories/admin";

export const metadata: Metadata = { title: "Revenue and occupancy reports" };

export default async function AdminReportsPage() {
  await requirePermission("reports:view", "/admin/reports");
  const [summary, monthly, properties] = await Promise.all([
    getAdminDashboardSummary(),
    listMonthlyPerformance(6),
    listPropertyPerformance(),
  ]);
  const highestRevenue = Math.max(...monthly.map((month) => Number(month.revenue)), 1);

  return (
    <>
      <PageHeader
        description="Management summaries use confirmed and completed reservations. Revenue is grouped by booking month; occupancy uses stay dates and physical room capacity."
        eyebrow="Manager insights"
        title="Revenue and occupancy"
      />

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetric
          label="Month revenue"
          value={formatCurrency(summary.monthRevenue)}
        />
        <ReportMetric
          label="Month occupancy"
          value={`${summary.occupancyPercentage}%`}
        />
        <ReportMetric
          label="Published properties"
          value={String(summary.publishedProperties)}
        />
        <ReportMetric
          label="Active customers"
          value={String(summary.activeCustomers)}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <article className="border-border bg-surface rounded-2xl border p-5 sm:p-6">
          <div>
            <h2 className="font-semibold">Six-month revenue trend</h2>
            <p className="text-muted mt-1 text-xs">Confirmed and completed bookings</p>
          </div>
          <div className="mt-7 grid gap-5">
            {monthly.map((month) => {
              const width = Math.max((Number(month.revenue) / highestRevenue) * 100, 1);
              const monthLabel = new Intl.DateTimeFormat("en-MY", {
                month: "short",
                year: "numeric",
              }).format(new Date(`${month.month}-01T00:00:00`));
              return (
                <div className="grid gap-2" key={month.month}>
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <p className="font-medium">{monthLabel}</p>
                    <p className="text-muted">
                      {formatCurrency(month.revenue)} · {month.bookings} bookings ·{" "}
                      {month.roomNights} room nights
                    </p>
                  </div>
                  <div className="bg-background h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-gold h-full rounded-full"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="border-border bg-surface rounded-2xl border p-5 sm:p-6">
          <h2 className="font-semibold">Property performance</h2>
          <p className="text-muted mt-1 text-xs">Current month</p>
          <div className="mt-5 grid gap-3">
            {properties.map((property) => (
              <div className="bg-background rounded-xl p-4" key={property.propertyName}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{property.propertyName}</p>
                    <p className="text-muted mt-1 text-xs">
                      {property.bookings} bookings · {property.roomNights} occupied room
                      nights
                    </p>
                  </div>
                  <p className="text-gold text-sm font-semibold">
                    {formatCurrency(property.revenue)}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="bg-surface h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="bg-gold h-full rounded-full"
                      style={{
                        width: `${Math.min(property.occupancyPercentage, 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-muted text-xs">
                    {property.occupancyPercentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <p className="text-muted mt-5 text-xs leading-5">
        Figures are operational summaries, not an accounting ledger. Taxes, refunds and
        payment settlement reporting will be added with the payments milestone.
      </p>
    </>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-border bg-surface rounded-2xl border p-5">
      <p className="text-muted text-xs tracking-wide uppercase">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}
