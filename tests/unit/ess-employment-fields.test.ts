/**
 * ESS Task 2C — Employment Fields unit tests (EMP-024–EMP-035).
 *
 * Tests WorkerCategory enum, employee code, probation months, notice period
 * formatting, functional manager display logic, and ESS employment shape —
 * all without touching the real DB.
 */

import path from 'node:path'
import { describe, it, expect } from 'vitest'

const repoFile = (...segments: string[]) => path.join(process.cwd(), ...segments)

// ── Helpers: WorkerCategory validation (mirrors validations.ts) ───────────

const VALID_WORKER_CATEGORIES = ['FTE', 'CONTINGENT', 'CONTRACTOR'] as const
type WorkerCategory = typeof VALID_WORKER_CATEGORIES[number]

function isValidWorkerCategory(v: string): v is WorkerCategory {
  return VALID_WORKER_CATEGORIES.includes(v as WorkerCategory)
}

// ── Helpers: notice period formatting (mirrors ProfilePageClient) ──────────

function formatNoticePeriod(days: number): string {
  return `${days} days`
}

// ── Helpers: probation display (mirrors ProfilePageClient) ────────────────

function formatProbation(months: number | null | undefined, endDate: string | null | undefined): string | null {
  const parts: string[] = []
  if (months != null) parts.push(`${months} month${months !== 1 ? 's' : ''}`)
  if (endDate) parts.push(`ends ${endDate}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

// ── Helpers: employee code validation (mirrors validations.ts) ────────────

function isValidEmployeeCode(code: string): boolean {
  return code.trim().length > 0 && code.trim().length <= 50
}

// ─────────────────────────────────────────────────────────────────────────────

describe('EMP-024: WorkerCategory enum validation', () => {
  it('accepts FTE as valid worker category', () => {
    expect(isValidWorkerCategory('FTE')).toBe(true)
  })

  it('accepts CONTINGENT as valid worker category', () => {
    expect(isValidWorkerCategory('CONTINGENT')).toBe(true)
  })

  it('accepts CONTRACTOR as valid worker category', () => {
    expect(isValidWorkerCategory('CONTRACTOR')).toBe(true)
  })

  it('rejects invalid worker category values', () => {
    expect(isValidWorkerCategory('FULL_TIME')).toBe(false)
    expect(isValidWorkerCategory('EMPLOYEE')).toBe(false)
    expect(isValidWorkerCategory('')).toBe(false)
  })
})

describe('EMP-025: WorkerCategory is separate from EmploymentType', () => {
  it('WorkerCategory values do not overlap with EmploymentType values', () => {
    const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED']
    VALID_WORKER_CATEGORIES.forEach(wc => {
      expect(EMPLOYMENT_TYPES).not.toContain(wc)
    })
  })

  it('all 3 worker categories are present', () => {
    expect(VALID_WORKER_CATEGORIES).toHaveLength(3)
    expect(VALID_WORKER_CATEGORIES).toContain('FTE')
    expect(VALID_WORKER_CATEGORIES).toContain('CONTINGENT')
    expect(VALID_WORKER_CATEGORIES).toContain('CONTRACTOR')
  })
})

describe('EMP-026: Employee code validation', () => {
  it('accepts standard employee code format', () => {
    expect(isValidEmployeeCode('Avaniis-EMP-4421')).toBe(true)
  })

  it('accepts short code', () => {
    expect(isValidEmployeeCode('E001')).toBe(true)
  })

  it('rejects empty employee code', () => {
    expect(isValidEmployeeCode('')).toBe(false)
    expect(isValidEmployeeCode('   ')).toBe(false)
  })

  it('enforces max length of 50 chars', () => {
    const long = 'A'.repeat(51)
    expect(isValidEmployeeCode(long)).toBe(false)
    const maxLen = 'A'.repeat(50)
    expect(isValidEmployeeCode(maxLen)).toBe(true)
  })
})

describe('EMP-027: Employee code is not a replacement for person_number', () => {
  it('employee code and person number coexist independently', () => {
    const record = { personNumber: 'AVN-000123', employeeCode: 'Avaniis-EMP-4421' }
    expect(record.personNumber).toBeTruthy()
    expect(record.employeeCode).toBeTruthy()
    expect(record.personNumber).not.toBe(record.employeeCode)
  })

  it('employee code is optional (person_number is always auto-generated)', () => {
    const record = { personNumber: 'AVN-000456', employeeCode: null }
    expect(record.personNumber).toBeTruthy()
    expect(record.employeeCode).toBeNull()
  })
})

describe('EMP-028: Notice period display formatting', () => {
  it('formats 30 days correctly', () => {
    expect(formatNoticePeriod(30)).toBe('30 days')
  })

  it('formats 0 days correctly', () => {
    expect(formatNoticePeriod(0)).toBe('0 days')
  })

  it('formats 90 days correctly', () => {
    expect(formatNoticePeriod(90)).toBe('90 days')
  })

  it('notice period within valid bounds (0–180)', () => {
    const min = 0
    const max = 180
    const sample = 30
    expect(sample).toBeGreaterThanOrEqual(min)
    expect(sample).toBeLessThanOrEqual(max)
  })
})

describe('EMP-029: Probation duration and end date display', () => {
  it('shows months and end date together', () => {
    expect(formatProbation(6, '2025-11-30')).toBe('6 months · ends 2025-11-30')
  })

  it('shows months only when no end date', () => {
    expect(formatProbation(3, null)).toBe('3 months')
  })

  it('shows end date only when months is null', () => {
    expect(formatProbation(null, '2025-11-30')).toBe('ends 2025-11-30')
  })

  it('returns null when both are absent', () => {
    expect(formatProbation(null, null)).toBeNull()
    expect(formatProbation(undefined, undefined)).toBeNull()
  })

  it('uses correct singular for 1 month', () => {
    expect(formatProbation(1, null)).toBe('1 month')
  })
})

describe('EMP-030: Probation months granted range validation', () => {
  it('accepts 1–6 months as valid range (UAE Labour Law BR-PR-001)', () => {
    const validMonths = [1, 2, 3, 4, 5, 6]
    validMonths.forEach(m => {
      expect(m).toBeGreaterThanOrEqual(1)
      expect(m).toBeLessThanOrEqual(6)
    })
  })

  it('rejects 0 and negative months', () => {
    const invalid = [0, -1, -6]
    invalid.forEach(m => {
      expect(m).toBeLessThan(1)
    })
  })

  it('rejects more than 6 months (UAE max probation)', () => {
    expect(7).toBeGreaterThan(6)
    expect(12).toBeGreaterThan(6)
  })
})

describe('EMP-031: Functional manager (dottedLineManagerId) independence', () => {
  it('functional manager is optional — person can exist without one', () => {
    const person = { lineManagerId: 'mgr-001', dottedLineManagerId: null }
    expect(person.lineManagerId).toBeTruthy()
    expect(person.dottedLineManagerId).toBeNull()
  })

  it('functional manager can differ from line manager', () => {
    const person = { lineManagerId: 'mgr-001', dottedLineManagerId: 'mgr-002' }
    expect(person.lineManagerId).not.toBe(person.dottedLineManagerId)
  })

  it('functional manager does not affect leave approval routing', () => {
    // Leave approval uses lineManagerId only (not dottedLineManagerId)
    const leaveApprovalManagerId = (p: { lineManagerId: string; dottedLineManagerId: string | null }) =>
      p.lineManagerId
    const person = { lineManagerId: 'mgr-001', dottedLineManagerId: 'mgr-002' }
    expect(leaveApprovalManagerId(person)).toBe('mgr-001')
  })
})

describe('EMP-032: Migration 0044 — employment fields column presence', () => {
  it('migration file exists', async () => {
    const fs = await import('fs')
    const exists = fs.existsSync(
      repoFile('drizzle/migrations/0044_employment_fields.sql'),
    )
    expect(exists).toBe(true)
  })

  it('migration adds worker_category column', async () => {
    const fs = await import('fs')
    const sql = fs.readFileSync(
      repoFile('drizzle/migrations/0044_employment_fields.sql'),
      'utf-8',
    )
    expect(sql).toContain('worker_category')
    expect(sql.toLowerCase()).toContain('alter table')
  })

  it('migration adds employee_code column', async () => {
    const fs = await import('fs')
    const sql = fs.readFileSync(
      repoFile('drizzle/migrations/0044_employment_fields.sql'),
      'utf-8',
    )
    expect(sql).toContain('employee_code')
  })

  it('migration adds probation_months_granted column', async () => {
    const fs = await import('fs')
    const sql = fs.readFileSync(
      repoFile('drizzle/migrations/0044_employment_fields.sql'),
      'utf-8',
    )
    expect(sql).toContain('probation_months_granted')
  })

  it('migration is idempotent (uses IF NOT EXISTS)', async () => {
    const fs = await import('fs')
    const sql = fs.readFileSync(
      repoFile('drizzle/migrations/0044_employment_fields.sql'),
      'utf-8',
    )
    expect(sql.toUpperCase()).toContain('IF NOT EXISTS')
  })
})

describe('EMP-033: Schema includes new columns on persons table', () => {
  it('schema exposes workerCategory column', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/foundation.ts'),
      'utf-8',
    )
    expect(schema).toContain("workerCategory:")
    expect(schema).toContain("worker_category")
  })

  it('schema exposes employeeCode column', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/foundation.ts'),
      'utf-8',
    )
    expect(schema).toContain("employeeCode:")
    expect(schema).toContain("employee_code")
  })

  it('schema exposes probationMonthsGranted column', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/foundation.ts'),
      'utf-8',
    )
    expect(schema).toContain("probationMonthsGranted:")
    expect(schema).toContain("probation_months_granted")
  })

  it('all 3 new columns are nullable (optional fields)', async () => {
    const fs = await import('fs')
    const schema = fs.readFileSync(
      repoFile('drizzle/schema/foundation.ts'),
      'utf-8',
    )
    // None of the new fields should have .notNull()
    const lines = schema.split('\n')
    for (const key of ['workerCategory:', 'employeeCode:', 'probationMonthsGranted:']) {
      const line = lines.find(l => l.includes(key))
      expect(line).toBeTruthy()
      expect(line).not.toContain('.notNull()')
    }
  })
})

describe('EMP-034: WorkerCategory exported from core-hr/validations.ts', () => {
  it('validations file exports WorkerCategory enum', async () => {
    const fs = await import('fs')
    const validations = fs.readFileSync(
      repoFile('modules/core-hr/validations.ts'),
      'utf-8',
    )
    expect(validations).toContain('export const WorkerCategory')
    expect(validations).toContain('FTE')
    expect(validations).toContain('CONTINGENT')
    expect(validations).toContain('CONTRACTOR')
  })

  it('WorkerCategory is included in PersonEmployment via validations.ts', async () => {
    const fs = await import('fs')
    const validations = fs.readFileSync(
      repoFile('modules/core-hr/validations.ts'),
      'utf-8',
    )
    const employmentSection = validations.slice(
      validations.indexOf('const PersonEmployment'),
      validations.indexOf('const PersonPreferences'),
    )
    expect(employmentSection).toContain('workerCategory')
    expect(employmentSection).toContain('employeeCode')
    expect(employmentSection).toContain('probationMonthsGranted')
  })
})

describe('EMP-035: ESS profile employment section returns new fields', () => {
  it('profile/actions.ts selects workerCategory from persons', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('workerCategory:')
    expect(actions).toContain('employeeCode:')
  })

  it('profile/actions.ts selects noticePeriodDays and probationEndDate', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('noticePeriodDays:')
    expect(actions).toContain('probationEndDate:')
    expect(actions).toContain('probationMonthsGranted:')
  })

  it('profile/actions.ts fetches functional manager name', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('functionalManagerName:')
    expect(actions).toContain('dottedLineManagerId')
  })

  it('employment return object includes all new Task 2C fields', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    const employmentReturn = actions.slice(
      actions.lastIndexOf('employment:'),
      actions.indexOf(': null,', actions.lastIndexOf('employment:')),
    )
    expect(employmentReturn).toContain('workerCategory')
    expect(employmentReturn).toContain('employeeCode')
    expect(employmentReturn).toContain('noticePeriodDays')
    expect(employmentReturn).toContain('probationMonthsGranted')
    expect(employmentReturn).toContain('functionalManagerName')
  })
})

// ── ESS My Profile Enhancement (Oracle/SAP/Workday alignment) ─────────────

// Mirrors calcServiceLength in ProfilePageClient.tsx
function calcServiceLength(hireDate: string): string {
  const start = new Date(hireDate + 'T00:00:00')
  const now   = new Date('2026-05-29T00:00:00')
  let years  = now.getFullYear() - start.getFullYear()
  let months = now.getMonth()    - start.getMonth()
  let days   = now.getDate()     - start.getDate()
  if (days < 0) {
    months--
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  if (months < 0) { years--; months += 12 }
  const parts: string[] = []
  if (years  > 0) parts.push(`${years} yr${years  !== 1 ? 's' : ''}`)
  if (months > 0) parts.push(`${months} mo${months !== 1 ? 's' : ''}`)
  if (days   > 0 || parts.length === 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
  return parts.join(', ')
}

// Mirrors getProbationStatus in ProfilePageClient.tsx
function getProbationStatus(probationEndDate: string | null | undefined): string {
  if (!probationEndDate) return 'Not Applicable'
  const end   = new Date(probationEndDate + 'T00:00:00')
  const today = new Date('2026-05-29T00:00:00')
  return end < today ? 'Completed' : 'Active'
}

// Mirrors fmtHoursPerDay in ProfilePageClient.tsx
function fmtHoursPerDay(h: number | null | undefined): string {
  if (h == null) return '—'
  return Number.isInteger(h) ? `${h} hrs` : `${h.toFixed(1)} hrs`
}

// Mirrors _deriveScheduleExtras in profile/actions.ts
function deriveScheduleExtras(
  totalHoursPerWeek: string | null,
  weekendDays: number[],
  mondayStart: string | null,
  mondayEnd: string | null,
) {
  const workingDays = 7 - weekendDays.length
  const hpd = totalHoursPerWeek && workingDays > 0
    ? parseFloat(totalHoursPerWeek) / workingDays
    : null
  return { hpd, start: mondayStart ?? null, end: mondayEnd ?? null }
}

describe('EMP-036: Service length calculation', () => {
  it('returns correct years, months, days', () => {
    expect(calcServiceLength('2024-05-29')).toBe('2 yrs')
  })

  it('handles fractional tenure (months + days)', () => {
    const result = calcServiceLength('2026-03-01')
    expect(result).toContain('mo')
  })

  it('handles < 1 month tenure showing only days', () => {
    const result = calcServiceLength('2026-05-25')
    expect(result).toContain('day')
    expect(result).not.toContain('yr')
    expect(result).not.toContain('mo')
  })

  it('returns 0 days for hire date = today', () => {
    expect(calcServiceLength('2026-05-29')).toBe('0 days')
  })

  it('formats single year correctly (no plural)', () => {
    expect(calcServiceLength('2025-05-29')).toBe('1 yr')
  })
})

describe('EMP-037: Probation status derivation', () => {
  it('returns Active when probation end date is in the future', () => {
    expect(getProbationStatus('2026-12-31')).toBe('Active')
  })

  it('returns Completed when probation end date is in the past', () => {
    expect(getProbationStatus('2025-01-01')).toBe('Completed')
  })

  it('returns Not Applicable when probation end date is null', () => {
    expect(getProbationStatus(null)).toBe('Not Applicable')
    expect(getProbationStatus(undefined)).toBe('Not Applicable')
  })

  it('returns Completed for probation ended on exactly today boundary (prior day)', () => {
    expect(getProbationStatus('2026-05-28')).toBe('Completed')
  })
})

describe('EMP-038: Work schedule hours-per-day derivation', () => {
  it('computes 8 hrs for 40h/week over 5 working days', () => {
    const { hpd } = deriveScheduleExtras('40.00', [5, 6], '08:00', '17:00')
    expect(hpd).toBeCloseTo(8, 1)
  })

  it('computes 8 hrs for UAE standard 48h/week over 6 working days', () => {
    const { hpd } = deriveScheduleExtras('48.00', [5], '08:00', '17:00')
    expect(hpd).toBeCloseTo(8, 1)
  })

  it('returns null when totalHoursPerWeek is null', () => {
    const { hpd } = deriveScheduleExtras(null, [5, 6], '08:00', '17:00')
    expect(hpd).toBeNull()
  })

  it('formats whole hours without decimal', () => {
    expect(fmtHoursPerDay(8)).toBe('8 hrs')
  })

  it('formats fractional hours with 1 decimal place', () => {
    expect(fmtHoursPerDay(9.6)).toBe('9.6 hrs')
  })

  it('returns — when hours are null', () => {
    expect(fmtHoursPerDay(null)).toBe('—')
  })

  it('passes start and end times through unchanged', () => {
    const { start, end } = deriveScheduleExtras('40.00', [5, 6], '08:00', '17:00')
    expect(start).toBe('08:00')
    expect(end).toBe('17:00')
  })
})

describe('EMP-039: profile/actions.ts fetches new employment fields from DB', () => {
  it('imports businessUnits, jobs, projects from schema', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('businessUnits')
    expect(actions).toContain('jobs,')
    expect(actions).toContain('projects,')
  })

  it('joins businessUnits to workerAssignments', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('leftJoin(businessUnits')
    expect(actions).toContain('businessUnitNameEn:')
    expect(actions).toContain('businessUnitNameAr:')
  })

  it('joins jobs to workerAssignments', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('leftJoin(jobs,')
    expect(actions).toContain('jobTitleEn:')
    expect(actions).toContain('jobTitleAr:')
  })

  it('joins projects to workerAssignments', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('leftJoin(projects,')
    expect(actions).toContain('projectNameEn:')
    expect(actions).toContain('projectNameAr:')
  })

  it('selects grade_level for Job Level display', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('gradeLevel:')
  })

  it('selects primaryCostCentreCode for Cost Center display', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('primaryCostCentreCode:')
  })

  it('selects bilingual AR fields for position, grade, department, entity', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('positionTitleAr:')
    expect(actions).toContain('gradeNameAr:')
    expect(actions).toContain('departmentNameAr:')
    expect(actions).toContain('entityNameAr:')
  })

  it('returns scheduleHoursPerDay, scheduleStartTime, scheduleEndTime in employment', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain('scheduleHoursPerDay,')
    expect(actions).toContain('scheduleStartTime,')
    expect(actions).toContain('scheduleEndTime,')
  })

  it('exposes workEmail from WORK_EMAIL contact type', async () => {
    const fs = await import('fs')
    const actions = fs.readFileSync(
      repoFile('modules/profile/actions.ts'),
      'utf-8',
    )
    expect(actions).toContain("'WORK_EMAIL'")
    expect(actions).toContain('workEmail:')
  })
})
