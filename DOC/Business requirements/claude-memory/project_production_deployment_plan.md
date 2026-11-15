# AVANIIS HR — Production Deployment Plan (decisions locked 2026-06-02)

Status: **Deferred** — user is finishing UAT + sign-off first, will resume deployment later.
This is a PLAN, not yet executed. Nothing has been provisioned. Code freeze still in effect.

## Locked decisions

- **Cloud:** Microsoft Azure (chosen because the app already uses Auth.js + Entra ID SSO; UAE company).
- **Region:** **UAE North (Dubai)** for Production (PDPL data residency). Test may use West Europe to save ~$30/mo since test holds no real PII.
- **Environments:** TWO required — **Test/UAT** and **Production** (fully isolated: separate resource groups, DBs, storage, secrets, Entra app registrations).
- **Sizing tier:** Small — **≤ 500 employees**.
- **Data residency:** UAE preferred, EU acceptable (so EU OK for Test only).
- **Combined cost estimate:** ~$360–590/mo (Test ~$70–110, Prod ~$290–480).

## Domains

- Company migrating domain **Avaniis.global → AVANIIS.global**.
- Plan: host under subdomains of avaniis.global (free — just DNS records + free Azure managed TLS):
  - **Production:** `hr.avaniis.global`
  - **Test/UAT:** `hr-test.avaniis.global`
- One domain → both env subdomains. No `.biz`/gimmick TLDs. `.global` is fine.
- ⚠️ Coordinate HR go-live with the domain + Entra ID migration: add avaniis.global as a verified domain in Entra ID and migrate UPNs BEFORE pointing the app at hr.avaniis.global, so SSO is seamless. Redirect URI to register: `https://hr.avaniis.global/api/auth/callback/microsoft-entra-id`.

## Recommended spec (Small tier, Azure UAE North)

- **App:** Azure App Service Linux, **P1v3** (2 vCPU/8GB), Node 20 LTS, 1–2 instances + a **staging slot** for zero-downtime swap. (Test: Basic **B2**, single instance.)
- **DB:** Azure DB for PostgreSQL **Flexible Server, PG 16**, prod `Standard_D2ds_v5` (2vCPU/8GB) 64GB PITR 35d; test Burstable `B2s` 32GB PITR 7d. Private VNet, no public access.
- **Storage:** Blob Storage, private container `avaniis-documents` (test: `avaniis-documents-test`). Sets `DOCUMENT_STORAGE_PROVIDER=azure`.
- **Secrets:** Azure Key Vault. **Front Door + WAF** on prod. **App Insights + Azure Monitor** for observability.
- **Scheduler:** replaces Vercel cron — Azure Container Apps Job / Logic App hits `/api/cron/*` (workflow-sla, probation-alerts) daily 0 9 * * * with `CRON_SECRET` header.

## ⚠️ Pre-deploy CODE changes required (need code-freeze lift before go-live)

The app is currently tuned for Vercel serverless + Neon. For an always-on server, change:
1. `lib/db.ts` — production pool `max: 1` → **`max: 10`** (max:1 is a severe bottleneck on a long-lived Node server; it exists to avoid Neon exhaustion across 50 Vercel lambdas).
2. `next.config.mjs` — add **`output: 'standalone'`** for a lean Docker/deploy artifact.
3. `package.json` start — confirm binds `0.0.0.0:$PORT` (App Service sets PORT).
4. `DATABASE_URL` with `?sslmode=require` (code forces `ssl:'require'` — fine for Azure managed Postgres; would break against a plain Docker Postgres).
Note: db.ts reads **`DATABASE_URL`** (CLAUDE.md sometimes says POSTGRES_URL — the code uses DATABASE_URL).

## ⚠️ Migration journal gap (critical for DB setup)

`drizzle-kit migrate` only applies **0000–0039**. Migrations **0040–0054 are manual SQL** and are skipped by the journal. On a fresh prod/test DB you MUST apply 0040–0054 in order manually (psql / Azure query editor), then verify (expect ~109 tables; `departments.work_schedule_id` present; 36-type person_documents_type_check). Apply + verify in TEST first, then prod during the release window. Never run an unverified migration against prod.

## Data isolation / PDPL + HR ethics (non-negotiable)

- **No real employee PII in Test** — use `pnpm db:seed:dev` (anonymized/seeded), never a copy of prod DB.
- Separate `FIELD_ENCRYPTION_KEY` + `AUTH_SECRET` per environment (test JWT must be rejected by prod and vice versa).
- Separate Entra ID app registrations per env. Generate FRESH prod secrets (don't reuse staging). **Escrow `FIELD_ENCRYPTION_KEY` offline — losing it makes all PII unrecoverable.** Rotate the old staging Neon password.
- `ENABLE_DEV_ACCOUNTS` never in prod.

## Promotion flow

push→main → GitHub Actions (typecheck+tests) → auto-deploy TEST → UAT sign-off → manual approval → deploy to PROD **staging slot** → smoke test → **slot swap** to production. Migrations always applied/verified in Test first.

## Open items before resuming deployment

1. User lifts code freeze for the 4 pre-deploy changes.
2. Confirm Test region (UAE North vs West Europe).
3. Confirm domains hr.avaniis.global / hr-test.avaniis.global once avaniis.global is live.
4. Prove Azure Blob storage end-to-end (current UAT is local `/tmp` — files ephemeral; this is a standing production blocker — see DMG-PROD-1..5 in CLAUDE.md).
5. Confirm Azure subscription + production Entra ID app registration exist.

## Benchmark context (why deploying)

McKinsey BPE audit (2026-06-02): on built modules (payroll excluded), AVANIIS scored ~80% / maturity 4.0 — ranked 4th of 5, ahead of MS Dynamics 365 HR, behind Workday/Oracle/SAP; best-in-class on UAE compliance + audit/security. User wants to position AVANIIS as #1 AI-native HCM for UAE/GCC. Deliverable when resuming: combined two-environment runbook + CI/CD GitHub Actions workflow (offered as Word doc).
