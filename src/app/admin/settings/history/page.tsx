import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/features/admin/components/page-header";
import { formatDateTime, humanize } from "@/features/admin/format";
import { requirePermission } from "@/features/auth/server/authorization";
import {
  listApiRequestHistory,
  listAuditHistory,
  listEmailHistory,
  listEmailProviderWebhookHistory,
  type HistoryFilters,
} from "@/server/db/repositories/history";

export const metadata: Metadata = { title: "Operational history" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return typeof raw === "string" ? raw.slice(0, 120) : "";
}

function filtersFrom(
  params: Record<string, string | string[] | undefined>,
): HistoryFilters {
  return {
    actor: value(params, "actor") || undefined,
    end: value(params, "end") || undefined,
    entityType: value(params, "entity") || undefined,
    recipient: value(params, "recipient") || undefined,
    start: value(params, "start") || undefined,
    status: value(params, "status") || undefined,
  };
}

function exportHref(
  kind: "api" | "audit" | "email" | "provider_webhook",
  filters: HistoryFilters,
) {
  const params = new URLSearchParams({ kind });
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.end) params.set("end", filters.end);
  if (filters.entityType) params.set("entity", filters.entityType);
  if (filters.recipient) params.set("recipient", filters.recipient);
  if (filters.start) params.set("start", filters.start);
  if (filters.status) params.set("status", filters.status);
  return `/api/admin/history/export?${params.toString()}`;
}

export default async function OperationalHistoryPage({ searchParams }: PageProps) {
  await requirePermission("system:manage", "/admin/settings/history");
  const params = await searchParams;
  const filters = filtersFrom(params);
  const [apiRequests, auditEvents, emails, providerEvents] = await Promise.all([
    listApiRequestHistory(filters),
    listAuditHistory(filters),
    listEmailHistory(filters),
    listEmailProviderWebhookHistory(filters),
  ]);

  return (
    <>
      <PageHeader
        description="Read-only operational records. Request bodies, passwords, cookies, tokens, card data and raw provider payloads are never retained here."
        eyebrow="Super Admin only"
        title="Operational history"
      />
      <form
        className="border-border bg-surface mt-8 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 xl:grid-cols-6"
        method="get"
      >
        <input
          className="border-border bg-background rounded-lg border px-3 py-2 text-xs"
          defaultValue={filters.start}
          name="start"
          placeholder="Start YYYY-MM-DD"
        />
        <input
          className="border-border bg-background rounded-lg border px-3 py-2 text-xs"
          defaultValue={filters.end}
          name="end"
          placeholder="End YYYY-MM-DD"
        />
        <input
          className="border-border bg-background rounded-lg border px-3 py-2 text-xs"
          defaultValue={filters.actor}
          name="actor"
          placeholder="Actor name or email"
        />
        <input
          className="border-border bg-background rounded-lg border px-3 py-2 text-xs"
          defaultValue={filters.entityType}
          name="entity"
          placeholder="Audit entity type"
        />
        <input
          className="border-border bg-background rounded-lg border px-3 py-2 text-xs"
          defaultValue={filters.recipient}
          name="recipient"
          placeholder="Email recipient"
        />
        <div className="flex gap-2">
          <select
            className="border-border bg-background min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs"
            defaultValue={filters.status}
            name="status"
          >
            <option value="">Any status</option>
            <option value="success">API success</option>
            <option value="error">API error</option>
            <option value="pending">Email pending</option>
            <option value="sent">Email sent</option>
            <option value="failed">Email failed</option>
            <option value="cancelled">Email cancelled</option>
            <option value="processed">Webhook processed</option>
            <option value="ignored">Webhook ignored</option>
          </select>
          <button
            className="bg-gold text-background rounded-lg px-4 py-2 text-xs font-semibold"
            type="submit"
          >
            Filter
          </button>
        </div>
      </form>
      <section
        className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="History summary"
      >
        <HistorySummary label="API requests" value={apiRequests.length} />
        <HistorySummary label="Business audit events" value={auditEvents.length} />
        <HistorySummary label="Email events" value={emails.length} />
        <HistorySummary label="Provider webhooks" value={providerEvents.length} />
      </section>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted mr-1">Export latest 100 matching records:</span>
        {(
          [
            ["api", "API CSV"],
            ["audit", "Audit CSV"],
            ["email", "Email CSV"],
            ["provider_webhook", "Webhook CSV"],
          ] as const
        ).map(([kind, label]) => (
          <Link
            className="border-border hover:border-gold hover:text-gold rounded-md border px-3 py-1.5 transition"
            href={exportHref(kind, filters)}
            key={kind}
          >
            {label}
          </Link>
        ))}
      </div>
      <p className="text-muted mt-3 text-xs">
        <Link className="hover:text-gold" href="/admin/settings">
          ← Back to system settings
        </Link>
      </p>

      <section className="mt-6 grid gap-6">
        <HistoryCard title="API requests" count={apiRequests.length}>
          {apiRequests.map((entry) => (
            <div
              className="border-border grid gap-1 border-b px-4 py-3 text-xs last:border-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              key={entry.requestId}
            >
              <span
                className={
                  entry.outcome === "error" ? "text-red-300" : "text-emerald-400"
                }
              >
                {entry.method} {entry.statusCode}
              </span>
              <span className="font-mono">
                {entry.route} {entry.errorCode ? `· ${entry.errorCode}` : ""}
              </span>
              <span className="text-muted">
                {entry.actorName ?? "Anonymous"} · {entry.durationMs}ms ·{" "}
                {formatDateTime(entry.createdAt)}
              </span>
            </div>
          ))}
        </HistoryCard>
        <HistoryCard title="Business audit timeline" count={auditEvents.length}>
          {auditEvents.map((entry, index) => (
            <div
              className="border-border relative grid gap-2 border-b px-4 py-4 pl-9 text-xs last:border-0 sm:grid-cols-[minmax(0,1fr)_auto]"
              key={`${entry.occurredAt}-${entry.action}-${index}`}
            >
              <span
                className="bg-gold absolute top-5 left-4 size-2 rounded-full"
                aria-hidden="true"
              />
              <span>
                <strong>{humanize(entry.action.replaceAll(".", "_"))}</strong> ·{" "}
                {humanize(entry.entityType)} · {entry.actorName ?? "System"}
                {entry.changedFields.length
                  ? ` · changed: ${entry.changedFields.join(", ")}`
                  : ""}
              </span>
              <span className="text-muted">{formatDateTime(entry.occurredAt)}</span>
            </div>
          ))}
        </HistoryCard>
        <HistoryCard title="Email history" count={emails.length}>
          {emails.map((entry, index) => (
            <div
              className="border-border grid gap-1 border-b px-4 py-3 text-xs last:border-0 sm:grid-cols-[minmax(0,1fr)_auto]"
              key={`${entry.createdAt}-${entry.recipientEmail}-${index}`}
            >
              <span>
                <strong>{humanize(entry.category)}</strong> · {entry.recipientEmail} ·{" "}
                {entry.status} · {entry.attemptCount} attempt(s)
                {entry.templateName
                  ? ` · ${entry.templateName} v${entry.templateVersion ?? "1"}`
                  : ""}
                {entry.lastError ? ` · ${entry.lastError}` : ""}
                {entry.providerDeliveryStatus
                  ? ` · provider: ${entry.providerDeliveryStatus}`
                  : ""}
                {entry.providerDeliveryDetail
                  ? ` · ${entry.providerDeliveryDetail}`
                  : ""}
              </span>
              <span className="text-muted">{formatDateTime(entry.createdAt)}</span>
            </div>
          ))}
        </HistoryCard>
        <HistoryCard title="Email provider webhooks" count={providerEvents.length}>
          {providerEvents.map((entry) => (
            <div
              className="border-border grid gap-1 border-b px-4 py-3 text-xs last:border-0 sm:grid-cols-[minmax(0,1fr)_auto]"
              key={entry.providerDeliveryId}
            >
              <span>
                <strong>{entry.eventType}</strong> · {entry.status} ·{" "}
                {entry.attemptCount} attempt(s)
                {entry.providerEmailId ? ` · email: ${entry.providerEmailId}` : ""}
              </span>
              <span className="text-muted">{formatDateTime(entry.receivedAt)}</span>
            </div>
          ))}
        </HistoryCard>
      </section>
    </>
  );
}

function HistoryCard({
  children,
  count,
  title,
}: {
  children: ReactNode;
  count: number;
  title: string;
}) {
  return (
    <article className="border-border bg-surface overflow-hidden rounded-2xl border">
      <div className="border-border flex items-center justify-between gap-4 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-muted mt-1 text-xs">Read-only, newest records first.</p>
        </div>
        <span className="text-muted text-xs">Latest {count}</span>
      </div>
      <div>
        {children || <p className="text-muted px-4 py-8 text-xs">No records found.</p>}
      </div>
    </article>
  );
}

function HistorySummary({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border bg-surface rounded-xl border px-4 py-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-muted mt-1 text-xs">{label}</p>
    </div>
  );
}
