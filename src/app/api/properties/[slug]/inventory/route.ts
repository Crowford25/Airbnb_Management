import { z } from "zod";

import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { isoDateSchema } from "@/server/api/validation";
import { validate } from "@/server/api/validation";
import { getInventoryWindow } from "@/server/db/repositories/inventory";
import { findPropertyBySlug } from "@/server/db/repositories/properties";

type RouteContext = { params: Promise<{ slug: string }> };

const inventoryQuerySchema = z
  .object({
    from: isoDateSchema,
    roomKey: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    to: isoDateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const days = Math.round(
      (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) /
        86_400_000,
    );
    if (days < 1 || days > 370) {
      context.addIssue({
        code: "custom",
        message: "The inventory window must be between 1 and 370 days.",
        path: ["to"],
      });
    }
  });

export async function GET(request: Request, context: RouteContext) {
  return handleApi(request, async () => {
    const { slug } = await context.params;
    const property = await findPropertyBySlug(slug);
    if (!property) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }
    const query = validate(
      inventoryQuerySchema,
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const rooms = await getInventoryWindow(
      property.id,
      query.from,
      query.to,
      query.roomKey,
    );
    return apiJson({ from: query.from, rooms, to: query.to });
  });
}
