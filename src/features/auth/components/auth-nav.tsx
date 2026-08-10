"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "../auth-provider";
import { isStaffRole, roleLabels } from "../rbac";

type AuthNavProps = {
  labels?: {
    signIn: string;
    signOut: string;
    signingOut: string;
  };
};

const defaultLabels = {
  signIn: "Sign in",
  signOut: "Sign out",
  signingOut: "Signing out…",
};

export function AuthNav({ labels = defaultLabels }: AuthNavProps) {
  const router = useRouter();
  const { logout, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) {
    return (
      <Link
        className="border-gold text-gold hover:bg-gold hover:text-background rounded-md border px-4 py-2 text-sm font-medium transition"
        href="/login"
      >
        {labels.signIn}
      </Link>
    );
  }

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
      router.replace("/");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        className="text-muted hover:text-gold hidden text-sm transition sm:inline"
        href={isStaffRole(user.role) ? "/admin" : "/account"}
      >
        {user.name}
      </Link>
      <span className="border-border text-gold hidden rounded-full border px-2 py-1 text-[10px] font-semibold tracking-wider uppercase lg:inline">
        {roleLabels[user.role]}
      </span>
      <button
        className="border-border text-foreground hover:border-gold hover:text-gold rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoggingOut}
        onClick={handleLogout}
        type="button"
      >
        {isLoggingOut ? labels.signingOut : labels.signOut}
      </button>
    </div>
  );
}
