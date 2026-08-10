"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { StaffAdminRecord } from "@/server/db/repositories/admin";

const staffRoles = ["employee", "lead", "manager", "super_admin"] as const;

async function responseMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return body?.error?.message ?? body?.message ?? "The access record was not updated.";
}

export function UserAccessControl({
  canManageRoles,
  canManageTeam,
  currentUserId,
  staff,
}: {
  canManageRoles: boolean;
  canManageTeam: boolean;
  currentUserId: string;
  staff: StaffAdminRecord;
}) {
  const router = useRouter();
  const [role, setRole] = useState(staff.role);
  const [isActive, setIsActive] = useState(staff.isActive);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const isSelf = currentUserId === staff.id;
  const managerCanEdit = canManageTeam && ["employee", "lead"].includes(staff.role);
  const canEdit = !isSelf && (canManageRoles || managerCanEdit);
  const changed = role !== staff.role || isActive !== staff.isActive;

  async function save() {
    setIsSaving(true);
    setMessage("");
    const response = await fetch(`/api/users/${staff.id}`, {
      body: JSON.stringify({
        isActive,
        ...(canManageRoles ? { role } : {}),
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      setMessage(await responseMessage(response));
    } else {
      setMessage("Saved");
      router.refresh();
    }
    setIsSaving(false);
  }

  if (!canEdit) {
    return (
      <span className="text-muted text-xs">
        {isSelf ? "Current session" : "Read only"}
      </span>
    );
  }

  return (
    <div className="grid min-w-52 gap-2">
      {canManageRoles ? (
        <select
          aria-label={`Role for ${staff.displayName}`}
          className="border-border bg-background focus:border-gold rounded-lg border px-3 py-2 text-xs outline-none"
          disabled={isSaving}
          onChange={(event) => setRole(event.target.value as StaffAdminRecord["role"])}
          value={role}
        >
          {staffRoles.map((option) => (
            <option key={option} value={option}>
              {option === "super_admin"
                ? "Super Admin"
                : option === "lead"
                  ? "Team Lead"
                  : option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      ) : null}
      <label className="text-muted flex items-center gap-2 text-xs">
        <input
          checked={isActive}
          className="accent-gold size-4"
          disabled={isSaving}
          onChange={(event) => setIsActive(event.target.checked)}
          type="checkbox"
        />
        Account active
      </label>
      <div className="flex items-center gap-2">
        <button
          className="border-gold/50 text-gold hover:bg-gold/10 rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!changed || isSaving}
          onClick={save}
          type="button"
        >
          {isSaving ? "Saving…" : "Save access"}
        </button>
        <span
          aria-live="polite"
          className={`text-[10px] ${message === "Saved" ? "text-emerald-400" : "text-red-300"}`}
        >
          {message}
        </span>
      </div>
    </div>
  );
}
