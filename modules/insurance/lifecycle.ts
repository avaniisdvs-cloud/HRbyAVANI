/**
 * Insurance lifecycle — tx-aware helpers.
 * NOT Server Actions. Callers supply a Drizzle tx handle.
 *
 * Keeps all DB writes atomic: enrolment record + persons snapshot + audit
 * all commit or all roll back together.
 */
import { and, count, eq, ne, or, sql } from 'drizzle-orm'
import {
  medicalInsuranceEnrolments,
  medicalInsurancePlans,
  medicalInsurancePolicySettings,
  notificationLog,
  persons,
  personDependents,
  workerAssignments,
} from '@/drizzle/schema'
import type {
  MedicalInsurancePlan,
  MedicalInsurancePolicySetting,
} from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { addDays } from '@/lib/effective-date'
import { resolveEligiblePlan, checkDependentAgeEligibility } from './eligibility'
import { aedToFils, filsToAed, splitPremium, computeExpiryDate } from './utils'

type Tx = {
  select:  typeof import('@/lib/db').db.select
  insert:  typeof import('@/lib/db').db.insert
  update:  typeof import('@/lib/db').db.update
}

export interface ActorContext {
  id:            string
  name:          string
  role:          string
  legalEntityId: string
}

// ── Policy settings loader ─────────────────────────────────────────────────

export async function getPolicySettingsTx(
  tx:            Tx,
  legalEntityId: string,
): Promise<MedicalInsurancePolicySetting | null> {
  const [row] = await tx
    .select()
    .from(medicalInsurancePolicySettings)
    .where(and(
      eq(medicalInsurancePolicySettings.tenantId, TENANT_ID),
      eq(medicalInsurancePolicySettings.legalEntityId, legalEntityId),
    ))
    .limit(1)
  return row ?? null
}

// ── Sync person snapshot ───────────────────────────────────────────────────
// Updates the denormalised columns on persons to match the active enrolment.

export async function syncPersonInsuranceSnapshotTx(
  tx:       Tx,
  personId: string,
  plan:     MedicalInsurancePlan,
  enrolment: {
    insuranceCardNumber?: string | null
    insuranceMemberId:    string
    effectiveDate:        string
    expiryDate:           string
    annualPremiumAed:     string
    employerPremiumAed:   string
    employeePremiumAed:   string
    enrolmentStatus:      string
  },
): Promise<void> {
  await tx
    .update(persons)
    .set({
      insurancePlanId:        plan.id,
      insuranceProviderName:  plan.providerName,
      insuranceNetwork:       plan.networkName,
      insuranceCategory:      plan.planCategory,
      insuranceCardNumber:    enrolment.insuranceCardNumber,
      insuranceMemberId:      enrolment.insuranceMemberId,
      insuranceEffectiveDate: enrolment.effectiveDate,
      insuranceExpiryDate:    enrolment.expiryDate,
      insuranceStatus:        enrolment.enrolmentStatus === 'ACTIVE' ? 'ENROLLED'
                            : enrolment.enrolmentStatus === 'PENDING'  ? 'PENDING_ENROLMENT'
                            : enrolment.enrolmentStatus === 'RENEWAL_DUE' ? 'RENEWAL_DUE'
                            : enrolment.enrolmentStatus === 'EXPIRED'  ? 'EXPIRED'
                            : enrolment.enrolmentStatus === 'CANCELLED' ? 'CANCELLED'
                            : 'NOT_ENROLLED',
      annualPremiumAed:      enrolment.annualPremiumAed,
      employerPremiumAed:    enrolment.employerPremiumAed,
      employeePremiumAed:    enrolment.employeePremiumAed,
      lastUpdatedDate:       new Date(),
    })
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.id, personId),
    ))
}

// ── Sync dependent snapshot ────────────────────────────────────────────────

export async function syncDependentInsuranceSnapshotTx(
  tx:          Tx,
  dependentId: string,
  plan:        MedicalInsurancePlan,
  enrolment: {
    insuranceCardNumber?: string | null
    insuranceMemberId:    string
    effectiveDate:        string
    expiryDate:           string
    annualPremiumAed:     string
    employerPremiumAed:   string
    employeePremiumAed:   string
    enrolmentStatus:      string
  },
): Promise<void> {
  await tx
    .update(personDependents)
    .set({
      isOnCompanyInsurance:   true,
      insurancePlanId:        plan.id,
      insuranceProviderName:  plan.providerName,
      insuranceNetwork:       plan.networkName,
      insuranceCategory:      plan.planCategory,
      insuranceCardNumber:    enrolment.insuranceCardNumber,
      insuranceMemberId:      enrolment.insuranceMemberId,
      insuranceEffectiveDate: enrolment.effectiveDate,
      insuranceExpiryDate:    enrolment.expiryDate,
      insuranceStatus:        enrolment.enrolmentStatus === 'ACTIVE' ? 'ENROLLED'
                            : enrolment.enrolmentStatus === 'PENDING'  ? 'PENDING_ENROLMENT'
                            : enrolment.enrolmentStatus === 'CANCELLED' ? 'CANCELLED'
                            : 'NOT_ENROLLED',
      annualPremiumAed:       enrolment.annualPremiumAed,
      employerPremiumAed:     enrolment.employerPremiumAed,
      employeePremiumAed:     enrolment.employeePremiumAed,
    })
    .where(and(
      eq(personDependents.tenantId, TENANT_ID),
      eq(personDependents.id, dependentId),
    ))
}

// ── Enrol employee ─────────────────────────────────────────────────────────

export interface EnrolEmployeeTxInput {
  personId:      string
  legalEntityId: string
  planId?:       string   // resolved via eligibility if omitted
  effectiveDate: string
  notes?:        string
}

export async function enrolEmployeeTx(
  tx:    Tx,
  actor: ActorContext,
  data:  EnrolEmployeeTxInput,
): Promise<{ enrolmentId: string }> {
  // Resolve plan if not specified
  let plan: MedicalInsurancePlan | null = null

  if (data.planId) {
    const [p] = await tx
      .select()
      .from(medicalInsurancePlans)
      .where(and(
        eq(medicalInsurancePlans.tenantId, TENANT_ID),
        eq(medicalInsurancePlans.id, data.planId),
      ))
      .limit(1)
    plan = p ?? null
    if (!plan) throw new Error(`NOT_FOUND: insurance plan ${data.planId}`)
  } else {
    // Fetch person's assignment for grade + employment type
    const [assignment] = await tx
      .select({ gradeId: workerAssignments.gradeId, employmentType: workerAssignments.employmentType, insuranceExceptionGranted: workerAssignments.insuranceExceptionGranted })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, data.personId),
        eq(workerAssignments.isCurrent, true),
      ))
      .limit(1)

    const [personRow] = await tx
      .select({ hireDate: persons.hireDate })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
      .limit(1)

    plan = await resolveEligiblePlan(tx, {
      legalEntityId:  data.legalEntityId,
      gradeId:        assignment?.gradeId,
      employmentType: assignment?.employmentType ?? 'FULL_TIME',
      hireDateOrStart: personRow?.hireDate ?? data.effectiveDate,
      insuranceExceptionGranted: assignment?.insuranceExceptionGranted ?? false,
    })

    // BR-INS-001: entity must have at least one active plan
    if (!plan) {
      throw new Error(
        'BR-INS-001: no eligible insurance plan found for this employee. ' +
        'Ensure at least one active plan is configured for the company and the employee\'s grade.',
      )
    }
  }

  // Calculate premiums — integer fils math guarantees employer + employee = annual
  const policy = await getPolicySettingsTx(tx, data.legalEntityId)
  const { annualAed: annualPremium, employerAed: employerPremium, employeeAed: employeePremium } =
    splitPremium(plan.employeePremiumAed ?? '0', plan.employerContributionPct ?? '100')

  // Expiry = effectiveDate + 12 months, capped by plan policyEndDate (C7)
  const expiryDate = computeExpiryDate(data.effectiveDate, plan.policyEndDate)

  // Guard: reject if employee already has an ACTIVE/PENDING/RENEWAL_DUE enrolment (C5)
  const [dup] = await tx
    .select({ id: medicalInsuranceEnrolments.id })
    .from(medicalInsuranceEnrolments)
    .where(and(
      eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
      eq(medicalInsuranceEnrolments.personId, data.personId),
      eq(medicalInsuranceEnrolments.enrolmentType, 'EMPLOYEE'),
      or(
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'PENDING'),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'RENEWAL_DUE'),
      ),
    ))
    .limit(1)
  if (dup) {
    throw new Error(
      `CONFLICT: employee already has an active insurance enrolment (id: ${dup.id}). ` +
      'Cancel the existing enrolment before creating a new one.',
    )
  }

  const [row] = await tx
    .insert(medicalInsuranceEnrolments)
    .values({
      tenantId:           TENANT_ID,
      personId:           data.personId,
      legalEntityId:      data.legalEntityId,
      planId:             plan.id,
      enrolmentType:      'EMPLOYEE',
      insuranceMemberId:  generateMemberId(data.personId),
      effectiveDate:      data.effectiveDate,
      expiryDate,
      annualPremiumAed:   annualPremium,
      employerPremiumAed: employerPremium,
      employeePremiumAed: employeePremium,
      enrolmentStatus:    'ACTIVE',
      actionMode:         'UPDATE',
      notes:              data.notes,
      createdBy:          actor.id,
      createdByName:      actor.name,
    })
    .returning({ id: medicalInsuranceEnrolments.id })

  const enrolmentId = row.id

  // Sync snapshot onto persons row
  await syncPersonInsuranceSnapshotTx(tx, data.personId, plan, {
    insuranceMemberId:  generateMemberId(data.personId),
    effectiveDate:      data.effectiveDate,
    expiryDate,
    annualPremiumAed:   annualPremium,
    employerPremiumAed: employerPremium,
    employeePremiumAed: employeePremium,
    enrolmentStatus:    'ACTIVE',
  })

  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: data.legalEntityId,
    channel:       'WEB',
    eventType:     'INSURANCE.EMPLOYEE_ENROLLED',
    resourceType:  'medical_insurance_enrolments',
    resourceId:    enrolmentId,
    entityId:      data.legalEntityId,
    newValues: {
      'Person ID':          data.personId,
      'Plan Code':          plan.planCode,
      'Plan Name':          plan.planNameEn ?? plan.planCode,
      'Provider':           plan.providerName,
      'Effective Date':     data.effectiveDate,
      'Expiry Date':        expiryDate,
      'Annual Premium AED': annualPremium,
      'Employer Pays AED':  employerPremium,
      'Employee Pays AED':  employeePremium,
      'Member ID':          generateMemberId(data.personId),
    },
  }, tx)

  // Notify the enrolled employee — referencePath enables deep-link from notification bell
  await tx.insert(notificationLog).values({
    tenantId:          TENANT_ID,
    legalEntityId:     data.legalEntityId,
    recipientPersonId: data.personId,
    notificationType:  'INSURANCE_ENROLLED',
    channel:           'IN_APP',
    subjectEn:         `You have been enrolled in ${plan.planNameEn ?? 'company insurance'}`,
    subjectAr:         `تم تسجيلك في ${plan.planNameAr ?? 'تأمين الشركة'}`,
    bodyEn:            `Your insurance enrolment under "${plan.planNameEn ?? plan.planCode}" is active from ${data.effectiveDate} to ${expiryDate}. Member ID: ${generateMemberId(data.personId)}.`,
    bodyAr:            `تم تفعيل تأمينك تحت خطة "${plan.planNameAr ?? plan.planCode}" من ${data.effectiveDate} حتى ${expiryDate}. رقم العضوية: ${generateMemberId(data.personId)}.`,
    referenceType:     'medical_insurance_enrolments',
    referenceId:       enrolmentId,
    referencePath:     `/persons/${data.personId}/insurance`,
    status:            'PENDING',
    createdBy:         actor.id,
    createdByName:     actor.name,
  })

  return { enrolmentId }
}

// ── Enrol dependent ────────────────────────────────────────────────────────

export interface EnrolDependentTxInput {
  personId:      string
  dependentId:   string
  legalEntityId: string
  planId?:       string
  effectiveDate: string
  isStudent?:    boolean
  notes?:        string
}

export async function enrolDependentTx(
  tx:    Tx,
  actor: ActorContext,
  data:  EnrolDependentTxInput,
): Promise<{ enrolmentId: string }> {
  // Load dependent record
  const [dep] = await tx
    .select()
    .from(personDependents)
    .where(and(
      eq(personDependents.tenantId, TENANT_ID),
      eq(personDependents.id, data.dependentId),
      eq(personDependents.personId, data.personId),
    ))
    .limit(1)
  if (!dep) throw new Error('NOT_FOUND: dependent record')

  // BR-INS-002: dependent visa document required
  if (!dep.visaDocumentId) {
    throw new Error(
      'BR-INS-002: a Dependent Visa document must be uploaded before enrolling a dependent. ' +
      'Please upload the dependent\'s visa document first.',
    )
  }

  // Fetch policy settings for age cap check
  const policy = await getPolicySettingsTx(tx, data.legalEntityId)

  // BR-INS-005: child age cap (isStudent extension tracked via notes field — schema doesn't have isStudent column)
  if (dep.relationship && dep.dateOfBirth) {
    const ageError = checkDependentAgeEligibility(
      dep.relationship,
      dep.dateOfBirth,
      data.isStudent ?? false,
      policy?.childMaxAge ?? 18,
      policy?.childStudentExtensionAge ?? 25,
    )
    if (ageError) throw new Error(ageError)
  }

  // Resolve plan — use employee's current plan if not specified
  let plan: MedicalInsurancePlan | null = null
  if (data.planId) {
    const [p] = await tx
      .select()
      .from(medicalInsurancePlans)
      .where(and(
        eq(medicalInsurancePlans.tenantId, TENANT_ID),
        eq(medicalInsurancePlans.id, data.planId),
      ))
      .limit(1)
    plan = p ?? null
  } else {
    // Use the employee's current active plan
    const [empEnrolment] = await tx
      .select({ planId: medicalInsuranceEnrolments.planId })
      .from(medicalInsuranceEnrolments)
      .where(and(
        eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
        eq(medicalInsuranceEnrolments.personId, data.personId),
        eq(medicalInsuranceEnrolments.enrolmentType, 'EMPLOYEE'),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
      ))
      .limit(1)

    if (empEnrolment?.planId) {
      const [p] = await tx
        .select()
        .from(medicalInsurancePlans)
        .where(and(
          eq(medicalInsurancePlans.tenantId, TENANT_ID),
          eq(medicalInsurancePlans.id, empEnrolment.planId),
          eq(medicalInsurancePlans.dependentsCovered, true),
        ))
        .limit(1)
      plan = p ?? null
    }
  }

  if (!plan) throw new Error('BR-INS-001: could not resolve an insurance plan for the dependent')
  if (!plan.dependentsCovered) throw new Error('BR-INS-003: selected plan does not cover dependents')

  // BR-INS-004: enforce plan's maxDependents cap
  if (plan.maxDependents !== null && plan.maxDependents !== undefined) {
    const [depCount] = await tx
      .select({ total: count() })
      .from(medicalInsuranceEnrolments)
      .where(and(
        eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
        eq(medicalInsuranceEnrolments.personId, data.personId),
        eq(medicalInsuranceEnrolments.enrolmentType, 'DEPENDENT'),
        or(
          eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
          eq(medicalInsuranceEnrolments.enrolmentStatus, 'PENDING'),
        ),
      ))
    if ((depCount?.total ?? 0) >= plan.maxDependents) {
      throw new Error(
        `BR-INS-004: this plan allows a maximum of ${plan.maxDependents} insured dependents. ` +
        `The employee already has ${depCount?.total ?? 0} active dependent enrolment(s).`,
      )
    }
  }

  // Determine premium for this dependent type
  const rel = dep.relationship?.toUpperCase() ?? ''
  const premiumStr = rel === 'SPOUSE'
    ? plan.spousePremiumAed ?? plan.employeePremiumAed
    : ['CHILD', 'SON', 'DAUGHTER'].includes(rel)
      ? plan.childPremiumAed ?? plan.employeePremiumAed
      : ['PARENT', 'FATHER', 'MOTHER', 'PARENT_IN_LAW', 'FATHER_IN_LAW', 'MOTHER_IN_LAW'].includes(rel)
        ? plan.parentPremiumAed ?? plan.employeePremiumAed
        : plan.employeePremiumAed

  // Check whether employer pays for this dependent type
  const employerPaysDep = rel === 'SPOUSE'
    ? (policy?.employerPaysSpouse ?? true)
    : ['CHILD', 'SON', 'DAUGHTER'].includes(rel)
      ? (policy?.employerPaysChildren ?? true)
      : ['PARENT', 'FATHER', 'MOTHER', 'PARENT_IN_LAW', 'FATHER_IN_LAW', 'MOTHER_IN_LAW'].includes(rel)
        ? (policy?.employerPaysParents ?? false)
        : true

  // Dependent premium split: if employer pays, employee bears depCostPct of annual.
  // Use integer fils math so employer + employee = annual exactly.
  const annualFils      = aedToFils(premiumStr ?? '0')
  const depCostPct      = parseFloat(policy?.employeeDependentCostPct?.toString() ?? '0') / 100
  const employeeFils    = employerPaysDep ? Math.round(annualFils * depCostPct) : annualFils
  const employerFils    = annualFils - employeeFils
  const annualPremium   = filsToAed(annualFils)
  const employerPremium = filsToAed(employerFils)
  const employeePremium = filsToAed(employeeFils)

  // Expiry = effectiveDate + 12 months, capped by plan policyEndDate (C7)
  const expiryDate = computeExpiryDate(data.effectiveDate, plan.policyEndDate)

  const [row] = await tx
    .insert(medicalInsuranceEnrolments)
    .values({
      tenantId:           TENANT_ID,
      personId:           data.personId,
      legalEntityId:      data.legalEntityId,
      planId:             plan.id,
      enrolmentType:      'DEPENDENT',
      dependentId:        data.dependentId,
      insuranceMemberId:  generateMemberId(data.dependentId),
      effectiveDate:      data.effectiveDate,
      expiryDate,
      annualPremiumAed:   annualPremium,
      employerPremiumAed: employerPremium,
      employeePremiumAed: employeePremium,
      enrolmentStatus:    'ACTIVE',
      actionMode:         'UPDATE',
      notes:              data.notes,
      createdBy:          actor.id,
      createdByName:      actor.name,
    })
    .returning({ id: medicalInsuranceEnrolments.id })

  const enrolmentId = row.id

  await syncDependentInsuranceSnapshotTx(tx, data.dependentId, plan, {
    insuranceMemberId:  generateMemberId(data.dependentId),
    effectiveDate:      data.effectiveDate,
    expiryDate,
    annualPremiumAed:   annualPremium,
    employerPremiumAed: employerPremium,
    employeePremiumAed: employeePremium,
    enrolmentStatus:    'ACTIVE',
  })

  // Increment person's dependentCountInsured
  await tx
    .update(persons)
    .set({
      dependentCountInsured: sql`${persons.dependentCountInsured} + 1`,
      lastUpdatedDate:       new Date(),
    })
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))

  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: data.legalEntityId,
    channel:       'WEB',
    eventType:     'INSURANCE.DEPENDENT_ENROLLED',
    resourceType:  'medical_insurance_enrolments',
    resourceId:    enrolmentId,
    entityId:      data.legalEntityId,
    newValues: {
      'Person ID':          data.personId,
      'Dependent ID':       data.dependentId,
      'Relationship':       dep.relationship,
      'Plan Code':          plan.planCode,
      'Plan Name':          plan.planNameEn ?? plan.planCode,
      'Provider':           plan.providerName,
      'Effective Date':     data.effectiveDate,
      'Expiry Date':        expiryDate,
      'Annual Premium AED': annualPremium,
      'Employer Pays AED':  employerPremium,
      'Employee Pays AED':  employeePremium,
      'Member ID':          generateMemberId(data.dependentId),
    },
  }, tx)

  return { enrolmentId }
}

// ── Cancel enrolment ───────────────────────────────────────────────────────

export interface CancelEnrolmentTxInput {
  enrolmentId:         string
  cancellationDate:    string
  cancellationReason:  string
  extensionDate?:      string
  extensionReason?:    string
  suppressNotification?: boolean  // set true when called from changePlanTx to avoid "cancelled" noise
}

export async function cancelEnrolmentTx(
  tx:    Tx,
  actor: ActorContext,
  data:  CancelEnrolmentTxInput,
): Promise<void> {
  const [enrolment] = await tx
    .select()
    .from(medicalInsuranceEnrolments)
    .where(and(
      eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
      eq(medicalInsuranceEnrolments.id, data.enrolmentId),
    ))
    .limit(1)
  if (!enrolment) throw new Error(`NOT_FOUND: enrolment ${data.enrolmentId}`)
  if (enrolment.enrolmentStatus === 'CANCELLED') {
    throw new Error('CONFLICT: enrolment is already CANCELLED')
  }
  if (data.extensionDate && data.extensionDate < data.cancellationDate) {
    throw new Error('INVALID: extensionDate must be on or after cancellationDate')
  }

  // Effective expiry = extensionDate if provided (HR exception), else cancellationDate
  const effectiveExpiry = data.extensionDate ?? data.cancellationDate

  await tx
    .update(medicalInsuranceEnrolments)
    .set({
      enrolmentStatus:                'CANCELLED',
      cancellationDate:               data.cancellationDate,
      cancellationReason:             data.cancellationReason,
      expiryDate:                     effectiveExpiry,
      insuranceExpiryExtensionDate:   data.extensionDate,
      insuranceExpiryExtensionReason: data.extensionReason,
      updatedBy:                      actor.id,
      updatedByName:                  actor.name,
      updatedDate:                    new Date(),
      lastUpdatedDate:                new Date(),
    })
    .where(eq(medicalInsuranceEnrolments.id, data.enrolmentId))

  // Sync person/dependent snapshot
  if (enrolment.enrolmentType === 'EMPLOYEE') {
    // Only mark person CANCELLED if no other ACTIVE enrolment exists (multi-plan safe) (C6)
    const [otherActive] = await tx
      .select({ id: medicalInsuranceEnrolments.id })
      .from(medicalInsuranceEnrolments)
      .where(and(
        eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
        eq(medicalInsuranceEnrolments.personId, enrolment.personId),
        eq(medicalInsuranceEnrolments.enrolmentType, 'EMPLOYEE'),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
        ne(medicalInsuranceEnrolments.id, data.enrolmentId),
      ))
      .limit(1)

    if (!otherActive) {
      await tx
        .update(persons)
        .set({
          insuranceStatus:     'CANCELLED',
          insuranceExpiryDate: effectiveExpiry,
          lastUpdatedDate:     new Date(),
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, enrolment.personId)))
    }
  } else if (enrolment.enrolmentType === 'DEPENDENT' && enrolment.dependentId) {
    await tx
      .update(personDependents)
      .set({
        isOnCompanyInsurance: false,
        insuranceStatus:      'CANCELLED',
        insuranceExpiryDate:  effectiveExpiry,
      })
      .where(and(eq(personDependents.tenantId, TENANT_ID), eq(personDependents.id, enrolment.dependentId)))

    // Decrement person's dependentCountInsured
    await tx
      .update(persons)
      .set({
        dependentCountInsured: sql`GREATEST(${persons.dependentCountInsured} - 1, 0)`,
        lastUpdatedDate:       new Date(),
      })
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, enrolment.personId)))
  }

  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: actor.legalEntityId,
    channel:       'WEB',
    eventType:     'INSURANCE.ENROLMENT_CANCELLED',
    resourceType:  'medical_insurance_enrolments',
    resourceId:    data.enrolmentId,
    entityId:      actor.legalEntityId,
    metadata: {
      cancellationDate:  data.cancellationDate,
      cancellationReason: data.cancellationReason,
      extensionDate:     data.extensionDate,
      effectiveExpiry,
    },
  }, tx)

  if (!data.suppressNotification) {
    await tx.insert(notificationLog).values({
      tenantId:          TENANT_ID,
      legalEntityId:     enrolment.legalEntityId,
      recipientPersonId: enrolment.personId,
      notificationType:  'INSURANCE_CANCELLED',
      channel:           'IN_APP',
      subjectEn:         `Your insurance coverage has been cancelled (effective ${effectiveExpiry})`,
      subjectAr:         `تم إلغاء تغطيتك التأمينية (نافذ المفعول ${effectiveExpiry})`,
      bodyEn:            `Your insurance enrolment has been cancelled with effect from ${effectiveExpiry}. Reason: ${data.cancellationReason}.${data.extensionDate ? ` Coverage extended until ${data.extensionDate}.` : ''} Please contact HR for further assistance.`,
      bodyAr:            `تم إلغاء تسجيلك في التأمين بتاريخ ${effectiveExpiry}. السبب: ${data.cancellationReason}.${data.extensionDate ? ` التغطية مُمتدة حتى ${data.extensionDate}.` : ''} يُرجى التواصل مع الموارد البشرية للمساعدة.`,
      referenceType:     'medical_insurance_enrolments',
      referenceId:       data.enrolmentId,
      referencePath:     `/persons/${enrolment.personId}/insurance`,
      status:            'PENDING',
      createdBy:         actor.id,
      createdByName:     actor.name,
    })
  }
}

// ── Change plan (close-open versioning) ───────────────────────────────────
// Used when an employee's plan changes (e.g. grade promotion, renewal cycle).
// Cancels the active enrolment and immediately opens a new one on the target plan.
// Callers must NOT call enrolEmployeeTx directly for plan changes — that path
// will throw CONFLICT because an active enrolment already exists.

export interface ChangePlanTxInput {
  personId:          string
  legalEntityId:     string
  newPlanId:         string
  changeDate:        string   // effective date of the plan change
  reason:            string
  notes?:            string
}

export async function changePlanTx(
  tx:    Tx,
  actor: ActorContext,
  data:  ChangePlanTxInput,
): Promise<{ closedEnrolmentId: string; newEnrolmentId: string }> {
  // Find the current active employee enrolment
  const [current] = await tx
    .select()
    .from(medicalInsuranceEnrolments)
    .where(and(
      eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
      eq(medicalInsuranceEnrolments.personId, data.personId),
      eq(medicalInsuranceEnrolments.enrolmentType, 'EMPLOYEE'),
      or(
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'PENDING'),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'RENEWAL_DUE'),
      ),
    ))
    .limit(1)

  if (!current) {
    throw new Error('NOT_FOUND: no active employee enrolment found to change plan from')
  }

  // DST-safe close date: last day of coverage = changeDate minus 1 (uses addDays from lib)
  const closeDate = addDays(data.changeDate, -1)
  const cancelReason = `Plan change: ${data.reason}`

  // Step 1a — cancel existing dependent enrolments on the old plan.
  // suppressNotification=true: a single PLAN_CHANGED notification is sent at the end.
  const activeDependentEnrolments = await tx
    .select({ id: medicalInsuranceEnrolments.id, dependentId: medicalInsuranceEnrolments.dependentId })
    .from(medicalInsuranceEnrolments)
    .where(and(
      eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
      eq(medicalInsuranceEnrolments.personId, data.personId),
      eq(medicalInsuranceEnrolments.enrolmentType, 'DEPENDENT'),
      or(
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'PENDING'),
      ),
    ))

  for (const dep of activeDependentEnrolments) {
    await cancelEnrolmentTx(tx, actor, {
      enrolmentId:          dep.id,
      cancellationDate:     closeDate,
      cancellationReason:   cancelReason,
      suppressNotification: true,
    })
  }

  // Step 1b — cancel existing employee enrolment
  await cancelEnrolmentTx(tx, actor, {
    enrolmentId:          current.id,
    cancellationDate:     closeDate,
    cancellationReason:   cancelReason,
    suppressNotification: true,
  })

  // Step 2a — open new employee enrolment on the new plan
  const { enrolmentId: newEnrolmentId } = await enrolEmployeeTx(tx, actor, {
    personId:      data.personId,
    legalEntityId: data.legalEntityId,
    planId:        data.newPlanId,
    effectiveDate: data.changeDate,
    notes:         data.notes,
  })

  // Step 2b — re-enrol each dependent on the new plan (best-effort; age/visa failures
  // must not block the employee plan change — HR can re-enrol manually from insurance tab)
  for (const dep of activeDependentEnrolments) {
    if (!dep.dependentId) continue
    try {
      await enrolDependentTx(tx, actor, {
        personId:      data.personId,
        dependentId:   dep.dependentId,
        legalEntityId: data.legalEntityId,
        planId:        data.newPlanId,
        effectiveDate: data.changeDate,
      })
    } catch {
      // BR-INS-002 / BR-INS-005 violations must not block employee plan change.
      // HR will receive a separate notification to re-enrol this dependent manually.
    }
  }

  // Single consolidated notification — replaces the suppressed cancel/enrol notifications
  await tx.insert(notificationLog).values({
    tenantId:          TENANT_ID,
    legalEntityId:     data.legalEntityId,
    recipientPersonId: data.personId,
    notificationType:  'INSURANCE_PLAN_CHANGED',
    channel:           'IN_APP',
    subjectEn:         `Your insurance plan has been updated`,
    subjectAr:         `تم تحديث خطة تأمينك`,
    bodyEn:            `Your insurance coverage has been moved to a new plan effective ${data.changeDate}. Reason: ${data.reason}. Please contact HR if you have any questions.`,
    bodyAr:            `تم نقل تغطيتك التأمينية إلى خطة جديدة اعتبارًا من ${data.changeDate}. السبب: ${data.reason}. يُرجى التواصل مع الموارد البشرية لأي استفسار.`,
    referenceType:     'medical_insurance_enrolments',
    referenceId:       newEnrolmentId,
    referencePath:     `/persons/${data.personId}/insurance`,
    status:            'PENDING',
    createdBy:         actor.id,
    createdByName:     actor.name,
  })

  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: data.legalEntityId,
    channel:       'WEB',
    eventType:     'INSURANCE.PLAN_CHANGED',
    resourceType:  'medical_insurance_enrolments',
    resourceId:    newEnrolmentId,
    entityId:      data.legalEntityId,
    actionMode:    'UPDATE',
    metadata: {
      previousEnrolmentId:    current.id,
      previousPlanId:         current.planId,
      newPlanId:              data.newPlanId,
      changeDate:             data.changeDate,
      reason:                 data.reason,
      dependentsTransferred:  activeDependentEnrolments.length,
    },
  }, tx)

  return { closedEnrolmentId: current.id, newEnrolmentId }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateMemberId(id: string): string {
  // Deterministic short ID derived from UUID — first 8 hex chars, uppercased
  return `MEM-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

