# Enterprise Email Communication Platform — Deployment & Operations Notes

> Added 2026-06-06. Provider-agnostic (Microsoft Graph API **or** SMTP),
> admin-configurable, multi-tenant-ready email platform for AVANIIS HCM.

## What shipped

| Area | Location |
|---|---|
| DB schema | `drizzle/schema/communication.ts` (5 tables) |
| Migration | `drizzle/migrations/0062_email_platform.sql` |
| Provider abstraction | `modules/communication/providers/{types,graph,smtp}.ts` |
| Email service | `modules/communication/email-service.ts` |
| Orchestrator | `modules/communication/orchestrator.ts` |
| Templates | `modules/communication/templates/{render,base-layout,seeds}.ts` |
| Action tokens | `modules/communication/action-tokens.ts` (reuses `workflow_email_tokens`) |
| Server actions | `modules/communication/actions.ts` |
| Admin UI | `app/(hr-admin)/settings/communication/` |
| Dispatch cron | `app/api/cron/email-dispatch/route.ts` (+ `vercel.json`) |
| Approval handler | `app/api/workflow/action/route.ts` (extended: provider channel + branded page) |
| Leave email wiring | `modules/absence/actions.ts` → `submitLeaveRequest` (non-blocking) |
| Audit channel | `lib/audit.ts` (+ `EMAIL_GRAPH`, `EMAIL_SMTP`) |
| Tests | `tests/unit/communication-platform.test.ts` |

## Architecture (hard rule)

`Business event → NotificationOrchestrator → EmailService → selected provider`.
Business logic never calls a provider directly. Email is **queued** in
`email_messages` and delivered asynchronously by the cron dispatcher, so a
provider outage can never block or roll back the originating transaction
(e.g. leave submission).

## Migration deployment (manual — Neon)

The Drizzle journal only tracks 0000–0039; **0062 is a manual migration**.
DB safety rails (`guard-db-write.js`) intentionally block automated writes to Neon.

1. Open the Neon SQL Editor (Test environment first).
2. Paste & run `drizzle/migrations/0062_email_platform.sql` (idempotent —
   `CREATE TABLE IF NOT EXISTS`, enums guarded with `DO $$ … EXCEPTION`).
3. Verify the 5 tables + enums exist, then repeat in Production.
4. No change needed for `audit_log.channel` — it is `varchar(30)` with no CHECK
   constraint, so the new `EMAIL_GRAPH` / `EMAIL_SMTP` values are TS-side only.

No `email_action_tokens` table is created — the existing `workflow_email_tokens`
table is reused for approve/reject links.

## Environment variables

| Var | Purpose | Status |
|---|---|---|
| `ENCRYPTION_KEY` | AES-256-GCM for provider secrets | **reused** (already set) |
| `WORKFLOW_JWT_SECRET` | Signs email approval tokens | **reused** (already set) |
| `CRON_SECRET` | Authorises the dispatch cron | **reused** (already set) |
| `NEXT_PUBLIC_APP_URL` | Base URL for approval links | should be set (defaults to `https://hr.avaniis.ae`) |

**No new env vars are required.** Provider credentials (Graph tenant/client/secret,
SMTP host/user/password, endpoints) are stored **in the database, encrypted**, and
configured from the Administration UI — not via env. The legacy env-driven sender
in `modules/employee-letters/email.ts` is untouched and independent.

## Cron schedule

`vercel.json` adds `/api/cron/email-dispatch` every 5 minutes (`*/5 * * * *`).
- Accepts `GET` (Vercel Cron) and `POST`; both require `Authorization: Bearer ${CRON_SECRET}`.
- **Idempotent under concurrency**: each message is claimed via an atomic
  `QUEUED → SENDING` conditional update (`WHERE status='QUEUED' RETURNING`), so
  overlapping dispatch runs can never double-send a message.
- On Vercel Hobby plan, cron is limited to daily — adjust the schedule or run on a
  Pro plan / external scheduler if 5-minute cadence is required.

## Configuration steps (admin)

1. Administration → Settings → **Communication Settings**.
2. Fill the **Graph API** and/or **SMTP** tab → Save (secrets are encrypted; the
   field shows `••••••••` afterwards — leave it to keep, retype to rotate).
3. Set **Sender Defaults** (per-module from-addresses).
4. **Test Email** tab → send a test → provider is marked *Tested* on success.
5. **Provider** tab → **Activate** the tested provider (only one active at a time).
   - Activation requires a PASSED test, unless a SUPER_ADMIN supplies an override
     reason (audited).

## Security notes

- Secrets AES-256-GCM encrypted at rest (`*_enc` columns); never returned to the
  browser (page strips them, exposes only boolean "configured" flags).
- Provider execution is server-only (`import 'server-only'`); credentials never
  reach client JS.
- Approval links: HMAC-signed, single-use (atomic `used_at` claim), time-bound
  (`exp`), nonce (`jti`). Decisions flow through `takeWorkflowAction` — RBAC,
  wrong-approver rejection, completed/reassigned/cancelled invalidation, and
  idempotency are all enforced by the existing engine.
- All config changes, activations, test attempts, template edits, retries and
  email approval decisions are written to the immutable audit log; email decisions
  carry channel `EMAIL_GRAPH` / `EMAIL_SMTP`.
- Email queue failures in leave submission are caught and logged — they never roll
  back or block the leave request; missing manager work email simply skips email.

## Multi-tenant / global readiness

`email_provider_settings` and `email_sender_defaults` carry `tenant_id` +
nullable `legal_entity_id`. Today one global active config is used; the resolver
(`getActiveProviderRow`) is tenant-scoped so per-legal-entity providers, regional
sender domains, and language-specific templates (`email_templates.language_code`)
can be layered in without schema changes.

## Verification performed

- `pnpm typecheck` → 0 errors.
- `pnpm build` → success; `/settings/communication`, cron, and action routes compiled.
- `pnpm vitest run tests/unit/communication-platform.test.ts` → 15/15 passed.
- Regression: `absence-services` + `approval-notification-detail` → 35/35 passed.

### Remaining manual verification (needs a configured provider + DB)
- End-to-end: submit leave → `email_messages` QUEUED row to manager work email →
  cron dispatch → SENT; click Approve → workflow APPROVED + branded confirmation +
  audit row with `EMAIL_GRAPH`/`EMAIL_SMTP`; reused/expired token rejected.
- UI light/dark contrast pass on `/settings/communication`.
