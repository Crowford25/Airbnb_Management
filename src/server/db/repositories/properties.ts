import "server-only";

import type { QueryResultRow } from "pg";

import type {
  PropertyAmenity,
  PropertyImage,
  PropertyRecord,
  PropertyStatus,
  PropertyType,
  UnitStatus,
  UnitTypeRecord,
} from "../models";
import { databaseQuery, type TransactionContext } from "../query";

type PropertyRow = QueryResultRow & {
  id: string;
  slug: string;
  name: string;
  name_zh_cn: string | null;
  tagline_en: string | null;
  tagline_zh_cn: string | null;
  description_en: string;
  description_zh_cn: string | null;
  property_type: PropertyType;
  status: PropertyStatus;
  city: string;
  state_region: string | null;
  country_code: string;
  address_line_1: string | null;
  address_line_2: string | null;
  postal_code: string | null;
  timezone: string;
  currency: string;
  check_in_time: string;
  check_out_time: string;
  rating_average: string | null;
  review_count: number;
  images: PropertyImage[];
  amenities: PropertyAmenity[];
  unit_types: UnitTypeRecord[];
};

export type PropertyListFilters = {
  checkIn?: string;
  checkOut?: string;
  city?: string;
  guests?: number;
  propertyType?: PropertyType;
  publishedOnly?: boolean;
  status?: PropertyStatus;
};

export type PropertyWriteInput = {
  slug: string;
  name: string;
  nameZhCn?: string | null;
  taglineEn?: string | null;
  taglineZhCn?: string | null;
  descriptionEn: string;
  descriptionZhCn?: string | null;
  propertyType: PropertyType;
  status: PropertyStatus;
  city: string;
  stateRegion?: string | null;
  countryCode: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  timezone: string;
  currency: string;
  checkInTime: string;
  checkOutTime: string;
  images: Array<{
    imageUrl: string;
    altTextEn: string;
    altTextZhCn?: string | null;
  }>;
  amenityCodes: string[];
};

export type UnitTypeWriteInput = {
  roomKey: string;
  nameEn: string;
  nameZhCn?: string | null;
  descriptionEn?: string | null;
  descriptionZhCn?: string | null;
  maxAdults: number;
  maxChildren: number;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  units: Array<{
    internalCode: string;
    internalName?: string | null;
    status: UnitStatus;
    floorLabel?: string | null;
  }>;
  ratePlans: Array<{
    rateKey: string;
    nameEn: string;
    nameZhCn?: string | null;
    baseNightlyRate: number;
    currency: string;
    minimumNights: number;
    isDefault: boolean;
    cancellationPolicyCode: string;
  }>;
};

export type PropertyCreateInput = PropertyWriteInput & {
  unitTypes: UnitTypeWriteInput[];
};

function mapProperty(row: PropertyRow): PropertyRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameZhCn: row.name_zh_cn,
    taglineEn: row.tagline_en,
    taglineZhCn: row.tagline_zh_cn,
    descriptionEn: row.description_en,
    descriptionZhCn: row.description_zh_cn,
    propertyType: row.property_type,
    status: row.status,
    city: row.city,
    stateRegion: row.state_region,
    countryCode: row.country_code,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    postalCode: row.postal_code,
    timezone: row.timezone,
    currency: row.currency,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    ratingAverage: row.rating_average,
    reviewCount: row.review_count,
    images: row.images ?? [],
    amenities: row.amenities ?? [],
    unitTypes: (row.unit_types ?? []).map((unitType) => ({
      ...unitType,
      bathrooms: Number(unitType.bathrooms),
      inventoryCount: Number(unitType.inventoryCount),
      ratePlans: unitType.ratePlans.map((ratePlan) => ({
        ...ratePlan,
        baseNightlyRate: String(ratePlan.baseNightlyRate),
        cancellationPolicy: ratePlan.cancellationPolicy
          ? {
              ...ratePlan.cancellationPolicy,
              noShowRefundPercentage: String(
                ratePlan.cancellationPolicy.noShowRefundPercentage,
              ),
              rules: ratePlan.cancellationPolicy.rules.map((rule) => ({
                ...rule,
                refundPercentage: String(rule.refundPercentage),
              })),
            }
          : null,
      })),
    })),
  };
}

const propertySelect = `
  SELECT
    property.id,
    property.slug,
    property.name,
    property.name_zh_cn,
    property.tagline_en,
    property.tagline_zh_cn,
    property.description_en,
    property.description_zh_cn,
    property.property_type,
    property.status,
    property.city,
    property.state_region,
    property.country_code,
    property.address_line_1,
    property.address_line_2,
    property.postal_code,
    property.timezone,
    property.currency,
    property.check_in_time::text,
    property.check_out_time::text,
    property.rating_average,
    property.review_count,
    COALESCE(images.items, '[]'::jsonb) AS images,
    COALESCE(amenities.items, '[]'::jsonb) AS amenities,
    COALESCE(unit_types.items, '[]'::jsonb) AS unit_types
  FROM aureum.properties AS property
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', image.id,
        'imageUrl', image.image_url,
        'altTextEn', image.alt_text_en,
        'altTextZhCn', image.alt_text_zh_cn,
        'displayOrder', image.display_order,
        'isCover', image.is_cover
      ) ORDER BY image.display_order
    ) AS items
    FROM aureum.property_images AS image
    WHERE image.property_id = property.id
  ) AS images ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', amenity.code,
        'nameEn', amenity.name_en,
        'nameZhCn', amenity.name_zh_cn,
        'category', amenity.category,
        'iconKey', amenity.icon_key
      ) ORDER BY amenity.category, amenity.name_en
    ) AS items
    FROM aureum.property_amenities AS property_amenity
    JOIN aureum.amenities AS amenity ON amenity.id = property_amenity.amenity_id
    WHERE property_amenity.property_id = property.id
      AND amenity.is_active = true
  ) AS amenities ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', unit_type.id,
        'roomKey', unit_type.code,
        'nameEn', unit_type.public_name_en,
        'nameZhCn', unit_type.public_name_zh_cn,
        'descriptionEn', unit_type.description_en,
        'descriptionZhCn', unit_type.description_zh_cn,
        'maxAdults', unit_type.max_adults,
        'maxChildren', unit_type.max_children,
        'maxGuests', unit_type.max_guests,
        'bedrooms', unit_type.bedrooms,
        'beds', unit_type.beds,
        'bathrooms', unit_type.bathrooms,
        'inventoryCount', aureum.unit_type_inventory_count(unit_type.id),
        'sortOrder', unit_type.sort_order,
        'ratePlans', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', rate_plan.id,
              'rateKey', rate_plan.code,
              'nameEn', rate_plan.public_name_en,
              'nameZhCn', rate_plan.public_name_zh_cn,
              'baseNightlyRate', rate_plan.base_nightly_rate,
              'currency', rate_plan.currency,
              'minimumNights', rate_plan.minimum_nights,
              'isDefault', rate_plan.is_default,
              'cancellationPolicy', CASE
                WHEN cancellation_policy.id IS NULL THEN NULL
                ELSE jsonb_build_object(
                  'code', cancellation_policy.code,
                  'nameEn', cancellation_policy.name_en,
                  'nameZhCn', cancellation_policy.name_zh_cn,
                  'descriptionEn', cancellation_policy.description_en,
                  'descriptionZhCn', cancellation_policy.description_zh_cn,
                  'noShowRefundPercentage', cancellation_policy.no_show_refund_percentage,
                  'rules', COALESCE((
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'daysBeforeCheckIn', policy_rule.days_before_check_in,
                        'refundPercentage', policy_rule.refund_percentage
                      ) ORDER BY policy_rule.days_before_check_in DESC
                    )
                    FROM aureum.cancellation_policy_rules AS policy_rule
                    WHERE policy_rule.cancellation_policy_id = cancellation_policy.id
                  ), '[]'::jsonb)
                )
              END
            ) ORDER BY rate_plan.is_default DESC, rate_plan.public_name_en
          )
          FROM aureum.rate_plans AS rate_plan
          LEFT JOIN aureum.cancellation_policies AS cancellation_policy
            ON cancellation_policy.id = rate_plan.cancellation_policy_id
            AND cancellation_policy.deleted_at IS NULL
          WHERE rate_plan.unit_type_id = unit_type.id
            AND rate_plan.is_active = true
            AND rate_plan.deleted_at IS NULL
        ), '[]'::jsonb)
      ) ORDER BY unit_type.sort_order, unit_type.public_name_en
    ) AS items
    FROM aureum.unit_types AS unit_type
    WHERE unit_type.property_id = property.id
      AND unit_type.is_active = true
      AND unit_type.deleted_at IS NULL
  ) AS unit_types ON true
`;

export async function listProperties(filters: PropertyListFilters = {}) {
  const result = await databaseQuery<PropertyRow>({
    name: "list-properties-range-inventory",
    text: `${propertySelect}
      WHERE property.deleted_at IS NULL
        AND ($1::boolean = false OR property.status = 'published')
        AND ($2::aureum.property_status IS NULL OR property.status = $2)
        AND ($3::text IS NULL OR lower(property.city) = lower($3))
        AND ($4::aureum.property_type IS NULL OR property.property_type = $4)
        AND EXISTS (
          SELECT 1
          FROM aureum.unit_types AS candidate
          JOIN aureum.rate_plans AS default_rate
            ON default_rate.unit_type_id = candidate.id
            AND default_rate.is_default = true
            AND default_rate.is_active = true
            AND default_rate.deleted_at IS NULL
          WHERE candidate.property_id = property.id
            AND candidate.is_active = true
            AND candidate.deleted_at IS NULL
            AND (
              $5::integer IS NULL
              OR $5 <= CASE
                WHEN property.property_type = 'hotel'
                  THEN candidate.max_adults * aureum.unit_type_inventory_count(candidate.id)
                ELSE candidate.max_guests
              END
            )
            AND (
              $6::date IS NULL
              OR $7::date IS NULL
              OR (
                ($7::date - $6::date) >= default_rate.minimum_nights
                AND NOT EXISTS (
                  SELECT 1
                  FROM generate_series(
                    $6::date,
                    $7::date - 1,
                    interval '1 day'
                  ) AS requested(day)
                  WHERE aureum.unit_type_remaining_units(
                    candidate.id,
                    requested.day::date
                  ) < CASE
                    WHEN property.property_type = 'hotel'
                      THEN CEIL(COALESCE($5, 2)::numeric / candidate.max_adults)::integer
                    ELSE 1
                  END
                )
              )
            )
        )
      ORDER BY property.name
    `,
    values: [
      filters.publishedOnly ?? true,
      filters.status ?? null,
      filters.city?.trim() || null,
      filters.propertyType ?? null,
      filters.guests ?? null,
      filters.checkIn ?? null,
      filters.checkOut ?? null,
    ],
  });

  return result.rows.map(mapProperty);
}

export async function findPropertyBySlug(
  slug: string,
  options: { publishedOnly?: boolean } = {},
) {
  const result = await databaseQuery<PropertyRow>({
    name: "find-property-by-slug-range-inventory",
    text: `${propertySelect}
      WHERE property.slug = $1
        AND property.deleted_at IS NULL
        AND ($2::boolean = false OR property.status = 'published')
      LIMIT 1
    `,
    values: [slug.trim().toLowerCase(), options.publishedOnly ?? true],
  });

  return result.rows[0] ? mapProperty(result.rows[0]) : null;
}

export async function findPropertyByIdForUpdate(
  transaction: TransactionContext,
  propertyId: string,
) {
  const result = await transaction.query<PropertyRow>({
    text: `${propertySelect}
      WHERE property.id = $1
        AND property.deleted_at IS NULL
      FOR UPDATE OF property
      LIMIT 1
    `,
    values: [propertyId],
  });

  return result.rows[0] ? mapProperty(result.rows[0]) : null;
}

/**
 * Concurrent bookings may share this lock. Property-management writes wait
 * until pricing and inventory validation for the booking is complete.
 */
export async function findPropertyByIdForBooking(
  transaction: TransactionContext,
  propertyId: string,
) {
  const result = await transaction.query<PropertyRow>({
    text: `${propertySelect}
      WHERE property.id = $1
        AND property.deleted_at IS NULL
      FOR SHARE OF property
      LIMIT 1
    `,
    values: [propertyId],
  });
  return result.rows[0] ? mapProperty(result.rows[0]) : null;
}

async function syncPropertyRelations(
  transaction: TransactionContext,
  propertyId: string,
  input: Pick<PropertyWriteInput, "amenityCodes" | "images">,
  actorId: string,
) {
  await transaction.query({
    text: `DELETE FROM aureum.property_images WHERE property_id = $1`,
    values: [propertyId],
  });

  for (const [index, image] of input.images.entries()) {
    await transaction.query({
      text: `
        INSERT INTO aureum.property_images (
          property_id, image_url, alt_text_en, alt_text_zh_cn,
          display_order, is_cover, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      `,
      values: [
        propertyId,
        image.imageUrl,
        image.altTextEn,
        image.altTextZhCn ?? null,
        index,
        index === 0,
        actorId,
      ],
    });
  }

  await transaction.query({
    text: `DELETE FROM aureum.property_amenities WHERE property_id = $1`,
    values: [propertyId],
  });

  if (input.amenityCodes.length > 0) {
    const result = await transaction.query({
      text: `
        INSERT INTO aureum.property_amenities (property_id, amenity_id, created_by)
        SELECT $1, amenity.id, $3
        FROM aureum.amenities AS amenity
        WHERE amenity.code = ANY($2::text[])
          AND amenity.is_active = true
        ON CONFLICT DO NOTHING
      `,
      values: [propertyId, input.amenityCodes, actorId],
    });

    if (result.rowCount !== input.amenityCodes.length) {
      throw new Error("One or more amenity codes are invalid.");
    }
  }
}

async function createUnitTypes(
  transaction: TransactionContext,
  propertyId: string,
  unitTypes: UnitTypeWriteInput[],
  actorId: string,
) {
  for (const [sortOrder, input] of unitTypes.entries()) {
    const unitTypeResult = await transaction.query<{ id: string }>({
      text: `
        INSERT INTO aureum.unit_types (
          property_id, code, public_name_en, public_name_zh_cn,
          description_en, description_zh_cn, max_adults, max_children,
          max_guests, bedrooms, beds, bathrooms, sort_order,
          created_by, updated_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $14
        )
        RETURNING id
      `,
      values: [
        propertyId,
        input.roomKey,
        input.nameEn,
        input.nameZhCn ?? null,
        input.descriptionEn ?? null,
        input.descriptionZhCn ?? null,
        input.maxAdults,
        input.maxChildren,
        input.maxGuests,
        input.bedrooms,
        input.beds,
        input.bathrooms,
        sortOrder,
        actorId,
      ],
    });
    const unitTypeId = unitTypeResult.rows[0].id;

    for (const unit of input.units) {
      await transaction.query({
        text: `
          INSERT INTO aureum.units (
            unit_type_id, internal_code, internal_name, status, floor_label,
            created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $6)
        `,
        values: [
          unitTypeId,
          unit.internalCode,
          unit.internalName ?? null,
          unit.status,
          unit.floorLabel ?? null,
          actorId,
        ],
      });
    }

    for (const ratePlan of input.ratePlans) {
      const policy = await transaction.query<{ id: string }>({
        text: `
          SELECT id
          FROM aureum.cancellation_policies
          WHERE code = $1 AND is_active = true AND deleted_at IS NULL
        `,
        values: [ratePlan.cancellationPolicyCode],
      });

      if (!policy.rows[0]) {
        throw new Error(
          `Unknown cancellation policy: ${ratePlan.cancellationPolicyCode}`,
        );
      }

      await transaction.query({
        text: `
          INSERT INTO aureum.rate_plans (
            unit_type_id, cancellation_policy_id, code, public_name_en,
            public_name_zh_cn, base_nightly_rate, currency,
            minimum_nights, is_default, created_by, updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        `,
        values: [
          unitTypeId,
          policy.rows[0].id,
          ratePlan.rateKey,
          ratePlan.nameEn,
          ratePlan.nameZhCn ?? null,
          ratePlan.baseNightlyRate,
          ratePlan.currency,
          ratePlan.minimumNights,
          ratePlan.isDefault,
          actorId,
        ],
      });
    }
  }
}

const propertyWriteColumns = `
  slug, name, name_zh_cn, tagline_en, tagline_zh_cn,
  description_en, description_zh_cn, property_type, status, city,
  state_region, country_code, address_line_1, address_line_2, postal_code,
  timezone, currency, check_in_time, check_out_time
`;

function propertyWriteValues(input: PropertyWriteInput) {
  return [
    input.slug,
    input.name,
    input.nameZhCn ?? null,
    input.taglineEn ?? null,
    input.taglineZhCn ?? null,
    input.descriptionEn,
    input.descriptionZhCn ?? null,
    input.propertyType,
    input.status,
    input.city,
    input.stateRegion ?? null,
    input.countryCode,
    input.addressLine1 ?? null,
    input.addressLine2 ?? null,
    input.postalCode ?? null,
    input.timezone,
    input.currency,
    input.checkInTime,
    input.checkOutTime,
  ];
}

export async function createProperty(
  transaction: TransactionContext,
  input: PropertyCreateInput,
  actorId: string,
) {
  const placeholders = propertyWriteValues(input).map((_, index) => `$${index + 1}`);
  const result = await transaction.query<{ id: string }>({
    text: `
      INSERT INTO aureum.properties (
        ${propertyWriteColumns}, created_by, updated_by, published_at
      )
      VALUES (${placeholders.join(", ")}, $20, $20,
        CASE WHEN $9::aureum.property_status = 'published' THEN now() ELSE NULL END)
      RETURNING id
    `,
    values: [...propertyWriteValues(input), actorId],
  });
  const propertyId = result.rows[0].id;
  await syncPropertyRelations(transaction, propertyId, input, actorId);
  await createUnitTypes(transaction, propertyId, input.unitTypes, actorId);
  return propertyId;
}

export async function updateProperty(
  transaction: TransactionContext,
  propertyId: string,
  input: PropertyWriteInput,
  actorId: string,
) {
  const assignments = propertyWriteColumns
    .split(",")
    .map((column) => column.trim())
    .map((column, index) => `${column} = $${index + 2}`)
    .join(", ");
  const result = await transaction.query<{ id: string }>({
    text: `
      UPDATE aureum.properties
      SET ${assignments},
        updated_by = $21,
        published_at = CASE
          WHEN $10::aureum.property_status = 'published'
            THEN COALESCE(published_at, now())
          ELSE published_at
        END
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    values: [propertyId, ...propertyWriteValues(input), actorId],
  });

  if (!result.rows[0]) return false;
  await syncPropertyRelations(transaction, propertyId, input, actorId);
  return true;
}

export async function archiveProperty(
  transaction: TransactionContext,
  propertyId: string,
  actorId: string,
) {
  const result = await transaction.query({
    text: `
      UPDATE aureum.properties
      SET status = 'archived', deleted_at = now(), updated_by = $2
      WHERE id = $1 AND deleted_at IS NULL
    `,
    values: [propertyId, actorId],
  });
  return result.rowCount === 1;
}

export async function listActiveAmenityCodes() {
  const result = await databaseQuery<{ code: string }>({
    name: "list-active-amenity-codes",
    text: `SELECT code FROM aureum.amenities WHERE is_active = true ORDER BY code`,
    values: [],
  });
  return result.rows.map((row) => row.code);
}

export async function propertyHasActiveReservations(
  transaction: TransactionContext,
  propertyId: string,
) {
  const result = await transaction.query<{ found: boolean }>({
    text: `
      SELECT EXISTS (
        SELECT 1 FROM aureum.reservations
        WHERE property_id = $1
          AND (
            status = 'confirmed'
            OR (status = 'pending' AND hold_expires_at > now())
          )
          AND check_out > CURRENT_DATE
      ) AS found
    `,
    values: [propertyId],
  });
  return result.rows[0]?.found ?? false;
}
