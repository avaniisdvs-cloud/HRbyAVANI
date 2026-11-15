import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type AssignmentRow = {
  id: string
  status: 'ACTIVE' | 'INACTIVE'
  start: string
  end: string
}

const ROOT = process.cwd()
const migration = () => readFileSync(
  join(ROOT, 'drizzle/migrations/0064_worker_assignment_active_timeline.sql'),
  'utf8',
)

function rangesOverlap(a: AssignmentRow, b: AssignmentRow): boolean {
  return a.start <= b.end && b.start <= a.end
}

function hasActiveOverlap(rows: AssignmentRow[]): boolean {
  const activeRows = rows.filter(row => row.status !== 'INACTIVE')
  return activeRows.some((row, i) =>
    activeRows.slice(i + 1).some(other => rangesOverlap(row, other)),
  )
}

function resolveActiveAsOf(rows: AssignmentRow[], asOf: string): AssignmentRow | null {
  return rows
    .filter(row => row.status !== 'INACTIVE')
    .filter(row => row.start <= asOf && row.end >= asOf)
    .sort((a, b) => b.start.localeCompare(a.start))[0] ?? null
}

describe('ED-UAT-002 worker assignment active timeline constraint', () => {
  it('replaces the worker assignment overlap constraint with an active-row-only predicate', () => {
    const sql = migration()
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS excl_worker_assignments_no_overlap')
    expect(sql).toContain('ADD CONSTRAINT excl_worker_assignments_no_overlap')
    expect(sql).toContain("WHERE (assignment_status <> 'INACTIVE')")
    expect(sql).toContain('DROP INDEX IF EXISTS idx_worker_assignments_asof')
    expect(sql).toContain('CREATE INDEX idx_worker_assignments_asof')
    expect(sql).toContain("WHERE assignment_status <> 'INACTIVE'")
  })

  it('models the original ED-UAT-002 failure: reopening predecessor overlaps an active future row', () => {
    expect(hasActiveOverlap([
      { id: 'WA-0000331', status: 'ACTIVE', start: '2024-10-08', end: '9999-12-31' },
      { id: 'WA-0000701', status: 'ACTIVE', start: '2026-07-15', end: '9999-12-31' },
    ])).toBe(true)
  })

  it('allows retained inactive cancelled future rows after predecessor repair', () => {
    expect(hasActiveOverlap([
      { id: 'WA-0000331', status: 'ACTIVE', start: '2024-10-08', end: '9999-12-31' },
      { id: 'WA-0000701', status: 'INACTIVE', start: '2026-07-15', end: '9999-12-31' },
    ])).toBe(false)
  })

  it('still blocks two overlapping active worker assignment rows', () => {
    expect(hasActiveOverlap([
      { id: 'active-1', status: 'ACTIVE', start: '2026-01-01', end: '9999-12-31' },
      { id: 'active-2', status: 'ACTIVE', start: '2026-07-15', end: '9999-12-31' },
    ])).toBe(true)
  })

  it('active as-of resolution ignores inactive cancelled future rows', () => {
    const rows: AssignmentRow[] = [
      { id: 'WA-0000331', status: 'ACTIVE', start: '2024-10-08', end: '9999-12-31' },
      { id: 'WA-0000701', status: 'INACTIVE', start: '2026-07-15', end: '9999-12-31' },
    ]
    expect(resolveActiveAsOf(rows, '2026-06-10')?.id).toBe('WA-0000331')
    expect(resolveActiveAsOf(rows, '2026-07-15')?.id).toBe('WA-0000331')
  })
})
