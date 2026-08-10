import type { AuthRole } from "./types";

export const permissions = [
  "dashboard:view",
  "properties:view",
  "properties:manage",
  "reservations:view",
  "reservations:manage",
  "customers:view",
  "team:view",
  "team:manage",
  "reports:view",
  "roles:manage",
  "system:manage",
] as const;

export type Permission = (typeof permissions)[number];
export type StaffRole = Exclude<AuthRole, "customer">;

export const roleLabels: Record<AuthRole, string> = {
  customer: "Customer",
  employee: "Employee",
  lead: "Team Lead",
  manager: "Manager",
  super_admin: "Super Admin",
};

const rolePermissions: Record<AuthRole, readonly Permission[]> = {
  customer: [],
  employee: [
    "dashboard:view",
    "properties:view",
    "reservations:view",
    "customers:view",
  ],
  lead: [
    "dashboard:view",
    "properties:view",
    "reservations:view",
    "reservations:manage",
    "customers:view",
    "team:view",
  ],
  manager: [
    "dashboard:view",
    "properties:view",
    "properties:manage",
    "reservations:view",
    "reservations:manage",
    "customers:view",
    "team:view",
    "team:manage",
    "reports:view",
  ],
  super_admin: permissions,
};

export function hasPermission(role: AuthRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function isStaffRole(role: AuthRole): role is StaffRole {
  return role !== "customer";
}

export function permissionsForRole(role: AuthRole) {
  return rolePermissions[role];
}
