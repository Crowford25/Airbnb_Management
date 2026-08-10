import { Resend, type WebhookEventPayload } from "resend";

import { ApiError } from "@/server/api/errors";
import { apiJson, handleApi } from "@/server/api/response";
import { readRawBody } from "@/server/api/validation";
import { resendWebhookSecret } from "@/server/notifications/config";
import { processResendWebhook } from "@/server/notifications/resend-webhooks";

export const runtime = "nodejs";

function webhookHeaders(request: Request) {
  const id = request.headers.get("svix-id");
  const signature = request.headers.get("svix-signature");
  const timestamp = request.headers.get("svix-timestamp");
  if (!id || !signature || !timestamp) {
    throw new ApiError(400, "INVALID_WEBHOOK", "Missing Resend webhook signature.");
  }
  return { id, signature, timestamp };
}

export async function POST(request: Request) {
  return handleApi(request, async () => {
    let secret: string;
    try {
      secret = resendWebhookSecret();
    } catch (error) {
      throw new ApiError(
        503,
        "NOTIFICATIONS_NOT_CONFIGURED",
        error instanceof Error ? error.message : "Resend webhooks are not configured.",
      );
    }
    const headers = webhookHeaders(request);
    const payload = await readRawBody(request, 131_072);
    let event: WebhookEventPayload;
    try {
      event = new Resend().webhooks.verify({
        headers,
        payload,
        webhookSecret: secret,
      });
    } catch {
      throw new ApiError(400, "INVALID_WEBHOOK", "Invalid Resend webhook signature.");
    }
    await processResendWebhook({ deliveryId: headers.id, event, rawPayload: payload });
    return apiJson({ received: true });
  });
}
