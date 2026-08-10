CREATE TABLE aureum.worker_heartbeats (
  worker_name varchar(80) NOT NULL,
  instance_id uuid NOT NULL,
  status varchar(20) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message varchar(500),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_name, instance_id),
  CONSTRAINT worker_heartbeats_name_valid CHECK (worker_name IN ('hold-expiry', 'notifications')),
  CONSTRAINT worker_heartbeats_status_valid CHECK (
    status IN ('healthy', 'degraded', 'stopped')
  ),
  CONSTRAINT worker_heartbeats_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX worker_heartbeats_latest_idx
  ON aureum.worker_heartbeats (worker_name, last_heartbeat_at DESC);

CREATE TRIGGER worker_heartbeats_set_updated_at
BEFORE UPDATE ON aureum.worker_heartbeats
FOR EACH ROW EXECUTE FUNCTION aureum.set_updated_at();

COMMENT ON TABLE aureum.worker_heartbeats IS
  'Operational monitoring metadata for long-running hold-expiry and notification workers. A stale heartbeat indicates an unavailable or unresponsive worker.';
