'use server'

import { getCompanyBranding } from '@/lib/company-branding'

/**
 * S5-01 / S5-05 / S5-08 — Absence Server Actions.
 *
 * Public API:
 *   • createLeaveRequest    — DRAFT row, no workflow yet
 *   • submitLeaveRequest    — flips DRAFT → PENDING + initiates workflow
 *   • getLeaveRequest       — detail view (entity-scope + self-access gates)
 *   • listLeaveRequests     — paginated/filterable list (admin + manager + employee scoped)
 *   • cancelLeaveRequest    — DRAFT/PENDING/APPROVED → CANCELLED
 *   • approveLeaveRequest   — APPROVE step (delegates to actOnWorkflowStep)
 *   • rejectLeaveRequest    — REJECT step (delegates to actOnWorkflowStep)
 *   • saveLeaveRuleSet      — S5-06 admin save (assertLeaveRuleNotBelowMinimum)
 *
 * Hard Rules in force:
 *   #1  every DB write → writeAuditLog inside the SAME tx
 *   #3  no deletes — status transitions only
 *   #6  cross-module imports (workflow init) go through @/modules/config
 *   #7  no raw hex (this file has no UI)
 *   #11 leave rules are validated against the UAE minimum on every save
 */
import { and, eq, ilike, asc, desc, gte, lte, or, count, sql, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { buildOrderBy } from '@/lib/table-sort'
import {
  absenceEntries, absenceTypes, absenceBalances, persons,
  leaveRuleSets, leaveRuleLines, events, accommodationRequests,
  workerAssignments, notificationLog, workflowStepInstances,
  personDocuments, userAccounts,
} from '@/drizzle/schema'
import { db, type DbOrTx } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole, getCurrentUser, type SessionUser } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { initiateWorkflow } from '@/modules/config'
import { getWorkflowStatusForRequest } from '@/modules/workflow'
import { assertLeaveRuleNotBelowMinimum } from '@/modules/config/guards'
import { submitWorkflow, takeWorkflowAction, cancelWorkflowInstance } from '@/lib/workflow-engine'
import { getSickLeaveCertThreshold, isMedicalCertRequired } from '@/lib/absence-cert-policy'
import { addDays, todayUae, daysBetween } from '@/lib/effective-date'
import { resolveBackdatePolicy } from './backdate-policy-actions'
// Enterprise email platform: queue (non-blocking) the line-manager approval email.
import { buildLeaveDecisionContext, queueWorkflowApprovalEmail, getActiveProviderRow } from '@/modules/communication'
import { translateError } from '@/lib/app-error'
import { revalidatePath } from 'next/cache'
import { assertCanRequestLeaveFor, resolveManagerViewablePersonIds } from '@/lib/leave-person-scope'
import { assertActivePersonTarget } from '@/lib/access'
import { computeRequestDurationDays, rangesOverlap, computeClosingBalance, splitLeaveRangeByCalendarYear } from './services'
import {
  CreateLeaveRequestSchema, type CreateLeaveRequestInput,
  CancelLeaveRequestSchema, type CancelLeaveRequestInput,
  ListLeaveRequestsFilterSchema, type ListLeaveRequestsFilter,
  LeaveDecisionSchema, type LeaveDecisionInput,
  SaveLeaveRuleSetSchema, type SaveLeaveRuleSetInput,
} from './validations'
import type {
  LeaveRequestListRow, PaginatedLeaveRequests, LeaveRequestDetail,
} from './types'

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * C2 (approved) — apply a leave-balance change SPLIT across calendar years.
 * For each year-portion of the leave range, read that year's absence_balances
 * row, apply `mutate(currentDays, yearDays)` → new absolute {pendingDays,
 * takenDays}, recompute the closing balance, and persist. Same-year leave
 * touches exactly one row (behavior unchanged). Missing rows are skipped (the
 * approve/reject/cancel paths only adjust rows that exist, matching prior
 * `if (bal)` behavior); the reserve path handles its own fail-closed checks.
 */
async function applyLeaveBalanceSplitTx(
  tx: DbOrTx,
  ctx: { personId: string; absenceTypeId: string; startDate: string; endDate: string; durationDays: number; isHalfDay?: boolean },
  mutate: (cur: { pendingDays: number; takenDays: number }, yearDays: number) => { pendingDays: number; takenDays: number },
  actor: { id: string; name: string },
): Promise<void> {
  const portions = splitLeaveRangeByCalendarYear(ctx.startDate, ctx.endDate, ctx.durationDays, ctx.isHalfDay)
  for (const seg of portions) {
    const [bal] = await tx
      .select()
      .from(absenceBalances)
      .where(and(
        eq(absenceBalances.tenantId, TENANT_ID),
        eq(absenceBalances.personId, ctx.personId),
        eq(absenceBalances.absenceTypeId, ctx.absenceTypeId),
        eq(absenceBalances.balanceYear, seg.year),
      ))
      .limit(1)
    if (!bal) continue
    const next = mutate(
      { pendingDays: Number(bal.pendingDays), takenDays: Number(bal.takenDays) },
      seg.days,
    )
    const closing = computeClosingBalance({
      openingBalanceDays: Number(bal.openingBalanceDays),
      accruedDays:        Number(bal.accruedDays),
      takenDays:          next.takenDays,
      pendingDays:        next.pendingDays,
      adjustedDays:       Number(bal.adjustedDays),
      carriedForwardDays: Number(bal.carriedForwardDays),
      forfeitedDays:      Number(bal.forfeitedDays),
    })
    await tx
      .update(absenceBalances)
      .set({
        pendingDays:        String(next.pendingDays),
        takenDays:          String(next.takenDays),
        closingBalanceDays: String(closing),
        updatedBy:          actor.id,
        updatedByName:      actor.name,
        updatedDate:        new Date(),
        lastUpdatedDate:    new Date(),
      })
      .where(eq(absenceBalances.id, bal.id))
  }
}

async function nextRequestNumber(
  legalEntityId: string,
  tx: { select: typeof db.select; execute: typeof db.execute },
): Promise<string> {
  // Advisory lock serialises concurrent submissions so two requests never
  // read the same MAX and generate a duplicate LR-XXXXXXX number.
  // hashtext() converts the entity UUID to a stable int4 Postgres will lock on.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${legalEntityId}))`,
  )
  const result = await tx
    .select({
      n: sql<number>`COALESCE(MAX(CAST(NULLIF(regexp_replace(request_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)`,
    })
    .from(absenceEntries)
    .where(and(
      eq(absenceEntries.tenantId, TENANT_ID),
      eq(absenceEntries.legalEntityId, legalEntityId),
    ))
  const next = (result[0]?.n ?? 0) + 1
  return `LR-${String(next).padStart(7, '0')}`
}

async function loadPersonScope(
  tx: { select: typeof db.select } | typeof db,
  personId: string,
): Promise<{ id: string; legalEntityId: string; gender: string | null } | null> {
  const [row] = await tx
    .select({ id: persons.id, legalEntityId: persons.legalEntityId, gender: persons.gender })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  return row ?? null
}

function assertEntityScope(user: SessionUser, entityId: string, action: string): void {
  if (user.role === 'SUPER_ADMIN') return
  if (user.legalEntityId !== entityId) {
    throw new Error(`FORBIDDEN: cross-entity ${action} not allowed`)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 1 — createLeaveRequest (DRAFT only — no workflow yet)
// ══════════════════════════════════════════════════════════════════════════

export async function createLeaveRequest(
  input: CreateLeaveRequestInput,
): Promise<{ id: string; requestNumber: string }> {
  try {
  const user = await requireRole([
    // Every employee-type user may file/submit/cancel their OWN leave; the
    // relationship-based person scope (assertCanRequestLeaveFor) restricts who
    // they can file FOR. PAYROLL_ADMIN/FINANCE are employees too.
    'EMPLOYEE', 'MANAGER', 'PAYROLL_ADMIN', 'FINANCE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
  ])
  const data = CreateLeaveRequestSchema.parse(input)

  // submitted_by FK requires a persons.id — user accounts not yet linked
  // to a person record cannot file leave on anyone's behalf.
  if (!user.personId) {
    throw new Error(
      'NO_PERSON_RECORD: Your user account is not linked to an employee record. ' +
      'Please contact your HR administrator to complete your profile setup.',
    )
  }

  // Role-scoped authorisation — employees may only file for themselves,
  // managers only for their team, HR roles for any active employee.
  await assertCanRequestLeaveFor(user, data.personId)

  // P2-L3 — reject leave for a terminated/inactive employee. assertCanRequestLeaveFor
  // returns early for HR roles, so HR/SUPER_ADMIN could previously file leave for a
  // terminated person (termination flips assignment_status, not is_active — both are
  // checked). Pre-flight (bare db, before the tx) — the max:1 prod pool would deadlock
  // if this read ran inside the transaction on the global db connection.
  await assertActivePersonTarget(data.personId)

  // BR-AL-002 — durationDays must match the calendar-day count of the range
  // (or 0.5 for half-day).
  const expected = computeRequestDurationDays(data.startDate, data.endDate, data.isHalfDay)
  if (Math.abs(expected - data.durationDays) > 0.001) {
    throw new Error(
      `BR-AL-002: durationDays (${data.durationDays}) does not match ` +
      `calendar-day span ${data.startDate}…${data.endDate} (= ${expected})`,
    )
  }

  // ── Backdate policy check (BR-LV-BDP-003) ────────────────────────────────
  // If the start date is in the past, enforce the entity/type backdate policy.
  // Checked BEFORE the transaction to avoid acquiring the advisory lock on a
  // request that is already invalid (fail-fast).
  //
  // BDP-009: We resolve the employee's legal entity directly from the DB
  // (NOT from data.legalEntityId supplied by the caller) so that an HR Admin
  // filing on behalf of an employee in a different entity cannot bypass the
  // policy by supplying a mismatched entity ID.
  //
  // Safe default (BDP-008): no policy row = backdating is BLOCKED. HR must
  // explicitly configure a policy with backdatingEnabled=true to permit
  // past-date leave entries for any leave type.
  const todayStr = todayUae()
  if (data.startDate < todayStr) {
    // Pre-flight: resolve the employee's canonical legal entity from the DB.
    // BDP-009 / BDP-011: if the person row is not found we throw immediately —
    // there is NO fallback to data.legalEntityId (caller-supplied). This prevents
    // any path where an attacker could supply a mismatched entity to bypass the
    // employee's own entity policy. The transaction's loadPersonScope will also
    // catch this, but we fail fast here before any lock is acquired.
    const personPreFlight = await db
      .select({ legalEntityId: persons.legalEntityId })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
      .limit(1)
      .then(r => r[0] ?? null)

    if (!personPreFlight) {
      throw new Error(
        'PERSON_NOT_FOUND: The selected employee record could not be found. ' +
        'Please verify the employee exists and refresh the page before trying again.',
      )
    }

    const employeeEntityId = personPreFlight.legalEntityId

    const [bdPolicy, bdTypeRow] = await Promise.all([
      // Use the DB-verified employee entity — never the caller-supplied value.
      resolveBackdatePolicy(employeeEntityId, data.absenceTypeId),
      db
        .select({ typeNameEn: absenceTypes.typeNameEn, typeNameAr: absenceTypes.typeNameAr })
        .from(absenceTypes)
        .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.id, data.absenceTypeId)))
        .limit(1)
        .then(r => r[0] ?? { typeNameEn: 'Leave', typeNameAr: 'إجازة' }),
    ])

    const typeEn = bdTypeRow.typeNameEn
    const typeAr = bdTypeRow.typeNameAr ?? typeEn

    if (!bdPolicy) {
      // BDP-008: Safe default — no policy configured = backdating is NOT allowed.
      // HR must explicitly configure a policy to permit past-date entries.
      throw new Error(
        `BACKDATE_POLICY_MISSING: No backdate policy has been configured for ${typeEn} in your organisation. ` +
        `By default, backdating is not permitted. Please contact your HR administrator to configure ` +
        `the backdate policy for this leave type, or apply for leave starting from today (${todayStr}). · ` +
        `لم يتم تكوين سياسة إدخال بأثر رجعي لـ${typeAr} في مؤسستك. ` +
        `بشكل افتراضي، لا يُسمح بالإدخال بأثر رجعي. يرجى التواصل مع مسؤول الموارد البشرية لضبط السياسة.`,
      )
    }

    if (!bdPolicy.backdatingEnabled) {
      throw new Error(
        `BACKDATE_NOT_ALLOWED: Backdated ${typeEn} requests are not permitted under your organisation's policy. ` +
        `Please apply for leave starting from today (${todayStr}) or a future date. · ` +
        `طلبات ${typeAr} بأثر رجعي غير مسموح بها وفق سياسة مؤسستك. ` +
        `يرجى تقديم الطلب بدءاً من اليوم (${todayStr}) أو تاريخ مستقبلي.`,
      )
    }

    if (bdPolicy.backdateLimitDays !== null) {
      // daysBetween counts calendar days between two dates (absolute difference).
      // We compute: how many days ago is startDate relative to today?
      const daysBack = daysBetween(data.startDate, todayStr)
      if (daysBack > bdPolicy.backdateLimitDays) {
        const earliestAllowed = addDays(todayStr, -bdPolicy.backdateLimitDays)
        throw new Error(
          `BACKDATE_LIMIT_EXCEEDED: ${typeEn} can only be backdated up to ${bdPolicy.backdateLimitDays} day(s). ` +
          `The start date you selected (${data.startDate}) is ${daysBack} day(s) ago, ` +
          `which exceeds the ${bdPolicy.backdateLimitDays}-day limit. ` +
          `The earliest date you can enter is ${earliestAllowed}. · ` +
          `يمكن تقديم ${typeAr} بأثر رجعي بحد أقصى ${bdPolicy.backdateLimitDays} يوم(أيام). ` +
          `التاريخ الذي حددته (${data.startDate}) كان منذ ${daysBack} يوم(أيام)، ` +
          `وهو يتجاوز الحد المسموح به. ` +
          `أقرب تاريخ يمكن إدخاله هو ${earliestAllowed}.`,
        )
      }
    }
  }

  let newId  = ''
  let newNum = ''

  await db.transaction(async tx => {
    // HANG-GUARD: the production pool is max:1 and the advisory lock below can
    // otherwise wait FOREVER (there is no global lock_timeout). A request left
    // hung by an earlier failure would hold its advisory lock indefinitely and
    // block every subsequent submit for the same person — the reported "Saving…"
    // that never finishes. These transaction-scoped (SET LOCAL = pgBouncer-safe)
    // timeouts cap the worst case at a few seconds with a clear error, and the
    // idle_in_transaction timeout forces any abandoned transaction to release its
    // locks so fresh submits succeed.
    await tx.execute(sql`SET LOCAL lock_timeout = '8000ms'`)
    await tx.execute(sql`SET LOCAL statement_timeout = '25000ms'`)
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15000ms'`)

    // ARIA-LOCK fix (Phase 3 Priority 6D):
    // Acquire a per-person advisory lock BEFORE the overlap check so that two
    // concurrent createLeaveRequest calls for the same person cannot both read
    // "no overlap" before either has committed. With Postgres READ COMMITTED
    // isolation the overlap SELECT below would otherwise pass for both callers
    // simultaneously (classic read-modify-write race). This lock serialises the
    // entire create path for the same person; different persons proceed in
    // parallel. Lock is transaction-scoped — auto-released on commit/rollback.
    // Same pg_advisory_xact_lock pattern as RISK-PAYROLL-2 (payroll/actions.ts)
    // and nextRequestNumber below (serialises LR number generation).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('leave:' || ${data.personId}))`
    )

    const person = await loadPersonScope(tx, data.personId)
    if (!person) throw new Error('person not found')
    assertEntityScope(user, person.legalEntityId, 'leave request')
    if (data.legalEntityId !== person.legalEntityId) {
      throw new Error('legalEntityId must match the person\'s legal entity')
    }

    // GAP-M01 FIX (FIX-S9-01) — medical-cert requirement is computed from
    // the per-entity policy threshold rather than trusted from client input.
    // BR-SL-002: Article 31 FDL 33/2021 — UAE minimum is Day 1 (threshold=0).
    const [absType] = await tx
      .select({
        typeCode:               absenceTypes.typeCode,
        genderRestriction:      absenceTypes.genderRestriction,
        isOneTimePerEmployment: absenceTypes.isOneTimePerEmployment,
      })
      .from(absenceTypes)
      .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.id, data.absenceTypeId)))
      .limit(1)
    if (!absType) throw new Error('absence type not found')

    // BR-LV-014 — gender restriction (paternity = MALE-only, maternity = FEMALE-only).
    // UAE FDL 33/2021 Articles 30–32.
    if (absType.genderRestriction && person.gender !== absType.genderRestriction) {
      throw new Error(
        `GENDER_RESTRICTION: ${absType.typeCode} leave is restricted to ` +
        `${absType.genderRestriction} employees`,
      )
    }
    // DEADLOCK-FIX: pass `tx` — this runs inside db.transaction() and the
    // production pool is max:1. Reading the policy on the global `db` pool here
    // would wait forever for the connection the transaction already holds,
    // hanging "Saving…" with no row created (the reported manager-leave bug).
    const certThresholdDays = await getSickLeaveCertThreshold(person.legalEntityId, tx as DbOrTx)
    const sickCertRequired = isMedicalCertRequired(
      absType.typeCode,
      data.durationDays,
      certThresholdDays,
    )

    // GAP-C06 FIX (FIX-S9-04) — Study leave: enrolment certificate required
    // within 7 days of the leave start. BR-STL-001 / Article 33 FDL 33/2021.
    // The medicalCertRequired field is repurposed for the enrolment-cert flag;
    // the deadline lives on `medical_cert_deadline` (date).
    const isStudyLeave = absType.typeCode === 'STUDY'
    const studyCertDeadline = isStudyLeave ? addDays(data.startDate, 7) : null

    // M4 / BR-STL-001 — sanity check: the 7-day enrolment-cert window must not
    // have already expired at create time. This catches backdated study-leave
    // requests where startDate + 7 days is already in the past.
    if (isStudyLeave && studyCertDeadline && studyCertDeadline < todayUae()) {
      throw new Error(
        `STUDY_CERT_DEADLINE_PASSED: the 7-day enrolment certificate deadline ` +
        `(${studyCertDeadline}) has already passed. Study leave cannot be ` +
        `created with a start date this far in the past. · ` +
        `انتهت مهلة تقديم شهادة القيد المدرسي (${studyCertDeadline}). لا يمكن إنشاء إجازة دراسية بتاريخ بدء بعيد في الماضي.`,
      )
    }

    const certRequired = sickCertRequired || isStudyLeave

    // BR-SL-003 — overlap with existing DRAFT/PENDING/APPROVED/TAKEN requests is blocked.
    // DRAFT is included so two overlapping drafts cannot be created concurrently —
    // without this guard both could be submitted and race to approval.
    const existing = await tx
      .select({
        id: absenceEntries.id, startDate: absenceEntries.startDate,
        endDate: absenceEntries.endDate, status: absenceEntries.status,
      })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.tenantId, TENANT_ID),
          eq(absenceEntries.personId, data.personId),
          or(
            eq(absenceEntries.status, 'DRAFT'),
            eq(absenceEntries.status, 'PENDING'),
            eq(absenceEntries.status, 'APPROVED'),
            eq(absenceEntries.status, 'TAKEN'),
          )!,
        ),
      )
    for (const e of existing) {
      if (rangesOverlap(data.startDate, data.endDate, e.startDate, e.endDate)) {
        throw new Error(
          `OVERLAP: another ${e.status.toLowerCase()} request (${e.id}) already covers ` +
          `${e.startDate}…${e.endDate} · يتعارض مع طلب ${e.status.toLowerCase()} آخر (${e.id}) ` +
          `يغطي ${e.startDate}…${e.endDate}`,
        )
      }
    }

    // BR-LV-003 — balance gate: block submission when the employee's available
    // balance would go negative. Skipped when no balance row exists yet (first
    // leave of the year before accrual has run).
    // C2 — check availability per calendar year the leave spans (a Dec→Jan
    // request must fit each year's own balance for its portion). Same-year leave
    // checks exactly one year (unchanged behavior).
    for (const seg of splitLeaveRangeByCalendarYear(data.startDate, data.endDate, data.durationDays, data.isHalfDay)) {
      const [bal] = await tx
        .select({
          openingBalanceDays: absenceBalances.openingBalanceDays,
          accruedDays:        absenceBalances.accruedDays,
          takenDays:          absenceBalances.takenDays,
          pendingDays:        absenceBalances.pendingDays,
          adjustedDays:       absenceBalances.adjustedDays,
          carriedForwardDays: absenceBalances.carriedForwardDays,
          forfeitedDays:      absenceBalances.forfeitedDays,
        })
        .from(absenceBalances)
        .where(and(
          eq(absenceBalances.tenantId, TENANT_ID),
          eq(absenceBalances.personId, data.personId),
          eq(absenceBalances.absenceTypeId, data.absenceTypeId),
          eq(absenceBalances.balanceYear, seg.year),
        ))
        .limit(1)
      if (bal) {
        const available = computeClosingBalance({
          openingBalanceDays: Number(bal.openingBalanceDays),
          accruedDays:        Number(bal.accruedDays),
          takenDays:          Number(bal.takenDays),
          pendingDays:        Number(bal.pendingDays),
          adjustedDays:       Number(bal.adjustedDays),
          carriedForwardDays: Number(bal.carriedForwardDays),
          forfeitedDays:      Number(bal.forfeitedDays),
        })

        // Integrity guard: a negative current balance signals a ledger anomaly
        // (manual adjustment, forfeiture over-run, or audit correction). Block
        // further requests until HR resolves the ledger.
        if (available < 0) {
          throw new Error(
            `BALANCE_INTEGRITY: current ${seg.year} balance is negative (${available} days) — ` +
            `contact HR to correct the ledger before submitting · ` +
            `الرصيد الحالي سالب (${available} يوماً) — تواصل مع الموارد البشرية لتصحيح السجل قبل التقديم`,
          )
        }

        // BR-LV-003 — block when this request's portion for the year would exceed
        // that year's available balance. Round to 2 dp to match
        // computeClosingBalance precision and prevent floating-point false-negatives.
        const closingAfterRequest = Math.round((available - seg.days) * 100) / 100
        if (closingAfterRequest < 0) {
          throw new Error(
            `INSUFFICIENT_BALANCE: available ${seg.year} balance (${available} days) is less than ` +
            `the request's ${seg.year} portion (${seg.days} days) · ` +
            `الرصيد المتاح لعام ${seg.year} (${available} يوماً) أقل من حصة الطلب لذلك العام (${seg.days} يوماً)`,
          )
        }
      }
    }

    // BR-LV-008 / BR-HJ-001 — once-per-employment types (e.g. Hajj).
    // UAE FDL 33/2021: Hajj leave is a one-time entitlement per employment tenure.
    if (absType.isOneTimePerEmployment) {
      const [prior] = await tx
        .select({ id: absenceEntries.id })
        .from(absenceEntries)
        .where(and(
          eq(absenceEntries.tenantId, TENANT_ID),
          eq(absenceEntries.personId, data.personId),
          eq(absenceEntries.absenceTypeId, data.absenceTypeId),
          eq(absenceEntries.status, 'APPROVED'),
        ))
        .limit(1)
      if (prior) {
        throw new Error(
          `ONE_TIME_LEAVE_EXCEEDED: ${absType.typeCode} leave can only be taken once per employment`,
        )
      }
    }

    newNum = await nextRequestNumber(person.legalEntityId, tx)

    const [row] = await tx
      .insert(absenceEntries)
      .values({
        tenantId:        TENANT_ID,
        personId:        data.personId,
        legalEntityId:   person.legalEntityId,
        absenceTypeId:   data.absenceTypeId,
        requestNumber:   newNum,
        startDate:       data.startDate,
        endDate:         data.endDate,
        durationDays:    String(data.durationDays),
        isHalfDay:       data.isHalfDay,
        halfDayPeriod:   data.halfDayPeriod ?? null,
        status:          'DRAFT',
        submittedVia:    data.submittedVia,
        submittedBy:     user.personId!, // validated non-null above
        notes:           data.notes,
        // GAP-M01 FIX: cert requirement is policy-driven; client input is OR-ed
        // so HR can still flag a custom case (e.g. employer-mandated check-up).
        // GAP-C06 FIX: STUDY leave forces a 7-day enrolment-cert deadline.
        medicalCertRequired: certRequired || data.medicalCertRequired,
        medicalCertDeadline: studyCertDeadline,
        extraData:       data.extraData ?? {},
        createdBy:       user.id,
        createdByName:   user.name,
      })
      .returning({ id: absenceEntries.id })
    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: person.legalEntityId,
      channel:       'WEB',
      eventType:     'LEAVE_REQUEST.CREATED',
      resourceType:  'absence_entries',
      resourceId:    newId,
      entityId:      person.legalEntityId,
      newValues:     {
        requestNumber: newNum, personId: data.personId,
        absenceTypeId: data.absenceTypeId,
        absenceTypeCode: absType.typeCode,
        startDate: data.startDate, endDate: data.endDate,
        durationDays: data.durationDays, status: 'DRAFT',
        medicalCertRequired: certRequired || data.medicalCertRequired,
        medicalCertDeadline: studyCertDeadline,
        certThresholdDays,
        certPurpose: isStudyLeave ? 'ENROLMENT' : (sickCertRequired ? 'MEDICAL' : null),
      },
    }, tx)
  })

  return { id: newId, requestNumber: newNum }
  } catch (e) {
    // Surface the real cause in Vercel runtime logs (production sanitises the
    // client-facing message). A "lock timeout"/"statement timeout" here pinpoints
    // advisory-lock contention vs a slow query as the source of any "Saving…" hang.
    console.error('[createLeaveRequest] failed:', e instanceof Error ? e.message : e)
    translateError(e, 'createLeaveRequest')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 2 — submitLeaveRequest (DRAFT → PENDING + initiateWorkflow)
// ══════════════════════════════════════════════════════════════════════════

export async function submitLeaveRequest(
  requestId: string,
): Promise<{ id: string; status: string; workflowInstanceId: string }> {
  try {
  const user = await requireRole([
    // Every employee-type user may file/submit/cancel their OWN leave; the
    // relationship-based person scope (assertCanRequestLeaveFor) restricts who
    // they can file FOR. PAYROLL_ADMIN/FINANCE are employees too.
    'EMPLOYEE', 'MANAGER', 'PAYROLL_ADMIN', 'FINANCE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
  ])

  // Pre-flight read for entity scope (the workflow init lives outside our tx).
  const [row] = await db
    .select()
    .from(absenceEntries)
    .where(and(
      eq(absenceEntries.tenantId, TENANT_ID),
      eq(absenceEntries.id, requestId),
    ))
    .limit(1)
  if (!row) throw new Error('leave request not found')
  assertEntityScope(user, row.legalEntityId, 'leave submission')
  if (user.role === 'EMPLOYEE' && user.personId !== row.personId) {
    throw new Error('FORBIDDEN: employees may only submit their own leave')
  }
  if (row.status !== 'DRAFT' && row.status !== 'REJECTED') {
    throw new Error(`only DRAFT or REJECTED requests may be submitted (current: ${row.status})`)
  }

  // Resolve the absence type once — used for both cert-gate and workflow routing.
  // BR-WF-001: each leave type code maps to its own workflow definition so that
  // sick-leave routes to HR, maternity to HR Director, etc.
  const [absType] = await db
    .select({
      typeCode:        absenceTypes.typeCode,
      typeNameEn:      absenceTypes.typeNameEn,
      typeNameAr:      absenceTypes.typeNameAr,
      requiresBalance: absenceTypes.requiresBalance,
    })
    .from(absenceTypes)
    .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.id, row.absenceTypeId)))
    .limit(1)
  if (!absType) throw new Error('absence type not found — cannot determine workflow routing')
  const leaveTypeCode = absType.typeCode

  // Types without a dedicated workflow definition fall back to the general annual-leave chain.
  const LEAVE_WORKFLOW_MAP: Record<string, string> = {
    ANNUAL:    'WF_ANNUAL_LEAVE',
    SICK:      'WF_SICK_LEAVE',
    MATERNITY: 'WF_MATERNITY_LEAVE',
    HAJJ:      'WF_HAJJ_LEAVE',
  }
  const resolvedWorkflowCode = LEAVE_WORKFLOW_MAP[leaveTypeCode] ?? 'WF_ANNUAL_LEAVE'

  // GAP-M01 / GAP-C06 FIX (FIX-S9-01 / FIX-S9-04): block submission if a
  // certificate is required but not yet uploaded.
  // BR-SL-002 (medical, Article 31 FDL 33/2021) and BR-STL-001 (enrolment,
  // Article 33 FDL 33/2021) both flow through `medicalCertRequired`.
  //
  // Next.js RSC strips custom Error properties on the wire — only `message`
  // survives the Server-Action ↔ client boundary. Both languages are encoded
  // into the message itself with a ` · ` separator so a single `e.message`
  // read in the form yields a bilingual error.
  if (row.medicalCertRequired && !row.medicalCertUploaded) {
    const isStudyLeave = leaveTypeCode === 'STUDY'

    if (isStudyLeave) {
      const messageEn = 'A proof-of-enrolment certificate from an accredited UAE educational institution is required for study leave. Please upload before submitting (deadline: 7 days from start date).'
      const messageAr = 'يلزم تقديم شهادة قيد من مؤسسة تعليمية معتمدة في الإمارات للإجازة الدراسية. يرجى الرفع قبل التقديم (الحد الأقصى: 7 أيام من تاريخ البدء).'
      throw new Error(`STUDY_ENROLMENT_CERT_REQUIRED: ${messageEn} · ${messageAr}`)
    }

    const certThresholdDays = await getSickLeaveCertThreshold(row.legalEntityId)
    const messageEn = certThresholdDays === 0
      ? 'A medical certificate is required from Day 1 for sick leave. Please upload your certificate before submitting.'
      : `A medical certificate is required for sick leave exceeding ${certThresholdDays} day(s). Please upload your certificate before submitting.`
    const messageAr = certThresholdDays === 0
      ? 'الشهادة الطبية مطلوبة من اليوم الأول للإجازة المرضية. يرجى رفع الشهادة قبل التقديم.'
      : `الشهادة الطبية مطلوبة للإجازة المرضية التي تتجاوز ${certThresholdDays} يوم/أيام. يرجى رفع الشهادة قبل التقديم.`
    throw new Error(`MEDICAL_CERT_REQUIRED: ${messageEn} · ${messageAr}`)
  }

  // COLLISION-003 fix (Phase 3 Priority 6C):
  // submitWorkflow and the absenceEntries status update now run inside a single
  // outer db.transaction.  submitWorkflow accepts an optional `tx` param; when
  // supplied it participates in this outer transaction instead of opening an
  // independent one.  If anything fails — workflow creation, status update, audit,
  // notification — the entire outer transaction rolls back.  A crash mid-flight
  // no longer produces a committed workflow instance with a DRAFT leave record.
  //
  // The compensation-event fallback (emitCompensationEvent) is no longer required
  // because the two-transaction split that made it necessary has been closed.
  // Captured inside the tx, consumed AFTER commit to queue the manager email so
  // an email problem can never roll back or block the leave submission.
  let leaveEmailCtx: { lineManagerId: string; empNameEn: string; empNumber?: string | null } | null = null

  const { v2InstanceId } = await db.transaction(async _outerTx => {
    // Cast: Drizzle's transaction callback infers a generic schema type that
    // diverges from DbOrTx at the call-site. The runtime type is identical.
    const outerTx = _outerTx as unknown as DbOrTx

    // HANG-GUARD (see createLeaveRequest): cap this transaction so a contended
    // lock or slow workflow read can never hang "Saving…" forever under the
    // max:1 production pool. SET LOCAL is transaction-scoped and pgBouncer-safe.
    await outerTx.execute(sql`SET LOCAL lock_timeout = '8000ms'`)
    await outerTx.execute(sql`SET LOCAL statement_timeout = '25000ms'`)
    await outerTx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15000ms'`)

    // P2-L1 — acquire the SAME per-person advisory lock used by createLeaveRequest
    // (key 'leave:'||personId) so the pending-balance reservation below is atomic
    // against concurrent submits/creates for this person. Without serialisation,
    // two non-overlapping pending requests could each pass the balance check and
    // collectively overspend.
    await outerTx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('leave:' || ${row.personId}))`)

    // v2 engine — now joining the outer transaction via the tx param.
    // Workflow instance, step instances, email token, notification, and audit
    // are all written atomically with the absenceEntries status update below.
    const v2Result = await submitWorkflow({
      workflowCode:        resolvedWorkflowCode,
      resourceType:        'absence_entries',
      resourceId:          requestId,
      initiatedByPersonId: row.personId,
      legalEntityId:       row.legalEntityId,
      contextOverrides: {
        'leave.type_code':        leaveTypeCode,
        'leave.days':             Number(row.durationDays ?? 0),
        'leave.is_backdated':     false,
        'leave.has_medical_cert': !!row.medicalCertUploaded,
      },
      tx: outerTx,
    })
    if (!v2Result.success || !v2Result.instanceId) {
      throw new Error(`Workflow engine error: ${v2Result.error ?? 'unknown'}`)
    }
    const instanceId: string = v2Result.instanceId

    await outerTx
      .update(absenceEntries)
      .set({
        status:             'PENDING',
        workflowInstanceId: instanceId,
        updatedBy:          user.id,
        updatedByName:      user.name,
        updatedDate:        new Date(),
        lastUpdatedDate:    new Date(),
      })
      .where(eq(absenceEntries.id, requestId))

    // P2-L1 — RESERVE the requested days in pendingDays now that the request is
    // PENDING. This is the missing increment: cancel/reject release pendingDays
    // and approve moves pending→taken, but nothing previously added to it, so the
    // create-time balance gate always read pending=0 and could not stop two
    // requests from collectively overspending. Re-check the live balance under
    // the per-person advisory lock before reserving (authoritative gate).
    {
      // C2 — reserve the requested days per calendar year the leave spans. Each
      // year's portion is checked against, and reserved into, that year's balance
      // row. Same-year leave touches exactly one row (unchanged behavior). The
      // entry-level immutable snapshot aggregates across the spanned years.
      const portions = splitLeaveRangeByCalendarYear(row.startDate, row.endDate, Number(row.durationDays))
      let aggBefore = 0
      let aggReserved = 0
      for (const seg of portions) {
        const [bal] = await outerTx
          .select({
            id:                 absenceBalances.id,
            openingBalanceDays: absenceBalances.openingBalanceDays,
            accruedDays:        absenceBalances.accruedDays,
            takenDays:          absenceBalances.takenDays,
            pendingDays:        absenceBalances.pendingDays,
            adjustedDays:       absenceBalances.adjustedDays,
            carriedForwardDays: absenceBalances.carriedForwardDays,
            forfeitedDays:      absenceBalances.forfeitedDays,
          })
          .from(absenceBalances)
          .where(and(
            eq(absenceBalances.tenantId, TENANT_ID),
            eq(absenceBalances.personId, row.personId),
            eq(absenceBalances.absenceTypeId, row.absenceTypeId),
            eq(absenceBalances.balanceYear, seg.year),
          ))
          .limit(1)

        // Fail-closed balance-control gate (BR-LV-BAL-001) — per spanned year.
        // A balance-CONTROLLED leave type (requires_balance = true) MUST have an
        // initialized balance row for EVERY year the request spans; otherwise we
        // BLOCK rather than silently allow. Non-controlled types (e.g. unpaid)
        // skip balance entirely.
        if (absType.requiresBalance && !bal) {
          throw new Error(
            'BALANCE_NOT_INITIALIZED: Leave balance has not been initialized for ' +
            `${absType.typeNameEn} (${seg.year}). Please contact HR to initialize the ` +
            'leave balance before submitting · ' +
            `لم يتم تهيئة رصيد الإجازة لنوع ${absType.typeNameAr ?? absType.typeNameEn} ` +
            `لعام ${seg.year}. يُرجى التواصل مع الموارد البشرية لتهيئة الرصيد قبل التقديم`,
          )
        }

        if (bal) {
          const available = computeClosingBalance({
            openingBalanceDays: Number(bal.openingBalanceDays),
            accruedDays:        Number(bal.accruedDays),
            takenDays:          Number(bal.takenDays),
            pendingDays:        Number(bal.pendingDays),
            adjustedDays:       Number(bal.adjustedDays),
            carriedForwardDays: Number(bal.carriedForwardDays),
            forfeitedDays:      Number(bal.forfeitedDays),
          })
          if (Math.round((available - seg.days) * 100) / 100 < 0) {
            throw new Error(
              `INSUFFICIENT_BALANCE: available ${seg.year} balance (${available} days) is less than ` +
              `the request's ${seg.year} portion (${seg.days} days) · ` +
              `الرصيد المتاح لعام ${seg.year} (${available} يوماً) أقل من حصة الطلب لذلك العام (${seg.days} يوماً)`,
            )
          }
          const newPending = Number(bal.pendingDays) + seg.days
          const newClosing = computeClosingBalance({
            openingBalanceDays: Number(bal.openingBalanceDays),
            accruedDays:        Number(bal.accruedDays),
            takenDays:          Number(bal.takenDays),
            pendingDays:        newPending,
            adjustedDays:       Number(bal.adjustedDays),
            carriedForwardDays: Number(bal.carriedForwardDays),
            forfeitedDays:      Number(bal.forfeitedDays),
          })
          await outerTx
            .update(absenceBalances)
            .set({
              pendingDays:        String(newPending),
              closingBalanceDays: String(newClosing),
              updatedBy:          user.id,
              updatedByName:      user.name,
              updatedDate:        new Date(),
              lastUpdatedDate:    new Date(),
            })
            .where(eq(absenceBalances.id, bal.id))

          aggBefore   += available
          aggReserved += seg.days
        }
      }

      // Option A — IMMUTABLE audit snapshot, captured at SUBMISSION time and
      // aggregated across the spanned years. `aggBefore` is the authoritative
      // available total BEFORE this request's reservation; after = before −
      // reserved. Written once; never recomputed, so historical approval records
      // stay point-in-time correct.
      if (aggReserved > 0) {
        await outerTx
          .update(absenceEntries)
          .set({
            balanceBeforeDays: String(Math.round(aggBefore * 100) / 100),
            balanceAfterDays:  String(Math.round((aggBefore - aggReserved) * 100) / 100),
            lastUpdatedDate:   new Date(),
          })
          .where(eq(absenceEntries.id, requestId))
      }
    }

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: row.legalEntityId,
      channel:       'WEB',
      eventType:     'LEAVE_REQUEST.SUBMITTED',
      resourceType:  'absence_entries',
      resourceId:    requestId,
      entityId:      row.legalEntityId,
      changedFields: ['status', 'workflowInstanceId'],
      metadata:      { workflowInstanceId: instanceId },
    }, outerTx)

    // Emit outbox event so the background poller calls generateLeaveRecommendation.
    // Atomic: if this tx rolls back, the event is never written (no orphan).
    await outerTx.insert(events).values({
      tenantId:  TENANT_ID,
      eventType: 'ARIA.LEAVE_RECOMMENDATION',
      payload:   {
        requestId,
        personId:      row.personId,
        legalEntityId: row.legalEntityId,
      },
    })

    // Notify the line manager via in-app notification so they see the bell
    // alert immediately without polling the Approvals Inbox manually.
    // Only fires when the employee has a current worker assignment with a
    // line_manager_id set — role-only routing (no assignment) still works
    // via the Approvals Inbox but produces no bell notification.
    const [wa] = await outerTx
      .select({ lineManagerId: workerAssignments.lineManagerId })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, row.personId),
        eq(workerAssignments.isCurrent, true),
      ))
      .limit(1)

    if (wa?.lineManagerId) {
      const [emp] = await outerTx
        .select({ fullNameEn: persons.fullNameEn, personNumber: persons.personNumber })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, row.personId)))
        .limit(1)

      const empLabel = emp?.fullNameEn
        ? `${emp.fullNameEn}${emp.personNumber ? ` (${emp.personNumber})` : ''}`
        : 'An employee'

      await outerTx.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        legalEntityId:     row.legalEntityId,
        recipientPersonId: wa.lineManagerId,
        notificationType:  'LEAVE_APPROVAL_REQUESTED',
        channel:           'IN_APP',
        subjectEn:         'Leave Request Awaiting Your Approval',
        subjectAr:         'طلب إجازة في انتظار موافقتك',
        bodyEn:            `${empLabel} has submitted a leave request (${row.requestNumber}) for ${row.durationDays} day(s) from ${row.startDate} to ${row.endDate}. Please review and approve or reject.`,
        bodyAr:            `قدّم ${emp?.fullNameEn ?? 'موظف'} (${row.requestNumber}) طلب إجازة لمدة ${row.durationDays} يوم من ${row.startDate} إلى ${row.endDate}. يرجى المراجعة واتخاذ القرار المناسب.`,
        referenceType:     'WORKFLOW_INSTANCE',
        referenceId:       instanceId,
        status:            'SENT',
        sentAt:            new Date(),
        createdBy:         user.id,
        createdByName:     user.name,
      })

      leaveEmailCtx = {
        lineManagerId: wa.lineManagerId,
        empNameEn:    emp?.fullNameEn ?? 'Employee',
        empNumber:    emp?.personNumber ?? null,
      }
    }

    return { v2InstanceId: instanceId }
  })

  // ── Enterprise email platform: queue the line-manager approval email ────────
  // Non-blocking: any failure here is logged and swallowed. The leave request is
  // already committed; in-app notification (above) is the guaranteed channel.
  // Missing manager work email simply skips the email — never blocks submission.
  if (leaveEmailCtx) {
    const ctx: { lineManagerId: string; empNameEn: string; empNumber?: string | null } = leaveEmailCtx
    try {
      // Resolve the ACTUAL step-1 approver + their official work email. Using the
      // step assignee (falling back to the line manager) keeps the secure
      // approve/reject action links valid for whoever the engine assigned.
      const [step] = await db
        .select({
          id: workflowStepInstances.id,
          assignedToPersonId: workflowStepInstances.assignedToPersonId,
        })
        .from(workflowStepInstances)
        .where(and(
          eq(workflowStepInstances.instanceId, v2InstanceId),
          eq(workflowStepInstances.stepOrder, 1),
        ))
        .limit(1)

      const approverPersonId = step?.assignedToPersonId ?? ctx.lineManagerId
      const [mgr] = await db
        .select({ name: persons.fullNameEn, email: userAccounts.primaryEmail })
        .from(persons)
        .leftJoin(userAccounts, eq(userAccounts.personId, persons.id))
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, approverPersonId)))
        .limit(1)

      if (mgr?.email && step?.id) {
        const providerRow = await getActiveProviderRow()
        await queueWorkflowApprovalEmail({
          templateCode: 'LEAVE_SUBMITTED_MANAGER',
          module: 'absence',
          recipientEmail: mgr.email,
          recipientPersonId: approverPersonId,
          recipientName: mgr.name ?? undefined,
          vars: {
            managerName: mgr.name ?? 'Manager',
            employeeName: ctx.empNameEn,
            leaveType: absType.typeNameEn,
            startDate: String(row.startDate),
            endDate: String(row.endDate),
            duration: `${row.durationDays} day(s)`,
            reason: row.notes ?? '—',
            workflowRequestId: row.requestNumber,
            companyName: `${(await getCompanyBranding()).companyName} HR`,
          },
          workflowInstanceId: v2InstanceId,
          workflowStepInstanceId: step.id,
          approverPersonId,
          businessObjectType: 'absence_entries',
          businessObjectId: requestId,
          enableWorkflowActions: providerRow?.enableWorkflowActions ?? false,
          tokenExpiryMinutes: providerRow?.tokenExpiryMinutes ?? 2880,
          decisionContext: buildLeaveDecisionContext({
            requester: {
              nameEn:       ctx.empNameEn,
              personNumber: ctx.empNumber,
            },
            leaveTypeEn: absType.typeNameEn,
            leaveTypeAr: absType.typeNameAr,
            startDate:   String(row.startDate),
            endDate:     String(row.endDate),
            duration:    `${row.durationDays} day(s)`,
            reason:      row.notes,
            requestNumber: row.requestNumber,
            medicalCertificateRequired: row.medicalCertRequired,
          }),
          actor: { id: user.id, name: user.name },
        })
      }
    } catch (err) {
      console.error('[submitLeaveRequest] manager email queue failed (non-fatal):',
        err instanceof Error ? err.message : err)
    }
  }

  return { id: requestId, status: 'PENDING', workflowInstanceId: v2InstanceId }
  } catch (e) {
    console.error('[submitLeaveRequest] failed:', e instanceof Error ? e.message : e)
    translateError(e, 'submitLeaveRequest')
  }
}

// ── S5-Q4 — Compensation outbox emitter ──────────────────────────────────
// Used to record a "the workflow advanced but our mirror tx couldn't follow"
// event so the cron poller (TD-09) can reconcile. Best-effort: failure to
// emit is logged but does not mask the original error.
async function emitCompensationEvent(
  eventType: string,
  payload:   Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(events).values({
      tenantId:  TENANT_ID,
      eventType,
      payload,
    })
  } catch (e) {
    // Persist failure to audit_log so ops can detect outbox-table issues
    // without tailing server logs. Best-effort — if audit also fails the
    // failure is silent (acceptable: full DB outage has bigger problems).
    try {
      await writeAuditLog({
        actorId:      '00000000-0000-0000-0000-000000000000',
        actorName:    'system',
        actorRole:    'SYSTEM',
        channel:      'SYSTEM',
        eventType:    'SYSTEM.COMPENSATION_EVENT_FAILED',
        resourceType: 'events',
        metadata: {
          failedEventType: eventType,
          payload,
          error: e instanceof Error ? e.message : String(e),
        },
      })
    } catch { /* audit also unavailable */ }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 3 — getLeaveRequest
// ══════════════════════════════════════════════════════════════════════════

export async function getLeaveRequest(
  id: string,
): Promise<LeaveRequestDetail | null> {
  try {
    const user = await requireRole([
      'EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', 'SUPER_ADMIN',
    ])

    const [row] = await db
      .select({
        e: absenceEntries,
        p: { personNumber: persons.personNumber, fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr },
        t: { typeCode: absenceTypes.typeCode, nameEn: absenceTypes.typeNameEn, nameAr: absenceTypes.typeNameAr },
      })
      .from(absenceEntries)
      .leftJoin(persons, eq(absenceEntries.personId, persons.id))
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(eq(absenceEntries.tenantId, TENANT_ID), eq(absenceEntries.id, id)))
      .limit(1)
    if (!row) return null

    // Self-service / scope gates (relationship-based — every user is an employee
    // with a functional role). HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN may view any
    // request in their entity; everyone else (EMPLOYEE, MANAGER, PAYROLL_ADMIN,
    // FINANCE) may view only their own request or a direct/indirect report's.
    const HR_VIEW_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
    if (!HR_VIEW_ROLES.includes(user.role)) {
      if (!user.personId) {
        throw new Error('FORBIDDEN: user has no linked person record')
      }
      if (user.personId !== row.e.personId) {
        const teamIds = await resolveManagerViewablePersonIds(user.personId)
        if (!teamIds.includes(row.e.personId)) {
          throw new Error('FORBIDDEN: you may only view your own or your team members\' leave requests')
        }
      }
    }
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== row.e.legalEntityId
        && user.personId !== row.e.personId) {
      throw new Error('FORBIDDEN: cross-entity leave-request read denied')
    }

    return {
      id:                  row.e.id,
      requestNumber:       row.e.requestNumber,
      personId:            row.e.personId,
      personNumber:        row.p?.personNumber ?? null,
      personFullNameEn:    row.p?.fullNameEn ?? null,
      personFullNameAr:    row.p?.fullNameAr ?? null,
      legalEntityId:       row.e.legalEntityId,
      absenceTypeId:       row.e.absenceTypeId,
      absenceTypeCode:     row.t?.typeCode ?? null,
      absenceTypeNameEn:   row.t?.nameEn ?? null,
      absenceTypeNameAr:   row.t?.nameAr ?? null,
      startDate:           row.e.startDate,
      endDate:             row.e.endDate,
      durationDays:        row.e.durationDays,
      isHalfDay:           row.e.isHalfDay,
      halfDayPeriod:       row.e.halfDayPeriod,
      status:              row.e.status,
      submittedVia:        row.e.submittedVia,
      submittedBy:         row.e.submittedBy,
      approvedBy:          row.e.approvedBy,
      rejectionReason:     row.e.rejectionReason,
      workflowInstanceId:  row.e.workflowInstanceId,
      createdDate:         row.e.createdDate,
      notes:               row.e.notes,
      approvalDate:        row.e.approvalDate,
      medicalCertRequired: row.e.medicalCertRequired,
      medicalCertUploaded: row.e.medicalCertUploaded,
      medicalCertDocumentId: row.e.medicalCertDocumentId,
      medicalCertDeadline: row.e.medicalCertDeadline,
      balanceBeforeDays:   row.e.balanceBeforeDays,
      balanceAfterDays:    row.e.balanceAfterDays,
      payDeductionAmount:  row.e.payDeductionAmount,
      ariaRecommendation:  row.e.ariaRecommendation,
      ariaConfidenceScore: row.e.ariaConfidenceScore,
      extraData:           (row.e.extraData as Record<string, unknown>) ?? {},
    }
  } catch (e) { translateError(e, 'getLeaveRequest') }
}

// ══════════════════════════════════════════════════════════════════════════
// 4 — listLeaveRequests
// ══════════════════════════════════════════════════════════════════════════

export async function listLeaveRequests(
  filter: Partial<ListLeaveRequestsFilter> = {},
): Promise<PaginatedLeaveRequests> {
  const user = await requireRole([
    'EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', 'SUPER_ADMIN',
  ])
  const f = ListLeaveRequestsFilterSchema.parse(filter)

  // Entity scoping (Security spec §2.4): non-SUPER_ADMIN sees only their entity.
  const scopedEntityId =
    user.role === 'SUPER_ADMIN' ? f.legalEntityId : (f.legalEntityId ?? user.legalEntityId)

  const conditions = [eq(absenceEntries.tenantId, TENANT_ID)]
  if (scopedEntityId) conditions.push(eq(absenceEntries.legalEntityId, scopedEntityId))
  if (f.personId)     conditions.push(eq(absenceEntries.personId, f.personId))
  if (f.absenceTypeId) conditions.push(eq(absenceEntries.absenceTypeId, f.absenceTypeId))
  if (f.status)       conditions.push(eq(absenceEntries.status, f.status))
  if (f.fromDate)     conditions.push(gte(absenceEntries.endDate, f.fromDate))
  if (f.toDate)       conditions.push(lte(absenceEntries.startDate, f.toDate))

  // Relationship-based scope (every user is an employee with a functional role):
  //   HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN → all requests in their entity
  //     (no person filter added here).
  //   everyone else (EMPLOYEE, MANAGER, PAYROLL_ADMIN, FINANCE) → self + direct/
  //     indirect reports — re-derived server-side so URL/filter tampering cannot widen it:
  //     • f.personId === self       → /absence/my self view (existing eq restricts).
  //     • f.personId === a report   → validated to be in the caller's team.
  //     • no f.personId (team view) → reports only (empty if the caller manages no one).
  const ENTITY_WIDE_ROLES = new Set(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  if (!ENTITY_WIDE_ROLES.has(user.role)) {
    if (!user.personId) {
      return { rows: [], total: 0, page: f.page, pageSize: f.pageSize, totalPages: 0 }
    }
    if (f.personId && f.personId !== user.personId) {
      const teamIds = await resolveManagerViewablePersonIds(user.personId)
      if (!teamIds.includes(f.personId)) {
        return { rows: [], total: 0, page: f.page, pageSize: f.pageSize, totalPages: 0 }
      }
      // within team — the existing eq(personId) condition already restricts correctly.
    } else if (!f.personId) {
      const teamIds = await resolveManagerViewablePersonIds(user.personId)
      if (teamIds.length === 0) {
        return { rows: [], total: 0, page: f.page, pageSize: f.pageSize, totalPages: 0 }
      }
      conditions.push(inArray(absenceEntries.personId, teamIds))
    }
    // f.personId === self → existing eq condition is correct (self view).
  }

  const where = and(...conditions)!

  const [{ total }] = await db
    .select({ total: count() })
    .from(absenceEntries)
    .where(where)

  const offset = (f.page - 1) * f.pageSize
  const rows = await db
    .select({
      id:                  absenceEntries.id,
      requestNumber:       absenceEntries.requestNumber,
      personId:            absenceEntries.personId,
      personNumber:        persons.personNumber,
      personFullNameEn:    persons.fullNameEn,
      personFullNameAr:    persons.fullNameAr,
      legalEntityId:       absenceEntries.legalEntityId,
      absenceTypeId:       absenceEntries.absenceTypeId,
      absenceTypeCode:     absenceTypes.typeCode,
      absenceTypeNameEn:   absenceTypes.typeNameEn,
      absenceTypeNameAr:   absenceTypes.typeNameAr,
      startDate:           absenceEntries.startDate,
      endDate:             absenceEntries.endDate,
      durationDays:        absenceEntries.durationDays,
      isHalfDay:           absenceEntries.isHalfDay,
      halfDayPeriod:       absenceEntries.halfDayPeriod,
      status:              absenceEntries.status,
      submittedVia:        absenceEntries.submittedVia,
      submittedBy:         absenceEntries.submittedBy,
      approvedBy:          absenceEntries.approvedBy,
      rejectionReason:     absenceEntries.rejectionReason,
      workflowInstanceId:  absenceEntries.workflowInstanceId,
      createdDate:         absenceEntries.createdDate,
    })
    .from(absenceEntries)
    .leftJoin(persons, eq(absenceEntries.personId, persons.id))
    .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
    .where(where)
    .orderBy(...buildOrderBy(
      { column: f.sortColumn ?? null, direction: f.sortDirection ?? null },
      {
        request_number: absenceEntries.requestNumber,
        person:         persons.fullNameEn,
        type:           absenceTypes.typeNameEn,
        start_date:     absenceEntries.startDate,
        end_date:       absenceEntries.endDate,
        days:           absenceEntries.durationDays,
        status:         absenceEntries.status,
        submitted:      absenceEntries.createdDate,
      },
      absenceEntries.createdDate,
    ))
    .limit(f.pageSize)
    .offset(offset)

  return {
    rows: rows as LeaveRequestListRow[],
    total: Number(total),
    page: f.page,
    pageSize: f.pageSize,
    totalPages: Math.ceil(Number(total) / f.pageSize) || 1,
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 5 — cancelLeaveRequest
// ══════════════════════════════════════════════════════════════════════════

export async function cancelLeaveRequest(
  input: CancelLeaveRequestInput,
): Promise<{ id: string; status: 'CANCELLED' }> {
  try {
  const user = await requireRole([
    // Every employee-type user may file/submit/cancel their OWN leave; the
    // relationship-based person scope (assertCanRequestLeaveFor) restricts who
    // they can file FOR. PAYROLL_ADMIN/FINANCE are employees too.
    'EMPLOYEE', 'MANAGER', 'PAYROLL_ADMIN', 'FINANCE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
  ])
  const data = CancelLeaveRequestSchema.parse(input)

  await db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(absenceEntries)
      .where(and(eq(absenceEntries.tenantId, TENANT_ID), eq(absenceEntries.id, data.requestId)))
      .limit(1)
    if (!row) throw new Error('leave request not found')

    if (user.role === 'EMPLOYEE' && user.personId !== row.personId) {
      throw new Error('FORBIDDEN: employees may only cancel their own leave')
    }
    assertEntityScope(user, row.legalEntityId, 'leave cancellation')

    if (row.status === 'CANCELLED' || row.status === 'REJECTED' || row.status === 'TAKEN') {
      throw new Error(`request is already ${row.status} — cannot cancel`)
    }

    await tx
      .update(absenceEntries)
      .set({
        status:           'CANCELLED',
        rejectionReason:  data.reason,
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(eq(absenceEntries.id, data.requestId))

    // Restore balance based on prior status:
    // - PENDING: days were held in pendingDays — release by decrementing pendingDays.
    // - APPROVED: days were moved to takenDays at approval — restore by decrementing takenDays.
    if (row.status === 'PENDING' || row.status === 'APPROVED') {
      // Restore balance per calendar year (C2): PENDING releases pendingDays,
      // APPROVED restores takenDays — each for that year's portion only.
      const wasApproved = row.status === 'APPROVED'
      await applyLeaveBalanceSplitTx(
        tx as unknown as DbOrTx,
        {
          personId: row.personId, absenceTypeId: row.absenceTypeId,
          startDate: row.startDate, endDate: row.endDate, durationDays: Number(row.durationDays),
        },
        (cur, d) => ({
          pendingDays: wasApproved ? cur.pendingDays : Math.max(0, cur.pendingDays - d),
          takenDays:   wasApproved ? Math.max(0, cur.takenDays - d) : cur.takenDays,
        }),
        { id: user.id, name: user.name },
      )
    }

    // Close the workflow instance and recall any open steps, then clear pending
    // "awaiting your approval" notifications for it. Once cancelled, the request
    // must not be actionable from the Approvals menu/bell, and no approver should
    // be left with a stale notification inviting them to act on it.
    if (row.workflowInstanceId) {
      await cancelWorkflowInstance({
        instanceId:    row.workflowInstanceId,
        actorPersonId: user.personId ?? undefined,
        actorName:     user.name,
        reason:        data.reason,
        tx:            tx as unknown as Parameters<typeof cancelWorkflowInstance>[0]['tx'],
      })

      await tx
        .update(notificationLog)
        .set({ status: 'ACTIONED', readAt: new Date() })
        .where(and(
          eq(notificationLog.tenantId, TENANT_ID),
          eq(notificationLog.referenceId, row.workflowInstanceId),
        ))
    }

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: row.legalEntityId,
      channel:       'WEB',
      eventType:     'LEAVE_REQUEST.CANCELLED',
      resourceType:  'absence_entries',
      resourceId:    data.requestId,
      entityId:      row.legalEntityId,
      changedFields: ['status', 'rejectionReason'],
      metadata:      { previousStatus: row.status, reason: data.reason },
    }, tx)
  })

  return { id: data.requestId, status: 'CANCELLED' }
  } catch (e) { translateError(e, 'cancelLeaveRequest') }
}

// ══════════════════════════════════════════════════════════════════════════
// 6 — approveLeaveRequest / rejectLeaveRequest
// (delegates the workflow advance to actOnWorkflowStep, then mirrors the
// terminal status onto absence_entries)
// ══════════════════════════════════════════════════════════════════════════

export async function decideLeaveRequest(
  input: LeaveDecisionInput,
): Promise<{ id: string; status: string }> {
  try {
  // A1: decision is a privileged action — EMPLOYEE role explicitly excluded.
  // PAYROLL_ADMIN/FINANCE are admitted only so a line manager who happens to hold
  // one of those functional roles can act on a step ASSIGNED to them; the actual
  // authorisation (must be the assigned approver / delegate / privileged HR) is
  // enforced server-side in takeWorkflowAction — role alone grants nothing here.
  const user = await requireRole(['MANAGER', 'PAYROLL_ADMIN', 'FINANCE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  // approved_by references persons; account IDs belong only in audit actor fields.
  const approverPersonId = user.personId ?? null
  const data = LeaveDecisionSchema.parse(input)

  const [row] = await db
    .select()
    .from(absenceEntries)
    .where(and(eq(absenceEntries.tenantId, TENANT_ID), eq(absenceEntries.id, data.requestId)))
    .limit(1)
  if (!row) throw new Error('leave request not found')
  assertEntityScope(user, row.legalEntityId, 'leave decision')

  // A2: enforce state-machine invariant before touching the workflow engine.
  // The workflow-step check below is not sufficient on its own because absence
  // and workflow states can diverge via compensation paths.
  if (row.status !== 'PENDING') {
    throw new Error(
      `only PENDING requests may be decided (current: ${row.status}) · ` +
      `لا يمكن اتخاذ قرار إلا على الطلبات المعلقة (الحالة الحالية: ${row.status})`,
    )
  }
  // A3: Guard against requests that were never submitted to the workflow engine.
  // translateError maps 'request has no workflow instance' → user-friendly message.
  if (!row.workflowInstanceId) {
    throw new Error('request has no workflow instance — submit it first')
  }
  // BR-ML-001 / BR-LV-007 — maternity leave cannot be rejected under UAE law.
  // UAE FDL 33/2021 Article 30: employer must grant the full 60-day entitlement.
  if (data.action === 'REJECT') {
    const [absType] = await db
      .select({ typeCode: absenceTypes.typeCode })
      .from(absenceTypes)
      .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.id, row.absenceTypeId)))
      .limit(1)
    if (absType?.typeCode === 'MATERNITY') {
      throw new Error(
        'MATERNITY_CANNOT_REJECT: UAE FDL 33/2021 Article 30 — ' +
        'maternity leave cannot be rejected',
      )
    }
  }

  // Locate the pending v2 step for this absence entry
  const v2Status = await getWorkflowStatusForRequest(data.requestId)
  const pendingStep = v2Status?.steps.find(s => s.status === 'PENDING')
  if (!pendingStep) {
    throw new Error('No pending v2 workflow step found for this request — it may already be decided')
  }

  const wfResult = await takeWorkflowAction({
    stepInstanceId: pendingStep.stepInstanceId,
    actorPersonId:  user.personId ?? 'CURRENT_USER',
    decision:       data.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
    decisionNote:   data.comment ?? undefined,
  })

  if (!wfResult.success) {
    throw new Error(`Workflow action failed: ${wfResult.error ?? 'unknown error'} · فشل إجراء سير العمل: ${wfResult.error ?? 'خطأ غير معروف'}`)
  }

  const isTerminal = wfResult.instanceStatus === 'APPROVED' || wfResult.instanceStatus === 'REJECTED'
  if (!isTerminal) {
    return { id: data.requestId, status: 'PENDING' }
  }

  const finalStatus = data.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

  // takeWorkflowAction already called dispatchResourceCompletion which updated
  // absenceEntries.status and sent the notification. The tx below mirrors
  // the approval metadata (approvedBy, approvalDate, balance ledger) and writes
  // the absence-domain audit entry. If this fails, emit a compensation event.
  try {
  await db.transaction(async tx => {
    await tx
      .update(absenceEntries)
      .set({
        status:           finalStatus,
        approvedBy:       approverPersonId,
        approvalDate:     new Date(),
        rejectionReason:  data.action === 'REJECT' ? (data.comment ?? 'No reason provided') : null,
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(eq(absenceEntries.id, data.requestId))

    if (finalStatus === 'APPROVED') {
      // Move pending → taken on the balance ledger, split per calendar year (C2).
      await applyLeaveBalanceSplitTx(
        tx as unknown as DbOrTx,
        {
          personId: row.personId, absenceTypeId: row.absenceTypeId,
          startDate: row.startDate, endDate: row.endDate, durationDays: Number(row.durationDays),
        },
        (cur, d) => ({ pendingDays: Math.max(0, cur.pendingDays - d), takenDays: cur.takenDays + d }),
        { id: user.id, name: user.name },
      )
    } else if (finalStatus === 'REJECTED') {
      // P2-L1 — RELEASE the reservation (days held in pendingDays at submit time),
      // split per calendar year (C2). Previously rejection leaked the reservation.
      await applyLeaveBalanceSplitTx(
        tx as unknown as DbOrTx,
        {
          personId: row.personId, absenceTypeId: row.absenceTypeId,
          startDate: row.startDate, endDate: row.endDate, durationDays: Number(row.durationDays),
        },
        (cur, d) => ({ pendingDays: Math.max(0, cur.pendingDays - d), takenDays: cur.takenDays }),
        { id: user.id, name: user.name },
      )
    }

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: row.legalEntityId,
      channel:       'WEB',
      eventType:     finalStatus === 'APPROVED' ? 'LEAVE_REQUEST.APPROVED' : 'LEAVE_REQUEST.REJECTED',
      resourceType:  'absence_entries',
      resourceId:    data.requestId,
      entityId:      row.legalEntityId,
      changedFields: ['status', 'approvedBy', 'approvalDate'],
      metadata:      { action: data.action, comment: data.comment, workflowStatus: wfResult.instanceStatus },
    }, tx)
  })
  } catch (err) {
    await emitCompensationEvent('absence.decision_link_failed', {
      requestId:           data.requestId,
      v2InstanceId:        v2Status?.instanceId,
      legalEntityId:       row.legalEntityId,
      personId:            row.personId,
      action:              data.action,
      workflowFinalStatus: wfResult.instanceStatus,
      reason:              err instanceof Error ? err.message : String(err),
    })
    throw err
  }

  return { id: data.requestId, status: finalStatus }
  } catch (e) { translateError(e, 'decideLeaveRequest') }
}

// ══════════════════════════════════════════════════════════════════════════
// 7 — saveLeaveRuleSet (S5-06 / Hard Rule 11)
// ══════════════════════════════════════════════════════════════════════════

export async function saveLeaveRuleSet(
  input: SaveLeaveRuleSetInput,
): Promise<{ ruleSetId: string; lineCount: number }> {
  try {
  const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = SaveLeaveRuleSetSchema.parse(input)

  // Hard Rule 11 — every line must clear the UAE statutory floor BEFORE write.
  // BR-AL-001 minimum is 22 days/yr (CONFIGURATION_FRAMEWORK.md §5).
  for (const line of data.lines) {
    if (line.absenceTypeCode !== 'ANNUAL') continue
    // Highest tier = annual entitlement at full service.
    const highestTier = [...line.entitlementTiersJson]
      .sort((a, b) => b.minServiceMonths - a.minServiceMonths)[0]
    const annualDays = highestTier.daysEntitled
    // assertLeaveRuleNotBelowMinimum thinks in monthly accrual rate × 12.
    assertLeaveRuleNotBelowMinimum({
      accrualRateDays:      annualDays / 12,
      uaeMinimumDaysAnnual: 22,
    })
  }

  let ruleSetId = data.ruleSetId ?? ''
  let lineCount = 0

  await db.transaction(async tx => {
    if (data.ruleSetId) {
      // Update existing. Keep history by deactivating old lines + inserting new.
      await tx
        .update(leaveRuleSets)
        .set({
          ruleSetCode:         data.ruleSetCode,
          ruleSetNameEn:       data.ruleSetNameEn,
          ruleSetNameAr:       data.ruleSetNameAr ?? null,
          legalEntityId:       data.legalEntityId ?? null,
          entityTypeScope:     data.entityTypeScope ?? null,
          nationalityScope:    data.nationalityScope,
          employmentTypeScope: data.employmentTypeScope,
          effectiveFrom:       data.effectiveFrom,
          effectiveTo:         data.effectiveTo ?? null,
          isDefault:           data.isDefault,
          updatedBy:           user.id,
          updatedByName:       user.name,
          updatedDate:         new Date(),
          lastUpdatedDate:     new Date(),
        })
        .where(eq(leaveRuleSets.id, data.ruleSetId))

      await tx
        .update(leaveRuleLines)
        .set({ isActive: false, updatedBy: user.id, updatedByName: user.name, lastUpdatedDate: new Date() })
        .where(eq(leaveRuleLines.leaveRuleSetId, data.ruleSetId))
    } else {
      const [row] = await tx
        .insert(leaveRuleSets)
        .values({
          tenantId:            TENANT_ID,
          legalEntityId:       data.legalEntityId ?? null,
          ruleSetCode:         data.ruleSetCode,
          ruleSetNameEn:       data.ruleSetNameEn,
          ruleSetNameAr:       data.ruleSetNameAr ?? null,
          entityTypeScope:     data.entityTypeScope ?? null,
          nationalityScope:    data.nationalityScope,
          employmentTypeScope: data.employmentTypeScope,
          effectiveFrom:       data.effectiveFrom,
          effectiveTo:         data.effectiveTo ?? null,
          isActive:            true,
          isDefault:           data.isDefault,
          createdBy:           user.id,
          createdByName:       user.name,
        })
        .returning({ id: leaveRuleSets.id })
      ruleSetId = row.id
    }

    // Insert / replace lines.
    for (const line of data.lines) {
      await tx
        .insert(leaveRuleLines)
        .values({
          tenantId:                 TENANT_ID,
          leaveRuleSetId:           ruleSetId,
          absenceTypeCode:          line.absenceTypeCode,
          entitlementTiersJson:     line.entitlementTiersJson,
          maxCarryForwardDays:      String(line.maxCarryForwardDays),
          carryForwardExpiryMonths: line.carryForwardExpiryMonths,
          isProRated:               line.isProRated,
          accrualFrequency:         line.accrualFrequency,
          minServiceMonths:         line.minServiceMonths,
          maxDaysPerYear:           line.maxDaysPerYear === undefined ? null : String(line.maxDaysPerYear),
          encashmentAllowed:        line.encashmentAllowed,
          encashmentMaxDays:        line.encashmentMaxDays === undefined ? null : String(line.encashmentMaxDays),
          isActive:                 true,
          createdBy:                user.id,
          createdByName:            user.name,
        })
      lineCount++
    }

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: data.legalEntityId ?? undefined,
      channel:       'WEB',
      eventType:     data.ruleSetId ? 'LEAVE_RULE_SET.UPDATED' : 'LEAVE_RULE_SET.CREATED',
      resourceType:  'leave_rule_sets',
      resourceId:    ruleSetId,
      entityId:      data.legalEntityId ?? undefined,
      newValues:     {
        ruleSetCode: data.ruleSetCode,
        nationalityScope: data.nationalityScope,
        employmentTypeScope: data.employmentTypeScope,
        lineCount,
      },
    }, tx)
  })

  return { ruleSetId, lineCount }
  } catch (e) { translateError(e, 'saveLeaveRuleSet') }
}

// Touch the unused-imports so lint stays clean. These are kept here because
// nearby actions may grow to use them in Sprint 6.
void ilike

// ── Accommodation Requests (GAP-C07) ──────────────────────────────────────

export interface AccommodationRequestInput {
  requestType:          'DISABILITY' | 'PARENTAL' | 'NURSING_BREAK'
  descriptionEn:        string
  descriptionAr:        string
  requestedAdjustments: string
  effectiveDate:        string
  endDate?:             string
  supportingDocumentId?: string
}

export interface AccommodationRequestResult {
  requestId:  string
  instanceId: string
}

/**
 * GAP-C07 — UAE FDL 33/2021 Article 30: employees may request reasonable
 * accommodations for disability, pregnancy, or parental obligations. The
 * request triggers the ACCOMMODATION_REQUEST workflow which routes through
 * Line Manager → HR Director for approval.
 */
export async function requestDisabilityParentalAccommodation(
  input: AccommodationRequestInput,
): Promise<AccommodationRequestResult> {
  // BR-ACM-001: requires authenticated EMPLOYEE (own) or HR_ADMIN/SUPER_ADMIN
  const user = await requireRole(['EMPLOYEE', 'HR_ADMIN', 'SUPER_ADMIN'])
  if (!user.personId) throw new Error('NO_PERSON_RECORD: user is not linked to a person')
  if (!user.legalEntityId) throw new Error('NO_ENTITY: user has no legal entity')

  // BR-ACM-002: effectiveDate must not be in the past
  const today = new Date().toISOString().slice(0, 10)
  if (input.effectiveDate < today) {
    throw new Error('BR-ACM-002: effectiveDate must be today or future · يجب أن يكون تاريخ السريان اليوم أو في المستقبل')
  }
  if (input.endDate && input.endDate < input.effectiveDate) {
    throw new Error('BR-ACM-003: endDate must be on or after effectiveDate · يجب أن يكون تاريخ الانتهاء في أو بعد تاريخ السريان')
  }

  if (!input.descriptionEn?.trim() || !input.descriptionAr?.trim()) {
    throw new Error('VALIDATION: descriptionEn and descriptionAr are required')
  }

  let requestId = ''

  await db.transaction(async tx => {
    const [row] = await tx
      .insert(accommodationRequests)
      .values({
        tenantId:             TENANT_ID,
        personId:             user.personId!,
        legalEntityId:        user.legalEntityId!,
        requestType:          input.requestType,
        descriptionEn:        input.descriptionEn.trim(),
        descriptionAr:        input.descriptionAr.trim(),
        requestedAdjustments: input.requestedAdjustments?.trim() ?? null,
        effectiveDate:        input.effectiveDate,
        endDate:              input.endDate ?? null,
        supportingDocumentId: input.supportingDocumentId ?? null,
        status:               'PENDING',
        createdBy:            user.id,
        createdByName:        user.name,
      })
      .returning({ id: accommodationRequests.id })

    requestId = row.id

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      actorEntityId: user.legalEntityId ?? undefined,
      channel:      'WEB',
      eventType:    'ACCOMMODATION.REQUESTED',
      resourceType: 'accommodation_requests',
      resourceId:   requestId,
      entityId:     user.legalEntityId ?? undefined,
      newValues:    { requestType: input.requestType, effectiveDate: input.effectiveDate },
    }, tx)
  })

  // Initiate approval workflow outside the insert tx (workflow uses its own tx)
  // BR-ACM-003: ACCOMMODATION_REQUEST trigger event must have a seeded workflow definition.
  const { instanceId } = await initiateWorkflow(
    'ACCOMMODATION_REQUEST',
    'accommodation_requests',
    requestId,
    user.legalEntityId!,
    { requestType: input.requestType, personId: user.personId },
  )

  // Back-fill the workflow_instance_id on the request row. Tenant guard prevents
  // cross-tenant row update if requestId is ever supplied externally.
  await db
    .update(accommodationRequests)
    .set({ workflowInstanceId: instanceId })
    .where(and(
      eq(accommodationRequests.id, requestId),
      eq(accommodationRequests.tenantId, TENANT_ID),
    ))

  return { requestId, instanceId }
}

// ══════════════════════════════════════════════════════════════════════════
// 8 — getLeaveHistoryForEmployee (ESS leave history panel)
// ══════════════════════════════════════════════════════════════════════════

export interface LeaveHistoryRow {
  id:                   string
  requestNumber:        string | null
  typeCode:             string | null
  typeLabel:            string | null
  startDate:            string
  endDate:              string
  durationDays:         string | number | null
  status:               string
  createdDate:          Date | string | null
  rejectionReason:      string | null
  pendingApproverName:  string | null
  pendingApproverSince: Date | string | null
}

export async function getLeaveHistoryForEmployee(input: {
  typeCode?: string | null
  fromDate?: string | null
  toDate?:   string | null
  year?:     number | null
  page?:     number
  pageSize?: number
}): Promise<{
  rows:       LeaveHistoryRow[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}> {
  const user = await requireRole([
    'EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', 'SUPER_ADMIN',
  ])
  if (!user.personId) {
    return { rows: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
  }

  const page     = Math.max(1, input.page     ?? 1)
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20))
  const offset   = (page - 1) * pageSize

  const conditions = [
    eq(absenceEntries.tenantId, TENANT_ID),
    // Security: employees always see only their own data.
    eq(absenceEntries.personId, user.personId),
  ]

  if (input.typeCode) {
    conditions.push(eq(absenceTypes.typeCode, input.typeCode))
  }

  if (input.year) {
    conditions.push(gte(absenceEntries.startDate, `${input.year}-01-01`))
    conditions.push(lte(absenceEntries.startDate, `${input.year}-12-31`))
  } else {
    if (input.fromDate) conditions.push(gte(absenceEntries.startDate, input.fromDate))
    if (input.toDate)   conditions.push(lte(absenceEntries.startDate, input.toDate))
  }

  const where = and(...conditions)!

  const [{ total }] = await db
    .select({ total: count() })
    .from(absenceEntries)
    .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
    .where(where)

  const rawRows = await db
    .select({
      id:                 absenceEntries.id,
      requestNumber:      absenceEntries.requestNumber,
      typeCode:           absenceTypes.typeCode,
      typeLabel:          absenceTypes.typeNameEn,
      startDate:          absenceEntries.startDate,
      endDate:            absenceEntries.endDate,
      durationDays:       absenceEntries.durationDays,
      status:             absenceEntries.status,
      createdDate:        absenceEntries.createdDate,
      rejectionReason:    absenceEntries.rejectionReason,
      workflowInstanceId: absenceEntries.workflowInstanceId,
    })
    .from(absenceEntries)
    .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
    .where(where)
    .orderBy(desc(absenceEntries.startDate))
    .limit(pageSize)
    .offset(offset)

  // Batch-fetch the pending step approver for any PENDING rows.
  const pendingInstanceIds = rawRows
    .filter(r => r.status === 'PENDING' && r.workflowInstanceId)
    .map(r => r.workflowInstanceId as string)

  const approverMap = new Map<string, { name: string | null; since: Date | string | null }>()

  if (pendingInstanceIds.length > 0) {
    const approverAlias = alias(persons, 'approver')
    const delegateAlias = alias(persons, 'delegate')
    const stepRows = await db
      .select({
        instanceId:   workflowStepInstances.instanceId,
        approverName: approverAlias.fullNameEn,
        delegateName: delegateAlias.fullNameEn,
        since:        workflowStepInstances.createdDate,
      })
      .from(workflowStepInstances)
      .leftJoin(approverAlias, eq(workflowStepInstances.assignedToPersonId, approverAlias.id))
      .leftJoin(delegateAlias, eq(workflowStepInstances.delegatedToPersonId, delegateAlias.id))
      .where(and(
        inArray(workflowStepInstances.instanceId, pendingInstanceIds),
        eq(workflowStepInstances.status, 'PENDING'),
      ))
    for (const s of stepRows) {
      // delegateName takes priority when the step has been delegated.
      approverMap.set(s.instanceId, {
        name:  s.delegateName ?? s.approverName ?? null,
        since: s.since ?? null,
      })
    }
  }

  const rows: LeaveHistoryRow[] = rawRows.map(r => {
    const approver = r.workflowInstanceId ? approverMap.get(r.workflowInstanceId) : undefined
    return {
      id:                   r.id,
      requestNumber:        r.requestNumber,
      typeCode:             r.typeCode ?? null,
      typeLabel:            r.typeLabel ?? null,
      startDate:            r.startDate,
      endDate:              r.endDate,
      durationDays:         r.durationDays ?? null,
      status:               r.status,
      createdDate:          r.createdDate ?? null,
      rejectionReason:      r.rejectionReason ?? null,
      pendingApproverName:  approver?.name ?? null,
      pendingApproverSince: approver?.since ?? null,
    }
  })

  return {
    rows,
    total:      Number(total),
    page,
    pageSize,
    totalPages: Math.ceil(Number(total) / pageSize) || 1,
  }
}

// ── Medical Certificate Upload ─────────────────────────────────────────────

/**
 * BR-SL-002 — Upload a medical certificate for a sick-leave (or study-leave
 * enrolment cert) request.
 *
 * Rules:
 *  - EMPLOYEE may only upload for their own request.
 *  - Upload is only permitted while the request is DRAFT or REJECTED.
 *  - MIME whitelist: PDF, JPEG, PNG, WEBP (server-side enforced).
 *  - Maximum file size: 5 MB.
 *  - Writes: personDocuments row + absenceEntries cert flags — single tx.
 */
export async function uploadLeaveMedicalCert(
  requestId: string,
  formData:  FormData,
): Promise<{ success: true; fileName: string } | { success: false; error: string }> {
  let user: SessionUser
  try {
    user = await requireRole([
      'EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
    ])
  } catch {
    return { success: false, error: 'Authentication required.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'No file provided.' }
  }

  const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!ALLOWED_MIME.includes(file.type)) {
    return { success: false, error: 'Only PDF, JPEG, PNG, or WEBP files are accepted.' }
  }

  const MAX_BYTES = 5 * 1024 * 1024
  if (file.size > MAX_BYTES) {
    return { success: false, error: 'File must be 5 MB or smaller.' }
  }

  // Load the request to verify ownership, status, and cert requirement.
  const [row] = await db
    .select({
      id:                  absenceEntries.id,
      personId:            absenceEntries.personId,
      legalEntityId:       absenceEntries.legalEntityId,
      status:              absenceEntries.status,
      medicalCertRequired: absenceEntries.medicalCertRequired,
    })
    .from(absenceEntries)
    .where(and(eq(absenceEntries.id, requestId), eq(absenceEntries.tenantId, TENANT_ID)))
    .limit(1)

  if (!row) return { success: false, error: 'Leave request not found.' }

  if (!row.medicalCertRequired) {
    return { success: false, error: 'This leave request does not require a medical certificate.' }
  }

  if (!['DRAFT', 'REJECTED'].includes(row.status)) {
    return { success: false, error: 'Certificate can only be uploaded while the request is in DRAFT or REJECTED status.' }
  }

  // EMPLOYEE may only upload for their own request.
  if (user.role === 'EMPLOYEE' && user.personId !== row.personId) {
    return { success: false, error: 'You may only upload documents for your own leave request.' }
  }

  try {
    const { uploadDocument } = await import('@/lib/blob-storage')
    const meta = await uploadDocument({
      personId: row.personId,
      file,
      fileName: file.name,
      mimeType: file.type,
    })

    await db.transaction(async _tx => {
      const tx = _tx as unknown as DbOrTx

      const [doc] = await tx
        .insert(personDocuments)
        .values({
          tenantId:       TENANT_ID,
          personId:       row.personId,
          legalEntityId:  row.legalEntityId,
          documentType:   'OTHER',
          documentTitle:  `Medical Certificate — Leave ${requestId}`,
          scopeType:      'LEAVE_REQUEST',
          contextId:      requestId,
          storageKey:     meta.storageKey,
          fileName:       meta.fileName,
          fileSizeBytes:  meta.fileSizeBytes,
          mimeType:       meta.mimeType,
          checksumSha256: meta.checksumSha256,
          documentStatus: 'VALID',
          createdBy:      user.id,
          createdByName:  user.name,
        })
        .returning({ id: personDocuments.id })

      await tx
        .update(absenceEntries)
        .set({
          medicalCertUploaded:   true,
          medicalCertDocumentId: doc.id,
        })
        .where(eq(absenceEntries.id, requestId))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: row.legalEntityId,
        channel:       'WEB',
        eventType:     'LEAVE_REQUEST.CERT_UPLOADED',
        resourceType:  'absence_entries',
        resourceId:    requestId,
        entityId:      row.legalEntityId,
        newValues:     { medicalCertUploaded: true, documentId: doc.id, fileName: meta.fileName },
      }, tx)
    })

    revalidatePath(`/absence/${requestId}`)
    return { success: true, fileName: meta.fileName }
  } catch (err) {
    return { success: false, error: translateError(err, 'uploadLeaveMedicalCert') }
  }
}
