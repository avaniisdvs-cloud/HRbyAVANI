import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const SENTINEL_COLUMNS = [
  ['worker_assignments', 'effective_end_date'],
  ['salary_elements', 'effective_end_date'],
  ['payroll_assignments', 'effective_end_date'],
  ['work_schedule_assignments', 'effective_end_date'],
  ['leave_plan_enrolments', 'effective_end_date'],
  ['grade_history', 'valid_to'],
  ['department_history', 'valid_to'],
  ['location_history', 'valid_to'],
  ['job_history', 'valid_to'],
  ['position_history', 'valid_to'],
] as const

describe('Phase 1 Step 2 sentinel effective dating', () => {
  it('backfills and defaults only approved sentinel columns in migration 0063', () => {
    const migration = read('drizzle/migrations/0063_effective_dating_integrity.sql')
    for (const [table, column] of SENTINEL_COLUMNS) {
      expect(migration).toContain(`UPDATE ${table}`)
      expect(migration).toContain(`SET ${column} = DATE '9999-12-31'`)
      expect(migration).toContain(`ALTER TABLE ${table}`)
      expect(migration).toContain(`ALTER COLUMN ${column} SET DEFAULT DATE '9999-12-31'`)
    }
    expect(migration).not.toContain('ALTER TABLE contracts')
    expect(migration).not.toContain('SET NOT NULL')
    expect(migration).not.toMatch(/UNIQUE\s*\(/i)
  })

  it('writes sentinel end dates in approved open-row creation paths', () => {
    const constantFiles = [
      'modules/core-hr/worker-assignments/services.ts',
      'modules/core-hr/bulk-import/import-engine.ts',
      'modules/payroll/payroll-assignment-actions.ts',
      'modules/core-hr/work-schedule-assignment-actions.ts',
      'modules/absence/leave-plan-enrolment-actions.ts',
      'lib/mdm-history.ts',
    ]
    for (const file of constantFiles) {
      expect(read(file), file).toContain('EFFECTIVE_END_OF_TIME')
    }
    expect(read('modules/payroll/actions.ts')).toContain('normalizeEffectiveEndDate')
  })



  it('adds only the approved Step 3 date-order check constraints', () => {
    const migration = read('drizzle/migrations/0063_effective_dating_integrity.sql')
    const effectiveTables = [
      'worker_assignments',
      'salary_elements',
      'payroll_assignments',
      'work_schedule_assignments',
      'leave_plan_enrolments',
    ]
    for (const table of effectiveTables) {
      expect(migration).toContain(`ADD CONSTRAINT chk_${table}_date_order`)
      expect(migration).toContain('CHECK (effective_start_date <= effective_end_date)')
    }

    const historyTables = [
      'grade_history',
      'department_history',
      'location_history',
      'job_history',
      'position_history',
    ]
    for (const table of historyTables) {
      expect(migration).toContain(`ADD CONSTRAINT chk_${table}_date_order`)
      expect(migration).toContain('CHECK (valid_from <= valid_to)')
    }

    expect(migration).not.toContain('chk_contracts_date_order')
    expect(migration).not.toMatch(/UNIQUE\s*\(/i)
    expect(migration).not.toContain('SET NOT NULL')
  })



  it('adds only the approved Step 4 overlap-prevention exclusion constraints', () => {
    const migration = read('drizzle/migrations/0063_effective_dating_integrity.sql')
    const expected = [
      ['worker_assignments', ['tenant_id', 'person_id'], 'effective_start_date', 'effective_end_date'],
      ['salary_elements', ['tenant_id', 'person_id', 'assignment_id', 'payroll_id', 'element_code'], 'effective_start_date', 'effective_end_date'],
      ['payroll_assignments', ['tenant_id', 'person_id'], 'effective_start_date', 'effective_end_date'],
      ['work_schedule_assignments', ['tenant_id', 'person_id'], 'effective_start_date', 'effective_end_date'],
      ['leave_plan_enrolments', ['tenant_id', 'person_id', 'absence_plan_id'], 'effective_start_date', 'effective_end_date'],
      ['grade_history', ['tenant_id', 'grade_id'], 'valid_from', 'valid_to'],
      ['department_history', ['tenant_id', 'department_id'], 'valid_from', 'valid_to'],
      ['location_history', ['tenant_id', 'location_id'], 'valid_from', 'valid_to'],
      ['job_history', ['tenant_id', 'job_id'], 'valid_from', 'valid_to'],
      ['position_history', ['tenant_id', 'position_id'], 'valid_from', 'valid_to'],
    ] as const

    for (const [table, keys, start, end] of expected) {
      expect(migration).toContain(`ADD CONSTRAINT excl_${table}_no_overlap`)
      expect(migration).toContain('EXCLUDE USING gist')
      for (const key of keys) expect(migration).toContain(`${key} WITH =`)
      expect(migration).toContain(`daterange(${start}, ${end}, '[]') WITH &&`)
    }

    expect(migration).not.toContain('ALTER TABLE contracts')
    expect(migration).not.toContain('excl_contracts_no_overlap')
    expect(migration).not.toContain('SET NOT NULL')
  })



  it('adds only the approved Step 5 one-current partial unique indexes', () => {
    const migration = read('drizzle/migrations/0063_effective_dating_integrity.sql')
    const expected = [
      ['worker_assignments', '(tenant_id, person_id)'],
      ['payroll_assignments', '(tenant_id, person_id)'],
      ['work_schedule_assignments', '(tenant_id, person_id)'],
      ['leave_plan_enrolments', '(tenant_id, person_id, absence_plan_id)'],
      ['grade_history', '(tenant_id, grade_id)'],
      ['department_history', '(tenant_id, department_id)'],
      ['location_history', '(tenant_id, location_id)'],
      ['job_history', '(tenant_id, job_id)'],
      ['position_history', '(tenant_id, position_id)'],
    ] as const

    for (const [table, key] of expected) {
      expect(migration).toContain(`CREATE UNIQUE INDEX uq_${table}_one_current`)
      expect(migration).toContain(`ON ${table} ${key}`)
      expect(migration).toContain('WHERE is_current = true')
    }

    expect(migration).not.toContain('uq_salary_elements_one_current')
    expect(migration).not.toContain('uq_contracts_one_current')
    expect(migration).not.toContain('ALTER TABLE contracts')
    expect(migration).not.toContain('SET NOT NULL')
  })



  it('adds only the approved Step 6 temporal as-of lookup indexes', () => {
    const migration = read('drizzle/migrations/0063_effective_dating_integrity.sql')
    const expected = [
      ['worker_assignments', '(tenant_id, person_id, effective_start_date DESC, effective_end_date)'],
      ['salary_elements', '(tenant_id, person_id, assignment_id, payroll_id, element_code, effective_start_date DESC, effective_end_date)'],
      ['payroll_assignments', '(tenant_id, person_id, effective_start_date DESC, effective_end_date)'],
      ['work_schedule_assignments', '(tenant_id, person_id, effective_start_date DESC, effective_end_date)'],
      ['leave_plan_enrolments', '(tenant_id, person_id, absence_plan_id, effective_start_date DESC, effective_end_date)'],
      ['grade_history', '(tenant_id, grade_id, valid_from DESC, valid_to)'],
      ['department_history', '(tenant_id, department_id, valid_from DESC, valid_to)'],
      ['location_history', '(tenant_id, location_id, valid_from DESC, valid_to)'],
      ['job_history', '(tenant_id, job_id, valid_from DESC, valid_to)'],
      ['position_history', '(tenant_id, position_id, valid_from DESC, valid_to)'],
    ] as const

    for (const [table, key] of expected) {
      expect(migration).toContain(`CREATE INDEX idx_${table}_asof`)
      expect(migration).toContain(`ON ${table} ${key}`)
    }

    expect(migration).not.toContain('idx_contracts_asof')
    expect(migration).not.toContain('CREATE UNIQUE INDEX idx_')
    expect(migration).not.toContain('SET NOT NULL')
  })

  it('keeps schema defaults aligned with the Step 2 sentinel columns', () => {
    const schema = read('drizzle/schema/foundation.ts')
    expect(schema.match(/effectiveEndDate:\s+date\('effective_end_date'\)\.default\('9999-12-31'\)/g)?.length).toBe(5)
    expect(schema.match(/validTo:\s+date\('valid_to'\)\.default\('9999-12-31'\)/g)?.length).toBe(5)
  })
})
