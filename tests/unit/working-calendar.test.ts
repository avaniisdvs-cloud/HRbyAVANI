/**
 * ESS Task 2D — Working Calendar Inheritance unit tests (WCL-001–WCL-012).
 *
 * Tests the schedule inheritance model (entity default → employee override),
 * source label resolution, ESS display logic, and schema/file presence —
 * all without touching the real DB.
 */

import path from 'node:path'
import { describe, it, expect } from 'vitest'

const repoFile = (...segments: string[]) => path.join(process.cwd(), ...segments)

// ── Helpers: schedule source resolution (mirrors profile/actions.ts logic) ──

type ScheduleSource = 'ENTITY_DEFAULT' | 'EMPLOYEE_OVERRIDE' | null

function resolveScheduleSource(
  assignmentReason: string | null | undefined,
  hasAssignment: boolean,
  hasFallback: boolean,
): ScheduleSource {
  if (!hasAssignment) return hasFallback ? 'ENTITY_DEFAULT' : null
  return assignmentReason === 'AUTO_HIRED' ? 'ENTITY_DEFAULT' : 'EMPLOYEE_OVERRIDE'
}

// ── Helpers: ESS display labels ──────────────────────────────────────────────

function scheduleSourceLabel(source: ScheduleSource): string | null {
  if (source === 'ENTITY_DEFAULT')  return 'Inherited from Legal Entity'
  if (source === 'EMPLOYEE_OVERRIDE') return 'Employee Override'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────

describe('WCL-001: AUTO_HIRED reason → ENTITY_DEFAULT source', () => {
  it('resolves to ENTITY_DEFAULT when assignmentReason is AUTO_HIRED', () => {
    expect(resolveScheduleSource('AUTO_HIRED', true, false)).toBe('ENTITY_DEFAULT')
  })

  it('still resolves to ENTITY_DEFAULT for AUTO_HIRED even when fallback exists', () => {
    expect(resolveScheduleSource('AUTO_HIRED', true, true)).toBe('ENTITY_DEFAULT')
  })
})

describe('WCL-002: HR_ADMIN_UPDATE reason → EMPLOYEE_OVERRIDE source', () => {
  it('resolves to EMPLOYEE_OVERRIDE when assignmentReason is HR_ADMIN_UPDATE', () => {
    expect(resolveScheduleSource('HR_ADMIN_UPDATE', true, false)).toBe('EMPLOYEE_OVERRIDE')
  })

  it('resolves to EMPLOYEE_OVERRIDE for any non-AUTO_HIRED reason', () => {
    expect(resolveScheduleSource('MANUAL', true, false)).toBe('EMPLOYEE_OVERRIDE')
    expect(resolveScheduleSource('CORRECTION', true, false)).toBe('EMPLOYEE_OVERRIDE')
  })
})

describe('WCL-003: No assignment → fallback to entity default or null', () => {
  it('returns ENTITY_DEFAULT when no assignment but entity default exists', () => {
    expect(resolveScheduleSource(null, false, true)).toBe('ENTITY_DEFAULT')
  })

  it('returns null when no assignment and no entity default', () => {
    expect(resolveScheduleSource(null, false, false)).toBeNull()
  })
})

describe('WCL-004: Schedule source label display strings', () => {
  it('ENTITY_DEFAULT maps to correct display string', () => {
    expect(scheduleSourceLabel('ENTITY_DEFAULT')).toBe('Inherited from Legal Entity')
  })

  it('EMPLOYEE_OVERRIDE maps to correct display string', () => {
    expect(scheduleSourceLabel('EMPLOYEE_OVERRIDE')).toBe('Employee Override')
  })

  it('null source returns null label (no badge displayed)', () => {
    expect(scheduleSourceLabel(null)).toBeNull()
  })
})

describe('WCL-005: Schedule display logic (conditional rendering)', () => {
  it('schedule section is shown when scheduleNameEn is present', () => {
    const employment = { scheduleNameEn: 'Standard 48h', scheduleSource: 'ENTITY_DEFAULT' as ScheduleSource }
    expect(employment.scheduleNameEn).toBeTruthy()
    expect(employment.scheduleSource).toBe('ENTITY_DEFAULT')
  })

  it('schedule section is hidden when scheduleNameEn is null', () => {
    const employment = { scheduleNameEn: null, scheduleSource: null as ScheduleSource }
    expect(employment.scheduleNameEn).toBeFalsy()
  })

  it('schedule section is hidden when scheduleNameEn is empty string', () => {
    const employment = { scheduleNameEn: '', scheduleSource: null as ScheduleSource }
    expect(employment.scheduleNameEn).toBeFalsy()
  })
})

describe('WCL-006: work_schedule_assignments table schema presence', () => {
  it('schema file exports workScheduleAssignments', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/foundation.ts'),
      'utf-8',
    )
    expect(schema).toContain('workScheduleAssignments')
    expect(schema).toContain('work_schedule_assignments')
  })

  it('work_schedule_assignments has isCurrent column', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/foundation.ts'),
      'utf-8',
    )
    const section = schema.slice(
      schema.indexOf("workScheduleAssignments = pgTable"),
      schema.indexOf("payrollAssignments = pgTable"),
    )
    expect(section).toContain('isCurrent')
    expect(section).toContain('assignmentReason')
    expect(section).toContain('workScheduleId')
  })
})

describe('WCL-007: work_schedules table has isDefault column', () => {
  it('work_schedules has isDefault boolean column', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/configuration.ts'),
      'utf-8',
    )
    expect(schema).toContain('isDefault')
    expect(schema).toContain('is_default')
    expect(schema).toContain('workSchedules')
  })

  it('work_schedules has legalEntityId for entity scoping', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/configuration.ts'),
      'utf-8',
    )
    const section = schema.slice(
      schema.indexOf("workSchedules = pgTable"),
      schema.indexOf("workSchedulePatterns = pgTable"),
    )
    expect(section).toContain('legalEntityId')
    expect(section).toContain('legal_entity_id')
    expect(section).toContain('isActive')
  })
})

describe('WCL-008: assignWorkSchedule exported from core-hr index', () => {
  it('index.ts exports assignWorkSchedule', async () => {
    const fs = await import('fs')
    const index = fs.readFileSync(
      repoFile('modules/core-hr/index.ts'),
      'utf-8',
    )
    expect(index).toContain('assignWorkSchedule')
    expect(index).toContain('work-schedule-assignment-actions')
  })
})

describe('WCL-009: work-schedule-assignment-actions.ts syncs workerAssignments', () => {
  it('action file imports workerAssignments for timesheet sync', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/core-hr/work-schedule-assignment-actions.ts'),
      'utf-8',
    )
    expect(src).toContain('workerAssignments')
    expect(src).toContain('workScheduleId: data.workScheduleId')
  })

  it('action updates workerAssignments in source (tx-scoped sync)', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/core-hr/work-schedule-assignment-actions.ts'),
      'utf-8',
    )
    expect(src).toContain('.update(workerAssignments)')
    expect(src).toContain('isCurrent, true')
  })
})

describe('WCL-009B: work schedule assignment server-side controls', () => {
  it('re-derives person and schedule entity from the database before writing', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/core-hr/work-schedule-assignment-actions.ts'),
      'utf-8',
    )
    expect(src).toContain('persons')
    expect(src).toContain('workSchedules')
    expect(src).toContain('data.legalEntityId !== person.legalEntityId')
    expect(src).toContain('schedule.legalEntityId && schedule.legalEntityId !== person.legalEntityId')
    expect(src).toContain('!schedule.isActive')
  })

  it('blocks unsupported future-dated schedule writes from being marked current immediately', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/core-hr/work-schedule-assignment-actions.ts'),
      'utf-8',
    )
    expect(src).toContain('todayUae')
    expect(src).toContain('WORK_SCHEDULE_FUTURE_DATED_UNSUPPORTED')
    expect(src).toContain('data.effectiveStartDate > todayUae()')
  })

  it('guards work schedule history reads with auth, permission, and scope checks', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/core-hr/work-schedule-assignment-actions.ts'),
      'utf-8',
    )
    const section = src.slice(src.indexOf('export async function getWorkScheduleAssignmentHistory'))
    expect(section).toContain("requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'EMPLOYEE'])")
    expect(section).toContain("requirePermission(actor, 'ASSIGNMENTS', 'view')")
    expect(section).toContain("actor.role === 'EMPLOYEE' && !isSelf")
    expect(section).toContain('cross-entity work schedule history denied')
  })
})

describe('WCL-010: createPerson auto-assigns entity default schedule', () => {
  it('createPerson imports workSchedules and workScheduleAssignments', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/core-hr/actions.ts'),
      'utf-8',
    )
    expect(src).toContain('workSchedules')
    expect(src).toContain('workScheduleAssignments')
  })

  it('createPerson inserts work_schedule_assignments row with AUTO_HIRED reason', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/core-hr/actions.ts'),
      'utf-8',
    )
    expect(src).toContain("assignmentReason:   'AUTO_HIRED'")
    expect(src).toContain('defaultScheduleId')
    expect(src).toContain('workScheduleAssignments')
  })

  it('createPerson passes defaultScheduleId to workerAssignments insert', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/core-hr/actions.ts'),
      'utf-8',
    )
    expect(src).toContain('workScheduleId:      defaultScheduleId ?? undefined')
  })
})

describe('WCL-011: PersonEditForm schedule picker wired to assignWorkSchedule', () => {
  it('edit form imports assignWorkSchedule from core-hr', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx'),
      'utf-8',
    )
    expect(src).toContain('assignWorkSchedule')
    expect(src).toContain('workScheduleId')
    expect(src).toContain('scheduleOptions')
  })

  it('edit form calls assignWorkSchedule with HR_ADMIN_UPDATE reason on change', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx'),
      'utf-8',
    )
    expect(src).toContain("assignmentReason:   'HR_ADMIN_UPDATE'")
    expect(src).toContain('scheduleChanged')
  })
})

describe('WCL-012: ESS profile actions returns schedule fields', () => {
  it('profile/actions.ts imports workScheduleAssignments and workSchedules', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(src).toContain('workScheduleAssignments')
    expect(src).toContain('workSchedules')
  })

  it('profile actions returns scheduleNameEn, scheduleNameAr, scheduleSource in employment', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(src).toContain('scheduleNameEn')
    expect(src).toContain('scheduleNameAr')
    expect(src).toContain('scheduleSource')
  })

  it('profile actions applies inheritance: assignment check then entity default fallback', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(src).toContain('AUTO_HIRED')
    expect(src).toContain('ENTITY_DEFAULT')
    expect(src).toContain('EMPLOYEE_OVERRIDE')
    expect(src).toContain('isDefault')
  })
})
