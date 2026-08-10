import { hasPermission } from "@/features/auth/rbac";
import { requireApiUser } from "@/server/api/authorization";
import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { reservationStatusUpdateSchema } from "@/server/api/schemas";
import { assertSafeMutation } from "@/server/api/security";
import { readJson, validate } from "@/server/api/validation";
import { findReservationByReference } from "@/server/db/repositories/reservations";
import { changeReservationStatus } from "@/server/services/reservations";

type RouteContext = { params: Promise<{ reference: string }> };

export async function GET(request: Request, context: RouteContext) {
  return handleApi(request, async () => {
    const user = await requireApiUser();
    const { reference } = await context.params;
    const reservation = await findReservationByReference(reference);

    if (!reservation) {
      throw new ApiError(404, "NOT_FOUND", "The reservation was not found.");
    }

    if (
      reservation.guestUserId !== user.id &&
      !hasPermission(user.role, "reservations:view")
    ) {
      throw new ApiError(403, "FORBIDDEN", "You cannot view this reservation.");
    }

    return apiJson({ reservation });
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    const user = await requireApiUser();
    const { reference } = await context.params;
    const input = validate(
      reservationStatusUpdateSchema,
      await readJson(request, 8_192),
    );
    const reservation = await changeReservationStatus(
      reference,
      input.status,
      user,
      hasPermission(user.role, "reservations:manage"),
      requestId,
      input.cancellationReason,
    );

    return apiJson({ reservation });
  });
}
