import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Workflow Intelligence Platform — Phase A (Read Model) regression — WIPA-001…012
 *
 * Phase A is migrations-only (additive). These guard the migration contracts so
 * later phases can rely on the read model + audit immutability, and so the
 * "additive / backward-compatible" invariants are not silently regressed.
 */
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
// Executable SQL only — drops `-- comment` lines so assertions don't match
// rollback notes / explanatory comments.
const sqlOnly = (p: string) =>
  read(p).split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

const M0055 = 'drizzle/migrations/0055_wip_step_instance_columns.sql'
const M0056 = 'drizzle/migrations/0056_wip_notification_queue_meta.sql'
const M0057 = 'drizzle/migrations/0057_wip_audit_immutability.sql'
const M0060 = 'drizzle/migrations/0060_wip_intelligence_view.sql'

describe('Phase A migration files exist (WIPA-001…004)', () => {
  it('WIPA-001: 0055 step-instance columns', () => expect(existsSync(join(ROOT, M0055))).toBe(true))
  it('WIPA-002: 0056 notification meta_json', () => expect(existsSync(join(ROOT, M0056))).toBe(true))
  it('WIPA-003: 0057 audit immutability', () => expect(existsSync(join(ROOT, M0057))).toBe(true))
  it('WIPA-004: 0060 intelligence view', () => expect(existsSync(join(ROOT, M0060))).toBe(true))
})

describe('Additive & backward-compatible invariants (WIPA-005…008)', () => {
  it('WIPA-005: 0055 uses ADD COLUMN IF NOT EXISTS, no DROP/ALTER-of-existing', () => {
    const s = read(M0055)
    expect(s).toContain('ADD COLUMN IF NOT EXISTS step_name_at_decision')
    expect(s).toContain('ADD COLUMN IF NOT EXISTS aria_recommendation_code')
    expect(s).toContain('ADD COLUMN IF NOT EXISTS sla_hours')
    expect(s).toContain('ADD COLUMN IF NOT EXISTS delegation_depth')
    expect(sqlOnly(M0055)).not.toMatch(/DROP COLUMN/)  // no DROP in executable SQL
  })
  it('WIPA-006: 0056 adds meta_json additively', () => {
    expect(read(M0056)).toContain('ADD COLUMN IF NOT EXISTS meta_json jsonb')
  })
  it('WIPA-007: every Phase A migration documents a rollback', () => {
    for (const f of [M0055, M0056, M0057, M0060]) expect(read(f).toLowerCase()).toContain('rollback')
  })
  it('WIPA-008: view is CREATE OR REPLACE (re-runnable), view-only (no table writes)', () => {
    expect(read(M0060)).toContain('CREATE OR REPLACE VIEW workflow_intelligence_view')
    expect(sqlOnly(M0060)).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/)
  })
})

describe('Audit immutability + single breach definition (WIPA-009…012)', () => {
  it('WIPA-009: trigger blocks UPDATE and DELETE on workflow_audit_log', () => {
    const s = read(M0057)
    expect(s).toContain('BEFORE UPDATE OR DELETE ON workflow_audit_log')
    expect(s).toContain('RAISE EXCEPTION')
  })
  it('WIPA-010: trigger drop is idempotent (DROP TRIGGER IF EXISTS before CREATE)', () => {
    expect(read(M0057)).toContain('DROP TRIGGER IF EXISTS trg_workflow_audit_log_immutable')
  })
  it('WIPA-011: SLA breach defined once in the view with the canonical predicate', () => {
    const s = read(M0060)
    expect(s).toContain("status NOT IN ('APPROVED','REJECTED','CANCELLED','RECALLED')")
    expect(s).toContain('now() > i.sla_deadline')
  })
  it('WIPA-012: view SQL does NOT depend on Phase D table workflow_recommendations', () => {
    expect(sqlOnly(M0060)).not.toContain('workflow_recommendations')
  })
})
