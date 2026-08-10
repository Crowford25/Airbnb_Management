import "server-only";

import type { QueryResultRow } from "pg";

import type { AuthRole } from "@/features/auth/types";

import type { ReservationStatus } from "../models";
import { databaseQuery } from "../query";

export type AdminDashboardSummary = {
  activeCustomers: number;
  arrivalsToday: number;
  departuresToday: number;
  monthRevenue: string;
  occupancyPercentage: number;
  pendingHolds: number;
  publishedProperties: number;
  roomsAvailableToday: number;
};

export type WorkerMonitoringRecord = {
  lastError: string | null;
  lastHeartbeatAt: string;
  lastSuccessAt: string | null;
  status: "degraded" | "healthy" | "stale" | "stopped";
  workerName: "hold-expiry" | "notifications";
};

export async function listWorkerMonitoring() {
  const result = await databaseQuery<
    QueryResultRow & {
      effective_status: WorkerMonitoringRecord["status"];
      last_error_message: string | null;
      last_heartbeat_at: Date;
      last_success_at: Date | null;
      worker_name: WorkerMonitoringRecord["workerName"];
    }
  >({
    name: "admin-worker-monitoring",
    text: `
      WITH latest AS (
        SELECT DISTINCT ON (worker_name)
          worker_name, status, details, last_heartbeat_at,
          last_success_at, last_error_message
        FROM aureum.worker_heartbeats
        ORDER BY worker_name, last_heartbeat_at DESC
      )
      SELECT
        worker_name,
        last_heartbeat_at,
        last_success_at,
        last_error_message,
        CASE
          WHEN status = 'stopped' THEN 'stopped'
          WHEN last_heartbeat_at < now() - (
            LEAST(3600000, GREATEST(5000, CASE
              WHEN details ->> 'heartbeatIntervalMs' ~ '^[0-9]+$'
                THEN (details ->> 'heartbeatIntervalMs')::integer
              ELSE 30000
            END) * 3) * interval '1 millisecond'
          ) THEN 'stale'
          ELSE status
        END AS effective_status
      FROM latest
      ORDER BY worker_name
    `,
    values: [],
  });
  return result.rows.map<WorkerMonitoringRecord>((row) => ({
    lastError: row.last_error_message,
    lastHeartbeatAt: row.last_heartbeat_at.toISOString(),
    lastSuccessAt: row.last_success_at?.toISOString() ?? null,
    status: row.effective_status,
    workerName: row.worker_name,
  }));
}

export async function getAdminDashboardSummary() {
  const result = await databaseQuery<
    QueryResultRow & {
      active_customers: number;
      arrivals_today: number;
      departures_today: number;
      month_revenue: string;
      occupancy_percentage: string;
      pending_holds: number;
      published_properties: number;
      rooms_available_today: number;
    }
  >({
    name: "admin-dashboard-summary",
    text: `
      WITH month_window AS (
        SELECT
          date_trunc('month', current_date)::date AS start_date,
          (date_trunc('month', current_date) + interval '1 month')::date AS end_date
      ),
      sellable_room_nights AS (
        SELECT count(*)::numeric AS total
        FROM aureum.unit_types AS unit_type
        JOIN aureum.units AS unit
          ON unit.unit_type_id = unit_type.id
          AND unit.status = 'operational'
          AND unit.deleted_at IS NULL
        CROSS JOIN month_window
        CROSS JOIN LATERAL generate_series(
          month_window.start_date,
          month_window.end_date - 1,
          interval '1 day'
        ) AS inventory_day(day)
        WHERE unit_type.is_active = true
          AND unit_type.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM aureum.unit_blocks AS block
            WHERE block.unit_id = unit.id
              AND block.deleted_at IS NULL
              AND block.start_date <= inventory_day.day::date
              AND block.end_date > inventory_day.day::date
          )
      ),
      occupied_room_nights AS (
        SELECT COALESCE(sum(
          item.quantity * GREATEST(
            0,
            LEAST(reservation.check_out, month_window.end_date)
              - GREATEST(reservation.check_in, month_window.start_date)
          )
        ), 0)::numeric AS total
        FROM aureum.reservation_items AS item
        JOIN aureum.reservations AS reservation ON reservation.id = item.reservation_id
        CROSS JOIN month_window
        WHERE reservation.status IN ('confirmed', 'completed')
          AND reservation.check_in < month_window.end_date
          AND reservation.check_out > month_window.start_date
      )
      SELECT
        (SELECT count(*)::integer FROM aureum.users
          WHERE role = 'customer' AND is_active = true AND deleted_at IS NULL)
          AS active_customers,
        (SELECT count(*)::integer FROM aureum.properties
          WHERE status = 'published' AND deleted_at IS NULL)
          AS published_properties,
        (SELECT count(*)::integer FROM aureum.reservations
          WHERE status = 'pending' AND hold_expires_at > now()) AS pending_holds,
        (SELECT count(*)::integer FROM aureum.reservations
          WHERE status = 'confirmed' AND check_in = current_date) AS arrivals_today,
        (SELECT count(*)::integer FROM aureum.reservations
          WHERE status = 'confirmed' AND check_out = current_date) AS departures_today,
        (SELECT COALESCE(sum(total_amount), 0)::numeric(14,2)::text
          FROM aureum.reservations, month_window
          WHERE status IN ('confirmed', 'completed')
            AND created_at >= month_window.start_date
            AND created_at < month_window.end_date) AS month_revenue,
        (SELECT COALESCE(sum(
          aureum.unit_type_remaining_units(unit_type.id, current_date)
        ), 0)::integer
          FROM aureum.unit_types AS unit_type
          WHERE unit_type.is_active = true AND unit_type.deleted_at IS NULL)
          AS rooms_available_today,
        CASE
          WHEN sellable_room_nights.total = 0 THEN 0
          ELSE round(
            occupied_room_nights.total / sellable_room_nights.total * 100,
            1
          )
        END::text AS occupancy_percentage
      FROM sellable_room_nights, occupied_room_nights
    `,
    values: [],
  });
  const row = result.rows[0];
  return {
    activeCustomers: row?.active_customers ?? 0,
    arrivalsToday: row?.arrivals_today ?? 0,
    departuresToday: row?.departures_today ?? 0,
    monthRevenue: row?.month_revenue ?? "0.00",
    occupancyPercentage: Number(row?.occupancy_percentage ?? 0),
    pendingHolds: row?.pending_holds ?? 0,
    publishedProperties: row?.published_properties ?? 0,
    roomsAvailableToday: row?.rooms_available_today ?? 0,
  } satisfies AdminDashboardSummary;
}

export type OperationalReservation = {
  bookingReference: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  propertyName: string;
  rooms: string;
  status: ReservationStatus;
  totalAmount: string;
  currency: string;
};

export async function listOperationalReservations(days = 14) {
  const result = await databaseQuery<
    QueryResultRow & {
      booking_reference: string;
      check_in: string;
      check_out: string;
      guest_name: string;
      property_name: string;
      rooms: string;
      status: ReservationStatus;
      total_amount: string;
      currency: string;
    }
  >({
    name: "admin-upcoming-operations",
    text: `
      SELECT
        reservation.booking_reference,
        reservation.check_in::text,
        reservation.check_out::text,
        reservation.guest_name,
        property.name AS property_name,
        COALESCE(string_agg(
          item.quantity || ' × ' || item.unit_name_snapshot,
          ', ' ORDER BY item.unit_name_snapshot
        ), 'No room item') AS rooms,
        reservation.status,
        reservation.total_amount,
        reservation.currency
      FROM aureum.reservations AS reservation
      JOIN aureum.properties AS property ON property.id = reservation.property_id
      LEFT JOIN aureum.reservation_items AS item
        ON item.reservation_id = reservation.id
      WHERE reservation.check_out >= current_date
        AND reservation.check_in < current_date + $1::integer
        AND reservation.status IN ('pending', 'confirmed')
      GROUP BY reservation.id, property.name
      ORDER BY reservation.check_in, reservation.created_at
      LIMIT 100
    `,
    values: [days],
  });
  return result.rows.map<OperationalReservation>((row) => ({
    bookingReference: row.booking_reference,
    checkIn: row.check_in,
    checkOut: row.check_out,
    currency: row.currency,
    guestName: row.guest_name,
    propertyName: row.property_name,
    rooms: row.rooms,
    status: row.status,
    totalAmount: row.total_amount,
  }));
}

export type MonthlyPerformance = {
  month: string;
  bookings: number;
  revenue: string;
  roomNights: number;
};

export async function listMonthlyPerformance(months = 6) {
  const result = await databaseQuery<
    QueryResultRow & {
      month: string;
      bookings: number;
      revenue: string;
      room_nights: number;
    }
  >({
    name: "admin-monthly-performance",
    text: `
      WITH months AS (
        SELECT generated::date AS month_start
        FROM generate_series(
          date_trunc('month', current_date) - (($1::integer - 1) * interval '1 month'),
          date_trunc('month', current_date),
          interval '1 month'
        ) AS generated
      ),
      reservation_totals AS (
        SELECT
          date_trunc('month', reservation.created_at)::date AS month_start,
          count(*)::integer AS bookings,
          sum(reservation.total_amount)::numeric(14,2) AS revenue
        FROM aureum.reservations AS reservation
        WHERE reservation.status IN ('confirmed', 'completed')
        GROUP BY date_trunc('month', reservation.created_at)::date
      ),
      room_totals AS (
        SELECT
          date_trunc('month', reservation.created_at)::date AS month_start,
          sum(item.quantity * reservation.nights)::integer AS room_nights
        FROM aureum.reservations AS reservation
        JOIN aureum.reservation_items AS item
          ON item.reservation_id = reservation.id
        WHERE reservation.status IN ('confirmed', 'completed')
        GROUP BY date_trunc('month', reservation.created_at)::date
      )
      SELECT
        to_char(months.month_start, 'YYYY-MM') AS month,
        COALESCE(reservation_totals.bookings, 0)::integer AS bookings,
        COALESCE(reservation_totals.revenue, 0)::numeric(14,2)::text AS revenue,
        COALESCE(room_totals.room_nights, 0)::integer AS room_nights
      FROM months
      LEFT JOIN reservation_totals
        ON reservation_totals.month_start = months.month_start
      LEFT JOIN room_totals ON room_totals.month_start = months.month_start
      ORDER BY months.month_start
    `,
    values: [months],
  });
  return result.rows.map<MonthlyPerformance>((row) => ({
    bookings: row.bookings,
    month: row.month,
    revenue: row.revenue,
    roomNights: row.room_nights,
  }));
}

export type PropertyPerformance = {
  bookings: number;
  occupancyPercentage: number;
  propertyName: string;
  revenue: string;
  roomNights: number;
};

export async function listPropertyPerformance() {
  const result = await databaseQuery<
    QueryResultRow & {
      bookings: number;
      occupancy_percentage: string;
      property_name: string;
      revenue: string;
      room_nights: number;
    }
  >({
    name: "admin-property-performance",
    text: `
      WITH month_window AS (
        SELECT
          date_trunc('month', current_date)::date AS start_date,
          (date_trunc('month', current_date) + interval '1 month')::date AS end_date
      ),
      property_capacity AS (
        SELECT
          property.id,
          count(unit.id)::integer AS room_nights
        FROM aureum.properties AS property
        CROSS JOIN month_window
        LEFT JOIN aureum.unit_types AS unit_type
          ON unit_type.property_id = property.id
          AND unit_type.is_active = true
          AND unit_type.deleted_at IS NULL
        LEFT JOIN aureum.units AS unit
          ON unit.unit_type_id = unit_type.id
          AND unit.status = 'operational'
          AND unit.deleted_at IS NULL
        CROSS JOIN LATERAL generate_series(
          month_window.start_date,
          month_window.end_date - 1,
          interval '1 day'
        ) AS inventory_day(day)
        WHERE property.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM aureum.unit_blocks AS block
            WHERE block.unit_id = unit.id
              AND block.deleted_at IS NULL
              AND block.start_date <= inventory_day.day::date
              AND block.end_date > inventory_day.day::date
          )
        GROUP BY property.id, month_window.end_date, month_window.start_date
      ),
      reservation_revenue AS (
        SELECT
          reservation.property_id,
          count(*)::integer AS bookings,
          sum(reservation.total_amount)::numeric(14,2) AS revenue
        FROM aureum.reservations AS reservation
        CROSS JOIN month_window
        WHERE reservation.status IN ('confirmed', 'completed')
          AND reservation.created_at >= month_window.start_date
          AND reservation.created_at < month_window.end_date
        GROUP BY reservation.property_id
      ),
      occupied_rooms AS (
        SELECT
          reservation.property_id,
          COALESCE(sum(
            item.quantity * GREATEST(
              0,
              LEAST(reservation.check_out, month_window.end_date)
                - GREATEST(reservation.check_in, month_window.start_date)
            )
          ), 0)::integer AS occupied_room_nights
        FROM aureum.reservations AS reservation
        JOIN aureum.reservation_items AS item
          ON item.reservation_id = reservation.id
        CROSS JOIN month_window
        WHERE reservation.status IN ('confirmed', 'completed')
          AND reservation.check_in < month_window.end_date
          AND reservation.check_out > month_window.start_date
        GROUP BY reservation.property_id
      )
      SELECT
        property.name AS property_name,
        COALESCE(revenue.bookings, 0)::integer AS bookings,
        COALESCE(revenue.revenue, 0)::numeric(14,2)::text AS revenue,
        COALESCE(occupied.occupied_room_nights, 0)::integer AS room_nights,
        CASE
          WHEN capacity.room_nights = 0 THEN 0
          ELSE round(
            COALESCE(occupied.occupied_room_nights, 0)::numeric
              / capacity.room_nights * 100,
            1
          )
        END::text AS occupancy_percentage
      FROM aureum.properties AS property
      JOIN property_capacity AS capacity ON capacity.id = property.id
      LEFT JOIN reservation_revenue AS revenue ON revenue.property_id = property.id
      LEFT JOIN occupied_rooms AS occupied ON occupied.property_id = property.id
      WHERE property.deleted_at IS NULL
      ORDER BY property.name
    `,
    values: [],
  });
  return result.rows.map<PropertyPerformance>((row) => ({
    bookings: row.bookings,
    occupancyPercentage: Number(row.occupancy_percentage),
    propertyName: row.property_name,
    revenue: row.revenue,
    roomNights: row.room_nights,
  }));
}

export type AuditEventRecord = {
  action: string;
  actorName: string | null;
  entityType: string;
  occurredAt: string;
};

export async function listRecentAuditEvents(limit = 50) {
  const result = await databaseQuery<
    QueryResultRow & {
      action: string;
      actor_name: string | null;
      entity_type: string;
      occurred_at: Date;
    }
  >({
    name: "admin-recent-audit-events",
    text: `
      SELECT
        event.action,
        event.entity_type,
        event.occurred_at,
        actor.display_name AS actor_name
      FROM aureum.audit_events AS event
      LEFT JOIN aureum.users AS actor ON actor.id = event.actor_user_id
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT $1
    `,
    values: [limit],
  });
  return result.rows.map<AuditEventRecord>((row) => ({
    action: row.action,
    actorName: row.actor_name,
    entityType: row.entity_type,
    occurredAt: row.occurred_at.toISOString(),
  }));
}

export type CustomerAdminRecord = {
  displayName: string;
  email: string;
  id: string;
  isActive: boolean;
  lastLoginAt: string | null;
  reservations: number;
  totalSpend: string;
};

export async function listCustomerAdminRecords(limit = 100) {
  const result = await databaseQuery<
    QueryResultRow & {
      display_name: string;
      email: string;
      id: string;
      is_active: boolean;
      last_login_at: Date | null;
      reservations: number;
      total_spend: string;
    }
  >({
    name: "admin-customer-records",
    text: `
      SELECT
        customer.id,
        customer.display_name,
        customer.email,
        customer.is_active,
        customer.last_login_at,
        count(reservation.id)::integer AS reservations,
        COALESCE(sum(reservation.total_amount) FILTER (
          WHERE reservation.status IN ('confirmed', 'completed')
        ), 0)::numeric(14,2)::text AS total_spend
      FROM aureum.users AS customer
      LEFT JOIN aureum.reservations AS reservation
        ON reservation.guest_user_id = customer.id
      WHERE customer.role = 'customer'
        AND customer.deleted_at IS NULL
      GROUP BY customer.id
      ORDER BY customer.created_at DESC
      LIMIT $1
    `,
    values: [limit],
  });
  return result.rows.map<CustomerAdminRecord>((row) => ({
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    reservations: row.reservations,
    totalSpend: row.total_spend,
  }));
}

export type StaffAdminRecord = {
  displayName: string;
  email: string;
  id: string;
  isActive: boolean;
  lastLoginAt: string | null;
  role: Exclude<AuthRole, "customer">;
};

export async function listStaffAdminRecords() {
  const result = await databaseQuery<
    QueryResultRow & {
      display_name: string;
      email: string;
      id: string;
      is_active: boolean;
      last_login_at: Date | null;
      role: Exclude<AuthRole, "customer">;
    }
  >({
    name: "admin-staff-records",
    text: `
      SELECT id, display_name, email, role, is_active, last_login_at
      FROM aureum.users
      WHERE role <> 'customer'
        AND deleted_at IS NULL
      ORDER BY
        CASE role
          WHEN 'super_admin' THEN 1
          WHEN 'manager' THEN 2
          WHEN 'lead' THEN 3
          ELSE 4
        END,
        display_name
    `,
    values: [],
  });
  return result.rows.map<StaffAdminRecord>((row) => ({
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    role: row.role,
  }));
}
