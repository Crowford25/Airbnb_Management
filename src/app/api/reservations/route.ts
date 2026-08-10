import { z } from "zod";

import { hasPermission } from "@/features/auth/rbac";
import { requireApiUser } from "@/server/api/authorization";
import { apiJson, handleApi } from "@/server/api/response";
import { createReservationSchema } from "@/server/api/schemas";
import { assertSafeMutation, enforceRateLimit } from "@/server/api/security";
import { readJson, validate } from "@/server/api/validation";
import { listReservations } from "@/server/db/repositories/reservations";
import { createReservationHold } from "@/server/services/reservations";

const reservationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    status: z.enum(["pending", "confirmed", "cancelled", "completed"]).optional(),
  })
  .strict();

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const user = await requireApiUser();
    const query = validate(
      reservationQuerySchema,
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const canViewAll = hasPermission(user.role, "reservations:view");
    const result = await listReservations({
      guestUserId: canViewAll ? undefined : user.id,
      limit: query.limit,
      offset: query.offset,
      status: query.status,
    });

    return apiJson({ ...result, limit: query.limit, offset: query.offset });
  });
}

export async function POST(request: Request) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    enforceRateLimit(request, "reservation-create", 12, 60 * 60 * 1_000);
    const user = await requireApiUser();
    const input = validate(createReservationSchema, await readJson(request, 16_384));
    const result = await createReservationHold(input, user, requestId);

    return apiJson(
      {
        created: result.created,
        reservation: result.reservation,
      },
      { status: result.created ? 201 : 200 },
    );
  });
}
