import type { Metadata } from "next";

import { PageHeader } from "@/features/admin/components/page-header";
import { UserAccessControl } from "@/features/admin/components/user-access-control";
import { formatDateTime } from "@/features/admin/format";
import { hasPermission, roleLabels } from "@/features/auth/rbac";
import { requirePermission } from "@/features/auth/server/authorization";
import { listStaffAdminRecords } from "@/server/db/repositories/admin";

export const metadata: Metadata = { title: "Team access" };

export default async function AdminTeamPage() {
  const user = await requirePermission("team:view", "/admin/team");
  const staff = await listStaffAdminRecords();
  const canManageTeam = hasPermission(user.role, "team:manage");
  const canManageRoles = hasPermission(user.role, "roles:manage");

  return (
    <>
      <PageHeader
        description="Team leads can review staff access, managers can enable or disable employee and lead accounts, and Super Admins can assign every staff role."
        eyebrow={
          canManageRoles
            ? "Full role authority"
            : canManageTeam
              ? "Manager controls"
              : "Read-only team view"
        }
        title="Team and access"
      />

      <section className="border-border bg-surface mt-8 overflow-hidden rounded-2xl border">
        <div className="border-border flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <p className="text-sm font-semibold">Staff directory</p>
          <p className="text-muted text-xs">{staff.length} staff accounts</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="text-muted bg-background/60 text-[11px] tracking-wide uppercase">
              <tr>
                <th className="px-5 py-3 font-medium sm:px-6">Staff member</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-5 py-3 font-medium sm:px-6">Access control</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {staff.map((member) => (
                <tr className="align-top" key={member.id}>
                  <td className="px-5 py-4 sm:px-6">
                    <p className="font-semibold">{member.displayName}</p>
                    <p className="text-muted mt-1 text-xs">{member.email}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="border-gold/30 bg-gold/10 text-gold rounded-full border px-2.5 py-1 text-[11px] font-semibold">
                      {roleLabels[member.role]}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        member.isActive
                          ? "border-emerald-900/70 bg-emerald-950/40 text-emerald-300"
                          : "border-red-900/70 bg-red-950/40 text-red-300"
                      }`}
                    >
                      {member.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="text-muted px-4 py-4 text-xs">
                    {formatDateTime(member.lastLoginAt)}
                  </td>
                  <td className="px-5 py-4 sm:px-6">
                    <UserAccessControl
                      canManageRoles={canManageRoles}
                      canManageTeam={canManageTeam}
                      currentUserId={user.id}
                      staff={member}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
