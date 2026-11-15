/**
 * BLK-014 migration governance — regression protection.
 * Ensures BLK-014 cannot reappear as a vague false positive and that 0066/0067
 * are never silently closed without evidence.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  BLK014_MIGRATION_FACTS,
  classifyMigration,
  disposeBlk014,
  type MigrationFact,
  type MigrationClass,
} from '@/lib/migration-governance'

const ROOT = process.cwd()
const GOV = 'docs/production-readiness/migration-0063-0067-governance.md'
const REPORT = 'docs/environment/PRODUCTION-GO-LIVE-READINESS.md'

const fact = (n: number): MigrationFact => BLK014_MIGRATION_FACTS.find(m => m.num === n)!
const NO_PROD = { productionDbProvisioned: false } // BLK-013 reality
const WITH_PROD = { productionDbProvisioned: true }
const classOf = (n: number, ctx = NO_PROD): MigrationClass => classifyMigration(fact(n), ctx)

describe('BLK-014 — 0063–0065 are NOT active blockers when prod DB absent + DEV/UAT verified', () => {
  for (const n of [63, 64, 65]) {
    it(`00${n} → RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING (not a standalone blocker)`, () => {
      const c = classOf(n)
      expect(c).toBe('RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING')
      expect(c).not.toBe('VALID_PRODUCTION_BLOCKER')
      expect(c).not.toBe('INVESTIGATION_REQUIRED')
    })
  }
  it('but they ARE valid prod blockers once a production DB exists and prod is not applied', () => {
    expect(classOf(63, WITH_PROD)).toBe('VALID_PRODUCTION_BLOCKER')
  })
})

describe('BLK-014 — 0066 is evidence-closed (payroll-deferred), not missing', () => {
  it('00066 → CLOSED_WITH_EVIDENCE with payroll scope + evidence', () => {
    expect(fact(66).scope).toBe('payroll')
    expect(fact(66).presentInMain).toBe(false)
    expect(fact(66).evidence.trim().length).toBeGreaterThan(0)
    expect(classOf(66)).toBe('CLOSED_WITH_EVIDENCE')
  })
  it('00066 would be INVESTIGATION_REQUIRED if evidence were missing (no silent closure)', () => {
    const noEvidence: MigrationFact = { ...fact(66), evidence: '', devUat: 'absent' }
    expect(classifyMigration(noEvidence, NO_PROD)).toBe('INVESTIGATION_REQUIRED')
  })
})

describe('BLK-014 — 0067 effect present in DEV/UAT (reconciled 2026-06-17)', () => {
  it('00067 DEV/UAT ledger reconciled to verified (no longer pending)', () => {
    expect(fact(67).devUat).toBe('verified')
  })
  it('00067 → RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING when no prod DB (not a DEV/UAT pending blocker)', () => {
    expect(classOf(67)).toBe('RESOLVED_IN_DEV_UAT_PENDING_PROD_PROVISIONING')
    expect(classOf(67)).not.toBe('STILL_REQUIRED_PENDING')
  })
  it('00067 STILL reports production gating when a production DB exists (VALID_PRODUCTION_BLOCKER)', () => {
    expect(classOf(67, WITH_PROD)).toBe('VALID_PRODUCTION_BLOCKER')
  })
})

describe('BLK-014 — overall disposition', () => {
  it('is PARTIALLY_CLOSED_HUMAN_GATED for the real fact set (prod-provisioning-gated only)', () => {
    const classes = BLK014_MIGRATION_FACTS.map(m => classifyMigration(m, NO_PROD))
    expect(disposeBlk014(classes)).toBe('PARTIALLY_CLOSED_HUMAN_GATED')
  })
  it('no migration is STILL_REQUIRED_PENDING in DEV/UAT (no active blocker remains)', () => {
    const classes = BLK014_MIGRATION_FACTS.map(m => classifyMigration(m, NO_PROD))
    expect(classes).not.toContain('STILL_REQUIRED_PENDING')
  })
  it('is OPEN if any migration needs investigation', () => {
    expect(disposeBlk014(['CLOSED_WITH_EVIDENCE', 'INVESTIGATION_REQUIRED'])).toBe('OPEN')
  })
  it('is CLOSED only when every migration is evidence-closed', () => {
    expect(disposeBlk014(['CLOSED_WITH_EVIDENCE', 'CLOSED_WITH_EVIDENCE'])).toBe('CLOSED')
  })
})

describe('BLK-014 — governance record + report wiring', () => {
  it('governance file exists', () => {
    expect(existsSync(join(ROOT, GOV))).toBe(true)
  })
  it('every BLK-014 fact has non-empty evidence', () => {
    for (const m of BLK014_MIGRATION_FACTS) expect(m.evidence.trim().length).toBeGreaterThan(0)
  })
  it('governance file documents 0063–0067 and the disposition', () => {
    const t = readFileSync(join(ROOT, GOV), 'utf8')
    for (const n of [63, 64, 65, 66, 67]) expect(t).toContain(`00${n}`)
    expect(t).toMatch(/PARTIALLY CLOSED \/ HUMAN-GATED/i)
    expect(t).toContain('BLK-013')
  })
  it('the go-live blocker report references the governance record', () => {
    const t = readFileSync(join(ROOT, REPORT), 'utf8')
    expect(t).toContain('migration-0063-0067-governance.md')
  })
})
