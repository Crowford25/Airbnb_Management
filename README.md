# Aureum Stays

A luxury property browsing and booking application built with Next.js and PostgreSQL.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
npm run format:check
npm run typecheck
npm run lint
npm run build
```

## PostgreSQL database

Step 5 includes versioned SQL migrations, idempotent seed data, PostgreSQL connection pooling, parameterized repositories, and transaction helpers.

```bash
npm run db:validate
npm run db:migrate
npm run db:seed
npm run db:status
```

The database server must be running and `DATABASE_URL` must be configured in `.env.local` before migration, seed, or status commands can connect.

See [database/README.md](database/README.md) for local PostgreSQL and DBeaver setup.

## Prototype demo

After migrations, run `npm run demo:seed` to prepare the sample catalogue and five local
demo accounts. See [docs/prototype-demo.md](docs/prototype-demo.md) for the login list,
booking walkthrough, and smoke-test command.

## Backend API

Step 6 exposes validated, no-store route handlers backed by PostgreSQL:

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
- `GET|POST /api/properties`
- `GET|PATCH|DELETE /api/properties/:slug`
- `GET /api/properties/:slug/inventory` (computed; no availability rows)
- `GET /api/properties/:slug/rooms` (staff only)
- `PATCH /api/properties/:slug/rooms/:id` (manager/super-admin)
- `GET|POST /api/properties/:slug/room-blocks` (staff read, manager write)
- `DELETE /api/properties/:slug/room-blocks/:id` (manager/super-admin)
- `GET|POST /api/reservations`
- `GET|PATCH /api/reservations/:reference`
- `GET|POST /api/reservations/:reference/payment-intent`
- `POST /api/reservations/:reference/refunds` (authorized staff)
- `POST /api/webhooks/stripe` (signed Stripe events)
- `GET|PATCH /api/users/me`
- `GET /api/users`, `PATCH /api/users/:id`

All mutations validate JSON bodies, enforce same-origin requests, apply role checks,
and write audit events where appropriate. Reservation creation uses short,
serializable transactions and deterministic room-type locks. Availability is derived
from physical rooms, date-range blocks, confirmed reservations, and unexpired holds.
The server prices rate plans, mandatory fees, and taxes and stores each selected room
type in `reservation_items`. Idempotency keys and automatic serialization retries make
safe booking retries possible.

## Unpaid hold worker

Run one continuously in every deployed backend environment:

```bash
npm run worker:holds
```

It expires unpaid holds in small `FOR UPDATE SKIP LOCKED` batches. Multiple workers
may run safely. For a scheduler or health check, `npm run worker:holds:once` performs
one sweep. Computed inventory ignores expired holds immediately even if the worker is
temporarily delayed.

The live API smoke suite expects the development server on port `3017`:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3017
npm run test:api
```

## Admin dashboard

Step 7 provides a responsive staff console backed by live PostgreSQL data:

- `/admin` — operational and revenue overview
- `/admin/operations` — arrivals, departures, holds, and the two-week stay board
- `/admin/properties` — room types, private physical rooms, room status, and date blocks
- `/admin/reservations` — booking contents and lifecycle actions
- `/admin/customers` — searchable customer records and confirmed spend
- `/admin/team` — role-aware staff access management
- `/admin/reports` — manager occupancy and revenue summaries
- `/admin/settings` — Super Admin permission matrix, audit events, and worker status

Employees receive operational read access; team leads can manage reservations; managers
can manage rooms, staff access, and reports; Super Admins can manage all staff roles and
system controls. To exercise every protected page and RBAC boundary against the live
database, start the development server on port `3017`, then run:

```bash
npm run test:admin
```

## Stripe payments

Stripe is isolated behind a provider interface. A direct reservation creates a
30-minute unpaid inventory hold; its reusable PaymentIntent uses the reservation total
in the currency's smallest unit. Only a verified `payment_intent.succeeded` webhook can
confirm the reservation. The browser return page displays processing state but is not
trusted as proof of payment.

Before confirmation, the webhook locks every requested room type and verifies physical
room capacity for every night while excluding the reservation's own hold. A successful
payment confirms automatically when capacity remains. If an operational room change
removed capacity during payment, the reservation is cancelled and the payment is sent
through the automatic refund path instead of creating an overbooking.

Configure these values in `.env.local` using Stripe test-mode credentials:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

For local webhook delivery, forward Stripe events to the application:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Subscribe the production webhook endpoint to:

- `payment_intent.succeeded`
- `payment_intent.processing`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `refund.created`
- `refund.updated`
- `refund.failed`

Webhook event IDs are processed idempotently and only a SHA-256 payload hash is stored.
Customer cancellation refunds use the snapshotted cancellation policy. Authorized staff
can submit full or partial refunds from `/admin/reservations`; Super Admins can monitor
recent webhook results under `/admin/settings`.

The isolated payment smoke suite uses signed synthetic events and does not contact
Stripe:

```bash
npm run test:payments
```

Calendar synchronization is intentionally skipped while the properties are not listed
on external marketplaces.

## Email notifications

Email is the first notification channel. Booking state and notification jobs commit in
the same PostgreSQL transaction, while a separate worker sends email without delaying
payment or cancellation requests.

Implemented events:

- customer booking confirmation after verified payment
- customer reminders 72 hours and 24 hours before property check-in
- customer cancellation notice
- Team Lead, Manager, and Super Admin confirmation/cancellation alerts
- optional `ADMIN_ALERT_EMAILS` override for an explicit recipient list

Local development defaults to a console preview provider. To deliver real email through
Resend, verify the sending domain and configure:

```dotenv
EMAIL_PROVIDER=resend
EMAIL_FROM=Aureum Stays <bookings@your-domain.example>
RESEND_API_KEY=re_...
ADMIN_ALERT_EMAILS=
```

Run one notification worker in each backend environment:

```bash
npm run worker:notifications
```

The worker claims jobs with `FOR UPDATE SKIP LOCKED`, recovers stale claims, uses stable
provider idempotency keys, records every attempt, and retries temporary failures with
bounded exponential backoff. Super Admins can inspect delivery state and errors at
`/admin/settings`.

```bash
npm run test:notifications
```

To record final delivery, bounce, suppression, delay, and spam-complaint states, add a
Resend webhook pointing to `/api/webhooks/resend`, select the relevant `email.*` events,
and store its `whsec_...` signing secret as `RESEND_WEBHOOK_SECRET`. Every delivery is
signature-verified and idempotent; only safe metadata and a payload hash are retained.

Super Admins can export the latest 100 matching API, audit, email, or provider-webhook
history records as CSV from `/admin/settings/history`. Exports are permission-protected,
formula-injection-safe, and recorded in the business audit trail.

## Worker monitoring

The hold-expiry and notification workers write durable heartbeats when running. Super
Admins can see healthy, degraded, stale, or stopped worker state at `/admin/settings`.
Start the continuous workers for this monitoring to report:

```bash
npm run worker:holds
npm run worker:notifications
```

The `:once` commands are intentionally excluded because they are short manual/scheduled
sweeps rather than long-running service instances.

## Security baseline

All responses receive defensive browser headers. Production responses also receive HSTS;
serve the deployed site only through HTTPS. JSON and signed webhook bodies have explicit
byte limits, while provider signature verification still receives the exact unmodified raw
body. Sessions are HTTP-only and production cookies are secure.

An enforced Content Security Policy is intentionally not enabled yet because it must first
allow the final property-image sources and Stripe payment origins. See
[docs/security.md](docs/security.md) for the current controls and the remaining production
hardening work.

## Production deployment

The production layout uses one Next.js web/API container plus separate hold-expiry and
notification-worker containers, connected to a managed PostgreSQL database. No worker
should run inside a browser/serverless request process.

```bash
docker compose -f docker-compose.production.yml --profile maintenance run --rm preflight
docker compose -f docker-compose.production.yml --profile maintenance run --rm migrate
docker compose -f docker-compose.production.yml up -d --build web hold-worker notification-worker
```

See [docs/production-deployment.md](docs/production-deployment.md) for environment
security, Stripe/Resend configuration, backups, monitoring, Vercel considerations, and
release order.

## Project status

- Step 10: Operational logging, audit history, and correlation tracking — complete
- Step 11: Production deployment foundation (Docker, workers, health checks, backups, CI) — complete

- Step 1: Foundation — complete
- Step 2: Customer UI and navigation — complete
- Step 3: Property browsing and booking UI — complete
- Step 4: Authentication and role-based access — complete
- Step 5: PostgreSQL database design and data-access layer — complete
- Step 6: Backend APIs — complete
- Step 7: Admin dashboard — complete
- Calendar synchronization — skipped by product decision
- Step 8: Stripe payments, refunds, cancellation rules, and webhooks — complete
- Step 9: Email confirmations, reminders, cancellations, and admin alerts — complete
