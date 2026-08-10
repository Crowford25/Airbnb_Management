import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { readRawBody } from "@/server/api/validation";
import { PaymentConfigurationError } from "@/server/payments/config";
import { getPaymentProvider } from "@/server/payments";
import { processPaymentWebhook } from "@/server/services/payments";

export async function POST(request: Request) {
  return handleApi(request, async () => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      throw new ApiError(400, "INVALID_WEBHOOK", "Missing Stripe signature.");
    }
    const payload = await readRawBody(request, 262_144);
    let event;
    try {
      event = getPaymentProvider().verifyWebhook(payload, signature);
    } catch (error) {
      if (error instanceof PaymentConfigurationError) {
        throw new ApiError(503, "PAYMENTS_NOT_CONFIGURED", error.message);
      }
      throw new ApiError(400, "INVALID_WEBHOOK", "Invalid Stripe webhook signature.");
    }
    await processPaymentWebhook(event, payload);
    return apiJson({ received: true });
  });
}
