# Security baseline

## Active controls

- Every application response sends `X-Content-Type-Options`, frame, referrer, permissions,
  and opener policies. Production additionally sends one-year HSTS with subdomains.
- Login sessions are HTTP-only, `SameSite=Lax`, and marked `Secure` in production.
- State-changing API routes require the same application origin and validate their input.
- JSON limits are measured in bytes. Stripe and Resend webhook routes preserve the exact raw
  request text for signature verification, but reject bodies over 256 KiB and 128 KiB
  respectively. Raw provider payloads are not persisted.
- Operational logs and audit history redact credentials, cookies, authorization headers,
  payment data, and raw provider payloads.
- Stripe and Resend webhook processing is signature-verified and idempotent.

## Deployment requirements

- Terminate TLS at the public edge and redirect all HTTP traffic to HTTPS before enabling
  the production application.
- Keep database, Stripe, Resend, session, and webhook secrets in the deployment platform's
  secret store. Never expose server-only values through `NEXT_PUBLIC_` variables.
- Restrict PostgreSQL network access to the application and worker environment. Use TLS for
  managed database connections when the provider supports it.
- Run migrations as a one-off release task and keep the web and worker images updated.
- Review Super Admin audit, webhook, and worker history regularly, and add an external
  error/uptime alert destination before launch.

## Planned safeguards

### Content Security Policy

Do not enable an enforced CSP until the final external image hosts and the Stripe payment
flow have been tested. Start with `Content-Security-Policy-Report-Only`, allow the required
Stripe script/frame/connect origins and approved image hosts, inspect reports, then enforce
the policy. A premature CSP would break card entry or property photography.

### Distributed rate limiting

The current application limiter is process-local, suitable for local development and one
application instance. Before horizontally scaling public API traffic, replace it with a
shared rate-limit service or datastore and configure the hosting proxy so client IP data
cannot be spoofed.

### Security operations

Use least-privilege database credentials, rotate provider keys, keep dependencies current,
and schedule periodic backup-restore and webhook-replay exercises.
