import { requireApiPermission } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { publicProperty } from "@/server/api/presenters";
import { propertyPatchSchema, propertyWriteSchema } from "@/server/api/schemas";
import { assertSafeMutation } from "@/server/api/security";
import { readJson, validate } from "@/server/api/validation";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import {
  archiveProperty,
  findPropertyByIdForUpdate,
  findPropertyBySlug,
  listActiveAmenityCodes,
  propertyHasActiveReservations,
  updateProperty,
  type PropertyWriteInput,
} from "@/server/db/repositories/properties";
import { withDatabaseTransaction } from "@/server/db/query";

type RouteContext = { params: Promise<{ slug: string }> };

function writeInputFromProperty(
  property: NonNullable<Awaited<ReturnType<typeof findPropertyBySlug>>>,
): PropertyWriteInput {
  return {
    addressLine1: property.addressLine1,
    addressLine2: property.addressLine2,
    amenityCodes: property.amenities.map((amenity) => amenity.code),
    checkInTime: property.checkInTime.slice(0, 5),
    checkOutTime: property.checkOutTime.slice(0, 5),
    city: property.city,
    countryCode: property.countryCode,
    currency: property.currency,
    descriptionEn: property.descriptionEn,
    descriptionZhCn: property.descriptionZhCn,
    images: property.images.map((image) => ({
      altTextEn: image.altTextEn,
      altTextZhCn: image.altTextZhCn,
      imageUrl: image.imageUrl,
    })),
    name: property.name,
    nameZhCn: property.nameZhCn,
    postalCode: property.postalCode,
    propertyType: property.propertyType,
    slug: property.slug,
    stateRegion: property.stateRegion,
    status: property.status,
    taglineEn: property.taglineEn,
    taglineZhCn: property.taglineZhCn,
    timezone: property.timezone,
  };
}

async function assertAmenityCodes(codes: string[]) {
  const active = new Set(await listActiveAmenityCodes());

  if (codes.some((code) => !active.has(code))) {
    throw new ApiError(400, "VALIDATION_ERROR", "Unknown amenity code(s).");
  }
}

export async function GET(request: Request, context: RouteContext) {
  return handleApi(request, async () => {
    const { slug } = await context.params;
    const preview = new URL(request.url).searchParams.get("preview") === "true";

    if (preview) {
      await requireApiPermission("properties:view");
    }

    const property = await findPropertyBySlug(slug, {
      publishedOnly: !preview,
    });

    if (!property) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }

    return apiJson({ property: preview ? property : publicProperty(property) });
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const actor = await requireApiPermission("properties:manage");
    const { slug } = await context.params;
    const current = await findPropertyBySlug(slug, { publishedOnly: false });

    if (!current) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }

    const patch = validate(propertyPatchSchema, await readJson(request, 100_000));
    const input = validate(propertyWriteSchema, {
      ...writeInputFromProperty(current),
      ...patch,
    });
    await assertAmenityCodes(input.amenityCodes);

    await withDatabaseTransaction(async (transaction) => {
      const locked = await findPropertyByIdForUpdate(transaction, current.id);

      if (!locked) {
        throw new ApiError(404, "NOT_FOUND", "The property was not found.");
      }

      const updated = await updateProperty(transaction, locked.id, input, actor.id);

      if (!updated) {
        throw new ApiError(404, "NOT_FOUND", "The property was not found.");
      }

      await writeAuditEvent(
        {
          action: "property.updated",
          actorUserId: actor.id,
          entityId: locked.id,
          entityType: "property",
          newData: { name: input.name, slug: input.slug, status: input.status },
          previousData: {
            name: locked.name,
            slug: locked.slug,
            status: locked.status,
          },
          requestId,
        },
        transaction,
      );
    });

    const property = await findPropertyBySlug(input.slug, { publishedOnly: false });
    return apiJson({ property });
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const actor = await requireApiPermission("properties:manage");
    const { slug } = await context.params;
    const current = await findPropertyBySlug(slug, { publishedOnly: false });

    if (!current) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }

    await withDatabaseTransaction(async (transaction) => {
      const locked = await findPropertyByIdForUpdate(transaction, current.id);

      if (!locked) {
        throw new ApiError(404, "NOT_FOUND", "The property was not found.");
      }

      if (await propertyHasActiveReservations(transaction, locked.id)) {
        throw new ApiError(
          409,
          "CONFLICT",
          "Cancel or complete future reservations before archiving this property.",
        );
      }

      await archiveProperty(transaction, locked.id, actor.id);
      await writeAuditEvent(
        {
          action: "property.archived",
          actorUserId: actor.id,
          entityId: locked.id,
          entityType: "property",
          previousData: { slug: locked.slug, status: locked.status },
          requestId,
        },
        transaction,
      );
    });

    return new Response(null, { status: 204 });
  });
}
