# Email Production Readiness

> Status: **Prepared / awaiting production environment** (blocker P-9). Delivery
> is fail-closed and preflight-checked; live sending needs a configured provider,
> verified sender/domain, and migration 0062 applied to the production DB.

## Delivery model (already enforced in code)

Outbound email is gated by `EMAIL_DELIVERY_MODE` (see
`lib/environment-guardrails.ts` + `modules/communication/delivery-policy.ts`):

| Mode | Behaviour |
|---|---|
| `disabled` (default) | No email is sent. Safe default. |
| `allowlist` | DEV/UAT test mode — only recipients in `EMAIL_TEST_ALLOWLIST` receive mail. **Must not be used in production.** |
| `live` | Production sending. **Requires `DATABASE_ENV=production`** — `validateEmailDeliveryRecipient()` rejects live mode otherwise, so dev/test cannot accidentally send live mail. |

The provider itself (Microsoft Graph / Azure Communication Services / SMTP) is
**admin-configured in the DB** via the communication platform
(`/settings/communication`), with an `SMTP_*` env fallback. Dispatch is decoupled
from business transactions and runs through the `email-dispatch` cron.

## Preflight checks (executable)

`pnpm prod:preflight` (→ `validateProductionConfig`) enforces, in production:

- `EMAIL_DELIVERY_MODE=live` ⇒ **error** unless `DATABASE_ENV=production`.
- `EMAIL_DELIVERY_MODE=allowlist` in production ⇒ **error** (test mode active in prod).
- `EMAIL_DELIVERY_MODE` not `live` ⇒ **warning** (outbound email disabled in prod).
- `EMAIL_DELIVERY_MODE=live` without `SMTP_FROM` ⇒ **warning** (verify sender/domain).

This confirms dev/test email behaviour cannot be active in production and that a
sender identity is considered. **No real email is sent by the preflight.**

## Remaining actions for full closure (P-9)

- [ ] Apply migration `0062_email_platform.sql` to the production DB (currently
      pending per `migration-ledger.production.md`).
- [ ] Configure a production provider (Graph/ACS/SMTP) in `/settings/communication`.
- [ ] Verify sender address + production domain DNS (SPF/DKIM/DMARC).
- [ ] Set `EMAIL_DELIVERY_MODE=live` (only with `DATABASE_ENV=production`).
- [ ] Verify a real dispatch + retry + audit trail in the production environment.

Until configured and verified in the isolated production environment, email
production delivery remains **prepared, not closed**.
