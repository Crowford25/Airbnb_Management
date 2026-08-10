"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function responseMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return body?.error?.message ?? body?.message ?? "The refund was not created.";
}

export function RefundPaymentControl({
  bookingReference,
  currency,
  refundableAmount,
}: {
  bookingReference: string;
  currency: string;
  refundableAmount: number;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function refund() {
    const rawAmount = window.prompt(
      `Refund amount in ${currency} (maximum ${refundableAmount.toFixed(2)}):`,
      refundableAmount.toFixed(2),
    );
    if (rawAmount === null) return;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundableAmount) {
      setMessage("Enter a valid amount within the refundable balance.");
      return;
    }
    const reason = window.prompt("Internal refund reason:");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setMessage("Enter a refund reason.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    const response = await fetch(
      `/api/reservations/${encodeURIComponent(bookingReference)}/refunds`,
      {
        body: JSON.stringify({
          amount,
          idempotencyKey: crypto.randomUUID(),
          reason: reason.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) {
      setMessage(await responseMessage(response));
    } else {
      setMessage("Refund submitted");
      router.refresh();
    }
    setIsSaving(false);
  }

  return (
    <div>
      <button
        className="rounded-lg border border-sky-900/70 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-950/40 disabled:opacity-60"
        disabled={isSaving}
        onClick={refund}
        type="button"
      >
        {isSaving ? "Submitting…" : "Refund"}
      </button>
      <p
        aria-live="polite"
        className={`mt-1 max-w-56 text-[10px] ${
          message === "Refund submitted" ? "text-emerald-400" : "text-red-300"
        }`}
      >
        {message}
      </p>
    </div>
  );
}
