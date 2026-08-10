import "server-only";

import type { AuthRole } from "@/features/auth/types";

import { databaseQuery } from "../query";

export type ApiRequestLogInput = {
  actorRole?: AuthRole | null;
  actorUserId?: string | null;
  correlationId: string;
  durationMs: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  ipAddress?: string | null;
  method: string;
  outcome: "error" | "success";
  requestId: string;
  route: string;
  statusCode: number;
  userAgent?: string | null;
};

export async function writeApiRequestLog(input: ApiRequestLogInput) {
  await databaseQuery({
    text: `
      INSERT INTO aureum.api_request_logs (
        request_id, correlation_id, actor_user_id, actor_role, method, route,
        outcome, status_code, duration_ms, error_code, error_message,
        ip_address, user_agent
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::aureum.app_role, $5, $6,
        $7, $8, $9, $10, $11, $12::inet, $13
      )
    `,
    values: [
      input.requestId,
      input.correlationId,
      input.actorUserId ?? null,
      input.actorRole ?? null,
      input.method.slice(0, 10).toUpperCase(),
      input.route.slice(0, 240),
      input.outcome,
      input.statusCode,
      Math.max(0, Math.min(Math.round(input.durationMs), 2_147_483_647)),
      input.errorCode?.slice(0, 120) ?? null,
      input.errorMessage?.slice(0, 500) ?? null,
      input.ipAddress ?? null,
      input.userAgent?.slice(0, 2_000) ?? null,
    ],
  });
}
