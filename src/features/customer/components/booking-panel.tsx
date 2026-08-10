"use client";

import { CalendarDays, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import {
  defaultRate,
  minimumNightsForRange,
  requiredRooms,
  roomForBooking,
  staySubtotal,
  unavailableDatesForGuests,
} from "../booking-utils";
import type { Property } from "../content";
import { differenceInNights, hasUnavailableNight, nextIsoDate } from "../date-utils";
import { useLanguage } from "../language-provider";
import type { ReservationSummary } from "../reservation-api";

type BookingPanelProps = {
  checkIn: string;
  checkOut: string;
  guests: number;
  error: string | null;
  isSubmitting: boolean;
  isReviewReady: boolean;
  minimumDate: string;
  onCheckInChange(value: string): void;
  onCheckOutChange(value: string): void;
  onGuestsChange(value: number): void;
  onRoomChange(value: string): void;
  onReview(): void;
  property: Property;
  reservation: ReservationSummary | null;
  selectedRoomKey: string;
};

export function BookingPanel({
  checkIn,
  checkOut,
  error,
  guests,
  isSubmitting,
  isReviewReady,
  minimumDate,
  onCheckInChange,
  onCheckOutChange,
  onGuestsChange,
  onRoomChange,
  onReview,
  property,
  reservation,
  selectedRoomKey,
}: BookingPanelProps) {
  const { copy, locale } = useLanguage();
  const room = roomForBooking(property, selectedRoomKey);
  const rate = defaultRate(room);
  const nights = differenceInNights(checkIn, checkOut);
  const includesUnavailableNight = hasUnavailableNight(
    checkIn,
    checkOut,
    unavailableDatesForGuests(property, guests, selectedRoomKey),
  );
  const firstDay = rate?.inventory[checkIn];
  const lastNight = checkOut ? rate?.inventory[checkOut] : undefined;
  const requiredMinimum = minimumNightsForRange(
    property,
    checkIn,
    checkOut,
    selectedRoomKey,
  );
  const violatesRestriction =
    Boolean(firstDay?.closedToArrival) || Boolean(lastNight?.closedToDeparture);
  const validStay =
    nights >= requiredMinimum &&
    !includesUnavailableNight &&
    !violatesRestriction &&
    Boolean(room && rate);
  const roomsNeeded = requiredRooms(property, guests, selectedRoomKey);
  const subtotal = staySubtotal(property, guests, checkIn, checkOut, selectedRoomKey);
  const currencyCode = rate?.currency ?? "MYR";
  const currency = new Intl.NumberFormat(locale === "zh-CN" ? "zh-CN" : "en-MY", {
    currency: currencyCode,
    maximumFractionDigits: 0,
    style: "currency",
  });
  const nightLabel = nights === 1 ? copy.property.night : copy.property.nights;
  const roomLabel =
    roomsNeeded === 1 ? copy.property.roomSingular : copy.property.roomPlural;
  const maximumAdults =
    property.stayType === "hotel"
      ? (room?.maxAdults ?? 2) * (room?.inventoryCount ?? 1)
      : (room?.maxAdults ?? property.guests);

  return (
    <aside className="border-border bg-surface rounded-2xl border p-5 shadow-2xl shadow-black/25 sm:p-6 lg:sticky lg:top-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{copy.property.bookingTitle}</h2>
          <p className="text-muted mt-2 text-sm leading-6">
            {copy.property.bookingSubtitle}
          </p>
        </div>
        <CalendarDays aria-hidden="true" className="text-gold mt-1" size={20} />
      </div>

      <div className="border-border mt-6 grid grid-cols-2 overflow-hidden rounded-xl border">
        <label className="border-border border-r p-3">
          <span className="text-gold block text-[10px] font-semibold tracking-wider uppercase">
            {copy.property.checkIn}
          </span>
          <input
            className="text-foreground mt-1 w-full min-w-0 bg-transparent text-sm [color-scheme:dark] outline-none"
            min={minimumDate}
            onInput={(event) => onCheckInChange(event.currentTarget.value)}
            type="date"
            value={checkIn}
          />
        </label>
        <label className="p-3">
          <span className="text-gold block text-[10px] font-semibold tracking-wider uppercase">
            {copy.property.checkOut}
          </span>
          <input
            className="text-foreground mt-1 w-full min-w-0 bg-transparent text-sm [color-scheme:dark] outline-none"
            min={nextIsoDate(checkIn || minimumDate)}
            onInput={(event) => onCheckOutChange(event.currentTarget.value)}
            type="date"
            value={checkOut}
          />
        </label>
        {property.rooms.length > 1 ? (
          <label className="border-border col-span-2 border-t p-3">
            <span className="text-gold block text-[10px] font-semibold tracking-wider uppercase">
              {copy.property.roomType}
            </span>
            <select
              className="text-foreground mt-1 w-full bg-transparent text-sm [color-scheme:dark] outline-none"
              onChange={(event) => onRoomChange(event.target.value)}
              value={selectedRoomKey}
            >
              {property.rooms.map((option) => (
                <option key={option.roomKey} value={option.roomKey}>
                  {locale === "zh-CN" ? (option.nameZhCn ?? option.name) : option.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="border-border col-span-2 flex items-center justify-between gap-4 border-t p-3">
          <span>
            <span className="text-gold block text-[10px] font-semibold tracking-wider uppercase">
              {copy.property.guests}
            </span>
            <span className="text-muted mt-1 flex items-center gap-1.5 text-sm">
              <Users aria-hidden="true" size={14} />
              {guests}{" "}
              {guests === 1 ? copy.property.guestSingular : copy.property.guestPlural}
            </span>
          </span>
          <select
            aria-label={copy.property.guests}
            className="border-border bg-surface-elevated rounded-lg border px-3 py-2 text-sm [color-scheme:dark]"
            onChange={(event) => onGuestsChange(Number(event.target.value))}
            value={Math.min(guests, maximumAdults)}
          >
            {Array.from({ length: maximumAdults }, (_, index) => index + 1).map(
              (guestCount) => (
                <option key={guestCount} value={guestCount}>
                  {guestCount}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <p className="text-muted mt-3 text-xs">
        {copy.property.minimumStay.replace("{count}", String(requiredMinimum))}
      </p>
      <p className="text-gold mt-1 text-xs">
        {property.stayType === "hotel"
          ? copy.property.hotelRoomRule
              .replace("{adults}", String(room?.maxAdults ?? 2))
              .replace("{count}", String(roomsNeeded))
              .replace("{rooms}", roomLabel)
          : copy.property.airbnbCapacity.replace(
              "{count}",
              String(room?.maxGuests ?? property.guests),
            )}
      </p>

      {checkIn && checkOut ? (
        <div className="border-border mt-6 space-y-3 border-y py-5 text-sm">
          {includesUnavailableNight || violatesRestriction ? (
            <p className="text-gold">{copy.property.unavailableRange}</p>
          ) : nights < requiredMinimum ? (
            <p className="text-gold">
              {copy.property.invalidStay.replace("{count}", String(requiredMinimum))}
            </p>
          ) : (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted">
                  {currency.format(rate?.nightlyRate ?? 0)} × {roomsNeeded} {roomLabel}{" "}
                  × {nights} {nightLabel}
                </span>
                <span>{currency.format(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">{copy.property.feesAndTaxes}</span>
                <span className="text-muted">{copy.property.calculatedAtReview}</span>
              </div>
              <div className="border-border flex justify-between gap-4 border-t pt-3 text-base font-semibold">
                <span>
                  {reservation ? copy.property.total : copy.property.accommodation}
                </span>
                <span>
                  {currency.format(
                    reservation ? Number(reservation.totalAmount) : subtotal,
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-muted border-border mt-6 border-y py-5 text-sm">
          {copy.property.selectDates}
        </p>
      )}

      <button
        className="bg-gold text-background hover:bg-gold-light mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!validStay || isSubmitting || Boolean(reservation)}
        onClick={onReview}
        type="button"
      >
        <ShieldCheck aria-hidden="true" size={18} />
        {isSubmitting ? "Creating secure hold…" : copy.property.continueToReview}
      </button>
      <p className="text-muted mt-3 text-center text-xs">{copy.property.noPayment}</p>

      {error ? (
        <p
          aria-live="polite"
          className="mt-5 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      {isReviewReady && reservation ? (
        <div
          aria-live="polite"
          className="border-gold/30 bg-gold/10 mt-5 rounded-xl border p-4"
        >
          <p className="text-gold flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 aria-hidden="true" size={17} />
            Reservation {reservation.bookingReference} is held
          </p>
          <p className="text-muted mt-2 text-xs leading-5">
            Your dates and server-calculated price are reserved for 30 minutes. No
            payment has been taken yet.
          </p>
          <Link
            className="bg-gold text-background hover:bg-gold-light mt-4 inline-flex rounded-lg px-4 py-2.5 text-sm font-semibold transition"
            href={`/account/reservations/${encodeURIComponent(reservation.bookingReference)}/pay`}
          >
            Pay securely now
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
