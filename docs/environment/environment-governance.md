# AVANIIS HRMS Environment Governance

Status: ENV-GOV complete repo guardrails
Approved model: single active DEV/UAT environment today; future Production environment later.

## Definitions (formal — added 2026-06-12 per Independent Validation G2)

These two terms are NOT interchangeable. Auditors and executive readers must apply these definitions everywhere in the documentation set:

| Term | Meaning |
|---|---|
| **Production Deployment** | The currently deployed Vercel environment serving users — the `production` build target aliased to **http://localhost:3001**. Today it serves the **single DEV/UAT Neon database**. A migration can therefore be "applied" with respect to the Production Deployment while the Production *Environment* ledger correctly shows `pending`. |
| **Production Environment** | The future **isolated** production database environment (separate Neon instance, separate secrets/encryption keys), governed by `migration-ledger.production.md`. Not yet active. All `pending` statuses in that ledger refer to this environment, not to the live deployment. |

Consequently: statements like "0063/0064 production apply pending" mean *pending in the future isolated Production Environment* — they do **not** contradict "deployed and live at avaniishcm.vercel.app".

## Authoritative Model

AVANIIS HRMS currently operates with one active database tier:

| Tier | Purpose | Writes | Reloads | Email | Demo Accounts |
|---|---|---|---|---|---|
| DEV/UAT | Migration Factory, Email Platform UAT, effective-dating replay, release certification | Allowed only with explicit guard flags | Allowed only with explicit reload flag | Allowlist only | Explicitly allowed if enabled |
| Future Production | Real operational HRMS data after go-live | Approved production maintenance only | Never allowed | Live delivery only | Blocked |

When Production is created later, switch `ENV_GOVERNANCE_MODE` from `single-dev-uat` to `uat-prod` and configure `PROD_DATABASE_URL` for host comparison.

## Required Environment Variables

| Variable | Current DEV/UAT | Future Production |
|---|---|---|
| `ENV_GOVERNANCE_MODE` | `single-dev-uat` | `uat-prod` after Production exists |
| `DATABASE_ENV` | `test` or `uat` | `production` |
| `DATABASE_URL` | Active DEV/UAT Neon URL | Future Production Neon URL |
| `PROD_DATABASE_URL` | Optional today; required when `ENV_GOVERNANCE_MODE=uat-prod` | Production Neon URL |
| `ALLOW_NON_PROD_CLOUD_DB_WRITE` | `true` only during approved write windows | `false` |
| `ALLOW_UAT_RELOAD_WRITE` | `true` only during approved reload windows | `false` |
| `ALLOW_PRODUCTION_DB_WRITE` | `false` | `false` by default; one-off emergency only |
| `ENABLE_MIGRATION_CONSOLE` | `true` only during approved migration windows | `false` |
| `ENABLE_DEV_ACCOUNTS` | Optional, explicit | `false`; ignored by code when `DATABASE_ENV=production` |
| `EMAIL_DELIVERY_MODE` | `allowlist` or `disabled` | `live` |
| `EMAIL_TEST_ALLOWLIST` | Required when allowlist mode is enabled | Empty or unset |
| `CRON_SECRET` | Unique UAT secret | Unique production secret |
| `NEXT_PUBLIC_APP_URL` | UAT URL | Production URL |

## Guardrail Rules

### DEV/UAT

DEV/UAT writes require:

1. `DATABASE_ENV=test` or `DATABASE_ENV=uat`.
2. `ENV_GOVERNANCE_MODE=single-dev-uat` today.
3. `ALLOW_NON_PROD_CLOUD_DB_WRITE=true`.
4. If `PROD_DATABASE_URL` is configured, `DATABASE_URL` must not match it.
5. When future Production exists, `ENV_GOVERNANCE_MODE=uat-prod` requires `PROD_DATABASE_URL` and host mismatch.

Migration Console clear/reload additionally requires:

1. `ENABLE_MIGRATION_CONSOLE=true`.
2. `ALLOW_UAT_RELOAD_WRITE=true`.
3. SUPER_ADMIN role.
4. The typed confirmation required by the action.

### Production

Future Production must:

1. Switch to `ENV_GOVERNANCE_MODE=uat-prod`.
2. Set `DATABASE_ENV=production`.
3. Configure `PROD_DATABASE_URL`.
4. Keep `ENABLE_MIGRATION_CONSOLE=false`.
5. Keep `ALLOW_UAT_RELOAD_WRITE=false`.
6. Keep `ENABLE_DEV_ACCOUNTS=false`.
7. Use `EMAIL_DELIVERY_MODE=live` only after provider certification.
8. Never run Step 2 Clear, Migration Factory reload, or destructive test cleanup.

## Migration Promotion Policy

Manual migrations must be tracked per environment:

1. Record planned migration in the Test/UAT ledger.
2. Run precheck SQL against Test/UAT.
3. Apply only the approved migration to Test/UAT.
4. Run verification SQL and attach evidence.
5. Mark Test/UAT ledger status `verified`.
6. When Production exists, request human production approval.
7. Repeat precheck, apply, and verification against Production.
8. Mark Production ledger status `verified`.

Future Production migrations must not rely on the Migration Console or Migration Factory reload tooling.

## Reload Policy

Reloads are DEV/UAT-only. Step 2 Clear or equivalent destructive cleanup must not run unless:

1. Target is confirmed as Test/UAT.
2. `DATABASE_ENV=test` or `DATABASE_ENV=uat`.
3. `ALLOW_NON_PROD_CLOUD_DB_WRITE=true`.
4. `ALLOW_UAT_RELOAD_WRITE=true`.
5. If future Production exists, `PROD_DATABASE_URL` comparison passes.
6. A human approval record exists for the reload window.

## Email Allowlist Policy

DEV/UAT email delivery must use:

```env
EMAIL_DELIVERY_MODE=allowlist
EMAIL_TEST_ALLOWLIST=approved.user@example.com,@example.test
```

Allowlist entries may be exact email addresses, domains, or wildcard subdomains such as `*.example.test`.

Future Production email delivery must use:

```env
EMAIL_DELIVERY_MODE=live
```

Live mode is intended only when `DATABASE_ENV=production`.

## Demo Account Policy

Hardcoded demo accounts are allowed for local development and approved DEV/UAT only. The code ignores `ENABLE_DEV_ACCOUNTS=true` when `DATABASE_ENV=production`.

## Human Approval Requirements

Human approval is required before:

1. Changing `ENV_GOVERNANCE_MODE`.
2. Creating future Production.
3. Configuring Vercel DEV/UAT or Production secrets.
4. Running DEV/UAT reloads.
5. Applying manual production migrations.
6. Switching email delivery from `disabled` to `allowlist` or `live`.

## Verification Checklist

Before any release stream resumes:

1. Confirm `DATABASE_ENV`.
2. Confirm `ENV_GOVERNANCE_MODE`.
3. Confirm target host differs from production when `ENV_GOVERNANCE_MODE=uat-prod`.
4. Confirm required flags match the operation.
5. Confirm migration ledger status.
6. Confirm email delivery mode.
7. Confirm demo accounts are blocked in production.
