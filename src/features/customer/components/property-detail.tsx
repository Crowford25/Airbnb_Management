"use client";

import { ArrowLeft, Bath, BedDouble, Check, MapPin, Star, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { ApiError } from "@/services/http/api-client";

import { requiredRooms, roomForBooking } from "../booking-utils";
import type { Property } from "../content";
import { useLanguage } from "../language-provider";
import { createReservation, type ReservationSummary } from "../reservation-api";
import { AvailabilityCalendar } from "./availability-calendar";
import { BookingPanel } from "./booking-panel";
import { CustomerFooter } from "./customer-footer";
import { CustomerHeader } from "./customer-header";
import { PropertyGallery } from "./property-gallery";

type PropertyDetailProps = {
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  minimumDate: string;
  property: Property;
};

export function PropertyDetail({
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests = 2,
  minimumDate,
  property,
}: PropertyDetailProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { copy, locale } = useLanguage();
  const localized = property.localized[locale];
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guests, setGuests] = useState(
    Math.min(Math.max(initialGuests, 1), property.guests),
  );
  const [selectedRoomKey, setSelectedRoomKey] = useState(
    property.rooms[0]?.roomKey ?? "",
  );
  const [reservation, setReservation] = useState<ReservationSummary | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const ratingLabel = copy.property.rating
    .replace("{rating}", property.rating.toFixed(2))
    .replace("{count}", String(property.reviewCount));

  function updateCheckIn(value: string) {
    setCheckIn(value);
    resetReservation();

    if (checkOut && value >= checkOut) {
      setCheckOut("");
    }
  }

  function updateCheckOut(value: string) {
    setCheckOut(value);
    resetReservation();
  }

  function updateGuests(value: number) {
    setGuests(value);
    resetReservation();
  }

  function updateRoom(value: string) {
    const room = roomForBooking(property, value);
    const maximumAdults =
      property.stayType === "hotel"
        ? (room?.maxAdults ?? 2) * (room?.inventoryCount ?? 1)
        : (room?.maxAdults ?? property.guests);
    setSelectedRoomKey(value);
    setGuests((current) => Math.min(current, maximumAdults));
    resetReservation();
  }

  function selectCalendarDate(value: string) {
    if (!checkIn || checkOut || value <= checkIn) {
      setCheckIn(value);
      setCheckOut("");
    } else {
      setCheckOut(value);
    }

    resetReservation();
  }

  function resetReservation() {
    setReservation(null);
    setBookingError(null);
    setIdempotencyKey("");
  }

  async function reviewReservation() {
    setBookingError(null);

    if (!user) {
      const query = new URLSearchParams({
        checkIn,
        checkOut,
        guests: String(guests),
      });
      const nextPath = `/properties/${property.slug}?${query.toString()}`;
      router.push(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    const requestKey = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(requestKey);
    setIsSubmitting(true);

    try {
      const result = await createReservation({
        checkIn,
        checkOut,
        idempotencyKey: requestKey,
        items: [
          {
            adults: guests,
            children: 0,
            quantity: requiredRooms(property, guests, selectedRoomKey),
            roomKey: selectedRoomKey,
          },
        ],
        propertySlug: property.slug,
      });
      setReservation(result.reservation);
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 401) {
        const query = new URLSearchParams({
          checkIn,
          checkOut,
          guests: String(guests),
        });
        router.push(
          `/login?next=${encodeURIComponent(`/properties/${property.slug}?${query.toString()}`)}`,
        );
        return;
      }

      setBookingError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "The booking hold could not be created. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CustomerHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-5 pt-8 pb-20 sm:px-8 lg:px-10 lg:pt-10 lg:pb-28">
          <Link
            className="text-muted hover:text-gold inline-flex items-center gap-2 text-sm transition"
            href="/properties"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {copy.property.backToStays}
          </Link>

          <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-gold flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase">
                <MapPin aria-hidden="true" size={14} />
                {copy.search[property.stayType]} · {copy.filters[property.location]}
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                {property.name}
              </h1>
              <p className="text-muted mt-4 max-w-2xl text-base leading-7 sm:text-lg">
                {localized.tagline}
              </p>
            </div>
            <div className="text-muted flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-1.5">
                <Star
                  aria-hidden="true"
                  className="text-gold"
                  fill="currentColor"
                  size={15}
                />
                {ratingLabel}
              </span>
              <span>
                {property.stayType === "hotel"
                  ? `${property.bedrooms} ${copy.details.rooms} · ${copy.details.hotelCapacity}`
                  : copy.details.upToGuests.replace("{count}", String(property.guests))}
              </span>
            </div>
          </div>

          <div className="mt-10">
            <PropertyGallery property={property} />
          </div>

          <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start xl:gap-16">
            <div>
              <section aria-labelledby="about-heading">
                <h2 className="text-2xl font-semibold" id="about-heading">
                  {copy.property.about}
                </h2>
                <div className="text-muted mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
                  {property.stayType === "hotel" ? (
                    <>
                      <span className="flex items-center gap-2">
                        <BedDouble aria-hidden="true" size={16} />
                        {property.bedrooms} {copy.details.rooms}
                      </span>
                      <span className="flex items-center gap-2">
                        <Users aria-hidden="true" size={16} />
                        {copy.details.hotelCapacity}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-2">
                        <Users aria-hidden="true" size={16} />
                        {copy.details.upToGuests.replace(
                          "{count}",
                          String(property.guests),
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <BedDouble aria-hidden="true" size={16} />
                        {property.bedrooms} {copy.details.bedrooms}
                      </span>
                    </>
                  )}
                  <span className="flex items-center gap-2">
                    <Bath aria-hidden="true" size={16} />
                    {property.bathrooms} {copy.details.bathrooms}
                  </span>
                </div>
                <p className="text-muted mt-6 max-w-3xl text-base leading-8">
                  {localized.description}
                </p>
              </section>

              <section
                aria-labelledby="amenities-heading"
                className="border-border mt-12 border-t pt-12"
              >
                <h2 className="text-2xl font-semibold" id="amenities-heading">
                  {copy.property.amenities}
                </h2>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {property.amenities.map((amenity) => (
                    <li
                      className="border-border bg-surface flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
                      key={amenity}
                    >
                      <span className="bg-gold/10 text-gold grid size-7 place-items-center rounded-full">
                        <Check aria-hidden="true" size={15} />
                      </span>
                      {copy.amenities[amenity]}
                    </li>
                  ))}
                </ul>
              </section>

              <section
                aria-labelledby="availability-heading"
                className="border-border mt-12 border-t pt-12"
              >
                <h2 className="text-2xl font-semibold" id="availability-heading">
                  {copy.property.availability}
                </h2>
                <p className="text-muted mt-2 text-sm">{copy.property.calendarHint}</p>
                <div className="mt-6">
                  <AvailabilityCalendar
                    checkIn={checkIn}
                    checkOut={checkOut}
                    guests={guests}
                    minimumDate={minimumDate}
                    onSelect={selectCalendarDate}
                    property={property}
                    roomKey={selectedRoomKey}
                  />
                </div>
              </section>
            </div>

            <BookingPanel
              checkIn={checkIn}
              checkOut={checkOut}
              error={bookingError}
              guests={guests}
              isReviewReady={Boolean(reservation)}
              isSubmitting={isSubmitting}
              minimumDate={minimumDate}
              onCheckInChange={updateCheckIn}
              onCheckOutChange={updateCheckOut}
              onGuestsChange={updateGuests}
              onRoomChange={updateRoom}
              onReview={reviewReservation}
              property={property}
              reservation={reservation}
              selectedRoomKey={selectedRoomKey}
            />
          </div>
        </div>
      </main>
      <CustomerFooter />
    </div>
  );
}
