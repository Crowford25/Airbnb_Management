import { hasPermission } from "@/features/auth/rbac";
import { requireApiUser } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { userAccessUpdateSchema } from "@/server/api/schemas";
import { assertSafeMutation } from "@/server/api/security";
import { readJson, uuidSchema, validate } from "@/server/api/validation";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import { findUserById, updateUserAccess } from "@/server/db/repositories/users";
import { withDatabaseTransaction } from "@/server/db/query";

type RouteContext = { params: Promise<{ id: string }> };

function publicUser(user: NonNullable<Awaited<ReturnType<typeof findUserById>>>) {
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

export async function PATCH(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const actor = await requireApiUser();
    const canManageTeam = hasPermission(actor.role, "team:manage");
    const canManageRoles = hasPermission(actor.role, "roles:manage");

    if (!canManageTeam && !canManageRoles) {
      throw new ApiError(403, "FORBIDDEN", "Your role cannot manage user access.");
    }

    const { id: rawId } = await context.params;
    const userId = validate(uuidSchema, rawId);
    const input = validate(userAccessUpdateSchema, await readJson(request, 4_096));
    const target = await findUserById(userId);

    if (!target) {
      throw new ApiError(404, "NOT_FOUND", "The user account was not found.");
    }

    if (target.id === actor.id) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Use another super administrator to change your own access.",
      );
    }

    if (input.role !== undefined && !canManageRoles) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only a super administrator can assign roles.",
      );
    }

    if (
      !canManageRoles &&
      !(["employee", "lead"] as const).includes(target.role as "employee" | "lead")
    ) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Managers can only update employee and team-lead access.",
      );
    }

    const nextRole = input.role ?? target.role;
    const nextIsActive = input.isActive ?? target.isActive;
    const updated = await withDatabaseTransaction(async (transaction) => {
      const result = await updateUserAccess(transaction, {
        actorId: actor.id,
        isActive: nextIsActive,
        role: nextRole,
        userId: target.id,
      });

      if (!result) {
        throw new ApiError(404, "NOT_FOUND", "The user account was not found.");
      }

      await writeAuditEvent(
        {
          action: "user.access_updated",
          actorUserId: actor.id,
          entityId: target.id,
          entityType: "user",
          newData: { isActive: nextIsActive, role: nextRole },
          previousData: { isActive: target.isActive, role: target.role },
          requestId,
        },
        transaction,
      );
      return result;
    });

    return apiJson({ user: publicUser(updated) });
  });
}
