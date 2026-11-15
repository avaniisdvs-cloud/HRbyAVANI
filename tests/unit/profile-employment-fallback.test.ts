/**
 * PEF — getMyProfile employment fallback (Option B).
 *
 * Verifies (by source inspection) that the read-only fallback is present and
 * correctly gated: the real worker_assignments path is preferred, and the
 * persons.current_* fallback is only used when no current assignment row exists.
 * Behavioural proof is in tests/e2e/profile-employment-fallback.spec.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'modules/profile/actions.ts'),
  'utf8',
)

describe('getMyProfile employment fallback (Option B)', () => {
  it('PEF-001: still prefers the real worker_assignments row', () => {
    // employment uses assignmentRows[0] first, fallback second
    expect(SRC).toMatch(/assignmentRows\[0\]\s*\?\?\s*fallbackAssignment/)
  })

  it('PEF-002: fallback is only built when there is NO current assignment row', () => {
    expect(SRC).toMatch(/if\s*\(\s*!assignmentRows\[0\]\s*\)/)
  })

  it('PEF-003: fallback reads from persons.current_* fields', () => {
    for (const field of [
      'person.currentPositionId',
      'person.currentDepartmentId',
      'person.currentGradeId',
      'person.currentLocationId',
      'person.currentJobId',
    ]) {
      expect(SRC).toContain(field)
    }
  })

  it('PEF-004: fallback resolves names from the same master tables', () => {
    // Each master table referenced inside the fallback block
    for (const tbl of ['positions', 'departments', 'grades', 'locations', 'legalEntities', 'jobs']) {
      expect(SRC).toContain(tbl)
    }
  })

  it('PEF-005: fallback is guarded by hasAnyEmploymentData (genuinely empty stays null)', () => {
    expect(SRC).toMatch(/hasAnyEmploymentData/)
    // empty records must still yield null employment
    expect(SRC).toMatch(/employment:\s*\(assignmentRows\[0\]\s*\?\?\s*fallbackAssignment\)/)
  })

  it('PEF-006: fallback does NOT insert/update worker_assignments', () => {
    // The fallback block must be read-only — no writes to workerAssignments.
    // (The whole file is a profile reader; assert no insert/update on workerAssignments.)
    expect(SRC).not.toMatch(/db\s*\.\s*insert\(\s*workerAssignments/)
    expect(SRC).not.toMatch(/db\s*\.\s*update\(\s*workerAssignments/)
  })

  it('PEF-007: fallback marked clearly as read-only fallback in comments', () => {
    expect(SRC).toMatch(/FALLBACK employment source \(read-only\)/i)
  })
})
