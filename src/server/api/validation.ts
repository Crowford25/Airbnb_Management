import "server-only";

import { z } from "zod";

import { ApiError } from "./errors";

export const uuidSchema = z.uuid();
export const emailSchema = z
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date in YYYY-MM-DD format.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.");

export async function readRawBody(request: Request, maximumBytes = 65_536) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new ApiError(400, "VALIDATION_ERROR", "The request body is too large.");
  }

  const text = await request.text();
  const byteLength = new TextEncoder().encode(text).byteLength;

  if (byteLength > maximumBytes) {
    throw new ApiError(400, "VALIDATION_ERROR", "The request body is too large.");
  }

  return text;
}

export async function readJson(request: Request, maximumBytes = 65_536) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Requests with a body must use application/json.",
    );
  }

  const text = await readRawBody(request, maximumBytes);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

export function validate<T>(schema: z.ZodType<T>, input: unknown) {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Check the highlighted request fields and try again.",
      result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
