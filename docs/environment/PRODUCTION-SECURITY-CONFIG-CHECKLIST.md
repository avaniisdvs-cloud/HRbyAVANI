# Production Security & Config Readiness Checklist

> **Status: PARTIALLY CLOSED.** Expectations are explicit and machine-checkable via `lib/production-preflight.ts` (`validateProductionConfig()`). **Full closure requires the production environment to exist and these values to be set + verified there.** UAT exceptions are allowed ONLY in DEV/UAT.

`validateProductionConfig(process.env)` returns `{ ok, environment, errors[], warnings[] }`. In production it returns **errors** (fail-closed) for the critical items below; in non-production it returns advisory notes only.

## 1. Critical production config (errors if violated in production)
| Control | Expectation | Source/guard |
|---|---|---|
| Environment marker | `DATABASE_ENV=production` (or `NODE_ENV=production`+`VERCEL_ENV=production`) | `lib/environment-guardrails.ts` |
| **Demo/dev accounts OFF** | `ENABLE_DEV_ACCOUNTS` unset/false → `areDevAccountsAllowed()===false` | `lib/auth.ts`, `environment-guardrails.ts` |
| **Durable storage** | `DOCUMENT_STORAGE_PROVIDER ∈ {azure,aws,postgres}` (never local/unset) — factory throws otherwise | `lib/storage/factory.ts` |
| **CRON auth** | `CRON_SECRET` set; cron routes require `Bearer $CRON_SECRET` | `app/api/cron/*/route.ts` |
| **MFA / Entra** | `AUTH_MICROSOFT_ENTRA_ID_{TENANT,CLIENT}_ID` set → HIGH_PRIVILEGE_ROLES MFA step-up | `lib/auth.ts` (SEC-04) |
| Public URL | `NEXT_PUBLIC_APP_URL` = prod URL (not localhost) | preflight |
| Signing/encryption | `AUTH_SECRET`, `ENCRYPTION_KEY` set | preflight |
| No committed secrets | no `.env*` tracked in git (verified: none) | `git ls-files` |

## 2. Recommended (warnings)
| Control | Expectation |
|---|---|
| Monitoring | `MONITORING_PROVIDER` set + adapter registered (see MONITORING-READINESS.md) |
| Payroll gate | `PAYROLL_ENABLED` set explicitly (`false` for non-payroll release) once route/action feature-gating is wired |

## 3. Payroll feature-gating requirement (non-payroll first release)
Today payroll is **nav-hidden** (`comingSoon` in `config/workspace-nav.ts`) but **routes + server actions are URL-reachable** by `PAYROLL_ROLES`. Nav-hidden ≠ feature-gated. **Before a non-payroll production release, EITHER:**
- (a) wire a `PAYROLL_ENABLED` flag gating `app/(hr-admin)/payroll/layout.tsx` (redirect when false) **and** the `modules/payroll/actions.ts` server actions (reject when false) — small, additive, auditable; **OR**
- (b) Payroll Owner + Security formally accept that payroll routes remain reachable to authorized HR-tier roles, mitigated by training/policy.
This is tracked as blocker **P-4** in `PRODUCTION-GO-LIVE-READINESS.md`. *(Not implemented by this task — proposed for review.)*

## 4. UAT exceptions — must NOT carry to production
Allowed in DEV/UAT only; each must be closed/verified absent in production:
- Demo accounts (`*@avaniis.dev`) / dev-login alias flow.
- MFA bypass for dev credentials.
- Disposable test fixtures / seed data.
- Local `/tmp` / `public/uploads` document storage.
- Local-DB evidence (not production-faithful).
- `ALLOW_NON_PROD_CLOUD_DB_WRITE`, `ENABLE_MIGRATION_CONSOLE`, `ALLOW_UAT_RELOAD_WRITE` — must be unset in production.

## 5. Pre-deploy verification (run in the target environment)
- [ ] `validateProductionConfig()` returns `ok:true` with `environment: 'production'` (no errors).
- [ ] Confirm a demo email cannot log in (areDevAccountsAllowed=false).
- [ ] Confirm document upload→download round-trips on durable storage.
- [ ] Confirm a cron call without `CRON_SECRET` is rejected.
- [ ] Confirm HIGH_PRIVILEGE_ROLES require Entra MFA.
- [ ] Confirm no `.env*` in the deployed image/repo.
