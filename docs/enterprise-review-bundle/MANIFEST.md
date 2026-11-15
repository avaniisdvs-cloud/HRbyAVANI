# AVANIIS HR — Enterprise Review Extraction MANIFEST

Generated: 2026-06-13 · Repo: /Users/d.kethari/D_Drive/AVANIIS_HR_SYS · Branch: main (clean) · HEAD: 61eb76b

Bundles (upload to Copilot in this order):
| # | Bundle | Size | Lines | Contents |
|---|---|---|---|---|
| 0 | MANIFEST.md | 5K | this file | Map of all bundles + per-item status |
| 1 | P1-CRITICAL.md | 104K | 1,633 | QA/QC reports, effective-dating docs (4), audit doc 19/20, effective-date.ts, as-of-query.ts, CLAUDE.md, CHANGELOG.md |
| 2 | P2-IMPORTANT.md | 364K | 4,406 | architecture (5), environment (3), migration-factory (12), migrations 0062/0063/0064, 2 crons, requirements spec |
| 3 | P3-DEPTH.md | 664K | 15,915 | module source — core-hr, workflow, profile, reports |
| 4 | P3-06-PROJECT-MEMORY.md | 260K | 3,861 | project-memory docs 00–18 (engineering decisions) |
| 5 | P4-CONFIG.md | 276K | 4,972 | middleware, package.json, tsconfig, env examples, drizzle.config, full drizzle schema (12 files) |
| 6 | P5-BONUS.md | 3.1M | 56,379 | governance, workflow design, deployment, CI/CD, full test suite + QA evidence, coverage, Section F inventory + targeted extraction, credential remediation note |

**Total content extracted: ~87,166 lines across 6 bundles.**

> ⚠️ **P5-BONUS.md is 3.1 MB / 56k lines** — it may exceed a single chat-upload limit. If Copilot rejects it, it can be split (E-sections vs F-sections) on request.

---

## P5-BONUS.md — section index (since it's the largest bundle)

| Section | Coverage |
|---|---|
| A | Governance & foundation docs (freeze record, stewardship closure, known gaps, open points, design standard, email platform, leave redesign) |
| B | Workflow design docs (admin UI, API, data model, engine design, templates) |
| C | Deployment & infra (Azure, AWS, vercel.json, docker-compose, next.config.mjs) |
| D | CI/CD pipelines (ci.yml, soak-test.yml) |
| E-QA | QA evidence reports (test results md/json, signoff, final-status, issue-register, mod-audit) |
| E-04…E-08 | Critical unit/integration tests by domain (effective-dating, core HR, workflow, leave, security/auth) — 121 unique files, deduped |
| E-09 | All 34 E2E test files (5 credential JSONs redacted) |
| E-10 | Coverage report (Stmts 59.12% · Branches 69.87% · Funcs 61.14% · Lines 59.12%; 1MB raw blob noted, not inlined) |
| F (inventory) | 223 governance-term files cataloged: 61 already-in-bundle, 162 not-yet-extracted |
| F-DOCS/MOD/APP/INFRA | Targeted extraction of 46 governance-critical files (compliance, audit, notification, insurance, timesheets modules; security audit report; license audit; HR audit log; .gitignore; audit/document API routes) |
| Remediation note | 6 redacted credential files documented + git-tracking status + remediation steps |

---

## Per-item status (P1–P4)

| # | File ID | Requested Path | Status | Lines | Notes |
|---|---------|----------------|--------|-------|-------|
| 1 | P1-01 | `docs/qa-qc/revalidation-2026-06-12.md` | FOUND | 27 |  |
| 2 | P1-02 | `docs/qa-qc/00-MASTER-QA-QC-REPORT.md` | FOUND | 213 |  |
| 3 | P1-03 | `docs/effective-dating/ (4 files)` | FOUND | 292 | 00-IMPL, 01-ED-CLOSURE-VERIF, RUNBOOK, ed-2d-3 retro-split |
| 4 | P1-04 | `docs/project-memory/2026-06-04/19-EFFECTIVE-DATING-AUDIT.md` | FOUND | 163 |  |
| 5 | P1-05 | `docs/project-memory/2026-06-04/20-ORACLE-FUSION-DATETRACK-REFERENCE.md` | FOUND | 142 |  |
| 6 | P1-06 | `lib/effective-date.ts` | FOUND | 148 |  |
| 7 | P1-07 | `lib/as-of-query.ts` | FOUND | 302 |  |
| 8 | P1-08 | `CLAUDE.md` | FOUND | 197 |  |
| 9 | P1-09 | `CHANGELOG.md` | FOUND | 73 |  |
| 10 | P2-01 | `docs/architecture/ (5 files)` | FOUND | 1361 | incl wip-current-state-findings.json |
| 11 | P2-02 | `docs/environment/ (3 files)` | FOUND | 248 | governance + 2 migration ledgers |
| 12 | P2-03 | `docs/migration-factory/ (12 files)` | FOUND | 1651 |  |
| 13 | P2-04 | `drizzle/migrations/0062_email_platform.sql` | FOUND | 192 | in drizzle/, not supabase/ |
| 14 | P2-05 | `drizzle/migrations/0063_effective_dating_integrity.sql` | FOUND | 362 |  |
| 15 | P2-06 | `drizzle/migrations/0064_worker_assignment_active_timeline.sql` | FOUND | 30 |  |
| 16 | P2-07 | `app/api/cron/future-dated-activation/route.ts` | FOUND | 68 |  |
| 17 | P2-08 | `app/api/cron/email-dispatch/route.ts` | FOUND | 40 |  |
| 18 | P2-09 | `docs/AVANIIS-HR-REQUIREMENTS-AND-DESIGN-SPECIFICATION.md` | FOUND | 294 |  |
| 19 | P3-01 | `modules/workers/` | SUBSTITUTED | 10761 | → modules/core-hr (workers domain) |
| 20 | P3-02 | `modules/workflows/` | SUBSTITUTED | 2828 | → modules/workflow (singular) |
| 21 | P3-03 | `modules/employees/` | SUBSTITUTED | 983 | → core-hr + modules/profile (ESS) |
| 22 | P3-04 | `modules/organization/` | SUBSTITUTED | (see core-hr) | → covered by modules/core-hr |
| 23 | P3-05 | `modules/reports/` | FOUND | 1015 | exact match (3 files) |
| 24 | P3-06 | `docs/project-memory/2026-06-04/ (00-18)` | FOUND | 3861 | 19/20 in P1; bundle incl headers |
| 25 | P4-01 | `db schema (main)` | SUBSTITUTED | 4296 | → drizzle/schema/*.ts (12 files); no db/schema.ts |
| 26 | P4-02 | `middleware.ts` | FOUND | 178 |  |
| 27 | P4-03 | `supabase/config.toml` | NOT FOUND | - | No Supabase — Drizzle/Neon stack |
| 28 | P4-04 | `package.json` | FOUND | 91 |  |
| 29 | P4-05 | `tsconfig.json` | FOUND | 23 |  |
| 30 | P4-06 | `.env.example + .env.local.example` | FOUND | 247 | placeholders only; no real secrets |
| 31 | P4-07 | `drizzle.config.ts` | FOUND | 15 |  |
