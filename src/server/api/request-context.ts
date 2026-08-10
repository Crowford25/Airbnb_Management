import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import type { AuthRole, AuthUser } from "@/features/auth/types";

export type RequestContext = {
  actorRole: AuthRole | null;
  actorUserId: string | null;
  correlationId: string;
  ipAddress: string | null;
  requestId: string;
  userAgent: string | null;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

function headerUuid(value: string | null) {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

export function createRequestContext(request: Request): RequestContext {
  return {
    actorRole: null,
    actorUserId: null,
    correlationId: headerUuid(request.headers.get("x-correlation-id")) ?? randomUUID(),
    ipAddress: requestIp(request),
    requestId: randomUUID(),
    userAgent: request.headers.get("user-agent")?.slice(0, 2_000) ?? null,
  };
}

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => Promise<T>,
) {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext() {
  return requestContextStorage.getStore() ?? null;
}

export function setRequestActor(user: Pick<AuthUser, "id" | "role">) {
  const context = getRequestContext();
  if (!context) return;
  context.actorUserId = user.id;
  context.actorRole = user.role;
}

export function requestTrace() {
  const context = getRequestContext();
  return {
    correlationId: context?.correlationId ?? null,
    originRequestId: context?.requestId ?? null,
    triggeredByUserId: context?.actorUserId ?? null,
  };
}
