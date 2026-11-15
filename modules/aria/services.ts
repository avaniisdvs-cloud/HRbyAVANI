/**
 * ARIA services — intent classification + data handler orchestration.
 *
 * Hard Rule 8: all cross-module calls go through module index.ts barrels.
 * Hard Rule 7: ARIA never writes data without explicit user confirmation.
 *
 * Architecture:
 *   1. classifyIntent()  — calls Claude API (claude-sonnet-4-6) to classify
 *                          the user message into a structured intent JSON.
 *   2. handleIntent()    — dispatches to the correct data handler based on
 *                          the classified intent, queries live data, returns
 *                          a formatted natural-language response.
 *   Second Claude call wraps live data in a bilingual, policy-cited response.
 */
import { getResilientLlmClient } from '@/lib/aria/llm'
import type { LlmMessage } from '@/lib/aria/llm'
import { loadAriaRuntimeConfig } from '@/lib/aria/config-loader'
import { ARIA_INTENT_CLASSIFIER_PROMPT } from '@/lib/aria/system-prompt'
import { isoDateAddDays, isoDateDiff } from '@/lib/date-utils'
import type {
  AriaIntentResult,
  AriaIntentEntities,
  AriaSessionContext,
  AriaChatMessage,
  AriaResponse,
  AriaLeaveDraft,
  AriaTransferDraft,
} from './types'
import type { PendingApproverInfo } from '@/modules/workflow'

// ── Date formatting helper ─────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-')
  // Produces "04-May-2026"
}

// ── Anthropic client (lazy — only instantiated when ARIA_API_KEY is set) ──

// Provider-independent LLM access. The active provider/model/key come from
// configuration (ariaModelConfig, via loadAriaRuntimeConfig) — never hard-coded.
// Business logic here does not know or care which provider is active.
async function getAriaLlm() {
  const cfg = await loadAriaRuntimeConfig()
  // Resilient client: primary provider with automatic single-retry failover to
  // the configured fallback provider/model on availability errors.
  return getResilientLlmClient({
    provider:         cfg.provider,
    modelId:          cfg.modelId,
    apiKey:           cfg.apiKey,
    apiEndpoint:      cfg.apiEndpoint,
    fallbackProvider: cfg.fallbackProvider,
    fallbackModelId:  cfg.fallbackModelId,
    fallbackApiKey:   cfg.fallbackApiKey,
  })
}

// ── Employment entity resolver ────────────────────────────────────────────
// Resolve the legalEntityId from the employee's CURRENT worker assignment.
// Absence balances are stored against the employment entity, which may differ
// from ctx.legalEntityId (sourced from the auth user record).
// Falls back to ctx.legalEntityId if no active assignment exists.

async function resolveEmploymentEntityId(ctx: AriaSessionContext): Promise<string> {
  try {
    const { db }        = await import('@/lib/db')
    const { eq, and }   = await import('drizzle-orm')
    const { TENANT_ID } = await import('@/lib/constants')
    const { workerAssignments } = await import('@/drizzle/schema')

    const [asgn] = await db
      .select({ legalEntityId: workerAssignments.legalEntityId })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, ctx.personId),
        eq(workerAssignments.isCurrent, true),
      ))
      .limit(1)

    return asgn?.legalEntityId ?? ctx.legalEntityId
  } catch {
    return ctx.legalEntityId
  }
}

// ── Role-gate constants ────────────────────────────────────────────────────

const ADMIN_ROLES   = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE']
const MANAGER_ROLES = [...ADMIN_ROLES, 'MANAGER']

function requireRole(ctx: AriaSessionContext, allowedRoles: string[], lang: 'en' | 'ar'): AriaResponse | null {
  if (!allowedRoles.includes(ctx.role)) {
    return {
      message: lang === 'ar'
        ? 'هذه المعلومات متاحة لمسؤولي الموارد البشرية فقط.'
        : 'This information is available to HR administrators only.',
      intentCode: null,
      dataSource: null,
      language:   lang,
    }
  }
  return null
}

// Employee-specific intents (own leave balance, own requests) need a linked
// person record. Service / system accounts (no person) get a graceful message
// instead of an empty or erroneous result — ARIA itself is NOT blocked.
function requirePerson(ctx: AriaSessionContext, lang: 'en' | 'ar'): AriaResponse | null {
  if (!ctx.personId) {
    // Admin / executive accounts have no personal employee profile, so personal
    // self-service queries don't apply — but they CAN ask organisation-wide
    // questions. Guide them there instead of dead-ending.
    const isPrivileged = MANAGER_ROLES.includes(ctx.role)
    const quickReplies = isPrivileged
      ? (lang === 'ar' ? ['الموافقات المعلقة', 'عدد الموظفين', 'حالة الامتثال'] : ['Show pending approvals', 'Total headcount', 'Compliance status'])
      : undefined
    return {
      message: isPrivileged
        ? (lang === 'ar'
            ? 'حسابك الإداري غير مرتبط بسجل موظف شخصي، لذا لا تنطبق استعلامات الإجازات الشخصية. للحصول على رؤية على مستوى المؤسسة، اسأل مثلاً: «الموافقات المعلقة».'
            : 'Your admin account isn\'t linked to a personal employee profile, so personal leave queries don\'t apply. For organisation-wide visibility, try "Show pending approvals", "Total headcount", or "Compliance status".')
        : (lang === 'ar'
            ? 'هذا الإجراء يتطلب سياق موظف. حسابك غير مرتبط بسجل موظف.'
            : 'Employee context required for this action.'),
      intentCode: null,
      dataSource: null,
      language:   lang,
      quickReplies,
    }
  }
  return null
}

// ── 1. Intent classification ───────────────────────────────────────────────

/**
 * Classifies the user's latest message into a structured AriaIntentResult.
 * Uses claude-sonnet-4-6 with the intent-classifier system prompt.
 * Returns intent=null when no HR intent is detected (ARIA answers freely).
 */
export async function classifyIntent(
  userMessage: string,
  history: AriaChatMessage[],
): Promise<AriaIntentResult> {
  const { adapter, modelId } = await getAriaLlm()

  const trimmed = history.slice(-6)
  // Inject today's date so the classifier can resolve relative dates ("tomorrow", "next week")
  const today = new Date().toISOString().slice(0, 10)
  const messages: LlmMessage[] = [
    ...trimmed.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: `[today is ${today}]\n${userMessage}` },
  ]

  try {
    const response = await adapter.generate({
      model:      modelId,
      maxTokens:  256,
      system:     ARIA_INTENT_CLASSIFIER_PROMPT,
      messages,
      jsonMode:   true,
    })

    const raw = response.text

    try {
      const parsed = JSON.parse(raw) as AriaIntentResult
      return parsed
    } catch {
      return { intent: null, language: 'en', confidence: 0, entities: {} }
    }
  } catch (err) {
    // Provider failure (network, 4xx/5xx, model unavailable). Do not crash ARIA —
    // fall back to a deterministic keyword classifier so the most common
    // self-service queries still work without the AI round-trip.
    console.error('[ARIA] classifyIntent provider error — using deterministic fallback:',
      err instanceof Error ? err.message : err)
    return classifyIntentDeterministic(userMessage)
  }
}

/**
 * Deterministic keyword-based intent fallback used when the AI classifier is
 * unavailable. Covers the high-value employee self-service queries only;
 * everything else returns intent=null (handled gracefully downstream).
 */
function classifyIntentDeterministic(userMessage: string): AriaIntentResult {
  const text = userMessage.toLowerCase()
  const language: 'en' | 'ar' = /[؀-ۿ]/.test(userMessage) ? 'ar' : 'en'
  const has = (...words: string[]) => words.some(w => text.includes(w))

  // "Who is my manager?" / org-chart self-service
  if (has('manager', 'line manager', 'report to', 'reporting', 'مدير', 'مديري', 'رئيس')) {
    return { intent: 'ORG_CHART_QUERY', language, confidence: 0.5, entities: {} }
  }
  // Leave balance
  if (has('balance', 'how many days', 'leave left', 'remaining leave', 'رصيد')) {
    return { intent: 'LEAVE_BALANCE_QUERY', language, confidence: 0.5, entities: {} }
  }
  // Leave request status
  if (has('status', 'pending with', 'approved', 'my request', 'حالة الطلب', 'طلبي')) {
    return { intent: 'LEAVE_REQUEST_STATUS', language, confidence: 0.5, entities: {} }
  }
  return { intent: null, language, confidence: 0, entities: {} }
}

// ── 2. Intent handlers ─────────────────────────────────────────────────────

/**
 * INTENT 1 — LEAVE_BALANCE_QUERY
 * Queries live leave balances for the current person.
 * Joins absenceBalances → absenceTypes to get the type code for filtering.
 * BR-AL-001: annual leave accrues from hire date (Article 29 FDL 33/2021).
 */
async function handleLeaveBalanceQuery(
  ctx: AriaSessionContext,
  entities: AriaIntentEntities,
): Promise<{ data: string; dataSource: string; isError?: boolean }> {
  const { db } = await import('@/lib/db')
  const { eq, and } = await import('drizzle-orm')
  const { TENANT_ID } = await import('@/lib/constants')
  const { absenceBalances, absenceTypes } = await import('@/drizzle/schema')

  const year = new Date().getFullYear()
  // Use employment entity (worker assignment) not session auth entity
  const employmentEntityId = await resolveEmploymentEntityId(ctx)

  const rows = await db
    .select({
      typeCode:     absenceTypes.typeCode,
      typeNameEn:   absenceTypes.typeNameEn,
      typeNameAr:   absenceTypes.typeNameAr,
      openingDays:  absenceBalances.openingBalanceDays,
      accrued:      absenceBalances.accruedDays,
      taken:        absenceBalances.takenDays,
      pending:      absenceBalances.pendingDays,
      adjusted:     absenceBalances.adjustedDays,
      carried:      absenceBalances.carriedForwardDays,
      forfeited:    absenceBalances.forfeitedDays,
      closing:      absenceBalances.closingBalanceDays,
    })
    .from(absenceBalances)
    .innerJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
    .where(
      and(
        eq(absenceBalances.tenantId, TENANT_ID),
        eq(absenceBalances.personId, ctx.personId),
        eq(absenceBalances.legalEntityId, employmentEntityId),
        eq(absenceBalances.balanceYear, year),
      ),
    )

  const typeFilter = entities.leave_type
  const filtered = typeFilter && typeFilter !== 'ALL'
    ? rows.filter(r => r.typeCode === typeFilter)
    : rows

  if (filtered.length === 0) {
    // Balances are initialised by the accrual engine at year-start or when
    // the employee joins; if missing they haven't been set up yet.
    return {
      data: ctx.language === 'ar'
        ? `لا توجد أرصدة إجازة مسجّلة لعام ${year}. قد تكون أرصدتك لم تُعدَّ بعد — تواصل مع الموارد البشرية لتهيئة الرصيد.`
        : `Your leave balances for ${year} have not been set up yet. Please contact HR to initialise your balances for this year.`,
      dataSource: 'absence_balances',
      isError: true,
    }
  }

  const lines = filtered.map(r => {
    // closing_balance_days is pre-computed by the accrual engine; fall back
    // to manual calculation if the column hasn't been updated yet this cycle
    const available = r.closing != null
      ? Number(r.closing)
      : Number(r.openingDays ?? 0)
        + Number(r.accrued ?? 0)
        + Number(r.carried ?? 0)
        + Number(r.adjusted ?? 0)
        - Number(r.taken ?? 0)
        - Number(r.pending ?? 0)
        - Number(r.forfeited ?? 0)
    return [
      `type: ${r.typeCode} (${r.typeNameEn} · ${r.typeNameAr ?? r.typeNameEn})`,
      `  available: ${available} days`,
      `  accrued: ${r.accrued ?? 0} | taken: ${r.taken ?? 0} | pending: ${r.pending ?? 0}`,
    ].join('\n')
  })

  return {
    data: `Leave balances for year ${year}:\n${lines.join('\n')}`,
    dataSource: 'absence_balances',
  }
}

/**
 * INTENT 2 — ORG_CHART_QUERY
 * Returns direct manager name + department for the requesting employee.
 * Queries the DB directly (no getPerson call) to avoid the role/entity-scope
 * checks inside getPerson that can throw FORBIDDEN for self-reads when the
 * session personId is not yet bound to the JWT token.
 */
async function handleOrgChartQuery(
  ctx: AriaSessionContext,
): Promise<{ data: string; dataSource: string; isError?: boolean; deterministic?: boolean }> {
  const { db } = await import('@/lib/db')
  const { eq, and } = await import('drizzle-orm')
  const { TENANT_ID } = await import('@/lib/constants')
  const { workerAssignments, departments, persons } = await import('@/drizzle/schema')

  // User account not linked to an employee profile (no person record).
  if (!ctx.personId) {
    return {
      data: ctx.language === 'ar'
        ? 'حسابك غير مرتبط بسجل موظف. يرجى التواصل مع إدارة الموارد البشرية.'
        : 'Your user account is not linked to an employee profile. Please contact HR Admin.',
      dataSource: 'persons',
      isError: true,
    }
  }

  // Fetch person name + employment basics in one query
  const [personRow] = await db
    .select({
      firstNameEn:    persons.firstNameEn,
      lastNameEn:     persons.lastNameEn,
      fullNameAr:     persons.fullNameAr,
      personNumber:   persons.personNumber,
      hireDate:       persons.hireDate,
      employmentType: persons.employmentType,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, ctx.personId)))
    .limit(1)

  if (!personRow) {
    return {
      data: ctx.language === 'ar'
        ? 'حسابك غير مرتبط بسجل موظف. يرجى التواصل مع إدارة الموارد البشرية.'
        : 'Your user account is not linked to an employee profile. Please contact HR Admin.',
      dataSource: 'persons',
      isError: true,
    }
  }

  const [asgn] = await db
    .select({
      deptNameEn:    departments.nameEn,
      deptNameAr:    departments.nameAr,
      lineManagerId: workerAssignments.lineManagerId,
    })
    .from(workerAssignments)
    .leftJoin(departments, eq(workerAssignments.departmentId, departments.id))
    .where(
      and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, ctx.personId),
        eq(workerAssignments.isCurrent, true),
      ),
    )
    .limit(1)

  if (!asgn) {
    return {
      data: ctx.language === 'ar'
        ? 'لا توجد مهمة عمل نشطة مرتبطة بحسابك. يرجى التواصل مع الموارد البشرية.'
        : 'No active work assignment is linked to your account. Please contact HR.',
      dataSource: 'worker_assignments',
      isError: true,
    }
  }

  let mgr: { firstNameEn: string | null; lastNameEn: string | null; fullNameAr: string | null } | undefined

  if (asgn.lineManagerId) {
    [mgr] = await db
      .select({
        firstNameEn: persons.firstNameEn,
        lastNameEn:  persons.lastNameEn,
        fullNameAr:  persons.fullNameAr,
      })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, asgn.lineManagerId)))
      .limit(1)
  }

  // No manager linked on the current assignment (or the linked person is gone).
  if (!asgn.lineManagerId || !mgr) {
    return {
      data: ctx.language === 'ar'
        ? 'لم أتمكّن من العثور على مدير مُسنَد إلى سجلك الوظيفي. يرجى التواصل مع إدارة الموارد البشرية.'
        : 'I could not find a manager assigned to your employee profile. Please contact HR Admin.',
      dataSource: 'worker_assignments',
      isError: true,
    }
  }

  const managerNameEn = `${mgr.firstNameEn ?? ''} ${mgr.lastNameEn ?? ''}`.trim()
  const managerNameAr = mgr.fullNameAr || managerNameEn
  const deptEn = asgn.deptNameEn ?? null
  const deptAr = asgn.deptNameAr ?? null

  // Deterministic, AI-free response card — reliable even if the AI provider is down.
  const message = ctx.language === 'ar'
    ? [
        `مديرك المباشر: ${managerNameAr}`,
        deptAr ? `القسم: ${deptAr}` : null,
      ].filter(Boolean).join('\n')
    : [
        `Your line manager: ${managerNameEn}`,
        deptEn ? `Department: ${deptEn}` : null,
      ].filter(Boolean).join('\n')

  return {
    data: message,
    dataSource: 'worker_assignments',
    deterministic: true,
  }
}

/**
 * INTENT 3 — DEPARTMENT_QUERY
 * Returns active department count and names from the departments table.
 */
async function handleDepartmentQuery(
  ctx: AriaSessionContext,
): Promise<{ data: string; dataSource: string }> {
  const { db }          = await import('@/lib/db')
  const { eq, and }     = await import('drizzle-orm')
  const { TENANT_ID }   = await import('@/lib/constants')
  const { departments, legalEntities } = await import('@/drizzle/schema')

  const rows = await db
    .select({
      nameEn:       departments.nameEn,
      nameAr:       departments.nameAr,
      entityNameEn: legalEntities.nameEn,
    })
    .from(departments)
    .leftJoin(legalEntities, eq(departments.legalEntityId, legalEntities.id))
    .where(and(
      eq(departments.tenantId, TENANT_ID),
      eq(departments.isActive, true),
    ))
    .orderBy(legalEntities.nameEn, departments.nameEn)

  if (rows.length === 0) {
    return { data: 'No active departments found.', dataSource: 'departments' }
  }

  // Group by entity so the output clearly shows which entity each dept belongs to
  const byEntity = new Map<string, string[]>()
  for (const r of rows) {
    const entity = r.entityNameEn ?? 'Unknown Entity'
    if (!byEntity.has(entity)) byEntity.set(entity, [])
    byEntity.get(entity)!.push(`${r.nameEn}${r.nameAr ? ` (${r.nameAr})` : ''}`)
  }

  const sections: string[] = []
  for (const [entity, depts] of byEntity) {
    sections.push(`Entity: ${entity}\n` + depts.map((d, i) => `  ${i + 1}. ${d}`).join('\n'))
  }

  return {
    data: `Active departments: ${rows.length}\n\n${sections.join('\n\n')}`,
    dataSource: 'departments',
  }
}

/**
 * INTENT 4 — HEADCOUNT_QUERY
 * Returns active headcount, on-leave-today, and new hires this month.
 */
async function handleHeadcountQuery(
  ctx: AriaSessionContext,
  entities: AriaIntentEntities,
): Promise<{ data: string; dataSource: string }> {
  const { getPeopleIntelligence } = await import('@/modules/aria')

  const intel = await getPeopleIntelligence()
  const scope = entities.scope ?? 'total'

  if (scope === 'on_leave') {
    return {
      data: `Scope: all entities (company-wide)\nEmployees on leave today: ${intel.onLeaveToday}`,
      dataSource: 'absence_entries',
    }
  }
  if (scope === 'new_hires') {
    return {
      data: `Scope: all entities (company-wide)\nNew hires this month: ${intel.newThisMonth}`,
      dataSource: 'persons',
    }
  }
  if (scope === 'by_department') {
    const lines = intel.byDepartment.map(d => `${d.deptName}: ${d.count}`).join('\n')
    return {
      data: `Scope: all entities (company-wide)\nHeadcount by department:\n\n${lines}`,
      dataSource: 'persons + departments',
    }
  }

  return {
    data: [
      `Scope: all entities (company-wide)`,
      `Total active employees: ${intel.totalActive}`,
      `On leave today: ${intel.onLeaveToday}`,
      `New hires this month: ${intel.newThisMonth}`,
    ].join('\n'),
    dataSource: 'persons',
  }
}

/**
 * INTENT 5 — COMPLIANCE_QUERY
 * Returns live compliance score + flagged areas from getComplianceData.
 */
async function handleComplianceQuery(): Promise<{ data: string; dataSource: string }> {
  const { getComplianceData } = await import('@/modules/aria/os-actions')

  const d = await getComplianceData()

  const flags: string[] = []
  if (d.expiredDocs > 0)       flags.push(`${d.expiredDocs} expired document${d.expiredDocs !== 1 ? 's' : ''}`)
  if (d.expiringDocs30 > 0)    flags.push(`${d.expiringDocs30} document${d.expiringDocs30 !== 1 ? 's' : ''} expiring within 30 days`)
  if (d.expiredContracts > 0)  flags.push(`${d.expiredContracts} expired contract${d.expiredContracts !== 1 ? 's' : ''}`)
  if (d.expiringContracts30 > 0) flags.push(`${d.expiringContracts30} contract${d.expiringContracts30 !== 1 ? 's' : ''} expiring within 30 days`)
  if (d.slaBreachedCount > 0)  flags.push(`${d.slaBreachedCount} SLA breach${d.slaBreachedCount !== 1 ? 'es' : ''}`)
  if (d.emiratisationPct != null && d.emiratisationPct < 4)
    flags.push(`Emiratisation at ${d.emiratisationPct.toFixed(1)}% (target: 4%)`)

  const status = flags.length === 0 ? 'All areas compliant' : `${flags.length} area${flags.length !== 1 ? 's' : ''} require action`

  return {
    data: [
      `Compliance score: ${d.score}/100`,
      `Status: ${status}`,
      flags.length > 0 ? `Issues:\n${flags.map(f => `- ${f}`).join('\n')}` : '',
      `Pending approvals: ${d.pendingApprovals}`,
      `Emiratisation: ${d.emiratisationPct != null ? d.emiratisationPct.toFixed(1) + '%' : 'N/A'} (target 4%)`,
    ].filter(Boolean).join('\n'),
    dataSource: 'compliance',
  }
}

/**
 * INTENT 6 — WORKFLOW_QUERY
 * Returns pending workflow count + SLA breach summary.
 */
async function handleWorkflowQuery(): Promise<{ data: string; dataSource: string }> {
  const { getWorkflowSummary } = await import('@/modules/aria/workflow-queries')

  const s = await getWorkflowSummary()

  const lines = [
    `Pending: ${s.pending}`,
    `Approved today: ${s.approvedToday}`,
    `Rejected today: ${s.rejectedToday}`,
    `SLA breached: ${s.slaBreached}`,
  ]

  if (s.rows.length > 0) {
    const pending = s.rows.filter(r => r.status === 'PENDING' || r.status === 'IN_PROGRESS').slice(0, 5)
    if (pending.length > 0) {
      lines.push(`\nNext pending items:`)
      pending.forEach(r => lines.push(`- ${r.initiatorName}: ${r.triggerEvent} (${r.daysOpen}d open${r.isBreached ? ', SLA BREACHED' : ''})`))
    }
  }

  return {
    data: lines.join('\n'),
    dataSource: 'workflow_instances',
  }
}

/**
 * INTENT — TEAM_QUERY
 * Returns direct-reports roster + on-leave status for today.
 * Only available to MANAGER and ADMIN roles.
 */
async function handleTeamQuery(
  ctx: AriaSessionContext,
): Promise<{ data: string; dataSource: string }> {
  const { db }        = await import('@/lib/db')
  const { eq, and, lte, gte, inArray } = await import('drizzle-orm')
  const { TENANT_ID } = await import('@/lib/constants')
  const { persons, departments, absenceEntries } = await import('@/drizzle/schema')

  const today = new Date().toISOString().slice(0, 10)

  const reports = await db
    .select({
      id:          persons.id,
      firstNameEn: persons.firstNameEn,
      lastNameEn:  persons.lastNameEn,
      deptNameEn:  departments.nameEn,
    })
    .from(persons)
    .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.lineManagerId, ctx.personId),
      eq(persons.isActive, true),
    ))

  if (reports.length === 0) {
    return {
      data: ctx.language === 'ar'
        ? 'لا يوجد موظفون مباشرون مسجّلون تحت إشرافك.'
        : 'No direct reports found under your management.',
      dataSource: 'persons',
    }
  }

  const reportIds = reports.map(r => r.id)
  const onLeaveRows = await db
    .select({ personId: absenceEntries.personId })
    .from(absenceEntries)
    .where(and(
      inArray(absenceEntries.personId, reportIds),
      lte(absenceEntries.startDate, today),
      gte(absenceEntries.endDate, today),
      eq(absenceEntries.status, 'APPROVED'),
    ))
  const onLeaveSet = new Set(onLeaveRows.map(r => r.personId))

  const lines = reports.map(r => {
    const name   = `${r.firstNameEn ?? ''} ${r.lastNameEn ?? ''}`.trim()
    const dept   = r.deptNameEn ?? '—'
    const status = onLeaveSet.has(r.id) ? 'On Leave' : 'Present'
    return `${name} | ${dept} | ${status}`
  })

  return {
    data: `Team (${reports.length} direct reports) — ${today}:\n${lines.join('\n')}`,
    dataSource: 'persons + absence_entries',
  }
}

/**
 * INTENT 7 — POLICY_QUERY
 * Lists indexed knowledge sources available for the topic.
 * Actual document content retrieval (vector search) is not yet available;
 * Claude answers UAE Labour Law portions from training (public law).
 */
async function handlePolicyQuery(
  entities: AriaIntentEntities,
): Promise<{ data: string; dataSource: string }> {
  const { db }        = await import('@/lib/db')
  const { eq, and }   = await import('drizzle-orm')
  const { TENANT_ID } = await import('@/lib/constants')
  const { ariaKnowledgeSources } = await import('@/drizzle/schema')

  const sources = await db
    .select({
      name:         ariaKnowledgeSources.sourceName,
      sourceType:   ariaKnowledgeSources.sourceType,
      vectorStatus: ariaKnowledgeSources.vectorStatus,
      tags:         ariaKnowledgeSources.tags,
    })
    .from(ariaKnowledgeSources)
    .where(and(
      eq(ariaKnowledgeSources.tenantId, TENANT_ID),
      eq(ariaKnowledgeSources.isActive, true),
    ))

  const indexed = sources.filter(s => s.vectorStatus === 'indexed')
  const topic   = entities.topic ?? 'policy'

  if (indexed.length === 0) {
    return {
      data: `No policy documents have been uploaded and indexed yet.\nTopic requested: ${topic}\nNote: UAE Labour Law guidance is available without uploaded documents.`,
      dataSource: 'aria_knowledge_sources',
    }
  }

  const docList = indexed.map(s => `- ${s.name} [${s.sourceType.toUpperCase()}]`).join('\n')
  return {
    data: `Indexed policy documents (${indexed.length}):\n${docList}\n\nTopic requested: ${topic}\nNote: Answer using UAE Labour Law where relevant; cite uploaded documents by name if applicable.`,
    dataSource: 'aria_knowledge_sources',
  }
}

/**
 * INTENT 8 — LEAVE_REQUEST_STATUS
 * Returns the most recent leave request status with dates.
 * Uses listLeaveRequests from the absence barrel.
 */
async function handleLeaveRequestStatus(
  ctx: AriaSessionContext,
  entities: AriaIntentEntities,
): Promise<{ data: string; dataSource: string; isError?: boolean }> {
  const { listLeaveRequests } = await import('@/modules/absence')

  let targetPersonId = ctx.personId
  let subjectLabel = ctx.language === 'ar' ? 'طلبات إجازتك' : 'Your leave requests'

  // If the caller referenced another employee, resolve them first
  if (entities.target_person_id) {
    const { db } = await import('@/lib/db')
    const { eq, and, or, ilike } = await import('drizzle-orm')
    const { TENANT_ID } = await import('@/lib/constants')
    const { persons } = await import('@/drizzle/schema')

    const ref = entities.target_person_id.trim()

    // Try exact employee number first, then partial name match
    const [found] = await db
      .select({ id: persons.id, firstNameEn: persons.firstNameEn, lastNameEn: persons.lastNameEn })
      .from(persons)
      .where(
        and(
          eq(persons.tenantId, TENANT_ID),
          or(
            eq(persons.personNumber, ref.toUpperCase()),
            ilike(persons.firstNameEn, `%${ref}%`),
            ilike(persons.lastNameEn, `%${ref}%`),
          ),
        ),
      )
      .limit(1)

    if (!found) {
      return {
        data: ctx.language === 'ar'
          ? `لم يتم العثور على الموظف "${ref}". تحقق من رقم الموظف أو الاسم وحاول مجدداً.`
          : `No employee found matching "${ref}". Check the employee number or name and try again.`,
        dataSource: 'persons',
        isError: true,
      }
    }

    // P3-A2 — SECURITY: viewing ANOTHER employee's leave is gated by relationship.
    // ctx is server-derived (see sendAriaMessage P3-A1 fix), so this is authoritative.
    // HR roles → any; a line manager → their recursive reports; everyone else →
    // only themselves. Without this, any employee could read a colleague's leave.
    if (found.id !== ctx.personId) {
      const { assertSelfOrTeam } = await import('@/lib/access')
      try {
        await assertSelfOrTeam({ role: ctx.role, personId: ctx.personId }, found.id)
      } catch {
        return {
          data: ctx.language === 'ar'
            ? 'ليست لديك صلاحية الاطلاع على طلبات إجازة هذا الموظف.'
            : 'You are not authorised to view this employee\'s leave requests.',
          dataSource: 'persons',
          isError: true,
        }
      }
    }

    targetPersonId = found.id
    subjectLabel = ctx.language === 'ar'
      ? `طلبات إجازة ${found.firstNameEn} ${found.lastNameEn}`
      : `Leave requests for ${found.firstNameEn} ${found.lastNameEn}`
  }

  const result = await listLeaveRequests({
    personId: targetPersonId,
    page: 1,
    pageSize: 5,
  })

  if (result.rows.length === 0) {
    return {
      data: ctx.language === 'ar'
        ? `لا توجد طلبات إجازة مسجّلة بعد. (${subjectLabel})`
        : `No leave requests on record yet. (${subjectLabel})`,
      dataSource: 'absence_entries',
      isError: true,
    }
  }

  // Resolve pending approvers for any PENDING rows that have a workflow instance.
  // Uses Promise.allSettled so a single resolver failure does not drop the whole response.
  const { resolvePendingApprover } = await import('@/modules/workflow')
  const pendingRows = result.rows.filter(r => r.status === 'PENDING' && r.workflowInstanceId)
  const approverMap = new Map<string, PendingApproverInfo>()
  if (pendingRows.length > 0) {
    const settled = await Promise.allSettled(
      pendingRows.map(r => resolvePendingApprover(r.workflowInstanceId!)),
    )
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled' && s.value) {
        approverMap.set(pendingRows[i].id, s.value)
      }
    })
  }

  const header = subjectLabel
  const lines = result.rows.slice(0, 5).map((r, i) => {
    const label = i === 0 ? '(most recent)' : `(previous ${i})`
    const submitted = r.createdDate instanceof Date
      ? r.createdDate.toISOString().slice(0, 10)
      : String(r.createdDate).slice(0, 10)
    let line = `${label} type=${r.absenceTypeCode ?? 'N/A'} status=${r.status} from=${r.startDate} to=${r.endDate} days=${r.durationDays} submitted=${submitted}`
    const approver = approverMap.get(r.id)
    if (approver) {
      line += ` | pending_step="${approver.stepName}" | pending_approver="${approver.approverLabel}"`
    }
    return line
  })

  return {
    data: `${header}\n${lines.join('\n')}`,
    dataSource: 'absence_entries',
  }
}

/**
 * INTENT 4 — LEAVE_REQUEST_DRAFT (step 1: build summary card, no DB write)
 * Queries absence type + current balance and returns a draft for confirmation.
 * Hard Rule 7: NO DB write at this step.
 */
export async function buildLeaveDraft(
  ctx: AriaSessionContext,
  entities: AriaIntentEntities,
): Promise<{ draft: AriaLeaveDraft | null; missingFields: string[] }> {
  const { db } = await import('@/lib/db')
  const { eq, and } = await import('drizzle-orm')
  const { TENANT_ID } = await import('@/lib/constants')
  const { absenceTypes, absenceBalances } = await import('@/drizzle/schema')

  const missingFields: string[] = []
  if (!entities.leave_type)  missingFields.push('leave_type')
  if (!entities.start_date)  missingFields.push('start_date')
  if (!entities.end_date && !entities.days) missingFields.push('end_date or number of days')
  if (missingFields.length > 0) return { draft: null, missingFields }

  const [absType] = await db
    .select({
      id:       absenceTypes.id,
      code:     absenceTypes.typeCode,
      nameEn:   absenceTypes.typeNameEn,
      nameAr:   absenceTypes.typeNameAr,
    })
    .from(absenceTypes)
    .where(
      and(
        eq(absenceTypes.tenantId, TENANT_ID),
        eq(absenceTypes.typeCode, entities.leave_type!),
        eq(absenceTypes.isActive, true),
      ),
    )
    .limit(1)

  if (!absType) return { draft: null, missingFields: ['leave_type (unrecognised)'] }

  const startDate  = entities.start_date!
  const endDate    = entities.end_date ?? isoDateAddDays(startDate, (entities.days ?? 1) - 1)
  const durationDays = entities.days ?? (isoDateDiff(startDate, endDate) + 1)

  const year = new Date().getFullYear()
  // Use employment entity (worker assignment) to match how balances are stored
  const employmentEntityId = await resolveEmploymentEntityId(ctx)
  const [bal] = await db
    .select({
      openingDays: absenceBalances.openingBalanceDays,
      accrued:     absenceBalances.accruedDays,
      taken:       absenceBalances.takenDays,
      pending:     absenceBalances.pendingDays,
      adjusted:    absenceBalances.adjustedDays,
      carried:     absenceBalances.carriedForwardDays,
      forfeited:   absenceBalances.forfeitedDays,
      closing:     absenceBalances.closingBalanceDays,
    })
    .from(absenceBalances)
    .where(
      and(
        eq(absenceBalances.tenantId, TENANT_ID),
        eq(absenceBalances.personId, ctx.personId),
        eq(absenceBalances.legalEntityId, employmentEntityId),
        eq(absenceBalances.absenceTypeId, absType.id),
        eq(absenceBalances.balanceYear, year),
      ),
    )
    .limit(1)

  const balanceSeeded = !!bal
  const currentBalance = bal
    ? bal.closing != null
      ? Number(bal.closing)
      : Number(bal.openingDays ?? 0) + Number(bal.accrued ?? 0)
        + Number(bal.carried ?? 0) + Number(bal.adjusted ?? 0)
        - Number(bal.taken ?? 0) - Number(bal.pending ?? 0) - Number(bal.forfeited ?? 0)
    : 0

  return {
    draft: {
      absenceTypeId:       absType.id,
      absenceTypeCode:     absType.code,
      absenceTypeNameEn:   absType.nameEn,
      absenceTypeNameAr:   absType.nameAr ?? absType.nameEn,
      startDate,
      endDate,
      durationDays,
      currentBalanceDays:  currentBalance,
      balanceAfterDays:    currentBalance - durationDays,
      legalEntityId:       employmentEntityId,
      balanceSeeded,
    },
    missingFields: [],
  }
}

// ── Transfer draft builder (Phase 4, read-only) ─────────────────────────────
// Resolves the target employee + target department from natural-language
// entities. NO write — only assembles a confirmable snapshot. Ambiguous or
// missing inputs return a friendly clarification message instead of a draft.
export async function buildTransferDraft(
  entities: AriaIntentEntities,
): Promise<{ draft: AriaTransferDraft | null; missingFields: string[]; message?: string }> {
  const { db }            = await import('@/lib/db')
  const { eq, and, ilike, or } = await import('drizzle-orm')
  const { TENANT_ID }     = await import('@/lib/constants')
  const { persons, departments } = await import('@/drizzle/schema')

  const who  = entities.target_person_id?.trim()
  const dept = entities.target_department?.trim()
  const eff  = entities.effective_date?.trim()

  const missing: string[] = []
  if (!who)  missing.push('employee (name or number)')
  if (!dept) missing.push('target department')
  if (!eff)  missing.push('effective date (YYYY-MM-DD)')
  if (missing.length) return { draft: null, missingFields: missing }

  // Resolve the employee by exact person number or fuzzy name.
  const pRows = await db
    .select({ id: persons.id, personNumber: persons.personNumber, fullNameEn: persons.fullNameEn })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      or(eq(persons.personNumber, who!), ilike(persons.fullNameEn, `%${who}%`)),
    ))
    .limit(6)
  if (pRows.length === 0) return { draft: null, missingFields: [], message: `I couldn't find an employee matching "${who}". Please use their employee number.` }
  if (pRows.length > 1)  return { draft: null, missingFields: [], message: `Several employees match "${who}" (${pRows.map(p => p.personNumber).join(', ')}). Please use the exact employee number.` }
  const person = pRows[0]

  // Resolve the target department by fuzzy English name.
  const dRows = await db
    .select({ id: departments.id, nameEn: departments.nameEn })
    .from(departments)
    .where(and(
      eq(departments.tenantId, TENANT_ID),
      eq(departments.isActive, true),
      ilike(departments.nameEn, `%${dept}%`),
    ))
    .limit(6)
  if (dRows.length === 0) return { draft: null, missingFields: [], message: `I couldn't find an active department matching "${dept}".` }
  if (dRows.length > 1)  return { draft: null, missingFields: [], message: `Several departments match "${dept}" (${dRows.map(d => d.nameEn).join(', ')}). Please be more specific.` }
  const department = dRows[0]

  const validReasons = ['CAREER_GROWTH', 'ORG_NEED', 'PERFORMANCE', 'PERSONAL', 'OTHER']
  const reason = entities.transfer_reason && validReasons.includes(entities.transfer_reason)
    ? entities.transfer_reason
    : 'ORG_NEED'

  return {
    draft: {
      requestType:          'TRANSFER',
      personId:             person.id,
      personName:           person.fullNameEn ?? person.personNumber,
      targetDepartmentId:   department.id,
      targetDepartmentName: department.nameEn,
      effectiveDate:        eff!,
      reason,
    },
    missingFields: [],
  }
}

// ── Promotion draft builder (Phase 4, read-only) ────────────────────────────
// Resolves the target employee + target grade (by code, name, or level). NO
// write. A promotion changes the employee's grade via the same governed flow.
export async function buildPromotionDraft(
  entities: AriaIntentEntities,
): Promise<{ draft: AriaTransferDraft | null; missingFields: string[]; message?: string }> {
  const { db }            = await import('@/lib/db')
  const { eq, and, ilike, or } = await import('drizzle-orm')
  const { TENANT_ID }     = await import('@/lib/constants')
  const { persons, grades } = await import('@/drizzle/schema')

  const who   = entities.target_person_id?.trim()
  const grade = entities.target_grade?.trim()
  const eff   = entities.effective_date?.trim()

  const missing: string[] = []
  if (!who)   missing.push('employee (name or number)')
  if (!grade) missing.push('target grade')
  if (!eff)   missing.push('effective date (YYYY-MM-DD)')
  if (missing.length) return { draft: null, missingFields: missing }

  const pRows = await db
    .select({ id: persons.id, personNumber: persons.personNumber, fullNameEn: persons.fullNameEn })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      or(eq(persons.personNumber, who!), ilike(persons.fullNameEn, `%${who}%`)),
    ))
    .limit(6)
  if (pRows.length === 0) return { draft: null, missingFields: [], message: `I couldn't find an employee matching "${who}". Please use their employee number.` }
  if (pRows.length > 1)  return { draft: null, missingFields: [], message: `Several employees match "${who}" (${pRows.map(p => p.personNumber).join(', ')}). Please use the exact employee number.` }
  const person = pRows[0]

  // Resolve grade by exact code, then by level (if numeric), then fuzzy name.
  const isLevel = /^\d+$/.test(grade!)
  const gRows = await db
    .select({ id: grades.id, gradeCode: grades.gradeCode, nameEn: grades.gradeNameEn, level: grades.gradeLevel })
    .from(grades)
    .where(and(
      eq(grades.tenantId, TENANT_ID),
      isLevel
        ? eq(grades.gradeLevel, Number(grade))
        : or(eq(grades.gradeCode, grade!), ilike(grades.gradeNameEn, `%${grade}%`)),
    ))
    .limit(6)
  if (gRows.length === 0) return { draft: null, missingFields: [], message: `I couldn't find a grade matching "${grade}".` }
  if (gRows.length > 1)  return { draft: null, missingFields: [], message: `Several grades match "${grade}" (${gRows.map(g => g.gradeCode).join(', ')}). Please use the exact grade code.` }
  const g = gRows[0]

  const validReasons = ['CAREER_GROWTH', 'ORG_NEED', 'PERFORMANCE', 'PERSONAL', 'OTHER']
  const reason = entities.transfer_reason && validReasons.includes(entities.transfer_reason)
    ? entities.transfer_reason
    : 'CAREER_GROWTH'

  return {
    draft: {
      requestType:     'PROMOTION',
      personId:        person.id,
      personName:      person.fullNameEn ?? person.personNumber,
      targetGradeId:   g.id,
      targetGradeName: g.nameEn,
      effectiveDate:   eff!,
      reason,
    },
    missingFields: [],
  }
}

// ── 3. Main dispatch ───────────────────────────────────────────────────────

/**
 * Dispatches the classified intent to the correct handler and calls Claude
 * to format the final natural-language response in the user's language.
 */
export async function handleIntent(
  intentResult:         AriaIntentResult,
  userMessage:          string,
  history:              AriaChatMessage[],
  ctx:                  AriaSessionContext,
  pendingDraft:         AriaLeaveDraft | null,
  pendingTransferDraft: AriaTransferDraft | null = null,
): Promise<AriaResponse> {
  const { intent, language, entities } = intentResult
  const lang = language ?? ctx.language

  // ── Person-context guard for employee-specific (self-service) intents ──
  // These act on the caller's own record; a service account has no person.
  const PERSON_INTENTS = [
    'LEAVE_BALANCE_QUERY', 'LEAVE_REQUEST_STATUS', 'LEAVE_REQUEST_DRAFT',
    'LEAVE_REQUEST_CONFIRM',
  ]
  if (intent && PERSON_INTENTS.includes(intent)) {
    const personGate = requirePerson(ctx, lang)
    if (personGate) return personGate
  }

  // ── Executive summary (Phase 5) — composes several governed read capabilities
  //    into one org briefing. Admin/exec roles only; deterministic (no LLM).
  if (intent === 'EXECUTIVE_SUMMARY') {
    const gate = requireRole(ctx, ADMIN_ROLES, lang)
    if (gate) return gate

    const safe = async (fn: () => Promise<{ data: string }>) => {
      try { return (await fn()).data } catch { return lang === 'ar' ? '(غير متاح)' : '(unavailable)' }
    }
    const [approvals, headcount, onLeave, compliance] = await Promise.all([
      safe(() => handleWorkflowQuery()),
      safe(() => handleHeadcountQuery(ctx, { scope: 'total' })),
      safe(() => handleHeadcountQuery(ctx, { scope: 'on_leave' })),
      safe(() => handleComplianceQuery()),
    ])

    const h = lang === 'ar'
      ? { title: 'ملخص تنفيذي', appr: 'الموافقات المعلقة', wf: 'القوى العاملة', leave: 'في إجازة اليوم', comp: 'الامتثال' }
      : { title: 'Executive summary', appr: 'Pending approvals', wf: 'Workforce', leave: 'On leave today', comp: 'Compliance' }
    const message = [
      h.title,
      ``,
      `■ ${h.appr}\n${approvals}`,
      `■ ${h.wf}\n${headcount}`,
      `■ ${h.leave}\n${onLeave}`,
      `■ ${h.comp}\n${compliance}`,
    ].join('\n\n')

    return {
      message,
      intentCode:  'EXECUTIVE_SUMMARY',
      dataSource:  'composite',
      language:    lang,
      quickReplies: lang === 'ar'
        ? ['الموافقات المتأخرة', 'حالة الامتثال']
        : ['Overdue approvals', 'Compliance status'],
    }
  }

  // ── Privileged-role guard for transfer/promotion intents ──────────────
  // These act on ANOTHER employee — Manager (own reports) / HR+ only.
  const TRANSFER_INTENTS = ['TRANSFER_REQUEST_DRAFT', 'TRANSFER_REQUEST_CONFIRM', 'PROMOTION_REQUEST_DRAFT']
  if (intent && TRANSFER_INTENTS.includes(intent)) {
    const roleGate = requireRole(ctx, MANAGER_ROLES, lang)
    if (roleGate) return roleGate
  }

  // ── Transfer confirm / cancel / draft (Phase 4) ──────────────────────
  if (intent === 'TRANSFER_REQUEST_CONFIRM' && pendingTransferDraft) {
    return {
      message: lang === 'ar'
        ? 'تمام! جارٍ تقديم طلب النقل للموافقة الآن.'
        : 'Confirmed. Submitting the transfer request for approval now.',
      intentCode:           'TRANSFER_REQUEST_CONFIRM',
      dataSource:           null,
      language:             lang,
      pendingTransferDraft,
    }
  }

  if (intent === 'TRANSFER_REQUEST_CANCEL') {
    return {
      message: lang === 'ar'
        ? 'تم إلغاء طلب النقل. هل أساعدك بشيء آخر؟'
        : 'Transfer request cancelled. Anything else?',
      intentCode: 'TRANSFER_REQUEST_CANCEL',
      dataSource: null,
      language:   lang,
    }
  }

  if (intent === 'TRANSFER_REQUEST_DRAFT') {
    const { draft, missingFields, message } = await buildTransferDraft(entities)
    if (message) {
      return { message, intentCode: 'TRANSFER_REQUEST_DRAFT', dataSource: null, language: lang }
    }
    if (missingFields.length > 0) {
      return {
        message: lang === 'ar'
          ? `لإعداد طلب النقل أحتاج إلى: ${missingFields.join('، ')}.`
          : `To prepare the transfer I still need: ${missingFields.join(', ')}.`,
        intentCode: 'TRANSFER_REQUEST_DRAFT', dataSource: null, language: lang,
      }
    }
    const d = draft!
    const summary = lang === 'ar'
      ? `طلب نقل\n\nالموظف: ${d.personName}\nإلى قسم: ${d.targetDepartmentName}\nتاريخ السريان: ${d.effectiveDate}\nالسبب: ${d.reason}\n\nتأكيد؟ اكتب نعم للتقديم للموافقة أو لا للإلغاء.`
      : `Transfer request\n\nEmployee:       ${d.personName}\nTo department:  ${d.targetDepartmentName}\nEffective:      ${d.effectiveDate}\nReason:         ${d.reason}\n\nConfirm? Reply Yes to submit for approval or No to cancel.`
    return {
      message:              summary,
      intentCode:           'TRANSFER_REQUEST_DRAFT',
      dataSource:           'transfer_requests',
      language:             lang,
      pendingTransferDraft: d,
      quickReplies:         lang === 'ar' ? ['نعم، تقديم', 'لا، إلغاء'] : ['Yes, submit', 'No, cancel'],
    }
  }

  if (intent === 'PROMOTION_REQUEST_DRAFT') {
    const { draft, missingFields, message } = await buildPromotionDraft(entities)
    if (message) {
      return { message, intentCode: 'PROMOTION_REQUEST_DRAFT', dataSource: null, language: lang }
    }
    if (missingFields.length > 0) {
      return {
        message: lang === 'ar'
          ? `لإعداد طلب الترقية أحتاج إلى: ${missingFields.join('، ')}.`
          : `To prepare the promotion I still need: ${missingFields.join(', ')}.`,
        intentCode: 'PROMOTION_REQUEST_DRAFT', dataSource: null, language: lang,
      }
    }
    const d = draft!
    const summary = lang === 'ar'
      ? `طلب ترقية\n\nالموظف: ${d.personName}\nإلى درجة: ${d.targetGradeName}\nتاريخ السريان: ${d.effectiveDate}\nالسبب: ${d.reason}\n\nتأكيد؟ اكتب نعم للتقديم للموافقة أو لا للإلغاء.`
      : `Promotion request\n\nEmployee:   ${d.personName}\nTo grade:   ${d.targetGradeName}\nEffective:  ${d.effectiveDate}\nReason:     ${d.reason}\n\nConfirm? Reply Yes to submit for approval or No to cancel.`
    return {
      message:              summary,
      intentCode:           'PROMOTION_REQUEST_DRAFT',
      dataSource:           'transfer_requests',
      language:             lang,
      pendingTransferDraft: d,
      quickReplies:         lang === 'ar' ? ['نعم، تقديم', 'لا، إلغاء'] : ['Yes, submit', 'No, cancel'],
    }
  }

  // ── Confirmation / cancellation of a pending leave draft ─────────────
  if (intent === 'LEAVE_REQUEST_CONFIRM' && pendingDraft) {
    return {
      message: lang === 'ar'
        ? 'تمام! جارٍ تقديم طلب إجازتك الآن.'
        : 'Confirmed. Submitting your leave request now.',
      intentCode:   'LEAVE_REQUEST_CONFIRM',
      dataSource:   null,
      language:     lang,
      pendingDraft,
    }
  }

  if (intent === 'LEAVE_REQUEST_CANCEL') {
    return {
      message: lang === 'ar'
        ? 'تم الإلغاء. هل يمكنني مساعدتك بشيء آخر؟'
        : 'Cancelled. Let me know if you need anything else.',
      intentCode:  'LEAVE_REQUEST_CANCEL',
      dataSource:  null,
      language:    lang,
      quickReplies: lang === 'ar'
        ? ['عرض رصيد الإجازة', 'طلب إجازة جديدة']
        : ['View my balances', 'Apply for leave'],
    }
  }

  // "Yes" with no pending draft — treat as willingness to apply for leave.
  if (intent === 'LEAVE_REQUEST_CONFIRM' && !pendingDraft) {
    return {
      message: lang === 'ar'
        ? 'بكل سرور! ما نوع الإجازة التي تريد طلبها، والتاريخ الذي تودّ البدء فيه؟'
        : 'Sure! Which type of leave would you like to apply for, and what dates?',
      intentCode:  null,
      dataSource:  null,
      language:    lang,
      quickReplies: lang === 'ar'
        ? ['إجازة سنوية', 'إجازة مرضية', 'إجازة طارئة']
        : ['Annual Leave', 'Sick Leave', 'Emergency Leave'],
    }
  }

  // ── Leave draft (collect info + show summary, no write) ───────────────
  if (intent === 'LEAVE_REQUEST_DRAFT') {
    const { draft, missingFields } = await buildLeaveDraft(ctx, entities)

    if (missingFields.length > 0) {
      const fieldHints: Record<string, string> = {
        'leave_type':             'the type of leave (e.g. Annual, Sick)',
        'start_date':             'the start date',
        'end_date or number of days': 'the end date or number of days',
      }
      const hints = missingFields.map(f => fieldHints[f] ?? f)
      const msg = lang === 'ar'
        ? `لإتمام الطلب، أحتاج إلى معرفة: ${missingFields.join('، ')}. يرجى إخباري بهذه التفاصيل.`
        : `To apply for leave I still need ${hints.join(' and ')}. Could you share those?`
      return { message: msg, intentCode: intent, dataSource: null, language: lang }
    }

    const d = draft!
    const today = fmtDate(new Date().toISOString().slice(0, 10))

    // When balanceSeeded=false the accrual engine hasn't initialised this year's
    // balance yet — show a notice rather than claiming the employee has 0 days.
    const balanceDisplay = d.balanceSeeded
      ? (lang === 'ar' ? `${d.currentBalanceDays} أيام` : `${d.currentBalanceDays} days`)
      : (lang === 'ar' ? 'غير محدّد (تواصل مع الموارد البشرية)' : 'Not set up — contact HR')
    const balanceAfterDisplay = d.balanceSeeded
      ? (lang === 'ar' ? `${d.balanceAfterDays} أيام` : `${d.balanceAfterDays} days`)
      : (lang === 'ar' ? 'غير محدّد' : 'Unknown')

    const balanceWarning = d.balanceSeeded && d.balanceAfterDays < 0
      ? (lang === 'ar' ? '\nتحذير: هذا يتجاوز رصيدك الحالي.' : '\nWarning: this exceeds your current balance.')
      : !d.balanceSeeded
        ? (lang === 'ar'
          ? '\nملاحظة: لم يتم إعداد رصيد إجازتك لهذا العام بعد. يمكنك إرسال الطلب والتحقق مع الموارد البشرية.'
          : '\nNote: Your leave balance for this year has not been initialised yet. You may still submit — HR will verify.')
        : ''

    const pad = (s: string, n: number) => s.padEnd(n)
    const summary = lang === 'ar'
      ? [
          `طلب إجازة — ${today}`,
          ``,
          `${pad('النوع', 14)}  ${d.absenceTypeNameAr}`,
          `${pad('من', 14)}  ${fmtDate(d.startDate)}`,
          `${pad('إلى', 14)}  ${fmtDate(d.endDate)}`,
          `${pad('المدة', 14)}  ${d.durationDays} ${d.durationDays === 1 ? 'يوم' : 'أيام'}`,
          `${pad('الرصيد الحالي', 14)}  ${balanceDisplay}`,
          `${pad('الرصيد بعد', 14)}  ${balanceAfterDisplay}${balanceWarning}`,
          ``,
          `تأكيد؟ اكتب نعم للمتابعة أو لا للإلغاء.`,
        ].join('\n')
      : [
          `Leave Request — ${today}`,
          ``,
          `${pad('Type', 14)}  ${d.absenceTypeNameEn}`,
          `${pad('From', 14)}  ${fmtDate(d.startDate)}`,
          `${pad('To', 14)}  ${fmtDate(d.endDate)}`,
          `${pad('Duration', 14)}  ${d.durationDays} ${d.durationDays === 1 ? 'day' : 'days'}`,
          `${pad('Current balance', 14)}  ${balanceDisplay}`,
          `${pad('Balance after', 14)}  ${balanceAfterDisplay}${balanceWarning}`,
          ``,
          `Confirm? Reply Yes to submit or No to cancel.`,
        ].join('\n')

    return {
      message:      summary,
      intentCode:   'LEAVE_REQUEST_DRAFT',
      dataSource:   'absence_balances',
      language:     lang,
      pendingDraft: d,
      quickReplies: lang === 'ar' ? ['نعم، تأكيد', 'لا، إلغاء'] : ['Yes, confirm', 'No, cancel'],
    }
  }

  // ── Query live data for recognised intents ────────────────────────────
  // isError=true means the handler found no data (not a thrown exception).
  // Return those messages directly — never pass them through Claude formatting
  // because Claude will rephrase them confusingly ("I don't have that data").
  let rawData: string | null = null
  let dataSource: string | null = null

  try {
    if (intent === 'LEAVE_BALANCE_QUERY') {
      const r = await handleLeaveBalanceQuery(ctx, entities)
      if (r.isError) return { message: r.data, intentCode: intent, dataSource: r.dataSource, language: lang }
      rawData = r.data; dataSource = r.dataSource
    } else if (intent === 'ORG_CHART_QUERY') {
      const r = await handleOrgChartQuery(ctx)
      // ORG_CHART is fully deterministic (manager lookup is the primary self-service
      // query) — return the message directly and never depend on AI formatting.
      if (r.isError || r.deterministic) {
        return {
          message: r.data,
          intentCode: intent,
          dataSource: r.dataSource,
          language: lang,
          quickReplies: r.isError ? undefined : (lang === 'ar'
            ? ['رصيد الإجازة', 'تقديم طلب إجازة']
            : ['View my balances', 'Apply for leave']),
        }
      }
      rawData = r.data; dataSource = r.dataSource
    } else if (intent === 'LEAVE_REQUEST_STATUS') {
      const r = await handleLeaveRequestStatus(ctx, entities)
      if (r.isError) return { message: r.data, intentCode: intent, dataSource: r.dataSource, language: lang }
      rawData = r.data; dataSource = r.dataSource
    } else if (intent === 'DEPARTMENT_QUERY') {
      const r = await handleDepartmentQuery(ctx)
      rawData = r.data; dataSource = r.dataSource
    } else if (intent === 'HEADCOUNT_QUERY') {
      const r = await handleHeadcountQuery(ctx, entities)
      rawData = r.data; dataSource = r.dataSource
    } else if (intent === 'COMPLIANCE_QUERY') {
      const gate = requireRole(ctx, ADMIN_ROLES, lang)
      if (gate) return gate
      const r = await handleComplianceQuery()
      rawData = r.data; dataSource = r.dataSource
    } else if (intent === 'WORKFLOW_QUERY') {
      const gate = requireRole(ctx, MANAGER_ROLES, lang)
      if (gate) return gate
      const r = await handleWorkflowQuery()
      rawData = r.data; dataSource = r.dataSource
    } else if (intent === 'TEAM_QUERY') {
      const gate = requireRole(ctx, MANAGER_ROLES, lang)
      if (gate) return gate
      const r = await handleTeamQuery(ctx)
      rawData = r.data; dataSource = r.dataSource
    } else if (intent === 'POLICY_QUERY') {
      const r = await handlePolicyQuery(entities)
      rawData = r.data; dataSource = r.dataSource
    }
  } catch (err) {
    console.error('[ARIA] handler error:', intent, err)
    return {
      message: lang === 'ar'
        ? 'تعذّر تحميل البيانات في الوقت الحالي. يرجى المحاولة مجدداً.'
        : 'Unable to load data right now. Please try again in a moment.',
      intentCode: intent,
      dataSource: null,
      language: lang,
    }
  }

  const { ARIA_SYSTEM_PROMPT } = await import('@/lib/aria/system-prompt')
  const { adapter, modelId } = await getAriaLlm()
  const langLabel = lang === 'ar' ? 'Arabic (Gulf dialect)' : 'English'

  // ── Null-intent guard ─────────────────────────────────────────────────
  // No intent matched and no data was queried. Never call Claude freely for
  // HR data questions — that produces hallucinated numbers from training memory.
  if (!rawData) {
    // "leave" removed — policy questions use POLICY_QUERY intent now
    // "workflow" / "approval" / "compliance" removed — have dedicated intents
    const HR_DATA_PATTERN = /\b(how many|count|list|show|total|all departments?|employees|headcount|salary|salaries|on leave today|new hire|new join|who is|who are|percentage|percent)\b/i
    if (HR_DATA_PATTERN.test(userMessage)) {
      const msg = lang === 'ar'
        ? 'لا تتوفر لديّ هذه البيانات مباشرةً. يمكنني الإجابة عن: رصيد الإجازات، طلبات الإجازة، المسؤول التنظيمي، الأقسام، وعدد الموظفين. استخدم قوائم ARIA للاطلاع على البيانات الحية.'
        : 'I don\'t have that data available directly. I can answer: leave balances, leave requests, org chart, department list, and headcount. Use the ARIA OS views for live data.'
      return {
        message: msg, intentCode: null, dataSource: null, language: lang,
        quickReplies: lang === 'ar'
          ? ['رصيد الإجازة', 'قائمة الأقسام', 'عدد الموظفين']
          : ['My leave balance', 'List departments', 'Total headcount'],
      }
    }

    // Non-HR question (greeting, UAE law, general policy) — Claude may answer
    // but is explicitly forbidden from inventing company-specific data.
    const managerScope = ctx.role === 'MANAGER'
      ? '\nScope: You are assisting a Line Manager. Only discuss their direct and indirect team members — never discuss employees outside their reporting line.'
      : ''
    const greetingPrompt = `User asked: "${userMessage}"
Language: ${langLabel}
Organisation: ${ctx.legalEntityName ?? 'your organisation'}
Role: ${ctx.role}${managerScope}

Answer greetings, UAE Labour Law questions, and general HR policy guidance only.
Do NOT state any company-specific data (counts, names, figures) — you have none.
Plain text only. No markdown. Max 2 sentences.`
    const greetingMessages: LlmMessage[] = [
      ...history.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: greetingPrompt },
    ]
    try {
      const greetingResp = await adapter.generate({
        model: modelId, maxTokens: 150,
        system: ARIA_SYSTEM_PROMPT, messages: greetingMessages,
      })
      const greetingMsg = greetingResp.text
      return { message: greetingMsg, intentCode: null, dataSource: null, language: lang }
    } catch (err) {
      // Provider failure on free-form reply — degrade gracefully, do not crash.
      console.error('[ARIA] greeting generation provider error:', err instanceof Error ? err.message : err)
      return {
        message: lang === 'ar'
          ? 'يمكنني مساعدتك في رصيد الإجازات وطلباتها ومعرفة مديرك المباشر. كيف أساعدك؟'
          : 'I can help with your leave balance, leave requests, and finding your line manager. How can I help?',
        intentCode: null, dataSource: null, language: lang,
        quickReplies: lang === 'ar'
          ? ['رصيد الإجازة', 'من هو مديري؟']
          : ['My leave balance', 'Who is my manager?'],
      }
    }
  }

  // ── Format queried data with Claude ───────────────────────────────────
  // Embed a concrete filled example — the only reliable way to enforce the
  // card format. rawData is exclusively from the DB handlers above.
  const formattingPrompt = `Present the HR data as a compact plain-text card. No markdown, no headers (#), no bold (**), no horizontal rules (---), no bullet points, no emoji.

Use this EXACT format — fit each row on ONE line under 40 characters:
Your Leave Balances — ${new Date().getFullYear()}

Annual Leave   14 days  (took 8)
Sick Leave     13 days  (took 2)
Compensatory    3 days  (took 0)

Rules:
- Label: max 13 chars, pad with spaces to align
- Value: right-aligned number
- Detail in parentheses: taken count only
- One blank line after title, one blank line after rows
- ONLY include rows that appear in the Data section below — never add extra rows
- Do NOT add a follow-up question
- For leave REQUEST STATUS rows: show type, status, dates, and days on one line. If the row includes pending_approver and pending_step fields, add TWO extra lines immediately after: "Pending with  [approver label]" and "Step          [step name]". These lines are the primary answer when the user asks who their leave is pending with — always include them and place them prominently.
- If the user's question is about who the leave is pending with (e.g. "pending with whom?", "who needs to approve?"), lead the response card with the pending approver name and step before anything else.

Now produce this for:
User asked: "${userMessage}"
Language: ${langLabel}
Organisation: ${ctx.legalEntityName ?? 'your organisation'}
Role: ${ctx.role}${ctx.role === 'MANAGER' ? '\nScope: Line Manager — only discuss their direct and indirect team members.' : ''}
Data:
${rawData}`

  const trimmed = history.slice(-6)
  const messages: LlmMessage[] = [
    ...trimmed.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: formattingPrompt },
  ]

  let message: string
  try {
    const response = await adapter.generate({
      model: modelId, maxTokens: 300,
      system: ARIA_SYSTEM_PROMPT, messages,
    })
    message = response.text
    if (!message) message = rawData
  } catch (err) {
    // AI formatting failed — return the queried data as-is rather than crashing.
    // The data is already correct; only the prose presentation is lost.
    console.error('[ARIA] response formatting provider error — returning raw data:',
      err instanceof Error ? err.message : err)
    message = rawData
  }

  const quickReplies: string[] = intent === 'LEAVE_BALANCE_QUERY'
    ? (lang === 'ar' ? ['تقديم طلب إجازة', 'حالة الطلبات'] : ['Apply for leave', 'Request status'])
    : intent === 'LEAVE_REQUEST_STATUS'
      ? (lang === 'ar' ? ['تقديم طلب إجازة', 'رصيد الإجازة'] : ['Apply for leave', 'View balances'])
      : intent === 'ORG_CHART_QUERY'
        ? (lang === 'ar' ? ['رصيد الإجازة', 'تقديم طلب إجازة'] : ['View my balances', 'Apply for leave'])
        : intent === 'DEPARTMENT_QUERY'
          ? (lang === 'ar' ? ['عدد الموظفين', 'الهيكل التنظيمي'] : ['Total headcount', 'Org chart'])
          : intent === 'HEADCOUNT_QUERY'
            ? (lang === 'ar' ? ['قائمة الأقسام', 'تقديم طلب إجازة'] : ['List departments', 'Apply for leave'])
            : intent === 'COMPLIANCE_QUERY'
              ? (lang === 'ar' ? ['سير العمل المعلق', 'قائمة الأقسام'] : ['Pending workflows', 'List departments'])
              : intent === 'WORKFLOW_QUERY'
                ? (lang === 'ar' ? ['الامتثال', 'عدد الموظفين'] : ['Compliance status', 'Total headcount'])
                : intent === 'POLICY_QUERY'
                  ? (lang === 'ar' ? ['رصيد الإجازة', 'تقديم طلب إجازة'] : ['My leave balance', 'Apply for leave'])
                  : intent === 'TEAM_QUERY'
                    ? (lang === 'ar' ? ['إجازات الفريق', 'الموافقات المعلقة'] : ['Team leave status', 'Pending approvals'])
                    : []

  return { message, intentCode: intent, dataSource, language: lang, quickReplies }
}
