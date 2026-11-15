'use server'

/**
 * Payroll Server Actions — Sprint 11/12.
 *
 * Lifecycle:
 *   createPayrollRun  → DRAFT
 *   calculatePayrollRun → CALCULATED
 *   lockPayrollRun    → LOCKED
 *   submitPayrollForApproval → APPROVAL_PENDING (triggers Workflow V2)
 *   approvePayrollRun → APPROVED
 *   generateWpsSif    → SIF_GENERATED
 *   confirmPayrollRun → CONFIRMED
 *
 * Hard Rules enforced:
 *   HR-1: Every DB write is inside a Drizzle transaction + audit.log()
 *   HR-2: No hard deletes — status transitions only
 *   HR-4: Bilingual names (en + ar) where applicable
 *   HR-5: Server Action pattern: auth → zod → BR-xx → tx + audit → revalidate
 *   HR-10: Every table includes tenant_id
 */

import { randomUUID }      from 'crypto'
import { normalizeEffectiveEndDate } from '@/lib/effective-date'
import { revalidatePath }  from 'next/cache'
import { eq, and, desc, max, sql, lte, gte, notInArray, inArray, isNull } from 'drizzle-orm'
import { db }              from '@/lib/db'
import {
  payrollDefinitions,
  payrollRuns,
  payrollResults,
  salaryElements,
  eosbCalculations,
  persons,
  legalEntities,
  personBankDetails,
} from '@/drizzle/schema'
import {
  wpsSifRecords,
  gpssaContributions,
  dewsContributions,
} from '@/drizzle/schema'
import { writeAuditLog }   from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { isPayrollWorkstreamEnabled, PAYROLL_DISABLED_MESSAGE } from '@/lib/features/payroll-feature-gate'
import { assertSameEntity } from '@/lib/access'
import { decrypt }         from '@/lib/encryption'
import { TENANT_ID }       from '@/lib/constants'
import {
  createPayrollRunSchema,
  lockPayrollRunSchema,
  submitForApprovalSchema,
  approvePayrollRunSchema,
  rejectPayrollRunSchema,
  salaryElementSchema,
  payrollDefinitionSchema,
  wpsUpdateRecordSchema,
  eosbCalculationTriggerSchema,
  type CreatePayrollRunInput,
} from './validations'
import { submitWorkflow }  from '@/lib/workflow-engine'
import {
  calculateEmployeePayroll,
  aggregateRunTotals,
  calculateDewsContribution,
  computeYtd,
  validateWpsRecords,
} from './calculation-engine'
import { calculateEosb }   from './services'
import type { PayrollActionResult, PayrollEmployeeInput } from './types'

// ── Helper: run number sequence ───────────────────────────────────────────────
// RISK-PAYROLL-2 fix: nextRunNumber now requires a transaction reference and
// acquires a pg_advisory_xact_lock before reading MAX, matching the pattern used
// by the absence module's nextRequestNumber. This serialises concurrent
// createPayrollRun calls on the same legal entity — only one can read MAX + insert
// at a time, preventing duplicate PR-XXXXXX numbers without relying solely on the
// unique constraint to surface the collision as an error.

/**
 * P2-P2 — mask an IBAN for at-rest storage in wps_sif_records.
 * Keeps the real first-4 and last-4 (so the WPS preview shows a recognisable
 * value) and replaces the middle with '*'. The full IBAN is never persisted.
 */
function maskIban(iban: string): string {
  const v = (iban ?? '').trim()
  if (v.length <= 8) return v ? '*'.repeat(v.length) : ''
  return v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4)
}

async function nextRunNumber(
  legalEntityId: string,
  tx: { select: typeof db.select; execute: typeof db.execute },
): Promise<string> {
  // Advisory lock key: deterministic int derived from 'payroll_run:' + entity UUID.
  // This is scoped to the transaction and released on commit/rollback.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${'payroll_run:' + legalEntityId}))`,
  )
  const [row] = await tx
    .select({ maxNum: max(payrollRuns.runNumber) })
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.legalEntityId, legalEntityId),
      eq(payrollRuns.tenantId, TENANT_ID),
    ))
  const last = row?.maxNum ? parseInt(String(row.maxNum).replace(/\D/g, '') || '0') : 0
  const seq  = String(last + 1).padStart(6, '0')
  return `PR-${seq}`
}

// ── 1. Create Payroll Definition ──────────────────────────────────────────────

export async function upsertPayrollDefinition(
  formData: FormData,
  existingId?: string,
): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const raw = payrollDefinitionSchema.parse({
      legalEntityId:        formData.get('legalEntityId'),
      payrollCode:          formData.get('payrollCode'),
      payrollNameEn:        formData.get('payrollNameEn'),
      payrollNameAr:        formData.get('payrollNameAr') || null,
      payFrequency:         formData.get('payFrequency') || 'MONTHLY',
      paymentDayOfMonth:    formData.get('paymentDayOfMonth'),
      currency:             formData.get('currency') || 'AED',
      legislativeDataGroup: formData.get('legislativeDataGroup') || 'UAE',
      wpsBankCode:          formData.get('wpsBankCode') || null,
      oracleLedgerId:       formData.get('oracleLedgerId') || null,
    })

    const defId = existingId ?? randomUUID()

    await db.transaction(async tx => {
      if (existingId) {
        await tx.update(payrollDefinitions)
          .set({
            payrollCode:          raw.payrollCode,
            payrollNameEn:        raw.payrollNameEn,
            payrollNameAr:        raw.payrollNameAr ?? null,
            payFrequency:         raw.payFrequency,
            paymentDayOfMonth:    raw.paymentDayOfMonth,
            currency:             raw.currency,
            wpsBankCode:          raw.wpsBankCode ?? null,
            updatedBy:            actor.id,
            updatedByName:        actor.name,
            lastUpdatedDate:      new Date(),
          })
          .where(and(
            eq(payrollDefinitions.id, existingId),
            eq(payrollDefinitions.tenantId, TENANT_ID),
          ))
      } else {
        await tx.insert(payrollDefinitions).values({
          id:                   defId,
          tenantId:             TENANT_ID,
          legalEntityId:        raw.legalEntityId,
          payrollCode:          raw.payrollCode,
          payrollNameEn:        raw.payrollNameEn,
          payrollNameAr:        raw.payrollNameAr ?? null,
          payFrequency:         raw.payFrequency,
          paymentDayOfMonth:    raw.paymentDayOfMonth,
          currency:             raw.currency,
          legislativeDataGroup: raw.legislativeDataGroup,
          wpsBankCode:          raw.wpsBankCode ?? null,
          oracleLedgerId:       raw.oracleLedgerId ?? null,
          isActive:             true,
          createdBy:            actor.id,
          createdByName:        actor.name,
        })
      }

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: raw.legalEntityId,
        channel:      'WEB',
        eventType:    existingId ? 'PAYROLL.DEFINITION.UPDATE' : 'PAYROLL.DEFINITION.CREATE',
        resourceType: 'payroll_definitions',
        resourceId:   defId,
        entityId:     raw.legalEntityId,
        newValues:    raw,
        description:  `Payroll definition ${raw.payrollCode} ${existingId ? 'updated' : 'created'}`,
      }, tx)
    })

    revalidatePath('/payroll/definitions')
    return { success: true, message: `Payroll definition ${existingId ? 'updated' : 'created'}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 2. Create Payroll Run ─────────────────────────────────────────────────────

export async function createPayrollRun(
  input: CreatePayrollRunInput,
): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const raw = createPayrollRunSchema.parse(input)

    // P2-P3 — block creating a run for another entity (SUPER_ADMIN bypasses).
    assertSameEntity(actor, raw.legalEntityId)

    // Verify payroll definition exists and belongs to entity
    const [def] = await db
      .select({ id: payrollDefinitions.id })
      .from(payrollDefinitions)
      .where(and(
        eq(payrollDefinitions.id, raw.payrollId),
        eq(payrollDefinitions.legalEntityId, raw.legalEntityId),
        eq(payrollDefinitions.isActive, true),
        eq(payrollDefinitions.tenantId, TENANT_ID),
      ))
      .limit(1)
    if (!def) throw new Error('Payroll definition not found for this legal entity')

    const runId     = randomUUID()

    // BR-WPS-001: WPS deadline = payment date + 1 day (must pay by end of month)
    const payDate   = new Date(raw.paymentDate)
    const wpsDeadline = new Date(payDate)
    wpsDeadline.setDate(wpsDeadline.getDate() + 1)
    const wpsDeadlineStr = wpsDeadline.toISOString().slice(0, 10)

    let runNumber!: string

    await db.transaction(async tx => {
      // RISK-PAYROLL-2: generate run number inside tx with advisory lock so concurrent
      // createPayrollRun calls on the same entity cannot race to the same MAX value.
      runNumber = await nextRunNumber(raw.legalEntityId, tx)

      // P2-P5 — idempotency: refuse a second REGULAR run that overlaps an existing
      // (non-cancelled/rejected) REGULAR run for the same payroll definition, which
      // would otherwise pay employees twice for the same period. Off-cycle / final
      // settlement runs may legitimately overlap and are not blocked. Runs inside
      // the advisory-locked tx, so two concurrent creates cannot both pass.
      if (raw.runType === 'REGULAR') {
        const [dup] = await tx
          .select({ runNumber: payrollRuns.runNumber })
          .from(payrollRuns)
          .where(and(
            eq(payrollRuns.tenantId, TENANT_ID),
            eq(payrollRuns.payrollId, raw.payrollId),
            eq(payrollRuns.runType, 'REGULAR'),
            notInArray(payrollRuns.status, ['CANCELLED', 'REJECTED']),
            lte(payrollRuns.payPeriodStart, raw.payPeriodEnd),
            gte(payrollRuns.payPeriodEnd, raw.payPeriodStart),
          ))
          .limit(1)
        if (dup) {
          throw new Error(
            `A payroll run (${dup.runNumber}) already covers an overlapping period for this payroll. ` +
            `Cancel it first, or create an off-cycle run instead.`,
          )
        }
      }

      await tx.insert(payrollRuns).values({
        id:             runId,
        tenantId:       TENANT_ID,
        payrollId:      raw.payrollId,
        legalEntityId:  raw.legalEntityId,
        runNumber,
        payPeriodStart: raw.payPeriodStart,
        payPeriodEnd:   raw.payPeriodEnd,
        paymentDate:    raw.paymentDate,
        runType:        raw.runType,
        status:         'DRAFT',
        wpsDeadline:    wpsDeadlineStr,
        notes:          raw.notes ?? null,
        createdBy:      actor.id,
        createdByName:  actor.name,
      })

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: raw.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.RUN.CREATE',
        resourceType: 'payroll_runs',
        resourceId:   runId,
        entityId:     raw.legalEntityId,
        newValues:    { runNumber, runType: raw.runType, payPeriodStart: raw.payPeriodStart, payPeriodEnd: raw.payPeriodEnd },
        description:  `Payroll run ${runNumber} created`,
      }, tx)
    })

    revalidatePath('/payroll/runs')
    return { success: true, runId, message: `Payroll run ${runNumber} created` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 3. Calculate Payroll Run ──────────────────────────────────────────────────

export async function calculatePayrollRun(runId: string): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const [run] = await db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, TENANT_ID)))
      .limit(1)
    if (!run) throw new Error('Payroll run not found')
    // P2-P3 — block cross-entity payroll access: the actor's entity must match
    // the run's (SUPER_ADMIN bypasses). Scoping by tenant alone is insufficient.
    assertSameEntity(actor, run.legalEntityId)
    if (!['DRAFT', 'PRE_CHECKS_PASSED'].includes(run.status)) {
      throw new Error(`Cannot calculate a run in status: ${run.status}`)
    }

    // Get legal entity EOSB scheme
    const [entity] = await db
      .select({ eosbScheme: legalEntities.eosbScheme })
      .from(legalEntities)
      .where(eq(legalEntities.id, run.legalEntityId))
      .limit(1)
    const eosbScheme = (entity?.eosbScheme ?? 'TRADITIONAL') as PayrollEmployeeInput['eosbScheme']

    // Fetch active employees
    const employees = await db
      .select({
        personId:            persons.id,
        nationalityCategory: persons.nationalityCategory,
        hireDate:            persons.hireDate,
        assignmentStatus:    persons.assignmentStatus,
        basicSalary:         persons.basicSalary,
        employeePremiumAed:  persons.employeePremiumAed,
        employerPremiumAed:  persons.employerPremiumAed,
      })
      .from(persons)
      .where(and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.legalEntityId, run.legalEntityId),
        eq(persons.isActive, true),
        sql`${persons.payrollId} = ${run.payrollId}`,
        sql`${persons.assignmentStatus} IN ('ACTIVE', 'ON_LEAVE', 'SUSPENDED')`,
      ))

    if (employees.length === 0) throw new Error('No active employees found for this payroll')

    // Fetch salary elements for the period
    const periodStart = String(run.payPeriodStart)
    const periodEnd   = String(run.payPeriodEnd)

    const allElements = await db
      .select()
      .from(salaryElements)
      .where(and(
        eq(salaryElements.tenantId, TENANT_ID),
        eq(salaryElements.payrollId, run.payrollId),
        sql`${salaryElements.effectiveStartDate} <= ${periodEnd}`,
        gte(salaryElements.effectiveEndDate, periodStart),
      ))

    // Build element map by person
    const elementsByPerson = new Map<string, typeof allElements>()
    for (const el of allElements) {
      if (!elementsByPerson.has(el.personId)) elementsByPerson.set(el.personId, [])
      elementsByPerson.get(el.personId)!.push(el)
    }

    const calculations = employees.map(emp => {
      const elements = elementsByPerson.get(emp.personId) ?? []
      const basicEl = elements.find(e => e.elementCode === 'BASIC' && e.elementClassification === 'EARNINGS')
      const housingEl = elements.find(e => e.elementCode === 'HOUSING')
      const transportEl = elements.find(e => e.elementCode === 'TRANSPORT')

      const input: PayrollEmployeeInput = {
        personId:               emp.personId,
        assignmentId:           null,
        nationalityCategory:    emp.nationalityCategory,
        hireDate:               String(emp.hireDate),
        assignmentStatus:       emp.assignmentStatus,
        suspensionDays:         0,
        basicSalary:            basicEl ? Number(basicEl.amount ?? 0) : Number(emp.basicSalary ?? 0),
        housingAllowance:       housingEl ? Number(housingEl.amount ?? 0) : 0,
        transportAllowance:     transportEl ? Number(transportEl.amount ?? 0) : 0,
        otherAllowances:        elements
          .filter(e => e.elementClassification === 'EARNINGS' && !['BASIC','HOUSING','TRANSPORT','OVERTIME','BONUS'].includes(e.elementCode))
          .reduce((s, e) => s + Number(e.amount ?? 0), 0),
        overtimePay:            elements.find(e => e.elementCode === 'OVERTIME') ? Number(elements.find(e => e.elementCode === 'OVERTIME')!.amount ?? 0) : 0,
        bonus:                  elements.find(e => e.elementCode === 'BONUS') ? Number(elements.find(e => e.elementCode === 'BONUS')!.amount ?? 0) : 0,
        sickLeaveDeduct:        elements.filter(e => e.elementCode === 'SICK_DEDUCT').reduce((s,e) => s + Number(e.amount ?? 0), 0),
        unpaidLeaveDeduct:      elements.filter(e => e.elementCode === 'UNPAID_DEDUCT').reduce((s,e) => s + Number(e.amount ?? 0), 0),
        salaryAdvanceDeduct:    elements.filter(e => e.elementCode === 'ADVANCE_DEDUCT').reduce((s,e) => s + Number(e.amount ?? 0), 0),
        medicalInsuranceDeduct: Number(emp.employeePremiumAed ?? 0) / 12,
        otherDeductions:        elements.filter(e => e.elementClassification === 'DEDUCTION' && !['SICK_DEDUCT','UNPAID_DEDUCT','ADVANCE_DEDUCT'].includes(e.elementCode)).reduce((s,e) => s + Number(e.amount ?? 0), 0),
        priorMonthNetPay:       null,
        eosbScheme,
      }

      return calculateEmployeePayroll(input)
    })

    const totals = aggregateRunTotals(calculations)

    await db.transaction(async tx => {
      // Delete any existing results for re-calculation
      await tx.delete(payrollResults).where(and(
        eq(payrollResults.payrollRunId, runId),
        eq(payrollResults.tenantId, TENANT_ID),
      ))

      // Insert fresh results
      for (const calc of calculations) {
        await tx.insert(payrollResults).values({
          id:                    randomUUID(),
          tenantId:              TENANT_ID,
          payrollRunId:          runId,
          personId:              calc.personId,
          legalEntityId:         run.legalEntityId,
          assignmentId:          calc.assignmentId ?? null,
          basicSalary:           String(calc.basicSalary),
          housingAllowance:      String(calc.housingAllowance),
          transportAllowance:    String(calc.transportAllowance),
          otherAllowances:       String(calc.otherAllowances),
          overtimePay:           String(calc.overtimePay),
          bonus:                 String(calc.bonus),
          commission:            '0',
          retroPay:              '0',
          totalGrossPay:         String(calc.totalGrossPay),
          sickLeaveDeduction:    String(calc.sickLeaveDeduction),
          unpaidLeaveDeduction:  String(calc.unpaidLeaveDeduction),
          salaryAdvanceDeduct:   String(calc.salaryAdvanceDeduct),
          gpssaEmployeeDeduct:   String(calc.gpssaEmployeeDeduct),
          medicalInsuranceDeduct: String(calc.medicalInsuranceDeduct),
          otherDeductions:       String(calc.otherDeductions),
          totalDeductions:       String(calc.totalDeductions),
          netPay:                String(calc.netPay),
          gpssaEmployerContrib:  String(calc.gpssaEmployerContrib),
          eosbProvision:         String(calc.eosbProvision),
          medicalInsuranceEr:    String(calc.medicalInsuranceEr),
          totalEmployerCost:     String(calc.totalEmployerCost),
          paymentStatus:         'PENDING',
          priorMonthNetPay:      calc.priorMonthNetPay !== null ? String(calc.priorMonthNetPay) : null,
          variancePct:           calc.variancePct !== null ? String(calc.variancePct) : null,
          isVarianceFlagged:     calc.isVarianceFlagged,
          ytdGrossPay:           String(calc.totalGrossPay),
          ytdNetPay:             String(calc.netPay),
          ytdEosbProvision:      String(calc.eosbProvision),
          ytdGpssa:              String(calc.gpssaEmployeeDeduct),
          createdBy:             actor.id,
          createdByName:         actor.name,
        })
      }

      // Update run totals
      await tx.update(payrollRuns)
        .set({
          status:             'CALCULATED',
          employeeCount:      totals.employeeCount,
          totalGrossPay:      String(totals.totalGrossPay),
          totalDeductions:    String(totals.totalDeductions),
          totalNetPay:        String(totals.totalNetPay),
          totalEmployerCost:  String(totals.totalEmployerCost),
          totalEosbProvision: String(totals.totalEosbProvision),
          totalGpssaEmployer: String(totals.totalGpssaEmployer),
          updatedBy:          actor.id,
          updatedByName:      actor.name,
          lastUpdatedDate:    new Date(),
        })
        .where(eq(payrollRuns.id, runId))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: run.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.RUN.CALCULATE',
        resourceType: 'payroll_runs',
        resourceId:   runId,
        entityId:     run.legalEntityId,
        newValues:    { status: 'CALCULATED', employeeCount: totals.employeeCount, totalNetPay: totals.totalNetPay },
        description:  `Payroll run ${run.runNumber} calculated — ${totals.employeeCount} employees`,
      }, tx)
    })

    revalidatePath(`/payroll/runs/${runId}`)
    revalidatePath('/payroll/runs')
    return { success: true, runId, message: `Calculated ${totals.employeeCount} employee payrolls` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 4. Lock Payroll Run ───────────────────────────────────────────────────────

export async function lockPayrollRun(formData: FormData): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const raw = lockPayrollRunSchema.parse({
      runId:      formData.get('runId'),
      lockReason: formData.get('lockReason') || null,
    })

    const [run] = await db
      .select({ status: payrollRuns.status, runNumber: payrollRuns.runNumber, legalEntityId: payrollRuns.legalEntityId })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, raw.runId), eq(payrollRuns.tenantId, TENANT_ID)))
      .limit(1)
    if (!run) throw new Error('Payroll run not found')
    // P2-P3 — block cross-entity payroll access: the actor's entity must match
    // the run's (SUPER_ADMIN bypasses). Scoping by tenant alone is insufficient.
    assertSameEntity(actor, run.legalEntityId)
    if (!['CALCULATED', 'UNDER_REVIEW'].includes(run.status)) {
      throw new Error(`Cannot lock a run in status: ${run.status}`)
    }

    await db.transaction(async tx => {
      await tx.update(payrollRuns)
        .set({
          status:          'LOCKED',
          lockedAt:        new Date(),
          lockedBy:        actor.id,
          lockReason:      raw.lockReason ?? null,
          updatedBy:       actor.id,
          updatedByName:   actor.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(payrollRuns.id, raw.runId))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: run.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.RUN.LOCK',
        resourceType: 'payroll_runs',
        resourceId:   raw.runId,
        entityId:     run.legalEntityId,
        newValues:    { status: 'LOCKED', lockReason: raw.lockReason },
        description:  `Payroll run ${run.runNumber} locked`,
      }, tx)
    })

    revalidatePath(`/payroll/runs/${raw.runId}`)
    return { success: true, runId: raw.runId, message: 'Payroll run locked' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 5. Submit Payroll for Approval (Workflow V2) ──────────────────────────────

export async function submitPayrollForApproval(
  formData: FormData,
): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const raw = submitForApprovalSchema.parse({ runId: formData.get('runId') })

    const [run] = await db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, raw.runId), eq(payrollRuns.tenantId, TENANT_ID)))
      .limit(1)
    if (!run) throw new Error('Payroll run not found')
    // P2-P3 — block cross-entity payroll access: the actor's entity must match
    // the run's (SUPER_ADMIN bypasses). Scoping by tenant alone is insufficient.
    assertSameEntity(actor, run.legalEntityId)
    if (run.status !== 'LOCKED') {
      throw new Error('Payroll must be locked before submitting for approval')
    }

    // Trigger Workflow V2 approval chain
    const wfResult = await submitWorkflow({
      workflowCode:          'PAYROLL_RUN_APPROVAL',
      resourceType:          'payroll_runs',
      resourceId:            raw.runId,
      initiatedByPersonId:   actor.personId ?? actor.id,
      legalEntityId:         run.legalEntityId,
    })

    if (!wfResult.success) {
      throw new Error(wfResult.error ?? 'Failed to start approval workflow')
    }

    await db.transaction(async tx => {
      await tx.update(payrollRuns)
        .set({
          status:          'APPROVAL_PENDING',
          updatedBy:       actor.id,
          updatedByName:   actor.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(payrollRuns.id, raw.runId))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: run.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.RUN.SUBMIT_APPROVAL',
        resourceType: 'payroll_runs',
        resourceId:   raw.runId,
        entityId:     run.legalEntityId,
        newValues:    { status: 'APPROVAL_PENDING', workflowInstanceId: wfResult.instanceId },
        description:  `Payroll run ${run.runNumber} submitted for approval`,
      }, tx)
    })

    revalidatePath(`/payroll/runs/${raw.runId}`)
    return { success: true, runId: raw.runId, message: 'Payroll submitted for approval' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 6. Approve Payroll Run (Finance) ─────────────────────────────────────────

export async function approvePayrollRun(
  formData: FormData,
): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN', 'FINANCE'])

    const raw = approvePayrollRunSchema.parse({
      runId: formData.get('runId'),
      note:  formData.get('note') || null,
    })

    const [run] = await db
      .select({ status: payrollRuns.status, runNumber: payrollRuns.runNumber, legalEntityId: payrollRuns.legalEntityId })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, raw.runId), eq(payrollRuns.tenantId, TENANT_ID)))
      .limit(1)
    if (!run) throw new Error('Payroll run not found')
    // P2-P3 — block cross-entity payroll access: the actor's entity must match
    // the run's (SUPER_ADMIN bypasses). Scoping by tenant alone is insufficient.
    assertSameEntity(actor, run.legalEntityId)
    if (run.status !== 'APPROVAL_PENDING') {
      throw new Error('Payroll is not pending approval')
    }

    await db.transaction(async tx => {
      await tx.update(payrollRuns)
        .set({
          status:               'APPROVED',
          financeApprovedBy:    actor.personId ?? null,
          financeApprovalDate:  new Date(),
          updatedBy:            actor.id,
          updatedByName:        actor.name,
          lastUpdatedDate:      new Date(),
        })
        .where(eq(payrollRuns.id, raw.runId))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: run.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.RUN.APPROVE',
        resourceType: 'payroll_runs',
        resourceId:   raw.runId,
        entityId:     run.legalEntityId,
        newValues:    { status: 'APPROVED', note: raw.note },
        description:  `Payroll run ${run.runNumber} approved by ${actor.name}`,
      }, tx)
    })

    revalidatePath(`/payroll/runs/${raw.runId}`)
    return { success: true, runId: raw.runId, message: 'Payroll approved' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 7. Reject Payroll Run ─────────────────────────────────────────────────────

export async function rejectPayrollRun(
  formData: FormData,
): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN', 'FINANCE'])

    const raw = rejectPayrollRunSchema.parse({
      runId:  formData.get('runId'),
      reason: formData.get('reason'),
    })

    const [run] = await db
      .select({ status: payrollRuns.status, runNumber: payrollRuns.runNumber, legalEntityId: payrollRuns.legalEntityId })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, raw.runId), eq(payrollRuns.tenantId, TENANT_ID)))
      .limit(1)
    if (!run) throw new Error('Payroll run not found')
    // P2-P3 — block cross-entity payroll access: the actor's entity must match
    // the run's (SUPER_ADMIN bypasses). Scoping by tenant alone is insufficient.
    assertSameEntity(actor, run.legalEntityId)
    if (run.status !== 'APPROVAL_PENDING') throw new Error('Payroll is not pending approval')

    await db.transaction(async tx => {
      await tx.update(payrollRuns)
        .set({
          status:          'LOCKED', // Returns to LOCKED for re-submission
          updatedBy:       actor.id,
          updatedByName:   actor.name,
          lastUpdatedDate: new Date(),
          notes:           raw.reason,
        })
        .where(eq(payrollRuns.id, raw.runId))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: run.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.RUN.REJECT',
        resourceType: 'payroll_runs',
        resourceId:   raw.runId,
        entityId:     run.legalEntityId,
        newValues:    { status: 'LOCKED', reason: raw.reason },
        description:  `Payroll run ${run.runNumber} rejected: ${raw.reason}`,
      }, tx)
    })

    revalidatePath(`/payroll/runs/${raw.runId}`)
    return { success: true, runId: raw.runId, message: 'Payroll rejected and returned to locked state' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 8. Generate WPS SIF ───────────────────────────────────────────────────────

export async function generateWpsSif(runId: string): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const [run] = await db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, TENANT_ID)))
      .limit(1)
    if (!run) throw new Error('Payroll run not found')
    // P2-P3 — block cross-entity payroll access: the actor's entity must match
    // the run's (SUPER_ADMIN bypasses). Scoping by tenant alone is insufficient.
    assertSameEntity(actor, run.legalEntityId)
    if (run.status !== 'APPROVED') throw new Error('Payroll must be approved before SIF generation')

    // Fetch approved results for WPS
    const results = await db
      .select({
        personId:         payrollResults.personId,
        netPay:           payrollResults.netPay,
        fullNameEn:       persons.fullNameEn,
        personNumber:     persons.personNumber,
        labourCardNumber: persons.labourCardNumber,
      })
      .from(payrollResults)
      .leftJoin(persons, eq(payrollResults.personId, persons.id))
      .where(and(
        eq(payrollResults.payrollRunId, runId),
        eq(payrollResults.tenantId, TENANT_ID),
      ))

    // P2-P1 / P2-P2 — source bank details from the ENCRYPTED master
    // (person_bank_details), NOT payroll_results (which never stored them — the
    // old code read always-null payrollResults.iban so every SIF failed validation).
    // The IBAN is decrypted transiently here to validate + build the SIF; the full
    // IBAN is NEVER persisted at rest — wps_sif_records stores a masked form (below).
    const personIds = results.map(r => r.personId)
    const bankByPerson = new Map<string, { iban: string; bankCode: string }>()
    if (personIds.length > 0) {
      const bankRows = await db
        .select({
          personId:  personBankDetails.personId,
          bankCode:  personBankDetails.bankCode,
          iban:      personBankDetails.iban,
        })
        .from(personBankDetails)
        .where(and(
          eq(personBankDetails.tenantId, TENANT_ID),
          inArray(personBankDetails.personId, personIds),
          isNull(personBankDetails.effectiveTo),   // current account only
        ))
        // prefer the designated WPS account, then the primary account
        .orderBy(desc(personBankDetails.isWpsAccount), desc(personBankDetails.isPrimary))
      for (const b of bankRows) {
        if (bankByPerson.has(b.personId)) continue   // first (highest-priority) row wins
        let plainIban = ''
        try { plainIban = decrypt(b.iban) } catch { plainIban = '' }
        bankByPerson.set(b.personId, { iban: plainIban, bankCode: b.bankCode })
      }
    }

    // Get entity WPS code
    const [entity] = await db
      .select({ wpsEmployerCode: legalEntities.wpsEmployerCode })
      .from(legalEntities)
      .where(eq(legalEntities.id, run.legalEntityId))
      .limit(1)

    const employerLabourCode = entity?.wpsEmployerCode ?? 'UNKNOWN'

    // Validate WPS requirements (BR-WPS-001)
    const validation = validateWpsRecords(results.map(r => {
      const bank = bankByPerson.get(r.personId)
      return {
        personId:           r.personId,
        fullNameEn:         r.fullNameEn ?? '',
        iban:               bank?.iban ?? null,        // full (decrypted) IBAN — validated, not persisted
        routingCode:        bank?.bankCode ?? null,
        netPayAed:          Number(r.netPay ?? 0),
        employerLabourCode,
        employeeLabourCard: r.labourCardNumber,
      }
    }))

    if (!validation.isValid) {
      const errorSummary = validation.errors.slice(0, 5).map(e => `${e.personId}: ${e.message}`).join('; ')
      throw new Error(`WPS validation failed: ${errorSummary}`)
    }

    const payDate = new Date(String(run.paymentDate))
    const sifRef  = `SIF-${run.runNumber}-${Date.now()}`

    await db.transaction(async tx => {
      // Delete old SIF records
      await tx.delete(wpsSifRecords).where(and(
        eq(wpsSifRecords.payrollRunId, runId),
        eq(wpsSifRecords.tenantId, TENANT_ID),
      ))

      // Insert new SIF records
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        const bank = bankByPerson.get(r.personId)
        await tx.insert(wpsSifRecords).values({
          id:                   randomUUID(),
          tenantId:             TENANT_ID,
          payrollRunId:         runId,
          personId:             r.personId,
          legalEntityId:        run.legalEntityId,
          employerLabourCode,
          employeeLabourCard:   r.labourCardNumber ?? null,
          routingCode:          bank?.bankCode ?? '000',
          // P2-P2 — store a MASKED IBAN only (real first-4/last-4 preserved for the
          // preview); no full IBAN at rest. The eventual SIF file export must
          // re-source + decrypt from person_bank_details at emit time.
          iban:                 maskIban(bank?.iban ?? ''),
          netPayAed:            String(r.netPay ?? 0),
          currency:             'AED',
          paymentMonth:         payDate.getMonth() + 1,
          paymentYear:          payDate.getFullYear(),
          sifLineNumber:        i + 1,
          sifStatus:            'INCLUDED',
          createdBy:            actor.id,
          createdByName:        actor.name,
        })
      }

      // Update run status and SIF reference
      await tx.update(payrollRuns)
        .set({
          status:          'SIF_GENERATED',
          sifFileReference: sifRef,
          sifGeneratedAt:  new Date(),
          updatedBy:       actor.id,
          updatedByName:   actor.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(payrollRuns.id, runId))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: run.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.WPS.SIF_GENERATE',
        resourceType: 'payroll_runs',
        resourceId:   runId,
        entityId:     run.legalEntityId,
        newValues:    { status: 'SIF_GENERATED', sifReference: sifRef, recordCount: results.length },
        description:  `WPS SIF generated for ${run.runNumber}: ${results.length} records`,
      }, tx)
    })

    revalidatePath(`/payroll/runs/${runId}`)
    revalidatePath('/payroll/wps')
    return { success: true, runId, message: `WPS SIF generated for ${results.length} employees` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 9. Confirm Payroll Run ────────────────────────────────────────────────────

export async function confirmPayrollRun(runId: string): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const [run] = await db
      .select({ status: payrollRuns.status, runNumber: payrollRuns.runNumber, legalEntityId: payrollRuns.legalEntityId })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, TENANT_ID)))
      .limit(1)
    if (!run) throw new Error('Payroll run not found')
    // P2-P3 — block cross-entity payroll access: the actor's entity must match
    // the run's (SUPER_ADMIN bypasses). Scoping by tenant alone is insufficient.
    assertSameEntity(actor, run.legalEntityId)
    if (!['SIF_GENERATED', 'SUBMITTED_TO_BANK'].includes(run.status)) {
      throw new Error(`Cannot confirm run in status: ${run.status}`)
    }

    await db.transaction(async tx => {
      await tx.update(payrollRuns)
        .set({
          status:          'CONFIRMED',
          wpsConfirmationDate: new Date(),
          updatedBy:       actor.id,
          updatedByName:   actor.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(payrollRuns.id, runId))

      // Mark all WPS records as PAID
      await tx.update(wpsSifRecords)
        .set({ sifStatus: 'PAID' })
        .where(and(
          eq(wpsSifRecords.payrollRunId, runId),
          eq(wpsSifRecords.tenantId, TENANT_ID),
        ))

      // Mark payroll results as PAID
      await tx.update(payrollResults)
        .set({ paymentStatus: 'PAID' })
        .where(and(
          eq(payrollResults.payrollRunId, runId),
          eq(payrollResults.tenantId, TENANT_ID),
        ))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: run.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.RUN.CONFIRM',
        resourceType: 'payroll_runs',
        resourceId:   runId,
        entityId:     run.legalEntityId,
        newValues:    { status: 'CONFIRMED' },
        description:  `Payroll run ${run.runNumber} confirmed`,
      }, tx)
    })

    revalidatePath(`/payroll/runs/${runId}`)
    revalidatePath('/payroll')
    return { success: true, runId, message: `Payroll run ${run.runNumber} confirmed` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 10. Salary Element CRUD ───────────────────────────────────────────────────

export async function upsertSalaryElement(
  formData: FormData,
  existingId?: string,
): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const raw = salaryElementSchema.parse({
      personId:              formData.get('personId'),
      assignmentId:          formData.get('assignmentId'),
      legalEntityId:         formData.get('legalEntityId'),
      payrollId:             formData.get('payrollId'),
      elementCode:           formData.get('elementCode'),
      elementNameEn:         formData.get('elementNameEn'),
      elementNameAr:         formData.get('elementNameAr') || null,
      elementClassification: formData.get('elementClassification'),
      amount:                formData.get('amount') || null,
      percentageBasis:       formData.get('percentageBasis') || null,
      percentageValue:       formData.get('percentageValue') || null,
      currency:              formData.get('currency') || 'AED',
      isRecurring:           formData.get('isRecurring') === 'true',
      effectiveStartDate:    formData.get('effectiveStartDate'),
      effectiveEndDate:      normalizeEffectiveEndDate(formData.get('effectiveEndDate')?.toString() || null),
      processingOrder:       formData.get('processingOrder') || 100,
      isSubjectToEosb:       formData.get('isSubjectToEosb') === 'true',
      isSubjectToGpssa:      formData.get('isSubjectToGpssa') === 'true',
      isWpsReportable:       formData.get('isWpsReportable') !== 'false',
      glAccountCode:         formData.get('glAccountCode') || null,
      notes:                 formData.get('notes') || null,
    })

    const elId = existingId ?? randomUUID()

    await db.transaction(async tx => {
      if (existingId) {
        // HR-2: close existing record (effective-date pattern)
        await tx.update(salaryElements)
          .set({ effectiveEndDate: raw.effectiveStartDate })
          .where(and(
            eq(salaryElements.id, existingId),
            eq(salaryElements.tenantId, TENANT_ID),
          ))
        // Insert new version
        await tx.insert(salaryElements).values({
          id:                    randomUUID(),
          tenantId:              TENANT_ID,
          personId:              raw.personId,
          assignmentId:          raw.assignmentId,
          legalEntityId:         raw.legalEntityId,
          payrollId:             raw.payrollId,
          elementCode:           raw.elementCode,
          elementNameEn:         raw.elementNameEn,
          elementNameAr:         raw.elementNameAr ?? null,
          elementClassification: raw.elementClassification,
          amount:                raw.amount !== null ? String(raw.amount) : null,
          percentageBasis:       raw.percentageBasis ?? null,
          percentageValue:       raw.percentageValue !== null ? String(raw.percentageValue) : null,
          currency:              raw.currency,
          isRecurring:           raw.isRecurring,
          effectiveStartDate:    raw.effectiveStartDate,
          effectiveEndDate:      normalizeEffectiveEndDate(raw.effectiveEndDate),
          actionMode:            'UPDATE',
          processingOrder:       raw.processingOrder,
          isSubjectToEosb:       raw.isSubjectToEosb,
          isSubjectToGpssa:      raw.isSubjectToGpssa,
          isWpsReportable:       raw.isWpsReportable,
          glAccountCode:         raw.glAccountCode ?? null,
          notes:                 raw.notes ?? null,
          createdBy:             actor.id,
          createdByName:         actor.name,
        })
      } else {
        await tx.insert(salaryElements).values({
          id:                    elId,
          tenantId:              TENANT_ID,
          personId:              raw.personId,
          assignmentId:          raw.assignmentId,
          legalEntityId:         raw.legalEntityId,
          payrollId:             raw.payrollId,
          elementCode:           raw.elementCode,
          elementNameEn:         raw.elementNameEn,
          elementNameAr:         raw.elementNameAr ?? null,
          elementClassification: raw.elementClassification,
          amount:                raw.amount !== null ? String(raw.amount) : null,
          percentageBasis:       raw.percentageBasis ?? null,
          percentageValue:       raw.percentageValue !== null ? String(raw.percentageValue) : null,
          currency:              raw.currency,
          isRecurring:           raw.isRecurring,
          effectiveStartDate:    raw.effectiveStartDate,
          actionMode:            'UPDATE',
          effectiveEndDate:      normalizeEffectiveEndDate(raw.effectiveEndDate),
          processingOrder:       raw.processingOrder,
          isSubjectToEosb:       raw.isSubjectToEosb,
          isSubjectToGpssa:      raw.isSubjectToGpssa,
          isWpsReportable:       raw.isWpsReportable,
          glAccountCode:         raw.glAccountCode ?? null,
          notes:                 raw.notes ?? null,
          createdBy:             actor.id,
          createdByName:         actor.name,
        })
      }

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: raw.legalEntityId,
        channel:      'WEB',
        eventType:    existingId ? 'PAYROLL.ELEMENT.UPDATE' : 'PAYROLL.ELEMENT.CREATE',
        resourceType: 'salary_elements',
        resourceId:   elId,
        entityId:     raw.legalEntityId,
        newValues:    { personId: raw.personId, elementCode: raw.elementCode, amount: raw.amount },
        description:  `Salary element ${raw.elementCode} ${existingId ? 'updated' : 'created'} for person ${raw.personId}`,
      }, tx)
    })

    revalidatePath(`/persons/${raw.personId}`)
    return { success: true, message: `Salary element ${existingId ? 'updated' : 'created'}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 11. WPS Record Status Update ─────────────────────────────────────────────

export async function updateWpsRecord(formData: FormData): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const raw = wpsUpdateRecordSchema.parse({
      sifRecordId:     formData.get('sifRecordId'),
      sifStatus:       formData.get('sifStatus'),
      exclusionReason: formData.get('exclusionReason') || null,
    })

    await db.transaction(async tx => {
      await tx.update(wpsSifRecords)
        .set({
          sifStatus:       raw.sifStatus,
          exclusionReason: raw.exclusionReason ?? null,
          updatedBy:       actor.id,
          updatedByName:   actor.name,
          lastUpdatedDate: new Date(),
        })
        .where(and(
          eq(wpsSifRecords.id, raw.sifRecordId),
          eq(wpsSifRecords.tenantId, TENANT_ID),
        ))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'PAYROLL.WPS.RECORD_UPDATE',
        resourceType: 'wps_sif_records',
        resourceId:   raw.sifRecordId,
        newValues:    { sifStatus: raw.sifStatus, exclusionReason: raw.exclusionReason },
        description:  `WPS record ${raw.sifRecordId} status updated to ${raw.sifStatus}`,
      }, tx)
    })

    revalidatePath('/payroll/wps')
    return { success: true, message: `WPS record status updated to ${raw.sifStatus}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── 12. Trigger EOSB Calculation ─────────────────────────────────────────────

export async function triggerEosbCalculation(
  formData: FormData,
): Promise<PayrollActionResult> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { success: false, error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const raw = eosbCalculationTriggerSchema.parse({
      personId:        formData.get('personId'),
      legalEntityId:   formData.get('legalEntityId'),
      calculationType: formData.get('calculationType'),
      calculationDate: formData.get('calculationDate'),
      terminationDate: formData.get('terminationDate') || null,
      payrollRunId:    formData.get('payrollRunId') || null,
      notes:           formData.get('notes') || null,
    })

    const [person] = await db
      .select({
        nationalityCategory: persons.nationalityCategory,
        hireDate:            persons.hireDate,
        basicSalary:         persons.basicSalary,
      })
      .from(persons)
      .where(and(eq(persons.id, raw.personId), eq(persons.tenantId, TENANT_ID)))
      .limit(1)
    if (!person) throw new Error('Person not found')

    const result = calculateEosb({
      person:           { nationalityCategory: person.nationalityCategory },
      basicSalary:      Number(person.basicSalary ?? 0),
      hireDate:         String(person.hireDate),
      calculationDate:  raw.calculationDate,
    })

    const calcId = randomUUID()

    await db.transaction(async tx => {
      const hire     = new Date(String(person.hireDate))
      const calcDate = new Date(raw.calculationDate)
      const msPerDay = 86_400_000
      const calendarDays = Math.round(Math.abs(calcDate.getTime() - hire.getTime()) / msPerDay)

      await tx.insert(eosbCalculations).values({
        id:                   calcId,
        tenantId:             TENANT_ID,
        personId:             raw.personId,
        legalEntityId:        raw.legalEntityId,
        calculationType:      raw.calculationType,
        calculationDate:      raw.calculationDate,
        hireDate:             String(person.hireDate),
        terminationDate:      raw.terminationDate ?? null,
        basicSalaryAtCalc:    String(person.basicSalary ?? 0),
        totalUnpaidLeaveDays: 0,
        totalCalendarDays:    calendarDays,
        netServiceDays:       calendarDays,
        serviceYears:         String(result.serviceYears),
        dailyRate:            String(result.dailyRate),
        daysRateYears1To5:    21,
        daysRateYearsBeyond5: 30,
        eosbFirst5Years:      String(result.eosbFirst5Years),
        eosbBeyond5Years:     String(result.eosbBeyond5Years),
        eosbBeforeCap:        String(result.eosbBeforeCap),
        capAmount:            String(result.capAmount),
        isCapped:             result.isCapped,
        eosbFinalAmount:      String(result.eosbFinalAmount),
        partTimeRatio:        '1.0000',
        eosbAfterRatio:       String(result.eosbFinalAmount),
        payrollRunId:         raw.payrollRunId ?? null,
        triggeredByUser:      actor.personId ?? null,
        notes:                raw.notes ?? null,
        calculationFormulaJson: { ...result },
        createdBy:            actor.id,
        createdByName:        actor.name,
      })

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: raw.legalEntityId,
        channel:      'WEB',
        eventType:    'PAYROLL.EOSB.CALCULATE',
        resourceType: 'eosb_calculations',
        resourceId:   calcId,
        entityId:     raw.legalEntityId,
        newValues:    { personId: raw.personId, calculationType: raw.calculationType, eosbFinalAmount: result.eosbFinalAmount },
        description:  `EOSB calculated for person ${raw.personId}: AED ${result.eosbFinalAmount}`,
      }, tx)
    })

    revalidatePath(`/persons/${raw.personId}`)
    return { success: true, message: `EOSB calculated: AED ${result.eosbFinalAmount.toFixed(2)}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
