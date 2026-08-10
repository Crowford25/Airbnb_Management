import { env } from "@/config/env";
import { ApiClient } from "@/services/http/api-client";

export type ReservationSummary = {
  bookingReference: string;
  holdExpiresAt: string | null;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  totalAmount: string;
  currency: string;
};

const client = new ApiClient(env.apiBaseUrl);
const reservationPath = env.apiBaseUrl ? "/reservations" : "/api/reservations";

export function createReservation(input: {
  checkIn: string;
  checkOut: string;
  idempotencyKey: string;
  items: Array<{
    adults: number;
    children: number;
    quantity: number;
    rateKey?: string;
    roomKey: string;
  }>;
  propertySlug: string;
}) {
  return client.request<{
    created: boolean;
    reservation: ReservationSummary;
  }>(reservationPath, { body: input, method: "POST" });
}
