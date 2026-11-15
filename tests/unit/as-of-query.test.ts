import { describe, expect, it } from 'vitest'
import {
  AsOfConflictError,
  asOfAdapters,
  getAsOfRow,
  isAsOfDateInRange,
  leavePlanEnrolmentAsOfAdapter,
  resolveAsOfRows,
  salaryElementAsOfAdapter,
  workerAssignmentAsOfAdapter,
} from '@/lib/as-of-query'
import { EFFECTIVE_END_OF_TIME } from '@/lib/effective-date'

function createDb(rows: unknown[] = []) {
  const calls: unknown[] = []
  const db = {
    calls,
    select() {
      calls.push({ step: 'select' })
      return {
        from(table: unknown) {
          calls.push({ step: 'from', table })
          return {
            where(condition: unknown) {
              calls.push({ step: 'where', condition })
              return {
                orderBy(...order: unknown[]) {
                  calls.push({ step: 'orderBy', count: order.length })
                  return {
                    async limit(count: number) {
                      calls.push({ step: 'limit', count })
                      return rows
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
  return db
}

describe('Phase 2A as-of query foundation', () => {
  it('exports explicit adapters for the approved Phase 1 tables', () => {
    expect(Object.keys(asOfAdapters)).toEqual([
      'workerAssignments',
      'salaryElements',
      'payrollAssignments',
      'workScheduleAssignments',
      'leavePlanEnrolments',
      'gradeHistory',
      'departmentHistory',
      'locationHistory',
      'jobHistory',
      'positionHistory',
    ])
  })

  it('uses the approved business key for worker assignments', () => {
    expect(Object.keys(workerAssignmentAsOfAdapter.businessKey)).toEqual(['tenantId', 'personId'])
    expect(workerAssignmentAsOfAdapter.sequenceColumn).toBeDefined()
    expect(workerAssignmentAsOfAdapter.currentColumn).toBeDefined()
    expect(workerAssignmentAsOfAdapter.extraConditions).toHaveLength(1)
  })

  it('uses date logic without is_current for salary elements', () => {
    expect(Object.keys(salaryElementAsOfAdapter.businessKey)).toEqual([
      'tenantId',
      'personId',
      'assignmentId',
      'payrollId',
      'elementCode',
    ])
    expect(salaryElementAsOfAdapter.sequenceColumn).toBeDefined()
    expect(salaryElementAsOfAdapter.currentColumn).toBeUndefined()
  })

  it('uses plan-specific leave enrolment key so concurrent plans are allowed', () => {
    expect(Object.keys(leavePlanEnrolmentAsOfAdapter.businessKey)).toEqual([
      'tenantId',
      'personId',
      'absencePlanId',
    ])
  })

  it('treats sentinel end date as an open-ended effective range', () => {
    expect(isAsOfDateInRange('2026-01-01', EFFECTIVE_END_OF_TIME, '2099-12-31')).toBe(true)
    expect(isAsOfDateInRange('2026-01-01', null, '2099-12-31')).toBe(true)
  })

  it('does not return future-dated rows before their start date', () => {
    expect(isAsOfDateInRange('2026-07-01', EFFECTIVE_END_OF_TIME, '2026-06-30')).toBe(false)
    expect(isAsOfDateInRange('2026-07-01', EFFECTIVE_END_OF_TIME, '2026-07-01')).toBe(true)
  })

  it('returns null when there is no matching row', async () => {
    const db = createDb([])
    await expect(getAsOfRow(db, workerAssignmentAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
    }, '2026-06-07')).resolves.toBeNull()
  })

  it('returns the matched row when exactly one row is found', async () => {
    const row = { id: 'assignment-1' }
    const db = createDb([row])
    await expect(getAsOfRow(db, workerAssignmentAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
    }, '2026-06-07')).resolves.toBe(row)
  })

  it('throws on conflict from public getAsOfRow', async () => {
    const db = createDb([{ id: 'a' }, { id: 'b' }])
    await expect(getAsOfRow(db, workerAssignmentAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
    }, '2026-06-07')).rejects.toBeInstanceOf(AsOfConflictError)
  })

  it('keeps internal resolver structured for no-match, match, and conflict outcomes', () => {
    expect(resolveAsOfRows(workerAssignmentAsOfAdapter, [])).toMatchObject({
      row: null,
      matched: false,
      conflict: false,
      reason: 'NO_MATCH',
    })
    expect(resolveAsOfRows(workerAssignmentAsOfAdapter, [{ id: 'a' }])).toMatchObject({
      row: { id: 'a' },
      matched: true,
      conflict: false,
      reason: 'MATCH',
    })
    expect(resolveAsOfRows(workerAssignmentAsOfAdapter, [{ id: 'a' }, { id: 'b' }])).toMatchObject({
      row: null,
      matched: true,
      conflict: true,
      reason: 'CONFLICT',
      conflictReason: 'DUPLICATE_SEQUENCE',
    })
  })

  it('queries with limit 2 so conflicts remain detectable', async () => {
    const db = createDb([])
    await getAsOfRow(db, salaryElementAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
      assignmentId: 'assignment-1',
      payrollId: 'payroll-1',
      elementCode: 'BASIC',
    }, '2026-06-07')
    expect(db.calls).toContainEqual({ step: 'limit', count: 2 })
  })
})
