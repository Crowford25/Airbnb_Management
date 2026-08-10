CREATE SCHEMA IF NOT EXISTS aureum;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE aureum.app_role AS ENUM (
  'customer',
  'employee',
  'lead',
  'manager',
  'super_admin'
);

CREATE TYPE aureum.property_type AS ENUM ('hotel', 'airbnb');
CREATE TYPE aureum.property_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE aureum.availability_status AS ENUM ('available', 'blocked', 'maintenance');
CREATE TYPE aureum.reservation_status AS ENUM (
  'pending',
  'confirmed',
  'cancelled',
  'completed'
);
CREATE TYPE aureum.reservation_source AS ENUM (
  'direct',
  'airbnb',
  'booking_com',
  'agoda',
  'manual'
);

CREATE TABLE aureum.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  password_hash text,
  display_name varchar(160) NOT NULL,
  role aureum.app_role NOT NULL DEFAULT 'customer',
  phone varchar(40),
  locale varchar(10) NOT NULL DEFAULT 'en',
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT users_email_canonical CHECK (email = lower(btrim(email))),
  CONSTRAINT users_locale_supported CHECK (locale IN ('en', 'zh-CN')),
  CONSTRAINT users_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX users_email_unique
  ON aureum.users (email)
  WHERE deleted_at IS NULL;

CREATE INDEX users_role_active_idx
  ON aureum.users (role, is_active)
  WHERE deleted_at IS NULL;

CREATE TABLE aureum.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(180) NOT NULL,
  name varchar(180) NOT NULL,
  name_zh_cn varchar(180),
  tagline_en text,
  tagline_zh_cn text,
  description_en text NOT NULL,
  description_zh_cn text,
  property_type aureum.property_type NOT NULL,
  status aureum.property_status NOT NULL DEFAULT 'draft',
  city varchar(120) NOT NULL,
  state_region varchar(120),
  country_code char(2) NOT NULL DEFAULT 'MY',
  address_line_1 varchar(240),
  address_line_2 varchar(240),
  postal_code varchar(20),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  timezone varchar(80) NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  inventory_units smallint NOT NULL DEFAULT 1,
  guests_per_unit smallint NOT NULL DEFAULT 2,
  max_guests smallint NOT NULL,
  bedrooms smallint NOT NULL DEFAULT 1,
  beds smallint NOT NULL DEFAULT 1,
  bathrooms numeric(4, 1) NOT NULL DEFAULT 1,
  minimum_nights smallint NOT NULL DEFAULT 1,
  base_nightly_rate numeric(12, 2) NOT NULL,
  cleaning_fee numeric(12, 2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'MYR',
  check_in_time time NOT NULL DEFAULT '15:00',
  check_out_time time NOT NULL DEFAULT '11:00',
  rating_average numeric(3, 2),
  review_count integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT properties_slug_canonical CHECK (slug = lower(btrim(slug))),
  CONSTRAINT properties_country_code_upper CHECK (country_code = upper(country_code)),
  CONSTRAINT properties_currency_upper CHECK (currency = upper(currency)),
  CONSTRAINT properties_inventory_positive CHECK (inventory_units >= 1),
  CONSTRAINT properties_guests_per_unit_positive CHECK (guests_per_unit >= 1),
  CONSTRAINT properties_max_guests_positive CHECK (max_guests >= 1),
  CONSTRAINT properties_airbnb_single_unit CHECK (
    property_type <> 'airbnb' OR inventory_units = 1
  ),
  CONSTRAINT properties_hotel_capacity CHECK (
    property_type <> 'hotel' OR max_guests >= guests_per_unit
  ),
  CONSTRAINT properties_rooms_nonnegative CHECK (
    bedrooms >= 0 AND beds >= 0 AND bathrooms >= 0
  ),
  CONSTRAINT properties_minimum_nights_positive CHECK (minimum_nights >= 1),
  CONSTRAINT properties_rates_nonnegative CHECK (
    base_nightly_rate >= 0 AND cleaning_fee >= 0
  ),
  CONSTRAINT properties_coordinates_valid CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (
      latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND
      latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
    )
  ),
  CONSTRAINT properties_rating_valid CHECK (
    rating_average IS NULL OR rating_average BETWEEN 0 AND 5
  ),
  CONSTRAINT properties_review_count_nonnegative CHECK (review_count >= 0),
  CONSTRAINT properties_settings_object CHECK (jsonb_typeof(settings) = 'object')
);

CREATE UNIQUE INDEX properties_slug_unique
  ON aureum.properties (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX properties_public_browse_idx
  ON aureum.properties (status, city, property_type)
  WHERE deleted_at IS NULL;

CREATE TABLE aureum.property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES aureum.properties(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_key text,
  alt_text_en varchar(300) NOT NULL,
  alt_text_zh_cn varchar(300),
  display_order smallint NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT property_images_order_nonnegative CHECK (display_order >= 0),
  CONSTRAINT property_images_dimensions_valid CHECK (
    (width IS NULL AND height IS NULL)
    OR (
      width IS NOT NULL
      AND height IS NOT NULL
      AND width > 0
      AND height > 0
    )
  ),
  UNIQUE (property_id, display_order)
);

CREATE UNIQUE INDEX property_images_one_cover_idx
  ON aureum.property_images (property_id)
  WHERE is_cover;

CREATE INDEX property_images_property_idx
  ON aureum.property_images (property_id, display_order);

CREATE TABLE aureum.amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  name_en varchar(120) NOT NULL,
  name_zh_cn varchar(120),
  category varchar(80) NOT NULL DEFAULT 'general',
  icon_key varchar(80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT amenities_code_canonical CHECK (code = lower(btrim(code)))
);

CREATE TABLE aureum.property_amenities (
  property_id uuid NOT NULL REFERENCES aureum.properties(id) ON DELETE CASCADE,
  amenity_id uuid NOT NULL REFERENCES aureum.amenities(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  PRIMARY KEY (property_id, amenity_id)
);

CREATE INDEX property_amenities_amenity_idx
  ON aureum.property_amenities (amenity_id, property_id);

CREATE TABLE aureum.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES aureum.properties(id) ON DELETE CASCADE,
  availability_date date NOT NULL,
  status aureum.availability_status NOT NULL DEFAULT 'available',
  units_available smallint NOT NULL,
  price_override numeric(12, 2),
  minimum_nights smallint,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT availability_units_nonnegative CHECK (units_available >= 0),
  CONSTRAINT availability_price_nonnegative CHECK (
    price_override IS NULL OR price_override >= 0
  ),
  CONSTRAINT availability_minimum_nights_positive CHECK (
    minimum_nights IS NULL OR minimum_nights >= 1
  ),
  CONSTRAINT availability_blocked_has_no_units CHECK (
    status = 'available' OR units_available = 0
  ),
  UNIQUE (property_id, availability_date)
);

CREATE INDEX availability_search_idx
  ON aureum.availability (property_id, availability_date, status, units_available);

CREATE TABLE aureum.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference varchar(32) NOT NULL UNIQUE,
  property_id uuid NOT NULL REFERENCES aureum.properties(id) ON DELETE RESTRICT,
  guest_user_id uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  status aureum.reservation_status NOT NULL DEFAULT 'pending',
  source aureum.reservation_source NOT NULL DEFAULT 'direct',
  external_reference varchar(200),
  guest_name varchar(160) NOT NULL,
  guest_email varchar(320) NOT NULL,
  guest_phone varchar(40),
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights smallint GENERATED ALWAYS AS ((check_out - check_in)::smallint) STORED,
  adults smallint NOT NULL DEFAULT 2,
  children smallint NOT NULL DEFAULT 0,
  infants smallint NOT NULL DEFAULT 0,
  pets smallint NOT NULL DEFAULT 0,
  guest_count smallint GENERATED ALWAYS AS ((adults + children)::smallint) STORED,
  rooms_count smallint NOT NULL DEFAULT 1,
  nightly_rate numeric(12, 2) NOT NULL,
  accommodation_subtotal numeric(12, 2) NOT NULL,
  cleaning_fee numeric(12, 2) NOT NULL DEFAULT 0,
  service_fee numeric(12, 2) NOT NULL DEFAULT 0,
  tax_total numeric(12, 2) NOT NULL DEFAULT 0,
  discount_total numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'MYR',
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  special_requests text,
  internal_notes text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  CONSTRAINT reservations_dates_valid CHECK (check_out > check_in),
  CONSTRAINT reservations_guest_counts_valid CHECK (
    adults >= 1 AND children >= 0 AND infants >= 0 AND pets >= 0
  ),
  CONSTRAINT reservations_rooms_positive CHECK (rooms_count >= 1),
  CONSTRAINT reservations_guest_email_canonical CHECK (
    guest_email = lower(btrim(guest_email))
  ),
  CONSTRAINT reservations_currency_upper CHECK (currency = upper(currency)),
  CONSTRAINT reservations_amounts_nonnegative CHECK (
    nightly_rate >= 0
    AND accommodation_subtotal >= 0
    AND cleaning_fee >= 0
    AND service_fee >= 0
    AND tax_total >= 0
    AND discount_total >= 0
    AND total_amount >= 0
  ),
  CONSTRAINT reservations_pricing_snapshot_object CHECK (
    jsonb_typeof(pricing_snapshot) = 'object'
  ),
  CONSTRAINT reservations_cancellation_consistent CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancelled_at IS NULL)
  )
);

CREATE UNIQUE INDEX reservations_external_reference_unique
  ON aureum.reservations (source, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE INDEX reservations_property_stay_idx
  ON aureum.reservations (property_id, check_in, check_out)
  WHERE status IN ('pending', 'confirmed');

CREATE INDEX reservations_guest_idx
  ON aureum.reservations (guest_user_id, created_at DESC)
  WHERE guest_user_id IS NOT NULL;

CREATE INDEX reservations_operations_idx
  ON aureum.reservations (status, check_in, check_out);

CREATE TABLE aureum.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  action varchar(80) NOT NULL,
  entity_type varchar(100) NOT NULL,
  entity_id uuid,
  request_id uuid,
  previous_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_previous_object CHECK (
    previous_data IS NULL OR jsonb_typeof(previous_data) = 'object'
  ),
  CONSTRAINT audit_events_new_object CHECK (
    new_data IS NULL OR jsonb_typeof(new_data) = 'object'
  )
);

CREATE INDEX audit_events_entity_idx
  ON aureum.audit_events (entity_type, entity_id, occurred_at DESC);

CREATE INDEX audit_events_actor_idx
  ON aureum.audit_events (actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION aureum.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION aureum.validate_availability_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  property_inventory smallint;
BEGIN
  SELECT inventory_units
  INTO property_inventory
  FROM aureum.properties
  WHERE id = NEW.property_id
    AND deleted_at IS NULL;

  IF property_inventory IS NULL THEN
    RAISE EXCEPTION 'Property % is unavailable', NEW.property_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.units_available > property_inventory THEN
    RAISE EXCEPTION 'Available units (%) exceed property inventory (%)',
      NEW.units_available,
      property_inventory
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION aureum.validate_reservation_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reserved_property aureum.properties%ROWTYPE;
BEGIN
  SELECT *
  INTO reserved_property
  FROM aureum.properties
  WHERE id = NEW.property_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property % is unavailable', NEW.property_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.rooms_count > reserved_property.inventory_units THEN
    RAISE EXCEPTION 'Requested rooms (%) exceed property inventory (%)',
      NEW.rooms_count,
      reserved_property.inventory_units
      USING ERRCODE = '23514';
  END IF;

  IF reserved_property.property_type = 'airbnb' THEN
    IF NEW.rooms_count <> 1 THEN
      RAISE EXCEPTION 'Airbnb reservations must book exactly one entire property'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.adults + NEW.children > reserved_property.max_guests THEN
      RAISE EXCEPTION 'Guest count exceeds Airbnb capacity of %',
        reserved_property.max_guests
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.adults > NEW.rooms_count * reserved_property.guests_per_unit THEN
      RAISE EXCEPTION 'Hotel allows % adults per room; % room(s) are required',
        reserved_property.guests_per_unit,
        CEIL(NEW.adults::numeric / reserved_property.guests_per_unit)
        USING ERRCODE = '23514';
    END IF;

    IF NEW.adults + NEW.children > reserved_property.max_guests THEN
      RAISE EXCEPTION 'Guest count exceeds total hotel listing capacity of %',
        reserved_property.max_guests
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON aureum.users
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER properties_set_updated_at
BEFORE UPDATE ON aureum.properties
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER property_images_set_updated_at
BEFORE UPDATE ON aureum.property_images
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER amenities_set_updated_at
BEFORE UPDATE ON aureum.amenities
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER availability_set_updated_at
BEFORE UPDATE ON aureum.availability
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER reservations_set_updated_at
BEFORE UPDATE ON aureum.reservations
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER availability_validate_inventory
BEFORE INSERT OR UPDATE OF property_id, units_available
ON aureum.availability
FOR EACH ROW EXECUTE FUNCTION aureum.validate_availability_inventory();

CREATE TRIGGER reservations_validate_capacity
BEFORE INSERT OR UPDATE OF property_id, adults, children, rooms_count
ON aureum.reservations
FOR EACH ROW EXECUTE FUNCTION aureum.validate_reservation_capacity();

COMMENT ON SCHEMA aureum IS 'Aureum Stays application data';
COMMENT ON COLUMN aureum.properties.inventory_units IS
  'Hotel room inventory or one entire Airbnb property.';
COMMENT ON COLUMN aureum.properties.guests_per_unit IS
  'Hotel adults allowed per room; for Airbnb this equals the whole-home capacity.';
COMMENT ON COLUMN aureum.availability.units_available IS
  'Remaining sellable units for this date. Reservation writes must update every night atomically.';
COMMENT ON TABLE aureum.audit_events IS
  'Append-only application audit trail; business tables also retain created/updated audit fields.';
