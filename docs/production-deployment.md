# Production deployment

This application is one Next.js web/API service plus two long-running workers:

- `web`: customer site, staff console, API routes, Stripe webhooks, and `/api/health`
- `hold-worker`: expires unpaid reservations
- `notification-worker`: sends queued email and retries temporary failures

Use a managed PostgreSQL service for production. The compose file intentionally does
not create a database container, because a production database needs independent
backups, TLS, upgrades, and recovery controls.

## Before deployment

1. Create a separate managed PostgreSQL database and role, for example
   `evolyst_prod` / `evolyst_prod`. It must never reuse the development database,
   role, password, or backup policy.
2. Copy `.env.production.example` to `.env.production.local`. This file is ignored
   by Git. Put real production secrets only in your hosting platform's encrypted
   secret settings.
3. Set `DATABASE_SSL=require` or `verify-full`, a HTTPS `NEXT_PUBLIC_APP_URL`, live
   Stripe keys, verified Resend domain sender, and a unique 32+ character session
   secret.
4. Create the Stripe production webhook endpoint:
   `https://your-domain.example/api/webhooks/stripe`.
5. Create the Resend production webhook endpoint:
   `https://your-domain.example/api/webhooks/resend`, select the required `email.*`
   delivery events, then store its `whsec_...` signing secret as
   `RESEND_WEBHOOK_SECRET`.
6. Subscribe Stripe to the payment and refund event types listed in `README.md`.
7. Run a production environment preflight. It deliberately refuses placeholders,
   local database hosts, non-TLS databases, test Stripe keys, and console email.

```bash
docker compose -f docker-compose.production.yml --profile maintenance run --rm preflight
```

## Migration and release order

Run one migration job before starting new web or worker containers. It is safe to run
again: migrations are checksummed and recorded in `aureum.schema_migrations`.

```bash
docker compose -f docker-compose.production.yml --profile maintenance run --rm migrate
docker compose -f docker-compose.production.yml up -d --build web hold-worker notification-worker
```

Never run `db:seed` against production. Applied migration files are immutable; add a
new numbered migration for every schema change.

## Health and monitoring

- `GET /api/health` checks that the application can query PostgreSQL and returns
  `200 {"status":"ok"}` only when both are reachable.
- It is intentionally excluded from durable API-request history so frequent health
  probes do not create database noise.
- Monitor this endpoint externally, plus worker process restarts, failed notification
  counts, failed Stripe webhook counts, PostgreSQL storage, connections, and backups.
- Super Admin Settings shows the most recent durable heartbeat for each long-running
  worker. A heartbeat becomes stale after three configured worker intervals.
- Configure alerts for a failing health check, any failed webhook, repeated email
  failures, and a worker that has not restarted or emitted output for a defined period.

## Backups and recovery

Use the managed PostgreSQL provider's encrypted automated backups and point-in-time
recovery as the primary policy. Configure a daily backup, a documented retention
period, and a scheduled restore drill in a non-production database.

For a manual logical backup from a trusted machine with PostgreSQL client tools:

```bash
npm run db:backup
```

The command creates a new custom-format dump under ignored `backups/`. It never
overwrites or restores a database. Set `PG_DUMP_PATH` if `pg_dump` is not on PATH and
`DATABASE_BACKUP_DIRECTORY` to use an approved encrypted backup location.

## Vercel option

Vercel can host the Next.js web/API service, but it does not replace the two
long-running workers. If using Vercel, deploy `web` there with the same encrypted
environment variables, then run `worker:holds` and `worker:notifications` as separate
always-on processes on a container host. The container-compose approach is the simpler
single-host option because all three processes use the same released image.

## CI

`.github/workflows/verify.yml` runs migration validation, type checking, linting, and
a production build on pushes to `main` and pull requests. It intentionally does not
connect to production PostgreSQL or Stripe.
