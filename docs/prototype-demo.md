# Prototype demo guide

For local development only, configure `DATABASE_URL` and an `AUTH_SESSION_SECRET` of at
least 32 characters in `.env.local`, then run:

```bash
npm run db:migrate
npm run demo:seed
npm run dev
```

`demo:seed` is safe to rerun. It refreshes the sample catalogue and creates these accounts;
it does not delete reservations or other local records. All passwords are `AureumDemo!2026`.

| Role        | Email                       |
| ----------- | --------------------------- |
| Customer    | `demo.customer@aureum.test` |
| Employee    | `demo.employee@aureum.test` |
| Team Lead   | `demo.lead@aureum.test`     |
| Manager     | `demo.manager@aureum.test`  |
| Super Admin | `demo.admin@aureum.test`    |

## Suggested presentation

1. Search Kuala Lumpur for two guests, open The Opaline Residence, and select a two-night
   future stay.
2. Create a booking as the Customer. Use Stripe test mode if configured; otherwise show the
   hold and price summary.
3. Sign in as Super Admin to show reservations and `/admin/settings/history`.
4. Sign in as Employee, Team Lead, and Manager to demonstrate role-based access.

With the app running on port 3017, `npm run test:demo` verifies the booking/inventory flow,
hold expiry, customer privacy, and admin role protection. It uses only local data and does
not contact Stripe or Resend.
