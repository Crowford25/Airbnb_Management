import { z } from "zod";

import { requireApiPermission } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { roomBlockCreateSchema } from "@/server/api/schemas";
import { assertSafeMutation } from "@/server/api/security";
import { isoDateSchema, readJson, validate } from "@/server/api/validation";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import { createUnitBlock, listUnitBlocks } from "@/server/db/repositories/inventory";
import { findPropertyBySlug } from "@/server/db/repositories/properties";
import { withDatabaseTransaction } from "@/server/db/query";

type RouteContext = { params: Promise<{ slug: string }> };

const blockQuerySchema = z.object({ from: isoDateSchema.optional() }).strict();

export async function GET(request: Request, context: RouteContext) {
  return handleApi(request, async () => {
    await requireApiPermission("properties:view");
    const { slug } = await context.params;
    const property = await findPropertyBySlug(slug, { publishedOnly: false });
    if (!property) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }
    const query = validate(
      blockQuerySchema,
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    return apiJson({ blocks: await listUnitBlocks(property.id, query.from) });
  });
}

export async function POST(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const actor = await requireApiPermission("properties:manage");
    const { slug } = await context.params;
    const property = await findPropertyBySlug(slug, { publishedOnly: false });
    if (!property) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }
    const input = validate(roomBlockCreateSchema, await readJson(request, 16_384));
    const blockId = await withDatabaseTransaction(async (transaction) => {
      const id = await createUnitBlock(transaction, {
        actorId: actor.id,
        endDate: input.endDate,
        externalReference: input.externalReference,
        note: input.note,
        propertyId: property.id,
        reason: input.reason,
        startDate: input.startDate,
        unitId: input.unitId,
      });
      if (!id) {
        throw new ApiError(404, "NOT_FOUND", "The internal room was not found.");
      }
      await writeAuditEvent(
        {
          action: "room.block_created",
          actorUserId: actor.id,
          entityId: id,
          entityType: "unit_block",
          newData: {
            endDate: input.endDate,
            reason: input.reason,
            startDate: input.startDate,
            unitId: input.unitId,
          },
          requestId,
        },
        transaction,
      );
      return id;
    });
    const block = (await listUnitBlocks(property.id)).find(
      (item) => item.id === blockId,
    );
    return apiJson({ block }, { status: 201 });
  });
}
