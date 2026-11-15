'use server'

/**
 * Medical Insurance Server Actions.
 *
 * Business rules enforced here:
 *   BR-INS-001 — employer must provide insurance; at least one active plan required
 *   BR-INS-002 — dependent visa document mandatory before dependent enrolment
 *   BR-INS-003 — insurance must cover notice period on termination
 *   BR-INS-004 — max 9 dependents (enforced in dependents/actions.ts; checked here too)
 *   BR-INS-005 — child age cap 18 / 25 student (enforced in eligibility.ts)
 *   BR-INS-006 — expiry extension beyond notice period supported
 *   BR-INS-007 — contractors excluded unless exception granted
 *
 * No approval workflow is required for insurance actions (UAE law mandate).
 * Hard Rule 1: every write is in a Drizzle tx with audit log.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, desc, asc } from 'drizzle-orm'
import {
  medicalInsurancePlans,
  medicalInsuranceEnrolments,
  medicalInsurancePolicySettings,
  workerAssignments,
  persons,
} from '@/drizzle/schema'
import type {
  MedicalInsurancePlan,
  MedicalInsuranceEnrolment,
  MedicalInsurancePolicySetting,
} from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { assertSameEntity, assertSelfOrTeam } from '@/lib/access'
import { TENANT_ID } from '@/lib/constants'
import { revalidatePath } from 'next/cache'
import {
  CreateInsurancePlanSchema,
  UpdateInsurancePlanSchema,
  UpsertPolicySettingsSchema,
  EnrolEmployeeSchema,
  EnrolDependentSchema,
  UpdateEnrolmentCardSchema,
  CancelEnrolmentSchema,
  GrantContractorExceptionSchema,
  ExtendExpirySchema,
  type CreateInsurancePlanInput,
  type UpdateInsurancePlanInput,
  type UpsertPolicySettingsInput,
  type EnrolEmployeeInput,
  type EnrolDependentInput,
  type UpdateEnrolmentCardInput,
  type CancelEnrolmentInput,
  type GrantContractorExceptionInput,
  type ExtendExpiryInput,
} from './validations'
import {
  enrolEmployeeTx,
  enrolDependentTx,
  cancelEnrolmentTx,
  getPolicySettingsTx,
} from './lifecycle'

// ══════════════════════════════════════════════════════════════════════════════
// PLAN MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

export async function getInsurancePlans(
  legalEntityId: string,
): Promise<MedicalInsurancePlan[]> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])
    // Non-SUPER_ADMIN may only query their own entity's plans
    if (user.role !== 'SUPER_ADMIN' && legalEntityId !== user.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity plan access denied')
    }
    const entityId = user.role === 'SUPER_ADMIN' ? legalEntityId : user.legalEntityId

    return await db
      .select()
      .from(medicalInsurancePlans)
      .where(and(
        eq(medicalInsurancePlans.tenantId, TENANT_ID),
        eq(medicalInsurancePlans.legalEntityId, entityId),
      ))
      .orderBy(asc(medicalInsurancePlans.planCode))
  } catch (e) { translateError(e, 'getInsurancePlans') }
}

export async function getInsurancePlan(
  planId: string,
): Promise<MedicalInsurancePlan | null> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])
    const [row] = await db
      .select()
      .from(medicalInsurancePlans)
      .where(and(
        eq(medicalInsurancePlans.tenantId, TENANT_ID),
        eq(medicalInsurancePlans.id, planId),
      ))
      .limit(1)
    return row ?? null
  } catch (e) { translateError(e, 'getInsurancePlan') }
}

export async function createInsurancePlan(
  input: CreateInsurancePlanInput,
): Promise<{ id: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = CreateInsurancePlanSchema.parse(input)
    const legalEntityId = user.role === 'SUPER_ADMIN' ? data.legalEntityId : user.legalEntityId

    let planId = ''
    await db.transaction(async tx => {
      const [row] = await tx
        .insert(medicalInsurancePlans)
        .values({
          tenantId:               TENANT_ID,
          legalEntityId,
          planCode:               data.planCode,
          planNameEn:             data.planNameEn,
          planNameAr:             data.planNameAr,
          providerName:           data.providerName,
          tpaName:                data.tpaName,
          policyNumber:           data.policyNumber,
          networkName:            data.networkName,
          planCategory:           data.planCategory,
          inpatientLimitAed:      data.inpatientLimitAed,
          outpatientLimitAed:     data.outpatientLimitAed,
          dentalCovered:          data.dentalCovered,
          opticalCovered:         data.opticalCovered,
          maternityCovered:       data.maternityCovered,
          preExistingCovered:     data.preExistingCovered,
          repatriationCovered:    data.repatriationCovered,
          gradeIds:               data.gradeIds,
          employmentTypes:        data.employmentTypes,
          minServiceMonths:       data.minServiceMonths,
          dependentsCovered:      data.dependentsCovered,
          maxDependents:          data.maxDependents,
          employeePremiumAed:     data.employeePremiumAed,
          spousePremiumAed:       data.spousePremiumAed,
          childPremiumAed:        data.childPremiumAed,
          parentPremiumAed:       data.parentPremiumAed,
          policyStartDate:        data.policyStartDate,
          policyEndDate:          data.policyEndDate,
          renewalDate:            data.renewalDate,
          isDefaultPlan:          data.isDefaultPlan,
          regulatoryScheme:       data.regulatoryScheme,
          employerContributionPct: data.employerContributionPct,
          createdBy:              user.id,
          createdByName:          user.name,
        })
        .returning({ id: medicalInsurancePlans.id })
      planId = row.id

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: legalEntityId, channel: 'WEB',
        eventType: 'INSURANCE_PLAN.CREATED',
        resourceType: 'medical_insurance_plans', resourceId: planId,
        entityId: legalEntityId,
        newValues: { planCode: data.planCode, planCategory: data.planCategory, providerName: data.providerName },
      }, tx)
    })

    revalidatePath('/settings/insurance-plans')
    return { id: planId }
  } catch (e) { translateError(e, 'createInsurancePlan') }
}

export async function updateInsurancePlan(
  input: UpdateInsurancePlanInput,
): Promise<{ id: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = UpdateInsurancePlanSchema.parse(input)

    await db.transaction(async tx => {
      const [existing] = await tx
        .select({ id: medicalInsurancePlans.id, legalEntityId: medicalInsurancePlans.legalEntityId })
        .from(medicalInsurancePlans)
        .where(and(
          eq(medicalInsurancePlans.tenantId, TENANT_ID),
          eq(medicalInsurancePlans.id, data.id),
        ))
        .limit(1)
      if (!existing) throw new Error(`NOT_FOUND: insurance plan ${data.id}`)
      if (user.role !== 'SUPER_ADMIN' && existing.legalEntityId !== user.legalEntityId) {
        throw new Error('FORBIDDEN: cross-entity plan update denied')
      }

      await tx
        .update(medicalInsurancePlans)
        .set({
          ...(data.planNameEn        !== undefined && { planNameEn:             data.planNameEn }),
          ...(data.planNameAr        !== undefined && { planNameAr:             data.planNameAr }),
          ...(data.providerName      !== undefined && { providerName:           data.providerName }),
          ...(data.tpaName           !== undefined && { tpaName:                data.tpaName }),
          ...(data.policyNumber      !== undefined && { policyNumber:           data.policyNumber }),
          ...(data.networkName       !== undefined && { networkName:            data.networkName }),
          ...(data.planCategory      !== undefined && { planCategory:           data.planCategory }),
          ...(data.inpatientLimitAed !== undefined && { inpatientLimitAed:      data.inpatientLimitAed }),
          ...(data.outpatientLimitAed !== undefined && { outpatientLimitAed:    data.outpatientLimitAed }),
          ...(data.dentalCovered     !== undefined && { dentalCovered:          data.dentalCovered }),
          ...(data.opticalCovered    !== undefined && { opticalCovered:         data.opticalCovered }),
          ...(data.maternityCovered  !== undefined && { maternityCovered:       data.maternityCovered }),
          ...(data.preExistingCovered !== undefined && { preExistingCovered:    data.preExistingCovered }),
          ...(data.repatriationCovered !== undefined && { repatriationCovered:  data.repatriationCovered }),
          ...(data.gradeIds          !== undefined && { gradeIds:               data.gradeIds }),
          ...(data.employmentTypes   !== undefined && { employmentTypes:        data.employmentTypes }),
          ...(data.minServiceMonths  !== undefined && { minServiceMonths:       data.minServiceMonths }),
          ...(data.dependentsCovered !== undefined && { dependentsCovered:      data.dependentsCovered }),
          ...(data.maxDependents     !== undefined && { maxDependents:          data.maxDependents }),
          ...(data.employeePremiumAed !== undefined && { employeePremiumAed:    data.employeePremiumAed }),
          ...(data.spousePremiumAed  !== undefined && { spousePremiumAed:       data.spousePremiumAed }),
          ...(data.childPremiumAed   !== undefined && { childPremiumAed:        data.childPremiumAed }),
          ...(data.parentPremiumAed  !== undefined && { parentPremiumAed:       data.parentPremiumAed }),
          ...(data.policyStartDate   !== undefined && { policyStartDate:        data.policyStartDate }),
          ...(data.policyEndDate     !== undefined && { policyEndDate:          data.policyEndDate }),
          ...(data.renewalDate       !== undefined && { renewalDate:            data.renewalDate }),
          ...(data.isDefaultPlan     !== undefined && { isDefaultPlan:          data.isDefaultPlan }),
          ...(data.regulatoryScheme  !== undefined && { regulatoryScheme:       data.regulatoryScheme }),
          ...(data.employerContributionPct !== undefined && { employerContributionPct: data.employerContributionPct }),
          updatedBy:       user.id,
          updatedByName:   user.name,
          updatedDate:     new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(medicalInsurancePlans.id, data.id))

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: existing.legalEntityId, channel: 'WEB',
        eventType: 'INSURANCE_PLAN.UPDATED',
        resourceType: 'medical_insurance_plans', resourceId: data.id,
        entityId: existing.legalEntityId,
      }, tx)
    })

    revalidatePath('/settings/insurance-plans')
    return { id: data.id }
  } catch (e) { translateError(e, 'updateInsurancePlan') }
}

export async function toggleInsurancePlanActive(
  planId: string,
  isActive: boolean,
): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    await db.transaction(async tx => {
      const [existing] = await tx
        .select({ id: medicalInsurancePlans.id, legalEntityId: medicalInsurancePlans.legalEntityId })
        .from(medicalInsurancePlans)
        .where(and(eq(medicalInsurancePlans.tenantId, TENANT_ID), eq(medicalInsurancePlans.id, planId)))
        .limit(1)
      if (!existing) throw new Error(`NOT_FOUND: insurance plan ${planId}`)
      if (user.role !== 'SUPER_ADMIN' && existing.legalEntityId !== user.legalEntityId) {
        throw new Error('FORBIDDEN')
      }
      await tx.update(medicalInsurancePlans).set({
        isActive, updatedBy: user.id, updatedByName: user.name,
        updatedDate: new Date(), lastUpdatedDate: new Date(),
      }).where(eq(medicalInsurancePlans.id, planId))

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: existing.legalEntityId, channel: 'WEB',
        eventType: isActive ? 'INSURANCE_PLAN.ACTIVATED' : 'INSURANCE_PLAN.DEACTIVATED',
        resourceType: 'medical_insurance_plans', resourceId: planId,
        entityId: existing.legalEntityId,
      }, tx)
    })
    revalidatePath('/settings/insurance-plans')
  } catch (e) { translateError(e, 'toggleInsurancePlanActive') }
}

// ══════════════════════════════════════════════════════════════════════════════
// POLICY SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

export async function getInsurancePolicySettings(
  legalEntityId: string,
): Promise<MedicalInsurancePolicySetting | null> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])
    const [row] = await db
      .select()
      .from(medicalInsurancePolicySettings)
      .where(and(
        eq(medicalInsurancePolicySettings.tenantId, TENANT_ID),
        eq(medicalInsurancePolicySettings.legalEntityId, legalEntityId),
      ))
      .limit(1)
    return row ?? null
  } catch (e) { translateError(e, 'getInsurancePolicySettings') }
}

export async function upsertInsurancePolicySettings(
  input: UpsertPolicySettingsInput,
): Promise<{ id: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = UpsertPolicySettingsSchema.parse(input)
    const legalEntityId = user.role === 'SUPER_ADMIN' ? data.legalEntityId : user.legalEntityId

    let settingsId = ''
    await db.transaction(async tx => {
      const existing = await getPolicySettingsTx(tx, legalEntityId)

      if (existing) {
        await tx
          .update(medicalInsurancePolicySettings)
          .set({
            maxDependentsPerEmployee: data.maxDependentsPerEmployee,
            maxSpouses:               data.maxSpouses,
            maxChildren:              data.maxChildren,
            parentsCovered:           data.parentsCovered,
            parentsInLawCovered:      data.parentsInLawCovered,
            childMaxAge:              data.childMaxAge,
            childStudentExtensionAge: data.childStudentExtensionAge,
            employerPaysSpouse:       data.employerPaysSpouse,
            employerPaysChildren:     data.employerPaysChildren,
            employerPaysParents:      data.employerPaysParents,
            employeeDependentCostPct: data.employeeDependentCostPct,
            autoEnrolOnHire:          data.autoEnrolOnHire,
            enrolmentGraceDays:       data.enrolmentGraceDays,
            dependentAddGraceDays:    data.dependentAddGraceDays,
            renewalAlertDays:         data.renewalAlertDays,
            updatedBy:                user.id,
            updatedByName:            user.name,
            updatedDate:              new Date(),
            lastUpdatedDate:          new Date(),
          })
          .where(eq(medicalInsurancePolicySettings.id, existing.id))
        settingsId = existing.id
      } else {
        const [row] = await tx
          .insert(medicalInsurancePolicySettings)
          .values({
            tenantId:                 TENANT_ID,
            legalEntityId,
            maxDependentsPerEmployee: data.maxDependentsPerEmployee,
            maxSpouses:               data.maxSpouses,
            maxChildren:              data.maxChildren,
            parentsCovered:           data.parentsCovered,
            parentsInLawCovered:      data.parentsInLawCovered,
            childMaxAge:              data.childMaxAge,
            childStudentExtensionAge: data.childStudentExtensionAge,
            employerPaysSpouse:       data.employerPaysSpouse,
            employerPaysChildren:     data.employerPaysChildren,
            employerPaysParents:      data.employerPaysParents,
            employeeDependentCostPct: data.employeeDependentCostPct,
            autoEnrolOnHire:          data.autoEnrolOnHire,
            enrolmentGraceDays:       data.enrolmentGraceDays,
            dependentAddGraceDays:    data.dependentAddGraceDays,
            renewalAlertDays:         data.renewalAlertDays,
            createdBy:                user.id,
            createdByName:            user.name,
          })
          .returning({ id: medicalInsurancePolicySettings.id })
        settingsId = row.id
      }

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: legalEntityId, channel: 'WEB',
        eventType: 'INSURANCE_POLICY_SETTINGS.UPSERTED',
        resourceType: 'medical_insurance_policy_settings', resourceId: settingsId,
        entityId: legalEntityId,
      }, tx)
    })

    revalidatePath('/settings/insurance-policy')
    return { id: settingsId }
  } catch (e) { translateError(e, 'upsertInsurancePolicySettings') }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENROLMENT
// ══════════════════════════════════════════════════════════════════════════════

export async function enrolEmployee(
  input: EnrolEmployeeInput,
): Promise<{ enrolmentId: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = EnrolEmployeeSchema.parse(input)
    // P3-A7 — block cross-entity enrolment: a non-SUPER_ADMIN may only enrol
    // against their own legal entity (the value is persisted and drives plan
    // resolution, so a forged data.legalEntityId must be rejected).
    assertSameEntity(user, data.legalEntityId)

    return await db.transaction(async tx =>
      enrolEmployeeTx(tx, {
        id: user.id, name: user.name, role: user.role, legalEntityId: user.legalEntityId,
      }, data)
    )
  } catch (e) { translateError(e, 'enrolEmployee') }
}

export async function enrolDependent(
  input: EnrolDependentInput,
): Promise<{ enrolmentId: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = EnrolDependentSchema.parse(input)
    // P3-A7 — block cross-entity dependent enrolment.
    assertSameEntity(user, data.legalEntityId)

    return await db.transaction(async tx =>
      enrolDependentTx(tx, {
        id: user.id, name: user.name, role: user.role, legalEntityId: user.legalEntityId,
      }, data)
    )
  } catch (e) { translateError(e, 'enrolDependent') }
}

export async function updateEnrolmentCard(
  input: UpdateEnrolmentCardInput,
): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = UpdateEnrolmentCardSchema.parse(input)

    await db.transaction(async tx => {
      const [enrolment] = await tx
        .select({ id: medicalInsuranceEnrolments.id, legalEntityId: medicalInsuranceEnrolments.legalEntityId, personId: medicalInsuranceEnrolments.personId })
        .from(medicalInsuranceEnrolments)
        .where(and(
          eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
          eq(medicalInsuranceEnrolments.id, data.enrolmentId),
        ))
        .limit(1)
      if (!enrolment) throw new Error(`NOT_FOUND: enrolment ${data.enrolmentId}`)
      // P3-A7 — block cross-entity card update.
      assertSameEntity(user, enrolment.legalEntityId)

      await tx
        .update(medicalInsuranceEnrolments)
        .set({
          ...(data.insuranceCardNumber  !== undefined && { insuranceCardNumber:      data.insuranceCardNumber }),
          ...(data.insuranceMemberId    !== undefined && { insuranceMemberId:        data.insuranceMemberId }),
          ...(data.cardDocumentId       !== undefined && { cardDocumentId:           data.cardDocumentId }),
          ...(data.submittedToInsurerDate !== undefined && { submittedToInsurerDate: data.submittedToInsurerDate }),
          ...(data.insurerReference     !== undefined && { insurerReference:         data.insurerReference }),
          ...(data.notes                !== undefined && { notes:                    data.notes }),
          updatedBy:       user.id,
          updatedByName:   user.name,
          updatedDate:     new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(medicalInsuranceEnrolments.id, data.enrolmentId))

      // Sync card number snapshot onto persons row if it's an employee enrolment
      if (data.insuranceCardNumber) {
        await tx.update(persons).set({
          insuranceCardNumber: data.insuranceCardNumber,
          lastUpdatedDate:     new Date(),
        }).where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, enrolment.personId)))
      }

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: enrolment.legalEntityId, channel: 'WEB',
        eventType: 'INSURANCE.CARD_UPDATED',
        resourceType: 'medical_insurance_enrolments', resourceId: data.enrolmentId,
        entityId: enrolment.legalEntityId,
      }, tx)
    })
  } catch (e) { translateError(e, 'updateEnrolmentCard') }
}

export async function cancelEnrolment(
  input: CancelEnrolmentInput,
): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = CancelEnrolmentSchema.parse(input)

    await db.transaction(async tx => {
      // P3-A7 — block cross-entity cancellation: load the enrolment and verify
      // it belongs to the actor's entity before cancelling.
      const [enrolment] = await tx
        .select({ legalEntityId: medicalInsuranceEnrolments.legalEntityId })
        .from(medicalInsuranceEnrolments)
        .where(and(eq(medicalInsuranceEnrolments.tenantId, TENANT_ID), eq(medicalInsuranceEnrolments.id, data.enrolmentId)))
        .limit(1)
      if (!enrolment) throw new Error(`NOT_FOUND: enrolment ${data.enrolmentId}`)
      assertSameEntity(user, enrolment.legalEntityId)

      return cancelEnrolmentTx(tx, {
        id: user.id, name: user.name, role: user.role, legalEntityId: user.legalEntityId,
      }, data)
    })
  } catch (e) { translateError(e, 'cancelEnrolment') }
}

export async function extendEnrolmentExpiry(
  input: ExtendExpiryInput,
): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = ExtendExpirySchema.parse(input)

    await db.transaction(async tx => {
      const [enrolment] = await tx
        .select({ id: medicalInsuranceEnrolments.id, legalEntityId: medicalInsuranceEnrolments.legalEntityId, personId: medicalInsuranceEnrolments.personId })
        .from(medicalInsuranceEnrolments)
        .where(and(eq(medicalInsuranceEnrolments.tenantId, TENANT_ID), eq(medicalInsuranceEnrolments.id, data.enrolmentId)))
        .limit(1)
      if (!enrolment) throw new Error(`NOT_FOUND: enrolment ${data.enrolmentId}`)
      // P3-A7 — block cross-entity expiry extension.
      assertSameEntity(user, enrolment.legalEntityId)

      await tx.update(medicalInsuranceEnrolments).set({
        insuranceExpiryExtensionDate:   data.extensionDate,
        insuranceExpiryExtensionReason: data.extensionReason,
        expiryDate:                     data.extensionDate,
        updatedBy:       user.id,
        updatedByName:   user.name,
        updatedDate:     new Date(),
        lastUpdatedDate: new Date(),
      }).where(eq(medicalInsuranceEnrolments.id, data.enrolmentId))

      await tx.update(persons).set({
        insuranceExpiryDate: data.extensionDate,
        lastUpdatedDate:     new Date(),
      }).where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, enrolment.personId)))

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: enrolment.legalEntityId, channel: 'WEB',
        eventType: 'INSURANCE.EXPIRY_EXTENDED',
        resourceType: 'medical_insurance_enrolments', resourceId: data.enrolmentId,
        entityId: enrolment.legalEntityId,
        metadata: { extensionDate: data.extensionDate, extensionReason: data.extensionReason },
      }, tx)
    })
  } catch (e) { translateError(e, 'extendEnrolmentExpiry') }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTRACTOR EXCEPTION
// ══════════════════════════════════════════════════════════════════════════════

export async function grantContractorInsuranceException(
  input: GrantContractorExceptionInput,
): Promise<{ enrolmentId: string }> {
  try {
    const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = GrantContractorExceptionSchema.parse(input)
    // P3-A7 — block cross-entity contractor exception + enrolment.
    assertSameEntity(user, data.legalEntityId)

    return await db.transaction(async tx => {
      // BR-INS-007: verify the assignment is actually a CONTRACTOR before granting exception
      const [assignment] = await tx
        .select({ employmentType: workerAssignments.employmentType })
        .from(workerAssignments)
        .where(and(
          eq(workerAssignments.tenantId, TENANT_ID),
          eq(workerAssignments.id, data.workerAssignmentId),
        ))
        .limit(1)
      if (!assignment) throw new Error(`NOT_FOUND: worker assignment ${data.workerAssignmentId}`)
      if (assignment.employmentType !== 'CONTRACTOR') {
        throw new Error(
          'BR-INS-007: contractor insurance exception can only be granted to employees ' +
          `with employmentType = CONTRACTOR (actual: ${assignment.employmentType ?? 'unknown'}).`,
        )
      }

      // Flip exception flag on the assignment
      await tx
        .update(workerAssignments)
        .set({
          insuranceExceptionGranted: true,
          updatedBy:       user.id,
          updatedByName:   user.name,
          updatedDate:     new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(and(
          eq(workerAssignments.tenantId, TENANT_ID),
          eq(workerAssignments.id, data.workerAssignmentId),
        ))

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: data.legalEntityId, channel: 'WEB',
        eventType: 'INSURANCE.CONTRACTOR_EXCEPTION_GRANTED',
        resourceType: 'worker_assignments', resourceId: data.workerAssignmentId,
        entityId: data.legalEntityId,
        metadata: { personId: data.personId },
      }, tx)

      // Now enrol the contractor
      return enrolEmployeeTx(tx, {
        id: user.id, name: user.name, role: user.role, legalEntityId: data.legalEntityId,
      }, {
        personId:      data.personId,
        legalEntityId: data.legalEntityId,
        planId:        data.planId,
        effectiveDate: data.effectiveDate,
      })
    })
  } catch (e) { translateError(e, 'grantContractorInsuranceException') }
}

// ══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ══════════════════════════════════════════════════════════════════════════════

export async function getPersonEnrolments(
  personId: string,
): Promise<MedicalInsuranceEnrolment[]> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'EMPLOYEE', 'MANAGER'])
    // P3-A6 — IDOR guard: EMPLOYEE/MANAGER are relationship-scoped (self + reports);
    // HR / PAYROLL_ADMIN / SUPER_ADMIN are trusted broad-read for premium/admin work.
    if (user.role === 'EMPLOYEE' || user.role === 'MANAGER') {
      await assertSelfOrTeam({ role: user.role, personId: user.personId }, personId)
    }
    return await db
      .select()
      .from(medicalInsuranceEnrolments)
      .where(and(
        eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
        eq(medicalInsuranceEnrolments.personId, personId),
      ))
      .orderBy(desc(medicalInsuranceEnrolments.effectiveDate))
  } catch (e) { translateError(e, 'getPersonEnrolments') }
}

export async function getActiveEnrolment(
  personId: string,
): Promise<MedicalInsuranceEnrolment | null> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'EMPLOYEE', 'MANAGER'])
    // P3-A6 — IDOR guard (see getPersonEnrolments).
    if (user.role === 'EMPLOYEE' || user.role === 'MANAGER') {
      await assertSelfOrTeam({ role: user.role, personId: user.personId }, personId)
    }
    const [row] = await db
      .select()
      .from(medicalInsuranceEnrolments)
      .where(and(
        eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
        eq(medicalInsuranceEnrolments.personId, personId),
        eq(medicalInsuranceEnrolments.enrolmentType, 'EMPLOYEE'),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
      ))
      .limit(1)
    return row ?? null
  } catch (e) { translateError(e, 'getActiveEnrolment') }
}
