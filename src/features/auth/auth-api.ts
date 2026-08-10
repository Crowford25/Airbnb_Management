import { env } from "@/config/env";
import { ApiClient } from "@/services/http/api-client";

import type { AuthGateway, AuthSession, AuthState, LoginCredentials } from "./types";

const client = new ApiClient(env.apiBaseUrl);
const endpoints = env.apiBaseUrl
  ? { login: "/auth/login", logout: "/auth/logout", session: "/auth/session" }
  : {
      login: "/api/auth/login",
      logout: "/api/auth/logout",
      session: "/api/auth/session",
    };

export const authApi: AuthGateway = {
  getSession(): Promise<AuthState> {
    return client.request<AuthState>(endpoints.session, {
      cache: "no-store",
      method: "GET",
    });
  },

  login(credentials: LoginCredentials): Promise<AuthSession> {
    return client.request<AuthSession>(endpoints.login, {
      method: "POST",
      body: credentials,
    });
  },

  async logout(): Promise<void> {
    await client.request<void>(endpoints.logout, {
      method: "POST",
    });
  },
};
