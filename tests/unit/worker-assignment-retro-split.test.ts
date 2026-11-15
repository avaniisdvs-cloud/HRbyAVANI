import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const serviceSource = () => readFileSync(join(ROOT, 'modules/core-hr/worker-assignments/services.ts'), 'utf8')
const actionModeSource = () => readFileSync(join(ROOT, 'lib/action-mode.ts'), 'utf8')

function retroSplitHelper(): string {
  const src = serviceSource()
  return src.slice(
    src.indexOf('export async function retroSplitAssignmentTx'),
    src.indexOf('export async function changeAssignmentTx'),
  )
}

function changeAssignmentBlock(): string {
  const src = serviceSource()
  return src.slice(
    src.indexOf('export async function changeAssignmentTx'),
    src.length,
  )
}

describe('Phase 2D-2 worker assignment historical retro split helper', () => {
  it('adds a separate helper without adding RETRO_SPLIT as a callable changeAssignmentTx branch', () => {
    const service = serviceSource()
    const actionMode = actionModeSource()
    const changeAssignment = changeAssignmentBlock()

    expect(service).toContain('export interface RetroSplitAssignmentTxInput')
    expect(service).toContain('export async function retroSplitAssignmentTx')
    expect(actionMode).toContain("export type ActionMode = 'UPDATE' | 'CORRECTION' | 'FUTURE_DATED' | 'RETRO_SPLIT'")
    expect(actionMode).toContain("export type ChangeAssignmentMode = Exclude<ActionMode, 'RETRO_SPLIT'>")
    expect(changeAssignment).not.toContain("if (mode === 'RETRO_SPLIT')")
  })

  it('serialises worker assignment timeline mutation with a per-person advisory lock', () => {
    const helper = retroSplitHelper()
    expect(helper).toContain('lockWorkerAssignmentTimelineTx(tx, data.personId)')
    expect(serviceSource()).toContain("pg_advisory_xact_lock(hashtext('worker_assignment:' || ${personId}))")
  })

  it('uses the slice resolver and rejects no-match or conflict outcomes before writing', () => {
    const helper = retroSplitHelper()
    expect(helper).toContain('resolveAssignmentSliceForDateTx(tx, data.personId, data.effectiveDate)')
    expect(helper).toContain("resolution.status === 'no_match'")
    expect(helper).toContain('RETRO_SPLIT_NO_ASSIGNMENT_SLICE')
    expect(helper).toContain("resolution.status === 'conflict'")
    expect(helper).toContain('RETRO_SPLIT_CONFLICT')
    expect(helper.indexOf("resolution.status === 'conflict'")).toBeLessThan(helper.indexOf('.update(workerAssignments)'))
  })

  it('limits Phase 2D-2 to historical inside-slice splits only', () => {
    const helper = retroSplitHelper()
    expect(helper).toContain('data.effectiveDate === slice.effectiveStartDate')
    expect(helper).toContain('RETRO_SPLIT_SAME_DAY_SEQUENCE_UNSUPPORTED')
    expect(helper).toContain('const sliceEffectiveEndDate = slice.effectiveEndDate ?? EFFECTIVE_END_OF_TIME')
    expect(helper).toContain('data.effectiveDate < slice.effectiveStartDate || data.effectiveDate > sliceEffectiveEndDate')
    expect(helper).toContain('RETRO_SPLIT_INVALID_RANGE')
    expect(helper).toContain('slice.isCurrent || data.effectiveDate >= todayUae()')
    expect(helper).toContain('RETRO_SPLIT_CURRENT_SLICE_UNSUPPORTED')
  })

  it('closes the original slice to effectiveDate - 1 and inserts a non-current replacement', () => {
    const helper = retroSplitHelper()
    expect(helper).toContain('const originalNewEffectiveEndDate = addDays(data.effectiveDate, -1)')
    expect(helper).toContain('effectiveEndDate: originalNewEffectiveEndDate')
    expect(helper).toContain('effectiveStartDate: data.effectiveDate')
    expect(helper).toContain('effectiveEndDate:   replacementEffectiveEndDate')
    expect(helper).toContain('isCurrent:               false')
    expect(helper).toContain("actionMode:              'RETRO_SPLIT'")
    expect(helper).toContain('effectiveSequence:       1')
  })

  it('bounds replacement by the next future row and rejects ambiguous future overlap', () => {
    const helper = retroSplitHelper()
    expect(helper).toContain('const futureRows = await tx')
    expect(helper).toContain('sql`${workerAssignments.effectiveStartDate} > ${data.effectiveDate}`')
    expect(helper).toContain('sql`${workerAssignments.effectiveStartDate} <= ${sliceEffectiveEndDate}`')
    expect(helper).toContain('futureRows.length > 1')
    expect(helper).toContain('RETRO_SPLIT_AMBIGUOUS_FUTURE_OVERLAP')
    expect(helper).toContain('nextFuture')
    expect(helper).toContain('addDays(nextFuture.effectiveStartDate, -1)')
  })

  it('audits retro split metadata and preserves the existing current-row compatibility contract', () => {
    const helper = retroSplitHelper()
    expect(helper).toContain("eventType:     'WORKER_ASSIGNMENT.RETRO_SPLIT'")
    expect(helper).toContain("actionMode:                 'RETRO_SPLIT'")
    expect(helper).toContain('originalAssignmentId:       slice.id')
    expect(helper).toContain('originalOldEffectiveEndDate')
    expect(helper).toContain('originalNewEffectiveEndDate')
    expect(helper).toContain('replacementAssignmentId:    row.id')
    expect(helper).toContain('replacementEffectiveStartDate: data.effectiveDate')
    expect(helper).toContain('replacementEffectiveEndDate')
    expect(helper).toContain('replacementIsCurrent:       false')
    expect(helper).toContain('existingCurrentPreserved:   true')
    expect(helper).toContain('currentPointerRecomputed:   true')
    expect(helper).toContain('downstreamImpact')
  })
})
