'use server'
/**
 * ARIA Server Actions — Sprint 11.
 *
 * Hard Rule 1: every ARIA query writes an ARIA.QUERY audit row in the same tx.
 * Hard Rule 7: ARIA never writes HR data without explicit user confirmation.
 * Hard Rule 8: cross-module calls only via module index.ts barrels.
 *
 * CHAOS-008d: RateLimitError from the Anthropic SDK is caught before
 * translateError so the user sees a friendly retry message rather than
 * the generic error. All other Anthropic errors fall through to translateError
 * which converts them to GENERIC_ERROR (no raw SDK details leaked).
 */
import { auth, requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { db } from '@/lib/db'
import { getResilientLlmClient, LlmError } from '@/lib/aria/llm'
import { loadAriaRuntimeConfig } from '@/lib/aria/config-loader'
import type { AriaChatMessage, AriaResponse, AriaSessionContext, AriaLeaveDraft, AriaTransferDraft } from './types'
import { classifyIntent, handleIntent } from './services'
import type { AriaOSKpis } from '@/components/aria/AriaOSHome'

// ── sendAriaMessage ────────────────────────────────────────────────────────

/**
 * Primary ARIA Server Action.
 * Called by both admin and employee chat UIs.
 *
 * @param message        The user's latest message text.
 * @param sessionCtx     Person / role / entity from server session.
 * @param history        Last ≤10 messages held in React state (not persisted).
 * @param pendingDraft   If the previous ARIA turn produced a leave draft
 *                       awaiting confirmation, pass it here so ARIA can act on it.
 */
export async function sendAriaMessage(
  message:              string,
  sessionCtx:           AriaSessionContext,
  history:              AriaChatMessage[],
  pendingDraft:         AriaLeaveDraft | null = null,
  pendingTransferDraft: AriaTransferDraft | null = null,
): Promise<AriaResponse> {
  try {
  const session = await auth()
  if (!session?.user) throw new Error('UNAUTHENTICATED')

  // P3-A1 — SECURITY: NEVER trust the client-supplied sessionCtx identity fields.
  // Re-derive personId / role / legalEntityId from the authenticated session and
  // overwrite them. Only display/preference fields (language, legalEntityName,
  // userName) are honoured from the client. A forged ctx.personId/role/entity is
  // therefore inert: it cannot read another employee's data, escalate to an admin
  // intent, or submit leave on someone else's behalf.
  const safeCtx: AriaSessionContext = {
    ...sessionCtx,
    personId:      session.user.personId ?? '',
    role:          session.user.role,
    legalEntityId: session.user.legalEntityId,
  }

  const intentResult = await classifyIntent(message, history)

  const ariaResponse = await handleIntent(
    intentResult,
    message,
    history,
    safeCtx,
    pendingDraft,
    pendingTransferDraft,
  )

  // Hard Rule 7: submit the confirmed TRANSFER only after the user says Yes.
  // ARIA never applies the change — requestTransfer creates a request + starts
  // the approval workflow; the engine applies it on final human approval.
  if (intentResult.intent === 'TRANSFER_REQUEST_CONFIRM' && pendingTransferDraft) {
    try {
      const { requestTransfer } = await import('@/modules/core-hr')
      const d = pendingTransferDraft
      const r = await requestTransfer({
        personId:           d.personId,
        requestType:        d.requestType,
        targetDepartmentId: d.targetDepartmentId,
        targetPositionId:   d.targetPositionId,
        targetGradeId:      d.targetGradeId,
        effectiveDate:      d.effectiveDate,
        reason:             d.reason,
        notes:              'Submitted via ARIA assistant · مُقدَّم عبر مساعد ARIA',
      })
      const target = d.requestType === 'PROMOTION'
        ? (sessionCtx.language === 'ar' ? `إلى درجة ${d.targetGradeName}` : `to grade ${d.targetGradeName}`)
        : (sessionCtx.language === 'ar' ? `إلى ${d.targetDepartmentName}` : `to ${d.targetDepartmentName}`)
      const label = d.requestType === 'PROMOTION'
        ? (sessionCtx.language === 'ar' ? 'الترقية' : 'promotion')
        : (sessionCtx.language === 'ar' ? 'النقل' : 'transfer')
      ariaResponse.message = r.success
        ? (sessionCtx.language === 'ar'
            ? `تم تقديم طلب ${label} ${d.personName} ${target} للموافقة. سيتم إخطار المعتمدين.`
            : `${label[0].toUpperCase()}${label.slice(1)} request for ${d.personName} ${target} submitted for approval. Approvers have been notified.`)
        : (sessionCtx.language === 'ar'
            ? `تعذّر تقديم طلب ${label}: ${r.error ?? 'خطأ غير معروف'}`
            : `Unable to submit the ${label} request: ${r.error ?? 'unknown error'}`)
      ariaResponse.intentCode = null
    } catch (err) {
      console.error('[ARIA] requestTransfer failed:', err)
      ariaResponse.message = sessionCtx.language === 'ar'
        ? 'تعذّر تقديم الطلب. يرجى المحاولة لاحقاً أو التواصل مع الموارد البشرية.'
        : 'Unable to submit the request. Please try again or contact HR.'
      ariaResponse.intentCode = null
    }
  }

  // Hard Rule 7: submit the confirmed draft only after the user says Yes
  if (intentResult.intent === 'LEAVE_REQUEST_CONFIRM' && pendingDraft) {
    try {
      const submitResult = await submitConfirmedLeaveRequest(pendingDraft, safeCtx)
      const isPending = submitResult.status === 'PENDING'
      ariaResponse.message = isPending
        ? `Leave request submitted successfully.\n\nReference   ${submitResult.requestNumber}\nStatus      Pending approval\n\nYour manager has been notified.\n\nتم تقديم طلب الإجازة بنجاح. المرجع: ${submitResult.requestNumber} — في انتظار الموافقة.`
        : `Leave request saved.\n\nReference   ${submitResult.requestNumber}\nStatus      Draft — submit via the Leave portal to start approval\n\nتم حفظ طلب الإجازة. المرجع: ${submitResult.requestNumber} — يرجى تقديمه عبر بوابة الإجازات لبدء الموافقة.`
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.startsWith('INSUFFICIENT_BALANCE')) {
        ariaResponse.message = sessionCtx.language === 'ar'
          ? 'تعذّر تقديم الطلب — رصيد إجازتك غير كافٍ. تواصل مع فريق الموارد البشرية للحصول على استثناء أو تعديل التواريخ.'
          : 'Unable to submit — your leave balance is insufficient for this request. Contact HR to request an exception or adjust your dates.'
        ariaResponse.intentCode = null
      } else if (msg.startsWith('OVERLAP')) {
        ariaResponse.message = sessionCtx.language === 'ar'
          ? 'تعذّر التقديم — لديك طلب إجازة معلق أو موافق عليه يتداخل مع هذه التواريخ.'
          : 'Unable to submit — you already have a pending or approved request overlapping these dates.'
        ariaResponse.intentCode = null
      } else if (msg.startsWith('GENDER_RESTRICTION')) {
        ariaResponse.message = sessionCtx.language === 'ar'
          ? 'تعذّر التقديم — نوع الإجازة المطلوب غير متاح لك.'
          : 'Unable to submit — this leave type is not available for your profile.'
        ariaResponse.intentCode = null
      } else {
        console.error('[ARIA] submitConfirmedLeaveRequest failed:', err)
        ariaResponse.message = sessionCtx.language === 'ar'
          ? 'تعذّر تقديم الطلب. يرجى المحاولة مجدداً أو التواصل مع الموارد البشرية.'
          : 'Unable to submit your leave request. Please try again or contact HR.'
        ariaResponse.intentCode = null
      }
    }
  }

  // Audit metadata — active provider/model (best-effort; never blocks response).
  let auditProvider: string | undefined
  let auditModel: string | undefined
  try { const c = await loadAriaRuntimeConfig(); auditProvider = c.provider; auditModel = c.modelId } catch { /* ignore */ }

  // Hard Rule 1 — write ARIA.QUERY audit row in a transaction
  await db.transaction(async tx => {
    await writeAuditLog(
      {
        actorId:      session.user.id,
        actorName:    session.user.name ?? session.user.email ?? 'unknown',
        actorRole:    session.user.role,
        channel:      'ARIA_TEXT',          // valid: WEB | MOBILE | ARIA_TEXT | ARIA_VOICE | API | SYSTEM | BATCH
        eventType:    'ARIA.QUERY',
        resourceType: 'aria_session',
        resourceId:   safeCtx.personId,
        entityId:     safeCtx.legalEntityId,
        newValues: {
          intent:      intentResult.intent,
          capability:  intentResult.intent,   // governed capability selected
          language:    intentResult.language,
          confidence:  intentResult.confidence,
          dataSource:  ariaResponse.dataSource,
          provider:    auditProvider,
          model:       auditModel,
          confirmed:   intentResult.intent === 'LEAVE_REQUEST_CONFIRM',
          success:     true,
        },
      },
      tx,
    )
  })

  return ariaResponse
  } catch (e) {
    const lang = sessionCtx?.language ?? 'en'

    // Mandatory failure audit — no silent failures. Best-effort; never affects
    // the user-facing response. Logs success=false + error kind (no secrets).
    try {
      const s = await auth()
      if (s?.user && !(e instanceof Error && e.message === 'UNAUTHENTICATED')) {
        const errorKind = e instanceof LlmError ? e.kind : (e instanceof Error ? e.name : 'unknown')
        await db.transaction(async tx => {
          await writeAuditLog({
            actorId:      s.user.id,
            actorName:    s.user.name ?? s.user.email ?? 'unknown',
            actorRole:    s.user.role,
            channel:      'ARIA_TEXT',
            eventType:    'ARIA.QUERY',
            resourceType: 'aria_session',
            resourceId:   s.user.personId ?? '',
            entityId:     s.user.legalEntityId,
            newValues:    { success: false, errorKind },
          }, tx)
        })
      }
    } catch { /* never let auditing affect the user response */ }

    // Provider-neutral LLM error handling. The provider layer (lib/aria/llm)
    // normalises every vendor SDK error into LlmError{kind}. This block knows
    // nothing about Anthropic/OpenAI/etc. — it reacts only to neutral kinds.
    if (e instanceof LlmError) {
      // Rate limit → friendly retry message (CHAOS-008d).
      if (e.kind === 'rate_limit') {
        const retryAfter = e.retryAfterSec ?? 60
        console.error('[ARIA] LLM rate limited — retry-after:', retryAfter, 's')
        return {
          message: lang === 'ar'
            ? `خدمة الذكاء الاصطناعي مشغولة حالياً. يُرجى المحاولة مجدداً خلال ${retryAfter} ثانية.`
            : `ARIA is temporarily unavailable due to high demand. Please try again in ${retryAfter} seconds.`,
          intentCode:  null,
          dataSource:  null,
          language:    lang,
          quickReplies: [],
        }
      }

      // Endpoint unreachable / invalid key → stay functional, no crash (CHAOS-008a).
      if (e.kind === 'connection' || e.kind === 'auth') {
        console.error('[ARIA] LLM provider connectivity/auth failure:', e.provider, e.kind, e.message)
        return {
          message: lang === 'ar'
            ? 'مساعد الذكاء الاصطناعي غير متاح مؤقتاً. يُرجى المحاولة لاحقاً أو التواصل مع فريق تقنية المعلومات.'
            : 'ARIA is temporarily unavailable. Please try again later or contact IT support.',
          intentCode: null,
          dataSource:  null,
          language:    lang,
        }
      }

      // Provider not configured / no adapter → informative admin message.
      if (e.kind === 'not_configured') {
        console.error('[ARIA] LLM provider not configured:', e.provider, e.message)
        return {
          message: lang === 'ar'
            ? 'لم يتم تهيئة مساعد الذكاء الاصطناعي بعد. تواصل مع مسؤول تقنية المعلومات لتفعيل الخدمة.'
            : 'ARIA is not configured for this installation. Please contact your IT administrator to enable the AI assistant.',
          intentCode: null,
          dataSource:  null,
          language:    lang,
        }
      }
      // bad_request / timeout / unknown fall through to the safe generic reply.
      console.error('[ARIA] LLM error:', e.provider, e.kind, e.message)
    }

    // Legacy sentinel (pre-layer code paths) — treat as not-configured.
    if (e instanceof Error && e.message === 'ARIA_NOT_CONFIGURED') {
      console.error('[ARIA] API key not configured')
      return {
        message: lang === 'ar'
          ? 'لم يتم تهيئة مساعد الذكاء الاصطناعي بعد. تواصل مع مسؤول تقنية المعلومات لتفعيل الخدمة.'
          : 'ARIA is not configured for this installation. Please contact your IT administrator to enable the AI assistant.',
        intentCode: null,
        dataSource:  null,
        language:    lang,
      }
    }

    // Authentication failures must propagate to the auth boundary so the UI can
    // redirect to sign-in — they are NOT runtime/provider/data failures and must
    // not be masked as an ARIA hiccup.
    if (e instanceof Error && e.message === 'UNAUTHENTICATED') throw e

    // RULE 8 + ARIA contract: a user-facing chat action must NEVER rethrow for
    // runtime / provider / data-lookup failures — a thrown error surfaces in the
    // chat UI as the opaque "Sorry, something went wrong" message and masks the
    // real cause. Log full technical detail server-side (no secrets) and return a
    // safe AriaResponse so the chat degrades gracefully.
    console.error('[ARIA] sendAriaMessage unhandled error:', e instanceof Error ? e.stack ?? e.message : e)
    return {
      message: lang === 'ar'
        ? 'تواجه آريا صعوبة في معالجة طلبك الآن. يرجى المحاولة مرة أخرى، أو التواصل مع إدارة الموارد البشرية إذا استمرت المشكلة.'
        : 'ARIA is having trouble processing your request right now. Please try again, or contact HR Admin if the issue continues.',
      intentCode:  null,
      dataSource:  null,
      language:    lang,
      quickReplies: [],
    }
  }
}

// ── submitConfirmedLeaveRequest (write path — Hard Rule 7 enforced) ────────

/**
 * Called ONLY when the user has explicitly confirmed a leave draft (Yes/نعم).
 * Calls createLeaveRequest + submitLeaveRequest via the absence barrel.
 * Hard Rule 7: this function must only be called with confirmation=true.
 */
async function submitConfirmedLeaveRequest(
  draft: AriaLeaveDraft,
  ctx:   AriaSessionContext,
): Promise<{ requestNumber: string; status: 'PENDING' | 'DRAFT' }> {
  const session = await auth()
  if (!session?.user) throw new Error('UNAUTHENTICATED')

  // Import through barrel — Hard Rule 8
  const { createLeaveRequest, submitLeaveRequest } = await import('@/modules/absence')
  const durationDays = draft.durationDays

  // Use the legalEntityId resolved from the employee's active worker assignment
  // (stored in the draft by buildLeaveDraft via resolveEmploymentEntityId).
  // ctx.legalEntityId comes from the session auth record and may be an empty
  // string for accounts where legalEntityId was not yet set — using it directly
  // would fail the Zod uuid() validator or trigger assertEntityScope FORBIDDEN.
  const resolvedEntityId = draft.legalEntityId || ctx.legalEntityId
  if (!resolvedEntityId) throw new Error('ENTITY_NOT_RESOLVED: cannot determine legal entity for leave request')

  const created = await createLeaveRequest({
    personId:            ctx.personId,
    legalEntityId:       resolvedEntityId,
    absenceTypeId:       draft.absenceTypeId,
    startDate:           draft.startDate,
    endDate:             draft.endDate,
    durationDays,
    isHalfDay:           false,
    submittedVia:        'ARIA_TEXT',
    notes:               'Submitted via ARIA assistant · مُقدَّم عبر مساعد ARIA',
    medicalCertRequired: false,
  })

  try {
    await submitLeaveRequest(created.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('NOT_FOUND: no active workflow template')) {
      // Workflow not yet configured — record is saved as DRAFT; user can submit via portal.
      return { requestNumber: created.requestNumber, status: 'DRAFT' as const }
    }
    throw err
  }

  return { requestNumber: created.requestNumber, status: 'PENDING' as const }
}

// ── generateDailyBriefing ──────────────────────────────────────────────────

/**
 * Generates the daily HR briefing shown on the ARIA OS home panel.
 * Uses a single Claude call — skips intent classification entirely.
 * Takes pre-computed KPIs so there is no extra DB round-trip.
 */
export async function generateDailyBriefing(
  kpis: AriaOSKpis,
  ctx:  AriaSessionContext,
): Promise<string> {
  // P3-L-BRIEFING-NOGATE — restrict the ARIA OS briefing (and its API spend) to
  // the privileged roles that can reach the ARIA OS console; EMPLOYEE cannot
  // invoke it directly to consume the AI quota.
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'])

  // Provider-independent + resilient failover: provider/model/key/fallback from config.
  const cfg = await loadAriaRuntimeConfig()
  const { adapter, modelId: briefingModelId } = getResilientLlmClient({
    provider: cfg.provider, modelId: cfg.modelId, apiKey: cfg.apiKey, apiEndpoint: cfg.apiEndpoint,
    fallbackProvider: cfg.fallbackProvider, fallbackModelId: cfg.fallbackModelId, fallbackApiKey: cfg.fallbackApiKey,
  })

  const today = new Date().toLocaleDateString('en-AE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const prompt = `You are ARIA, an HR intelligence assistant for ${ctx.legalEntityName ?? 'the organisation'}.
Today is ${today}.

Live data snapshot:
- Active headcount: ${kpis.headcount}
- Emiratisation: ${kpis.emiratisationPct != null ? kpis.emiratisationPct.toFixed(1) + '%' : 'N/A'} (regulatory target 4%)
- Pending approvals requiring action: ${kpis.pendingApprovals}

Write a concise daily HR briefing for a senior HR manager. 3–4 sentences. Plain text only — no markdown, no bullet points, no headers. Mention the key figures above and one actionable priority.`

  try {
    const response = await adapter.generate({
      model:     briefingModelId,
      maxTokens: 200,
      messages:  [{ role: 'user', content: prompt }],
    })
    return response.text
  } catch (error) {
    if (error instanceof LlmError && error.kind === 'not_configured') {
      return 'Daily AI briefing is unavailable until an AI provider is configured in Settings.'
    }
    throw error
  }
}
