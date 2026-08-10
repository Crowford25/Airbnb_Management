import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/login-form";
import { isStaffRole } from "@/features/auth/rbac";
import { safeNextPath } from "@/features/auth/safe-next-path";
import { getSession } from "@/features/auth/server/session";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

const demoAccounts = [
  {
    email: "customer@aureumstays.test",
    label: "Use customer account",
    password: "Customer123!",
    role: "customer" as const,
  },
  {
    email: "employee@aureumstays.test",
    label: "Use employee account",
    password: "Employee123!",
    role: "employee" as const,
  },
  {
    email: "lead@aureumstays.test",
    label: "Use lead account",
    password: "Lead123!",
    role: "lead" as const,
  },
  {
    email: "manager@aureumstays.test",
    label: "Use manager account",
    password: "Manager123!",
    role: "manager" as const,
  },
  {
    email: "admin@aureumstays.test",
    label: "Use super admin account",
    password: "Admin123!",
    role: "super_admin" as const,
  },
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  const query = await searchParams;
  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const nextPath = safeNextPath(requestedNext);

  if (session) {
    redirect(nextPath ?? (isStaffRole(session.user.role) ? "/admin" : "/account"));
  }

  return (
    <LoginForm
      demoAccounts={process.env.NODE_ENV === "development" ? demoAccounts : []}
      nextPath={nextPath}
    />
  );
}
