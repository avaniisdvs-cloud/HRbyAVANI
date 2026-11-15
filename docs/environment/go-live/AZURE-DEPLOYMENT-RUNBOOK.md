# Azure Deployment Runbook — AVANIIS HR (Core HR)

> Operational runbook for standing up the Core HR app on Azure. **Execution is
> owner-gated** (IT). This document does not perform any infrastructure change.
> Payroll must remain **OFF**. Baseline: `main` @ `2a9f4f1b`.

## 0. Pre-conditions
- [ ] CAB approval pack reviewed (`CAB-GO-LIVE-APPROVAL-PACK.md`)
- [ ] Azure subscription / resource group provisioned
- [ ] Decision made: Azure App Service (Node) **or** container (`output:'standalone'`)

## 1. Azure app setup checklist
- [ ] Create App Service (Linux) / Container App in target region (e.g. UAE North)
- [ ] Node runtime matches repo (`package.json` engines / Next.js 15.3.9 — Node 20+)
- [ ] Build command: `pnpm install --frozen-lockfile && pnpm build`
- [ ] Start command: `pnpm start` binding `0.0.0.0:$PORT`
- [ ] If container path: set `output: 'standalone'` in `next.config` (tracked as P2)
- [ ] Autoscale / instance size sized for ≤500 employees
- [ ] Deployment slot for blue/green (optional, recommended)

## 2. Environment variables checklist (names only — set secrets in Azure config)
**Required (preflight enforces in production):**
- [ ] `DATABASE_ENV=production`
- [ ] `AUTH_SECRET` (session signing)
- [ ] `DATABASE_URL` (Azure PostgreSQL, `sslmode=require`)
- [ ] `ENCRYPTION_KEY` (PII field encryption — distinct from non-prod)
- [ ] `DOCUMENT_STORAGE_PROVIDER=azure` (durable storage)
- [ ] `AZURE_STORAGE_CONNECTION_STRING`
- [ ] `CRON_SECRET` (cron authentication)
- [ ] `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`, `AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID`, `AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET`
- [ ] `NEXT_PUBLIC_APP_URL=https://<prod-domain>` (not localhost)
- [ ] `MONITORING_PROVIDER=<sentry|datadog|appinsights>` (+ provider DSN/keys)
- [ ] `EMAIL_DELIVERY_MODE=live` (only with `DATABASE_ENV=production`) + `SMTP_FROM`/provider config
- [ ] `ANTHROPIC_API_KEY` (ARIA)

**Must be OFF / absent in production:**
- [ ] `PAYROLL_WORKSTREAM_ENABLED` — **unset or `false`** (and `NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED` likewise)
- [ ] `ENABLE_DEV_ACCOUNTS` — **unset / not `true`**
- [ ] `NODE_ENV=production`

**Verification:** run `pnpm prod:preflight` in the prod environment → must exit `0`.
A misconfiguration (dev accounts, non-durable storage, missing secret, localhost
URL, payroll flag mismatch) makes it **fail closed (exit 1)**.

## 3. Domain / subdomain / SSL checklist
- [ ] Production domain/subdomain decided (e.g. `hr.avaniis.global`)
- [ ] DNS records created; managed TLS certificate issued + bound
- [ ] HTTP→HTTPS redirect enabled; HSTS as per policy
- [ ] `NEXT_PUBLIC_APP_URL` matches the live domain
- [ ] Entra app **redirect/callback URLs** updated to the prod domain (`/api/auth/callback/...`)

## 4. Entra / MFA checklist
- [ ] Entra app registration for production (separate from DEV/UAT)
- [ ] Redirect URIs + logout URLs registered
- [ ] MFA enforced for `HIGH_PRIVILEGE_ROLES` (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN)
- [ ] Client secret stored in Azure config (not in repo)
- [ ] Break-glass SUPER_ADMIN path validated (see smoke checklist)

## 5. Payroll flag — must remain OFF
- [ ] `PAYROLL_WORKSTREAM_ENABLED` unset/`false` confirmed in Azure config
- [ ] Post-deploy: `/payroll` returns the "Payroll is disabled in this environment." notice
- [ ] Payroll workspace absent from navigation

## 6. Health check verification
- [ ] `GET /api/health` → `{status:"ok"}`
- [ ] `GET /api/health/db` → `200` with numeric `dbMs` (DB reachable)
- [ ] Sign-in page renders; one authenticated route loads
- [ ] `pnpm prod:preflight` exit `0` in prod env

## 7. Rollback steps
- [ ] Keep previous deployment slot / image tag available
- [ ] If health checks fail: swap back to prior slot (or redeploy prior image)
- [ ] Confirm DB schema compatibility before any forward-only migration (see migration runbook)
- [ ] Communicate rollback to stakeholders; record in change log
- [ ] Re-run health checks + preflight after rollback

## 8. Post-deploy sign-off
- [ ] Smoke checklist (`CORE-HR-PRODUCTION-SMOKE-CHECKLIST.md`) executed green
- [ ] Monitoring receiving events; test alert fired
- [ ] IT Owner sign-off recorded in CAB pack
