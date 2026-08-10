import type { Metadata } from "next";
import Link from "next/link";

import { roleLabels } from "@/features/auth/rbac";
import { requireUser } from "@/features/auth/server/authorization";
import { CustomerFooter } from "@/features/customer/components/customer-footer";
import { CustomerHeader } from "@/features/customer/components/customer-header";
import { AccountReservations } from "@/features/customer/components/account-reservations";
import { listReservations } from "@/server/db/repositories/reservations";

export const metadata: Metadata = {
  title: "My account",
};

type AccountPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    payment?: string | string[];
    reference?: string | string[];
  }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const user = await requireUser("/account");
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const payment = Array.isArray(query.payment) ? query.payment[0] : query.payment;
  const paymentReference = Array.isArray(query.reference)
    ? query.reference[0]
    : query.reference;
  const reservations = await listReservations({
    guestUserId: user.id,
    limit: 50,
    offset: 0,
  });

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CustomerHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
        <p className="text-gold text-xs font-semibold tracking-[0.24em] uppercase">
          Protected customer area
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Welcome, {user.name}.
        </h1>
        <p className="text-muted mt-4 max-w-2xl leading-7">
          Review your profile and live PostgreSQL reservation history in one place.
        </p>

        {error === "forbidden" ? (
          <p className="mt-8 rounded-xl border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
            Your account does not have permission to open the administrator area.
          </p>
        ) : null}

        {payment === "processing" ? (
          <p className="mt-8 rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
            Payment submitted{paymentReference ? ` for ${paymentReference}` : ""}.
            Stripe is verifying it; this page will show the confirmed reservation after
            the signed webhook arrives.
          </p>
        ) : null}

        <dl className="border-border bg-surface mt-10 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-3">
          {[
            ["Name", user.name],
            ["Email", user.email],
            ["Role", roleLabels[user.role]],
          ].map(([label, value]) => (
            <div className="bg-background p-5" key={label}>
              <dt className="text-muted text-xs tracking-wider uppercase">{label}</dt>
              <dd className="mt-2 text-sm font-medium capitalize">{value}</dd>
            </div>
          ))}
        </dl>

        <AccountReservations
          initialReservations={reservations.items.map((reservation) => ({
            bookingReference: reservation.bookingReference,
            checkIn: reservation.checkIn,
            checkOut: reservation.checkOut,
            currency: reservation.currency,
            holdActive: reservation.holdActive,
            holdExpiresAt: reservation.holdExpiresAt?.toISOString() ?? null,
            propertyName: reservation.propertyName,
            propertySlug: reservation.propertySlug,
            payment: reservation.payment
              ? {
                  amountReceived: reservation.payment.amountReceived,
                  amountRefunded: reservation.payment.amountRefunded,
                  status: reservation.payment.status,
                }
              : null,
            roomsCount: reservation.roomsCount,
            items: reservation.items.map((item) => ({
              quantity: item.quantity,
              roomName: item.roomName,
            })),
            status: reservation.status,
            totalAmount: reservation.totalAmount,
          }))}
        />

        <Link
          className="border-gold text-gold hover:bg-gold hover:text-background mt-10 inline-flex rounded-lg border px-5 py-3 text-sm font-semibold transition"
          href="/properties"
        >
          Browse available stays
        </Link>
      </main>
      <CustomerFooter />
    </div>
  );
}
