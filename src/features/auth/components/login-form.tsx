"use client";

import { ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiError } from "@/services/http/api-client";

import { useAuth } from "../auth-provider";
import { isStaffRole } from "../rbac";
import { safeNextPath } from "../safe-next-path";
import type { AuthRole } from "../types";

type DemoAccount = {
  email: string;
  label: string;
  password: string;
  role: AuthRole;
};

type LoginFormProps = {
  demoAccounts?: DemoAccount[];
  nextPath?: string | null;
};

export function LoginForm({ demoAccounts = [], nextPath }: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const session = await login({ email: email.trim(), password });
      const roleHome = isStaffRole(session.user.role) ? "/admin" : "/account";
      router.replace(safeNextPath(nextPath) ?? roleHome);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "We could not reach the authentication service. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function fillDemoAccount(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <section className="border-border bg-surface w-full max-w-lg rounded-xl border p-8 shadow-2xl shadow-black/30 sm:p-10">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-gold text-sm font-medium tracking-[0.2em] uppercase">
              Aureum Stays
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-muted mt-2 text-sm leading-6">
              Sign in to manage your stays and reservations.
            </p>
          </div>
          <span className="bg-gold/10 text-gold grid size-11 shrink-0 place-items-center rounded-full">
            <ShieldCheck aria-hidden="true" size={21} />
          </span>
        </div>

        {demoAccounts.length > 0 ? (
          <div className="border-border bg-background/50 mt-7 rounded-xl border p-4">
            <p className="text-muted text-xs font-semibold tracking-wider uppercase">
              Local demo accounts
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {demoAccounts.map((account) => (
                <button
                  className="border-border hover:border-gold hover:text-gold flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition"
                  key={account.role}
                  onClick={() => fillDemoAccount(account)}
                  type="button"
                >
                  <UserRound aria-hidden="true" size={16} />
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm font-medium" htmlFor="email">
            <span>Email address</span>
            <input
              autoComplete="email"
              className="border-border bg-background text-foreground placeholder:text-muted focus:border-gold focus:ring-gold/20 w-full rounded-md border px-3 py-2.5 transition outline-none focus:ring-2"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </label>
          <label className="block space-y-2 text-sm font-medium" htmlFor="password">
            <span>Password</span>
            <input
              autoComplete="current-password"
              className="border-border bg-background text-foreground placeholder:text-muted focus:border-gold focus:ring-gold/20 w-full rounded-md border px-3 py-2.5 transition outline-none focus:ring-2"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p
              aria-live="polite"
              className="rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}

          <button
            className="bg-gold text-background hover:bg-gold-light w-full rounded-md px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in…" : "Sign in securely"}
          </button>
        </form>

        <Link
          className="text-muted hover:text-gold mt-6 inline-block text-sm transition"
          href="/"
        >
          ← Return to home
        </Link>
      </section>
    </main>
  );
}
