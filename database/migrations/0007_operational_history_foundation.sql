CREATE TABLE aureum.api_request_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  actor_user_id uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  actor_role aureum.app_role,
  method varchar(10) NOT NULL,
  route varchar(240) NOT NULL,
  outcome varchar(20) NOT NULL,
  status_code smallint NOT NULL,
  duration_ms integer NOT NULL,
  error_code varchar(120),
  error_message varchar(500),
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_request_logs_method_valid CHECK (method ~ '^[A-Z]+$'),
  CONSTRAINT api_request_logs_outcome_valid CHECK (outcome IN ('success', 'error')),
  CONSTRAINT api_request_logs_status_valid CHECK (status_code BETWEEN 100 AND 599),
  CONSTRAINT api_request_logs_duration_valid CHECK (duration_ms >= 0)
);

CREATE INDEX api_request_logs_created_idx
  ON aureum.api_request_logs (created_at DESC, id DESC);

CREATE INDEX api_request_logs_actor_created_idx
  ON aureum.api_request_logs (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX api_request_logs_route_created_idx
  ON aureum.api_request_logs (route, created_at DESC);

ALTER TABLE aureum.audit_events
  ADD COLUMN correlation_id uuid,
  ADD COLUMN actor_role aureum.app_role,
  ADD COLUMN changed_fields text[];

CREATE INDEX audit_events_request_idx
  ON aureum.audit_events (request_id, occurred_at DESC)
  WHERE request_id IS NOT NULL;

CREATE INDEX audit_events_correlation_idx
  ON aureum.audit_events (correlation_id, occurred_at DESC)
  WHERE correlation_id IS NOT NULL;

ALTER TABLE aureum.reservations
  ADD COLUMN origin_request_id uuid,
  ADD COLUMN correlation_id uuid;

CREATE INDEX reservations_correlation_idx
  ON aureum.reservations (correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;

ALTER TABLE aureum.notification_outbox
  ADD COLUMN origin_request_id uuid,
  ADD COLUMN correlation_id uuid,
  ADD COLUMN triggered_by_user_id uuid REFERENCES aureum.users(id) ON DELETE SET NULL,
  ADD COLUMN template_name varchar(120),
  ADD COLUMN template_version varchar(40);

CREATE INDEX notification_outbox_correlation_idx
  ON aureum.notification_outbox (correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;

ALTER TABLE aureum.notification_attempts
  ADD COLUMN worker_execution_id uuid;

CREATE INDEX notification_attempts_worker_idx
  ON aureum.notification_attempts (worker_execution_id, started_at DESC)
  WHERE worker_execution_id IS NOT NULL;

COMMENT ON TABLE aureum.api_request_logs IS
  'Best-effort API metadata only; never stores bodies, credentials, cookies, headers, tokens, card data, or raw provider payloads.';
COMMENT ON COLUMN aureum.reservations.correlation_id IS
  'Links the reservation to its originating request across later webhook and worker activity.';
COMMENT ON COLUMN aureum.notification_outbox.template_name IS
  'Stable application template identifier, not provider content.';
