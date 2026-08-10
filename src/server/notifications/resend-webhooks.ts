import "server-only";

import { createHash } from "node:crypto";

import type { WebhookEventPayload } from "resend";

import {
  completeEmailProviderWebhookEvent,
  registerEmailProviderWebhookEvent,
  updateNotificationProviderDelivery,
} from "@/server/db/repositories/notifications";
import { withDatabaseTransaction } from "@/server/db/query";

type ResendEmailEvent = Extract<WebhookEventPayload, { data: { email_id: string } }>;

function emailEvent(event: WebhookEventPayload): ResendEmailEvent | null {
  return typeof event.type === "string" &&
    event.type.startsWith("email.") &&
    "email_id" in event.data
    ? (event as ResendEmailEvent)
    : null;
}

function providerDeliveryStatus(eventType: string) {
  const statuses: Record<string, string> = {
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.failed": "failed",
    "email.sent": "sent",
    "email.suppressed": "suppressed",
  };
  return statuses[eventType] ?? null;
}

function providerDetail(event: ResendEmailEvent) {
  const data = event.data as ResendEmailEvent["data"] & {
    bounce?: { message?: string };
    failed?: { reason?: string };
    suppressed?: { message?: string };
  };
  const detail =
    data.bounce?.message?.slice(0, 500) ??
    data.failed?.reason?.slice(0, 500) ??
    data.suppressed?.message?.slice(0, 500) ??
    null;
  return detail?.replace(/\b[^\s@]+@[^\s@]+\b/g, "[email redacted]") ?? null;
}

export async function processResendWebhook(input: {
  deliveryId: string;
  event: WebhookEventPayload;
  rawPayload: string;
}) {
  const matchedEmailEvent = emailEvent(input.event);
  const payloadHash = createHash("sha256").update(input.rawPayload).digest("hex");
  const eventCreatedAt = new Date(input.event.created_at);
  const safeEventCreatedAt = Number.isNaN(eventCreatedAt.getTime())
    ? null
    : eventCreatedAt;

  await withDatabaseTransaction(async (transaction) => {
    const registration = await registerEmailProviderWebhookEvent(transaction, {
      deliveryId: input.deliveryId,
      emailId: matchedEmailEvent?.data.email_id ?? null,
      eventCreatedAt: safeEventCreatedAt,
      eventType: input.event.type,
      payloadHash,
    });
    if (["processed", "ignored"].includes(registration)) return;

    const deliveryStatus = providerDeliveryStatus(input.event.type);
    const updated =
      matchedEmailEvent && deliveryStatus
        ? await updateNotificationProviderDelivery(transaction, {
            detail: providerDetail(matchedEmailEvent),
            emailId: matchedEmailEvent.data.email_id,
            eventAt: safeEventCreatedAt,
            eventType: input.event.type,
            status: deliveryStatus,
          })
        : false;
    await completeEmailProviderWebhookEvent(transaction, input.deliveryId, !updated);
  });
}
