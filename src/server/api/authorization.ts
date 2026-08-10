import "server-only";

import { hasPermission, type Permission } from "@/features/auth/rbac";
import { getSession } from "@/features/auth/server/session";

import { ApiError } from "./errors";
import { setRequestActor } from "./request-context";

export async function requireApiUser() {
  const session = await getSession();

  if (!session) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  }

  setRequestActor(session.user);
  return session.user;
}

export async function requireApiPermission(permission: Permission) {
  const user = await requireApiUser();

  if (!hasPermission(user.role, permission)) {
    throw new ApiError(403, "FORBIDDEN", "Your role cannot perform this action.");
  }

  return user;
}
