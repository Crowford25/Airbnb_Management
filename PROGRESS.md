# Progress

## Operational logging, audit, and history foundation

- [x] Assessed existing audit, notification outbox, API wrapper, and admin settings implementation.
- [x] Add forward-only schema migration for request/correlation metadata and request history.
- [x] Add shared request context, safe API logging, and audit redaction.
- [x] Propagate trace metadata through reservations, notifications, webhooks, and notification worker attempts.
- [x] Add protected operational-history admin UI.
- [x] Applied migration `0007_operational_history_foundation.sql` to `evolyst_dev`.
- [x] Run final validation checks: schema validation, schema verification, typecheck, targeted lint, and production build.

## Verification notes

- Migration `0007_operational_history_foundation.sql` is applied to local database `evolyst_dev`.
- `npm run lint` exceeded its time limit while scanning the OneDrive workspace; targeted ESLint on every changed TypeScript/TSX file passed.
- Use `npm run db:verify-history` for a repeatable database check, or open `database/scripts/verify-operational-history.sql` in DBeaver.

## Production deployment foundation

- [x] Added standalone Next.js Docker web image and separate worker image.
- [x] Added production Compose orchestration, one-off preflight/migration jobs, health endpoint, CI, backup helper, and runbook.
- [ ] Validate the Docker images locally when Docker Desktop is available.
- [ ] Configure an actual managed production database, verified domain, provider secrets, monitoring, and hosting after owner approval.

## Email provider delivery tracking

- [x] Added signed, idempotent Resend webhook handling and permanent provider-event history.
- [x] Added provider delivery state to Super Admin email history without storing raw webhook payloads.
- [ ] Register the deployed `/api/webhooks/resend` endpoint in Resend and set `RESEND_WEBHOOK_SECRET`.

## Operational history exports

- [x] Added audited, role-protected CSV export for API, audit, email, and provider-webhook history.
- [x] Capped exports at 100 matching records and escaped spreadsheet formula prefixes.

## Operational monitoring

- [x] Added durable worker heartbeats and a Super Admin health view for hold-expiry and notification workers.
- [x] Added stale/degraded/stopped state detection using each worker's configured interval.
- [ ] Add an external uptime/error-monitoring provider and alert destination after provider selection.

## Security hardening baseline

- [x] Added browser security headers and production-only HSTS without breaking Stripe popup/redirect flows.
- [x] Added byte-accurate JSON limits and bounded raw-body reads for signed Stripe and Resend webhooks.
- [x] Documented session, header, webhook, CSP, and rate-limiting production boundaries.
- [ ] Roll out a Content Security Policy in report-only mode after final image hosts and payment flows are verified.
- [ ] Replace local in-memory public API rate limiting with a shared managed store before multi-instance production deployment.
