import type { AuthRole, AuthUser } from "../types";

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export type ConfiguredUser = AuthUser & {
  passwordHash: string;
};

type UserPrefix = "CUSTOMER" | "EMPLOYEE" | "LEAD" | "MANAGER" | "SUPER_ADMIN";

function configuredUser(prefix: UserPrefix, id: string, role: AuthRole) {
  const email = process.env[`AUTH_${prefix}_EMAIL`]?.trim().toLowerCase();
  const name = process.env[`AUTH_${prefix}_NAME`]?.trim();
  const passwordHash = process.env[`AUTH_${prefix}_PASSWORD_HASH`]?.trim();

  if (!email || !name || !passwordHash) {
    return null;
  }

  return { email, id, name, passwordHash, role } satisfies ConfiguredUser;
}

export function getConfiguredUsers() {
  const users = [
    configuredUser("CUSTOMER", "customer-local", "customer"),
    configuredUser("EMPLOYEE", "employee-local", "employee"),
    configuredUser("LEAD", "lead-local", "lead"),
    configuredUser("MANAGER", "manager-local", "manager"),
    configuredUser("SUPER_ADMIN", "super-admin-local", "super_admin"),
  ].filter((user): user is ConfiguredUser => user !== null);

  if (users.length === 0) {
    throw new AuthConfigurationError(
      "No authentication users are configured on the server.",
    );
  }

  return users;
}

export function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new AuthConfigurationError(
      "AUTH_SESSION_SECRET must contain at least 32 characters.",
    );
  }

  return secret;
}

export function getSessionTtlSeconds() {
  const requestedTtl = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 28_800);

  if (!Number.isInteger(requestedTtl)) {
    return 28_800;
  }

  return Math.min(Math.max(requestedTtl, 900), 604_800);
}
