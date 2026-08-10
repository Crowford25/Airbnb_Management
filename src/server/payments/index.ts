import "server-only";

import { StripePaymentProvider } from "./stripe-provider";
import type { PaymentProvider } from "./types";

let provider: PaymentProvider | null = null;

export function getPaymentProvider() {
  provider ??= new StripePaymentProvider();
  return provider;
}
