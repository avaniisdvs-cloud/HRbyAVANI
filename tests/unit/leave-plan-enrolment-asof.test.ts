import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AsOfConflictError,
  getAsOfRow,
  leavePlanEnrolmentAsOfAdapter,
} from '@/lib/as-of-query'

const ROOT = process.cwd()
const source = () => readFileSync(join(ROOT, 'modules/absence/leave-plan-enrolment-actions.ts'), 'utf8')

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

describe('Phase 2B-3 leave plan enrolment as-of read helper', () => {
  it('adds a tx-aware as-of helper with the required input keys', () => {
    const src = source()
    expect(src).toContain('export async function findLeavePlanEnrolmentAsOfTx')
    expect(src).toContain('tenantId: string')
    expect(src).toContain('personId: string')
    expect(src).toContain('absencePlanId: string')
    expect(src).toContain('asOfDate: DateParam')
    expect(src).toContain('getAsOfRow<LeavePlanEnrolment>')
    expect(src).toContain('leavePlanEnrolmentAsOfAdapter')
  })

  it('uses absencePlanId in the business key so Annual and Sick can coexist', () => {
    expect(Object.keys(leavePlanEnrolmentAsOfAdapter.businessKey)).toEqual([
      'tenantId',
      'personId',
      'absencePlanId',
    ])

    const src = source()
    const helper = src.slice(
      src.indexOf('export async function findLeavePlanEnrolmentAsOfTx'),
      src.indexOf('// ── enrolPersonInLeavePlan'),
    )
    expect(helper).toContain('absencePlanId: input.absencePlanId')
  })

  it('returns the same-plan row for a current as-of lookup', async () => {
    const row = { id: 'annual-current', absencePlanId: 'annual-plan' }
    const db = createDb([row])

    await expect(getAsOfRow(db, leavePlanEnrolmentAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
      absencePlanId: 'annual-plan',
    }, '2026-06-07')).resolves.toBe(row)
  })

  it('hides a future enrolment before its effective date by returning null', async () => {
    const db = createDb([])

    await expect(getAsOfRow(db, leavePlanEnrolmentAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
      absencePlanId: 'study-plan',
    }, '2026-06-30')).resolves.toBeNull()
  })

  it('returns a future enrolment on its effective date', async () => {
    const row = { id: 'study-future', absencePlanId: 'study-plan' }
    const db = createDb([row])

    await expect(getAsOfRow(db, leavePlanEnrolmentAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
      absencePlanId: 'study-plan',
    }, '2026-07-01')).resolves.toBe(row)
  })

  it('returns null when no matching enrolment exists', async () => {
    const db = createDb([])

    await expect(getAsOfRow(db, leavePlanEnrolmentAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
      absencePlanId: 'maternity-plan',
    }, '2026-06-07')).resolves.toBeNull()
  })

  it('bubbles as-of conflicts clearly', async () => {
    const db = createDb([{ id: 'annual-a' }, { id: 'annual-b' }])

    await expect(getAsOfRow(db, leavePlanEnrolmentAsOfAdapter, {
      tenantId: 'tenant-1',
      personId: 'person-1',
      absencePlanId: 'annual-plan',
    }, '2026-06-07')).rejects.toBeInstanceOf(AsOfConflictError)
  })

  it('does not change leave enrolment write-path behavior in this phase', () => {
    const src = source()
    expect(src).toContain('eq(leavePlanEnrolments.personId, data.personId)')
    expect(src).toContain('eq(leavePlanEnrolments.isCurrent, true)')
    expect(src).toContain('BR-ENROL-001: Only one active leave plan enrolment per person at a time.')
  })
})
