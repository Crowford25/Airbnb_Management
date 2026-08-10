import "server-only";

import { ApiError } from "./errors";
import { requestIp } from "./request-context";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type SecurityGlobals = typeof globalThis & {
  aureumRateLimits?: Map<string, RateLimitBucket>;
};

const securityGlobals = globalThis as SecurityGlobals;
const rateLimits =
  securityGlobals.aureumRateLimits ?? new Map<string, RateLimitBucket>();
securityGlobals.aureumRateLimits = rateLimits;

export function assertSafeMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return;
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "FORBIDDEN", "Cross-site requests are not allowed.");
  }

  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "FORBIDDEN", "The request origin is not allowed.");
  }
}

export function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMilliseconds: number,
) {
  const now = Date.now();
  const key = `${scope}:${requestIp(request) ?? "local"}`;
  const current = rateLimits.get(key);

  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMilliseconds });
    return;
  }

  current.count += 1;

  if (current.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many attempts. Please wait before trying again.",
      undefined,
      { "Retry-After": String(retryAfter) },
    );
  }

  if (rateLimits.size > 2_000) {
    for (const [bucketKey, bucket] of rateLimits) {
      if (bucket.resetAt <= now) {
        rateLimits.delete(bucketKey);
      }
    }
  }
}
