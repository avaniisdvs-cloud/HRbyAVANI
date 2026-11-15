import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type TimelineRow = {
  id: string
  start: string
  end: string
  status: 'ACTIVE' | 'INACTIVE'
  isCurrent: boolean
  actionMode: 'UPDATE' | 'FUTURE_DATED' | 'RETRO_SPLIT'
}

const ROOT = process.cwd()
const serviceSource = () => readFileSync(join(ROOT, 'modules/core-hr/worker-assignments/services.ts'), 'utf8')
const actionModeSource = () => readFileSync(join(ROOT, 'lib/action-mode.ts'), 'utf8')

function futureBoundedBranch(): string {
  const src = serviceSource()
  return src.slice(
    src.indexOf('// ED-2D-3: a current row can already be date-bounded'),
    src.indexOf('// 1) close current row.'),
  )
}

function rangesOverlap(a: TimelineRow, b: TimelineRow): boolean {
  return a.start <= b.end && b.start <= a.end
}

function activeOverlaps(rows: TimelineRow[]): number {
  const active = rows.filter(row => row.status !== 'INACTIVE')
  let count = 0
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      if (rangesOverlap(active[i], active[j])) count += 1
    }
  }
  return count
}

function activeAsOf(rows: TimelineRow[], asOf: string): TimelineRow | null {
  return rows
    .filter(row => row.status !== 'INACTIVE')
    .filter(row => row.start <= asOf && row.end >= asOf)
    .sort((a, b) => b.start.localeCompare(a.start))[0] ?? null
}

function addDays(date: string, days: number): string {
  const dt = new Date(`${date}T00:00:00.000Z`)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function applyFutureBoundedRetroSplit(input: {
  start: string
  currentEnd: string
  futureStart?: string
  effectiveDate: string
  today: string
  futureStatus?: 'ACTIVE' | 'INACTIVE'
  futureRows?: number
}): TimelineRow[] {
  const futureRows = input.futureRows ?? (input.futureStart ? 1 : 0)
  if (input.effectiveDate <= input.start) throw new Error('D_LE_S')
  if (input.effectiveDate > input.today) throw new Error('FUTURE_EFFECTIVE_RETRO')
  if (!input.futureStart) throw new Error('MISSING_FUTURE_BOUNDARY')
  if (futureRows > 1) throw new Error('MULTIPLE_FUTURE_BOUNDARIES')
  if (input.futureStatus === 'INACTIVE') throw new Error('INACTIVE_FUTURE_BOUNDARY')
  if (input.futureStart !== addDays(input.currentEnd, 1)) throw new Error('MISSING_FUTURE_BOUNDARY')
  if (input.effectiveDate >= input.futureStart) throw new Error('D_GTE_F')

  return [
    { id: 'A', start: input.start, end: addDays(input.effectiveDate, -1), status: 'ACTIVE', isCurrent: false, actionMode: 'UPDATE' },
    { id: 'R', start: input.effectiveDate, end: input.currentEnd, status: 'ACTIVE', isCurrent: true, actionMode: 'RETRO_SPLIT' },
    { id: 'F', start: input.futureStart, end: '9999-12-31', status: 'ACTIVE', isCurrent: false, actionMode: 'FUTURE_DATED' },
  ]
}

describe('ED-2D-3B future-bounded retro split', () => {
  it('uses type-safe RETRO_SPLIT action mode without raw SQL literal insertion', () => {
    const actionMode = actionModeSource()
    const branch = futureBoundedBranch()

    expect(actionMode).toContain("export type ActionMode = 'UPDATE' | 'CORRECTION' | 'FUTURE_DATED' | 'RETRO_SPLIT'")
    expect(actionMode).toContain("export type ChangeAssignmentMode = Exclude<ActionMode, 'RETRO_SPLIT'>")
    expect(branch).toContain("actionMode:              'RETRO_SPLIT'")
    expect(branch).not.toContain("actionMode:              sql`'RETRO_SPLIT'`")
  })

  it('uses advisory lock and recomputes current pointer after the split', () => {
    const src = serviceSource()
    const branch = futureBoundedBranch()

    expect(src).toContain('export async function lockWorkerAssignmentTimelineTx')
    expect(src).toContain('export async function recomputeCurrentWorkerAssignmentPointerTx')
    expect(src).toContain("pg_advisory_xact_lock(hashtext('worker_assignment:' || ${personId}))")
    expect(branch).toContain('recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)')
    expect(branch).toContain('currentPointerRecomputed:   true')
  })

  it('detects exactly one FUTURE_DATED boundary for a bounded current row', () => {
    const src = serviceSource()
    const branch = futureBoundedBranch()

    expect(src).toContain('const currentEffectiveEndDate = current.effectiveEndDate ?? EFFECTIVE_END_OF_TIME')
    expect(branch).toContain('currentEffectiveEndDate !== EFFECTIVE_END_OF_TIME')
    expect(branch).toContain('const futureBoundaryStartDate = addDays(currentEffectiveEndDate, 1)')
    expect(branch).toContain("eq(workerAssignments.actionMode, 'FUTURE_DATED')")
    expect(branch).toContain('sql`${workerAssignments.effectiveStartDate} > ${currentEffectiveEndDate}`')
    expect(branch).toContain('futureBoundaries.length === 0')
    expect(branch).toContain('futureBoundaries.length > 1')
  })

  it('rejects unsupported effective dates and inactive or missing boundaries before writing', () => {
    const branch = futureBoundedBranch()

    expect(branch).toContain('data.effectiveDate > todayUae()')
    expect(branch).toContain('FUTURE_BOUNDED_RETRO_SPLIT_REQUIRES_RETRO_OR_CURRENT_DATE')
    expect(branch).toContain('data.effectiveDate >= futureBoundaryStartDate')
    expect(branch).toContain('FUTURE_BOUNDED_RETRO_SPLIT_INVALID_RANGE')
    expect(branch).toContain('FUTURE_BOUNDED_RETRO_SPLIT_MISSING_FUTURE_BOUNDARY')
    expect(branch).toContain('FUTURE_BOUNDED_RETRO_SPLIT_MULTIPLE_FUTURE_BOUNDARIES')
    expect(branch).toContain("futureBoundary.assignmentStatus === 'INACTIVE'")
    expect(branch).toContain('FUTURE_BOUNDED_RETRO_SPLIT_INACTIVE_FUTURE_BOUNDARY')
    expect(branch.indexOf('FUTURE_BOUNDED_RETRO_SPLIT_INACTIVE_FUTURE_BOUNDARY')).toBeLessThan(branch.indexOf('.update(workerAssignments)'))
  })

  it('closes A to D-1, inserts R as current RETRO_SPLIT, and preserves F', () => {
    const branch = futureBoundedBranch()

    expect(branch).toContain('const originalNewEffectiveEndDate = addDays(data.effectiveDate, -1)')
    expect(branch).toContain('const replacementEffectiveEndDate = currentEffectiveEndDate')
    expect(branch).toContain('effectiveEndDate: originalNewEffectiveEndDate')
    expect(branch).toContain('isCurrent:        false')
    expect(branch).toContain('effectiveStartDate: data.effectiveDate')
    expect(branch).toContain('effectiveEndDate:   replacementEffectiveEndDate')
    expect(branch).toContain('isCurrent:               true')
    expect(branch).toContain("actionMode:              'RETRO_SPLIT'")
    expect(branch).toContain('futureBoundaryPreserved:    true')
    expect(branch).toContain('downstreamImpact')
    expect(branch).not.toContain('where(eq(workerAssignments.id, futureBoundary.id))')
  })

  it('keeps transfer/promotion apply-back compatible with UPDATE mode', () => {
    const branch = futureBoundedBranch()

    expect(branch).toContain("assignmentModeCompatibility: 'UPDATE'")
    expect(branch).toContain("mode:                'UPDATE'")
    expect(branch).toContain('closedId:            current.id')
    expect(branch).toContain('newId:               row.id')
  })

  it('models the approved A/R/F timeline and pending visibility', () => {
    const before: TimelineRow[] = [
      { id: 'A', start: '2024-01-01', end: '2026-09-14', status: 'ACTIVE', isCurrent: true, actionMode: 'UPDATE' },
      { id: 'F', start: '2026-09-15', end: '9999-12-31', status: 'ACTIVE', isCurrent: false, actionMode: 'FUTURE_DATED' },
    ]
    const after: TimelineRow[] = [
      { id: 'A', start: '2024-01-01', end: '2026-06-30', status: 'ACTIVE', isCurrent: false, actionMode: 'UPDATE' },
      { id: 'R', start: '2026-07-01', end: '2026-09-14', status: 'ACTIVE', isCurrent: true, actionMode: 'RETRO_SPLIT' },
      { id: 'F', start: '2026-09-15', end: '9999-12-31', status: 'ACTIVE', isCurrent: false, actionMode: 'FUTURE_DATED' },
    ]

    expect(before.filter(row => row.isCurrent)).toHaveLength(1)
    expect(activeOverlaps(after)).toBe(0)
    expect(after.filter(row => row.isCurrent)).toEqual([expect.objectContaining({ id: 'R' })])
    expect(after.filter(row => row.actionMode === 'FUTURE_DATED' && row.start > '2026-06-10')).toEqual([
      expect.objectContaining({ id: 'F' }),
    ])
    expect(activeAsOf(after, '2026-06-30')?.id).toBe('A')
    expect(activeAsOf(after, '2026-07-01')?.id).toBe('R')
    expect(activeAsOf(after, '2026-09-14')?.id).toBe('R')
    expect(activeAsOf(after, '2026-09-15')?.id).toBe('F')
  })

  it('models future cancellation repairing the replacement row', () => {
    const afterCancel: TimelineRow[] = [
      { id: 'A', start: '2024-01-01', end: '2026-06-30', status: 'ACTIVE', isCurrent: false, actionMode: 'UPDATE' },
      { id: 'R', start: '2026-07-01', end: '9999-12-31', status: 'ACTIVE', isCurrent: true, actionMode: 'RETRO_SPLIT' },
      { id: 'F', start: '2026-09-15', end: '9999-12-31', status: 'INACTIVE', isCurrent: false, actionMode: 'FUTURE_DATED' },
    ]

    expect(activeOverlaps(afterCancel)).toBe(0)
    expect(afterCancel.filter(row => row.isCurrent)).toEqual([expect.objectContaining({ id: 'R' })])
    expect(afterCancel.filter(row => row.actionMode === 'FUTURE_DATED' && row.status !== 'INACTIVE')).toHaveLength(0)
    expect(activeAsOf(afterCancel, '2026-09-15')?.id).toBe('R')
  })

  it('supports D = F - 1', () => {
    const rows = applyFutureBoundedRetroSplit({
      start: '2024-01-01',
      currentEnd: '2026-09-14',
      futureStart: '2026-09-15',
      effectiveDate: '2026-09-14',
      today: '2026-09-14',
    })

    expect(rows).toContainEqual(expect.objectContaining({ id: 'A', end: '2026-09-13', isCurrent: false }))
    expect(rows).toContainEqual(expect.objectContaining({ id: 'R', start: '2026-09-14', end: '2026-09-14', isCurrent: true }))
    expect(activeOverlaps(rows)).toBe(0)
  })

  it('supports D = today', () => {
    const rows = applyFutureBoundedRetroSplit({
      start: '2024-01-01',
      currentEnd: '2026-09-14',
      futureStart: '2026-09-15',
      effectiveDate: '2026-06-11',
      today: '2026-06-11',
    })

    expect(activeAsOf(rows, '2026-06-10')?.id).toBe('A')
    expect(activeAsOf(rows, '2026-06-11')?.id).toBe('R')
    expect(rows.filter(row => row.isCurrent)).toEqual([expect.objectContaining({ id: 'R' })])
  })

  it('rejects D >= F and D <= S', () => {
    const base = {
      start: '2024-01-01',
      currentEnd: '2026-09-14',
      futureStart: '2026-09-15',
      today: '2026-09-15',
    }

    expect(() => applyFutureBoundedRetroSplit({ ...base, effectiveDate: '2026-09-15' })).toThrow('D_GTE_F')
    expect(() => applyFutureBoundedRetroSplit({ ...base, effectiveDate: '2024-01-01' })).toThrow('D_LE_S')
  })

  it('rejects future-effective retro split, missing boundary, inactive boundary, and multiple boundaries', () => {
    const base = {
      start: '2024-01-01',
      currentEnd: '2026-09-14',
      effectiveDate: '2026-07-01',
      today: '2026-06-11',
    }

    expect(() => applyFutureBoundedRetroSplit({ ...base, futureStart: '2026-09-15' })).toThrow('FUTURE_EFFECTIVE_RETRO')
    expect(() => applyFutureBoundedRetroSplit({ ...base, effectiveDate: '2026-06-11' })).toThrow('MISSING_FUTURE_BOUNDARY')
    expect(() => applyFutureBoundedRetroSplit({ ...base, effectiveDate: '2026-06-11', futureStart: '2026-09-15', futureStatus: 'INACTIVE' })).toThrow('INACTIVE_FUTURE_BOUNDARY')
    expect(() => applyFutureBoundedRetroSplit({ ...base, effectiveDate: '2026-06-11', futureStart: '2026-09-15', futureRows: 2 })).toThrow('MULTIPLE_FUTURE_BOUNDARIES')
  })
})
