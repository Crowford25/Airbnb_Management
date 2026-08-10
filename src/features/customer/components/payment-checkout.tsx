"use client";

import {
  PaymentElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PaymentSetup = {
  clientSecret: string;
  publishableKey: string;
};

type PaymentSetupResponse = Partial<PaymentSetup> & {
  completed?: boolean;
  error?: { message?: string };
  message?: string;
  reservationStatus?: string;
};

export function PaymentCheckout({ bookingReference }: { bookingReference: string }) {
  const router = useRouter();
  const requested = useRef(false);
  const [setup, setSetup] = useState<PaymentSetup | null>(null);
  const [error, setError] = useState("");
  const stripePromise = useMemo(
    () => (setup ? loadStripe(setup.publishableKey) : null),
    [setup],
  );

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void fetch(
      `/api/reservations/${encodeURIComponent(bookingReference)}/payment-intent`,
      { method: "POST" },
    )
      .then(async (response) => {
        const body = (await response.json()) as PaymentSetupResponse;
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? body.message ?? "Payment setup failed.",
          );
        }
        if (body.completed) {
          const paymentState =
            body.reservationStatus === "confirmed" ? "succeeded" : "review";
          router.replace(
            `/account?payment=${paymentState}&reference=${encodeURIComponent(bookingReference)}`,
          );
          router.refresh();
          return;
        }
        if (!body.clientSecret || !body.publishableKey) {
          throw new Error("Stripe did not return a usable payment session.");
        }
        setSetup({
          clientSecret: body.clientSecret,
          publishableKey: body.publishableKey,
        });
      })
      .catch((caughtError: unknown) => {
        setError(
          caughtError instanceof Error ? caughtError.message : "Payment setup failed.",
        );
      });
  }, [bookingReference, router]);

  if (error) {
    return (
      <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-200">
        {error}
      </p>
    );
  }
  if (!setup) {
    return <p className="text-muted py-8 text-sm">Preparing secure payment…</p>;
  }

  const options: StripeElementsOptions = {
    appearance: {
      theme: "night",
      variables: {
        borderRadius: "10px",
        colorBackground: "#141414",
        colorDanger: "#fca5a5",
        colorPrimary: "#c6a15b",
        colorText: "#f8f6f0",
        colorTextSecondary: "#a3a3a3",
        fontFamily: "Arial, Helvetica, sans-serif",
      },
    },
    clientSecret: setup.clientSecret,
    loader: "auto",
  };

  return (
    <Elements options={options} stripe={stripePromise}>
      <CheckoutForm bookingReference={bookingReference} />
    </Elements>
  );
}

function CheckoutForm({ bookingReference }: { bookingReference: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      const result = await stripe.confirmPayment({
        confirmParams: {
          return_url: `${window.location.origin}/account/reservations/${encodeURIComponent(bookingReference)}/pay?payment_return=1`,
        },
        elements,
        redirect: "if_required",
      });
      if (result.error) {
        setMessage(result.error.message ?? "Payment could not be completed.");
        setIsSubmitting(false);
        return;
      }
      const syncResponse = await fetch(
        `/api/reservations/${encodeURIComponent(bookingReference)}/payment-intent`,
        { method: "POST" },
      );
      const syncBody = (await syncResponse.json()) as PaymentSetupResponse;
      const paymentState =
        syncResponse.ok &&
        syncBody.completed &&
        syncBody.reservationStatus === "confirmed"
          ? "succeeded"
          : "processing";
      router.push(
        `/account?payment=${paymentState}&reference=${encodeURIComponent(bookingReference)}`,
      );
      router.refresh();
    } catch (caughtError: unknown) {
      setMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Payment could not be completed. Please try again.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <PaymentElement
        onLoadError={({ error }) => {
          setIsPaymentElementReady(false);
          setMessage(
            error.message
              ? `Secure payment form could not load: ${error.message}`
              : "Secure payment form could not load. Refresh and try again.",
          );
        }}
        onReady={() => {
          setIsPaymentElementReady(true);
          setMessage("");
        }}
        options={{ layout: "tabs" }}
      />
      <button
        className="bg-gold text-background hover:bg-gold-light mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!stripe || !elements || !isPaymentElementReady || isSubmitting}
        type="submit"
      >
        <ShieldCheck aria-hidden="true" size={18} />
        {isSubmitting ? "Processing payment…" : "Pay securely"}
      </button>
      <p className="text-muted mt-3 text-center text-xs">
        Payment details are encrypted and handled by Stripe.
      </p>
      {message ? (
        <p aria-live="polite" className="mt-4 text-sm text-red-300">
          {message}
        </p>
      ) : null}
    </form>
  );
}
