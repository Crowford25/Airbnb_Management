"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { UnitBlockReason, UnitStatus } from "@/server/db/models";
import type { InternalRoom } from "@/server/db/repositories/inventory";

async function responseMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return body?.error?.message ?? body?.message ?? "The action could not be completed.";
}

const fieldClass =
  "border-border bg-background text-foreground focus:border-gold rounded-lg border px-3 py-2.5 text-sm outline-none transition";

export function RoomStatusControl({
  initialStatus,
  propertySlug,
  roomId,
}: {
  initialStatus: UnitStatus;
  propertySlug: string;
  roomId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function updateStatus(nextStatus: UnitStatus) {
    const previousStatus = status;
    setStatus(nextStatus);
    setIsSaving(true);
    setMessage("");
    const response = await fetch(
      `/api/properties/${encodeURIComponent(propertySlug)}/rooms/${roomId}`,
      {
        body: JSON.stringify({ status: nextStatus }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );
    if (!response.ok) {
      setStatus(previousStatus);
      setMessage(await responseMessage(response));
    } else {
      setMessage("Saved");
      router.refresh();
    }
    setIsSaving(false);
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <select
        aria-label="Room operational status"
        className={`${fieldClass} min-w-40`}
        disabled={isSaving}
        onChange={(event) => updateStatus(event.target.value as UnitStatus)}
        value={status}
      >
        <option value="operational">Operational</option>
        <option value="maintenance">Maintenance</option>
        <option value="out_of_service">Out of service</option>
        <option value="retired">Retired</option>
      </select>
      <span
        aria-live="polite"
        className={`text-[11px] ${message === "Saved" ? "text-emerald-400" : "text-red-300"}`}
      >
        {isSaving ? "Saving…" : message}
      </span>
    </div>
  );
}

export function RoomBlockForm({
  minimumDate,
  propertySlug,
  rooms,
}: {
  minimumDate: string;
  propertySlug: string;
  rooms: InternalRoom[];
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submitBlock(formData: FormData) {
    setIsSaving(true);
    setMessage("");
    const response = await fetch(
      `/api/properties/${encodeURIComponent(propertySlug)}/room-blocks`,
      {
        body: JSON.stringify({
          endDate: formData.get("endDate"),
          note: String(formData.get("note") ?? "").trim() || null,
          reason: formData.get("reason") as UnitBlockReason,
          startDate: formData.get("startDate"),
          unitId: formData.get("unitId"),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    if (!response.ok) {
      setMessage(await responseMessage(response));
    } else {
      setMessage("Room block added.");
      router.refresh();
    }
    setIsSaving(false);
  }

  if (!rooms.length) return null;

  return (
    <form action={submitBlock} className="mt-5 grid gap-3 lg:grid-cols-2">
      <label className="grid gap-1.5 text-xs">
        Physical room
        <select className={fieldClass} name="unitId" required>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.roomName} · {room.internalCode}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs">
        Reason
        <select className={fieldClass} name="reason" required>
          <option value="maintenance">Maintenance</option>
          <option value="owner_use">Owner use</option>
          <option value="housekeeping">Housekeeping</option>
          <option value="channel_hold">Channel hold</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-xs">
        From
        <input
          className={fieldClass}
          min={minimumDate}
          name="startDate"
          required
          type="date"
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        Until (room returns on this date)
        <input
          className={fieldClass}
          min={minimumDate}
          name="endDate"
          required
          type="date"
        />
      </label>
      <label className="grid gap-1.5 text-xs lg:col-span-2">
        Internal note
        <textarea
          className={`${fieldClass} min-h-20 resize-y`}
          maxLength={2000}
          name="note"
        />
      </label>
      <div className="flex items-center gap-3 lg:col-span-2">
        <button
          className="bg-gold text-background hover:bg-gold-light rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Adding block…" : "Block room dates"}
        </button>
        <span
          aria-live="polite"
          className={`text-xs ${message === "Room added. block" ? "text-emerald-400" : "text-red-300"}`}
        >
          {message}
        </span>
      </div>
    </form>
  );
}

export function RoomBlockDeleteButton({
  blockId,
  propertySlug,
}: {
  blockId: string;
  propertySlug: string;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteBlock() {
    if (!window.confirm("Remove this room block? The room will return to inventory.")) {
      return;
    }
    setIsDeleting(true);
    setMessage("");
    const response = await fetch(
      `/api/properties/${encodeURIComponent(propertySlug)}/room-blocks/${blockId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setMessage(await responseMessage(response));
    } else {
      router.refresh();
    }
    setIsDeleting(false);
  }

  return (
    <div className="text-right">
      <button
        className="text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-60"
        disabled={isDeleting}
        onClick={deleteBlock}
        type="button"
      >
        {isDeleting ? "Removing…" : "Remove"}
      </button>
      <p aria-live="polite" className="mt-1 max-w-40 text-[10px] text-red-300">
        {message}
      </p>
    </div>
  );
}
