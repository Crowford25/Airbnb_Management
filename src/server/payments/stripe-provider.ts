import "server-only";

import Stripe from "stripe";

import type { PaymentStatus, RefundStatus } from "@/server/db/models";

import { stripeKeys, stripeWebhookSecret } from "./config";
import type {
  PaymentProvider,
  ProviderPaymentIntent,
  ProviderRefund,
  ProviderWebhookEvent,
} from "./types";

let stripeClient: Stripe | null = null;

const smokeTestSecretKey = "sk_test_aureum_payment_smoke_key_not_for_provider_requests";

function stripeClientConfig(secretKey: string): Stripe.StripeConfig {
  const config: Stripe.StripeConfig = {
    appInfo: { name: "Aureum Stays", version: "0.1.0" },
    maxNetworkRetries: 2,
  };
  const testApiBase = process.env.STRIPE_TEST_API_BASE_URL?.trim();
  if (!testApiBase) return config;
  if (secretKey !== smokeTestSecretKey) {
    throw new Error(
      "STRIPE_TEST_API_BASE_URL requires the isolated payment smoke-test key.",
    );
  }
  const url = new URL(testApiBase);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/"
  ) {
    throw new Error("STRIPE_TEST_API_BASE_URL must be a loopback HTTP origin.");
  }
  return {
    ...config,
    host: url.hostname,
    port: url.port || 80,
    protocol: "http",
  };
}

function stripe() {
  const { secretKey } = stripeKeys();
  stripeClient ??= new Stripe(secretKey, stripeClientConfig(secretKey));
  return stripeClient;
}

function paymentStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
  return status === "canceled" ? "cancelled" : status;
}

function refundStatus(status: Stripe.Refund["status"]): RefundStatus {
  if (status === "canceled") return "cancelled";
  if (status === "failed") return "failed";
  if (status === "requires_action") return "requires_action";
  if (status === "succeeded") return "succeeded";
  return "pending";
}

function paymentMethodType(intent: Stripe.PaymentIntent) {
  if (typeof intent.payment_method === "object" && intent.payment_method) {
    return intent.payment_method.type;
  }
  return intent.payment_method_types[0] ?? null;
}

function mapPaymentIntent(
  intent: Stripe.PaymentIntent,
  succeededEventAt: Date | null = null,
): ProviderPaymentIntent {
  const latestCharge =
    typeof intent.latest_charge === "object" && intent.latest_charge
      ? intent.latest_charge
      : null;
  return {
    amount: intent.amount,
    amountReceived: intent.amount_received,
    clientSecret: intent.client_secret,
    createdAt: new Date(intent.created * 1_000),
    currency: intent.currency.toUpperCase(),
    id: intent.id,
    lastErrorCode: intent.last_payment_error?.code ?? null,
    lastErrorMessage: intent.last_payment_error?.message ?? null,
    livemode: intent.livemode,
    metadata: intent.metadata,
    paymentMethodType: paymentMethodType(intent),
    status: paymentStatus(intent.status),
    succeededAt:
      intent.status === "succeeded"
        ? latestCharge && "created" in latestCharge
          ? new Date(latestCharge.created * 1_000)
          : succeededEventAt
        : null,
  };
}

function mapRefund(refund: Stripe.Refund): ProviderRefund {
  return {
    amount: refund.amount,
    createdAt: new Date(refund.created * 1_000),
    currency: refund.currency.toUpperCase(),
    failureReason: refund.failure_reason ?? null,
    id: refund.id,
    metadata: refund.metadata ?? {},
    paymentIntentId:
      typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : (refund.payment_intent?.id ?? null),
    status: refundStatus(refund.status),
  };
}

export class StripePaymentProvider implements PaymentProvider {
  async cancelPaymentIntent(id: string) {
    return mapPaymentIntent(await stripe().paymentIntents.cancel(id));
  }

  async createPaymentIntent(
    input: {
      amount: number;
      bookingReference: string;
      currency: string;
      customerEmail: string;
      reservationId: string;
    },
    idempotencyKey: string,
  ) {
    const intent = await stripe().paymentIntents.create(
      {
        amount: input.amount,
        automatic_payment_methods: { enabled: true },
        currency: input.currency.toLowerCase(),
        description: `Aureum Stays reservation ${input.bookingReference}`,
        metadata: {
          bookingReference: input.bookingReference,
          reservationId: input.reservationId,
        },
        receipt_email: input.customerEmail,
      },
      { idempotencyKey },
    );
    return mapPaymentIntent(intent);
  }

  async createRefund(
    input: {
      amount: number;
      paymentIntentId: string;
      reason: string;
      reservationId: string;
    },
    idempotencyKey: string,
  ) {
    const refund = await stripe().refunds.create(
      {
        amount: input.amount,
        metadata: {
          internalReason: input.reason.slice(0, 400),
          reservationId: input.reservationId,
        },
        payment_intent: input.paymentIntentId,
        reason: "requested_by_customer",
      },
      { idempotencyKey },
    );
    return mapRefund(refund);
  }

  async retrievePaymentIntent(id: string) {
    return mapPaymentIntent(
      await stripe().paymentIntents.retrieve(id, { expand: ["latest_charge"] }),
    );
  }

  verifyWebhook(payload: string, signature: string): ProviderWebhookEvent {
    const event = stripe().webhooks.constructEvent(
      payload,
      signature,
      stripeWebhookSecret(),
    );
    const object = event.data.object;
    return {
      apiVersion: event.api_version ?? null,
      createdAt: new Date(event.created * 1_000),
      id: event.id,
      livemode: event.livemode,
      paymentIntent:
        object.object === "payment_intent"
          ? mapPaymentIntent(
              object as Stripe.PaymentIntent,
              event.type === "payment_intent.succeeded"
                ? new Date(event.created * 1_000)
                : null,
            )
          : undefined,
      refund:
        object.object === "refund" ? mapRefund(object as Stripe.Refund) : undefined,
      type: event.type,
    };
  }
}
