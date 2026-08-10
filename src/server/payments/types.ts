import type { PaymentStatus, RefundStatus } from "@/server/db/models";

export type ProviderPaymentIntent = {
  amount: number;
  amountReceived: number;
  clientSecret: string | null;
  createdAt: Date;
  currency: string;
  id: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  livemode: boolean;
  metadata: Record<string, string>;
  paymentMethodType: string | null;
  status: PaymentStatus;
  succeededAt: Date | null;
};

export type ProviderRefund = {
  amount: number;
  createdAt: Date;
  currency: string;
  failureReason: string | null;
  id: string;
  metadata: Record<string, string>;
  paymentIntentId: string | null;
  status: RefundStatus;
};

export type ProviderWebhookEvent = {
  apiVersion: string | null;
  createdAt: Date;
  id: string;
  livemode: boolean;
  paymentIntent?: ProviderPaymentIntent;
  refund?: ProviderRefund;
  type: string;
};

export interface PaymentProvider {
  cancelPaymentIntent(id: string): Promise<ProviderPaymentIntent>;
  createPaymentIntent(
    input: {
      amount: number;
      bookingReference: string;
      currency: string;
      customerEmail: string;
      reservationId: string;
    },
    idempotencyKey: string,
  ): Promise<ProviderPaymentIntent>;
  createRefund(
    input: {
      amount: number;
      paymentIntentId: string;
      reason: string;
      reservationId: string;
    },
    idempotencyKey: string,
  ): Promise<ProviderRefund>;
  retrievePaymentIntent(id: string): Promise<ProviderPaymentIntent>;
  verifyWebhook(payload: string, signature: string): ProviderWebhookEvent;
}
