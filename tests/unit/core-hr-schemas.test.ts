/**
 * QA-Audit-H5 — Zod schema cross-field refines.
 *
 * BR-CT-001/002, BR-PR-001, FR-CH-16 nationality routing — these are
 * enforced by .superRefine() blocks in the schemas. The Server Actions
 * trust that the schema parsed the payload, so a schema regression is a
 * real-world bug pathway.
 */
import { describe, it, expect } from 'vitest'
import {
  CreatePersonSchema,
  ASSIGNMENT_SENSITIVE_UPDATE_FIELDS,
  getAssignmentSensitiveUpdateFields,
} from '@/modules/core-hr/validations'
import { CreateContractSchema, AmendContractSchema } from '@/modules/core-hr/contracts/validations'

const validPerson = {
  firstNameEn: 'Sara',
  lastNameEn:  'Ahmed',
  fullNameAr:  'سارة أحمد',
  dateOfBirth: '1990-01-01',
  gender:      'FEMALE',
  nationalityCode:     'ARE',
  nationalityCategory: 'UAE_NATIONAL',
  legalEntityId:       '11111111-1111-1111-1111-111111111111',
  employmentType:      'FULL_TIME',
  hireDate:            '2026-01-01',
}

// ── CreatePersonSchema ────────────────────────────────────────────────────

describe('CreatePersonSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = CreatePersonSchema.safeParse(validPerson)
    expect(r.success).toBe(true)
  })

  it('rejects empty firstNameEn', () => {
    const r = CreatePersonSchema.safeParse({ ...validPerson, firstNameEn: '' })
    expect(r.success).toBe(false)
  })

  it('accepts missing fullNameAr (auto-translated by server action — FR-CH-15 enforced post-translation)', () => {
    // fullNameAr is now optional in the Zod schema so auto-translation can fill it.
    // The server action enforces the non-empty constraint after translateToArabic resolves.
    const { fullNameAr, ...rest } = validPerson as any
    const r = CreatePersonSchema.safeParse(rest)
    expect(r.success).toBe(true)
    // Default is empty string, not undefined
    if (r.success) expect(r.data.fullNameAr).toBe('')
  })

  it('rejects invalid Emirates ID format', () => {
    const r = CreatePersonSchema.safeParse({ ...validPerson, emiratesId: 'bogus' })
    expect(r.success).toBe(false)
  })

  it('accepts dashed Emirates ID format', () => {
    const r = CreatePersonSchema.safeParse({ ...validPerson, emiratesId: '784-1989-1234567-1' })
    expect(r.success).toBe(true)
  })

  it('accepts raw 15-digit Emirates ID format (QA-Audit-M7)', () => {
    const r = CreatePersonSchema.safeParse({ ...validPerson, emiratesId: '784198912345671' })
    expect(r.success).toBe(true)
  })

  it('BR-PR-001 rejects probationEndDate > 6 months past hireDate', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPerson,
      hireDate: '2026-01-01',
      probationEndDate: '2026-08-01', // 7 months
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes('BR-PR-001'))).toBe(true)
    }
  })

  it('BR-PR-001 accepts probation exactly 6 months from hireDate', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPerson,
      hireDate: '2026-01-01',
      probationEndDate: '2026-07-01', // exactly 6 months
    })
    expect(r.success).toBe(true)
  })

  it('rejects probationEndDate before hireDate', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPerson,
      hireDate: '2026-01-01',
      probationEndDate: '2025-12-01',
    })
    expect(r.success).toBe(false)
  })

  it('FR-CH-16 rejects UAE_NATIONAL with non-ARE nationality code', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPerson,
      nationalityCategory: 'UAE_NATIONAL',
      nationalityCode:     'GBR',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes('UAE_NATIONAL'))).toBe(true)
    }
  })

  it('FR-CH-16 accepts EXPAT with any nationality', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPerson,
      nationalityCategory: 'EXPAT',
      nationalityCode:     'IND',
    })
    expect(r.success).toBe(true)
  })

  it('rejects malformed UUID for legalEntityId', () => {
    const r = CreatePersonSchema.safeParse({ ...validPerson, legalEntityId: 'not-a-uuid' })
    expect(r.success).toBe(false)
  })
})

describe('assignment-sensitive person edit guard', () => {
  it('lists worker-assignment authority fields that generic person edit must not patch', () => {
    expect(ASSIGNMENT_SENSITIVE_UPDATE_FIELDS).toEqual([
      'assignmentStatus',
      'currentDepartmentId',
      'currentPositionId',
      'currentJobId',
      'currentGradeId',
      'currentLocationId',
      'lineManagerId',
      'dottedLineManagerId',
    ])
  })

  it('detects assignment-sensitive fields in a generic update payload', () => {
    expect(getAssignmentSensitiveUpdateFields({
      preferredName: 'Sam',
      currentDepartmentId: '11111111-1111-1111-1111-111111111111',
      lineManagerId: null,
    })).toEqual(['currentDepartmentId', 'lineManagerId'])
  })

  it('ignores non-assignment person profile fields', () => {
    expect(getAssignmentSensitiveUpdateFields({
      preferredName: 'Sam',
      workerCategory: 'FTE',
      employeeCode: 'E-100',
      noticePeriodDays: 30,
    })).toEqual([])
  })
})

// ── CreateContractSchema ──────────────────────────────────────────────────

const validContract = {
  personId:       '22222222-2222-2222-2222-222222222222',
  legalEntityId:  '11111111-1111-1111-1111-111111111111',
  employmentType: 'FULL_TIME' as const,
  startDate:      '2026-01-01',
  endDate:        '2027-01-01',
}

describe('CreateContractSchema', () => {
  it('accepts a 1-year fixed-term contract', () => {
    const r = CreateContractSchema.safeParse(validContract)
    expect(r.success).toBe(true)
  })

  it('BR-CT-002 rejects term > 3 years from startDate', () => {
    const r = CreateContractSchema.safeParse({
      ...validContract,
      startDate: '2026-01-01',
      endDate:   '2030-01-01', // 4 years
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes('BR-CT-002'))).toBe(true)
    }
  })

  it('BR-CT-002 accepts exactly 3-year term', () => {
    const r = CreateContractSchema.safeParse({
      ...validContract,
      startDate: '2026-01-01',
      endDate:   '2029-01-01',
    })
    expect(r.success).toBe(true)
  })

  it('rejects endDate before startDate', () => {
    const r = CreateContractSchema.safeParse({
      ...validContract,
      startDate: '2026-06-01',
      endDate:   '2026-01-01',
    })
    expect(r.success).toBe(false)
  })

  it('rejects endDate equal to startDate', () => {
    const r = CreateContractSchema.safeParse({
      ...validContract,
      startDate: '2026-01-01',
      endDate:   '2026-01-01',
    })
    expect(r.success).toBe(false)
  })

  it('BR-PR-001 rejects probationEnd > 6 months from startDate', () => {
    const r = CreateContractSchema.safeParse({
      ...validContract,
      probationEnd: '2026-08-15', // 7.5 months past 2026-01-01
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes('BR-PR-001'))).toBe(true)
    }
  })

  it('BR-PR-001 accepts probation exactly 6 months from startDate', () => {
    const r = CreateContractSchema.safeParse({
      ...validContract,
      probationEnd: '2026-07-01',
    })
    expect(r.success).toBe(true)
  })

  it('defaults contractType to FIXED_TERM (BR-CT-001)', () => {
    const r = CreateContractSchema.safeParse(validContract)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.contractType).toBe('FIXED_TERM')
  })

  it('rejects malformed startDate', () => {
    const r = CreateContractSchema.safeParse({ ...validContract, startDate: '01/01/2026' })
    expect(r.success).toBe(false)
  })
})

// ── AmendContractSchema ───────────────────────────────────────────────────

describe('AmendContractSchema', () => {
  it('accepts a minimal amendment', () => {
    const r = AmendContractSchema.safeParse({
      contractId:    '33333333-3333-3333-3333-333333333333',
      effectiveDate: '2026-06-01',
      reason:        'Salary review',
    })
    expect(r.success).toBe(true)
  })

  it('requires a non-empty reason', () => {
    const r = AmendContractSchema.safeParse({
      contractId:    '33333333-3333-3333-3333-333333333333',
      effectiveDate: '2026-06-01',
      reason:        '',
    })
    expect(r.success).toBe(false)
  })

  it('rejects malformed effectiveDate', () => {
    const r = AmendContractSchema.safeParse({
      contractId:    '33333333-3333-3333-3333-333333333333',
      effectiveDate: '2026/06/01',
      reason:        'Test',
    })
    expect(r.success).toBe(false)
  })

  it('accepts optional newWorkingHoursPerWeek within 1-48 range', () => {
    const r = AmendContractSchema.safeParse({
      contractId:    '33333333-3333-3333-3333-333333333333',
      effectiveDate: '2026-06-01',
      reason:        'Switch to part-time',
      newWorkingHoursPerWeek: 24,
    })
    expect(r.success).toBe(true)
  })

  it('rejects newWorkingHoursPerWeek > 48 (BR-WH-001)', () => {
    const r = AmendContractSchema.safeParse({
      contractId:    '33333333-3333-3333-3333-333333333333',
      effectiveDate: '2026-06-01',
      reason:        'Test',
      newWorkingHoursPerWeek: 60,
    })
    expect(r.success).toBe(false)
  })
})
