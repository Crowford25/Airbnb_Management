import { requireApiPermission } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { listInternalRooms } from "@/server/db/repositories/inventory";
import { findPropertyBySlug } from "@/server/db/repositories/properties";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  return handleApi(request, async () => {
    await requireApiPermission("properties:view");
    const { slug } = await context.params;
    const property = await findPropertyBySlug(slug, { publishedOnly: false });
    if (!property) {
      throw new ApiError(404, "NOT_FOUND", "The property was not found.");
    }
    return apiJson({ rooms: await listInternalRooms(property.id) });
  });
}
