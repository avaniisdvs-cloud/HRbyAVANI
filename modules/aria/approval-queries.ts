'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { db }                from '@/lib/db'
import { TENANT_ID }         from '@/lib/constants'
import {
  persons,
  departments,
  absenceEntries,
  absenceTypes,
  absenceBalances,
  workflowInstancesV2,
} from '@/drizzle/schema'
import { getPendingApprovalsV2 } from '@/modules/workflow'
import type { AriaLeaveRecommendation }      from './types'

export interface PendingApproval {
  instanceId:      string
  workflowType:    string
  initiatorName:   string
  department:      string
  submittedAt:     string
  daysPending:     number
  isBreached:      boolean
  // Leave-specific (populated when resourceType === 'LEAVE_REQUEST')
  leaveType?:      string
  leaveFrom?:      string
  leaveTo?:        string
  leaveDays?:      number
  leaveReason?:    string
  balanceBefore?:  number
}

function fmtDate(s: Date | string | null | undefined): string {
  if (!s) return '—'
  return new Date(s)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-')
}

export async function getPendingApprovalsForUser(): Promise<PendingApproval[]> {
  try {
    const rows = await getPendingApprovalsV2()
    if (rows.length === 0) return []

    const today = new Date()

    // ── Batch-fetch dept names via persons.currentDepartmentId ───────────────
    const personIds = [...new Set(rows.map(r => r.initiatorPersonId).filter(Boolean))]
    const personDeptMap = new Map<string, string>() // personId → deptName

    if (personIds.length > 0) {
      const pRows = await db
        .select({
          id:      persons.id,
          deptName: departments.nameEn,
        })
        .from(persons)
        .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
        .where(and(
          eq(persons.tenantId, TENANT_ID),
          inArray(persons.id, personIds),
        ))
      for (const p of pRows) {
        personDeptMap.set(p.id, p.deptName ?? '—')
      }
    }

    // ── Batch-fetch leave details for LEAVE_REQUEST rows ─────────────────────
    const leaveResourceIds = rows
      .filter(r => r.resourceType === 'absence_entries' && r.resourceId)
      .map(r => r.resourceId)

    type LeaveDetail = {
      id:            string
      typeNameEn:    string | null
      startDate:     string | null
      endDate:       string | null
      durationDays:  string | null
      notes:         string | null
      balanceBefore: string | null
    }
    const leaveMap = new Map<string, LeaveDetail>()

    if (leaveResourceIds.length > 0) {
      const leaveRows = await db
        .select({
          id:            absenceEntries.id,
          typeNameEn:    absenceTypes.typeNameEn,
          startDate:     absenceEntries.startDate,
          endDate:       absenceEntries.endDate,
          durationDays:  absenceEntries.durationDays,
          notes:         absenceEntries.notes,
          balanceBefore: absenceEntries.balanceBeforeDays,
        })
        .from(absenceEntries)
        .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
        .where(inArray(absenceEntries.id, leaveResourceIds))
      for (const lr of leaveRows) {
        leaveMap.set(lr.id, lr)
      }
    }

    // ── Shape results ─────────────────────────────────────────────────────────
    const results: PendingApproval[] = []

    for (const r of rows) {
      const daysPending = Math.floor(
        (today.getTime() - new Date(r.startedAt).getTime()) / 86400000
      )

      const item: PendingApproval = {
        instanceId:   r.instanceId,
        workflowType: r.workflowNameEn,
        initiatorName: r.initiatorName,
        department:   personDeptMap.get(r.initiatorPersonId) ?? '—',
        submittedAt:  fmtDate(r.startedAt),
        daysPending,
        isBreached:   r.isBreached,
      }

      if (r.resourceType === 'absence_entries' && r.resourceId) {
        const ld = leaveMap.get(r.resourceId)
        if (ld) {
          item.leaveType    = ld.typeNameEn ?? 'Leave'
          item.leaveFrom    = fmtDate(ld.startDate)
          item.leaveTo      = fmtDate(ld.endDate)
          item.leaveDays    = ld.durationDays ? parseFloat(ld.durationDays) : undefined
          item.leaveReason  = ld.notes ?? undefined
          item.balanceBefore = ld.balanceBefore ? parseFloat(ld.balanceBefore) : undefined
        }
      }

      results.push(item)
    }

    return results

  } catch (err) {
    console.error('[getPendingApprovalsForUser]', err)
    return []
  }
}

// ── getLeaveRecommendationForInstance ─────────────────────────────────────────

/**
 * Fetches the CACHED ARIA leave recommendation for a workflow instance.
 * Joins workflow_instances_v2 → absence_entries to find the recommendation.
 * Only returns data when resourceType = 'absence_entries'.
 *
 * ⚡ P1 HOTFIX — READ-ONLY. This runs on the approval-review render path, so it
 * MUST NOT generate. Generation is asynchronous only (outbox at submit time).
 * Previously this synchronously called generateLeaveRecommendation() (≈8 queries
 * + a blocking Claude API call) on every open without a cached recommendation,
 * causing the 1–2 minute review-page hang. Now: return the cached recommendation
 * if present, else null → the card shows its "review manually" fallback instantly.
 *
 * Returns null when: not a leave request · no cached recommendation yet · not found.
 */
export async function getLeaveRecommendationForInstance(
  instanceId: string,
): Promise<AriaLeaveRecommendation | null> {
  try {
    const [row] = await db
      .select({
        resourceType:           workflowInstancesV2.resourceType,
        ariaRecommendationJson: absenceEntries.ariaRecommendationJson,
      })
      .from(workflowInstancesV2)
      .leftJoin(
        absenceEntries,
        and(
          eq(workflowInstancesV2.resourceId,   absenceEntries.id),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )
      .where(and(
        eq(workflowInstancesV2.tenantId,  TENANT_ID),
        eq(workflowInstancesV2.id, instanceId),
      ))
      .limit(1)

    if (!row) return null
    if (row.resourceType !== 'absence_entries') return null
    if (!row.ariaRecommendationJson) return null   // no cached rec → fallback UI (NO sync generation)
    return row.ariaRecommendationJson as unknown as AriaLeaveRecommendation
  } catch (err) {
    console.error('[getLeaveRecommendationForInstance]', err)
    return null
  }
}

// ── getLeaveRequestSummaryForInstance ─────────────────────────────────────────

export interface LeaveRequestSummary {
  requestNumber:  string
  employeeName:   string
  employeeNumber: string
  typeNameEn:     string | null
  typeNameAr:     string | null
  startDate:      string
  endDate:        string
  startDateFmt:   string
  endDateFmt:     string
  durationDays:   number
  isHalfDay:      boolean
  halfDayPeriod:  string | null
  status:         string
  notes:          string | null
  balanceBefore:  number | null
  balanceAfter:   number | null
  /** Provenance of the balance values:
   *   'snapshot' — immutable values captured at submission (audit-correct)
   *   'live'     — legacy fallback computed from the current balance (NOT as-of-submission)
   *   'none'     — no balance row exists; values are null */
  balanceSource:  'snapshot' | 'live' | 'none'
  /** Whether the leave type is balance-controlled (BR-LV-BAL-001). When false,
   *  the UI shows the balance as "not applicable" rather than a dash. */
  requiresBalance: boolean
  hasAttachment:  boolean
}

/**
 * Fetches the leave request details behind a workflow instance, so the approver
 * sees WHAT was requested (employee, type, dates, days, half-day, reason, balance,
 * attachment) directly on the approval page — not just the workflow chain.
 *
 * Returns null when the instance is not a leave request or is not found.
 */
export async function getLeaveRequestSummaryForInstance(
  instanceId: string,
): Promise<LeaveRequestSummary | null> {
  try {
    const [row] = await db
      .select({
        resourceType:    workflowInstancesV2.resourceType,
        requestNumber:   absenceEntries.requestNumber,
        personId:        absenceEntries.personId,
        absenceTypeId:   absenceEntries.absenceTypeId,
        startDate:       absenceEntries.startDate,
        endDate:         absenceEntries.endDate,
        durationDays:    absenceEntries.durationDays,
        isHalfDay:       absenceEntries.isHalfDay,
        halfDayPeriod:   absenceEntries.halfDayPeriod,
        status:          absenceEntries.status,
        notes:           absenceEntries.notes,
        balanceBefore:   absenceEntries.balanceBeforeDays,
        balanceAfter:    absenceEntries.balanceAfterDays,
        attachmentId:    absenceEntries.medicalCertDocumentId,
        typeNameEn:      absenceTypes.typeNameEn,
        typeNameAr:      absenceTypes.typeNameAr,
        requiresBalance: absenceTypes.requiresBalance,
        employeeName:    persons.fullNameEn,
        employeeNumber:  persons.personNumber,
      })
      .from(workflowInstancesV2)
      .innerJoin(
        absenceEntries,
        and(
          eq(workflowInstancesV2.resourceId, absenceEntries.id),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .leftJoin(persons, eq(absenceEntries.personId, persons.id))
      .where(and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.id, instanceId),
      ))
      .limit(1)

    if (!row || row.resourceType !== 'absence_entries') return null

    const duration = row.durationDays ? parseFloat(row.durationDays) : 0

    // ── Option A — balance provenance ─────────────────────────────────────────
    // 1) Prefer the IMMUTABLE per-request snapshot written at submission time
    //    (balance_before_days / balance_after_days on absence_entries). This is
    //    the only audit-correct value: the balance AS IT WAS when the employee
    //    submitted. Once written it is never mutated.
    // 2) Legacy rows (submitted before the snapshot was persisted) have NULL
    //    snapshots. Only then do we fall back to a LIVE balance computed from the
    //    authoritative component formula used by the submission gate
    //    (opening + accrued + carriedForward + adjusted − taken − pending − forfeited).
    //    This is the CURRENT balance, NOT the as-of-submission balance — the UI
    //    must label it as such.
    // 3) If no balance row exists at all, values stay null (balanceSource = 'none').
    let balanceBefore = row.balanceBefore != null ? parseFloat(row.balanceBefore) : null
    let balanceAfter  = row.balanceAfter  != null ? parseFloat(row.balanceAfter)  : null
    let balanceSource: 'snapshot' | 'live' | 'none' =
      (balanceBefore !== null && balanceAfter !== null) ? 'snapshot' : 'none'

    if (balanceSource !== 'snapshot' && row.personId && row.absenceTypeId && row.startDate) {
      const year = new Date(row.startDate).getFullYear()
      const [bal] = await db
        .select({
          opening:        absenceBalances.openingBalanceDays,
          accrued:        absenceBalances.accruedDays,
          carriedForward: absenceBalances.carriedForwardDays,
          adjusted:       absenceBalances.adjustedDays,
          taken:          absenceBalances.takenDays,
          pending:        absenceBalances.pendingDays,
          forfeited:      absenceBalances.forfeitedDays,
        })
        .from(absenceBalances)
        .where(and(
          eq(absenceBalances.tenantId, TENANT_ID),
          eq(absenceBalances.personId, row.personId),
          eq(absenceBalances.absenceTypeId, row.absenceTypeId),
          eq(absenceBalances.balanceYear, year),
        ))
        .limit(1)
      if (bal) {
        const num = (v: string | null) => (v != null ? parseFloat(v) : 0)
        // Same formula as the submission gate (computeClosingBalance).
        const available = Math.round(
          (num(bal.opening) + num(bal.accrued) + num(bal.carriedForward) + num(bal.adjusted)
            - num(bal.taken) - num(bal.pending) - num(bal.forfeited)) * 100,
        ) / 100
        balanceBefore = available
        balanceAfter  = Math.round((available - duration) * 100) / 100
        balanceSource = 'live'
      }
    }

    return {
      requestNumber:  row.requestNumber,
      employeeName:   row.employeeName ?? '—',
      employeeNumber: row.employeeNumber ?? '—',
      typeNameEn:     row.typeNameEn,
      typeNameAr:     row.typeNameAr,
      startDate:      row.startDate,
      endDate:        row.endDate,
      startDateFmt:   fmtDate(row.startDate),
      endDateFmt:     fmtDate(row.endDate),
      durationDays:   duration,
      isHalfDay:      row.isHalfDay,
      halfDayPeriod:  row.halfDayPeriod,
      status:         row.status,
      notes:          row.notes,
      balanceBefore,
      balanceAfter,
      balanceSource,
      requiresBalance: row.requiresBalance ?? true,
      hasAttachment:  Boolean(row.attachmentId),
    }
  } catch (err) {
    console.error('[getLeaveRequestSummaryForInstance]', err)
    return null
  }
}
