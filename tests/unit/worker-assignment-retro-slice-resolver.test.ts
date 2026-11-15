import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const source = () => readFileSync(join(ROOT, 'modules/core-hr/worker-assignments/services.ts'), 'utf8')
const actionModeSource = () => readFileSync(join(ROOT, 'lib/action-mode.ts'), 'utf8')

function resolverBlock(): string {
  const src = source()
  return src.slice(
    src.indexOf('export async function resolveAssignmentSliceForDateTx'),
    src.indexOf('// ── Auto-promote manager role'),
  )
}

function changeAssignmentBlock(): string {
  const src = source()
  return src.slice(
    src.indexOf('export async function changeAssignmentTx'),
    src.length,
  )
}

describe('Phase 2D-1 worker assignment retro slice resolver', () => {
  it('adds a read-only helper with a clear discriminated result contract', () => {
    const src = source()
    expect(src).toContain('export type AssignmentSliceResolution')
    expect(src).toContain("{ status: 'ok'; slice: WorkerAssignment }")
    expect(src).toContain("status: 'no_match'")
    expect(src).toContain("reason: 'NO_ASSIGNMENT_SLICE_FOR_DATE'")
    expect(src).toContain("status: 'conflict'")
    expect(src).toContain("reason: 'MULTIPLE_ASSIGNMENT_SLICES_FOR_DATE'")
    expect(src).toContain('export async function resolveAssignmentSliceForDateTx')
  })

  it('matches the single slice effective on tenant/person/date using inclusive boundaries', () => {
    const helper = resolverBlock()
    expect(helper).toContain('.select()')
    expect(helper).toContain('.from(workerAssignments)')
    expect(helper).toContain('eq(workerAssignments.tenantId, TENANT_ID)')
    expect(helper).toContain('eq(workerAssignments.personId, personId)')
    expect(helper).toContain('sql`${workerAssignments.effectiveStartDate} <= ${effectiveDate}`')
    expect(helper).toContain('sql`${workerAssignments.effectiveEndDate} >= ${effectiveDate}`')
  })

  it('detects no-match and multiple-match outcomes without mutating data', () => {
    const helper = resolverBlock()
    expect(helper).toContain('.limit(2)')
    expect(helper).toContain('if (rows.length === 0)')
    expect(helper).toContain("status: 'no_match'")
    expect(helper).toContain('if (rows.length > 1)')
    expect(helper).toContain("status: 'conflict'")
    expect(helper).toContain('matchingIds: rows.map(row => row.id)')
    expect(helper).not.toContain('.insert(')
    expect(helper).not.toContain('.update(')
    expect(helper).not.toContain('.delete(')
  })

  it('keeps RETRO_SPLIT type-safe without making it a callable changeAssignmentTx mode', () => {
    const changeAssignment = changeAssignmentBlock()
    const actionMode = actionModeSource()
    expect(source()).toContain('export async function retroSplitAssignmentTx')
    expect(changeAssignment).not.toContain("if (mode === 'RETRO_SPLIT')")
    expect(actionMode).toContain("export type ActionMode = 'UPDATE' | 'CORRECTION' | 'FUTURE_DATED' | 'RETRO_SPLIT'")
    expect(actionMode).toContain("export type ChangeAssignmentMode = Exclude<ActionMode, 'RETRO_SPLIT'>")
    expect(source()).toContain('mode?:           ChangeAssignmentMode')
    expect(changeAssignment).toContain("if (mode === 'CORRECTION')")
    expect(changeAssignment).toContain("if (mode === 'FUTURE_DATED')")
    expect(changeAssignment).toContain("actionMode:              'UPDATE'")
    expect(changeAssignment).toContain("actionMode:              'CORRECTION'")
    expect(changeAssignment).toContain("actionMode:              'FUTURE_DATED'")
  })
})
