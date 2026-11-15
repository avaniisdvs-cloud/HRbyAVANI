/**
 * Employee Assignment History report — summary-count logic.
 * EH-001–008.
 *
 * Verifies the pure count function that powers "how many promotions / grade
 * changes / transfers / manager changes" on the history report. Counts key off
 * actionType (promotion/demotion) and actual before≠after value differences.
 */
import { describe, it, expect, vi } from 'vitest'

// summariseEmploymentActions is pure, but its module imports '@/lib/db'
// (createDb()/DATABASE_URL at import). Stub it so the helper can load.
vi.mock('@/lib/db', () => ({ db: {} }))

const { summariseEmploymentActions } = await import('@/modules/reports/employee-history')
type ActionForSummary = import('@/modules/reports/employee-history').ActionForSummary

const base: ActionForSummary = {
  actionType: 'TRANSFER',
  beforeGradeId: null, afterGradeId: null,
  beforeManagerId: null, afterManagerId: null,
  beforeDepartmentId: null, afterDepartmentId: null,
  beforePositionId: null, afterPositionId: null,
}
const A = (o: Partial<ActionForSummary>): ActionForSummary => ({ ...base, ...o })

describe('summariseEmploymentActions', () => {
  it('EH-001 empty history → all zero', () => {
    expect(summariseEmploymentActions([])).toEqual({
      totalActions: 0, promotions: 0, demotions: 0, gradeChanges: 0,
      transfers: 0, managerChanges: 0, positionChanges: 0,
    })
  })

  it('EH-002 counts promotions and demotions by actionType', () => {
    const s = summariseEmploymentActions([
      A({ actionType: 'PROMOTION', beforeGradeId: 'g1', afterGradeId: 'g2' }),
      A({ actionType: 'PROMOTION', beforeGradeId: 'g2', afterGradeId: 'g3' }),
      A({ actionType: 'DEMOTION',  beforeGradeId: 'g3', afterGradeId: 'g2' }),
    ])
    expect(s.promotions).toBe(2)
    expect(s.demotions).toBe(1)
    expect(s.totalActions).toBe(3)
  })

  it('EH-003 grade changes count actual before≠after grade differences', () => {
    const s = summariseEmploymentActions([
      A({ beforeGradeId: 'g1', afterGradeId: 'g2' }),  // changed
      A({ beforeGradeId: 'g2', afterGradeId: 'g2' }),  // unchanged
      A({ beforeGradeId: 'g2', afterGradeId: 'g3' }),  // changed
    ])
    expect(s.gradeChanges).toBe(2)
  })

  it('EH-004 manager changes (incl. null→value) counted', () => {
    const s = summariseEmploymentActions([
      A({ beforeManagerId: null, afterManagerId: 'm1' }), // changed (first manager)
      A({ beforeManagerId: 'm1', afterManagerId: 'm1' }), // unchanged
      A({ beforeManagerId: 'm1', afterManagerId: 'm2' }), // changed
    ])
    expect(s.managerChanges).toBe(2)
  })

  it('EH-005 transfers count department differences (not every TRANSFER row)', () => {
    const s = summariseEmploymentActions([
      A({ actionType: 'TRANSFER', beforeDepartmentId: 'd1', afterDepartmentId: 'd2' }), // moved
      A({ actionType: 'TRANSFER', beforeDepartmentId: 'd2', afterDepartmentId: 'd2' }), // same dept (e.g. location-only)
    ])
    expect(s.transfers).toBe(1)
  })

  it('EH-006 position changes counted by before≠after position', () => {
    const s = summariseEmploymentActions([
      A({ beforePositionId: 'p1', afterPositionId: 'p2' }),
      A({ beforePositionId: 'p2', afterPositionId: 'p2' }),
    ])
    expect(s.positionChanges).toBe(1)
  })

  it('EH-007 totalActions reflects every recorded action', () => {
    const s = summariseEmploymentActions([A({}), A({}), A({ actionType: 'HIRE' })])
    expect(s.totalActions).toBe(3)
  })

  it('EH-008 a realistic career: hire → promo → transfer → manager change', () => {
    const s = summariseEmploymentActions([
      A({ actionType: 'HIRE',      beforeGradeId: null, afterGradeId: 'g1', beforeManagerId: null, afterManagerId: 'm1', beforeDepartmentId: null, afterDepartmentId: 'd1', beforePositionId: null, afterPositionId: 'p1' }),
      A({ actionType: 'PROMOTION', beforeGradeId: 'g1', afterGradeId: 'g2', beforeManagerId: 'm1', afterManagerId: 'm1', beforeDepartmentId: 'd1', afterDepartmentId: 'd1', beforePositionId: 'p1', afterPositionId: 'p2' }),
      A({ actionType: 'TRANSFER',  beforeGradeId: 'g2', afterGradeId: 'g2', beforeManagerId: 'm1', afterManagerId: 'm2', beforeDepartmentId: 'd1', afterDepartmentId: 'd2', beforePositionId: 'p2', afterPositionId: 'p2' }),
    ])
    expect(s).toEqual({
      totalActions: 3, promotions: 1, demotions: 0,
      gradeChanges: 2,      // hire(null→g1) + promo(g1→g2)
      transfers: 2,         // hire(null→d1) + transfer(d1→d2)
      managerChanges: 2,    // hire(null→m1) + transfer(m1→m2)
      positionChanges: 2,   // hire(null→p1) + promo(p1→p2)
    })
  })
})
