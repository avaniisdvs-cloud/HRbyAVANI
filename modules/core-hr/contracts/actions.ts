'use server'

/**
 * S3-04 — Contract lifecycle Server Actions.
 *
 * Three public actions: create, amend, terminate.
 *   • create     — issues a new fixed-term contract (BR-CT-001)
 *   • amend      — close-current + open-new pattern (effective-dated history)
 *   • terminate  — flips status, sets termination metadata; row is preserved
 *                  forever (Hard Rule 3 — HR records never deleted)
 *
 * Every BR-xx rule check is tagged with a comment so a future law change is
 * greppable.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, sql } from 'drizzle-orm'
import {
  contracts, persons, workerAssignments, medicalInsuranceEnrolments,
  onboardingChecklists, onboardingChecklistItems,
} from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { addDays } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import { requireCorrectionModePermission } from '@/modules/config/guards'
import { cancelEnrolmentTx } from '@/modules/insurance'
import {
  CreateContractSchema, AmendContractSchema, TerminateContractSchema, CorrectContractSchema,
  type CreateContractInput, type AmendContractInput, type TerminateContractInput, type CorrectContractInput,
} from './validations'

// ── Helpers ────────────────────────────────────────────────────────────────

async function nextContractNumber(
  legalEntityId: string,
  tx: { select: typeof db.select },
): Promise<string> {
  // Format: CTR-<entityShort>-NNNNNN — counts existing rows for the entity.
  const result = await tx
    .select({ n: sql<number>`COALESCE(COUNT(*), 0)` })
    .from(contracts)
    .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.legalEntityId, legalEntityId)))
  const next = (result[0]?.n ?? 0) + 1
  return `CTR-${String(next).padStart(7, '0')}`
}

function assertContractDateRules(
  startDate: string,
  endDate: string,
  probationEnd?: string | null,
): void {
  const start = new Date(startDate)
  const end   = new Date(endDate)
  if (end <= start) {
    throw new Error('BR-CT-DATE-001: contract endDate must be after startDate')
  }

  const threeYears = new Date(start)
  threeYears.setFullYear(threeYears.getFullYear() + 3)
  if (end > threeYears) {
    throw new Error('BR-CT-002: contract term exceeds 3 years')
  }

  if (probationEnd) {
    const probEnd = new Date(probationEnd)
    const sixMonths = new Date(start)
    sixMonths.setMonth(sixMonths.getMonth() + 6)
    if (probEnd < start) {
      throw new Error('BR-PR-001: probationEnd cannot precede startDate')
    }
    if (probEnd > sixMonths) {
      throw new Error('BR-PR-001: probation exceeds 6 months')
    }
  }
}

// BR-NP-001 helper lives in ./services.ts (sync — keeps this 'use server'
// file compliant with the "every export must be async" rule).

// ══════════════════════════════════════════════════════════════════════════
// 1 — createContract
// ══════════════════════════════════════════════════════════════════════════

export async function createContract(
  input: CreateContractInput,
): Promise<{ id: string; contractNumber: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'create')
  const data = CreateContractSchema.parse(input)

  let newId  = ''
  let newNum = ''

  await db.transaction(async tx => {
    // Person must exist + caller must be in scope.
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId, hireDate: persons.hireDate })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
      .limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cannot issue contracts in another legal entity')
    }
    if (person.legalEntityId !== data.legalEntityId) {
      throw new Error('legalEntityId must match the person\'s entity')
    }
    if (person.hireDate && data.startDate < person.hireDate) {
      throw new Error('BR-CT-DATE-002: contract startDate cannot precede employee hireDate')
    }

    const [overlap] = await tx
      .select({ id: contracts.id, contractNumber: contracts.contractNumber })
      .from(contracts)
      .where(and(
        eq(contracts.tenantId, TENANT_ID),
        eq(contracts.personId, data.personId),
        eq(contracts.status, 'ACTIVE'),
        sql`${contracts.startDate} <= ${data.endDate}::date`,
        sql`${contracts.endDate} >= ${data.startDate}::date`,
      ))
      .limit(1)
    if (overlap) {
      throw new Error(`BR-CT-DATE-003: active overlapping contract exists (${overlap.contractNumber ?? overlap.id})`)
    }

    newNum = await nextContractNumber(data.legalEntityId, tx)

    const [row] = await tx
      .insert(contracts)
      .values({
        tenantId:        TENANT_ID,
        personId:        data.personId,
        legalEntityId:   data.legalEntityId,
        contractNumber:  newNum,
        contractType:    data.contractType,                    // BR-CT-001: FIXED_TERM
        employmentType:  data.employmentType,
        startDate:       data.startDate,
        endDate:         data.endDate,                         // BR-CT-002: validated above
        probationStart:  data.probationStart ?? data.startDate,
        probationEnd:    data.probationEnd,                    // BR-PR-001: validated above
        noticePeriodDays: data.noticePeriodDays,               // BR-NP-001 (caller can pre-set)
        workingHoursPerWeek: data.workingHoursPerWeek.toString(),
        workLocation:    data.workLocation,
        contractDocumentId: data.contractDocumentId,
        renewalCount:    0,
        status:          'ACTIVE',
        actionMode:      'UPDATE',
        notes:           data.notes,
        extraData:       {},
        createdBy:       user.id,
        createdByName:   user.name,
      })
      .returning({ id: contracts.id })
    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: data.legalEntityId,
      channel:       'WEB',
      eventType:     'CONTRACT.CREATED',
      resourceType:  'contracts',
      resourceId:    newId,
      entityId:      data.legalEntityId,
      newValues: {
        contractNumber: newNum,
        personId: data.personId,
        startDate: data.startDate,
        endDate: data.endDate,
        employmentType: data.employmentType,
      },
    }, tx)
  })

  return { id: newId, contractNumber: newNum }
  } catch (e) { translateError(e, 'createContract') }
}

// ══════════════════════════════════════════════════════════════════════════
// 2 — amendContract  (close current + open new — effective-date pattern)
// ══════════════════════════════════════════════════════════════════════════

export async function amendContract(
  input: AmendContractInput,
): Promise<{ closedId: string; newId: string; newContractNumber: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'edit')
  const data = AmendContractSchema.parse(input)

  let closedId = ''
  let newId    = ''
  let newNum   = ''

  await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.id, data.contractId)))
      .limit(1)
    if (!current) throw new Error('contract not found')
    if (current.status !== 'ACTIVE') throw new Error('only ACTIVE contracts can be amended')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== current.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity amendment not allowed')
    }
    if (data.effectiveDate <= current.startDate) {
      throw new Error('BR-CT-DATE-004: amendment effectiveDate must be after current contract startDate')
    }

    // BR-CT-002 — re-check the new term doesn't exceed 3 years from the
    //              ORIGINAL startDate (we keep the same start; only end shifts).
    const newEndDate = data.newEndDate ?? current.endDate
    if (newEndDate <= data.effectiveDate) {
      throw new Error('BR-CT-DATE-005: amended endDate must be after the amendment effectiveDate')
    }
    const start = new Date(current.startDate)
    const newEnd = new Date(newEndDate)
    const threeYears = new Date(start)
    threeYears.setFullYear(threeYears.getFullYear() + 3)
    if (newEnd > threeYears) {
      throw new Error('BR-CT-002: amended term exceeds 3 years from original start')
    }

    // 1) close the current row (status=RENEWED, terminationDate=effectiveDate-1)
    const closeDate = addDays(data.effectiveDate, -1)
    await tx
      .update(contracts)
      .set({
        status:           'RENEWED',
        terminationDate:  closeDate,
        terminationReason: `Amended: ${data.reason}`,
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(eq(contracts.id, current.id))
    closedId = current.id

    // 2) open the new row carrying forward all unchanged columns.
    newNum = await nextContractNumber(current.legalEntityId, tx)
    const [row] = await tx
      .insert(contracts)
      .values({
        tenantId:        TENANT_ID,
        personId:        current.personId,
        legalEntityId:   current.legalEntityId,
        contractNumber:  newNum,
        contractType:    current.contractType,                 // BR-CT-001 preserved
        employmentType:  data.newEmploymentType ?? current.employmentType,
        startDate:       data.effectiveDate,
        endDate:         newEndDate,
        probationStart:  current.probationStart,
        probationEnd:    null,                                 // BR-PR-003: no new probation on renewal
        noticePeriodDays: data.newNoticePeriodDays ?? current.noticePeriodDays,
        workingHoursPerWeek: (data.newWorkingHoursPerWeek?.toString() ?? current.workingHoursPerWeek),
        workLocation:    data.newWorkLocation ?? current.workLocation,
        contractDocumentId: current.contractDocumentId,
        renewalCount:    current.renewalCount + 1,
        previousContractId: current.id,
        status:          'ACTIVE',
        actionMode:      'UPDATE',
        notes:           data.notes ?? current.notes,
        extraData:       (current.extraData as Record<string, unknown>) ?? {},
        createdBy:       user.id,
        createdByName:   user.name,
      })
      .returning({ id: contracts.id })
    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'CONTRACT.AMENDED',
      resourceType:  'contracts',
      resourceId:    newId,
      entityId:      current.legalEntityId,
      metadata: {
        previousContractId: current.id,
        previousContractNumber: current.contractNumber,
        effectiveDate: data.effectiveDate,
        reason: data.reason,
      },
    }, tx)
  })

  return { closedId, newId, newContractNumber: newNum }
  } catch (e) { translateError(e, 'amendContract') }
}

// ══════════════════════════════════════════════════════════════════════════
// 3 — terminateContract
// ══════════════════════════════════════════════════════════════════════════

export async function terminateContract(
  input: TerminateContractInput,
): Promise<{ id: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'edit')
  const data = TerminateContractSchema.parse(input)

  await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.id, data.contractId)))
      .limit(1)
    if (!current) throw new Error('contract not found')
    if (current.status === 'TERMINATED') throw new Error('contract is already terminated')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== current.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity termination not allowed')
    }
    if (data.terminationDate < current.startDate) {
      throw new Error('BR-CT-DATE-006: terminationDate cannot precede contract startDate')
    }

    // BR-EOSB-PAY-001: outstanding balances must be paid within 14 days of
    //   termination_date. Payroll module enforces — we record the date here.
    await tx
      .update(contracts)
      .set({
        status:            'TERMINATED',
        terminationDate:   data.terminationDate,
        terminationReason: data.terminationReason,
        notes:             data.notes ?? current.notes,
        updatedBy:         user.id,
        updatedByName:     user.name,
        updatedDate:       new Date(),
        lastUpdatedDate:   new Date(),
      })
      .where(eq(contracts.id, current.id))

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'CONTRACT.TERMINATED',
      resourceType:  'contracts',
      resourceId:    current.id,
      entityId:      current.legalEntityId,
      changedFields: ['status', 'terminationDate', 'terminationReason'],
      metadata:      { terminationDate: data.terminationDate, reason: data.terminationReason },
    }, tx)

    // QF-1 — Close the current worker_assignment for this person.
    // Hard Rule 3: never DELETE — mark TERMINATED + set effectiveEndDate.
    const [currentAssignment] = await tx
      .select({ id: workerAssignments.id })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, current.personId),
        eq(workerAssignments.isCurrent, true),
      ))
      .limit(1)

    if (currentAssignment) {
      await tx
        .update(workerAssignments)
        .set({
          assignmentStatus: 'TERMINATED',
          effectiveEndDate: data.terminationDate,
          isCurrent:        false,
          updatedBy:        user.id,
          updatedByName:    user.name,
          updatedDate:      new Date(),
          lastUpdatedDate:  new Date(),
        })
        .where(eq(workerAssignments.id, currentAssignment.id))
    }

    // QF-1 — Sync persons denormalised status so person lists show TERMINATED.
    await tx
      .update(persons)
      .set({
        assignmentStatus: 'TERMINATED',
        separationDate:   data.terminationDate,
        separationReason: data.terminationReason.slice(0, 100),
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, current.personId)))

    // QF-2 — BR-INS-006: insurance must cover the notice period after termination.
    // Cancel all active enrolments; extend expiry to terminationDate + noticePeriodDays.
    const activeEnrolments = await tx
      .select({ id: medicalInsuranceEnrolments.id })
      .from(medicalInsuranceEnrolments)
      .where(and(
        eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
        eq(medicalInsuranceEnrolments.personId, current.personId),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
      ))

    const noticeDays = current.noticePeriodDays ?? 0
    const insuranceExpiryDate = addDays(data.terminationDate, noticeDays)

    for (const enrolment of activeEnrolments) {
      try {
        await cancelEnrolmentTx(tx, {
          id:            user.id,
          name:          user.name,
          role:          user.role,
          legalEntityId: current.legalEntityId,
        }, {
          enrolmentId:        enrolment.id,
          cancellationDate:   data.terminationDate,
          cancellationReason: `Employment terminated: ${data.terminationReason}`,
          ...(noticeDays > 0 && {
            extensionDate:   insuranceExpiryDate,
            extensionReason: `BR-INS-006: coverage extended through notice period (${noticeDays} days)`,
          }),
        })
      } catch {
        // Insurance cancellation must not block contract termination.
        // HR can manually cancel enrolments from the insurance tab.
      }
    }

    // P2-3 — BR-OFFB-001: Create a full offboarding checklist for ALL departing employees.
    // VISA_CANCELLATION is added only for EXPATs (BR-VISA-001).
    const [personDetail] = await tx
      .select({ nationalityCategory: persons.nationalityCategory })
      .from(persons)
      .where(eq(persons.id, current.personId))
      .limit(1)

    const [checklist] = await tx
      .insert(onboardingChecklists)
      .values({
        tenantId:      TENANT_ID,
        personId:      current.personId,
        legalEntityId: current.legalEntityId,
        checklistType: 'OFFBOARDING',
        initiatedDate: new Date().toISOString().slice(0, 10),
        targetDate:    data.terminationDate,
        status:        'IN_PROGRESS',
        completionPct: 0,
        createdBy:     user.id,
        createdByName: user.name,
      })
      .returning({ id: onboardingChecklists.id })

    type ChecklistItemInsert = typeof onboardingChecklistItems.$inferInsert
    const baseItems: Omit<ChecklistItemInsert, 'tenantId' | 'checklistId' | 'createdBy' | 'createdByName'>[] = [
      {
        itemCode: 'IT_ACCESS_REVOCATION', category: 'IT', isMandatory: true,
        itemNameEn: 'IT Access Revocation', itemNameAr: 'إلغاء صلاحيات تقنية المعلومات',
        assignedToRole: 'IT', dueDaysFromStart: 0, status: 'PENDING',
      },
      {
        itemCode: 'EQUIPMENT_RETURN', category: 'IT', isMandatory: true,
        itemNameEn: 'Equipment Return', itemNameAr: 'إعادة المعدات',
        assignedToRole: 'MANAGER', dueDaysFromStart: 3, status: 'PENDING',
      },
      {
        itemCode: 'WORK_HANDOVER', category: 'MANAGER', isMandatory: true,
        itemNameEn: 'Work Handover', itemNameAr: 'تسليم المهام الوظيفية',
        assignedToRole: 'MANAGER', dueDaysFromStart: 5, status: 'PENDING',
      },
      {
        itemCode: 'EXIT_INTERVIEW', category: 'HR', isMandatory: false,
        itemNameEn: 'Exit Interview', itemNameAr: 'مقابلة نهاية الخدمة',
        assignedToRole: 'HR_ADMIN', dueDaysFromStart: 5, status: 'PENDING',
      },
      {
        itemCode: 'HR_DOCUMENTS_COLLECTION', category: 'HR', isMandatory: true,
        itemNameEn: 'HR Documents Collection', itemNameAr: 'جمع مستندات الموارد البشرية',
        assignedToRole: 'HR_ADMIN', dueDaysFromStart: 7, status: 'PENDING',
      },
      {
        itemCode: 'FINAL_PAYROLL_PROCESSING', category: 'PAYROLL', isMandatory: true,
        itemNameEn: 'Final Payroll & EOSB Processing', itemNameAr: 'معالجة الراتب النهائي ومكافأة نهاية الخدمة',
        assignedToRole: 'PAYROLL_ADMIN', dueDaysFromStart: 14, status: 'PENDING',
      },
    ]

    // BR-VISA-001: Add EXPAT-only visa cancellation item.
    if (personDetail?.nationalityCategory === 'EXPAT') {
      baseItems.push({
        itemCode: 'VISA_CANCELLATION', category: 'HR', isMandatory: true,
        itemNameEn: 'UAE Residence Visa Cancellation', itemNameAr: 'إلغاء تأشيرة الإقامة الإماراتية',
        assignedToRole: 'HR_ADMIN', dueDaysFromStart: 30, status: 'PENDING',
      })
    }

    await tx
      .insert(onboardingChecklistItems)
      .values(
        baseItems.map(item => ({
          tenantId:      TENANT_ID,
          checklistId:   checklist.id,
          createdBy:     user.id,
          createdByName: user.name,
          ...item,
        })),
      )
  })

  return { id: data.contractId }
  } catch (e) { translateError(e, 'terminateContract') }
}

// ══════════════════════════════════════════════════════════════════════════
// 4 — correctContract  (in-place correction — HR_DIRECTOR / SUPER_ADMIN only)
// ══════════════════════════════════════════════════════════════════════════

export async function correctContract(
  input: CorrectContractInput,
): Promise<{ id: string }> {
  try {
  const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(user, 'ASSIGNMENTS', 'edit')
  requireCorrectionModePermission(user.role)
  const data = CorrectContractSchema.parse(input)

  if (!data.correctionNote?.trim()) {
    throw new Error('CORRECTION mode requires a non-empty correctionNote')
  }

  await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.id, data.contractId)))
      .limit(1)
    if (!current) throw new Error('contract not found')
    if (current.status === 'TERMINATED') throw new Error('cannot correct a TERMINATED contract')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== current.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity correction not allowed')
    }
    const correctedStart = data.startDate ?? current.startDate
    const correctedEnd   = data.endDate   ?? current.endDate
    const correctedProbationEnd =
      data.probationEnd !== undefined ? data.probationEnd : current.probationEnd
    assertContractDateRules(correctedStart, correctedEnd, correctedProbationEnd)

    const [overlap] = await tx
      .select({ id: contracts.id, contractNumber: contracts.contractNumber })
      .from(contracts)
      .where(and(
        eq(contracts.tenantId, TENANT_ID),
        eq(contracts.personId, current.personId),
        eq(contracts.status, 'ACTIVE'),
        sql`${contracts.id} <> ${current.id}::uuid`,
        sql`${contracts.startDate} <= ${correctedEnd}::date`,
        sql`${contracts.endDate} >= ${correctedStart}::date`,
      ))
      .limit(1)
    if (overlap) {
      throw new Error(`BR-CT-DATE-003: active overlapping contract exists (${overlap.contractNumber ?? overlap.id})`)
    }

    // Snapshot before-values for audit diff
    const oldValues = {
      employmentType:      current.employmentType,
      startDate:           current.startDate,
      endDate:             current.endDate,
      noticePeriodDays:    current.noticePeriodDays,
      workingHoursPerWeek: current.workingHoursPerWeek,
      workLocation:        current.workLocation,
      probationEnd:        current.probationEnd,
    }

    await tx
      .update(contracts)
      .set({
        employmentType:      data.employmentType      ?? current.employmentType,
        startDate:           data.startDate           ?? current.startDate,
        endDate:             data.endDate             ?? current.endDate,
        noticePeriodDays:    data.noticePeriodDays    ?? current.noticePeriodDays,
        workingHoursPerWeek: data.workingHoursPerWeek?.toString() ?? current.workingHoursPerWeek,
        workLocation:        data.workLocation        ?? current.workLocation,
        probationEnd:        data.probationEnd        !== undefined ? data.probationEnd : current.probationEnd,
        notes:               data.notes               ?? current.notes,
        actionMode:          'CORRECTION',
        correctsRowId:       null,
        updatedBy:           user.id,
        updatedByName:       user.name,
        updatedDate:         new Date(),
        lastUpdatedDate:     new Date(),
      })
      .where(eq(contracts.id, current.id))

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'CONTRACT.CORRECTED',
      resourceType:  'contracts',
      resourceId:    current.id,
      entityId:      current.legalEntityId,
      actionMode:    'CORRECTION',
      oldValues,
      newValues: {
        employmentType:      data.employmentType      ?? current.employmentType,
        startDate:           data.startDate           ?? current.startDate,
        endDate:             data.endDate             ?? current.endDate,
        noticePeriodDays:    data.noticePeriodDays    ?? current.noticePeriodDays,
        workingHoursPerWeek: data.workingHoursPerWeek ?? current.workingHoursPerWeek,
        workLocation:        data.workLocation        ?? current.workLocation,
        probationEnd:        data.probationEnd        !== undefined ? data.probationEnd : current.probationEnd,
      },
      metadata: { correctionNote: data.correctionNote },
    }, tx)
  })

  return { id: data.contractId }
  } catch (e) { translateError(e, 'correctContract') }
}

// (Pure helpers live in ./services.ts — imported there by employment-actions.)
