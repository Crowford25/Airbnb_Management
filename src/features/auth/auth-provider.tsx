"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { authApi } from "./auth-api";
import type { AuthGateway, AuthSession, AuthUser, LoginCredentials } from "./types";

type AuthContextValue = {
  user: AuthUser | null;
  login(credentials: LoginCredentials): Promise<AuthSession>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: React.ReactNode;
  gateway?: AuthGateway;
  initialUser?: AuthUser | null;
};

export function AuthProvider({
  children,
  gateway = authApi,
  initialUser = null,
}: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      async login(credentials) {
        const session = await gateway.login(credentials);
        setUser(session.user);
        return session;
      },
      async logout() {
        await gateway.logout();
        setUser(null);
      },
    }),
    [gateway, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
