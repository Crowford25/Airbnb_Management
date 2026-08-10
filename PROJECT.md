# Aureum Stays

## Architecture notes

- Next.js owns the customer, staff, and API surfaces; PostgreSQL schema `aureum` owns durable application data.
- Availability is computed from room units, blocks, reservations, and active holds. There is no availability table in the current booking model.
- Payments are verified by Stripe webhooks. Email is delivered asynchronously through the notification outbox.
- Operational history is append-only: API request logs, audit events, notification outbox records, notification attempts, and payment webhook events.
- Request and correlation IDs are metadata only. Request bodies, credentials, cookies, authorization headers, payment-card data, and raw provider payloads are never recorded in application history.

## Operational history foundation

- API handling creates a request ID and correlation ID, returns both as response headers, and writes a best-effort request log.
- Authenticated API authorization attaches the current actor to the request context.
- Audit events inherit the request context when not explicitly provided and redact sensitive fields before persistence.
- Reservations and notification jobs retain origin request/correlation metadata so asynchronous payment and worker activity can be linked safely.
- Super Admin history pages are read-only and protected by `system:manage`.
- Resend delivery webhooks are signature-verified, deduplicated by Svix delivery ID,
  and linked to the outbox by provider email ID without retaining raw payloads.
- Super Admin history exports are capped, CSV-escaped, role-protected, and audited.
- Long-running workers publish durable heartbeats, while one-off maintenance commands
  stay out of worker-health reporting to avoid misleading stopped status.

## Security baseline

- Global browser hardening headers protect every application response. HSTS is emitted
  only for production, where the application must be served through HTTPS.
- JSON bodies have byte-based limits, and Stripe/Resend signed webhook bodies retain the
  exact raw text needed for verification while being limited to 256 KiB and 128 KiB.
- A strict Content Security Policy will be introduced in report-only mode after the final
  image hosts and Stripe integration paths are verified. Multi-instance production rate
  limiting requires a shared managed store rather than the local development limiter.

## Production runtime

- A standalone Next.js container runs the customer site, staff UI, API routes, Stripe webhooks, and health endpoint.
- Separate long-running containers run hold expiry and notification workers against the same managed PostgreSQL database.
- Migrations run as a one-off release job before application containers are updated; production seeding is forbidden.
