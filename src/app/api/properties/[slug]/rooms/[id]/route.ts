import { requireApiPermission } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { roomStatusUpdateSchema } from "@/server/api/schemas";
import { assertSafeMutation } from "@/server/api/security";
import { readJson, validate } from "@/server/api/validation";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import {
  listInternalRooms,
  updateInternalRoomStatus,
} from "@/server/db/repositories/inventory";
import { findPropertyBySlug } from "@/server/db/repositories/properties";
import { withDatabaseTransaction } from "@/server/db/query";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const actor = await requireApiPermission("properties:manage");
    const { slug, id } = await context.params;
    const property = await findPropertyBySlug(slug, { publishedOnly: false });
    if (!property) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }
    const input = validate(roomStatusUpdateSchema, await readJson(request, 8_192));
    await withDatabaseTransaction(async (transaction) => {
      const updated = await updateInternalRoomStatus(
        transaction,
        property.id,
        id,
        input.status,
        actor.id,
      );
      if (!updated) {
        throw new ApiError(404, "NOT_FOUND", "The internal room was not found.");
      }
      await writeAuditEvent(
        {
          action: "room.status_updated",
          actorUserId: actor.id,
          entityId: id,
          entityType: "unit",
          newData: { status: input.status },
          requestId,
        },
        transaction,
      );
    });
    const room = (await listInternalRooms(property.id)).find((item) => item.id === id);
    return apiJson({ room });
  });
}
