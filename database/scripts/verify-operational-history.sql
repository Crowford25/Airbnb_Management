-- Run in DBeaver against evolyst_dev after migration 0007.
-- This checks the schema only; it does not insert, update, or delete data.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'aureum'
  AND table_name IN (
    'api_request_logs', 'audit_events', 'notification_outbox', 'notification_attempts',
    'email_provider_webhook_events', 'worker_heartbeats'
  )
ORDER BY table_name;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'aureum'
  AND (
    (table_name = 'api_request_logs' AND column_name IN ('request_id', 'correlation_id', 'duration_ms', 'error_code'))
    OR (table_name = 'audit_events' AND column_name IN ('correlation_id', 'actor_role', 'changed_fields'))
    OR (table_name = 'reservations' AND column_name IN ('origin_request_id', 'correlation_id'))
    OR (table_name = 'notification_outbox' AND column_name IN ('origin_request_id', 'correlation_id', 'template_name', 'template_version'))
    OR (table_name = 'notification_attempts' AND column_name = 'worker_execution_id')
    OR (table_name = 'email_provider_webhook_events' AND column_name IN ('provider_delivery_id', 'provider_email_id', 'event_type'))
    OR (table_name = 'worker_heartbeats' AND column_name IN ('worker_name', 'instance_id', 'status', 'last_heartbeat_at'))
  )
ORDER BY table_name, column_name;

SELECT version, applied_at
FROM aureum.schema_migrations
WHERE version = '0007_operational_history_foundation.sql';
