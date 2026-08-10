import "server-only";

export type ApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "CONFLICT"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "INVALID_JSON"
  | "NOT_FOUND"
  | "NOTIFICATIONS_NOT_CONFIGURED"
  | "INVALID_WEBHOOK"
  | "PAYMENTS_NOT_CONFIGURED"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_NOT_ACTIONABLE"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_PROVIDER_ERROR"
  | "PAYMENT_REQUIRED"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VALIDATION_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: HeadersInit,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
