"use client";

import { Bath, BedDouble, MoveUpRight, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { requiredRooms } from "../booking-utils";
import type { Property } from "../content";
import { useLanguage } from "../language-provider";

export function PropertyCard({
  bookingQuery = "",
  property,
}: {
  bookingQuery?: string;
  property: Property;
}) {
  const { copy } = useLanguage();
  const nightlyRate = (
    property.stayType === "hotel"
      ? copy.collection.nightlyRoom
      : copy.collection.nightlyHome
  ).replace("{rate}", property.nightlyRate.toLocaleString());
  const guestCapacity = copy.details.upToGuests.replace(
    "{count}",
    String(property.guests),
  );
  const requestedAdults = Math.max(
    1,
    Number(new URLSearchParams(bookingQuery).get("guests")) || 2,
  );
  const roomsNeeded = requiredRooms(property, requestedAdults);

  return (
    <Link
      aria-label={`${property.name}, ${copy.filters[property.location]}`}
      className="group block"
      href={`/properties/${property.slug}${bookingQuery ? `?${bookingQuery}` : ""}`}
    >
      <article className="border-border bg-surface group-hover:border-gold/60 overflow-hidden rounded-xl border transition duration-300 group-hover:-translate-y-1">
        <div className="relative aspect-[4/3] overflow-hidden bg-black">
          <Image
            alt=""
            className="object-cover transition duration-700 group-hover:scale-[1.02]"
            fill
            quality={92}
            sizes="(min-width: 1280px) 390px, (min-width: 768px) 50vw, 100vw"
            src={property.galleryImages[0]}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <span className="absolute right-4 bottom-4 rounded-full border border-white/20 bg-black/25 px-3 py-1 text-xs tracking-wider text-white uppercase backdrop-blur-sm">
            {copy.filters[property.location]}
          </span>
          <div className="bg-gold absolute bottom-0 left-0 h-1 w-0 transition-all duration-500 group-hover:w-full" />
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-muted mb-2 text-[10px] font-semibold tracking-[0.18em] uppercase">
                {copy.search[property.stayType]} · {copy.filters[property.location]}
              </p>
              <h3 className="text-xl font-medium tracking-tight">{property.name}</h3>
              <p className="text-gold mt-1 text-sm">{nightlyRate}</p>
            </div>
            <span className="border-border text-gold group-hover:border-gold group-hover:bg-gold group-hover:text-background grid size-9 shrink-0 place-items-center rounded-full border transition">
              <MoveUpRight aria-hidden="true" size={17} />
            </span>
          </div>
          <div className="text-muted mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {property.stayType === "hotel" ? (
              <>
                <span className="flex items-center gap-1.5">
                  <BedDouble aria-hidden="true" size={14} /> {property.bedrooms}{" "}
                  {copy.details.rooms}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users aria-hidden="true" size={14} />
                  {requestedAdults} {copy.property.guestPlural} · {roomsNeeded}{" "}
                  {roomsNeeded === 1
                    ? copy.property.roomSingular
                    : copy.property.roomPlural}
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <Users aria-hidden="true" size={14} /> {guestCapacity}
                </span>
                <span className="flex items-center gap-1.5">
                  <BedDouble aria-hidden="true" size={14} /> {property.bedrooms}{" "}
                  {copy.details.bedrooms}
                </span>
              </>
            )}
            <span className="flex items-center gap-1.5">
              <Bath aria-hidden="true" size={14} /> {property.bathrooms}{" "}
              {copy.details.bathrooms}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
