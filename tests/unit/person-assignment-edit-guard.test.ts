/**
 * CoreHR hardening — generic person edit must not mutate effective-dated
 * assignment authority fields directly.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (...segments: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8')

const ACTIONS = read('modules/core-hr/actions.ts')
const EDIT_ACTION = read('modules/core-hr/edit-person.ts')
const EDIT_FORM = read('app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx')
const EDIT_DRAWER = read('app/(hr-admin)/persons/_components/PersonEditDrawer.tsx')

const assignmentPayloadWrites = [
  'patch.assignmentStatus',
  'patch.currentDepartmentId',
  'patch.currentPositionId',
  'patch.currentGradeId',
  'patch.currentLocationId',
  'patch.lineManagerId',
  'dottedLineManagerId) (patch',
]

describe('generic person edit assignment guard', () => {
  it('updatePerson rejects assignment-sensitive patch fields before DB transaction', () => {
    const parseIdx = ACTIONS.indexOf('const data = UpdatePersonSchema.parse(patch)')
    const guardIdx = ACTIONS.indexOf('getAssignmentSensitiveUpdateFields(patch as Record<string, unknown>)')
    const txIdx = ACTIONS.indexOf('await db.transaction(async tx =>', parseIdx)

    expect(parseIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(parseIdx)
    expect(guardIdx).toBeLessThan(txIdx)
    expect(ACTIONS).toContain('ASSIGNMENT_CHANGE_REQUIRES_LIFECYCLE')
  })

  it('updatePersonFromEdit returns a controlled error for assignment-sensitive fields', () => {
    const parseIdx = EDIT_ACTION.indexOf('const data = parsed.data')
    const guardIdx = EDIT_ACTION.indexOf('getAssignmentSensitiveUpdateFields(data as Record<string, unknown>)')
    const txIdx = EDIT_ACTION.indexOf('await db.transaction(async tx =>', guardIdx)

    expect(parseIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(parseIdx)
    expect(guardIdx).toBeLessThan(txIdx)
    expect(EDIT_ACTION).toContain('ASSIGNMENT_CHANGE_REQUIRES_LIFECYCLE')
    expect(EDIT_ACTION).toContain('success: false')
  })

  it('full edit form does not include assignment-sensitive fields in buildPatch', () => {
    for (const needle of assignmentPayloadWrites) {
      expect(EDIT_FORM).not.toContain(needle)
    }
    expect(EDIT_FORM).toContain('Assignment-sensitive fields are read-only in this generic edit form')
  })

  it('full edit form keeps assignment Select controls read-only', () => {
    expect(EDIT_FORM).toContain('id="currentPositionId"')
    expect(EDIT_FORM).toContain('id="currentDepartmentId"')
    expect(EDIT_FORM).toContain('id="currentGradeId"')
    expect(EDIT_FORM).toContain('id="currentLocationId"')
    expect(EDIT_FORM).toContain('id="lineManagerId"')
    expect(EDIT_FORM).toContain('id="assignmentStatus"')
    expect(EDIT_FORM).toContain('disabled>')
  })

  it('drawer edit save does not send assignment-sensitive fields through updatePersonFromEdit', () => {
    const saveStart = EDIT_DRAWER.indexOf('function handleSave()')
    const saveEnd = EDIT_DRAWER.indexOf('// ── Footer', saveStart)
    const saveBlock = EDIT_DRAWER.slice(saveStart, saveEnd)

    expect(saveBlock).toContain('Assignment-sensitive fields are visible in this drawer')
    for (const field of [
      'payload.assignmentStatus',
      'payload.currentDepartmentId',
      'payload.currentPositionId',
      'payload.currentGradeId',
      'payload.currentLocationId',
      'payload.lineManagerId',
    ]) {
      expect(saveBlock).not.toContain(field)
    }
  })

  it('non-assignment profile saves still use the existing generic person update actions', () => {
    expect(EDIT_FORM).toContain('await updatePerson(person.id, patch)')
    expect(EDIT_DRAWER).toContain('updatePersonFromEdit(person.id, payload')
  })
})
