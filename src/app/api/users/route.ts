import { z } from "zod";

import { hasPermission } from "@/features/auth/rbac";
import { authRoles } from "@/features/auth/types";
import { requireApiPermission } from "@/server/api/authorization";
import { apiJson, handleApi } from "@/server/api/response";
import { validate } from "@/server/api/validation";
import { listUsers } from "@/server/db/repositories/users";

const userQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    query: z.string().trim().max(200).optional(),
    role: z.enum(authRoles).optional(),
  })
  .strict();

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const actor = await requireApiPermission("customers:view");
    const query = validate(
      userQuerySchema,
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const canViewTeam = hasPermission(actor.role, "team:view");
    const result = await listUsers({
      limit: query.limit,
      offset: query.offset,
      query: query.query,
      role: canViewTeam ? query.role : "customer",
    });

    return apiJson({ ...result, limit: query.limit, offset: query.offset });
  });
}
