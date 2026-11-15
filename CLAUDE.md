# Avaniis current working copy

For current local setup and validation, read `docs/AVANIIS-PREVIEW.md` first.
Historical deployment and certification notes below are inherited evidence and
must not be treated as a live cloud configuration for this working copy.

---

# AVANIIS HR — Project Constitution

> **FOUNDATION CERTIFIED & FROZEN (2026-06-12)** — authoritative entry point: `docs/FOUNDATION-FREEZE-RECORD-v1.0.md` (baseline `f524664`). No foundational model changes without Foundation Board approval.
> Last snapshot: **2026-06-04**
> Full context: `docs/project-memory/2026-06-04/` (load from there, not this file)
> Recommended first load: `docs/FOUNDATION-FREEZE-RECORD-v1.0.md` → `00-README-HANDOVER.md` → `03-CURRENT-STATE.md` → `11-DO-NOT-BREAK-RULES.md`

---

## Identity

**Product:** AVANIIS HR — AI-native bilingual (EN/AR) UAE-compliant HCM platform  
**Client:** Avaniis / Avaniis (UAE)  
**Phase 1 MVP:** COMPLETE and QA-certified  
**Production:** http://localhost:3001 (Vercel fra1 + Neon eu-central-1)  
**Stack:** Next.js 15.3.9 · PostgreSQL 16 (Neon) · Drizzle ORM 0.45.2 · Auth.js v5 · Tailwind CSS · shadcn/ui · pnpm

---

## Current State (2026-06-12 — Core HR foundation certified at `f524664`)

- Phase 1 MVP: **COMPLETE** — 121 pages, 0 TS errors, all tests pass
- Migration V2: **BUILT, false-success bug FIXED** — DB has 21 pilot employees (lineManagerId=null, absence_balances=0)
- **⚠️ DO NOT reload pilot without running Step 2 Clear first**
- Reload sequence: Step 2 → Step 3 → Steps 4–9 with `hr_data_migration/UAT/pilot-v2-migration-package.xlsx`
- Document storage: UAT on `/tmp` — Azure/S3 NOT configured (5 production blockers open)
- WIP migrations in `drizzle/migrations/` (0055, 0056, 0057, 0060, 0061 with `_wip_` prefix): **NOT applied to Neon**
- **Email Communication Platform (2026-06-06):** admin-configurable Graph API / SMTP platform built (`modules/communication/`, `/settings/communication`, dispatcher cron). Migration `0062_email_platform.sql` — **applied to the DEV/UAT Neon DB (all 5 tables verified live 2026-06-12; see ledger)**. Next clean slot is now **0065**. Reuses `workflow_email_tokens` (no new token table). Details: `docs/EMAIL-COMMUNICATION-PLATFORM.md`.
- **Effective-dating (updated 2026-06-12):** audit (doc 19, 45/100) remediated on branch `feat/effective-dating-phase-1` — Phases 1, 2A–2D COMPLETE, independently revalidated at **72/100**. Done: DB constraints (0063/0064), nightly future-dated activation cron, as-of query engine + consumers, retro split (certified PASS 11/11). **Still open pending PO answers Q20.2/Q20.3/Q20.5:** retro payroll, mid-period proration, as-of EOSB, absence-balance ledger. Design+evidence: `docs/effective-dating/00-EFFECTIVE-DATING-IMPLEMENTATION.md`; closure record: doc 19 §9. Ledger: 0063/0064 verified DEV/UAT; isolated Production Environment apply pending (see Definitions, `docs/environment/environment-governance.md`).

---

## Non-Negotiable Rules (ADR-001)

1. **Every DB write** = `db.transaction()` + `audit.log(tx, ...)` in the same transaction handle
2. **HR records never deleted** — use `lib/effective-date.ts` (close + open records)
3. **PII fields** (emirates_id, passport_number, iban) = `lib/encryption.ts` before persist
4. **Bilingual mandatory** — every user-facing string must have `name_en` AND `name_ar`
5. **Server Actions pattern:**
   ```typescript
   const session = await auth(); requireRole(session, 'HR_ADMIN')
   const data = Schema.parse(input)
   // BR-xx comment for every business rule applied
   await db.transaction(async tx => { ...write... await audit.log(tx, ...) })
   revalidatePath(...)
   ```
6. **Cross-module imports** only via `modules/*/index.ts` barrels
7. **CSS tokens only** — `var(--accent)` never `#2E6170`
8. **NEVER use `translateError()` in Server Action catch blocks** — it re-throws as `never`, crashing Server Component renders; return `{ error: string }` instead
9. **tenant_id** on every table, every insert: `DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`
10. **Two nav files in sync** — `config/workspace-nav.ts` and `config/admin-nav.ts` must always be updated together

---

## Architecture Summary

```
app/
├── (auth)/              public sign-in/out
├── (employee)/me/       ESS — 19 routes
├── (hr-admin)/          HR Admin + Manager — 97+ routes
├── (signing)/me/        Public letter signing
└── api/                 29 API routes (cron, health, ARIA, auth, documents, dataops)

modules/                 Business logic (Server Actions)
├── core-hr/             persons, positions, departments, org chart
├── absence/             leave management (advisory lock + backdate policy)
├── payroll/             WPS, EOSB, salary elements
├── workflow/            configurable approval engine (collision-hardened)
├── migration/           V2 9-step data migration wizard
├── aria/                AI agent (Claude API + RAG)
└── ...                  11 more modules

lib/
├── db.ts                Drizzle client (max:5 pooled, ssl:require)
├── auth.ts              7 roles, requireRole(), MFA step-up for HIGH_PRIVILEGE_ROLES
├── audit.ts             INSERT-only audit trail
├── encryption.ts        AES-256-GCM for PII
├── workflow-engine.ts   Approval engine (fully collision-hardened)
└── effective-date.ts    Close + open records pattern

drizzle/
├── schema/              11 files, 109 pgTable defs (foundation.ts = 91KB — load carefully)
└── migrations/          70 files; journal covers 0000–0039 ONLY; 0040–0054 applied manually
```

**Migration gap:** `pnpm drizzle-kit migrate` covers 0000–0039 only. Migrations 0040+ are manual SQL applied via Neon SQL Editor. Next clean slot: **0065** (verify by checking folder). WIP migrations 0055, 0056, 0057, 0060 (`_wip_` prefix) are NOT applied to Neon; 0061 apply status unrecorded (verify before relying on it). **0062, 0063, 0064 ARE applied to the DEV/UAT Neon DB** (0062 tables + 0063/0064 constraints verified live 2026-06-12 — `docs/effective-dating/01-ED-CLOSURE-VERIFICATION-2026-06-12.md`). Apply status SSOT: `docs/environment/migration-ledger.test.md` / `migration-ledger.production.md`. Note: the Vercel "production" target (avaniishcm.vercel.app) currently serves this single DEV/UAT Neon DB; the isolated Production environment is not yet active (`docs/environment/environment-governance.md`).

---

## Roles (7)

| Role | Scope |
|---|---|
| EMPLOYEE | Own records only (ESS) |
| MANAGER | Team + approvals |
| PAYROLL_ADMIN | Payroll module |
| FINANCE | Finance reports |
| HR_ADMIN | Full HR (entity-scoped) |
| HR_DIRECTOR | Full HR (cross-entity) |
| SUPER_ADMIN | Everything + DataOps + Migration |

`HIGH_PRIVILEGE_ROLES` = HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN → require `mfaVerified===true`

---

## Commands

```bash
# Development
pnpm install            # install dependencies
pnpm dev                # dev server → http://localhost:3000
pnpm build              # production build (must produce 0 errors)
pnpm typecheck          # TypeScript check (must produce 0 errors)
pnpm start              # serve production build

# Testing
pnpm test               # all Vitest unit/integration/chaos/security
pnpm vitest run tests/unit          # unit only
pnpm vitest run tests/integration   # integration only
pnpm vitest run tests/security      # security suite

# E2E (run against production server, not dev)
pnpm start &
pnpm playwright test
pnpm playwright test --project=hr-admin  # single role

# Type check before commit
pnpm typecheck && pnpm build
```

---

## Rejected Stack (ADR-001 — reject immediately if suggested)

NestJS · Kafka · Redis · Zookeeper · Flyway · pgAdmin · React Native · Prisma · TypeORM · Kubernetes · Kong

---

## Design System Tokens (always use, never raw hex)

```css
var(--bg) var(--surface) var(--card) var(--border)
var(--ink-1) var(--ink-2) var(--ink-3) var(--ink-4)
var(--accent) var(--accent-050) var(--accent-100) var(--accent-200) var(--accent-700)
var(--nav-bg) var(--nav-fg) var(--nav-active-bg) var(--nav-active-fg)
var(--font-sans)    /* Inter */
var(--font-serif)   /* Fraunces — headings */
var(--font-mono)    /* JetBrains Mono — codes */
```

---

## Dev Credentials (local only, NODE_ENV=development)

```
super.admin@avaniis.dev / demo   (SUPER_ADMIN)
hr.admin@avaniis.dev    / demo   (HR_ADMIN)
manager@avaniis.dev     / demo   (MANAGER)
employee@avaniis.dev    / demo   (EMPLOYEE)
```

---

## Key Environment Variables (names only)

`DATABASE_URL` · `FIELD_ENCRYPTION_KEY` · `AUTH_SECRET` · `AZURE_AD_TENANT_ID` · `AZURE_AD_CLIENT_ID` · `AZURE_AD_CLIENT_SECRET` · `DOCUMENT_STORAGE_PROVIDER` · `AZURE_STORAGE_CONNECTION_STRING` · `ANTHROPIC_API_KEY` · `CRON_SECRET` · `NODE_ENV`

---

## Full Context

All detailed documentation is in `docs/project-memory/2026-06-04/`:

| # | File | Purpose |
|---|---|---|
| 00 | 00-README-HANDOVER.md | How to use this package |
| 01 | 01-PROJECT-BASELINE.md | Stack, deployment, auth, commands |
| 02 | 02-MODULE-MAP.md | All modules with status |
| 03 | 03-CURRENT-STATE.md | What's done, what's broken, what's next |
| 04 | 04-DATABASE-MODEL.md | Schema, migrations, tables |
| 05 | 05-RBAC-SECURITY.md | Roles, permissions, security controls |
| 06 | 06-WORKFLOW-RULES.md | Workflow engine, collisions, invariants |
| 07 | 07-UI-PATTERNS.md | Design system, layout, component patterns |
| 08 | 08-PAYROLL-READINESS.md | Payroll blueprint |
| 09 | 09-AI-SESSION-GUIDE.md | How to run AI sessions efficiently |
| 10 | 10-NEXT-DEVELOPMENT-PLAN.md | Priorities and roadmap |
| 11 | 11-DO-NOT-BREAK-RULES.md | Architectural invariants checklist |
| 12 | 12-FILE-OWNERSHIP-MATRIX.md | Risk levels per file/path |
| 13 | 13-CODEX-START-PROMPT.md | Codex startup prompt |
| 14 | 14-CLAUDE-START-PROMPT.md | Claude Code startup prompt |
| 15 | 15-VERIFIED-IMPLEMENTATION-MATRIX.md | Evidence-backed module status |
| 16 | 16-DEPENDENCY-GRAPH.md | Module dependencies and risk propagation |
| 17 | 17-CONTEXT-LOADING-MATRIX.md | Minimum file sets per task type |
| 18 | 18-ARCHITECTURAL-DECISIONS.md | Why decisions were made |
| 19 | 19-EFFECTIVE-DATING-AUDIT.md | ⚠️ Effective-dating/date-tracking discovery audit (2026-06-06) — findings, risk register, PO questions |
| 20 | 20-ORACLE-FUSION-DATETRACK-REFERENCE.md | Oracle Fusion DateTrack benchmark used by doc 19 |
