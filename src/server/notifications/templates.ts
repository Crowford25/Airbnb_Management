import "server-only";

import type { ReservationRecord } from "@/server/db/models";

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "long",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function displayMoney(amount: string, currency: string) {
  return new Intl.NumberFormat("en-MY", {
    currency,
    style: "currency",
  }).format(Number(amount));
}

function roomSummary(reservation: ReservationRecord) {
  return reservation.items
    .map((item) => `${item.quantity} × ${item.roomName}`)
    .join(", ");
}

function emailShell(input: {
  actionHref: string;
  actionLabel: string;
  body: string;
  eyebrow: string;
  title: string;
}) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0b0b0b;color:#f8f6f0;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:640px;margin:0 auto;padding:40px 20px">
      <div style="border:1px solid #292929;border-radius:18px;background:#141414;padding:32px">
        <p style="margin:0 0 12px;color:#c6a15b;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${input.eyebrow}</p>
        <h1 style="margin:0 0 20px;font-size:30px;line-height:1.2">${input.title}</h1>
        <div style="color:#d4d4d4;font-size:15px;line-height:1.7">${input.body}</div>
        <a href="${escapeHtml(input.actionHref)}" style="display:inline-block;margin-top:26px;border-radius:10px;background:#c6a15b;color:#0b0b0b;padding:13px 20px;font-size:14px;font-weight:700;text-decoration:none">${input.actionLabel}</a>
      </div>
      <p style="margin:18px 0 0;text-align:center;color:#737373;font-size:11px">Aureum Stays · Automated booking notification</p>
    </div>
  </body>
</html>`;
}

function reservationDetails(reservation: ReservationRecord, checkInTime: string) {
  return `<div style="margin:22px 0;padding:18px;border:1px solid #292929;border-radius:12px;background:#0f0f0f">
    <p style="margin:0 0 8px"><strong>Reference:</strong> ${escapeHtml(reservation.bookingReference)}</p>
    <p style="margin:0 0 8px"><strong>Property:</strong> ${escapeHtml(reservation.propertyName)}</p>
    <p style="margin:0 0 8px"><strong>Stay:</strong> ${escapeHtml(displayDate(reservation.checkIn))} to ${escapeHtml(displayDate(reservation.checkOut))}</p>
    <p style="margin:0 0 8px"><strong>Check-in:</strong> from ${escapeHtml(checkInTime)}</p>
    <p style="margin:0 0 8px"><strong>Rooms:</strong> ${escapeHtml(roomSummary(reservation))}</p>
    <p style="margin:0"><strong>Total:</strong> ${escapeHtml(displayMoney(reservation.totalAmount, reservation.currency))}</p>
  </div>`;
}

export function bookingConfirmationEmail(
  reservation: ReservationRecord,
  input: { appUrl: string; checkInTime: string },
) {
  const text = `Your Aureum Stays reservation is confirmed.

Reference: ${reservation.bookingReference}
Property: ${reservation.propertyName}
Stay: ${displayDate(reservation.checkIn)} to ${displayDate(reservation.checkOut)}
Check-in: from ${input.checkInTime}
Rooms: ${roomSummary(reservation)}
Total: ${displayMoney(reservation.totalAmount, reservation.currency)}

Manage your booking: ${input.appUrl}/account`;
  return {
    htmlBody: emailShell({
      actionHref: `${input.appUrl}/account`,
      actionLabel: "View reservation",
      body: `<p>Hello ${escapeHtml(reservation.guestName)},</p><p>Your payment was verified and your reservation is confirmed.</p>${reservationDetails(reservation, input.checkInTime)}`,
      eyebrow: "Booking confirmed",
      title: "Your stay is reserved",
    }),
    subject: `Booking confirmed · ${reservation.bookingReference}`,
    textBody: text,
  };
}

export function bookingReminderEmail(
  reservation: ReservationRecord,
  input: { appUrl: string; checkInTime: string; hoursBefore: number },
) {
  const timing = input.hoursBefore === 24 ? "tomorrow" : "in three days";
  return {
    htmlBody: emailShell({
      actionHref: `${input.appUrl}/account`,
      actionLabel: "Review reservation",
      body: `<p>Hello ${escapeHtml(reservation.guestName)},</p><p>Your stay at ${escapeHtml(reservation.propertyName)} begins ${timing}.</p>${reservationDetails(reservation, input.checkInTime)}`,
      eyebrow: "Upcoming stay",
      title: `Check-in is ${timing}`,
    }),
    subject: `Upcoming stay reminder · ${reservation.bookingReference}`,
    textBody: `Your stay at ${reservation.propertyName} begins ${timing}.

Reference: ${reservation.bookingReference}
Check-in: ${displayDate(reservation.checkIn)} from ${input.checkInTime}
Rooms: ${roomSummary(reservation)}

Review your reservation: ${input.appUrl}/account`,
  };
}

export function bookingCancellationEmail(
  reservation: ReservationRecord,
  input: { appUrl: string; reason: string },
) {
  return {
    htmlBody: emailShell({
      actionHref: `${input.appUrl}/account`,
      actionLabel: "View account",
      body: `<p>Hello ${escapeHtml(reservation.guestName)},</p><p>Your reservation <strong>${escapeHtml(reservation.bookingReference)}</strong> has been cancelled.</p><p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p><p>Any applicable refund will follow the cancellation policy attached to your booking.</p>`,
      eyebrow: "Booking cancelled",
      title: "Your reservation was cancelled",
    }),
    subject: `Booking cancelled · ${reservation.bookingReference}`,
    textBody: `Your reservation ${reservation.bookingReference} has been cancelled.

Reason: ${input.reason}
Any applicable refund will follow the cancellation policy attached to your booking.

View your account: ${input.appUrl}/account`,
  };
}

export function adminReservationAlertEmail(
  reservation: ReservationRecord,
  input: { appUrl: string; event: "cancelled" | "confirmed"; reason?: string },
) {
  const confirmed = input.event === "confirmed";
  const reason =
    !confirmed && input.reason
      ? `<p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>`
      : "";
  return {
    htmlBody: emailShell({
      actionHref: `${input.appUrl}/admin/reservations`,
      actionLabel: "Open admin reservations",
      body: `<p>Reservation <strong>${escapeHtml(reservation.bookingReference)}</strong> for ${escapeHtml(reservation.guestName)} (${escapeHtml(reservation.guestEmail)}) was ${input.event}.</p>${reason}<p><strong>${escapeHtml(reservation.propertyName)}</strong><br>${escapeHtml(displayDate(reservation.checkIn))} to ${escapeHtml(displayDate(reservation.checkOut))}<br>${escapeHtml(roomSummary(reservation))}</p>`,
      eyebrow: "Administrator alert",
      title: `Reservation ${input.event}`,
    }),
    subject: `${confirmed ? "Confirmed" : "Cancelled"} reservation · ${reservation.bookingReference}`,
    textBody: `Reservation ${reservation.bookingReference} for ${reservation.guestName} (${reservation.guestEmail}) was ${input.event}.
${input.reason ? `Reason: ${input.reason}\n` : ""}Property: ${reservation.propertyName}
Stay: ${displayDate(reservation.checkIn)} to ${displayDate(reservation.checkOut)}
Rooms: ${roomSummary(reservation)}

Open admin reservations: ${input.appUrl}/admin/reservations`,
  };
}
