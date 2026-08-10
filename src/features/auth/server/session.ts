import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { findActiveUserById } from "@/server/db/repositories/users";

import { isAuthRole, type AuthRole, type AuthSession, type AuthUser } from "../types";
import {
  AuthConfigurationError,
  getSessionSecret,
  getSessionTtlSeconds,
} from "./auth-config";

export const sessionCookieName = "aureum_session";

type SessionPayload = {
  email: string;
  exp: number;
  iat: number;
  name: string;
  role: AuthRole;
  sub: string;
  v: 1;
};

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function sessionFromToken(token: string, secret: string): AuthSession | null {
  const [encodedPayload, suppliedSignature] = token.split(".");

  if (!encodedPayload || !suppliedSignature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);

    if (
      payload.v !== 1 ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      !isAuthRole(payload.role) ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.exp <= now
    ) {
      return null;
    }

    return {
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      user: {
        email: payload.email,
        id: payload.sub,
        name: payload.name,
        role: payload.role,
      },
    };
  } catch {
    return null;
  }
}

export async function createSession(user: AuthUser) {
  const secret = getSessionSecret();
  const ttl = getSessionTtlSeconds();
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    email: user.email,
    exp: issuedAt + ttl,
    iat: issuedAt,
    name: user.name,
    role: user.role,
    sub: user.id,
    v: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encodedPayload}.${sign(encodedPayload, secret)}`;
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    maxAge: ttl,
    path: "/",
    priority: "high",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return {
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    user,
  } satisfies AuthSession;
}

export async function getSession() {
  const token = (await cookies()).get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const tokenSession = sessionFromToken(token, getSessionSecret());

    if (!tokenSession) {
      return null;
    }

    const databaseUser = await findActiveUserById(tokenSession.user.id);

    if (!databaseUser) {
      return null;
    }

    return {
      expiresAt: tokenSession.expiresAt,
      user: {
        email: databaseUser.email,
        id: databaseUser.id,
        name: databaseUser.displayName,
        role: databaseUser.role,
      },
    } satisfies AuthSession;
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return null;
    }

    throw error;
  }
}

export async function deleteSession() {
  (await cookies()).delete(sessionCookieName);
}
