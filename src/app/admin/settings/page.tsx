import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/features/admin/components/page-header";
import { formatDateTime, humanize } from "@/features/admin/format";
import {
  permissions,
  permissionsForRole,
  roleLabels,
  type StaffRole,
} from "@/features/auth/rbac";
import { requirePermission } from "@/features/auth/server/authorization";
import {
  listRecentAuditEvents,
  listWorkerMonitoring,
} from "@/server/db/repositories/admin";
import { listRecentNotifications } from "@/server/db/repositories/notifications";
import { listRecentPaymentWebhookEvents } from "@/server/db/repositories/payments";

export const metadata: Metadata = { title: "Roles and system" };

const staffRoles: StaffRole[] = ["employee", "lead", "manager", "super_admin"];

export default async function AdminSettingsPage() {
  await requirePermission("system:manage", "/admin/settings");
  const [auditEvents, webhookEvents, notifications, workers] = await Promise.all([
    listRecentAuditEvents(40),
    listRecentPaymentWebhookEvents(20),
    listRecentNotifications(20),
    listWorkerMonitoring(),
  ]);

  return (
    <>
      <PageHeader
        description="Super Admin visibility into permissions, security-sensitive changes, payment webhooks and reliable email delivery."
        eyebrow="Super Admin only"
        title="Roles and system"
      />

      <Link
        className="border-gold text-gold hover:bg-gold/10 mt-6 inline-flex rounded-lg border px-4 py-2 text-sm font-semibold transition"
        href="/admin/settings/history"
      >
        View operational history
      </Link>

      <section className="border-border bg-surface mt-6 overflow-hidden rounded-2xl border">
        <div className="border-border flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Worker monitoring</h2>
            <p className="text-muted mt-1 text-xs">
              Long-running workers write a heartbeat after each cycle.
            </p>
          </div>
          <span className="text-muted text-xs">{workers.length} reporting</span>
        </div>
        {workers.length ? (
          <div className="divide-border grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
            {workers.map((worker) => (
              <div className="px-5 py-4 sm:px-6" key={worker.workerName}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {worker.workerName === "hold-expiry"
                      ? "Booking hold expiry"
                      : "Email notifications"}
                  </p>
                  <span
                    className={`text-[10px] font-semibold tracking-wide uppercase ${
                      worker.status === "healthy"
                        ? "text-emerald-400"
                        : worker.status === "stopped"
                          ? "text-zinc-500"
                          : "text-red-300"
                    }`}
                  >
                    {worker.status}
                  </span>
                </div>
                <p className="text-muted mt-2 text-xs">
                  Last heartbeat: {formatDateTime(worker.lastHeartbeatAt)}
                </p>
                {worker.lastSuccessAt ? (
                  <p className="text-muted mt-1 text-xs">
                    Last success: {formatDateTime(worker.lastSuccessAt)}
                  </p>
                ) : null}
                {worker.lastError ? (
                  <p className="mt-2 line-clamp-2 text-xs text-red-300">
                    {worker.lastError}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted px-5 py-8 text-sm sm:px-6">
            No worker heartbeat yet. Start the hold and notification workers to enable
            monitoring.
          </p>
        )}
      </section>

      <section className="border-border bg-surface mt-8 overflow-hidden rounded-2xl border">
        <div className="border-border border-b px-5 py-4 sm:px-6">
          <h2 className="font-semibold">Role permission matrix</h2>
          <p className="text-muted mt-1 text-xs">
            Permissions are enforced in pages and APIs.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-muted bg-background/60 text-[11px] tracking-wide uppercase">
              <tr>
                <th className="px-5 py-3 font-medium sm:px-6">Permission</th>
                {staffRoles.map((role) => (
                  <th className="px-4 py-3 text-center font-medium" key={role}>
                    {roleLabels[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {permissions.map((permission) => (
                <tr key={permission}>
                  <td className="px-5 py-3 font-mono sm:px-6">{permission}</td>
                  {staffRoles.map((role) => (
                    <td className="px-4 py-3 text-center" key={role}>
                      {permissionsForRole(role).includes(permission) ? (
                        <span className="text-emerald-400" aria-label="Granted">
                          ✓
                        </span>
                      ) : (
                        <span className="text-zinc-700" aria-label="Not granted">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <article className="border-border bg-surface overflow-hidden rounded-2xl border">
          <div className="border-border flex items-center justify-between border-b px-5 py-4 sm:px-6">
            <h2 className="font-semibold">Recent audit events</h2>
            <p className="text-muted text-xs">Latest {auditEvents.length}</p>
          </div>
          {auditEvents.length ? (
            <div className="divide-border max-h-[620px] divide-y overflow-auto">
              {auditEvents.map((event, index) => (
                <div
                  className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6"
                  key={`${event.occurredAt}-${event.action}-${index}`}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {humanize(event.action.replaceAll(".", "_"))}
                    </p>
                    <p className="text-muted mt-1 text-xs">
                      {humanize(event.entityType)} ·{" "}
                      {event.actorName ?? "System process"}
                    </p>
                  </div>
                  <p className="text-muted text-xs">
                    {formatDateTime(event.occurredAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted px-6 py-12 text-sm">
              No audit events recorded yet.
            </p>
          )}
        </article>

        <div className="grid h-fit gap-6">
          <article className="border-border bg-surface rounded-2xl border p-6">
            <h2 className="font-semibold">Booking hold worker</h2>
            <p className="text-muted mt-3 text-sm leading-6">
              Unpaid holds are excluded from computed inventory immediately after
              expiry. The background worker then closes the records in small lock-safe
              batches.
            </p>
            <div className="border-border mt-5 grid gap-3 border-t pt-5 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-muted">Command</span>
                <code>npm run worker:holds</code>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">Database strategy</span>
                <span className="text-right">SKIP LOCKED batches</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">Inventory source</span>
                <span className="text-right">Computed date ranges</span>
              </div>
            </div>
          </article>

          <article className="border-border bg-surface rounded-2xl border p-6">
            <h2 className="font-semibold">Notification worker</h2>
            <p className="text-muted mt-3 text-sm leading-6">
              Confirmation, reminder, cancellation and administrator emails are
              delivered outside booking transactions with automatic retries.
            </p>
            <div className="border-border mt-5 grid gap-3 border-t pt-5 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-muted">Command</span>
                <code>npm run worker:notifications</code>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">Provider</span>
                <span className="text-right capitalize">
                  {process.env.EMAIL_PROVIDER?.trim() || "console"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">Delivery model</span>
                <span className="text-right">Outbox + retry</span>
              </div>
            </div>
          </article>

          <article className="border-border bg-surface overflow-hidden rounded-2xl border">
            <div className="border-border border-b px-5 py-4">
              <h2 className="font-semibold">Email deliveries</h2>
              <p className="text-muted mt-1 text-xs">Latest notification jobs</p>
            </div>
            {notifications.length ? (
              <div className="divide-border max-h-[28rem] divide-y overflow-auto">
                {notifications.map((notification) => (
                  <div className="px-5 py-3" key={notification.id}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold">
                        {humanize(notification.category)}
                      </p>
                      <span
                        className={`text-[10px] font-semibold tracking-wide uppercase ${
                          notification.status === "failed"
                            ? "text-red-300"
                            : notification.status === "sent"
                              ? "text-emerald-400"
                              : notification.status === "cancelled"
                                ? "text-zinc-500"
                                : "text-amber-300"
                        }`}
                      >
                        {notification.status}
                      </span>
                    </div>
                    <p className="text-muted mt-1 truncate text-[10px]">
                      {notification.recipientEmail}
                    </p>
                    <p className="text-muted mt-1 text-[10px]">
                      {formatDateTime(notification.createdAt.toISOString())} ·{" "}
                      {notification.attemptCount}/{notification.maxAttempts} attempts
                    </p>
                    {notification.lastError ? (
                      <p className="mt-1 line-clamp-2 text-[10px] text-red-300">
                        {notification.lastError}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted px-5 py-8 text-xs">
                No email notifications queued yet.
              </p>
            )}
          </article>

          <article className="border-border bg-surface overflow-hidden rounded-2xl border">
            <div className="border-border border-b px-5 py-4">
              <h2 className="font-semibold">Stripe webhooks</h2>
              <p className="text-muted mt-1 text-xs">Latest signed provider events</p>
            </div>
            {webhookEvents.length ? (
              <div className="divide-border max-h-96 divide-y overflow-auto">
                {webhookEvents.map((event) => (
                  <div className="px-5 py-3" key={event.eventId}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold">{event.eventType}</p>
                      <span
                        className={`text-[10px] font-semibold tracking-wide uppercase ${
                          event.status === "failed"
                            ? "text-red-300"
                            : event.status === "processed"
                              ? "text-emerald-400"
                              : "text-amber-300"
                        }`}
                      >
                        {event.status}
                      </span>
                    </div>
                    <p className="text-muted mt-1 text-[10px]">
                      {formatDateTime(event.receivedAt.toISOString())} ·{" "}
                      {event.attemptCount}{" "}
                      {event.attemptCount === 1 ? "attempt" : "attempts"}
                    </p>
                    {event.errorMessage ? (
                      <p className="mt-1 line-clamp-2 text-[10px] text-red-300">
                        {event.errorMessage}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted px-5 py-8 text-xs">
                No Stripe webhook events received yet.
              </p>
            )}
          </article>
        </div>
      </section>
    </>
  );
}
