import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const source = () => readFileSync(join(ROOT, 'modules/core-hr/worker-assignments/services.ts'), 'utf8')

describe('Phase 2B-1 worker assignment as-of read helper', () => {
  it('routes current assignment lookup through the shared as-of query service', () => {
    const src = source()
    expect(src).toContain("import { getAsOfRow, workerAssignmentAsOfAdapter } from '@/lib/as-of-query'")
    expect(src).toContain('asOfDate: DateParam = todayUae()')
    expect(src).toContain('getAsOfRow<WorkerAssignment>')
    expect(src).toContain('workerAssignmentAsOfAdapter')
    expect(src).toContain('{ tenantId: TENANT_ID, personId }')
  })

  it('removes direct is_current filtering from findCurrentAssignmentTx only', () => {
    const src = source()
    const helper = src.slice(
      src.indexOf('export async function findCurrentAssignmentTx'),
      src.indexOf('export type AssignmentSliceResolution'),
    )
    expect(helper).not.toContain('eq(workerAssignments.isCurrent, true)')
    expect(helper).not.toContain('.from(workerAssignments)')
  })
})
