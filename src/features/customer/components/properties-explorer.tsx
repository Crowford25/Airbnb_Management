"use client";

import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { canHostAdults } from "../booking-utils";
import type { Property, StayType } from "../content";
import { differenceInNights } from "../date-utils";
import { useLanguage } from "../language-provider";
import { CustomerFooter } from "./customer-footer";
import { CustomerHeader } from "./customer-header";
import { PropertyCard } from "./property-card";

export type Filter = "all" | Property["location"];
type StayTypeFilter = "all" | StayType;

export function PropertiesExplorer({
  bookingQuery = "",
  initialCheckIn = "",
  initialCheckOut = "",
  initialFilter = "all",
  initialGuests = 2,
  initialStayType = "all",
  properties,
}: {
  bookingQuery?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialFilter?: Filter;
  initialGuests?: number;
  initialStayType?: StayTypeFilter;
  properties: Property[];
}) {
  const { copy } = useLanguage();
  const [locationFilter, setLocationFilter] = useState<Filter>(initialFilter);
  const [stayTypeFilter, setStayTypeFilter] = useState<StayTypeFilter>(initialStayType);
  const visibleProperties = useMemo(
    () =>
      properties.filter((property) => {
        const matchesLocation =
          locationFilter === "all" || property.location === locationFilter;
        const matchesStayType =
          stayTypeFilter === "all" || property.stayType === stayTypeFilter;
        const hasCapacity = canHostAdults(property, initialGuests);
        const requestedNights = differenceInNights(initialCheckIn, initialCheckOut);
        const isAvailable =
          !initialCheckIn ||
          !initialCheckOut ||
          requestedNights >= property.minimumNights;

        return matchesLocation && matchesStayType && hasCapacity && isAvailable;
      }),
    [
      initialCheckIn,
      initialCheckOut,
      initialGuests,
      locationFilter,
      properties,
      stayTypeFilter,
    ],
  );
  const resultCount = (
    visibleProperties.length === 1 ? copy.filters.countOne : copy.filters.count
  ).replace("{count}", String(visibleProperties.length));
  const filters: Filter[] = ["all", "Kuala Lumpur", "Penang", "Langkawi"];
  const stayTypeFilters: StayTypeFilter[] = ["all", "hotel", "airbnb"];

  function labelFor(filterOption: Filter) {
    return filterOption === "all" ? copy.filters.all : copy.filters[filterOption];
  }

  function labelForStayType(filterOption: StayTypeFilter) {
    if (filterOption === "all") {
      return copy.search.allStayTypes;
    }

    return copy.filters[filterOption];
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CustomerHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
        <p className="text-gold text-xs font-semibold tracking-[0.24em] uppercase">
          {copy.collection.eyebrow}
        </p>
        <div className="mt-4 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {copy.filters.title}
            </h1>
            <p className="text-muted mt-4">{copy.filters.description}</p>
          </div>
          <span
            aria-live="polite"
            className="text-muted flex items-center gap-2 text-sm"
          >
            <SlidersHorizontal size={16} /> {resultCount}
          </span>
        </div>
        <div
          aria-label={copy.accessibility.filters}
          className="border-border mt-10 flex flex-wrap gap-2 border-y py-5"
          role="group"
        >
          <div className="flex flex-wrap gap-2">
            {filters.map((filterOption) => (
              <button
                aria-pressed={locationFilter === filterOption}
                className={`rounded-full px-4 py-2 text-sm transition ${locationFilter === filterOption ? "bg-gold text-background" : "border-border text-muted hover:border-gold hover:text-gold border"}`}
                key={filterOption}
                onClick={() => setLocationFilter(filterOption)}
                type="button"
              >
                {labelFor(filterOption)}
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="bg-border hidden w-px sm:block" />
          <div className="flex flex-wrap gap-2">
            {stayTypeFilters.map((filterOption) => (
              <button
                aria-pressed={stayTypeFilter === filterOption}
                className={`rounded-full px-4 py-2 text-sm transition ${stayTypeFilter === filterOption ? "bg-gold text-background" : "border-border text-muted hover:border-gold hover:text-gold border"}`}
                key={filterOption}
                onClick={() => setStayTypeFilter(filterOption)}
                type="button"
              >
                {labelForStayType(filterOption)}
              </button>
            ))}
          </div>
        </div>
        <h2 className="sr-only">{copy.accessibility.results}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleProperties.map((property) => (
            <PropertyCard
              bookingQuery={bookingQuery}
              key={property.slug}
              property={property}
            />
          ))}
        </div>
        {visibleProperties.length === 0 ? (
          <p className="border-border text-muted mt-10 rounded-xl border border-dashed px-5 py-10 text-center text-sm">
            {copy.filters.noResults}
          </p>
        ) : null}
      </main>
      <CustomerFooter />
    </div>
  );
}
