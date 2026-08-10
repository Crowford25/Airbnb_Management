import "server-only";

import type { QueryResultRow } from "pg";

import type { AuthRole } from "@/features/auth/types";

import type { DatabaseUser } from "../models";
import { databaseQuery, type TransactionContext } from "../query";

type UserRow = QueryResultRow & {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  role: AuthRole;
  phone: string | null;
  locale: "en" | "zh-CN";
  is_active: boolean;
  last_login_at: Date | null;
};

function mapUser(row: UserRow): DatabaseUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    phone: row.phone,
    locale: row.locale,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
  };
}

export async function findActiveUserByEmail(email: string) {
  const result = await databaseQuery<UserRow>({
    name: "find-active-user-by-email",
    text: `
      SELECT
        id,
        email,
        display_name,
        password_hash,
        role,
        phone,
        locale,
        is_active,
        last_login_at
      FROM aureum.users
      WHERE email = $1
        AND is_active = true
        AND deleted_at IS NULL
      LIMIT 1
    `,
    values: [email.trim().toLowerCase()],
  });

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function findActiveUserById(id: string) {
  const result = await databaseQuery<UserRow>({
    name: "find-active-user-by-id",
    text: `
      SELECT
        id,
        email,
        display_name,
        password_hash,
        role,
        phone,
        locale,
        is_active,
        last_login_at
      FROM aureum.users
      WHERE id = $1
        AND is_active = true
        AND deleted_at IS NULL
      LIMIT 1
    `,
    values: [id],
  });

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function findUserById(id: string) {
  const result = await databaseQuery<UserRow>({
    name: "find-user-by-id",
    text: `
      SELECT
        id,
        email,
        display_name,
        password_hash,
        role,
        phone,
        locale,
        is_active,
        last_login_at
      FROM aureum.users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    values: [id],
  });

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function recordUserLogin(id: string) {
  await databaseQuery({
    name: "record-user-login",
    text: `
      UPDATE aureum.users
      SET last_login_at = now()
      WHERE id = $1
    `,
    values: [id],
  });
}

type UserListRow = QueryResultRow & {
  id: string;
  email: string;
  display_name: string;
  role: AuthRole;
  phone: string | null;
  locale: "en" | "zh-CN";
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
};

export async function listUsers({
  limit,
  offset,
  query,
  role,
}: {
  limit: number;
  offset: number;
  query?: string;
  role?: AuthRole;
}) {
  const result = await databaseQuery<UserListRow>({
    name: "list-users",
    text: `
      SELECT
        id,
        email,
        display_name,
        role,
        phone,
        locale,
        is_active,
        last_login_at,
        created_at
      FROM aureum.users
      WHERE deleted_at IS NULL
        AND ($1::aureum.app_role IS NULL OR role = $1::aureum.app_role)
        AND (
          $2::text IS NULL
          OR email ILIKE '%' || $2 || '%'
          OR display_name ILIKE '%' || $2 || '%'
        )
      ORDER BY created_at DESC, id
      LIMIT $3 OFFSET $4
    `,
    values: [role ?? null, query?.trim() || null, limit, offset],
  });
  const countResult = await databaseQuery<{ total: number }>({
    name: "count-users",
    text: `
      SELECT count(*)::integer AS total
      FROM aureum.users
      WHERE deleted_at IS NULL
        AND ($1::aureum.app_role IS NULL OR role = $1::aureum.app_role)
        AND (
          $2::text IS NULL
          OR email ILIKE '%' || $2 || '%'
          OR display_name ILIKE '%' || $2 || '%'
        )
    `,
    values: [role ?? null, query?.trim() || null],
  });

  return {
    items: result.rows.map((row) => ({
      createdAt: row.created_at.toISOString(),
      displayName: row.display_name,
      email: row.email,
      id: row.id,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at?.toISOString() ?? null,
      locale: row.locale,
      phone: row.phone,
      role: row.role,
    })),
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function updateUserProfile(
  userId: string,
  input: { displayName: string; locale: "en" | "zh-CN"; phone: string | null },
) {
  const result = await databaseQuery<UserRow>({
    name: "update-user-profile",
    text: `
      UPDATE aureum.users
      SET
        display_name = $2,
        phone = $3,
        locale = $4,
        updated_by = $1
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING
        id,
        email,
        display_name,
        password_hash,
        role,
        phone,
        locale,
        is_active,
        last_login_at
    `,
    values: [userId, input.displayName, input.phone, input.locale],
  });

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function updateUserAccess(
  transaction: TransactionContext,
  input: {
    actorId: string;
    isActive: boolean;
    role: AuthRole;
    userId: string;
  },
) {
  const result = await transaction.query<UserRow>({
    name: "update-user-access",
    text: `
      UPDATE aureum.users
      SET
        role = $2,
        is_active = $3,
        updated_by = $4
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING
        id,
        email,
        display_name,
        password_hash,
        role,
        phone,
        locale,
        is_active,
        last_login_at
    `,
    values: [input.userId, input.role, input.isActive, input.actorId],
  });

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}
