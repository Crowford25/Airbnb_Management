import "server-only";

import type { QueryResultRow } from "pg";

import { databaseQuery } from "../query";

export type HistoryFilters = {
  actor?: string;
  end?: string;
  entityType?: string;
  limit?: number;
  recipient?: string;
  start?: string;
  status?: string;
};

function limit(filters: HistoryFilters) {
  return Math.max(1, Math.min(filters.limit ?? 50, 100));
}

function dateFilters(
  filters: HistoryFilters,
  values: unknown[],
  clauses: string[],
  column: string,
) {
  if (filters.start) {
    values.push(filters.start);
    clauses.push(`${column} >= $${values.length}::timestamptz`);
  }
  if (filters.end) {
    values.push(filters.end);
    clauses.push(`${column} < ($${values.length}::date + interval '1 day')`);
  }
}

export async function listApiRequestHistory(filters: HistoryFilters = {}) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  dateFilters(filters, values, clauses, "log.created_at");
  if (filters.actor) {
    values.push(`%${filters.actor.toLowerCase()}%`);
    clauses.push(
      `(lower(COALESCE(actor.email, '')) LIKE $${values.length} OR lower(COALESCE(actor.display_name, '')) LIKE $${values.length})`,
    );
  }
  if (filters.status === "success" || filters.status === "error") {
    values.push(filters.status);
    clauses.push(`log.outcome = $${values.length}`);
  }
  values.push(limit(filters));
  const result = await databaseQuery<
    QueryResultRow & {
      actor_name: string | null;
      actor_role: string | null;
      created_at: Date;
      duration_ms: number;
      error_code: string | null;
      method: string;
      outcome: "error" | "success";
      request_id: string;
      route: string;
      status_code: number;
    }
  >({
    name: "operational-api-request-history",
    text: `
      SELECT log.request_id, log.method, log.route, log.outcome, log.status_code,
        log.duration_ms, log.error_code, log.actor_role, log.created_at,
        actor.display_name AS actor_name
      FROM aureum.api_request_logs AS log
      LEFT JOIN aureum.users AS actor ON actor.id = log.actor_user_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY log.created_at DESC, log.id DESC
      LIMIT $${values.length}
    `,
    values,
  });
  return result.rows.map((row) => ({
    actorName: row.actor_name,
    actorRole: row.actor_role,
    createdAt: row.created_at.toISOString(),
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    method: row.method,
    outcome: row.outcome,
    requestId: row.request_id,
    route: row.route,
    statusCode: row.status_code,
  }));
}

export async function listAuditHistory(filters: HistoryFilters = {}) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (filters.start) {
    values.push(filters.start);
    clauses.push(`event.occurred_at >= $${values.length}::timestamptz`);
  }
  if (filters.end) {
    values.push(filters.end);
    clauses.push(`event.occurred_at < ($${values.length}::date + interval '1 day')`);
  }
  if (filters.actor) {
    values.push(`%${filters.actor.toLowerCase()}%`);
    clauses.push(
      `(lower(COALESCE(actor.email, '')) LIKE $${values.length} OR lower(COALESCE(actor.display_name, '')) LIKE $${values.length})`,
    );
  }
  if (filters.entityType) {
    values.push(filters.entityType);
    clauses.push(`event.entity_type = $${values.length}`);
  }
  values.push(limit(filters));
  const result = await databaseQuery<
    QueryResultRow & {
      action: string;
      actor_name: string | null;
      actor_role: string | null;
      changed_fields: string[] | null;
      correlation_id: string | null;
      entity_type: string;
      occurred_at: Date;
      request_id: string | null;
    }
  >({
    name: "operational-audit-history",
    text: `
      SELECT event.action, event.entity_type, event.request_id, event.correlation_id,
        event.actor_role, event.changed_fields, event.occurred_at,
        actor.display_name AS actor_name
      FROM aureum.audit_events AS event
      LEFT JOIN aureum.users AS actor ON actor.id = event.actor_user_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT $${values.length}
    `,
    values,
  });
  return result.rows.map((row) => ({
    action: row.action,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    changedFields: row.changed_fields ?? [],
    correlationId: row.correlation_id,
    entityType: row.entity_type,
    occurredAt: row.occurred_at.toISOString(),
    requestId: row.request_id,
  }));
}

export async function listEmailHistory(filters: HistoryFilters = {}) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  dateFilters(filters, values, clauses, "notification.created_at");
  if (filters.recipient) {
    values.push(`%${filters.recipient.toLowerCase()}%`);
    clauses.push(`lower(notification.recipient_email) LIKE $${values.length}`);
  }
  if (
    ["pending", "processing", "sent", "failed", "cancelled"].includes(
      filters.status ?? "",
    )
  ) {
    values.push(filters.status);
    clauses.push(`notification.status = $${values.length}`);
  }
  values.push(limit(filters));
  const result = await databaseQuery<
    QueryResultRow & {
      attempt_count: number;
      category: string;
      created_at: Date;
      last_error: string | null;
      provider: string | null;
      provider_delivery_detail: string | null;
      provider_delivery_status: string | null;
      provider_event_at: Date | null;
      recipient_email: string;
      sent_at: Date | null;
      status: string;
      template_name: string | null;
      template_version: string | null;
    }
  >({
    name: "operational-email-history",
    text: `
      SELECT notification.category, notification.recipient_email, notification.status,
        notification.attempt_count, notification.provider, notification.last_error,
        notification.template_name, notification.template_version,
        notification.sent_at, notification.created_at,
        notification.provider_delivery_status, notification.provider_event_at,
        notification.provider_delivery_detail
      FROM aureum.notification_outbox AS notification
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY notification.created_at DESC, notification.id DESC
      LIMIT $${values.length}
    `,
    values,
  });
  return result.rows.map((row) => ({
    attemptCount: row.attempt_count,
    category: row.category,
    createdAt: row.created_at.toISOString(),
    lastError: row.last_error,
    provider: row.provider,
    providerDeliveryDetail: row.provider_delivery_detail,
    providerDeliveryStatus: row.provider_delivery_status,
    providerEventAt: row.provider_event_at?.toISOString() ?? null,
    recipientEmail: row.recipient_email,
    sentAt: row.sent_at?.toISOString() ?? null,
    status: row.status,
    templateName: row.template_name,
    templateVersion: row.template_version,
  }));
}

export async function listEmailProviderWebhookHistory(filters: HistoryFilters = {}) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  dateFilters(filters, values, clauses, "event.received_at");
  if (["processing", "processed", "ignored", "failed"].includes(filters.status ?? "")) {
    values.push(filters.status);
    clauses.push(`event.status = $${values.length}`);
  }
  values.push(limit(filters));
  const result = await databaseQuery<
    QueryResultRow & {
      attempt_count: number;
      event_created_at: Date | null;
      event_type: string;
      provider_delivery_id: string;
      provider_email_id: string | null;
      received_at: Date;
      status: string;
    }
  >({
    name: "operational-email-provider-webhook-history",
    text: `
      SELECT event.provider_delivery_id, event.provider_email_id, event.event_type,
        event.status, event.attempt_count, event.event_created_at, event.received_at
      FROM aureum.email_provider_webhook_events AS event
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY event.received_at DESC, event.id DESC
      LIMIT $${values.length}
    `,
    values,
  });
  return result.rows.map((row) => ({
    attemptCount: row.attempt_count,
    eventCreatedAt: row.event_created_at?.toISOString() ?? null,
    eventType: row.event_type,
    providerDeliveryId: row.provider_delivery_id,
    providerEmailId: row.provider_email_id,
    receivedAt: row.received_at.toISOString(),
    status: row.status,
  }));
}
