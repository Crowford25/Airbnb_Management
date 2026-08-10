CREATE TABLE aureum.email_provider_webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider varchar(40) NOT NULL,
  provider_delivery_id varchar(255) NOT NULL,
  provider_email_id varchar(255),
  event_type varchar(120) NOT NULL,
  payload_sha256 char(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'processing',
  attempt_count integer NOT NULL DEFAULT 1,
  error_message varchar(500),
  event_created_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT email_provider_webhook_provider_valid CHECK (provider IN ('resend')),
  CONSTRAINT email_provider_webhook_status_valid CHECK (
    status IN ('processing', 'processed', 'ignored', 'failed')
  ),
  CONSTRAINT email_provider_webhook_attempts_positive CHECK (attempt_count >= 1),
  UNIQUE (provider, provider_delivery_id)
);

CREATE INDEX email_provider_webhook_email_idx
  ON aureum.email_provider_webhook_events (provider, provider_email_id, received_at DESC)
  WHERE provider_email_id IS NOT NULL;

CREATE INDEX email_provider_webhook_status_idx
  ON aureum.email_provider_webhook_events (status, received_at DESC);

ALTER TABLE aureum.notification_outbox
  ADD COLUMN provider_delivery_status varchar(40),
  ADD COLUMN provider_event_type varchar(120),
  ADD COLUMN provider_event_at timestamptz,
  ADD COLUMN provider_delivery_detail varchar(500);

CREATE INDEX notification_outbox_provider_delivery_idx
  ON aureum.notification_outbox (provider, provider_delivery_status, provider_event_at DESC)
  WHERE provider = 'resend';

COMMENT ON TABLE aureum.email_provider_webhook_events IS
  'Idempotent Resend webhook delivery history. Raw webhook payloads are never stored; only SHA-256 hashes and safe event metadata are retained.';
COMMENT ON COLUMN aureum.notification_outbox.provider_delivery_status IS
  'Provider-reported delivery state, separate from internal outbox send/retry state.';
