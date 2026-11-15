# Migration Factory — Production Cutover & Rollback Strategy

> **Status:** Documentation only. Implementation remains 🔴 **NO-GO**.
> **Date:** 2026-06-01
> **Scope:** Defines how a migration cutover is protected and how to recover the application **and** the database independently if anything goes wrong.
> **Companion docs:** `04-baseline-certification.md` (baseline), `08-migration-readiness-checklist.md` (gate), `09-rollback-runbook.md` (step-by-step recovery).

---

## 0. The two things being protected (keep them separate)

A migration can damage two **independent** assets. They have **different** backups and **different** restores. Do not conflate them.

| Asset | What it is | Backup mechanism | Restore mechanism |
|---|---|---|---|
| **Application code** | UI, business logic, APIs, routes, schema *definitions*, DB↔frontend connection code | Git (GitHub) + git tag + offline ZIP | `git checkout <tag>` / redeploy / unzip |
| **Database data** | Live rows in Neon (`persons`, `legal_entities`, workflows, etc.) | **Neon branch / snapshot** (point-in-time) | Restore/promote the Neon branch |

> 🔴 **Critical:** Restoring the application code does **NOT** restore the database, and vice-versa. A migration accident is almost always a **data** problem — so the **Neon branch (database) backup is the one that actually protects employee data.**

---

## 1. Cutover principle (Phase 1)

Per locked decision **D2**, the Migration Factory Phase 1 writes **only** to isolated `migration_*` staging tables and performs **no production writes**. Therefore:

- Phase 1 ("upload → validate → preview") is **low-risk by construction** — production data is not mutated.
- The **real** cutover risk lives in the **future promotion phase (D5)**, which is separately gated. This strategy must be fully proven *before* D5 is ever approved.

This document therefore covers both: the (low-risk) staging activity now, and the (high-risk) promotion later.

---

## 2. Pre-cutover protection (must exist before ANY migration activity)

| # | Control | Owner | Verifies |
|---|---|---|---|
| P1 | **Git recovery tag** at the pre-migration SHA, pushed to origin | This workstream | Application-code restore point |
| P2 | **Offline full ZIP backup** (incl. `node_modules`, excl. `.next`/secrets) at a known absolute path | This workstream | Self-contained offline code restore |
| P3 | **Neon branch/snapshot** of the production database | **USER (manual — Neon Console)** | Database restore point |
| P4 | **Tested rollback** — prove restore works on the Neon *branch* (never on prod) | USER + this workstream | Recovery is real, not theoretical |
| P5 | **Clean/known working tree** — uncommitted work identified & preserved | This workstream | No silent loss of in-progress work |

> Migration may not begin until **all five** are satisfied. P3 and P4 require Neon Console access and are **manual user actions** (see §5 of the readiness report and `09-rollback-runbook.md`).

---

## 3. Cutover sequence (when build + source are eventually ready)

1. Freeze further app changes; confirm clean working tree.
2. Confirm gates A–G all green (see `08-migration-readiness-checklist.md`).
3. Take a **fresh** Neon branch immediately before activity (point-in-time = T0).
4. **Apply schema migrations** to the target database.
5. **Seed platform configuration (MANDATORY):** (a) run `npx tsx drizzle/seed-workflow-v2.ts`; (b) insert the **workflow system-actor person row** `22222222-2222-2222-2222-222222222222` (Neon SQL Editor — see gate **G** for the exact `INSERT`). Then verify per gate **G** in `08-migration-readiness-checklist.md` (workflow_definitions_v2 active, `WF_ANNUAL_LEAVE` active with steps, **system-actor person exists**, **multi-step advance works**). This is platform setup, **separate from employee data**, and must run **before** employee migration / leave testing — see incident `11-incident-workflow-v2-seed-skipped.md`.
6. Run staging ingestion (Phase 1) — staging tables only.
7. Validate via the Source Readiness + staging validation.
8. Run **employee data migration** (persons, assignments, balances).
9. **Leave-testing smoke check:** confirm a test employee can submit Annual Leave end-to-end and it routes to the expected approver (gate G checks 4–5).
10. **STOP.** Promotion to production (D5) is a separate gate — do not proceed without it.

> **Canonical order:** schema migrations → **workflow v2 seed + system-actor person row (step 5)** → reference/config seeds → employee data migration → leave-testing smoke check (incl. a **multi-step** approval advance).

## 4. Rollback triggers

- Any existing-route 4xx/5xx regression, permission failure, or data mismatch.
- Migration corruption / unexpected production-row change.
- Page p95 degradation beyond NFR-01 during activity.
- Orphaned/stuck staging batch.
- Any doubt about data integrity.

## 5. Rollback decision tree

| Symptom | Restore |
|---|---|
| App broken, data intact | **Code rollback** — `git checkout <tag>` / redeploy (`09` §A) |
| Data wrong/corrupted | **Database rollback** — restore Neon branch (`09` §B) — *manual, Neon Console* |
| Both | Restore Neon branch **first**, then code |
| Staging only polluted (no prod writes) | `DROP`/`DELETE` `migration_*` — no prod impact (`09` §C) |

## 6. Roles & responsibilities

| Action | Who |
|---|---|
| Git tag + ZIP backup | Claude Code (this workstream) — automatable, safe |
| Neon branch creation + restore | **User** (Neon Console / authenticated tooling) — credentials required |
| Rollback test sign-off | User + reviewer |
| Go/No-Go call | Project owner |

## 7. What this strategy explicitly does NOT do

- ❌ Does not create or run any migration.
- ❌ Does not access Neon Console or create the database branch (manual user step).
- ❌ Does not modify application code, schema, routes, APIs, nav, or permissions.
