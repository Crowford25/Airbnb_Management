import { hasPermission } from "@/features/auth/rbac";
import { requireApiUser } from "@/server/api/authorization";
import { apiJson, handleApi } from "@/server/api/response";
import { assertSafeMutation, enforceRateLimit } from "@/server/api/security";
import {
  createReservationPaymentIntent,
  getReservationPayment,
} from "@/server/services/payments";

type RouteContext = { params: Promise<{ reference: string }> };

export async function GET(request: Request, context: RouteContext) {
  return handleApi(request, async () => {
    const user = await requireApiUser();
    const { reference } = await context.params;
    return apiJson(
      await getReservationPayment(
        reference,
        user,
        hasPermission(user.role, "reservations:view"),
      ),
    );
  });
}

export async function POST(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    enforceRateLimit(request, "payment-intent-create", 20, 60 * 60 * 1_000);
    const user = await requireApiUser();
    const { reference } = await context.params;
    return apiJson(await createReservationPaymentIntent(reference, user, requestId), {
      status: 201,
    });
  });
}
