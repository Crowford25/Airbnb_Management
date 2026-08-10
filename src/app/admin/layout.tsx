import Link from "next/link";

import { AdminNavigation } from "@/features/admin/components/admin-navigation";
import { roleLabels } from "@/features/auth/rbac";
import { requirePermission } from "@/features/auth/server/authorization";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("dashboard:view", "/admin");

  return (
    <div className="bg-background min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="border-border bg-surface/80 border-b lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
        <div className="border-border flex h-20 items-center justify-between border-b px-5">
          <Link className="flex items-center gap-3" href="/admin">
            <span className="border-gold text-gold grid size-9 place-items-center rounded-full border text-sm">
              A
            </span>
            <span>
              <span className="block text-xs font-semibold tracking-[0.2em] uppercase">
                Aureum
              </span>
              <span className="text-muted block text-[10px] tracking-[0.16em] uppercase">
                Staff Console
              </span>
            </span>
          </Link>
          <span className="border-gold/30 bg-gold/10 text-gold rounded-full border px-2.5 py-1 text-[10px] font-semibold lg:hidden">
            {roleLabels[user.role]}
          </span>
        </div>
        <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:justify-between">
          <AdminNavigation role={user.role} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="border-border bg-background/90 sticky top-0 z-20 hidden h-20 items-center justify-between border-b px-8 backdrop-blur-xl lg:flex">
          <div>
            <p className="text-muted text-xs tracking-[0.16em] uppercase">
              Operational workspace
            </p>
            <p className="mt-1 text-sm">{user.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="border-gold/30 bg-gold/10 text-gold rounded-full border px-3 py-1.5 text-xs font-semibold">
              {roleLabels[user.role]}
            </span>
            <Link className="text-muted hover:text-gold text-sm transition" href="/">
              Customer site
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
