CREATE TABLE aureum.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid REFERENCES aureum.reservations(id) ON DELETE CASCADE,
  event_key varchar(240) NOT NULL UNIQUE,
  channel varchar(20) NOT NULL DEFAULT 'email',
  category varchar(60) NOT NULL,
  recipient_email varchar(320) NOT NULL,
  recipient_name varchar(180),
  subject varchar(300) NOT NULL,
  html_body text NOT NULL,
  text_body text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_token uuid,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 8,
  provider varchar(40),
  provider_message_id varchar(255),
  last_error text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_outbox_channel_valid CHECK (channel IN ('email')),
  CONSTRAINT notification_outbox_category_valid CHECK (category IN (
    'booking_confirmation',
    'booking_reminder',
    'booking_cancellation',
    'admin_alert'
  )),
  CONSTRAINT notification_outbox_status_valid CHECK (status IN (
    'pending', 'processing', 'sent', 'failed', 'cancelled'
  )),
  CONSTRAINT notification_outbox_email_canonical CHECK (
    recipient_email = lower(btrim(recipient_email))
  ),
  CONSTRAINT notification_outbox_attempts_valid CHECK (
    attempt_count >= 0
    AND max_attempts BETWEEN 1 AND 20
    AND attempt_count <= max_attempts
  ),
  CONSTRAINT notification_outbox_processing_lock CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND lock_token IS NOT NULL)
    OR status <> 'processing'
  ),
  CONSTRAINT notification_outbox_sent_consistent CHECK (
    (status = 'sent' AND sent_at IS NOT NULL)
    OR status <> 'sent'
  ),
  CONSTRAINT notification_outbox_cancelled_consistent CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR status <> 'cancelled'
  )
);

CREATE INDEX notification_outbox_ready_idx
  ON aureum.notification_outbox (available_at, created_at, id)
  WHERE status = 'pending';

CREATE INDEX notification_outbox_stale_processing_idx
  ON aureum.notification_outbox (locked_at, id)
  WHERE status = 'processing';

CREATE INDEX notification_outbox_reservation_idx
  ON aureum.notification_outbox (reservation_id, created_at DESC)
  WHERE reservation_id IS NOT NULL;

CREATE TABLE aureum.notification_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id uuid NOT NULL
    REFERENCES aureum.notification_outbox(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  provider varchar(40) NOT NULL,
  outcome varchar(20) NOT NULL,
  provider_message_id varchar(255),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_attempts_number_positive CHECK (attempt_number > 0),
  CONSTRAINT notification_attempts_outcome_valid CHECK (
    outcome IN ('sent', 'failed', 'cancelled')
  ),
  UNIQUE (notification_id, attempt_number)
);

CREATE INDEX notification_attempts_notification_idx
  ON aureum.notification_attempts (notification_id, attempt_number DESC);

CREATE TRIGGER notification_outbox_set_updated_at
BEFORE UPDATE ON aureum.notification_outbox
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

COMMENT ON TABLE aureum.notification_outbox IS
  'Transactional email outbox. Booking state commits first; independent workers deliver idempotently with retry and stale-lock recovery.';
COMMENT ON TABLE aureum.notification_attempts IS
  'Immutable delivery-attempt history for notification operations and support diagnostics.';
COMMENT ON COLUMN aureum.notification_outbox.event_key IS
  'Stable business idempotency key, also supplied to the email provider when supported.';
