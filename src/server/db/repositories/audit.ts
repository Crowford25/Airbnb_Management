import "server-only";

import type { AuthRole } from "@/features/auth/types";
import { getRequestContext } from "@/server/api/request-context";

import { databaseQuery, type TransactionContext } from "../query";

type AuditEventInput = {
  action: string;
  actorRole?: AuthRole | null;
  actorUserId?: string | null;
  changedFields?: string[] | null;
  correlationId?: string | null;
  entityId?: string | null;
  entityType: string;
  ipAddress?: string | null;
  newData?: Record<string, unknown> | null;
  previousData?: Record<string, unknown> | null;
  requestId?: string | null;
  userAgent?: string | null;
};

const sensitiveKey =
  /(?:authorization|cookie|password|secret|token|api[_-]?key|card|client[_-]?secret|session)/i;

function safeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 50).map(safeAuditValue);
  if (value && typeof value === "object") {
    return safeAuditData(value as Record<string, unknown>);
  }
  return typeof value === "string" ? value.slice(0, 2_000) : value;
}

function safeAuditData(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (sensitiveKey.test(key)) return [key, "[REDACTED]"];
      return [key, safeAuditValue(entry)];
    }),
  );
}

function calculatedChangedFields(
  previousData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
) {
  if (!previousData || !newData) return null;
  return [...new Set([...Object.keys(previousData), ...Object.keys(newData)])]
    .filter((key) => JSON.stringify(previousData[key]) !== JSON.stringify(newData[key]))
    .slice(0, 100);
}

export async function writeAuditEvent(
  input: AuditEventInput,
  transaction?: TransactionContext,
) {
  const executor = transaction?.query.bind(transaction) ?? databaseQuery;
  const context = getRequestContext();
  const previousData = safeAuditData(input.previousData);
  const newData = safeAuditData(input.newData);
  const changedFields =
    input.changedFields ?? calculatedChangedFields(previousData, newData);

  await executor({
    text: `
      INSERT INTO aureum.audit_events (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        request_id,
        correlation_id,
        actor_role,
        changed_fields,
        previous_data,
        new_data,
        ip_address,
        user_agent
      )
      VALUES (
        $1, $2, $3, $4, $5::uuid, $6::uuid, $7::aureum.app_role, $8::text[],
        $9::jsonb, $10::jsonb, $11::inet, $12
      )
    `,
    values: [
      input.actorUserId ?? context?.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.requestId ?? context?.requestId ?? null,
      input.correlationId ?? context?.correlationId ?? null,
      input.actorRole ?? context?.actorRole ?? null,
      changedFields,
      previousData ? JSON.stringify(previousData) : null,
      newData ? JSON.stringify(newData) : null,
      input.ipAddress ?? context?.ipAddress ?? null,
      input.userAgent?.slice(0, 2_000) ?? context?.userAgent ?? null,
    ],
  });
}
