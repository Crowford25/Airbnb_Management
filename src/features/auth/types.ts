export const authRoles = [
  "customer",
  "employee",
  "lead",
  "manager",
  "super_admin",
] as const;

export type AuthRole = (typeof authRoles)[number];

export function isAuthRole(value: unknown): value is AuthRole {
  return authRoles.includes(value as AuthRole);
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthSession = {
  expiresAt: string;
  user: AuthUser;
};

export type AuthState = {
  user: AuthUser | null;
};

export interface AuthGateway {
  getSession(): Promise<AuthState>;
  login(credentials: LoginCredentials): Promise<AuthSession>;
  logout(): Promise<void>;
}
