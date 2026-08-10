CREATE TABLE aureum.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL
    REFERENCES aureum.reservations(id) ON DELETE RESTRICT,
  provider varchar(40) NOT NULL,
  provider_payment_id varchar(255) NOT NULL,
  status varchar(40) NOT NULL,
  amount bigint NOT NULL,
  amount_received bigint NOT NULL DEFAULT 0,
  amount_refunded bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL,
  payment_method_type varchar(80),
  last_error_code varchar(120),
  last_error_message text,
  livemode boolean NOT NULL DEFAULT false,
  provider_created_at timestamptz,
  succeeded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_provider_supported CHECK (provider IN ('stripe')),
  CONSTRAINT payments_status_valid CHECK (status IN (
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'requires_capture',
    'succeeded',
    'cancelled',
    'failed'
  )),
  CONSTRAINT payments_amounts_valid CHECK (
    amount > 0
    AND amount_received >= 0
    AND amount_refunded >= 0
    AND amount_refunded <= amount_received
  ),
  CONSTRAINT payments_currency_upper CHECK (currency = upper(currency)),
  UNIQUE (reservation_id, provider),
  UNIQUE (provider, provider_payment_id)
);

CREATE INDEX payments_status_idx
  ON aureum.payments (status, updated_at DESC);

CREATE TABLE aureum.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES aureum.payments(id) ON DELETE RESTRICT,
  reservation_id uuid NOT NULL
    REFERENCES aureum.reservations(id) ON DELETE RESTRICT,
  provider varchar(40) NOT NULL,
  provider_refund_id varchar(255) NOT NULL,
  idempotency_key varchar(120) NOT NULL,
  status varchar(40) NOT NULL,
  amount bigint NOT NULL,
  currency char(3) NOT NULL,
  reason text NOT NULL,
  provider_reason varchar(80),
  failure_reason text,
  requested_by uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  provider_created_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_refunds_provider_supported CHECK (provider IN ('stripe')),
  CONSTRAINT payment_refunds_status_valid CHECK (status IN (
    'pending', 'requires_action', 'succeeded', 'failed', 'cancelled'
  )),
  CONSTRAINT payment_refunds_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_refunds_currency_upper CHECK (currency = upper(currency)),
  UNIQUE (provider, provider_refund_id),
  UNIQUE (payment_id, idempotency_key)
);

CREATE INDEX payment_refunds_reservation_idx
  ON aureum.payment_refunds (reservation_id, created_at DESC);

CREATE TABLE aureum.payment_webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider varchar(40) NOT NULL,
  provider_event_id varchar(255) NOT NULL,
  event_type varchar(160) NOT NULL,
  api_version varchar(80),
  livemode boolean NOT NULL DEFAULT false,
  payload_sha256 char(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'processing',
  attempt_count integer NOT NULL DEFAULT 1,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT payment_webhook_provider_supported CHECK (provider IN ('stripe')),
  CONSTRAINT payment_webhook_status_valid CHECK (
    status IN ('processing', 'processed', 'failed', 'ignored')
  ),
  CONSTRAINT payment_webhook_attempts_positive CHECK (attempt_count >= 1),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX payment_webhook_events_status_idx
  ON aureum.payment_webhook_events (status, received_at);

CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON aureum.payments
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

CREATE TRIGGER payment_refunds_set_updated_at
BEFORE UPDATE ON aureum.payment_refunds
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

COMMENT ON TABLE aureum.payments IS
  'Provider-isolated payment state. Reservation confirmation is driven by verified payment webhooks.';
COMMENT ON TABLE aureum.payment_refunds IS
  'Idempotent full and partial refund records linked to the original payment and reservation.';
COMMENT ON TABLE aureum.payment_webhook_events IS
  'Signed provider events processed once; payload hashes are retained instead of raw payment payloads.';
COMMENT ON COLUMN aureum.payments.amount IS
  'Amount in the currency smallest unit, for example sen for MYR.';
COMMENT ON COLUMN aureum.reservations.hold_expires_at IS
  'Expiry for an unpaid pending inventory hold. A verified successful payment webhook confirms the reservation before expiry.';
