import { requireApiPermission } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { handleApi } from "@/server/api/response";
import { assertSafeMutation } from "@/server/api/security";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import { deleteUnitBlock } from "@/server/db/repositories/inventory";
import { findPropertyBySlug } from "@/server/db/repositories/properties";
import { withDatabaseTransaction } from "@/server/db/query";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const actor = await requireApiPermission("properties:manage");
    const { slug, id } = await context.params;
    const property = await findPropertyBySlug(slug, { publishedOnly: false });
    if (!property) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }
    await withDatabaseTransaction(async (transaction) => {
      if (!(await deleteUnitBlock(transaction, property.id, id, actor.id))) {
        throw new ApiError(404, "NOT_FOUND", "The room block was not found.");
      }
      await writeAuditEvent(
        {
          action: "room.block_deleted",
          actorUserId: actor.id,
          entityId: id,
          entityType: "unit_block",
          previousData: { active: true },
          requestId,
        },
        transaction,
      );
    });
    return new Response(null, { status: 204 });
  });
}
