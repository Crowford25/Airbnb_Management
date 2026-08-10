ALTER TABLE aureum.reservation_item_units
  ADD COLUMN released_at timestamptz,
  ADD COLUMN released_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL;

ALTER TABLE aureum.reservation_item_units
  DROP CONSTRAINT reservation_item_units_no_overlap;

ALTER TABLE aureum.reservation_item_units
  ADD CONSTRAINT reservation_item_units_no_active_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    stay_period WITH &&
  ) WHERE (released_at IS NULL);

CREATE INDEX reservation_item_units_active_idx
  ON aureum.reservation_item_units (unit_id, check_in, check_out)
  WHERE released_at IS NULL;

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
    AND id <> NEW.id
    AND released_at IS NULL;

  IF assigned_count >= item_quantity THEN
    RAISE EXCEPTION 'Assigned room count exceeds reservation item quantity'
      USING ERRCODE = '23514';
  END IF;

  NEW.check_in := reservation_check_in;
  NEW.check_out := reservation_check_out;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION aureum.release_cancelled_reservation_units()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    UPDATE aureum.reservation_item_units AS assignment
    SET released_at = now(), released_by = NEW.updated_by
    FROM aureum.reservation_items AS item
    WHERE assignment.reservation_item_id = item.id
      AND item.reservation_id = NEW.id
      AND assignment.released_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reservations_release_units_on_cancel
AFTER UPDATE OF status ON aureum.reservations
FOR EACH ROW EXECUTE FUNCTION aureum.release_cancelled_reservation_units();

CREATE OR REPLACE FUNCTION aureum.validate_reservation_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  requested_reservation_id uuid;
  header aureum.reservations%ROWTYPE;
  item_adults integer;
  item_children integer;
  item_subtotal numeric(12, 2);
  item_rooms integer;
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    requested_reservation_id := COALESCE(NEW.id, OLD.id);
  ELSE
    requested_reservation_id := COALESCE(NEW.reservation_id, OLD.reservation_id);
  END IF;

  SELECT * INTO header
  FROM aureum.reservations
  WHERE id = requested_reservation_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(sum(adults), 0)::integer,
    COALESCE(sum(children), 0)::integer,
    COALESCE(sum(accommodation_subtotal), 0)::numeric(12, 2),
    COALESCE(sum(quantity), 0)::integer
  INTO item_adults, item_children, item_subtotal, item_rooms
  FROM aureum.reservation_items
  WHERE reservation_id = requested_reservation_id;

  IF item_rooms < 1
    OR item_adults <> header.adults
    OR item_children <> header.children
    OR item_subtotal <> header.accommodation_subtotal THEN
    RAISE EXCEPTION 'Reservation header totals do not match reservation items'
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER reservations_totals_match_items
AFTER INSERT OR UPDATE ON aureum.reservations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION aureum.validate_reservation_totals();

CREATE CONSTRAINT TRIGGER reservation_items_match_header
AFTER INSERT OR UPDATE OR DELETE ON aureum.reservation_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION aureum.validate_reservation_totals();

COMMENT ON COLUMN aureum.reservation_item_units.released_at IS
  'Keeps assignment history while removing cancelled stays from the active no-overlap constraint.';
