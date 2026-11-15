/**
 * MDM history snapshot writer — Phase 3.
 *
 * Called inside Drizzle transactions on every MDM UPDATE (not CORRECTION).
 * Closes the current history row and opens a new one with the post-update values.
 *
 * Same-day guard: if the existing current row has validFrom = today, we set its
 * validTo = today (not today-1) to prevent an invalid validTo < validFrom range.
 */
import { eq, and } from 'drizzle-orm'
import {
  gradeHistory, departmentHistory, locationHistory, jobHistory, positionHistory,
} from '@/drizzle/schema'
import { addDays, EFFECTIVE_END_OF_TIME } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'

// Structural tx type: any object exposing update + insert + select (matches both PgDatabase and PgTransaction)
type Tx = { update: (...args: any[]) => any; insert: (...args: any[]) => any; select: (...args: any[]) => any } // eslint-disable-line

const today = () => new Date().toISOString().slice(0, 10)

/** Returns validTo for closing a row: today-1, but clamped to >= existingValidFrom to avoid invalid ranges. */
function safeCloseDate(existingValidFrom: string | null | undefined): string {
  const t = today()
  const proposed = addDays(t, -1)
  if (existingValidFrom && proposed < existingValidFrom) return t
  return proposed
}

// ── Grade ────────────────────────────────────────────────────────────────────

export interface GradeSnapshot {
  gradeCode:        string
  gradeNameEn:      string
  gradeNameAr?:     string | null
  gradeLevel?:      number | null
  minSalary?:       string | null
  maxSalary?:       string | null
  midSalary?:       string | null
  noticePeriodDays?: number | null
}

export async function writeGradeHistory(
  tx:           Tx,
  gradeId:      string,
  snapshot:     GradeSnapshot,
  changedBy?:   string,
  changeReason?: string,
): Promise<void> {
  const validFrom = today()

  const [existing] = await tx.select({ validFrom: gradeHistory.validFrom })
    .from(gradeHistory)
    .where(and(
      eq(gradeHistory.tenantId, TENANT_ID),
      eq(gradeHistory.gradeId, gradeId),
      eq(gradeHistory.isCurrent, true),
    ))
    .limit(1)

  const closeDate = safeCloseDate(existing?.validFrom)

  await tx.update(gradeHistory)
    .set({ validTo: closeDate, isCurrent: false })
    .where(and(
      eq(gradeHistory.tenantId, TENANT_ID),
      eq(gradeHistory.gradeId, gradeId),
      eq(gradeHistory.isCurrent, true),
    ))

  await tx.insert(gradeHistory).values({
    tenantId:         TENANT_ID,
    gradeId,
    gradeCode:        snapshot.gradeCode,
    gradeNameEn:      snapshot.gradeNameEn,
    gradeNameAr:      snapshot.gradeNameAr ?? null,
    gradeLevel:       snapshot.gradeLevel ?? null,
    minSalary:        snapshot.minSalary ?? null,
    maxSalary:        snapshot.maxSalary ?? null,
    midSalary:        snapshot.midSalary ?? null,
    noticePeriodDays: snapshot.noticePeriodDays ?? null,
    validFrom,
    validTo:          EFFECTIVE_END_OF_TIME,
    isCurrent:        true,
    changeReason:     changeReason ?? null,
    changedBy:        changedBy ?? null,
    changedAt:        new Date(),
  })
}

// ── Department ───────────────────────────────────────────────────────────────

export interface DepartmentSnapshot {
  code:               string
  nameEn:             string
  nameAr?:            string | null
  departmentType?:    string | null
  approvedHeadcount?: number | null
  costCentreCode?:    string | null
  glAccountCode?:     string | null
  parentDepartmentId?: string | null
}

export async function writeDepartmentHistory(
  tx:              Tx,
  departmentId:    string,
  snapshot:        DepartmentSnapshot,
  changedBy?:      string,
  changeReason?:   string,
): Promise<void> {
  const validFrom = today()

  const [existing] = await tx.select({ validFrom: departmentHistory.validFrom })
    .from(departmentHistory)
    .where(and(
      eq(departmentHistory.tenantId, TENANT_ID),
      eq(departmentHistory.departmentId, departmentId),
      eq(departmentHistory.isCurrent, true),
    ))
    .limit(1)

  const closeDate = safeCloseDate(existing?.validFrom)

  await tx.update(departmentHistory)
    .set({ validTo: closeDate, isCurrent: false })
    .where(and(
      eq(departmentHistory.tenantId, TENANT_ID),
      eq(departmentHistory.departmentId, departmentId),
      eq(departmentHistory.isCurrent, true),
    ))

  await tx.insert(departmentHistory).values({
    tenantId:           TENANT_ID,
    departmentId,
    code:               snapshot.code,
    nameEn:             snapshot.nameEn,
    nameAr:             snapshot.nameAr ?? null,
    departmentType:     snapshot.departmentType ?? null,
    approvedHeadcount:  snapshot.approvedHeadcount ?? null,
    costCentreCode:     snapshot.costCentreCode ?? null,
    glAccountCode:      snapshot.glAccountCode ?? null,
    parentDepartmentId: snapshot.parentDepartmentId ?? null,
    validFrom,
    validTo:          EFFECTIVE_END_OF_TIME,
    isCurrent:          true,
    changeReason:       changeReason ?? null,
    changedBy:          changedBy ?? null,
    changedAt:          new Date(),
  })
}

// ── Location ─────────────────────────────────────────────────────────────────

export interface LocationSnapshot {
  code:          string
  nameEn:        string
  nameAr?:       string | null
  addressLine1?: string | null
  city?:         string | null
  emirate?:      string | null
  country?:      string | null
  timezone?:     string | null
}

export async function writeLocationHistory(
  tx:            Tx,
  locationId:    string,
  snapshot:      LocationSnapshot,
  changedBy?:    string,
  changeReason?: string,
): Promise<void> {
  const validFrom = today()

  const [existing] = await tx.select({ validFrom: locationHistory.validFrom })
    .from(locationHistory)
    .where(and(
      eq(locationHistory.tenantId, TENANT_ID),
      eq(locationHistory.locationId, locationId),
      eq(locationHistory.isCurrent, true),
    ))
    .limit(1)

  const closeDate = safeCloseDate(existing?.validFrom)

  await tx.update(locationHistory)
    .set({ validTo: closeDate, isCurrent: false })
    .where(and(
      eq(locationHistory.tenantId, TENANT_ID),
      eq(locationHistory.locationId, locationId),
      eq(locationHistory.isCurrent, true),
    ))

  await tx.insert(locationHistory).values({
    tenantId:     TENANT_ID,
    locationId,
    code:         snapshot.code,
    nameEn:       snapshot.nameEn,
    nameAr:       snapshot.nameAr ?? null,
    addressLine1: snapshot.addressLine1 ?? null,
    city:         snapshot.city ?? null,
    emirate:      snapshot.emirate ?? null,
    country:      snapshot.country ?? null,
    timezone:     snapshot.timezone ?? null,
    validFrom,
    validTo:          EFFECTIVE_END_OF_TIME,
    isCurrent:    true,
    changeReason: changeReason ?? null,
    changedBy:    changedBy ?? null,
    changedAt:    new Date(),
  })
}

// ── Job ───────────────────────────────────────────────────────────────────────

export interface JobSnapshot {
  jobCode:               string
  jobTitleEn:            string
  jobTitleAr?:           string | null
  jobFamily?:            string | null
  jobFunction?:          string | null
  isEmiratisationTarget?: boolean | null
  isManagementRole?:     boolean | null
  minGradeId?:           string | null
  maxGradeId?:           string | null
}

export async function writeJobHistory(
  tx:            Tx,
  jobId:         string,
  snapshot:      JobSnapshot,
  changedBy?:    string,
  changeReason?: string,
): Promise<void> {
  const validFrom = today()

  const [existing] = await tx.select({ validFrom: jobHistory.validFrom })
    .from(jobHistory)
    .where(and(
      eq(jobHistory.tenantId, TENANT_ID),
      eq(jobHistory.jobId, jobId),
      eq(jobHistory.isCurrent, true),
    ))
    .limit(1)

  const closeDate = safeCloseDate(existing?.validFrom)

  await tx.update(jobHistory)
    .set({ validTo: closeDate, isCurrent: false })
    .where(and(
      eq(jobHistory.tenantId, TENANT_ID),
      eq(jobHistory.jobId, jobId),
      eq(jobHistory.isCurrent, true),
    ))

  await tx.insert(jobHistory).values({
    tenantId:              TENANT_ID,
    jobId,
    jobCode:               snapshot.jobCode,
    jobTitleEn:            snapshot.jobTitleEn,
    jobTitleAr:            snapshot.jobTitleAr ?? null,
    jobFamily:             snapshot.jobFamily ?? null,
    jobFunction:           snapshot.jobFunction ?? null,
    isEmiratisationTarget: snapshot.isEmiratisationTarget ?? null,
    isManagementRole:      snapshot.isManagementRole ?? null,
    minGradeId:            snapshot.minGradeId ?? null,
    maxGradeId:            snapshot.maxGradeId ?? null,
    validFrom,
    validTo:          EFFECTIVE_END_OF_TIME,
    isCurrent:             true,
    changeReason:          changeReason ?? null,
    changedBy:             changedBy ?? null,
    changedAt:             new Date(),
  })
}

// ── Position ──────────────────────────────────────────────────────────────────

export interface PositionSnapshot {
  positionCode:          string
  positionTitleEn:       string
  positionTitleAr?:      string | null
  departmentId?:         string | null
  jobId?:                string | null
  gradeId?:              string | null
  locationId?:           string | null
  fteCount?:             string | null
  reportsToPositionId?:  string | null
  budgetAmount?:         string | null
}

export async function writePositionHistory(
  tx:            Tx,
  positionId:    string,
  snapshot:      PositionSnapshot,
  changedBy?:    string,
  changeReason?: string,
): Promise<void> {
  const validFrom = today()

  const [existing] = await tx.select({ validFrom: positionHistory.validFrom })
    .from(positionHistory)
    .where(and(
      eq(positionHistory.tenantId, TENANT_ID),
      eq(positionHistory.positionId, positionId),
      eq(positionHistory.isCurrent, true),
    ))
    .limit(1)

  const closeDate = safeCloseDate(existing?.validFrom)

  await tx.update(positionHistory)
    .set({ validTo: closeDate, isCurrent: false })
    .where(and(
      eq(positionHistory.tenantId, TENANT_ID),
      eq(positionHistory.positionId, positionId),
      eq(positionHistory.isCurrent, true),
    ))

  await tx.insert(positionHistory).values({
    tenantId:             TENANT_ID,
    positionId,
    positionCode:         snapshot.positionCode,
    positionTitleEn:      snapshot.positionTitleEn,
    positionTitleAr:      snapshot.positionTitleAr ?? null,
    departmentId:         snapshot.departmentId ?? null,
    jobId:                snapshot.jobId ?? null,
    gradeId:              snapshot.gradeId ?? null,
    locationId:           snapshot.locationId ?? null,
    fteCount:             snapshot.fteCount ?? null,
    reportsToPositionId:  snapshot.reportsToPositionId ?? null,
    budgetAmount:         snapshot.budgetAmount ?? null,
    validFrom,
    validTo:          EFFECTIVE_END_OF_TIME,
    isCurrent:            true,
    changeReason:         changeReason ?? null,
    changedBy:            changedBy ?? null,
    changedAt:            new Date(),
  })
}
