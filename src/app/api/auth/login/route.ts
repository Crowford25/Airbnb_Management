import { z } from "zod";

import { verifyCredentials } from "@/features/auth/server/password";
import { createSession } from "@/features/auth/server/session";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { setRequestActor } from "@/server/api/request-context";
import { assertSafeMutation, enforceRateLimit } from "@/server/api/security";
import { emailSchema, readJson, validate } from "@/server/api/validation";

export const runtime = "nodejs";

const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    enforceRateLimit(request, "auth-login", 8, 15 * 60 * 1_000);
    const credentials = validate(loginSchema, await readJson(request, 4_096));
    const user = await verifyCredentials(credentials.email, credentials.password);

    if (!user) {
      throw new ApiError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Email address or password is incorrect.",
      );
    }

    setRequestActor(user);
    const session = await createSession(user);
    await writeAuditEvent({
      action: "auth.login",
      actorUserId: user.id,
      entityId: user.id,
      entityType: "user",
      requestId,
      userAgent: request.headers.get("user-agent"),
    });

    return apiJson(session);
  });
}
