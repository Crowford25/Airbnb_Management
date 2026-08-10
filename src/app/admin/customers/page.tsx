import type { Metadata } from "next";

import { PageHeader } from "@/features/admin/components/page-header";
import { formatCurrency, formatDateTime } from "@/features/admin/format";
import { requirePermission } from "@/features/auth/server/authorization";
import { listCustomerAdminRecords } from "@/server/db/repositories/admin";

export const metadata: Metadata = { title: "Customer records" };

type CustomerPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function AdminCustomersPage({ searchParams }: CustomerPageProps) {
  await requirePermission("customers:view", "/admin/customers");
  const [customers, query] = await Promise.all([
    listCustomerAdminRecords(200),
    searchParams,
  ]);
  const rawSearch = Array.isArray(query.q) ? query.q[0] : query.q;
  const search = rawSearch?.trim().toLowerCase() ?? "";
  const filtered = search
    ? customers.filter(
        (customer) =>
          customer.displayName.toLowerCase().includes(search) ||
          customer.email.toLowerCase().includes(search),
      )
    : customers;

  return (
    <>
      <PageHeader
        actions={
          <form className="flex w-full max-w-sm gap-2 sm:w-auto" role="search">
            <input
              className="border-border bg-surface focus:border-gold min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm outline-none sm:w-64"
              defaultValue={rawSearch}
              name="q"
              placeholder="Search name or email"
              type="search"
            />
            <button
              className="border-gold text-gold rounded-lg border px-4 py-2.5 text-sm font-semibold"
              type="submit"
            >
              Search
            </button>
          </form>
        }
        description="A privacy-aware directory of registered guests, their booking count, confirmed spend and account activity."
        eyebrow="Guest relationships"
        title="Customer records"
      />

      <section className="border-border bg-surface mt-8 overflow-hidden rounded-2xl border">
        <div className="border-border flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <p className="text-sm font-semibold">Registered customers</p>
          <p className="text-muted text-xs">
            {filtered.length} {search ? "matches" : "customers"}
          </p>
        </div>
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="text-muted bg-background/60 text-[11px] tracking-wide uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium sm:px-6">Customer</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Reservations</th>
                  <th className="px-4 py-3 font-medium">Confirmed spend</th>
                  <th className="px-5 py-3 font-medium sm:px-6">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {filtered.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-5 py-4 sm:px-6">
                      <p className="font-semibold">{customer.displayName}</p>
                      <p className="text-muted mt-1 text-xs">{customer.email}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          customer.isActive
                            ? "border-emerald-900/70 bg-emerald-950/40 text-emerald-300"
                            : "border-red-900/70 bg-red-950/40 text-red-300"
                        }`}
                      >
                        {customer.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-semibold">{customer.reservations}</td>
                    <td className="px-4 py-4 font-semibold">
                      {formatCurrency(customer.totalSpend)}
                    </td>
                    <td className="text-muted px-5 py-4 text-xs sm:px-6">
                      {formatDateTime(customer.lastLoginAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">No matching customers</p>
            <p className="text-muted mt-2 text-sm">Try a different name or email.</p>
          </div>
        )}
      </section>
    </>
  );
}
