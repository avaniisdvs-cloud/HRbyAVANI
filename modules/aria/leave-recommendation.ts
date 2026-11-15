'use server'
/**
 * ARIA Leave Approval Recommendation Engine.
 *
 * Called by the outbox poller after a leave request is submitted.
 * Fetches contextual data (balance, coverage, history, compliance),
 * calls Claude to produce a structured JSON recommendation, then
 * persists the result to absence_entries.aria_recommendation_json.
 *
 * Hard Rule 1: every DB write uses writeAuditLog inside the same tx.
 * Hard Rule 8: cross-module imports only via index.ts barrels.
 */
import { getResilientLlmClient } from '@/lib/aria/llm'
import { loadAriaRuntimeConfig } from '@/lib/aria/config-loader'
import {
  and, eq, gte, lte, ne, count,
} from 'drizzle-orm'
import { db }               from '@/lib/db'
import { writeAuditLog }    from '@/lib/audit'
import { TENANT_ID }        from '@/lib/constants'
import {
  absenceEntries,
  absenceTypes,
  absenceBalances,
  persons,
  departments,
  workerAssignments,
} from '@/drizzle/schema'
import type {
  AriaLeaveRecommendation,
  AriaLeaveRecommendationCode,
  AriaRecommendationFactor,
} from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_ACTOR_ID   = '00000000-0000-0000-0000-000000000000'

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates and persists an ARIA leave recommendation for the given request.
 * Called by the outbox poller after submitLeaveRequest emits
 * an ARIA.LEAVE_RECOMMENDATION event.
 *
 * Failures are non-fatal: the function logs a warning and returns without
 * writing. The approver will see "ARIA recommendation not available."
 */
export async function generateLeaveRecommendation(requestId: string): Promise<void> {
  try {
    await _generate(requestId)
  } catch (err) {
    console.warn('[ARIA:leave-recommendation] failed — proceeding without recommendation:', err)
  }
}

// ── Internal implementation ───────────────────────────────────────────────────

async function _generate(requestId: string): Promise<void> {
  // ── 1. Fetch leave request ────────────────────────────────────────────────
  const [req] = await db
    .select({
      id:           absenceEntries.id,
      personId:     absenceEntries.personId,
      legalEntityId: absenceEntries.legalEntityId,
      absenceTypeId: absenceEntries.absenceTypeId,
      startDate:    absenceEntries.startDate,
      endDate:      absenceEntries.endDate,
      durationDays: absenceEntries.durationDays,
      status:       absenceEntries.status,
      submittedVia: absenceEntries.submittedVia,
      notes:        absenceEntries.notes,
      typeNameEn:   absenceTypes.typeNameEn,
      typeNameAr:   absenceTypes.typeNameAr,
      typeCode:     absenceTypes.typeCode,
      minNoticeDays: absenceTypes.minNoticeDays,
      maxDaysPerYear: absenceTypes.maxDaysPerYear,
    })
    .from(absenceEntries)
    .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
    .where(and(
      eq(absenceEntries.tenantId, TENANT_ID),
      eq(absenceEntries.id, requestId),
    ))
    .limit(1)

  if (!req) throw new Error(`leave request not found: ${requestId}`)

  // ── 2. Fetch employee details ─────────────────────────────────────────────
  const [emp] = await db
    .select({
      id:             persons.id,
      fullNameEn:     persons.fullNameEn,
      hireDate:       persons.hireDate,
      gender:         persons.gender,
      employmentType: persons.employmentType,
      deptId:         persons.currentDepartmentId,
    })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.id, req.personId),
    ))
    .limit(1)

  // ── 3. Fetch leave balance ────────────────────────────────────────────────
  const startYear = req.startDate ? new Date(req.startDate).getFullYear() : new Date().getFullYear()

  const [bal] = await db
    .select({
      openingBalance: absenceBalances.openingBalanceDays,
      accruedDays:    absenceBalances.accruedDays,
      takenDays:      absenceBalances.takenDays,
      closingBalance: absenceBalances.closingBalanceDays,
    })
    .from(absenceBalances)
    .where(and(
      eq(absenceBalances.tenantId, TENANT_ID),
      eq(absenceBalances.personId, req.personId),
      eq(absenceBalances.absenceTypeId, req.absenceTypeId),
      eq(absenceBalances.balanceYear, startYear),
    ))
    .limit(1)

  // ── 4. Fetch department details ───────────────────────────────────────────
  let deptNameEn = 'Unknown Department'

  if (emp?.deptId) {
    const [dept] = await db
      .select({ nameEn: departments.nameEn })
      .from(departments)
      .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.id, emp.deptId)))
      .limit(1)
    if (dept) deptNameEn = dept.nameEn ?? deptNameEn
  }

  // ── 5. Fetch team coverage (same dept, overlapping dates, APPROVED/PENDING) ─
  let teamOnLeaveCount = 0
  let teamTotalCount   = 0

  if (emp?.deptId && req.startDate && req.endDate) {
    // Count total in dept
    const [tc] = await db
      .select({ total: count() })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.legalEntityId, req.legalEntityId),
        eq(workerAssignments.isCurrent, true),
      ))
    teamTotalCount = tc?.total ?? 0

    // Count on overlapping leave (excluding the current request)
    const [ol] = await db
      .select({ onLeave: count() })
      .from(absenceEntries)
      .leftJoin(
        workerAssignments,
        and(
          eq(absenceEntries.personId, workerAssignments.personId),
          eq(workerAssignments.isCurrent, true),
          eq(workerAssignments.tenantId, TENANT_ID),
        ),
      )
      .where(and(
        eq(absenceEntries.tenantId, TENANT_ID),
        ne(absenceEntries.id, requestId),
        lte(absenceEntries.startDate, req.endDate!),
        gte(absenceEntries.endDate, req.startDate!),
      ))
    teamOnLeaveCount = ol?.onLeave ?? 0
  }

  // ── 6. Fetch leave history (past 12 months) ───────────────────────────────
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const historyFrom = twelveMonthsAgo.toISOString().slice(0, 10)

  const [hist] = await db
    .select({ totalRequests: count() })
    .from(absenceEntries)
    .where(and(
      eq(absenceEntries.tenantId, TENANT_ID),
      eq(absenceEntries.personId, req.personId),
      ne(absenceEntries.id, requestId),
      gte(absenceEntries.startDate, historyFrom),
    ))

  const historyCount = hist?.totalRequests ?? 0

  // ── 7. Compute notice days ────────────────────────────────────────────────
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDateObj = req.startDate ? new Date(req.startDate + 'T00:00:00') : today
  const noticeDays   = Math.max(0, Math.round((startDateObj.getTime() - today.getTime()) / 86_400_000))
  const minNotice    = req.minNoticeDays ? Number(req.minNoticeDays) : 0

  // ── 8. Build Claude prompt ────────────────────────────────────────────────
  const currentBalance = bal ? parseFloat(bal.closingBalance ?? '0') : null
  const takenThisYear  = bal ? parseFloat(bal.takenDays ?? '0') : 0
  const durationDays   = req.durationDays ? parseFloat(req.durationDays) : 0
  const balanceAfter   = currentBalance !== null ? currentBalance - durationDays : null

  const dataBlock = `
LEAVE REQUEST DATA:
- Request ID: ${req.id}
- Employee: ${emp?.fullNameEn ?? 'Unknown'} (Dept: ${deptNameEn})
- Leave Type: ${req.typeNameEn ?? req.typeCode ?? 'Unknown'} (${req.typeCode ?? ''})
- Dates: ${req.startDate} to ${req.endDate} (${durationDays} days)
- Submitted Via: ${req.submittedVia ?? 'Portal'}

BALANCE:
- Current Balance: ${currentBalance !== null ? `${currentBalance} days` : 'Not initialised (no balance row)'}
- Taken This Year: ${takenThisYear} days
- Balance After Leave: ${balanceAfter !== null ? `${balanceAfter} days` : 'Unknown'}
- Max Days Per Year: ${req.maxDaysPerYear ?? 'Not configured'}

NOTICE PERIOD:
- Notice Given: ${noticeDays} days
- Minimum Required: ${minNotice} days

TEAM COVERAGE (${deptNameEn}):
- Team Size: ${teamTotalCount} members
- Colleagues on Leave (same period): ${teamOnLeaveCount}

LEAVE HISTORY (last 12 months):
- Previous leave requests: ${historyCount}

UAE LABOUR LAW CONTEXT:
- Annual leave entitlement: Article 29, FDL No. 33 of 2021 (14 days after 6 months; 30 days after 1 year)
- Sick leave: Article 31, FDL No. 33 of 2021
- Maternity leave: Article 30, FDL No. 33 of 2021
`.trim()

  const systemPrompt = `You are ARIA, an AI recommendation engine for an HR platform in the UAE.

Analyse the leave request data and return a JSON object with this EXACT shape:
{
  "recommendation": "APPROVE" | "REJECT" | "REVIEW",
  "confidence": <number 0.0–1.0>,
  "summaryEn": "<1-sentence summary in English>",
  "summaryAr": "<1-sentence summary in Gulf Arabic>",
  "factors": [
    {
      "factor": "Balance",
      "status": "OK" | "WARN" | "FAIL",
      "detailEn": "<concise detail in English>",
      "detailAr": "<concise detail in Gulf Arabic>"
    },
    {
      "factor": "Team Coverage",
      "status": "OK" | "WARN" | "FAIL",
      "detailEn": "<concise detail>",
      "detailAr": "<concise detail>"
    },
    {
      "factor": "Notice Period",
      "status": "OK" | "WARN" | "FAIL",
      "detailEn": "<concise detail>",
      "detailAr": "<concise detail>"
    },
    {
      "factor": "History",
      "status": "OK" | "WARN" | "FAIL",
      "detailEn": "<concise detail>",
      "detailAr": "<concise detail>"
    },
    {
      "factor": "Compliance",
      "status": "OK" | "WARN" | "FAIL",
      "detailEn": "<UAE Labour Law article reference if relevant>",
      "detailAr": "<Arabic>"
    }
  ],
  "generatedAt": "<ISO timestamp>",
  "model": "claude-sonnet-4-6"
}

Rules:
- APPROVE: balance sufficient, notice met, no coverage risk, history normal
- REJECT: negative balance after leave, or critical compliance violation
- REVIEW: borderline balance, short notice, high team absence, or unusual history
- Recommendation is advisory only — final decision rests with the approver.
- Return ONLY valid JSON. No prose, no markdown fences.`

  const cfg = await loadAriaRuntimeConfig()
  const { adapter, modelId } = getResilientLlmClient({
    provider: cfg.provider, modelId: cfg.modelId, apiKey: cfg.apiKey, apiEndpoint: cfg.apiEndpoint,
    fallbackProvider: cfg.fallbackProvider, fallbackModelId: cfg.fallbackModelId, fallbackApiKey: cfg.fallbackApiKey,
  })
  const response = await adapter.generate({
    model:     modelId,
    maxTokens: 700,
    system:    systemPrompt,
    messages:  [{ role: 'user', content: dataBlock }],
    jsonMode:  true,
  })

  const rawText = response.text.trim()

  // Strip markdown fences if Claude added them despite instructions
  const jsonText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  let result: AriaLeaveRecommendation
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>

    // Validate and shape
    const validCodes: AriaLeaveRecommendationCode[] = ['APPROVE', 'REJECT', 'REVIEW']
    const code = validCodes.includes(parsed.recommendation as AriaLeaveRecommendationCode)
      ? parsed.recommendation as AriaLeaveRecommendationCode
      : 'REVIEW'

    result = {
      recommendation: code,
      confidence:     typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      summaryEn:      typeof parsed.summaryEn  === 'string' ? parsed.summaryEn  : 'ARIA review complete.',
      summaryAr:      typeof parsed.summaryAr  === 'string' ? parsed.summaryAr  : 'اكتملت مراجعة ARIA.',
      factors:        Array.isArray(parsed.factors)
        ? (parsed.factors as AriaRecommendationFactor[])
        : [],
      generatedAt:    typeof parsed.generatedAt === 'string' ? parsed.generatedAt : new Date().toISOString(),
      model:          response.model,
    }
  } catch (parseErr) {
    throw new Error(`ARIA returned invalid JSON: ${String(parseErr)}\n\nRaw: ${rawText.slice(0, 300)}`)
  }

  // ── 9. Persist recommendation (single transaction + audit log) ────────────
  await db.transaction(async tx => {
    await tx
      .update(absenceEntries)
      .set({
        ariaRecommendation:     result.recommendation,
        ariaConfidenceScore:    result.confidence.toString(),
        ariaRecommendationJson: result as unknown as Record<string, unknown>,
        updatedBy:              SYSTEM_ACTOR_ID,
        updatedByName:          'ARIA',
        updatedDate:            new Date(),
        lastUpdatedDate:        new Date(),
      })
      .where(eq(absenceEntries.id, requestId))

    await writeAuditLog({
      actorId:      SYSTEM_ACTOR_ID,
      actorName:    'ARIA',
      actorRole:    'SYSTEM',
      channel:      'ARIA_TEXT',
      eventType:    'ARIA.LEAVE_RECOMMENDATION.GENERATED',
      resourceType: 'absence_entries',
      resourceId:   requestId,
      entityId:     req.legalEntityId,
      newValues:    { recommendation: result.recommendation, confidence: result.confidence },
    }, tx)
  })
}
