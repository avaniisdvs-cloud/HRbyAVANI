# Migration 0063–0067 Governance Record (BLK-014 disposition)

> Canonical, evidence-backed status for migrations 0063–0067. Replaces the vague
> "0063–0067 not applied to production" finding (BLK-014) with precise statuses.
> Programmatic classifier: `lib/migration-governance.ts`
> Report command: `pnpm migration:governance`

## Review metadata
| Field | Value |
|---|---|
| Review date | 2026-06-16 |
| Commit SHA reviewed | `bbc25d52` (Core HR `main`) |
| Environment reviewed | DEV/UAT (single Neon DB served by the current Vercel deployment) |
| Production DB status | **Not provisioned** — `ENV_GOVERNANCE_MODE=single-dev-uat`; no separate isolated production database exists (**BLK-013**) |
| Forensic basis | git history, archive branch, ledgers (`migration-ledger.test.md` / `migration-ledger.production.md`), migration file headers |

## BLK-014 forensic summary
BLK-014 was a generic blocker ("migrations 0063–0067 not applied to production").
Forensic review found this conflates four distinct situations:
- **0063–0065** are **verified in DEV/UAT** and only "pending" in production because **no production DB exists yet (BLK-013)** — they are not independently actionable.
- **0066** is a **payroll** migration deferred with the payroll workstream (on the archive branch), not a missing/unexplained Core HR migration.
- **0067** — **UPDATE 2026-06-17:** read-only Neon probe shows its effect is **already present in DEV/UAT** (trigger + function live). The ledger was stale (`pending`); reconciled to **verified (effect present)**. No active DEV/UAT migration blocker remains; production apply is gated by BLK-013.

## Status table
| # | File / location | Purpose | DEV/UAT status | Production ledger | Final classification | Evidence | Required action |
|---|---|---|---|---|---|---|---|
| 0063 | `drizzle/migrations/0063_effective_dating_integrity.sql` | Effective-dating integrity constraints | **verified** | pending (future prod only) | **RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING** (HUMAN-GATED_BY_BLK-013) | Ledger 0063 verified DEV/UAT; prod row "Future isolated Production Environment only" | Part of production provisioning runbook; apply only after BLK-013 prod DB exists + DBA/CAB window |
| 0064 | `drizzle/migrations/0064_worker_assignment_active_timeline.sql` | Worker-assignment active-timeline constraint | **verified** | pending (future prod only) | **RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING** (HUMAN-GATED_BY_BLK-013) | Ledger 0064 verified DEV/UAT (Phase 2D-3 evidence) | As 0063 |
| 0065 | `drizzle/migrations/0065_identity_uniqueness.sql` | Identity uniqueness (EID/passport) | **verified** | pending (future prod only) | **RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING** (HUMAN-GATED_BY_BLK-013) | Ledger 0065 verified DEV/UAT (71 hashes backfilled, 3 unique indexes); stale planning row marked superseded | As 0063, incl. prechecks/backfill against the prod DB |
| 0066 | `drizzle/migrations/0066_payroll_gross_drafts.sql` (archive branch) | Payroll Phase 2B gross-draft staging table | verified (per archive ledger 2026-06-14) | pending | **CLOSED_WITH_EVIDENCE** — deferred PAYROLL scope, out of Core HR | Created commit `911ce5b8`; present on `archive/hardening-corehr-score-90-plus-pre-pr5`; **intentionally not merged to main** (payroll deferred). Not deleted, not missing. | None for Core HR. Re-enters scope only when the payroll workstream resumes |
| 0067 | `drizzle/migrations/0067_workflow_audit_immutability.sql` | DB-level append-only trigger on `workflow_audit_log` (Core HR hardening B3) | **verified — effect present** (reconciled 2026-06-17 from stale `pending`) | pending (future prod only) | **RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING** (was EFFECT_PRESENT_LEDGER_MISSING; HUMAN-GATED_BY_BLK-013) | Read-only Neon probe 2026-06-17: `trg_workflow_audit_log_immutable` + `workflow_audit_log_immutable()` live; `pg_get_triggerdef` = BEFORE DELETE OR UPDATE on workflow_audit_log. No apply performed. | None in DEV/UAT (effect present). Production apply gated by BLK-013; confirm provenance with DBA |

## Why 0063–0065 are gated by BLK-013 (not standalone blockers)
These migrations are **not independently actionable until BLK-013 is resolved and a
production database exists**. Their effects are already verified in DEV/UAT. They
remain part of the **production provisioning runbook**
(`docs/environment/go-live/NEON-TO-AZURE-MIGRATION-RUNBOOK.md`), **not standalone
active blockers**. Co-Pilot / reviewers must not flag them as "hanging isolated
migrations."

## 0066 — explicit status
**Evidence found — not missing.** `0066_payroll_gross_drafts.sql` is a payroll
migration created in commit `911ce5b8` and retained on the archive branch
`archive/hardening-corehr-score-90-plus-pre-pr5`. It was deliberately excluded from
Core HR `main` because payroll is deferred (hence the 0065→0067 numbering gap on
main). It is **out of Core HR scope** and tracked under the deferred-payroll
workstream. Do not treat the main-branch numbering gap as a missing migration.

## 0067 — explicit status (reconciled 2026-06-17)
**EFFECT PRESENT IN DEV/UAT — ledger reconciled.** A read-only Neon catalog probe on
2026-06-17 confirmed 0067's effect is **already live in DEV/UAT**:
- `to_regclass('public.workflow_audit_log')` → not null
- `pg_proc` has `workflow_audit_log_immutable()` (1)
- `pg_trigger` has `trg_workflow_audit_log_immutable` (1, non-internal)
- `pg_get_triggerdef` → `CREATE TRIGGER trg_workflow_audit_log_immutable BEFORE DELETE OR UPDATE ON public.workflow_audit_log FOR EACH ROW EXECUTE FUNCTION workflow_audit_log_immutable()`

The DEV/UAT ledger was stale (`pending`) and has been reconciled to **`verified` (effect present)**.
**No migration was applied during this reconciliation — read-only verification only; no DB write, no Neon mutation.**
- DEV/UAT classification: **RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING** (no longer STILL_REQUIRED_PENDING).
- ⚠ **Provenance caveat:** apply timing/author was not recorded; DBA/Activation Board should confirm when/how it was applied so the ledger reflects truth, not just current state.
- **Future isolated Production apply remains pending — gated by BLK-013** (no separate production DB). Apply there via the approved SQL process after BLK-013. Idempotent (`CREATE OR REPLACE` / `DROP IF EXISTS`); rollback = `DROP TRIGGER ...; DROP FUNCTION workflow_audit_log_immutable();`.

## Final BLK-014 disposition (updated 2026-06-17)
**PARTIALLY CLOSED / HUMAN-GATED — no active DEV/UAT migration blocker remains.**
- 0063–0065: **closed in DEV/UAT** (verified); production apply gated by BLK-013.
- 0066: **closed with evidence** (deferred payroll, out of Core HR scope).
- 0067: **DEV/UAT active blocker CLOSED** — effect present in DEV/UAT (reconciled 2026-06-17 from stale `pending`); production apply gated by BLK-013.

> **The old BLK-014-R active DEV/UAT migration blocker is CLOSED.** All of 0063–0067
> are either effect-present in DEV/UAT or out-of-scope (0066). BLK-014 is **not fully
> CLOSED** only because production apply of 0063–0065 and 0067 cannot occur until a
> production database exists (**BLK-013**). It is therefore **PARTIALLY CLOSED /
> HUMAN-GATED**, with **no standalone active blocker** — purely production-provisioning-gated.
>
> Remaining wording (production-provisioning only):
> *"0063–0065 and 0067 are present/verified in DEV/UAT; their production apply is
> gated by BLK-013 (no production DB yet) and is part of the production-provisioning
> runbook. No standalone active migration blocker remains. 0066 is payroll-deferred,
> out of Core HR scope."*
