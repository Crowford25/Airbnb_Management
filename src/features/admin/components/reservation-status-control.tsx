"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  PaymentStatus,
  ReservationSource,
  ReservationStatus,
} from "@/server/db/models";

async function responseMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return body?.error?.message ?? body?.message ?? "The reservation was not updated.";
}

export function ReservationStatusControl({
  bookingReference,
  paymentStatus,
  source,
  status,
}: {
  bookingReference: string;
  paymentStatus: PaymentStatus | null;
  source: ReservationSource;
  status: ReservationStatus;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const actions: Array<{
    label: string;
    status: "confirmed" | "cancelled" | "completed";
  }> =
    status === "pending"
      ? [
          ...(source !== "direct" || paymentStatus === "succeeded"
            ? [{ label: "Confirm", status: "confirmed" as const }]
            : []),
          { label: "Cancel", status: "cancelled" },
        ]
      : status === "confirmed"
        ? [
            { label: "Complete", status: "completed" },
            { label: "Cancel", status: "cancelled" },
          ]
        : [];

  async function changeStatus(nextStatus: "confirmed" | "cancelled" | "completed") {
    let cancellationReason: string | null = null;
    if (nextStatus === "cancelled") {
      cancellationReason = window.prompt(
        "Cancellation reason (required for staff records):",
      );
      if (cancellationReason === null) return;
      if (!cancellationReason.trim()) {
        setMessage("Enter a cancellation reason.");
        return;
      }
    }

    setIsSaving(true);
    setMessage("");
    const response = await fetch(
      `/api/reservations/${encodeURIComponent(bookingReference)}`,
      {
        body: JSON.stringify({
          cancellationReason: cancellationReason?.trim() || null,
          status: nextStatus,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );
    if (!response.ok) {
      setMessage(await responseMessage(response));
    } else {
      router.refresh();
    }
    setIsSaving(false);
  }

  if (!actions.length) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${
              action.status === "cancelled"
                ? "border-red-900/70 text-red-300 hover:bg-red-950/40"
                : "border-gold/50 text-gold hover:bg-gold/10"
            }`}
            disabled={isSaving}
            key={action.status}
            onClick={() => changeStatus(action.status)}
            type="button"
          >
            {isSaving ? "Saving…" : action.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-1 max-w-56 text-[10px] text-red-300">
        {message}
      </p>
    </div>
  );
}
