/**
 * Migration governance classifier — BLK-014 remediation.
 *
 * PURE & SAFE: no DB, no network, no side effects. Replaces the naive
 * "migration not in production ledger = blocker" rule with evidence-aware
 * classifications that account for BLK-013 (no separate production database is
 * currently provisioned).
 *
 * Source of truth for the per-migration evidence is
 * docs/production-readiness/migration-0063-0067-governance.md; the structured
 * facts below mirror that record so the report script and the regression test
 * share one definition.
 */

import { getEnvironmentGovernanceMode } from './environment-guardrails'

type EnvMap = Partial<Record<string, string | undefined>>

export type MigrationClass =
  | 'RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING'
  | 'HUMAN_GATED_BY_BLK_013'
  | 'INVESTIGATION_REQUIRED'
  | 'STILL_REQUIRED_PENDING'
  | 'CLOSED_WITH_EVIDENCE'
  | 'VALID_PRODUCTION_BLOCKER'

export type LedgerStatus = 'verified' | 'applied' | 'pending' | 'superseded' | 'absent'
export type MigrationScope = 'core-hr' | 'payroll'

export interface MigrationFact {
  num: number
  file: string
  scope: MigrationScope
  /** Status in the DEV/UAT ledger (migration-ledger.test.md). */
  devUat: LedgerStatus
  /** Status in the production ledger (migration-ledger.production.md). */
  prod: LedgerStatus
  /** Whether the migration file is present on the Core HR main branch. */
  presentInMain: boolean
  /** Non-empty when there is documented evidence of the migration's disposition. */
  evidence: string
  purpose: string
}

export interface GovernanceContext {
  /** True only when a separate production DB exists (ENV_GOVERNANCE_MODE=uat-prod). */
  productionDbProvisioned: boolean
}

/** Whether a separate production database is provisioned (false under BLK-013). */
export function isProductionDbProvisioned(env: EnvMap = process.env): boolean {
  return getEnvironmentGovernanceMode(env) === 'uat-prod'
}

/**
 * Classify a single migration using evidence + the BLK-013 production-DB context.
 * Never silently passes an unexplained migration — it returns INVESTIGATION_REQUIRED.
 */
export function classifyMigration(m: MigrationFact, ctx: GovernanceContext): MigrationClass {
  // Payroll-scoped migration deferred WITH the payroll workstream (lives on the
  // archive branch, not Core HR main) and documented → closed for Core HR scope.
  if (m.scope === 'payroll' && !m.presentInMain && m.evidence.trim() !== '') {
    return 'CLOSED_WITH_EVIDENCE'
  }

  // Unexplained + no DEV/UAT effect + not in repo → must investigate, keep open.
  if (m.evidence.trim() === '' && m.devUat === 'absent' && !m.presentInMain) {
    return 'INVESTIGATION_REQUIRED'
  }

  // Effect verified/applied in DEV/UAT.
  if (m.devUat === 'verified' || m.devUat === 'applied') {
    if (ctx.productionDbProvisioned) {
      // A real production DB exists → if not applied/equivalent there, it IS a prod blocker.
      return (m.prod === 'verified' || m.prod === 'applied')
        ? 'CLOSED_WITH_EVIDENCE'
        : 'VALID_PRODUCTION_BLOCKER'
    }
    // No production DB (BLK-013): not independently actionable; gated, not a standalone blocker.
    return 'RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING'
  }

  // Genuinely required but not yet applied in DEV/UAT (present in repo, pending/absent).
  if (m.devUat === 'pending' || (m.presentInMain && m.devUat === 'absent')) {
    return 'STILL_REQUIRED_PENDING'
  }

  // Anything else lacks a clear evidence path → investigate rather than pass.
  return 'INVESTIGATION_REQUIRED'
}

export type Blk014Disposition = 'CLOSED' | 'PARTIALLY_CLOSED_HUMAN_GATED' | 'OPEN'

/**
 * Overall BLK-014 disposition from the set of per-migration classes.
 * - OPEN if anything needs investigation or is a valid (prod-DB-present) blocker.
 * - CLOSED only if every migration is CLOSED_WITH_EVIDENCE.
 * - PARTIALLY_CLOSED_HUMAN_GATED otherwise (prod-provisioning-gated and/or a
 *   narrowed STILL_REQUIRED_PENDING item such as 0067 remain).
 */
export function disposeBlk014(classes: MigrationClass[]): Blk014Disposition {
  if (classes.includes('INVESTIGATION_REQUIRED') || classes.includes('VALID_PRODUCTION_BLOCKER')) {
    return 'OPEN'
  }
  if (classes.length > 0 && classes.every(c => c === 'CLOSED_WITH_EVIDENCE')) {
    return 'CLOSED'
  }
  return 'PARTIALLY_CLOSED_HUMAN_GATED'
}

/**
 * Canonical BLK-014 migration facts (0063–0067), evidence-backed at review of
 * Core HR main bbc25d52. Mirrors docs/production-readiness/migration-0063-0067-governance.md.
 */
export const BLK014_MIGRATION_FACTS: MigrationFact[] = [
  {
    num: 63,
    file: 'drizzle/migrations/0063_effective_dating_integrity.sql',
    scope: 'core-hr',
    devUat: 'verified',
    prod: 'pending',
    presentInMain: true,
    purpose: 'Effective-dating integrity constraints (Core HR effective dating).',
    evidence: 'migration-ledger.test.md row 0063 = verified DEV/UAT; production ledger = pending (Future isolated Production Environment only).',
  },
  {
    num: 64,
    file: 'drizzle/migrations/0064_worker_assignment_active_timeline.sql',
    scope: 'core-hr',
    devUat: 'verified',
    prod: 'pending',
    presentInMain: true,
    purpose: 'Worker-assignment active-timeline constraint (Phase 2D-3 prerequisite).',
    evidence: 'migration-ledger.test.md row 0064 = verified DEV/UAT; production ledger = pending (Future isolated Production Environment only).',
  },
  {
    num: 65,
    file: 'drizzle/migrations/0065_identity_uniqueness.sql',
    scope: 'core-hr',
    devUat: 'verified',
    prod: 'pending',
    presentInMain: true,
    purpose: 'Identity uniqueness (Emirates ID / passport) — Foundation Stewardship P1-H4.',
    evidence: 'migration-ledger.test.md row 0065 = verified DEV/UAT (71 hashes backfilled, 3 unique indexes live); stale pre-activation row marked superseded; production ledger = pending.',
  },
  {
    num: 66,
    file: 'drizzle/migrations/0066_payroll_gross_drafts.sql',
    scope: 'payroll',
    devUat: 'verified',
    prod: 'pending',
    presentInMain: false,
    purpose: 'Payroll Phase 2B gross-draft staging table (payroll_gross_drafts).',
    evidence: 'PAYROLL-scoped. Created in commit 911ce5b8; lives on archive/hardening-corehr-score-90-plus-pre-pr5 (verified DEV/UAT 2026-06-14 per that branch ledger); intentionally NOT merged to Core HR main (payroll deferred). Not deleted, not missing. Out of Core HR scope; tracked under the deferred-payroll workstream.',
  },
  {
    num: 67,
    file: 'drizzle/migrations/0067_workflow_audit_immutability.sql',
    scope: 'core-hr',
    // Reconciled 2026-06-17: effect is PRESENT in DEV/UAT (Neon). Ledger was stale `pending`.
    devUat: 'verified',
    prod: 'pending',
    presentInMain: true,
    purpose: 'DB-level append-only trigger on workflow_audit_log (Core HR hardening B3).',
    evidence: 'EFFECT PRESENT in DEV/UAT (Neon) — confirmed 2026-06-17 via read-only catalog probe: trigger trg_workflow_audit_log_immutable + function workflow_audit_log_immutable() exist; pg_get_triggerdef = BEFORE DELETE OR UPDATE ON public.workflow_audit_log. Ledger reconciled from stale `pending` → `verified` (no migration applied; read-only verification only). Idempotent; no dependency on 0063–0066. Future isolated Production apply remains pending (BLK-013).',
  },
]
