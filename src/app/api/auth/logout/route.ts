import { deleteSession, getSession } from "@/features/auth/server/session";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import { handleApi } from "@/server/api/response";
import { assertSafeMutation } from "@/server/api/security";

export async function POST(request: Request) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const session = await getSession();
    await deleteSession();

    if (session) {
      await writeAuditEvent({
        action: "auth.logout",
        actorUserId: session.user.id,
        entityId: session.user.id,
        entityType: "user",
        requestId,
        userAgent: request.headers.get("user-agent"),
      });
    }

    return new Response(null, { status: 204 });
  });
}
