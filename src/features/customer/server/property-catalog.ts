import "server-only";

import type { PropertyRecord } from "@/server/db/models";
import {
  getInventoryWindow,
  type InventoryRoomWindow,
} from "@/server/db/repositories/inventory";
import {
  findPropertyBySlug,
  listProperties,
  type PropertyListFilters,
} from "@/server/db/repositories/properties";

import {
  properties as designedProperties,
  type AmenityId,
  type Property,
} from "../content";

const amenityIds: Record<string, AmenityId> = {
  "air-conditioning": "airConditioning",
  "city-view": "cityView",
  "full-kitchen": "fullKitchen",
  "infinity-pool": "infinityPool",
  parking: "parking",
  "private-courtyard": "privateCourtyard",
  "sea-view": "seaView",
  "washer-dryer": "washerDryer",
  wifi: "wifi",
};

const supportedLocations = ["Kuala Lumpur", "Penang", "Langkawi"] as const;

export function malaysiaToday() {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fourImages(property: PropertyRecord) {
  const images = property.images.map((image) => image.imageUrl);
  const fallback =
    designedProperties.find((candidate) => candidate.slug === property.slug)
      ?.galleryImages ?? [];
  const combined = [...images, ...fallback];

  while (combined.length < 4) {
    combined.push(combined.at(-1) ?? "/properties/the-opaline-residence-1.png");
  }
  return combined.slice(0, 4) as [string, string, string, string];
}

export function toCustomerProperty(
  property: PropertyRecord,
  inventory: InventoryRoomWindow[] = [],
): Property {
  const designed = designedProperties.find(
    (candidate) => candidate.slug === property.slug,
  );
  const location = supportedLocations.includes(
    property.city as (typeof supportedLocations)[number],
  )
    ? (property.city as Property["location"])
    : "Kuala Lumpur";
  const galleryLabels = (locale: "en" | "zh-CN") =>
    (property.images.length >= 4
      ? property.images
          .slice(0, 4)
          .map((image) =>
            locale === "zh-CN"
              ? (image.altTextZhCn ?? image.altTextEn)
              : image.altTextEn,
          )
      : (designed?.localized[locale].galleryLabels ?? [
          property.name,
          property.name,
          property.name,
          property.name,
        ])) as [string, string, string, string];

  const rooms = property.unitTypes.map((unitType) => {
    const roomInventory = inventory.find(
      (candidate) => candidate.roomKey === unitType.roomKey,
    );
    return {
      bathrooms: unitType.bathrooms,
      bedrooms: unitType.bedrooms,
      beds: unitType.beds,
      inventoryCount: unitType.inventoryCount,
      maxAdults: unitType.maxAdults,
      maxChildren: unitType.maxChildren,
      maxGuests: unitType.maxGuests,
      name: unitType.nameEn,
      nameZhCn: unitType.nameZhCn,
      ratePlans: unitType.ratePlans.map((ratePlan) => {
        const rateInventory = roomInventory?.ratePlans.find(
          (candidate) => candidate.rateKey === ratePlan.rateKey,
        );
        return {
          cancellationPolicyName: ratePlan.cancellationPolicy?.nameEn ?? null,
          currency: ratePlan.currency,
          inventory: Object.fromEntries(
            (rateInventory?.days ?? []).map((day) => [
              day.date,
              {
                closedToArrival: day.closedToArrival,
                closedToDeparture: day.closedToDeparture,
                minimumNights: day.minimumNights,
                nightlyRate: Number(day.nightlyRate),
                remainingUnits: day.remainingUnits,
              },
            ]),
          ),
          isDefault: ratePlan.isDefault,
          minimumNights: ratePlan.minimumNights,
          name: ratePlan.nameEn,
          nameZhCn: ratePlan.nameZhCn,
          nightlyRate: Number(ratePlan.baseNightlyRate),
          rateKey: ratePlan.rateKey,
        };
      }),
      roomKey: unitType.roomKey,
    };
  });
  const defaultRates = rooms
    .map((room) => room.ratePlans.find((ratePlan) => ratePlan.isDefault))
    .filter((ratePlan) => ratePlan !== undefined);
  const primaryRoom = rooms[0];

  return {
    amenities: property.amenities
      .map((amenity) => amenityIds[amenity.code])
      .filter((amenity): amenity is AmenityId => Boolean(amenity)),
    bathrooms:
      property.propertyType === "hotel"
        ? Math.max(...rooms.map((room) => room.bathrooms), 0)
        : (primaryRoom?.bathrooms ?? 0),
    bedrooms:
      property.propertyType === "hotel"
        ? rooms.reduce((sum, room) => sum + room.inventoryCount, 0)
        : (primaryRoom?.bedrooms ?? 0),
    galleryImages: fourImages(property),
    gradient:
      designed?.gradient ??
      "linear-gradient(135deg, #1c1a17 0%, #6e604b 48%, #131313 100%)",
    guests:
      property.propertyType === "hotel"
        ? rooms.reduce((sum, room) => sum + room.maxAdults * room.inventoryCount, 0)
        : (primaryRoom?.maxGuests ?? 1),
    localized: {
      en: {
        description: property.descriptionEn,
        galleryLabels: galleryLabels("en"),
        tagline: property.taglineEn ?? designed?.localized.en.tagline ?? property.name,
      },
      "zh-CN": {
        description:
          property.descriptionZhCn ??
          designed?.localized["zh-CN"].description ??
          property.descriptionEn,
        galleryLabels: galleryLabels("zh-CN"),
        tagline:
          property.taglineZhCn ??
          designed?.localized["zh-CN"].tagline ??
          property.taglineEn ??
          property.name,
      },
    },
    location,
    minimumNights: Math.min(
      ...defaultRates.map((ratePlan) => ratePlan.minimumNights),
      90,
    ),
    name: property.name,
    nightlyRate: Math.min(
      ...defaultRates.map((ratePlan) => ratePlan.nightlyRate),
      10_000_000,
    ),
    rating: Number(property.ratingAverage ?? 0),
    reviewCount: property.reviewCount,
    rooms,
    slug: property.slug,
    stayType: property.propertyType,
  };
}

export async function getCustomerProperties(filters: PropertyListFilters = {}) {
  const records = await listProperties({ ...filters, publishedOnly: true });
  return records.map((property) => toCustomerProperty(property));
}

export async function getCustomerProperty(slug: string) {
  const property = await findPropertyBySlug(slug);
  if (!property) return null;

  const from = malaysiaToday();
  const inventory = await getInventoryWindow(property.id, from, addDays(from, 367));
  return toCustomerProperty(property, inventory);
}
