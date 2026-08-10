import { z } from "zod";

import { requireApiPermission } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { publicProperty } from "@/server/api/presenters";
import { propertyCreateSchema } from "@/server/api/schemas";
import { assertSafeMutation, enforceRateLimit } from "@/server/api/security";
import { isoDateSchema, readJson, validate } from "@/server/api/validation";
import { writeAuditEvent } from "@/server/db/repositories/audit";
import {
  createProperty,
  findPropertyBySlug,
  listActiveAmenityCodes,
  listProperties,
} from "@/server/db/repositories/properties";
import { withDatabaseTransaction } from "@/server/db/query";

const propertyQuerySchema = z
  .object({
    checkIn: isoDateSchema.optional(),
    checkOut: isoDateSchema.optional(),
    city: z.string().trim().min(1).max(120).optional(),
    guests: z.coerce.number().int().min(1).max(1_000).optional(),
    includeUnpublished: z.enum(["true", "false"]).default("false"),
    status: z.enum(["draft", "published", "archived"]).optional(),
    type: z.enum(["hotel", "airbnb"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.checkIn) !== Boolean(value.checkOut)) {
      context.addIssue({
        code: "custom",
        message: "Provide both check-in and check-out dates.",
        path: [value.checkIn ? "checkOut" : "checkIn"],
      });
    }

    if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn) {
      context.addIssue({
        code: "custom",
        message: "Check-out must be after check-in.",
        path: ["checkOut"],
      });
    }
  });

function queryInput(request: Request) {
  const search = new URL(request.url).searchParams;
  return Object.fromEntries(search.entries());
}

async function assertAmenityCodes(codes: string[]) {
  const active = new Set(await listActiveAmenityCodes());
  const invalid = codes.filter((code) => !active.has(code));

  if (invalid.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Unknown amenity code(s).", {
      amenityCodes: invalid,
    });
  }
}

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const query = validate(propertyQuerySchema, queryInput(request));
    const includeUnpublished = query.includeUnpublished === "true";

    if (includeUnpublished) {
      await requireApiPermission("properties:view");
    }

    const items = await listProperties({
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      city: query.city,
      guests: query.guests,
      propertyType: query.type,
      publishedOnly: !includeUnpublished,
      status: includeUnpublished ? query.status : undefined,
    });

    return apiJson({
      items: includeUnpublished ? items : items.map(publicProperty),
      total: items.length,
    });
  });
}

export async function POST(request: Request) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    enforceRateLimit(request, "property-create", 30, 60 * 60 * 1_000);
    const actor = await requireApiPermission("properties:manage");
    const input = validate(propertyCreateSchema, await readJson(request, 250_000));
    await assertAmenityCodes(input.amenityCodes);
    const propertyId = await withDatabaseTransaction(async (transaction) => {
      const id = await createProperty(transaction, input, actor.id);
      await writeAuditEvent(
        {
          action: "property.created",
          actorUserId: actor.id,
          entityId: id,
          entityType: "property",
          newData: { name: input.name, slug: input.slug, status: input.status },
          requestId,
        },
        transaction,
      );
      return id;
    });
    const property = await findPropertyBySlug(input.slug, { publishedOnly: false });

    if (!property || property.id !== propertyId) {
      throw new Error("The property could not be reloaded after creation.");
    }

    return apiJson({ property }, { status: 201 });
  });
}
