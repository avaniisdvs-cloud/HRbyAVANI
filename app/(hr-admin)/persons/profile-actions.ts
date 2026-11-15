'use server'

/**
 * Employee profile panel data — Option D "Modern" master–detail design.
 *
 * One server action returns everything the tabbed detail panel needs
 * (Overview · Job & Org · Compensation · Documents · Timeline).
 *
 * Security:
 *  - Delegates person access + PII masking + read-audit to getPerson()
 *    (role check, entity scoping, MANAGER direct-report check, PDPL audit).
 *  - BR-COMP-GATE: compensation + bank details are returned ONLY to
 *    HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN / PAYROLL_ADMIN / FINANCE —
 *    gated server-side, never by hiding UI alone.
 *  - IBAN is always masked to the last 4 characters in this view.
 */

import { eq, and, asc, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  legalEntities, departments, positions, grades, locations, projects,
  personContacts, personDocuments, employmentActions, workerAssignments,
  personBankDetails, absenceBalances, absenceTypes,
  persons as personsTable,
} from '@/drizzle/schema'
import { getPerson } from '@/modules/core-hr'
import { decryptNullable } from '@/lib/encryption'
import { TENANT_ID } from '@/lib/constants'

const COMP_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE']

export interface EmployeeProfile {
  id: string
  // hero
  personNumber: string
  fullNameEn: string | null
  fullNameAr: string
  assignmentStatus: string
  nationalityCategory: string
  nationalityCode: string
  gradeName: string | null
  profilePhotoUrl: string | null
  // overview — contact
  workEmail: string | null
  workPhone: string | null
  locationName: string | null
  managerName: string | null
  // overview — employment
  employmentType: string
  contractedHoursPerWeek: string | null
  hireDate: string
  entityName: string | null
  probationStatus: string | null
  probationEndDate: string | null
  // overview — leave balance (annual)
  leave: { remaining: number; total: number; taken: number } | null
  // overview — compliance
  visaExpiry: string | null
  visaStatus: string | null
  emiratesIdMasked: string | null
  emiratesIdExpiry: string | null
  // job & org
  positionTitle: string | null
  departmentName: string | null
  projectName: string | null
  noticePeriodDays: number
  workerCategory: string | null
  payFrequency: string
  // compensation — null unless caller is in COMP_ROLES
  compensation: {
    basicSalary: number | null
    totalPackage: number | null
    currency: string
    bankName: string | null
    ibanMasked: string | null
  } | null
  // documents
  documents: Array<{
    id: string
    title: string
    type: string
    fileName: string | null
    sizeBytes: number | null
    status: string
    expiryDate: string | null
  }>
  // timeline
  timeline: Array<{
    id: string
    title: string
    date: string
    sub: string | null
  }>
}

function maskTail(value: string | null, visible: number): string | null {
  if (!value) return null
  const clean = value.replace(/\s+/g, '')
  if (clean.length <= visible) return clean
  return '••• ' + clean.slice(-visible)
}

export async function getEmployeeProfile(
  personId: string,
): Promise<{ profile: EmployeeProfile } | { error: string }> {
  try {
    const session = await auth()
    if (!session?.user) return { error: 'UNAUTHENTICATED' }

    // getPerson enforces role, entity scope, manager direct-report access,
    // masks PII by role and writes the PDPL read-audit row.
    const person = await getPerson(personId)
    if (!person) return { error: 'NOT_FOUND' }

    const canViewComp = COMP_ROLES.includes(session.user.role)
    const year = new Date().getFullYear()

    const [
      entity, dept, position, grade, location, manager, projectRow,
      contactRows, leaveRow, docRows, actionRows, bankRow,
    ] = await Promise.all([
      person.legalEntityId
        ? db.select({ nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
            .from(legalEntities).where(eq(legalEntities.id, person.legalEntityId))
            .limit(1).then(r => r[0] ?? null)
        : null,
      person.currentDepartmentId
        ? db.select({ nameEn: departments.nameEn, nameAr: departments.nameAr })
            .from(departments).where(eq(departments.id, person.currentDepartmentId))
            .limit(1).then(r => r[0] ?? null)
        : null,
      person.currentPositionId
        ? db.select({ titleEn: positions.positionTitleEn })
            .from(positions).where(eq(positions.id, person.currentPositionId))
            .limit(1).then(r => r[0] ?? null)
        : null,
      person.currentGradeId
        ? db.select({ nameEn: grades.gradeNameEn, code: grades.gradeCode })
            .from(grades).where(eq(grades.id, person.currentGradeId))
            .limit(1).then(r => r[0] ?? null)
        : null,
      person.currentLocationId
        ? db.select({ nameEn: locations.nameEn })
            .from(locations).where(eq(locations.id, person.currentLocationId))
            .limit(1).then(r => r[0] ?? null)
        : null,
      person.lineManagerId
        ? db.select({ fullNameEn: personsTable.fullNameEn })
            .from(personsTable).where(eq(personsTable.id, person.lineManagerId))
            .limit(1).then(r => r[0] ?? null)
        : null,
      db.select({ nameEn: projects.nameEn })
        .from(workerAssignments)
        .innerJoin(projects, eq(workerAssignments.projectId, projects.id))
        .where(and(
          eq(workerAssignments.tenantId, TENANT_ID),
          eq(workerAssignments.personId, person.id),
          eq(workerAssignments.isCurrent, true),
        ))
        .limit(1).then(r => r[0] ?? null),
      db.select({ contactType: personContacts.contactType, contactValue: personContacts.contactValue })
        .from(personContacts)
        .where(and(
          eq(personContacts.tenantId, TENANT_ID),
          eq(personContacts.personId, person.id),
          eq(personContacts.isActive, true),
        ))
        .orderBy(asc(personContacts.contactType)),
      // Annual leave balance for the current year.
      db.select({
          accrued:  absenceBalances.accruedDays,
          opening:  absenceBalances.openingBalanceDays,
          carried:  absenceBalances.carriedForwardDays,
          adjusted: absenceBalances.adjustedDays,
          taken:    absenceBalances.takenDays,
          pending:  absenceBalances.pendingDays,
          forfeited: absenceBalances.forfeitedDays,
          closing:  absenceBalances.closingBalanceDays,
        })
        .from(absenceBalances)
        .innerJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
        .where(and(
          eq(absenceBalances.tenantId, TENANT_ID),
          eq(absenceBalances.personId, person.id),
          eq(absenceBalances.balanceYear, year),
          eq(absenceTypes.typeCode, 'ANNUAL'),
        ))
        .limit(1).then(r => r[0] ?? null)
        .catch(() => null),
      db.select({
          id:        personDocuments.id,
          title:     personDocuments.documentTitle,
          type:      personDocuments.documentType,
          fileName:  personDocuments.fileName,
          sizeBytes: personDocuments.fileSizeBytes,
          status:    personDocuments.documentStatus,
          expiryDate: personDocuments.expiryDate,
        })
        .from(personDocuments)
        .where(and(
          eq(personDocuments.tenantId, TENANT_ID),
          eq(personDocuments.personId, person.id),
        ))
        .orderBy(asc(personDocuments.documentType))
        .limit(25)
        .catch(() => [] as Array<{
          id: string; title: string; type: string; fileName: string | null
          sizeBytes: number | null; status: string; expiryDate: string | null
        }>),
      db.select({
          id:            employmentActions.id,
          actionType:    employmentActions.actionType,
          effectiveDate: employmentActions.effectiveDate,
          reason:        employmentActions.reasonText,
          status:        employmentActions.status,
        })
        .from(employmentActions)
        .where(and(
          eq(employmentActions.tenantId, TENANT_ID),
          eq(employmentActions.personId, person.id),
        ))
        .orderBy(desc(employmentActions.effectiveDate))
        .limit(12)
        .catch(() => [] as Array<{
          id: string; actionType: string; effectiveDate: string
          reason: string | null; status: string | null
        }>),
      canViewComp
        ? db.select({ bankName: personBankDetails.bankName, iban: personBankDetails.iban })
            .from(personBankDetails)
            .where(and(
              eq(personBankDetails.tenantId, TENANT_ID),
              eq(personBankDetails.personId, person.id),
              eq(personBankDetails.isPrimary, true),
            ))
            .limit(1).then(r => r[0] ?? null)
            .catch(() => null)
        : null,
    ])

    const contactOf = (type: string) =>
      contactRows.find(c => c.contactType === type)?.contactValue ?? null

    const leave = leaveRow
      ? (() => {
          const total =
            Number(leaveRow.opening) + Number(leaveRow.accrued) +
            Number(leaveRow.carried) + Number(leaveRow.adjusted)
          const taken = Number(leaveRow.taken)
          const remaining = leaveRow.closing !== null
            ? Number(leaveRow.closing)
            : total - taken - Number(leaveRow.pending) - Number(leaveRow.forfeited)
          return { remaining, total, taken }
        })()
      : null

    // A corrupted IBAN ciphertext must not take down the whole profile read.
    let ibanPlain: string | null = null
    try { ibanPlain = decryptNullable(bankRow?.iban ?? null) } catch { ibanPlain = null }

    const profile: EmployeeProfile = {
      id: person.id,
      personNumber: person.personNumber,
      fullNameEn: person.fullNameEn,
      fullNameAr: person.fullNameAr,
      assignmentStatus: person.assignmentStatus,
      nationalityCategory: person.nationalityCategory,
      nationalityCode: person.nationalityCode,
      gradeName: grade?.nameEn ?? grade?.code ?? null,
      profilePhotoUrl: person.profilePhotoUrl || person.profilePhotoData || null,
      workEmail: contactOf('WORK_EMAIL') ?? contactOf('PERSONAL_EMAIL'),
      workPhone: contactOf('MOBILE_PRIMARY') ?? contactOf('WORK_PHONE'),
      locationName: location?.nameEn ?? null,
      managerName: manager?.fullNameEn ?? null,
      employmentType: person.employmentType,
      contractedHoursPerWeek: person.contractedHoursPerWeek,
      hireDate: person.hireDate,
      entityName: entity?.nameEn ?? null,
      probationStatus: person.probationStatus,
      probationEndDate: person.probationEndDate,
      leave,
      visaExpiry: person.visaExpiry,
      visaStatus: person.visaStatus,
      // getPerson already returns emiratesId decrypted (privileged) or masked —
      // this panel always shows the masked form regardless of caller privilege.
      emiratesIdMasked: person.piiMasked ? person.emiratesId : maskTail(person.emiratesId, 4),
      emiratesIdExpiry: person.emiratesIdExpiry,
      positionTitle: position?.titleEn ?? null,
      departmentName: dept?.nameEn ?? null,
      projectName: projectRow?.nameEn ?? null,
      noticePeriodDays: person.noticePeriodDays,
      workerCategory: person.workerCategory,
      payFrequency: person.payFrequency,
      compensation: canViewComp
        ? {
            basicSalary: person.basicSalary !== null ? Number(person.basicSalary) : null,
            totalPackage: person.totalPackage !== null ? Number(person.totalPackage) : null,
            currency: 'AED',
            bankName: bankRow?.bankName ?? null,
            ibanMasked: maskTail(ibanPlain, 4),
          }
        : null,
      documents: docRows.map(d => ({
        id: d.id,
        title: d.title,
        type: d.type,
        fileName: d.fileName,
        sizeBytes: d.sizeBytes,
        status: d.status,
        expiryDate: d.expiryDate,
      })),
      timeline: actionRows.map(a => ({
        id: a.id,
        title: a.actionType.replace(/_/g, ' '),
        date: a.effectiveDate,
        sub: a.reason ?? a.status ?? null,
      })),
    }

    return { profile }
  } catch (e) {
    // Rule 8 — NEVER translateError in Server Action catch: return { error }.
    console.error('[getEmployeeProfile]', e instanceof Error ? e.message : String(e))
    return { error: e instanceof Error && e.message.startsWith('FORBIDDEN') ? 'FORBIDDEN' : 'INTERNAL' }
  }
}
