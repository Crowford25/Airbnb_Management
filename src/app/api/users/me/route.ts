import { requireApiUser } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { profileUpdateSchema } from "@/server/api/schemas";
import { assertSafeMutation } from "@/server/api/security";
import { readJson, validate } from "@/server/api/validation";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import { findActiveUserById, updateUserProfile } from "@/server/db/repositories/users";

function publicUser(user: NonNullable<Awaited<ReturnType<typeof findActiveUserById>>>) {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    locale: user.locale,
    phone: user.phone,
    role: user.role,
  };
}

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const sessionUser = await requireApiUser();
    const user = await findActiveUserById(sessionUser.id);

    if (!user) {
      throw new ApiError(404, "NOT_FOUND", "The user account was not found.");
    }

    return apiJson({ user: publicUser(user) });
  });
}

export async function PATCH(request: Request) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const sessionUser = await requireApiUser();
    const input = validate(profileUpdateSchema, await readJson(request, 8_192));
    const user = await updateUserProfile(sessionUser.id, input);

    if (!user) {
      throw new ApiError(404, "NOT_FOUND", "The user account was not found.");
    }

    await writeAuditEvent({
      action: "user.profile_updated",
      actorUserId: user.id,
      entityId: user.id,
      entityType: "user",
      newData: {
        displayName: user.displayName,
        locale: user.locale,
        phone: user.phone,
      },
      requestId,
    });

    return apiJson({ user: publicUser(user) });
  });
}
