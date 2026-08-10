"use client";

import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Settings,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthNav } from "@/features/auth/components/auth-nav";
import { hasPermission, type Permission } from "@/features/auth/rbac";
import type { AuthRole } from "@/features/auth/types";

const navigation: Array<{
  href: string;
  icon: typeof ClipboardList;
  label: string;
  permission: Permission;
}> = [
  { href: "/admin", icon: BarChart3, label: "Overview", permission: "dashboard:view" },
  {
    href: "/admin/operations",
    icon: ClipboardList,
    label: "Operations",
    permission: "reservations:view",
  },
  {
    href: "/admin/properties",
    icon: Building2,
    label: "Properties",
    permission: "properties:view",
  },
  {
    href: "/admin/reservations",
    icon: CalendarDays,
    label: "Reservations",
    permission: "reservations:view",
  },
  {
    href: "/admin/customers",
    icon: UsersRound,
    label: "Customers",
    permission: "customers:view",
  },
  { href: "/admin/team", icon: UsersRound, label: "Team", permission: "team:view" },
  {
    href: "/admin/reports",
    icon: BarChart3,
    label: "Reports",
    permission: "reports:view",
  },
  {
    href: "/admin/settings",
    icon: Settings,
    label: "System",
    permission: "system:manage",
  },
];

export function AdminNavigation({ role }: { role: AuthRole }) {
  const pathname = usePathname();
  const allowedItems = navigation.filter((item) =>
    hasPermission(role, item.permission),
  );

  return (
    <>
      <nav
        aria-label="Staff navigation"
        className="flex gap-2 overflow-x-auto px-4 py-3 lg:flex-col lg:overflow-visible lg:px-5 lg:py-7"
      >
        {allowedItems.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-gold text-background font-semibold"
                  : "text-muted hover:text-foreground hover:bg-white/5"
              }`}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-border flex items-center justify-between border-t px-4 py-3 lg:hidden">
        <Link className="text-muted hover:text-gold text-xs transition" href="/">
          Customer site
        </Link>
        <AuthNav />
      </div>
      <div className="border-border hidden border-t p-5 lg:block">
        <AuthNav />
      </div>
    </>
  );
}
