import "server-only";

import type { QueryResultRow } from "pg";

import type {
  ChargeCalculation,
  InventoryDay,
  UnitBlockReason,
  UnitStatus,
} from "../models";
import { databaseQuery, type TransactionContext } from "../query";

type InventoryWindowRow = QueryResultRow & {
  room_key: string;
  room_name_en: string;
  room_name_zh_cn: string | null;
  max_adults: number;
  max_children: number;
  max_guests: number;
  inventory_count: number;
  rate_key: string;
  rate_name_en: string;
  rate_name_zh_cn: string | null;
  currency: string;
  date: string;
  remaining_units: number;
  nightly_rate: string;
  minimum_nights: number;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
};

export type InventoryRateWindow = {
  rateKey: string;
  nameEn: string;
  nameZhCn: string | null;
  currency: string;
  days: InventoryDay[];
};

export type InventoryRoomWindow = {
  roomKey: string;
  nameEn: string;
  nameZhCn: string | null;
  maxAdults: number;
  maxChildren: number;
  maxGuests: number;
  inventoryCount: number;
  ratePlans: InventoryRateWindow[];
};

function groupInventory(rows: InventoryWindowRow[]): InventoryRoomWindow[] {
  const rooms = new Map<string, InventoryRoomWindow>();

  for (const row of rows) {
    let room = rooms.get(row.room_key);
    if (!room) {
      room = {
        inventoryCount: Number(row.inventory_count),
        maxAdults: row.max_adults,
        maxChildren: row.max_children,
        maxGuests: row.max_guests,
        nameEn: row.room_name_en,
        nameZhCn: row.room_name_zh_cn,
        ratePlans: [],
        roomKey: row.room_key,
      };
      rooms.set(row.room_key, room);
    }

    let ratePlan = room.ratePlans.find((rate) => rate.rateKey === row.rate_key);
    if (!ratePlan) {
      ratePlan = {
        currency: row.currency,
        days: [],
        nameEn: row.rate_name_en,
        nameZhCn: row.rate_name_zh_cn,
        rateKey: row.rate_key,
      };
      room.ratePlans.push(ratePlan);
    }

    ratePlan.days.push({
      closedToArrival: row.closed_to_arrival,
      closedToDeparture: row.closed_to_departure,
      date: row.date,
      minimumNights: row.minimum_nights,
      nightlyRate: row.nightly_rate,
      remainingUnits: Number(row.remaining_units),
    });
  }

  return [...rooms.values()];
}

const inventoryWindowSql = `
  SELECT
    unit_type.code AS room_key,
    unit_type.public_name_en AS room_name_en,
    unit_type.public_name_zh_cn AS room_name_zh_cn,
    unit_type.max_adults,
    unit_type.max_children,
    unit_type.max_guests,
    aureum.unit_type_inventory_count(unit_type.id) AS inventory_count,
    rate_plan.code AS rate_key,
    rate_plan.public_name_en AS rate_name_en,
    rate_plan.public_name_zh_cn AS rate_name_zh_cn,
    rate_plan.currency,
    requested.day::date::text AS date,
    aureum.unit_type_remaining_units(unit_type.id, requested.day::date)
      AS remaining_units,
    aureum.rate_plan_nightly_price(rate_plan.id, requested.day::date)
      AS nightly_rate,
    COALESCE(period.minimum_nights, rate_plan.minimum_nights) AS minimum_nights,
    COALESCE(period.closed_to_arrival, false) AS closed_to_arrival,
    COALESCE(period.closed_to_departure, false) AS closed_to_departure
  FROM aureum.unit_types AS unit_type
  JOIN aureum.rate_plans AS rate_plan
    ON rate_plan.unit_type_id = unit_type.id
    AND rate_plan.is_active = true
    AND rate_plan.deleted_at IS NULL
  CROSS JOIN LATERAL generate_series(
    $2::date,
    $3::date - 1,
    interval '1 day'
  ) AS requested(day)
  LEFT JOIN LATERAL (
    SELECT
      rate_period.minimum_nights,
      rate_period.closed_to_arrival,
      rate_period.closed_to_departure
    FROM aureum.rate_periods AS rate_period
    WHERE rate_period.rate_plan_id = rate_plan.id
      AND requested.day::date <@ rate_period.stay_period
    LIMIT 1
  ) AS period ON true
  WHERE unit_type.property_id = $1
    AND unit_type.is_active = true
    AND unit_type.deleted_at IS NULL
    AND ($4::text IS NULL OR unit_type.code = $4)
  ORDER BY unit_type.sort_order, unit_type.public_name_en,
    rate_plan.is_default DESC, rate_plan.public_name_en, requested.day
`;

export async function getInventoryWindow(
  propertyId: string,
  from: string,
  to: string,
  roomKey?: string,
) {
  const result = await databaseQuery<InventoryWindowRow>({
    name: "get-computed-inventory-window",
    text: inventoryWindowSql,
    values: [propertyId, from, to, roomKey ?? null],
  });
  return groupInventory(result.rows);
}

export type LockedRoomRate = {
  unitTypeId: string;
  roomKey: string;
  roomName: string;
  maxAdults: number;
  maxChildren: number;
  maxGuests: number;
  ratePlanId: string;
  rateKey: string;
  rateName: string;
  baseNightlyRate: string;
  currency: string;
  minimumNights: number;
  isDefault: boolean;
  cancellationPolicy: Record<string, unknown> | null;
};

type LockedRoomRateRow = QueryResultRow & {
  unit_type_id: string;
  room_key: string;
  room_name: string;
  max_adults: number;
  max_children: number;
  max_guests: number;
  rate_plan_id: string;
  rate_key: string;
  rate_name: string;
  base_nightly_rate: string;
  currency: string;
  minimum_nights: number;
  is_default: boolean;
  cancellation_policy: Record<string, unknown> | null;
};

export async function lockRoomRatesForBooking(
  transaction: TransactionContext,
  propertyId: string,
  roomKeys: string[],
) {
  const result = await transaction.query<LockedRoomRateRow>({
    text: `
      SELECT
        unit_type.id AS unit_type_id,
        unit_type.code AS room_key,
        unit_type.public_name_en AS room_name,
        unit_type.max_adults,
        unit_type.max_children,
        unit_type.max_guests,
        rate_plan.id AS rate_plan_id,
        rate_plan.code AS rate_key,
        rate_plan.public_name_en AS rate_name,
        rate_plan.base_nightly_rate,
        rate_plan.currency,
        rate_plan.minimum_nights,
        rate_plan.is_default,
        CASE
          WHEN policy.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'code', policy.code,
            'name', policy.name_en,
            'description', policy.description_en,
            'noShowRefundPercentage', policy.no_show_refund_percentage,
            'rules', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'daysBeforeCheckIn', rule.days_before_check_in,
                  'refundPercentage', rule.refund_percentage
                ) ORDER BY rule.days_before_check_in DESC
              )
              FROM aureum.cancellation_policy_rules AS rule
              WHERE rule.cancellation_policy_id = policy.id
            ), '[]'::jsonb)
          )
        END AS cancellation_policy
      FROM aureum.unit_types AS unit_type
      JOIN aureum.rate_plans AS rate_plan
        ON rate_plan.unit_type_id = unit_type.id
        AND rate_plan.is_active = true
        AND rate_plan.deleted_at IS NULL
      LEFT JOIN aureum.cancellation_policies AS policy
        ON policy.id = rate_plan.cancellation_policy_id
        AND policy.is_active = true
        AND policy.deleted_at IS NULL
      WHERE unit_type.property_id = $1
        AND unit_type.code = ANY($2::text[])
        AND unit_type.is_active = true
        AND unit_type.deleted_at IS NULL
      ORDER BY unit_type.id, rate_plan.id
      FOR UPDATE OF unit_type, rate_plan
    `,
    values: [propertyId, roomKeys],
  });

  return result.rows.map<LockedRoomRate>((row) => ({
    baseNightlyRate: row.base_nightly_rate,
    cancellationPolicy: row.cancellation_policy,
    currency: row.currency,
    maxAdults: row.max_adults,
    maxChildren: row.max_children,
    maxGuests: row.max_guests,
    minimumNights: row.minimum_nights,
    isDefault: row.is_default,
    rateKey: row.rate_key,
    rateName: row.rate_name,
    ratePlanId: row.rate_plan_id,
    roomKey: row.room_key,
    roomName: row.room_name,
    unitTypeId: row.unit_type_id,
  }));
}

export async function getLockedInventoryDays(
  transaction: TransactionContext,
  unitTypeId: string,
  ratePlanId: string,
  from: string,
  to: string,
) {
  const result = await transaction.query<
    QueryResultRow & {
      date: string;
      remaining_units: number;
      nightly_rate: string;
      minimum_nights: number;
      closed_to_arrival: boolean;
      closed_to_departure: boolean;
    }
  >({
    text: `
      SELECT
        requested.day::date::text AS date,
        aureum.unit_type_remaining_units($1, requested.day::date)
          AS remaining_units,
        aureum.rate_plan_nightly_price($2, requested.day::date) AS nightly_rate,
        COALESCE(period.minimum_nights, rate_plan.minimum_nights) AS minimum_nights,
        COALESCE(period.closed_to_arrival, false) AS closed_to_arrival,
        COALESCE(period.closed_to_departure, false) AS closed_to_departure
      FROM aureum.rate_plans AS rate_plan
      CROSS JOIN LATERAL generate_series(
        $3::date,
        $4::date,
        interval '1 day'
      ) AS requested(day)
      LEFT JOIN LATERAL (
        SELECT
          rate_period.minimum_nights,
          rate_period.closed_to_arrival,
          rate_period.closed_to_departure
        FROM aureum.rate_periods AS rate_period
        WHERE rate_period.rate_plan_id = rate_plan.id
          AND requested.day::date <@ rate_period.stay_period
        LIMIT 1
      ) AS period ON true
      WHERE rate_plan.id = $2
      ORDER BY requested.day
    `,
    values: [unitTypeId, ratePlanId, from, to],
  });

  return result.rows.map<InventoryDay>((row) => ({
    closedToArrival: row.closed_to_arrival,
    closedToDeparture: row.closed_to_departure,
    date: row.date,
    minimumNights: row.minimum_nights,
    nightlyRate: row.nightly_rate,
    remainingUnits: Number(row.remaining_units),
  }));
}

export type ReservationInventoryConflict = {
  availableUnits: number;
  date: string;
  requiredUnits: number;
  roomName: string;
};

export async function findReservationInventoryConflict(
  transaction: TransactionContext,
  reservationId: string,
) {
  // Confirmation and hold creation take the same deterministic room-type locks.
  // This prevents a concurrent booking from slipping between the final check and
  // the reservation status update.
  await transaction.query({
    text: `
      SELECT unit_type.id
      FROM aureum.unit_types AS unit_type
      WHERE EXISTS (
        SELECT 1
        FROM aureum.reservation_items AS item
        WHERE item.reservation_id = $1
          AND item.unit_type_id = unit_type.id
      )
      ORDER BY unit_type.id
      FOR UPDATE OF unit_type
    `,
    values: [reservationId],
  });

  const result = await transaction.query<
    QueryResultRow & {
      available_units: number;
      date: string;
      required_units: number;
      room_name: string;
    }
  >({
    text: `
      WITH requested AS (
        SELECT
          item.unit_type_id,
          max(item.unit_name_snapshot) AS room_name,
          sum(item.quantity)::integer AS required_units
        FROM aureum.reservation_items AS item
        WHERE item.reservation_id = $1
        GROUP BY item.unit_type_id
      ), reservation_window AS (
        SELECT check_in, check_out
        FROM aureum.reservations
        WHERE id = $1
      ), requested_dates AS (
        SELECT day::date AS date
        FROM reservation_window
        CROSS JOIN LATERAL generate_series(
          check_in,
          check_out - 1,
          interval '1 day'
        ) AS day
      )
      SELECT
        requested.room_name,
        requested.required_units,
        requested_dates.date::text AS date,
        GREATEST(0, (
          SELECT count(*)::integer
          FROM aureum.units AS unit
          WHERE unit.unit_type_id = requested.unit_type_id
            AND unit.status = 'operational'
            AND unit.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM aureum.unit_blocks AS block
              WHERE block.unit_id = unit.id
                AND block.deleted_at IS NULL
                AND requested_dates.date <@ block.stay_period
            )
        ) - COALESCE((
          SELECT sum(other_item.quantity)::integer
          FROM aureum.reservation_items AS other_item
          JOIN aureum.reservations AS other_reservation
            ON other_reservation.id = other_item.reservation_id
          WHERE other_item.unit_type_id = requested.unit_type_id
            AND other_reservation.id <> $1
            AND requested_dates.date <@ other_reservation.stay_period
            AND (
              other_reservation.status = 'confirmed'
              OR (
                other_reservation.status = 'pending'
                AND other_reservation.hold_expires_at > statement_timestamp()
              )
            )
        ), 0))::integer AS available_units
      FROM requested
      CROSS JOIN requested_dates
      WHERE GREATEST(0, (
          SELECT count(*)::integer
          FROM aureum.units AS unit
          WHERE unit.unit_type_id = requested.unit_type_id
            AND unit.status = 'operational'
            AND unit.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM aureum.unit_blocks AS block
              WHERE block.unit_id = unit.id
                AND block.deleted_at IS NULL
                AND requested_dates.date <@ block.stay_period
            )
        ) - COALESCE((
          SELECT sum(other_item.quantity)::integer
          FROM aureum.reservation_items AS other_item
          JOIN aureum.reservations AS other_reservation
            ON other_reservation.id = other_item.reservation_id
          WHERE other_item.unit_type_id = requested.unit_type_id
            AND other_reservation.id <> $1
            AND requested_dates.date <@ other_reservation.stay_period
            AND (
              other_reservation.status = 'confirmed'
              OR (
                other_reservation.status = 'pending'
                AND other_reservation.hold_expires_at > statement_timestamp()
              )
            )
        ), 0)) < requested.required_units
      ORDER BY requested_dates.date, requested.room_name
      LIMIT 1
    `,
    values: [reservationId],
  });
  const conflict = result.rows[0];
  return conflict
    ? {
        availableUnits: Number(conflict.available_units),
        date: conflict.date,
        requiredUnits: Number(conflict.required_units),
        roomName: conflict.room_name,
      }
    : null;
}

export type PricingRule = {
  id: string;
  unitTypeId: string | null;
  code: string;
  name: string;
  calculation: ChargeCalculation;
  amount: string;
  includedInPrice: boolean;
  isTaxable: boolean;
};

type PricingRuleRow = QueryResultRow & {
  id: string;
  unit_type_id: string | null;
  code: string;
  name: string;
  calculation: ChargeCalculation;
  amount: string;
  included_in_price: boolean;
  is_taxable: boolean;
};

export async function listActiveFeeRules(
  transaction: TransactionContext,
  propertyId: string,
  checkIn: string,
) {
  const result = await transaction.query<PricingRuleRow>({
    text: `
      SELECT
        id, unit_type_id, code, public_name_en AS name, calculation, amount,
        false AS included_in_price, is_taxable
      FROM aureum.fee_rules
      WHERE property_id = $1
        AND is_active = true
        AND is_mandatory = true
        AND deleted_at IS NULL
        AND (valid_from IS NULL OR valid_from <= $2::date)
        AND (valid_to IS NULL OR valid_to > $2::date)
      ORDER BY priority, code
    `,
    values: [propertyId, checkIn],
  });
  return result.rows.map<PricingRule>((row) => ({
    amount: row.amount,
    calculation: row.calculation,
    code: row.code,
    id: row.id,
    includedInPrice: false,
    isTaxable: row.is_taxable,
    name: row.name,
    unitTypeId: row.unit_type_id,
  }));
}

export async function listActiveTaxRules(
  transaction: TransactionContext,
  propertyId: string,
  checkIn: string,
) {
  const result = await transaction.query<PricingRuleRow>({
    text: `
      SELECT
        id, NULL::uuid AS unit_type_id, code, public_name_en AS name,
        calculation, amount, included_in_price, false AS is_taxable
      FROM aureum.tax_rules
      WHERE property_id = $1
        AND is_active = true
        AND deleted_at IS NULL
        AND (valid_from IS NULL OR valid_from <= $2::date)
        AND (valid_to IS NULL OR valid_to > $2::date)
      ORDER BY priority, code
    `,
    values: [propertyId, checkIn],
  });
  return result.rows.map<PricingRule>((row) => ({
    amount: row.amount,
    calculation: row.calculation,
    code: row.code,
    id: row.id,
    includedInPrice: row.included_in_price,
    isTaxable: false,
    name: row.name,
    unitTypeId: null,
  }));
}

export type InternalRoom = {
  id: string;
  roomKey: string;
  roomName: string;
  internalCode: string;
  internalName: string | null;
  floorLabel: string | null;
  status: UnitStatus;
};

export async function listInternalRooms(propertyId: string) {
  const result = await databaseQuery<
    QueryResultRow & {
      id: string;
      room_key: string;
      room_name: string;
      internal_code: string;
      internal_name: string | null;
      floor_label: string | null;
      status: UnitStatus;
    }
  >({
    name: "list-internal-property-rooms",
    text: `
      SELECT
        unit.id, unit_type.code AS room_key,
        unit_type.public_name_en AS room_name, unit.internal_code,
        unit.internal_name, unit.floor_label, unit.status
      FROM aureum.units AS unit
      JOIN aureum.unit_types AS unit_type ON unit_type.id = unit.unit_type_id
      WHERE unit_type.property_id = $1
        AND unit.deleted_at IS NULL
        AND unit_type.deleted_at IS NULL
      ORDER BY unit_type.sort_order, unit.internal_code
    `,
    values: [propertyId],
  });
  return result.rows.map<InternalRoom>((row) => ({
    floorLabel: row.floor_label,
    id: row.id,
    internalCode: row.internal_code,
    internalName: row.internal_name,
    roomKey: row.room_key,
    roomName: row.room_name,
    status: row.status,
  }));
}

export async function updateInternalRoomStatus(
  transaction: TransactionContext,
  propertyId: string,
  unitId: string,
  status: UnitStatus,
  actorId: string,
) {
  const result = await transaction.query({
    text: `
      UPDATE aureum.units AS unit
      SET status = $3, updated_by = $4
      FROM aureum.unit_types AS unit_type
      WHERE unit.id = $2
        AND unit.unit_type_id = unit_type.id
        AND unit_type.property_id = $1
        AND unit.deleted_at IS NULL
      RETURNING unit.id
    `,
    values: [propertyId, unitId, status, actorId],
  });
  return Boolean(result.rowCount);
}

export async function createUnitBlock(
  transaction: TransactionContext,
  input: {
    propertyId: string;
    unitId: string;
    startDate: string;
    endDate: string;
    reason: UnitBlockReason;
    note?: string | null;
    externalReference?: string | null;
    actorId: string;
  },
) {
  const result = await transaction.query<{ id: string }>({
    text: `
      INSERT INTO aureum.unit_blocks (
        unit_id, start_date, end_date, reason, note, external_reference,
        created_by, updated_by
      )
      SELECT unit.id, $3::date, $4::date, $5, $6, $7, $8, $8
      FROM aureum.units AS unit
      JOIN aureum.unit_types AS unit_type ON unit_type.id = unit.unit_type_id
      WHERE unit.id = $2
        AND unit_type.property_id = $1
        AND unit.deleted_at IS NULL
      RETURNING id
    `,
    values: [
      input.propertyId,
      input.unitId,
      input.startDate,
      input.endDate,
      input.reason,
      input.note ?? null,
      input.externalReference ?? null,
      input.actorId,
    ],
  });
  return result.rows[0]?.id ?? null;
}

export type InternalRoomBlock = {
  id: string;
  unitId: string;
  internalCode: string;
  roomName: string;
  startDate: string;
  endDate: string;
  reason: UnitBlockReason;
  note: string | null;
  externalReference: string | null;
};

export async function listUnitBlocks(propertyId: string, from?: string) {
  const result = await databaseQuery<
    QueryResultRow & {
      id: string;
      unit_id: string;
      internal_code: string;
      room_name: string;
      start_date: string;
      end_date: string;
      reason: UnitBlockReason;
      note: string | null;
      external_reference: string | null;
    }
  >({
    name: "list-property-room-blocks",
    text: `
      SELECT
        block.id,
        block.unit_id,
        unit.internal_code,
        unit_type.public_name_en AS room_name,
        block.start_date::text,
        block.end_date::text,
        block.reason,
        block.note,
        block.external_reference
      FROM aureum.unit_blocks AS block
      JOIN aureum.units AS unit ON unit.id = block.unit_id
      JOIN aureum.unit_types AS unit_type ON unit_type.id = unit.unit_type_id
      WHERE unit_type.property_id = $1
        AND block.deleted_at IS NULL
        AND ($2::date IS NULL OR block.end_date > $2::date)
      ORDER BY block.start_date, unit.internal_code
    `,
    values: [propertyId, from ?? null],
  });
  return result.rows.map<InternalRoomBlock>((row) => ({
    endDate: row.end_date,
    externalReference: row.external_reference,
    id: row.id,
    internalCode: row.internal_code,
    note: row.note,
    reason: row.reason,
    roomName: row.room_name,
    startDate: row.start_date,
    unitId: row.unit_id,
  }));
}

export async function deleteUnitBlock(
  transaction: TransactionContext,
  propertyId: string,
  blockId: string,
  actorId: string,
) {
  const result = await transaction.query({
    text: `
      UPDATE aureum.unit_blocks AS block
      SET deleted_at = now(), updated_by = $3
      FROM aureum.units AS unit
      JOIN aureum.unit_types AS unit_type ON unit_type.id = unit.unit_type_id
      WHERE block.id = $2
        AND block.unit_id = unit.id
        AND unit_type.property_id = $1
        AND block.deleted_at IS NULL
    `,
    values: [propertyId, blockId, actorId],
  });
  return Boolean(result.rowCount);
}
