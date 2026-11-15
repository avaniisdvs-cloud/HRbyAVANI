/**
 * Shared Assignment History reader — security gate, temporal classification,
 * and the salary-exclusion contract.
 *
 * AHR-001…015. The pure functions (decideHistoryAccess, classifyTemporal) carry
 * the real RBAC + labelling logic, so they are tested directly. A source scan
 * enforces the hard "no salary column" rule for this workstream.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The module imports '@/lib/db' (DB client at import). Stub it so the pure
// helpers can be imported without a live database.
import { vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))

const { decideHistoryAccess, classifyTemporal } =
  await import('@/modules/core-hr/assignment-history')

type HistoryAccessInput = import('@/modules/core-hr/assignment-history').HistoryAccessInput

const ENTITY_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const ENTITY_B = 'bbbbbbbb-0000-0000-0000-000000000002'

const base: HistoryAccessInput = {
  role: 'EMPLOYEE',
  userLegalEntityId: ENTITY_A,
  isSelf: false,
  isManagerDirectReport: false,
  personLegalEntityId: ENTITY_A,
}
const I = (o: Partial<HistoryAccessInput>): HistoryAccessInput => ({ ...base, ...o })

describe('decideHistoryAccess — RBAC scope', () => {
  it('AHR-001 employee may view OWN history', () => {
    expect(decideHistoryAccess(I({ role: 'EMPLOYEE', isSelf: true }))).toBe('ALLOW')
  })

  it('AHR-002 employee may NOT view another employee', () => {
    expect(decideHistoryAccess(I({ role: 'EMPLOYEE', isSelf: false }))).toBe('DENY')
  })

  it('AHR-003 manager may view a DIRECT report', () => {
    expect(decideHistoryAccess(I({ role: 'MANAGER', isManagerDirectReport: true }))).toBe('ALLOW')
  })

  it('AHR-004 manager may NOT view a non-team employee', () => {
    expect(decideHistoryAccess(I({ role: 'MANAGER', isManagerDirectReport: false }))).toBe('DENY')
  })

  it('AHR-005 manager may view their OWN history', () => {
    expect(decideHistoryAccess(I({ role: 'MANAGER', isSelf: true, isManagerDirectReport: false }))).toBe('ALLOW')
  })

  it('AHR-006 HR_ADMIN may view in-entity employee', () => {
    expect(decideHistoryAccess(I({ role: 'HR_ADMIN', userLegalEntityId: ENTITY_A, personLegalEntityId: ENTITY_A }))).toBe('ALLOW')
  })

  it('AHR-007 HR_ADMIN may NOT view cross-entity employee', () => {
    expect(decideHistoryAccess(I({ role: 'HR_ADMIN', userLegalEntityId: ENTITY_A, personLegalEntityId: ENTITY_B }))).toBe('DENY')
  })

  it('AHR-008 HR_DIRECTOR follows the same entity scope as HR_ADMIN', () => {
    expect(decideHistoryAccess(I({ role: 'HR_DIRECTOR', userLegalEntityId: ENTITY_A, personLegalEntityId: ENTITY_A }))).toBe('ALLOW')
    expect(decideHistoryAccess(I({ role: 'HR_DIRECTOR', userLegalEntityId: ENTITY_A, personLegalEntityId: ENTITY_B }))).toBe('DENY')
  })

  it('AHR-009 SUPER_ADMIN may view ANY employee (cross-entity)', () => {
    expect(decideHistoryAccess(I({ role: 'SUPER_ADMIN', userLegalEntityId: ENTITY_A, personLegalEntityId: ENTITY_B }))).toBe('ALLOW')
  })

  it('AHR-010 PAYROLL_ADMIN / FINANCE get NO history access (not in scope)', () => {
    expect(decideHistoryAccess(I({ role: 'PAYROLL_ADMIN', personLegalEntityId: ENTITY_A }))).toBe('DENY')
    expect(decideHistoryAccess(I({ role: 'FINANCE', personLegalEntityId: ENTITY_A }))).toBe('DENY')
  })

  it('AHR-011 an unknown role is denied by default', () => {
    expect(decideHistoryAccess(I({ role: 'CEO' }))).toBe('DENY')
  })
})

describe('classifyTemporal', () => {
  const asOf = '2026-06-19'

  it('AHR-012 a closed past slice → PAST', () => {
    expect(classifyTemporal('2024-01-01', '2025-12-31', asOf)).toBe('PAST')
  })

  it('AHR-013 the live open-ended slice → CURRENT', () => {
    expect(classifyTemporal('2026-01-01', '9999-12-31', asOf)).toBe('CURRENT')
  })

  it('AHR-014 a slice whose range covers today → CURRENT', () => {
    expect(classifyTemporal('2026-06-01', '2026-06-30', asOf)).toBe('CURRENT')
  })

  it('AHR-015 a pre-loaded future-dated slice → FUTURE', () => {
    expect(classifyTemporal('2026-09-01', '9999-12-31', asOf)).toBe('FUTURE')
  })
})

describe('salary-exclusion contract', () => {
  it('AHR-016 reader source references no salary / compensation / payroll column', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(
      path.resolve(here, '../../modules/core-hr/assignment-history.ts'),
      'utf8',
    )
    // Strip the file's own documentation/comments (which explain the exclusion
    // and legitimately mention "salary") so we only scan executable code.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
      .replace(/\/\/.*$/gm, '')           // line comments
    // bare "salary" is allowed only as the SALARY_REVISION exclusion token.
    const codeNoExclusion = code.replace(/['"]SALARY_REVISION['"]/g, '')
    const forbidden = /basic_?salary|compensation|allowance|payroll|\bsalary\b/i
    expect(forbidden.test(codeNoExclusion)).toBe(false)
  })

  it('AHR-017 reader excludes SALARY_REVISION rows in-query (no salary-change history)', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const code = readFileSync(path.resolve(here, '../../modules/core-hr/assignment-history.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(/ne\(\s*workerAssignments\.actionType\s*,\s*['"]SALARY_REVISION['"]\s*\)/.test(code)).toBe(true)
  })
})
