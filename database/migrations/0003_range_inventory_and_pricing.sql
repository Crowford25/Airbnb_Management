CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE aureum.unit_status AS ENUM (
  'operational',
  'maintenance',
  'out_of_service',
  'retired'
);

CREATE TYPE aureum.unit_block_reason AS ENUM (
  'maintenance',
  'owner_use',
  'housekeeping',
  'channel_hold',
  'other'
);

CREATE TYPE aureum.charge_calculation AS ENUM (
  'fixed_per_stay',
  'fixed_per_night',
  'per_unit_per_stay',
  'per_unit_per_night',
  'per_guest_per_night',
  'percentage_of_accommodation'
);

CREATE TYPE aureum.charge_type AS ENUM (
  'accommodation',
  'fee',
  'tax',
  'discount'
);

CREATE TABLE aureum.cancellation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  name_en varchar(160) NOT NULL,
  name_zh_cn varchar(160),
  description_en text,
  description_zh_cn text,
  no_show_refund_percentage numeric(5, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT cancellation_policies_code_canonical CHECK (code = lower(btrim(code))),
  CONSTRAINT cancellation_policies_no_show_refund_valid CHECK (
    no_show_refund_percentage BETWEEN 0 AND 100
  )
);

CREATE TABLE aureum.cancellation_policy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_policy_id uuid NOT NULL
    REFERENCES aureum.cancellation_policies(id) ON DELETE CASCADE,
  days_before_check_in smallint NOT NULL,
  refund_percentage numeric(5, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cancellation_policy_rules_days_nonnegative CHECK (
    days_before_check_in >= 0
  ),
  CONSTRAINT cancellation_policy_rules_refund_valid CHECK (
    refund_percentage BETWEEN 0 AND 100
  ),
  UNIQUE (cancellation_policy_id, days_before_check_in)
);

CREATE TABLE aureum.unit_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES aureum.properties(id) ON DELETE CASCADE,
  code varchar(100) NOT NULL,
  public_name_en varchar(180) NOT NULL,
  public_name_zh_cn varchar(180),
  description_en text,
  description_zh_cn text,
  max_adults smallint NOT NULL,
  max_children smallint NOT NULL DEFAULT 0,
  max_guests smallint NOT NULL,
  bedrooms smallint NOT NULL DEFAULT 1,
  beds smallint NOT NULL DEFAULT 1,
  bathrooms numeric(4, 1) NOT NULL DEFAULT 1,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT unit_types_code_canonical CHECK (code = lower(btrim(code))),
  CONSTRAINT unit_types_capacity_positive CHECK (
    max_adults >= 1
    AND max_children >= 0
    AND max_guests >= max_adults
  ),
  CONSTRAINT unit_types_rooms_nonnegative CHECK (
    bedrooms >= 0 AND beds >= 0 AND bathrooms >= 0
  ),
  CONSTRAINT unit_types_sort_order_nonnegative CHECK (sort_order >= 0),
  CONSTRAINT unit_types_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX unit_types_property_code_unique
  ON aureum.unit_types (property_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX unit_types_property_active_idx
  ON aureum.unit_types (property_id, sort_order)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE TABLE aureum.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_type_id uuid NOT NULL REFERENCES aureum.unit_types(id) ON DELETE RESTRICT,
  internal_code varchar(100) NOT NULL,
  internal_name varchar(180),
  status aureum.unit_status NOT NULL DEFAULT 'operational',
  floor_label varchar(80),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT units_internal_code_canonical CHECK (internal_code = btrim(internal_code)),
  CONSTRAINT units_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX units_type_internal_code_unique
  ON aureum.units (unit_type_id, internal_code)
  WHERE deleted_at IS NULL;

CREATE INDEX units_type_status_idx
  ON aureum.units (unit_type_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE aureum.unit_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES aureum.units(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  stay_period daterange GENERATED ALWAYS AS (
    daterange(start_date, end_date, '[)')
  ) STORED,
  reason aureum.unit_block_reason NOT NULL,
  note text,
  external_reference varchar(200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT unit_blocks_dates_valid CHECK (end_date > start_date)
);

ALTER TABLE aureum.unit_blocks
  ADD CONSTRAINT unit_blocks_no_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    stay_period WITH &&
  ) WHERE (deleted_at IS NULL);

CREATE INDEX unit_blocks_period_idx
  ON aureum.unit_blocks USING gist (stay_period);

CREATE TABLE aureum.rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_type_id uuid NOT NULL REFERENCES aureum.unit_types(id) ON DELETE CASCADE,
  cancellation_policy_id uuid REFERENCES aureum.cancellation_policies(id)
    ON DELETE SET NULL,
  code varchar(100) NOT NULL,
  public_name_en varchar(180) NOT NULL,
  public_name_zh_cn varchar(180),
  description_en text,
  description_zh_cn text,
  base_nightly_rate numeric(12, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'MYR',
  minimum_nights smallint NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT rate_plans_code_canonical CHECK (code = lower(btrim(code))),
  CONSTRAINT rate_plans_rate_nonnegative CHECK (base_nightly_rate >= 0),
  CONSTRAINT rate_plans_currency_upper CHECK (currency = upper(currency)),
  CONSTRAINT rate_plans_minimum_nights_positive CHECK (minimum_nights >= 1),
  CONSTRAINT rate_plans_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX rate_plans_type_code_unique
  ON aureum.rate_plans (unit_type_id, code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX rate_plans_one_default_per_type
  ON aureum.rate_plans (unit_type_id)
  WHERE is_default = true AND is_active = true AND deleted_at IS NULL;

CREATE TABLE aureum.rate_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id uuid NOT NULL REFERENCES aureum.rate_plans(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  stay_period daterange GENERATED ALWAYS AS (
    daterange(start_date, end_date, '[)')
  ) STORED,
  nightly_rate numeric(12, 2) NOT NULL,
  minimum_nights smallint,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  label varchar(180),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT rate_periods_dates_valid CHECK (end_date > start_date),
  CONSTRAINT rate_periods_rate_nonnegative CHECK (nightly_rate >= 0),
  CONSTRAINT rate_periods_minimum_nights_positive CHECK (
    minimum_nights IS NULL OR minimum_nights >= 1
  )
);

ALTER TABLE aureum.rate_periods
  ADD CONSTRAINT rate_periods_no_overlap
  EXCLUDE USING gist (
    rate_plan_id WITH =,
    stay_period WITH &&
  );

CREATE INDEX rate_periods_period_idx
  ON aureum.rate_periods USING gist (stay_period);

CREATE TABLE aureum.tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES aureum.properties(id) ON DELETE CASCADE,
  code varchar(100) NOT NULL,
  public_name_en varchar(180) NOT NULL,
  public_name_zh_cn varchar(180),
  calculation aureum.charge_calculation NOT NULL,
  amount numeric(12, 4) NOT NULL,
  included_in_price boolean NOT NULL DEFAULT false,
  priority smallint NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_to date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT tax_rules_code_canonical CHECK (code = lower(btrim(code))),
  CONSTRAINT tax_rules_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT tax_rules_priority_nonnegative CHECK (priority >= 0),
  CONSTRAINT tax_rules_dates_valid CHECK (
    valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from
  ),
  CONSTRAINT tax_rules_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX tax_rules_property_code_unique
  ON aureum.tax_rules (property_id, code)
  WHERE deleted_at IS NULL;

CREATE TABLE aureum.fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES aureum.properties(id) ON DELETE CASCADE,
  unit_type_id uuid REFERENCES aureum.unit_types(id) ON DELETE CASCADE,
  code varchar(100) NOT NULL,
  public_name_en varchar(180) NOT NULL,
  public_name_zh_cn varchar(180),
  calculation aureum.charge_calculation NOT NULL,
  amount numeric(12, 4) NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT true,
  is_taxable boolean NOT NULL DEFAULT true,
  priority smallint NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_to date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT fee_rules_code_canonical CHECK (code = lower(btrim(code))),
  CONSTRAINT fee_rules_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT fee_rules_priority_nonnegative CHECK (priority >= 0),
  CONSTRAINT fee_rules_dates_valid CHECK (
    valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from
  ),
  CONSTRAINT fee_rules_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX fee_rules_property_code_unique
  ON aureum.fee_rules (property_id, code, COALESCE(unit_type_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS reservations_validate_capacity ON aureum.reservations;
DROP FUNCTION IF EXISTS aureum.validate_reservation_capacity();

ALTER TABLE aureum.reservations
  ADD COLUMN stay_period daterange GENERATED ALWAYS AS (
    daterange(check_in, check_out, '[)')
  ) STORED,
  ADD COLUMN fee_total numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN cancellation_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX reservations_stay_period_idx
  ON aureum.reservations USING gist (stay_period);

CREATE TABLE aureum.reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES aureum.reservations(id) ON DELETE CASCADE,
  unit_type_id uuid NOT NULL REFERENCES aureum.unit_types(id) ON DELETE RESTRICT,
  rate_plan_id uuid REFERENCES aureum.rate_plans(id) ON DELETE SET NULL,
  quantity smallint NOT NULL,
  adults smallint NOT NULL,
  children smallint NOT NULL DEFAULT 0,
  unit_name_snapshot varchar(180) NOT NULL,
  rate_plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  average_nightly_rate numeric(12, 2) NOT NULL,
  accommodation_subtotal numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT reservation_items_quantity_positive CHECK (quantity >= 1),
  CONSTRAINT reservation_items_guests_valid CHECK (adults >= 1 AND children >= 0),
  CONSTRAINT reservation_items_amounts_nonnegative CHECK (
    average_nightly_rate >= 0 AND accommodation_subtotal >= 0
  ),
  CONSTRAINT reservation_items_rate_snapshot_object CHECK (
    jsonb_typeof(rate_plan_snapshot) = 'object'
  )
);

CREATE INDEX reservation_items_reservation_idx
  ON aureum.reservation_items (reservation_id);

CREATE INDEX reservation_items_inventory_idx
  ON aureum.reservation_items (unit_type_id, reservation_id);

CREATE TABLE aureum.reservation_item_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_item_id uuid NOT NULL
    REFERENCES aureum.reservation_items(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES aureum.units(id) ON DELETE RESTRICT,
  check_in date NOT NULL,
  check_out date NOT NULL,
  stay_period daterange GENERATED ALWAYS AS (
    daterange(check_in, check_out, '[)')
  ) STORED,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT reservation_item_units_dates_valid CHECK (check_out > check_in),
  UNIQUE (reservation_item_id, unit_id)
);

ALTER TABLE aureum.reservation_item_units
  ADD CONSTRAINT reservation_item_units_no_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    stay_period WITH &&
  );

CREATE TABLE aureum.reservation_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES aureum.reservations(id) ON DELETE CASCADE,
  reservation_item_id uuid REFERENCES aureum.reservation_items(id) ON DELETE CASCADE,
  charge_type aureum.charge_type NOT NULL,
  code varchar(100) NOT NULL,
  public_name_snapshot varchar(180) NOT NULL,
  calculation aureum.charge_calculation NOT NULL,
  quantity numeric(12, 2) NOT NULL DEFAULT 1,
  unit_amount numeric(12, 4) NOT NULL,
  total_amount numeric(12, 2) NOT NULL,
  currency char(3) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_charges_amounts_nonnegative CHECK (
    quantity >= 0 AND unit_amount >= 0 AND total_amount >= 0
  ),
  CONSTRAINT reservation_charges_currency_upper CHECK (currency = upper(currency)),
  CONSTRAINT reservation_charges_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX reservation_charges_reservation_idx
  ON aureum.reservation_charges (reservation_id, charge_type);

INSERT INTO aureum.cancellation_policies (
  code, name_en, description_en, no_show_refund_percentage
)
VALUES (
  'flexible',
  'Flexible',
  'Full refund until one day before check-in; non-refundable after that point.',
  0
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO aureum.cancellation_policy_rules (
  cancellation_policy_id, days_before_check_in, refund_percentage
)
SELECT id, 1, 100
FROM aureum.cancellation_policies
WHERE code = 'flexible'
ON CONFLICT (cancellation_policy_id, days_before_check_in) DO NOTHING;

INSERT INTO aureum.cancellation_policy_rules (
  cancellation_policy_id, days_before_check_in, refund_percentage
)
SELECT id, 0, 0
FROM aureum.cancellation_policies
WHERE code = 'flexible'
ON CONFLICT (cancellation_policy_id, days_before_check_in) DO NOTHING;

INSERT INTO aureum.unit_types (
  property_id, code, public_name_en, description_en,
  max_adults, max_children, max_guests, bedrooms, beds, bathrooms,
  created_by, updated_by
)
SELECT
  property.id,
  CASE
    WHEN property.slug = 'the-opaline-residence' THEN 'skyline-king'
    WHEN property.property_type = 'hotel' THEN 'standard-room'
    ELSE 'entire-home'
  END,
  CASE
    WHEN property.slug = 'the-opaline-residence' THEN 'Skyline King Room'
    WHEN property.property_type = 'hotel' THEN property.name || ' Room'
    ELSE 'Entire ' || property.name
  END,
  property.description_en,
  CASE
    WHEN property.property_type = 'hotel' THEN property.guests_per_unit
    ELSE property.max_guests
  END,
  CASE
    WHEN property.property_type = 'hotel'
      THEN GREATEST(property.max_guests - property.guests_per_unit, 0)
    ELSE property.max_guests
  END,
  CASE
    WHEN property.property_type = 'hotel' THEN property.guests_per_unit
    ELSE property.max_guests
  END,
  CASE WHEN property.property_type = 'hotel' THEN 1 ELSE property.bedrooms END,
  CASE WHEN property.property_type = 'hotel' THEN 1 ELSE property.beds END,
  CASE WHEN property.property_type = 'hotel' THEN 1 ELSE property.bathrooms END,
  property.created_by,
  property.updated_by
FROM aureum.properties AS property
WHERE property.deleted_at IS NULL
ON CONFLICT (property_id, code) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO aureum.units (
  unit_type_id, internal_code, internal_name, status, created_by, updated_by
)
SELECT
  unit_type.id,
  CASE
    WHEN property.slug = 'the-opaline-residence'
      THEN 'KL-' || (200 + generated.unit_number)::text
    WHEN property.property_type = 'hotel'
      THEN 'ROOM-' || lpad(generated.unit_number::text, 3, '0')
    ELSE 'HOME-1'
  END,
  CASE
    WHEN property.property_type = 'hotel'
      THEN 'Room ' || generated.unit_number::text
    ELSE property.name || ' internal unit'
  END,
  'operational',
  property.created_by,
  property.updated_by
FROM aureum.properties AS property
JOIN aureum.unit_types AS unit_type
  ON unit_type.property_id = property.id
  AND unit_type.deleted_at IS NULL
CROSS JOIN LATERAL generate_series(1, property.inventory_units) AS generated(unit_number)
WHERE property.deleted_at IS NULL
ON CONFLICT (unit_type_id, internal_code) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO aureum.rate_plans (
  unit_type_id, cancellation_policy_id, code, public_name_en,
  base_nightly_rate, currency, minimum_nights, is_default,
  created_by, updated_by
)
SELECT
  unit_type.id,
  cancellation_policy.id,
  'standard',
  'Standard rate',
  property.base_nightly_rate,
  property.currency,
  property.minimum_nights,
  true,
  property.created_by,
  property.updated_by
FROM aureum.unit_types AS unit_type
JOIN aureum.properties AS property ON property.id = unit_type.property_id
CROSS JOIN aureum.cancellation_policies AS cancellation_policy
WHERE unit_type.deleted_at IS NULL
  AND cancellation_policy.code = 'flexible'
ON CONFLICT (unit_type_id, code) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO aureum.fee_rules (
  property_id, code, public_name_en, calculation, amount,
  is_mandatory, is_taxable, priority, created_by, updated_by
)
SELECT
  property.id,
  'cleaning-fee',
  'Cleaning fee',
  'fixed_per_stay',
  property.cleaning_fee,
  true,
  false,
  10,
  property.created_by,
  property.updated_by
FROM aureum.properties AS property
WHERE property.cleaning_fee > 0
  AND property.deleted_at IS NULL;

INSERT INTO aureum.fee_rules (
  property_id, code, public_name_en, calculation, amount,
  is_mandatory, is_taxable, priority, created_by, updated_by
)
SELECT
  property.id,
  'service-fee',
  'Service fee',
  'percentage_of_accommodation',
  8,
  true,
  false,
  20,
  property.created_by,
  property.updated_by
FROM aureum.properties AS property
WHERE property.deleted_at IS NULL;

INSERT INTO aureum.unit_blocks (
  unit_id, start_date, end_date, reason, note, created_by, updated_by
)
SELECT
  unit.id,
  availability.availability_date,
  availability.availability_date + 1,
  CASE
    WHEN availability.status = 'maintenance' THEN 'maintenance'::aureum.unit_block_reason
    ELSE 'other'::aureum.unit_block_reason
  END,
  availability.note,
  availability.created_by,
  availability.updated_by
FROM aureum.availability AS availability
JOIN aureum.unit_types AS unit_type
  ON unit_type.property_id = availability.property_id
  AND unit_type.deleted_at IS NULL
JOIN aureum.units AS unit
  ON unit.unit_type_id = unit_type.id
  AND unit.deleted_at IS NULL
WHERE availability.status <> 'available'
  AND NOT EXISTS (
    SELECT 1
    FROM aureum.unit_blocks AS existing
    WHERE existing.unit_id = unit.id
      AND existing.start_date = availability.availability_date
      AND existing.end_date = availability.availability_date + 1
      AND existing.deleted_at IS NULL
  );

INSERT INTO aureum.rate_periods (
  rate_plan_id, start_date, end_date, nightly_rate, minimum_nights,
  closed_to_arrival, closed_to_departure, label,
  created_by, updated_by
)
SELECT
  rate_plan.id,
  availability.availability_date,
  availability.availability_date + 1,
  COALESCE(availability.price_override, rate_plan.base_nightly_rate),
  availability.minimum_nights,
  availability.closed_to_arrival,
  availability.closed_to_departure,
  'Migrated date-specific rate or restriction',
  availability.created_by,
  availability.updated_by
FROM aureum.availability AS availability
JOIN aureum.unit_types AS unit_type
  ON unit_type.property_id = availability.property_id
  AND unit_type.deleted_at IS NULL
JOIN aureum.rate_plans AS rate_plan
  ON rate_plan.unit_type_id = unit_type.id
  AND rate_plan.is_default = true
  AND rate_plan.deleted_at IS NULL
JOIN aureum.properties AS property ON property.id = availability.property_id
WHERE availability.price_override IS NOT NULL
  OR availability.minimum_nights IS DISTINCT FROM property.minimum_nights
  OR availability.closed_to_arrival
  OR availability.closed_to_departure;

INSERT INTO aureum.reservation_items (
  reservation_id, unit_type_id, rate_plan_id, quantity, adults, children,
  unit_name_snapshot, rate_plan_snapshot, average_nightly_rate,
  accommodation_subtotal, created_by, updated_by
)
SELECT
  reservation.id,
  unit_type.id,
  rate_plan.id,
  reservation.rooms_count,
  reservation.adults,
  reservation.children,
  unit_type.public_name_en,
  jsonb_build_object(
    'code', rate_plan.code,
    'name', rate_plan.public_name_en,
    'currency', rate_plan.currency
  ),
  reservation.nightly_rate,
  reservation.accommodation_subtotal,
  reservation.created_by,
  reservation.updated_by
FROM aureum.reservations AS reservation
JOIN aureum.unit_types AS unit_type
  ON unit_type.property_id = reservation.property_id
  AND unit_type.sort_order = 0
  AND unit_type.deleted_at IS NULL
LEFT JOIN aureum.rate_plans AS rate_plan
  ON rate_plan.unit_type_id = unit_type.id
  AND rate_plan.is_default = true
  AND rate_plan.deleted_at IS NULL;

INSERT INTO aureum.reservation_charges (
  reservation_id, reservation_item_id, charge_type, code,
  public_name_snapshot, calculation, quantity, unit_amount,
  total_amount, currency
)
SELECT
  reservation.id,
  item.id,
  'accommodation',
  'accommodation',
  item.unit_name_snapshot,
  'per_unit_per_night',
  (item.quantity * reservation.nights)::numeric,
  item.average_nightly_rate,
  item.accommodation_subtotal,
  reservation.currency
FROM aureum.reservations AS reservation
JOIN aureum.reservation_items AS item ON item.reservation_id = reservation.id;

INSERT INTO aureum.reservation_charges (
  reservation_id, charge_type, code, public_name_snapshot,
  calculation, quantity, unit_amount, total_amount, currency
)
SELECT
  id, 'fee', 'cleaning-fee', 'Cleaning fee', 'fixed_per_stay',
  1, cleaning_fee, cleaning_fee, currency
FROM aureum.reservations
WHERE cleaning_fee > 0;

INSERT INTO aureum.reservation_charges (
  reservation_id, charge_type, code, public_name_snapshot,
  calculation, quantity, unit_amount, total_amount, currency
)
SELECT
  id, 'fee', 'service-fee', 'Service fee', 'fixed_per_stay',
  1, service_fee, service_fee, currency
FROM aureum.reservations
WHERE service_fee > 0;

INSERT INTO aureum.reservation_charges (
  reservation_id, charge_type, code, public_name_snapshot,
  calculation, quantity, unit_amount, total_amount, currency
)
SELECT
  id, 'tax', 'legacy-tax', 'Tax', 'fixed_per_stay',
  1, tax_total, tax_total, currency
FROM aureum.reservations
WHERE tax_total > 0;

UPDATE aureum.reservations
SET fee_total = cleaning_fee + service_fee;

ALTER TABLE aureum.reservations
  DROP COLUMN rooms_count,
  DROP COLUMN nightly_rate,
  DROP COLUMN cleaning_fee,
  DROP COLUMN service_fee;

ALTER TABLE aureum.properties
  DROP CONSTRAINT IF EXISTS properties_airbnb_single_unit,
  DROP CONSTRAINT IF EXISTS properties_hotel_capacity,
  DROP CONSTRAINT IF EXISTS properties_rooms_nonnegative,
  DROP CONSTRAINT IF EXISTS properties_minimum_nights_positive,
  DROP CONSTRAINT IF EXISTS properties_rates_nonnegative;

ALTER TABLE aureum.properties
  DROP COLUMN inventory_units,
  DROP COLUMN guests_per_unit,
  DROP COLUMN max_guests,
  DROP COLUMN bedrooms,
  DROP COLUMN beds,
  DROP COLUMN bathrooms,
  DROP COLUMN minimum_nights,
  DROP COLUMN base_nightly_rate,
  DROP COLUMN cleaning_fee;

DROP TRIGGER IF EXISTS availability_validate_inventory ON aureum.availability;
DROP TRIGGER IF EXISTS availability_set_updated_at ON aureum.availability;
DROP FUNCTION IF EXISTS aureum.validate_availability_inventory();
DROP TABLE aureum.availability;
DROP TYPE aureum.availability_status;

CREATE OR REPLACE FUNCTION aureum.validate_reservation_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_property_id uuid;
  reservation_property_id uuid;
  capacity aureum.unit_types%ROWTYPE;
BEGIN
  SELECT * INTO capacity
  FROM aureum.unit_types
  WHERE id = NEW.unit_type_id
    AND is_active = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit type % is unavailable', NEW.unit_type_id
      USING ERRCODE = '23503';
  END IF;

  item_property_id := capacity.property_id;

  SELECT property_id INTO reservation_property_id
  FROM aureum.reservations
  WHERE id = NEW.reservation_id;

  IF reservation_property_id IS NULL OR reservation_property_id <> item_property_id THEN
    RAISE EXCEPTION 'Reservation item must belong to the reservation property'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.adults > NEW.quantity * capacity.max_adults
    OR NEW.adults + NEW.children > NEW.quantity * capacity.max_guests THEN
    RAISE EXCEPTION 'Reservation item guest count exceeds selected room capacity'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reservation_items_validate
BEFORE INSERT OR UPDATE OF reservation_id, unit_type_id, quantity, adults, children
ON aureum.reservation_items
FOR EACH ROW EXECUTE FUNCTION aureum.validate_reservation_item();

CREATE OR REPLACE FUNCTION aureum.prepare_reservation_item_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_unit_type_id uuid;
  assigned_unit_type_id uuid;
  item_quantity smallint;
  assigned_count integer;
  reservation_check_in date;
  reservation_check_out date;
BEGIN
  SELECT
    item.unit_type_id,
    item.quantity,
    reservation.check_in,
    reservation.check_out
  INTO
    item_unit_type_id,
    item_quantity,
    reservation_check_in,
    reservation_check_out
  FROM aureum.reservation_items AS item
  JOIN aureum.reservations AS reservation ON reservation.id = item.reservation_id
  WHERE item.id = NEW.reservation_item_id;

  SELECT unit_type_id INTO assigned_unit_type_id
  FROM aureum.units
  WHERE id = NEW.unit_id
    AND status = 'operational'
    AND deleted_at IS NULL;

  IF item_unit_type_id IS NULL OR assigned_unit_type_id IS NULL
    OR item_unit_type_id <> assigned_unit_type_id THEN
    RAISE EXCEPTION 'Assigned room must be operational and match the reserved room type'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO assigned_count
  FROM aureum.reservation_item_units
  WHERE reservation_item_id = NEW.reservation_item_id
    AND id <> NEW.id;

  IF assigned_count >= item_quantity THEN
    RAISE EXCEPTION 'Assigned room count exceeds reservation item quantity'
      USING ERRCODE = '23514';
  END IF;

  NEW.check_in := reservation_check_in;
  NEW.check_out := reservation_check_out;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reservation_item_units_prepare
BEFORE INSERT OR UPDATE OF reservation_item_id, unit_id
ON aureum.reservation_item_units
FOR EACH ROW EXECUTE FUNCTION aureum.prepare_reservation_item_unit();

CREATE OR REPLACE FUNCTION aureum.unit_type_inventory_count(requested_unit_type_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
  FROM aureum.units
  WHERE unit_type_id = requested_unit_type_id
    AND status = 'operational'
    AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION aureum.unit_type_remaining_units(
  requested_unit_type_id uuid,
  requested_date date
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(
    0,
    (
      SELECT count(*)::integer
      FROM aureum.units AS unit
      WHERE unit.unit_type_id = requested_unit_type_id
        AND unit.status = 'operational'
        AND unit.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM aureum.unit_blocks AS block
          WHERE block.unit_id = unit.id
            AND block.deleted_at IS NULL
            AND requested_date <@ block.stay_period
        )
    )
    - COALESCE(
      (
        SELECT sum(item.quantity)::integer
        FROM aureum.reservation_items AS item
        JOIN aureum.reservations AS reservation
          ON reservation.id = item.reservation_id
        WHERE item.unit_type_id = requested_unit_type_id
          AND requested_date <@ reservation.stay_period
          AND (
            reservation.status = 'confirmed'
            OR (
              reservation.status = 'pending'
              AND reservation.hold_expires_at > now()
            )
          )
      ),
      0
    )
  );
$$;

CREATE OR REPLACE FUNCTION aureum.rate_plan_nightly_price(
  requested_rate_plan_id uuid,
  requested_date date
)
RETURNS numeric(12, 2)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT period.nightly_rate
      FROM aureum.rate_periods AS period
      WHERE period.rate_plan_id = requested_rate_plan_id
        AND requested_date <@ period.stay_period
      LIMIT 1
    ),
    rate_plan.base_nightly_rate
  )
  FROM aureum.rate_plans AS rate_plan
  WHERE rate_plan.id = requested_rate_plan_id
    AND rate_plan.is_active = true
    AND rate_plan.deleted_at IS NULL;
$$;

CREATE TRIGGER cancellation_policies_set_updated_at
BEFORE UPDATE ON aureum.cancellation_policies
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER cancellation_policy_rules_set_updated_at
BEFORE UPDATE ON aureum.cancellation_policy_rules
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER unit_types_set_updated_at
BEFORE UPDATE ON aureum.unit_types
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER units_set_updated_at
BEFORE UPDATE ON aureum.units
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER unit_blocks_set_updated_at
BEFORE UPDATE ON aureum.unit_blocks
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER rate_plans_set_updated_at
BEFORE UPDATE ON aureum.rate_plans
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER rate_periods_set_updated_at
BEFORE UPDATE ON aureum.rate_periods
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER tax_rules_set_updated_at
BEFORE UPDATE ON aureum.tax_rules
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER fee_rules_set_updated_at
BEFORE UPDATE ON aureum.fee_rules
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER reservation_items_set_updated_at
BEFORE UPDATE ON aureum.reservation_items
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

COMMENT ON TABLE aureum.unit_types IS
  'Customer-visible accommodation categories; public APIs expose names and stable room keys, never physical unit identifiers.';
COMMENT ON TABLE aureum.units IS
  'Internal physical hotel rooms or whole-home units; identifiers are staff-only.';
COMMENT ON TABLE aureum.unit_blocks IS
  'Date-range operational blocks such as maintenance or owner use; no daily availability rows are stored.';
COMMENT ON TABLE aureum.reservation_items IS
  'One reservation can contain multiple room types and quantities.';
COMMENT ON FUNCTION aureum.unit_type_remaining_units(uuid, date) IS
  'Computes sellable units from physical rooms minus overlapping blocks and active reservation items.';
