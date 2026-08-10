import "server-only";

import { NextResponse } from "next/server";
import type { DatabaseError } from "pg";

import { writeApiRequestLog } from "@/server/db/repositories/api-request-logs";

import { ApiError } from "./errors";
import {
  createRequestContext,
  runWithRequestContext,
  type RequestContext,
} from "./request-context";

type ApiHandler = (requestId: string) => Promise<Response>;

function responseHeaders(context: RequestContext, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Correlation-Id", context.correlationId);
  responseHeaders.set("X-Request-Id", context.requestId);
  return responseHeaders;
}

export function apiJson(
  body: unknown,
  options: { headers?: HeadersInit; status?: number } = {},
) {
  return NextResponse.json(body, {
    headers: options.headers,
    status: options.status ?? 200,
  });
}

function postgresApiError(error: DatabaseError) {
  if (error.code === "23505") {
    return new ApiError(409, "CONFLICT", "That record already exists.");
  }

  if (error.code === "23P01") {
    return new ApiError(
      409,
      "CONFLICT",
      "That date range overlaps an existing record.",
    );
  }

  if (["23503", "23514", "22P02", "22007"].includes(error.code ?? "")) {
    return new ApiError(400, "VALIDATION_ERROR", "The request violates a data rule.");
  }

  if (["40001", "40P01"].includes(error.code ?? "")) {
    return new ApiError(
      409,
      "CONFLICT",
      "The data changed during this request. Please retry.",
    );
  }

  return null;
}

function normalizedRoute(request: Request) {
  const staticSegments = new Set([
    "api",
    "admin",
    "auth",
    "inventory",
    "history",
    "export",
    "me",
    "payment-intent",
    "properties",
    "refunds",
    "resend",
    "reservations",
    "room-blocks",
    "rooms",
    "session",
    "stripe",
    "users",
    "webhooks",
  ]);
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  return `/${segments
    .map((segment, index) => {
      if (staticSegments.has(segment)) return segment;
      const previous = segments[index - 1];
      return previous && staticSegments.has(previous) ? ":id" : segment;
    })
    .join("/")}`;
}

async function logApiRequest(
  request: Request,
  context: RequestContext,
  startedAt: number,
  statusCode: number,
  error?: ApiError,
) {
  if (normalizedRoute(request) === "/api/health") return;
  try {
    await writeApiRequestLog({
      actorRole: context.actorRole,
      actorUserId: context.actorUserId,
      correlationId: context.correlationId,
      durationMs: performance.now() - startedAt,
      errorCode: error?.code,
      errorMessage: error && error.status < 500 ? error.message : null,
      ipAddress: context.ipAddress,
      method: request.method,
      outcome: error ? "error" : "success",
      requestId: context.requestId,
      route: normalizedRoute(request),
      statusCode,
      userAgent: context.userAgent,
    });
  } catch (loggingError) {
    // Observability must never fail the customer or staff operation.
    console.error(`[${context.requestId}] API request logging failed`, loggingError);
  }
}

export async function handleApi(request: Request, handler: ApiHandler) {
  const context = createRequestContext(request);
  const startedAt = performance.now();

  return runWithRequestContext(context, async () => {
    try {
      const response = await handler(context.requestId);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Correlation-Id", context.correlationId);
      response.headers.set("X-Request-Id", context.requestId);
      await logApiRequest(request, context, startedAt, response.status);
      return response;
    } catch (caughtError) {
      const mappedDatabaseError =
        typeof caughtError === "object" && caughtError !== null && "code" in caughtError
          ? postgresApiError(caughtError as DatabaseError)
          : null;
      const error =
        caughtError instanceof ApiError
          ? caughtError
          : (mappedDatabaseError ??
            new ApiError(500, "INTERNAL_ERROR", "The request could not be completed."));

      if (error.status >= 500) {
        console.error(`[${context.requestId}] API request failed`, caughtError);
      }

      const response = NextResponse.json(
        {
          error: {
            code: error.code,
            details: error.details,
            message: error.message,
            requestId: context.requestId,
          },
          message: error.message,
        },
        {
          headers: responseHeaders(context, error.headers),
          status: error.status,
        },
      );
      await logApiRequest(request, context, startedAt, error.status, error);
      return response;
    }
  });
}
