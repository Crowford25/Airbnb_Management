import "server-only";

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

function configuredValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value.endsWith("_replace")) return null;
  return value;
}

export function isStripeConfigured() {
  return Boolean(
    configuredValue("STRIPE_SECRET_KEY") &&
    configuredValue("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") &&
    configuredValue("STRIPE_WEBHOOK_SECRET"),
  );
}

export function stripeKeys() {
  const secretKey = configuredValue("STRIPE_SECRET_KEY");
  const publishableKey = configuredValue("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  if (!secretKey || !publishableKey) {
    throw new PaymentConfigurationError(
      "Stripe test keys are not configured. Add them to .env.local to accept payments.",
    );
  }
  const secretMode = secretKey.startsWith("sk_live_") ? "live" : "test";
  const publishableMode = publishableKey.startsWith("pk_live_") ? "live" : "test";
  if (
    !secretKey.startsWith(`sk_${secretMode}_`) ||
    !publishableKey.startsWith(`pk_${publishableMode}_`) ||
    secretMode !== publishableMode
  ) {
    throw new PaymentConfigurationError(
      "Stripe publishable and secret keys must be valid and use the same mode.",
    );
  }
  if (process.env.NODE_ENV !== "production" && secretMode === "live") {
    throw new PaymentConfigurationError(
      "Live Stripe keys are disabled outside the production environment.",
    );
  }
  return { publishableKey, secretKey };
}

export function stripeWebhookSecret() {
  const secret = configuredValue("STRIPE_WEBHOOK_SECRET");
  if (!secret?.startsWith("whsec_")) {
    throw new PaymentConfigurationError(
      "The Stripe webhook signing secret is not configured.",
    );
  }
  return secret;
}
