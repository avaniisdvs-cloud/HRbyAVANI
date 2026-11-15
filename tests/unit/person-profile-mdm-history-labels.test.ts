import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const source = () => readFileSync(join(ROOT, 'app/(hr-admin)/persons/[id]/page.tsx'), 'utf8')

function helperSource(): string {
  const src = source()
  return src.slice(
    src.indexOf('type WorkerAssignmentHistoryRow'),
    src.indexOf('function Row({'),
  )
}

describe('Phase 2B-5 person profile worker assignment MDM history labels', () => {
  it('uses assignment effectiveStartDate as the MDM as-of date', () => {
    const helper = helperSource()
    expect(helper).toContain('const asOfDate = assignment.effectiveStartDate')
    expect(helper).toContain('resolveDepartmentHistoryLabel(assignment.departmentId, asOfDate, cache)')
    expect(helper).toContain('resolveJobHistoryLabel(assignment.jobId, asOfDate, cache)')
    expect(helper).toContain('resolvePositionHistoryLabel(assignment.positionId, asOfDate, cache)')
    expect(helper).toContain('resolveGradeHistoryLabel(assignment.gradeId, asOfDate, cache)')
    expect(helper).toContain('resolveLocationHistoryLabel(assignment.locationId, asOfDate, cache)')
  })

  it('resolves MDM history before current base-table fallback', () => {
    const helper = helperSource()
    for (const adapter of [
      'departmentHistoryAsOfAdapter',
      'jobHistoryAsOfAdapter',
      'positionHistoryAsOfAdapter',
      'gradeHistoryAsOfAdapter',
      'locationHistoryAsOfAdapter',
    ]) {
      expect(helper).toContain(adapter)
    }

    expect(helper.indexOf('departmentHistoryAsOfAdapter')).toBeLessThan(helper.indexOf('.from(departments)'))
    expect(helper.indexOf('jobHistoryAsOfAdapter')).toBeLessThan(helper.indexOf('.from(jobs)'))
    expect(helper.indexOf('positionHistoryAsOfAdapter')).toBeLessThan(helper.indexOf('.from(positions)'))
    expect(helper.indexOf('gradeHistoryAsOfAdapter')).toBeLessThan(helper.indexOf('.from(grades)'))
    expect(helper.indexOf('locationHistoryAsOfAdapter')).toBeLessThan(helper.indexOf('.from(locations)'))
  })

  it('falls back to an em dash only after history and current labels miss', () => {
    const helper = helperSource()
    expect(helper).toContain("const EMPTY_HISTORY_LABEL = '—'")
    expect(helper.match(/\?\? EMPTY_HISTORY_LABEL/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it('shows a clear label when MDM history has an as-of conflict', () => {
    const helper = helperSource()
    expect(helper).toContain("const HISTORY_CONFLICT_LABEL = 'History conflict'")
    expect(helper.match(/err instanceof AsOfConflictError/g)?.length).toBe(5)
    expect(helper.match(/return HISTORY_CONFLICT_LABEL/g)?.length).toBe(5)
  })

  it('uses a per-request cache for repeated history label lookups', () => {
    const src = source()
    const helper = helperSource()
    expect(src).toContain('const historyLabelCache: HistoryLabelCache = new Map()')
    expect(src).toContain('resolveAssignmentHistoryLabels(assignment, historyLabelCache)')
    expect(helper).toContain('type HistoryLabelCache = Map<string, Promise<string>>')
    expect(helper).toContain('const cached = cache.get(key)')
    expect(helper).toContain('cache.set(key, resolved)')
  })

  it('renders historical labels only in the worker assignment history section', () => {
    const src = source()
    const historySection = src.slice(
      src.indexOf('Worker assignment history'),
      src.indexOf('Employment actions'),
    )
    expect(historySection).toContain('assignmentRowsWithHistoricalLabels.map')
    // i18n: labels localized (e.g. `{locale === 'ar' ? 'القسم' : 'Department'}:`),
    // so assert on the historical-label bindings (unchanged) rather than the
    // English label literals.
    expect(historySection).toContain('{a.historicalLabels.department}')
    expect(historySection).toContain('{a.historicalLabels.position}')
    expect(historySection).toContain('{a.historicalLabels.job}')
    expect(historySection).toContain('{a.historicalLabels.grade}')
    expect(historySection).toContain('{a.historicalLabels.location}')

    const currentEmploymentCard = src.slice(
      src.indexOf(": 'Employment'"),
      src.indexOf('{job?.isEmiratisationTarget'),
    )
    expect(currentEmploymentCard).not.toContain('historicalLabels')
    expect(currentEmploymentCard).not.toContain('assignmentRowsWithHistoricalLabels')
  })
})
