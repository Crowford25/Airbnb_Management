import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/features/auth/server/authorization";
import { CustomerFooter } from "@/features/customer/components/customer-footer";
import { CustomerHeader } from "@/features/customer/components/customer-header";
import { PaymentCheckout } from "@/features/customer/components/payment-checkout";
import { findReservationByReference } from "@/server/db/repositories/reservations";
import { isStripeConfigured } from "@/server/payments/config";

export const metadata: Metadata = { title: "Secure payment" };

type PaymentPageProps = { params: Promise<{ reference: string }> };

export default async function PaymentPage({ params }: PaymentPageProps) {
  const { reference } = await params;
  const user = await requireUser(
    `/account/reservations/${encodeURIComponent(reference)}/pay`,
  );
  const reservation = await findReservationByReference(reference);
  if (!reservation) notFound();
  if (reservation.guestUserId !== user.id) redirect("/account?error=forbidden");
  const amount = new Intl.NumberFormat("en-MY", {
    currency: reservation.currency,
    style: "currency",
  }).format(Number(reservation.totalAmount));
  const payable =
    reservation.status === "pending" &&
    (reservation.holdActive || Boolean(reservation.payment));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CustomerHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8 lg:py-20">
        <Link className="text-muted hover:text-gold text-sm transition" href="/account">
          ← Back to account
        </Link>
        <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
          <section className="border-border bg-surface rounded-2xl border p-5 sm:p-7">
            <p className="text-gold text-xs font-semibold tracking-[0.2em] uppercase">
              Stripe secure checkout
            </p>
            <h1 className="mt-3 text-3xl font-semibold">Complete your payment</h1>
            <p className="text-muted mt-3 text-sm leading-6">
              The reservation is confirmed only after Stripe verifies the payment.
            </p>
            <div className="border-border mt-6 border-t pt-6">
              {!isStripeConfigured() ? (
                <p className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200">
                  Stripe test keys are not configured yet. Add them to your local
                  environment before testing payment.
                </p>
              ) : !payable ? (
                <p className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200">
                  This reservation is no longer awaiting payment. Return to your account
                  to review its current status.
                </p>
              ) : (
                <PaymentCheckout bookingReference={reservation.bookingReference} />
              )}
            </div>
          </section>

          <aside className="border-border bg-surface h-fit rounded-2xl border p-5">
            <p className="text-muted text-xs tracking-wide uppercase">Reservation</p>
            <p className="mt-2 font-mono text-xs font-semibold">
              {reservation.bookingReference}
            </p>
            <p className="mt-4 font-semibold">{reservation.propertyName}</p>
            <p className="text-muted mt-2 text-xs">
              {reservation.checkIn} → {reservation.checkOut}
            </p>
            <p className="border-border mt-5 border-t pt-5 text-xl font-semibold">
              {amount}
            </p>
            {reservation.holdExpiresAt ? (
              <p className="text-muted mt-2 text-xs leading-5">
                Hold expires{" "}
                {new Intl.DateTimeFormat("en-MY", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(reservation.holdExpiresAt)}
              </p>
            ) : null}
          </aside>
        </div>
      </main>
      <CustomerFooter />
    </div>
  );
}
