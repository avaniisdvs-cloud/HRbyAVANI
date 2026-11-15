/**
 * core-hr DTOs and view models.
 * Drizzle row types (Person, Contract, etc.) live in schema.ts; this file
 * holds the shapes the UI / API consumes — including PII visibility variants.
 */
import type { Person } from '@/drizzle/schema'

/** Stable role names used for PII-masking decisions. Matches Auth.js JWT. */
export type CoreHrRole =
  | 'HR_ADMIN'
  | 'PAYROLL_ADMIN'
  | 'HR_DIRECTOR'
  | 'MANAGER'
  | 'EMPLOYEE'
  | 'FINANCE'
  | 'SUPER_ADMIN'

/** What we pass to the masking helpers — the caller's identity + their role. */
export interface PiiAccessContext {
  role:     CoreHrRole | string
  /** The viewer's own personId — used to grant self-access. */
  viewerPersonId?: string
  /** When true, the JWT carried a step-up-MFA claim (S3-10 hardening). */
  stepUpVerified?: boolean
}

/**
 * Person record after PII masking has been applied.
 * Shape mirrors the persons row but PII columns may hold either the
 * decrypted plaintext (HR_ADMIN), a masked string ('784-****-*******-X'),
 * or null (caller has no claim to see the value at all).
 */
export type PersonView = Omit<
  Person,
  'emiratesId' | 'passportNumber'
> & {
  emiratesId:     string | null
  passportNumber: string | null
  /** True if any PII column on this view was masked (UI shows "reveal" CTA). */
  piiMasked: boolean
}

/** Compact row used by the list / table views. No PII at all. */
export interface PersonListRow {
  id:                 string
  personNumber:       string
  fullNameEn:         string | null
  fullNameAr:         string
  workEmail:          string | null
  legalEntityId:      string
  legalEntityCode:    string | null
  departmentId:       string | null
  departmentNameEn:   string | null
  positionId:         string | null
  positionTitleEn:    string | null
  nationalityCategory: string
  nationalityCode:    string
  assignmentStatus:   string
  hireDate:           string
  /** ACTIVE | CONFIRMED | EXTENDED | FAILED — drives the "On probation" segment */
  probationStatus:    string | null
  probationEndDate:   string | null
  isEmiratisationEligible: boolean
  isActive:           boolean
}

export interface PaginatedPersons {
  rows:       PersonListRow[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}
