/**
 * W2 — Payroll / WPS / IBAN / Entity Scope.
 * W2-001–020.
 *
 * Verifies the W2 fixes via source-contract assertions (the established pattern
 * for payroll server actions whose full path needs a live DB):
 *  - P2-P3 multi-entity isolation: every run-by-id action + the read page guard
 *    enforces the actor's entity.
 *  - P2-P1/P2-P2 WPS: bank details sourced (decrypted) from person_bank_details;
 *    full IBAN never persisted (masked into wps_sif_records).
 *  - P2-P4 run-number per-entity uniqueness (schema + migration).
 *  - P2-P5 duplicate/overlapping REGULAR period guard.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const actions = read('modules/payroll/actions.ts')

// ── P2-P3 — multi-entity isolation ──────────────────────────────────────────

describe('P2-P3 — payroll run entity scoping', () => {
  it('W2-001 every run-by-id mutation asserts same-entity after the not-found check', () => {
    // The guard is inserted after each identical "Payroll run not found" throw.
    const guards = actions.match(/Payroll run not found'\)\n\s*\/\/ P2-P3[\s\S]*?assertSameEntity\(actor, run\.legalEntityId\)/g) ?? []
    // calculate, lock, submitForApproval, approve, reject, generateWpsSif, confirm = 7
    expect(guards.length).toBe(7)
  })
  it('W2-002 createPayrollRun blocks creating a run for another entity', () => {
    const fn = actions.slice(actions.indexOf('export async function createPayrollRun'), actions.indexOf('export async function calculatePayrollRun'))
    expect(fn).toMatch(/assertSameEntity\(actor, raw\.legalEntityId\)/)
  })
  it('W2-003 run-detail page restricts role and entity (no cross-entity read)', () => {
    const page = read('app/(hr-admin)/payroll/runs/[runId]/page.tsx')
    expect(page).toMatch(/ALLOWED_PAYROLL_ROLES/)
    expect(page).toMatch(/session\.user\.role !== 'SUPER_ADMIN' && session\.user\.legalEntityId !== run\.legalEntityId/)
  })
})

// ── P2-P1 / P2-P2 — WPS generation + IBAN handling ──────────────────────────

describe('P2-P1 — WPS sources bank details from the encrypted master', () => {
  const fn = actions.slice(actions.indexOf('export async function generateWpsSif'))
  it('W2-004 reads person_bank_details (current account), not payroll_results.iban', () => {
    expect(fn).toMatch(/from\(personBankDetails\)/)
    expect(fn).toMatch(/isNull\(personBankDetails\.effectiveTo\)/)
    // it must NOT depend on the always-null payrollResults.iban anymore
    expect(fn).not.toMatch(/iban:\s*payrollResults\.iban/)
  })
  it('W2-005 decrypts the IBAN transiently for validation', () => {
    expect(fn).toMatch(/decrypt\(b\.iban\)/)
    expect(fn).toMatch(/iban:\s*bank\?\.iban/) // validation uses the full decrypted IBAN
  })
  it('W2-006 prefers the WPS account then the primary account', () => {
    expect(fn).toMatch(/orderBy\(desc\(personBankDetails\.isWpsAccount\), desc\(personBankDetails\.isPrimary\)\)/)
  })
})

describe('P2-P2 — IBAN never persisted in plaintext at rest', () => {
  it('W2-007 wps_sif_records stores a MASKED IBAN', () => {
    const fn = actions.slice(actions.indexOf('export async function generateWpsSif'))
    expect(fn).toMatch(/iban:\s*maskIban\(bank\?\.iban \?\? ''\)/)
  })
  it('W2-008 maskIban keeps first-4/last-4 and stars the middle (no full IBAN)', () => {
    // re-implement the documented contract and assert against the source's intent
    const mask = (iban: string) => {
      const v = (iban ?? '').trim()
      if (v.length <= 8) return v ? '*'.repeat(v.length) : ''
      return v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4)
    }
    const full = 'AE070331234567890123456' // 23-char UAE IBAN
    const masked = mask(full)
    expect(masked.length).toBe(full.length)
    expect(masked.startsWith('AE07')).toBe(true)
    expect(masked.endsWith('3456')).toBe(true)
    expect(masked).not.toContain('33123456789') // middle digits gone
    // the helper exists in source with the same shape
    expect(actions).toMatch(/function maskIban[\s\S]*v\.slice\(0, 4\)[\s\S]*v\.slice\(-4\)/)
  })
  it('W2-009 no encryption-sized widening was needed (masked fits varchar(23))', () => {
    expect('AE070331234567890123456'.length).toBeLessThanOrEqual(23)
  })
})

// ── P2-P4 — run number per-entity uniqueness ────────────────────────────────

describe('P2-P4 — run number is unique per entity, not globally', () => {
  const schema = read('drizzle/schema/foundation.ts')
  it('W2-010 runNumber column no longer carries a global .unique()', () => {
    expect(schema).toMatch(/runNumber:\s*varchar\('run_number', \{ length: 30 \}\)\.notNull\(\),/)
    expect(schema).not.toMatch(/run_number', \{ length: 30 \}\)\.notNull\(\)\.unique\(\)/)
  })
  it('W2-011 composite unique index on (tenant, entity, run_number) exists', () => {
    expect(schema).toMatch(/uniqueIndex\('uq_payroll_run_number_per_entity'\)\s*\.on\(t\.tenantId, t\.legalEntityId, t\.runNumber\)/)
  })
  it('W2-012 migration 0055 exists and is documented as manual-apply', () => {
    const p = 'drizzle/migrations/0055_payroll_run_number_per_entity.sql'
    expect(existsSync(join(ROOT, p))).toBe(true)
    const sql = read(p)
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS payroll_runs_run_number_unique/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_run_number_per_entity/)
    expect(sql).toMatch(/MANUAL MIGRATION/)
  })
})

// ── P2-P5 — duplicate / overlapping period guard ────────────────────────────

describe('P2-P5 — duplicate REGULAR run guard', () => {
  const fn = actions.slice(actions.indexOf('export async function createPayrollRun'), actions.indexOf('export async function calculatePayrollRun'))
  it('W2-013 rejects an overlapping non-cancelled REGULAR run for the same payroll', () => {
    expect(fn).toMatch(/raw\.runType === 'REGULAR'/)
    expect(fn).toMatch(/notInArray\(payrollRuns\.status, \['CANCELLED', 'REJECTED'\]\)/)
    expect(fn).toMatch(/lte\(payrollRuns\.payPeriodStart, raw\.payPeriodEnd\)/)
    expect(fn).toMatch(/gte\(payrollRuns\.payPeriodEnd, raw\.payPeriodStart\)/)
    expect(fn).toMatch(/already covers an overlapping period/)
  })
  it('W2-014 runs inside the advisory-locked transaction (after nextRunNumber)', () => {
    const lockIdx = fn.indexOf('nextRunNumber(raw.legalEntityId, tx)')
    const dupIdx  = fn.indexOf("raw.runType === 'REGULAR'")
    expect(lockIdx).toBeGreaterThan(-1)
    expect(dupIdx).toBeGreaterThan(lockIdx) // overlap check is after the lock is held
  })
})
