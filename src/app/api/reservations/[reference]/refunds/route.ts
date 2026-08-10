import { requireApiPermission } from "@/server/api/authorization";
import { apiJson, handleApi } from "@/server/api/response";
import { paymentRefundCreateSchema } from "@/server/api/schemas";
import { assertSafeMutation, enforceRateLimit } from "@/server/api/security";
import { readJson, validate } from "@/server/api/validation";
import { requestReservationRefund } from "@/server/services/payments";

type RouteContext = { params: Promise<{ reference: string }> };

export async function POST(request: Request, context: RouteContext) {
  return handleApi(request, async (requestId) => {
    assertSafeMutation(request);
    enforceRateLimit(request, "payment-refund-create", 30, 60 * 60 * 1_000);
    const user = await requireApiPermission("reservations:manage");
    const { reference } = await context.params;
    const input = validate(paymentRefundCreateSchema, await readJson(request, 8_192));
    const refund = await requestReservationRefund(reference, input, user, requestId);
    return apiJson({ refund }, { status: 201 });
  });
}
