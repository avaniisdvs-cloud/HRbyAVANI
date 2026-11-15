/**
 * core-hr Zod validators.
 * Every Server Action input MUST be validated by a schema declared here
 * (Hard Rule 5: auth → Zod validate → BR rules → tx + audit).
 *
 * Bilingual fields enforce EN+AR per FR-CH-15 / Hard Rule 4.
 */
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

// ── Format validators (FR-CH-13, FR-CH-14, BR-WPS-004) ─────────────────────

// Emirates ID — accepts BOTH the dashed printed form and the raw 15-digit
// NFC-read form (QA-Audit-M7). Use `normalizeEmiratesId` before persistence
// so DB always sees the canonical dashed form.
export const EMIRATES_ID_REGEX = /^(?:784-\d{4}-\d{7}-\d{1}|784\d{12})$/
// UAE IBAN: AE + 21 digits = 23 chars total (BR-WPS-004)
export const UAE_IBAN_REGEX    = /^AE\d{21}$/
// ISO 3166-1 alpha-3 country code, e.g. ARE
export const ISO_COUNTRY_REGEX = /^[A-Z]{3}$/

/**
 * Normalize a UAE Emirates ID to the canonical dashed form
 * `784-XXXX-XXXXXXX-X`. Accepts dashed or raw 15-digit input. Throws on
 * invalid format.
 */
export function normalizeEmiratesId(value: string): string {
  const cleaned = value.trim()
  if (/^784-\d{4}-\d{7}-\d{1}$/.test(cleaned)) return cleaned
  if (/^784\d{12}$/.test(cleaned)) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 14)}-${cleaned.slice(14, 15)}`
  }
  throw new Error('BR-EID-001: Emirates ID must match 784-XXXX-XXXXXXX-X or 784XXXXXXXXXXXX')
}

// ── Enums (kept aligned with persons schema) ───────────────────────────────

export const Gender              = z.enum(['MALE', 'FEMALE', 'NOT_SPECIFIED'])
export const MaritalStatus       = z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'NOT_SPECIFIED'])
export const NationalityCategory = z.enum(['UAE_NATIONAL', 'GCC_NATIONAL', 'EXPAT'])
export const EmploymentType      = z.enum([
  'FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED',
])
export const AssignmentStatus = z.enum([
  'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'RETIRED', 'DECEASED',
  'PENDING_HIRE', 'PENDING_APPROVAL',
])
export const VisaStatus       = z.enum(['VALID', 'EXPIRING', 'EXPIRED', 'CANCELLED'])
// Blood type — 8 ABO+Rh values; stored as code, displayed with +/- suffix
export const BloodType        = z.enum(['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'])
// Worker classification — separate axis from employment_type (work arrangement)
export const WorkerCategory   = z.enum(['FTE', 'CONTINGENT', 'CONTRACTOR'])

// ── Composable sections ────────────────────────────────────────────────────

const PersonIdentity = z.object({
  firstNameEn:  z.string().trim().min(1).max(100),
  middleNameEn: z.string().trim().max(100).optional(),
  lastNameEn:   z.string().trim().min(1).max(100),
  // FR-CH-15: AR full name mandatory for UAE-based persons.
  // Auto-translation fills this when the user omits it; the server action
  // enforces the non-empty constraint after translation resolves.
  fullNameAr:    z.string().trim().max(300).default(''),
  preferredName: z.string().trim().max(100).optional(),
  salutation:    z.string().trim().max(20).optional(),
  dateOfBirth:   hrDateString().describe('date_of_birth must be YYYY-MM-DD'),
  gender:        Gender,
  maritalStatus:      MaritalStatus.optional(),
  numberOfDependents: z.number().int().min(0).max(20).default(0),
})

const PersonNationality = z.object({
  nationalityCode:      z.string().regex(ISO_COUNTRY_REGEX, 'ISO 3166-1 alpha-3'),
  nationalityCategory:  NationalityCategory,
  religion:             z.string().max(50).optional(),
  religionConsentGiven: z.boolean().default(false),
  // PDPL-sensitive — only store when sensitiveDataConsent=true (server-side gate)
  bloodType:            BloodType.optional().nullable(),
})

const PersonPii = z.object({
  // EID format checked here BEFORE encryption — the encrypted ciphertext
  // never round-trips through this validator (it lives in DB only).
  emiratesId:        z.string().regex(EMIRATES_ID_REGEX, 'BR-EID-001 format 784-XXXX-XXXXXXX-X').optional(),
  emiratesIdExpiry:  hrDateString().optional(),
  passportNumber:    z.string().trim().min(6).max(20).optional(),
  passportCountry:   z.string().regex(ISO_COUNTRY_REGEX).optional(),
  passportIssueDate: hrDateString().optional(),
  passportExpiry:    hrDateString().optional(),
  visaNumber:    z.string().trim().max(30).optional(),
  visaType:      z.string().trim().max(50).optional(),
  visaIssueDate: hrDateString().optional(),
  visaExpiry:    hrDateString().optional(),
  visaStatus:    VisaStatus.optional(),
  labourCardNumber:        z.string().trim().max(50).optional(),
  labourCardExpiry:        hrDateString().optional(),
  mohreLabourPermitNumber: z.string().trim().max(50).optional(),
  familyBookNumber:        z.string().trim().max(50).optional(),
  nafisRegistrationNumber: z.string().trim().max(50).optional(),
})

const PersonEmployment = z.object({
  legalEntityId:          z.string().uuid(),
  employmentType:         EmploymentType,
  contractedHoursPerWeek: z.number().min(1).max(48).default(48),
  assignmentStatus:       AssignmentStatus.default('PENDING_HIRE'),
  hireDate:         hrDateString(),
  seniorityDate:    hrDateString().optional(),
  originalHireDate: hrDateString().optional(),
  // BR-PR-001 — max 6 months from hire; cross-field check below
  probationEndDate:    hrDateString().optional(),
  noticePeriodDays:    z.number().int().min(0).max(180).default(30),
  // Initial pointers — when the contract + worker_assignment land (S3-04/05),
  // these are kept in sync. For createPerson, all are optional.
  currentDepartmentId: z.string().uuid().optional(),
  currentPositionId:   z.string().uuid().optional(),
  currentJobId:        z.string().uuid().optional(),
  currentLocationId:   z.string().uuid().optional(),
  currentGradeId:      z.string().uuid().optional(),
  lineManagerId:        z.string().uuid().optional(),
  dottedLineManagerId:  z.string().uuid().optional(),
  hrRepresentativeId:   z.string().uuid().optional(),
  projectId:            z.string().uuid().optional(),
  allocationPercentage: z.number().min(0).max(100).optional(),
  // Task 2C — new employment classification fields
  workerCategory:          WorkerCategory.optional().nullable(),
  employeeCode:            z.string().trim().max(50).optional().nullable(),
  probationMonthsGranted:  z.number().int().min(1).max(6).optional().nullable(),
})

const PersonPreferences = z.object({
  preferredLanguage:   z.enum(['en', 'ar']).default('en'),
  notificationChannel: z.enum(['EMAIL', 'PUSH', 'PUSH_AND_EMAIL', 'NONE']).default('PUSH_AND_EMAIL'),
})

// ── createPerson input ─────────────────────────────────────────────────────

export const CreatePersonSchema = PersonIdentity
  .merge(PersonNationality)
  .merge(PersonPii)
  .merge(PersonEmployment)
  .merge(PersonPreferences)
  .extend({
    // Custom-field bag (Configuration Framework §3) — validated separately
    // against custom_field_definitions in services.ts (Sprint 4 hardening).
    extraData: z.record(z.string(), z.unknown()).default({}),
    // GAP-C04: PDPL consent — required at point of data collection
    // UAE PDPL Article 11: employment contract = legal basis; explicit consent for sensitive data
    pdplConsentGiven:     z.boolean().default(false),
    sensitiveDataConsent: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // BR-PR-001 — probationEndDate must not exceed hireDate + 6 months
    if (data.probationEndDate) {
      const hire = new Date(data.hireDate)
      const probEnd = new Date(data.probationEndDate)
      const sixMonths = new Date(hire)
      sixMonths.setMonth(sixMonths.getMonth() + 6)
      if (probEnd > sixMonths) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['probationEndDate'],
          message: 'BR-PR-001: probation period exceeds 6 months · BR-PR-001: فترة الاختبار تتجاوز 6 أشهر',
        })
      }
      if (probEnd < hire) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['probationEndDate'],
          message: 'probationEndDate cannot precede hireDate · لا يمكن أن يسبق تاريخ انتهاء الاختبار تاريخ التعيين',
        })
      }
    }
    // FR-CH-16: nationalityCategory=UAE_NATIONAL implies nationalityCode=ARE.
    if (data.nationalityCategory === 'UAE_NATIONAL' && data.nationalityCode !== 'ARE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nationalityCategory'],
        message: 'UAE_NATIONAL requires nationalityCode=ARE',
      })
    }
    // BR-EOSB-004 routing flag: a person flagged UAE_NATIONAL without a
    // family_book_number is allowed but warned downstream — not a hard error.
  })

export type CreatePersonInput = z.infer<typeof CreatePersonSchema>

// ── updatePerson input ─────────────────────────────────────────────────────
export const UpdatePersonSchema = PersonIdentity.partial()
  .merge(PersonNationality.partial())
  .merge(PersonPii.partial())
  .merge(PersonPreferences.partial())
  .extend({
    extraData: z.record(z.string(), z.unknown()).optional(),
    // Insurance — purely admin-managed, kept here for HR_ADMIN updates.
    insuranceCardNumber:   z.string().max(100).optional(),
    insuranceMemberId:     z.string().max(100).optional(),
    insuranceProviderName: z.string().max(200).optional(),
    insuranceNetwork:      z.string().max(100).optional(),
    insuranceCategory:     z.string().max(50).optional(),
    insuranceEffectiveDate: hrDateString().optional(),
    insuranceExpiryDate:    hrDateString().optional(),
    insuranceStatus: z.enum([
      'ENROLLED', 'PENDING_ENROLMENT', 'RENEWAL_DUE', 'EXPIRED', 'CANCELLED', 'NOT_ENROLLED',
    ]).optional(),
    // Employment snapshot (denormalised on persons row — direct admin override).
    assignmentStatus:       z.string().optional(),
    currentDepartmentId:    z.string().uuid().optional().nullable(),
    currentPositionId:      z.string().uuid().optional().nullable(),
    currentGradeId:         z.string().uuid().optional().nullable(),
    currentLocationId:      z.string().uuid().optional().nullable(),
    lineManagerId:          z.string().uuid().optional().nullable(),
    // Task 2C — employment fields now editable via UpdatePersonSchema
    workerCategory:          WorkerCategory.optional().nullable(),
    employeeCode:            z.string().trim().max(50).optional().nullable(),
    currentJobId:            z.string().uuid().optional().nullable(),
    dottedLineManagerId:     z.string().uuid().optional().nullable(),
    noticePeriodDays:        z.number().int().min(0).max(180).optional(),
    probationMonthsGranted:  z.number().int().min(1).max(6).optional().nullable(),
  })

export type UpdatePersonInput = z.infer<typeof UpdatePersonSchema>

// Assignment-sensitive fields are effective-dated in worker_assignments and
// must not be patched directly through generic person edit actions.
export const ASSIGNMENT_SENSITIVE_UPDATE_FIELDS = [
  'assignmentStatus',
  'currentDepartmentId',
  'currentPositionId',
  'currentJobId',
  'currentGradeId',
  'currentLocationId',
  'lineManagerId',
  'dottedLineManagerId',
] as const

export function getAssignmentSensitiveUpdateFields(input: Record<string, unknown>): string[] {
  return ASSIGNMENT_SENSITIVE_UPDATE_FIELDS.filter(field =>
    Object.prototype.hasOwnProperty.call(input, field),
  )
}

// ── listPersons filter ─────────────────────────────────────────────────────

export const ListPersonsFilterSchema = z.object({
  page:          z.number().int().min(1).default(1),
  pageSize:      z.number().int().min(1).max(200).default(25),
  search:        z.string().trim().max(200).optional(),
  legalEntityId: z.string().uuid().optional(),
  departmentId:  z.string().uuid().optional(),
  // Filter to employees whose current department is headed by this person
  // (employee → currentDepartmentId → departments.head_person_id == this).
  departmentHeadId: z.string().uuid().optional(),
  projectId:     z.string().uuid().optional(),
  status:        AssignmentStatus.optional(),
  isActive:      z.boolean().optional(),
  // S3-12: filter to UAE Nationals on Emiratisation-target jobs
  emiratisationEligibleOnly: z.boolean().optional(),
  sortColumn:    z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
})

export type ListPersonsFilter = z.infer<typeof ListPersonsFilterSchema>
