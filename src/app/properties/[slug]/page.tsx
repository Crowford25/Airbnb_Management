import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PropertyDetail } from "@/features/customer/components/property-detail";
import { isValidIsoDate } from "@/features/customer/date-utils";
import {
  getCustomerProperty,
  malaysiaToday,
} from "@/features/customer/server/property-catalog";

type PropertyPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    checkIn?: string | string[];
    checkOut?: string | string[];
    guests?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
}: PropertyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await getCustomerProperty(slug);

  if (!property) {
    return { title: "Residence not found" };
  }

  return {
    description: property.localized.en.description,
    title: property.name,
  };
}

export default async function PropertyPage({
  params,
  searchParams,
}: PropertyPageProps) {
  const { slug } = await params;
  const property = await getCustomerProperty(slug);

  if (!property) {
    notFound();
  }

  const query = await searchParams;
  const requestedCheckIn = firstValue(query.checkIn);
  const requestedCheckOut = firstValue(query.checkOut);
  const requestedGuests = Number(firstValue(query.guests));
  const initialCheckIn = isValidIsoDate(requestedCheckIn) ? requestedCheckIn : "";
  const initialCheckOut = isValidIsoDate(requestedCheckOut) ? requestedCheckOut : "";
  const initialGuests = Number.isInteger(requestedGuests) ? requestedGuests : 2;

  return (
    <PropertyDetail
      initialCheckIn={initialCheckIn}
      initialCheckOut={initialCheckOut}
      initialGuests={initialGuests}
      minimumDate={malaysiaToday()}
      property={property}
    />
  );
}
