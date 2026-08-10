import "server-only";

import type { ReservationRecord } from "@/server/db/models";
import {
  cancelPendingReservationReminders,
  enqueueEmailNotification,
  getReservationNotificationTiming,
  listAdminNotificationRecipients,
} from "@/server/db/repositories/notifications";
import type { TransactionContext } from "@/server/db/query";

import { configuredAdminAlertEmails, notificationAppUrl } from "./config";
import {
  adminReservationAlertEmail,
  bookingCancellationEmail,
  bookingConfirmationEmail,
  bookingReminderEmail,
} from "./templates";

type NotificationTrace = {
  correlationId?: string | null;
  originRequestId?: string | null;
  triggeredByUserId?: string | null;
};

async function adminRecipients(transaction: TransactionContext) {
  const configured = configuredAdminAlertEmails();
  if (configured) return configured.map((email) => ({ email, name: null }));
  return listAdminNotificationRecipients(transaction);
}

export async function enqueueReservationConfirmationNotifications(
  transaction: TransactionContext,
  reservation: ReservationRecord,
  trace?: NotificationTrace,
) {
  const appUrl = notificationAppUrl();
  const timing = await getReservationNotificationTiming(transaction, reservation.id);
  const confirmation = bookingConfirmationEmail(reservation, {
    appUrl,
    checkInTime: timing.checkInTime,
  });
  await enqueueEmailNotification(transaction, {
    category: "booking_confirmation",
    eventKey: `reservation:${reservation.id}:confirmation:customer`,
    recipientEmail: reservation.guestEmail,
    recipientName: reservation.guestName,
    reservationId: reservation.id,
    templateName: "booking_confirmation",
    templateVersion: "1",
    trace,
    ...confirmation,
  });

  for (const hoursBefore of [72, 24]) {
    const availableAt = new Date(
      timing.checkInAt.getTime() - hoursBefore * 60 * 60 * 1_000,
    );
    if (availableAt.getTime() <= Date.now()) continue;
    const reminder = bookingReminderEmail(reservation, {
      appUrl,
      checkInTime: timing.checkInTime,
      hoursBefore,
    });
    await enqueueEmailNotification(transaction, {
      availableAt,
      category: "booking_reminder",
      eventKey: `reservation:${reservation.id}:reminder:${hoursBefore}h`,
      recipientEmail: reservation.guestEmail,
      recipientName: reservation.guestName,
      reservationId: reservation.id,
      templateName: "booking_reminder",
      templateVersion: "1",
      trace,
      ...reminder,
    });
  }

  const adminAlert = adminReservationAlertEmail(reservation, {
    appUrl,
    event: "confirmed",
  });
  for (const recipient of await adminRecipients(transaction)) {
    await enqueueEmailNotification(transaction, {
      category: "admin_alert",
      eventKey: `reservation:${reservation.id}:confirmed:admin:${recipient.email}`,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      reservationId: reservation.id,
      templateName: "admin_reservation_alert",
      templateVersion: "1",
      trace,
      ...adminAlert,
    });
  }
}

export async function enqueueReservationCancellationNotifications(
  transaction: TransactionContext,
  reservation: ReservationRecord,
  reason: string,
  trace?: NotificationTrace,
) {
  const appUrl = notificationAppUrl();
  await cancelPendingReservationReminders(transaction, reservation.id);
  const cancellation = bookingCancellationEmail(reservation, { appUrl, reason });
  await enqueueEmailNotification(transaction, {
    category: "booking_cancellation",
    eventKey: `reservation:${reservation.id}:cancellation:customer`,
    recipientEmail: reservation.guestEmail,
    recipientName: reservation.guestName,
    reservationId: reservation.id,
    templateName: "booking_cancellation",
    templateVersion: "1",
    trace,
    ...cancellation,
  });

  const adminAlert = adminReservationAlertEmail(reservation, {
    appUrl,
    event: "cancelled",
    reason,
  });
  for (const recipient of await adminRecipients(transaction)) {
    await enqueueEmailNotification(transaction, {
      category: "admin_alert",
      eventKey: `reservation:${reservation.id}:cancelled:admin:${recipient.email}`,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      reservationId: reservation.id,
      templateName: "admin_reservation_alert",
      templateVersion: "1",
      trace,
      ...adminAlert,
    });
  }
}
