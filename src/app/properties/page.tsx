import type { Metadata } from "next";

import {
  type Filter,
  PropertiesExplorer,
} from "@/features/customer/components/properties-explorer";
import type { StayType } from "@/features/customer/content";
import { isValidIsoDate } from "@/features/customer/date-utils";
import { getCustomerProperties } from "@/features/customer/server/property-catalog";

export const metadata: Metadata = {
  title: "Residences",
  description: "Explore the Aureum Stays collection of private residences.",
};

type PropertiesPageProps = {
  searchParams: Promise<{
    checkIn?: string | string[];
    checkOut?: string | string[];
    guests?: string | string[];
    location?: string | string[];
    stayType?: string | string[];
  }>;
};

const filters: Filter[] = ["all", "Kuala Lumpur", "Penang", "Langkawi"];

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const { checkIn, checkOut, guests, location, stayType } = await searchParams;
  const requestedLocation = Array.isArray(location) ? location[0] : location;
  const requestedStayType = Array.isArray(stayType) ? stayType[0] : stayType;
  const initialFilter = filters.includes(requestedLocation as Filter)
    ? (requestedLocation as Filter)
    : "all";
  const bookingParams = new URLSearchParams();
  const requestedGuests = Number(Array.isArray(guests) ? guests[0] : guests);
  const initialGuests = Number.isInteger(requestedGuests)
    ? Math.min(Math.max(requestedGuests, 1), 8)
    : 2;
  const initialStayType: StayType | "all" = ["hotel", "airbnb"].includes(
    requestedStayType ?? "",
  )
    ? (requestedStayType as StayType)
    : "all";
  const initialCheckIn = Array.isArray(checkIn) ? checkIn[0] : checkIn;
  const initialCheckOut = Array.isArray(checkOut) ? checkOut[0] : checkOut;
  const hasValidStay =
    isValidIsoDate(initialCheckIn) &&
    isValidIsoDate(initialCheckOut) &&
    initialCheckOut! > initialCheckIn!;
  const properties = await getCustomerProperties({
    checkIn: hasValidStay ? initialCheckIn : undefined,
    checkOut: hasValidStay ? initialCheckOut : undefined,
    guests: initialGuests,
  });

  for (const [key, value] of [
    ["checkIn", checkIn],
    ["checkOut", checkOut],
    ["guests", guests],
  ] as const) {
    const firstValue = Array.isArray(value) ? value[0] : value;

    if (firstValue) {
      bookingParams.set(key, firstValue);
    }
  }

  return (
    <PropertiesExplorer
      bookingQuery={bookingParams.toString()}
      initialCheckIn={initialCheckIn}
      initialCheckOut={initialCheckOut}
      initialFilter={initialFilter}
      initialGuests={initialGuests}
      initialStayType={initialStayType}
      properties={properties}
    />
  );
}
