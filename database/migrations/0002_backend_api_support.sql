ALTER TABLE aureum.reservations
  ADD COLUMN idempotency_key varchar(80),
  ADD COLUMN hold_expires_at timestamptz;

CREATE UNIQUE INDEX reservations_user_idempotency_unique
  ON aureum.reservations (guest_user_id, idempotency_key)
  WHERE guest_user_id IS NOT NULL
    AND idempotency_key IS NOT NULL;

CREATE INDEX reservations_expired_holds_idx
  ON aureum.reservations (hold_expires_at, property_id)
  WHERE status = 'pending'
    AND hold_expires_at IS NOT NULL;

COMMENT ON COLUMN aureum.reservations.idempotency_key IS
  'Client-generated key that makes reservation creation safe to retry.';
COMMENT ON COLUMN aureum.reservations.hold_expires_at IS
  'Expiry for an unpaid pending inventory hold; payment confirmation is implemented later.';

