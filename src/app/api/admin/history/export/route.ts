import { z } from "zod";

import { requireApiPermission } from "@/server/api/authorization";
import { handleApi } from "@/server/api/response";
import { isoDateSchema, validate } from "@/server/api/validation";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import {
  listApiRequestHistory,
  listAuditHistory,
  listEmailHistory,
  listEmailProviderWebhookHistory,
  type HistoryFilters,
} from "@/server/db/repositories/history";

const exportQuerySchema = z
  .object({
    actor: z.string().trim().min(1).max(120).optional(),
    end: isoDateSchema.optional(),
    entity: z.string().trim().min(1).max(100).optional(),
    kind: z.enum(["api", "audit", "email", "provider_webhook"]),
    recipient: z.string().trim().min(1).max(320).optional(),
    start: isoDateSchema.optional(),
    status: z
      .enum([
        "success",
        "error",
        "pending",
        "processing",
        "sent",
        "failed",
        "cancelled",
        "processed",
        "ignored",
      ])
      .optional(),
  })
  .strict();

function csvCell(value: unknown) {
  const text = String(value ?? "")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
  const spreadsheetSafe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function historyFilters(input: z.infer<typeof exportQuerySchema>): HistoryFilters {
  return {
    actor: input.actor,
    end: input.end,
    entityType: input.entity,
    limit: 100,
    recipient: input.recipient,
    start: input.start,
    status: input.status,
  };
}

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const actor = await requireApiPermission("system:manage");
    const input = validate(
      exportQuerySchema,
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const filters = historyFilters(input);
    let csv: string;
    let recordCount: number;

    if (input.kind === "api") {
      const rows = await listApiRequestHistory(filters);
      recordCount = rows.length;
      csv = toCsv(
        [
          "request_id",
          "occurred_at",
          "actor",
          "role",
          "method",
          "route",
          "outcome",
          "status_code",
          "duration_ms",
          "error_code",
        ],
        rows.map((row) => [
          row.requestId,
          row.createdAt,
          row.actorName,
          row.actorRole,
          row.method,
          row.route,
          row.outcome,
          row.statusCode,
          row.durationMs,
          row.errorCode,
        ]),
      );
    } else if (input.kind === "audit") {
      const rows = await listAuditHistory(filters);
      recordCount = rows.length;
      csv = toCsv(
        [
          "occurred_at",
          "actor",
          "role",
          "action",
          "entity_type",
          "request_id",
          "correlation_id",
          "changed_fields",
        ],
        rows.map((row) => [
          row.occurredAt,
          row.actorName,
          row.actorRole,
          row.action,
          row.entityType,
          row.requestId,
          row.correlationId,
          row.changedFields.join(", "),
        ]),
      );
    } else if (input.kind === "email") {
      const rows = await listEmailHistory(filters);
      recordCount = rows.length;
      csv = toCsv(
        [
          "created_at",
          "recipient",
          "category",
          "outbox_status",
          "attempt_count",
          "provider",
          "provider_delivery_status",
          "provider_event_at",
          "template",
          "last_error",
        ],
        rows.map((row) => [
          row.createdAt,
          row.recipientEmail,
          row.category,
          row.status,
          row.attemptCount,
          row.provider,
          row.providerDeliveryStatus,
          row.providerEventAt,
          row.templateName
            ? `${row.templateName} v${row.templateVersion ?? "1"}`
            : null,
          row.lastError,
        ]),
      );
    } else {
      const rows = await listEmailProviderWebhookHistory(filters);
      recordCount = rows.length;
      csv = toCsv(
        [
          "received_at",
          "event_created_at",
          "event_type",
          "processing_status",
          "attempt_count",
          "resend_delivery_id",
          "resend_email_id",
        ],
        rows.map((row) => [
          row.receivedAt,
          row.eventCreatedAt,
          row.eventType,
          row.status,
          row.attemptCount,
          row.providerDeliveryId,
          row.providerEmailId,
        ]),
      );
    }

    await writeAuditEvent({
      action: "system.history_exported",
      actorUserId: actor.id,
      entityType: "operational_history",
      newData: { exportKind: input.kind, recordCount },
    });

    return new Response(csv, {
      headers: {
        "Content-Disposition": `attachment; filename="aureum-${input.kind}-history.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
      status: 200,
    });
  });
}
