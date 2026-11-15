/**
 * GET /api/workflow/action?token=<jwt>
 *
 * One-click email approval handler (Section 7 & 8).
 * Validates the JWT, atomically single-use claims the email token record, calls
 * the canonical takeWorkflowAction (which enforces RBAC, atomic claim, idempotency,
 * workflow-state validity and its own audit), then writes an additional audit row
 * tagged with the provider channel (EMAIL_GRAPH / EMAIL_SMTP) and returns a
 * branded confirmation page.
 *
 * Security properties (reused, already battle-tested):
 *  - signed (HMAC-SHA256), time-bound (exp), single-use (used_at atomic claim),
 *    nonce (jti). Wrong approver / completed / reassigned / cancelled steps are
 *    rejected by takeWorkflowAction. Duplicate clicks are idempotent (token reuse
 *    blocked; if somehow re-claimed, the step is no longer PENDING).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import {
  workflowDefinitionsV2,
  workflowEmailTokens,
  workflowInstancesV2,
  workflowStepsV2,
  workflowStepInstances,
} from '@/drizzle/schema/workflow-engine'
import {
  absenceEntries,
  absenceTypes,
  auditLog,
  emailDeliveryEvents,
  emailMessages,
  persons,
  userAccounts,
} from '@/drizzle/schema'
import { takeWorkflowAction } from '@/lib/workflow-engine'
import { writeAuditLog } from '@/lib/audit'
import { rateLimit, rateLimitKey, clientIp, RATE_LIMITS } from '@/lib/rate-limit'
import {
  EMAIL_DELIVERY_REJECTION_EVENT,
  buildGenericDecisionContext,
  emailDeliveryPolicyMetadata,
  queueWorkflowApprovalEmail,
  type DecisionContext,
  getActiveProviderRow,
  validateEmailDeliveryPolicy,
} from '@/modules/communication'

export const dynamic = 'force-dynamic'

interface TokenPayload {
  jti:  string
  sub:  string
  inst: string
  step: string
  act:  'APPROVE' | 'REJECT' | 'DELEGATE'
  exp:  number
}

type JwtResult = { ok: true; payload: TokenPayload } | { ok: false; reason: string }
type ActionTaken = TokenPayload['act']
type ReissueAction = Exclude<ActionTaken, 'DELEGATE'>

const REISSUE_AUDIT_EVENT = 'WORKFLOW.EMAIL_LINK_REISSUED'
const REISSUE_RATE_LIMIT_AUDIT_EVENT = 'WORKFLOW.EMAIL_LINK_REISSUE_RATE_LIMITED'
const EMAIL_DELEGATE_AUDIT_EVENT = 'WORKFLOW.EMAIL_DELEGATE'
const REISSUE_LIMIT_PER_DAY = 3
const REISSUE_WINDOW_MS = 24 * 60 * 60 * 1000

interface AlreadyActionedContext {
  action: ActionTaken
  requester: string
  requestType: string
  timestamp: Date
  viewUrl: string
}

interface ActionLinkContext {
  instanceId: string
  stepInstanceId: string
  legalEntityId: string
  resourceType: string
  resourceId: string
  workflowName: string
  requester: string
  requesterPersonId: string
  originalApprover: string
  originalApproverPersonId: string
  originalApproverEmail: string | null
  requestType: string
  intendedAction: ActionTaken
  expiresAt: Date
  tokenUsedAt: Date | null
  stepStatus: string | null
  stepAssignedToPersonId: string | null
  stepDelegatedToPersonId: string | null
  stepCanDelegate: boolean
  viewUrl: string
}

interface DelegateRecipient {
  id: string
  name: string
  nameAr: string | null
  personNumber: string
  email: string
  legalEntityId: string
  assignmentStatus: string
}

function isActionTaken(value: unknown): value is ActionTaken {
  return value === 'APPROVE' || value === 'REJECT' || value === 'DELEGATE'
}

function isTokenPayload(value: unknown): value is TokenPayload {
  return isRecord(value)
    && typeof value.jti === 'string'
    && value.jti.length > 0
    && typeof value.sub === 'string'
    && value.sub.length > 0
    && typeof value.inst === 'string'
    && value.inst.length > 0
    && typeof value.step === 'string'
    && value.step.length > 0
    && isActionTaken(value.act)
    && typeof value.exp === 'number'
    && Number.isFinite(value.exp)
    && value.exp > 0
}

function signatureMatches(expected: string, actual: string): boolean {
  try {
    const expectedBytes = Buffer.from(expected, 'base64url')
    const actualBytes = Buffer.from(actual, 'base64url')
    return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
  } catch {
    return false
  }
}

function verifyJwt(token: string): JwtResult {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'Malformed token' }
  const [header, payload, signature] = parts
  const secret = process.env.WORKFLOW_JWT_SECRET
  if (!secret) return { ok: false, reason: 'Server misconfigured' }
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  if (!signatureMatches(expected, signature)) return { ok: false, reason: 'Invalid signature' }
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString()) as unknown
    if (!isRecord(parsedHeader) || parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') {
      return { ok: false, reason: 'Unsupported token header' }
    }
    const parsedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString()) as unknown
    if (!isTokenPayload(parsedPayload)) return { ok: false, reason: 'Malformed payload' }
    return { ok: true, payload: parsedPayload }
  } catch {
    return { ok: false, reason: 'Malformed payload' }
  }
}

function signActionToken(params: {
  instanceId: string
  stepInstanceId: string
  personId: string
  action: ReissueAction
  expiresAt: Date
}): { jti: string; token: string } {
  const secret = process.env.WORKFLOW_JWT_SECRET
  if (!secret) throw new Error('WORKFLOW_JWT_SECRET env var is required')
  const jti = randomBytes(32).toString('hex')
  const payload: TokenPayload = {
    jti,
    sub: params.personId,
    inst: params.instanceId,
    step: params.stepInstanceId,
    act: params.action,
    exp: Math.floor(params.expiresAt.getTime() / 1000),
  }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return { jti, token: `${header}.${body}.${sig}` }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDubaiDateTime(value: Date, locale: 'en-AE' | 'ar-AE'): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(value)
}

function actionLabel(action: ActionTaken): { en: string; ar: string; pastEn: string; sentenceAr: string } {
  if (action === 'REJECT') {
    return {
      en: 'Rejected',
      ar: 'مرفوض',
      pastEn: 'rejected',
      sentenceAr: 'لقد رفضت هذا الطلب بتاريخ',
    }
  }
  if (action === 'DELEGATE') {
    return {
      en: 'Delegated',
      ar: 'مفوّض',
      pastEn: 'delegated',
      sentenceAr: 'لقد فوّضت هذا الطلب بتاريخ',
    }
  }
  return {
    en: 'Approved',
    ar: 'تمت الموافقة',
    pastEn: 'approved',
    sentenceAr: 'لقد وافقت على هذا الطلب بتاريخ',
  }
}

function isAlreadyActionedError(error?: string | null): boolean {
  if (!error) return false
  return error.includes('already actioned')
    || error.includes('Step is not actionable (status: APPROVED)')
    || error.includes('Step is not actionable (status: REJECTED)')
}

function normalizeAction(value: string | null | undefined, fallback: ActionTaken): ActionTaken {
  if (value === 'APPROVE' || value === 'REJECT' || value === 'DELEGATE') return value
  return fallback
}

function isReissueAction(action: ActionTaken): action is ReissueAction {
  return action === 'APPROVE' || action === 'REJECT'
}

async function loadActionLinkContext(payload: TokenPayload, requestOrigin: string): Promise<ActionLinkContext | null> {
  const [tokenRecord] = await db
    .select({
      instanceId: workflowEmailTokens.instanceId,
      stepInstanceId: workflowEmailTokens.stepInstanceId,
      intendedAction: workflowEmailTokens.intendedAction,
      issuedToPersonId: workflowEmailTokens.issuedToPersonId,
      expiresAt: workflowEmailTokens.expiresAt,
      usedAt: workflowEmailTokens.usedAt,
    })
    .from(workflowEmailTokens)
    .where(eq(workflowEmailTokens.jti, payload.jti))
    .limit(1)

  if (!tokenRecord) return null
  if (tokenRecord.instanceId !== payload.inst) return null
  if (tokenRecord.stepInstanceId !== payload.step) return null
  if (tokenRecord.issuedToPersonId !== payload.sub) return null
  if (Math.floor(tokenRecord.expiresAt.getTime() / 1000) !== payload.exp) return null
  const intendedAction = normalizeAction(tokenRecord.intendedAction, payload.act)
  if (intendedAction !== payload.act) return null

  const [instance] = await db
    .select({
      id: workflowInstancesV2.id,
      resourceType: workflowInstancesV2.resourceType,
      resourceId: workflowInstancesV2.resourceId,
      initiatedByPersonId: workflowInstancesV2.initiatedByPersonId,
      legalEntityId: workflowInstancesV2.legalEntityId,
      workflowNameEn: workflowDefinitionsV2.workflowNameEn,
    })
    .from(workflowInstancesV2)
    .leftJoin(workflowDefinitionsV2, eq(workflowDefinitionsV2.id, workflowInstancesV2.workflowDefinitionId))
    .where(eq(workflowInstancesV2.id, tokenRecord.instanceId))
    .limit(1)

  if (!instance) return null

  const [step] = await db
    .select({
      status: workflowStepInstances.status,
      assignedToPersonId: workflowStepInstances.assignedToPersonId,
      delegatedToPersonId: workflowStepInstances.delegatedToPersonId,
      canDelegate: workflowStepsV2.canDelegate,
    })
    .from(workflowStepInstances)
    .leftJoin(workflowStepsV2, eq(workflowStepsV2.id, workflowStepInstances.stepId))
    .where(eq(workflowStepInstances.id, tokenRecord.stepInstanceId))
    .limit(1)

  const [requester] = await db
    .select({
      personNumber: persons.personNumber,
      fullNameEn: persons.fullNameEn,
    })
    .from(persons)
    .where(eq(persons.id, instance.initiatedByPersonId))
    .limit(1)

  const [approver] = await db
    .select({
      personNumber: persons.personNumber,
      fullNameEn: persons.fullNameEn,
      email: userAccounts.primaryEmail,
    })
    .from(persons)
    .leftJoin(userAccounts, and(
      eq(userAccounts.personId, persons.id),
      eq(userAccounts.isActive, true),
    ))
    .where(eq(persons.id, tokenRecord.issuedToPersonId))
    .limit(1)

  let requestType = instance.workflowNameEn ?? 'Workflow request'
  if (instance.resourceType === 'absence_entries') {
    const [absence] = await db
      .select({
        requestNumber: absenceEntries.requestNumber,
        typeNameEn: absenceTypes.typeNameEn,
      })
      .from(absenceEntries)
      .leftJoin(absenceTypes, eq(absenceTypes.id, absenceEntries.absenceTypeId))
      .where(eq(absenceEntries.id, instance.resourceId))
      .limit(1)

    if (absence) {
      requestType = `${absence.typeNameEn ?? 'Leave request'} (${absence.requestNumber})`
    }
  }

  const requesterLabel = requester
    ? `${requester.fullNameEn ?? 'Requester'}${requester.personNumber ? ` (${requester.personNumber})` : ''}`
    : 'Requester'
  const approverLabel = approver
    ? `${approver.fullNameEn ?? 'Approver'}${approver.personNumber ? ` (${approver.personNumber})` : ''}`
    : 'Approver'

  return {
    instanceId: instance.id,
    stepInstanceId: tokenRecord.stepInstanceId,
    legalEntityId: instance.legalEntityId,
    resourceType: instance.resourceType,
    resourceId: instance.resourceId,
    workflowName: instance.workflowNameEn ?? 'Workflow request',
    requester: requesterLabel,
    requesterPersonId: instance.initiatedByPersonId,
    originalApprover: approverLabel,
    originalApproverPersonId: tokenRecord.issuedToPersonId,
    originalApproverEmail: approver?.email ?? null,
    requestType,
    intendedAction,
    expiresAt: tokenRecord.expiresAt,
    tokenUsedAt: tokenRecord.usedAt,
    stepStatus: step?.status ?? null,
    stepAssignedToPersonId: step?.assignedToPersonId ?? null,
    stepDelegatedToPersonId: step?.delegatedToPersonId ?? null,
    stepCanDelegate: step?.canDelegate ?? false,
    viewUrl: `${requestOrigin}/approvals/${instance.id}`,
  }
}

async function loadAlreadyActionedContext(payload: TokenPayload, requestOrigin: string): Promise<AlreadyActionedContext | null> {
  const [tokenRecord] = await db
    .select({
      instanceId: workflowEmailTokens.instanceId,
      stepInstanceId: workflowEmailTokens.stepInstanceId,
      intendedAction: workflowEmailTokens.intendedAction,
      usedAt: workflowEmailTokens.usedAt,
    })
    .from(workflowEmailTokens)
    .where(eq(workflowEmailTokens.jti, payload.jti))
    .limit(1)

  if (!tokenRecord) return null

  const [instance] = await db
    .select({
      id: workflowInstancesV2.id,
      resourceType: workflowInstancesV2.resourceType,
      resourceId: workflowInstancesV2.resourceId,
      initiatedByPersonId: workflowInstancesV2.initiatedByPersonId,
      workflowNameEn: workflowDefinitionsV2.workflowNameEn,
      workflowNameAr: workflowDefinitionsV2.workflowNameAr,
    })
    .from(workflowInstancesV2)
    .leftJoin(workflowDefinitionsV2, eq(workflowDefinitionsV2.id, workflowInstancesV2.workflowDefinitionId))
    .where(eq(workflowInstancesV2.id, tokenRecord.instanceId))
    .limit(1)

  if (!instance) return null

  const [step] = await db
    .select({
      decision: workflowStepInstances.decision,
      decidedAt: workflowStepInstances.decidedAt,
      delegatedAt: workflowStepInstances.delegatedAt,
    })
    .from(workflowStepInstances)
    .where(eq(workflowStepInstances.id, tokenRecord.stepInstanceId))
    .limit(1)

  const [requester] = await db
    .select({
      personNumber: persons.personNumber,
      fullNameEn: persons.fullNameEn,
    })
    .from(persons)
    .where(eq(persons.id, instance.initiatedByPersonId))
    .limit(1)

  let requestType = instance.workflowNameEn ?? 'Workflow request'
  if (instance.resourceType === 'absence_entries') {
    const [absence] = await db
      .select({
        requestNumber: absenceEntries.requestNumber,
        typeNameEn: absenceTypes.typeNameEn,
        typeNameAr: absenceTypes.typeNameAr,
      })
      .from(absenceEntries)
      .leftJoin(absenceTypes, eq(absenceTypes.id, absenceEntries.absenceTypeId))
      .where(eq(absenceEntries.id, instance.resourceId))
      .limit(1)

    if (absence) {
      requestType = `${absence.typeNameEn ?? 'Leave request'} (${absence.requestNumber})`
    }
  }

  const action = (tokenRecord.intendedAction ?? step?.decision ?? payload.act) as ActionTaken
  const timestamp = tokenRecord.usedAt
    ?? (action === 'DELEGATE' ? step?.delegatedAt : step?.decidedAt)
  if (!timestamp) return null

  const requesterLabel = requester
    ? `${requester.fullNameEn ?? 'Requester'}${requester.personNumber ? ` (${requester.personNumber})` : ''}`
    : 'Requester'

  return {
    action,
    requester: requesterLabel,
    requestType,
    timestamp,
    viewUrl: `${requestOrigin}/approvals/${instance.id}`,
  }
}

function alreadyActionedPage(ctx: AlreadyActionedContext): NextResponse {
  const label = actionLabel(ctx.action)
  const enTime = formatDubaiDateTime(ctx.timestamp, 'en-AE')
  const arTime = formatDubaiDateTime(ctx.timestamp, 'ar-AE')
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Request already actioned</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:Canvas;color:CanvasText;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:Canvas;border:1px solid color-mix(in srgb, CanvasText 14%, Canvas);border-radius:14px;max-width:520px;width:90%;
        padding:32px;text-align:start;box-shadow:0 6px 24px color-mix(in srgb, CanvasText 10%, transparent)}
  .badge{width:56px;height:56px;border-radius:50%;background:Highlight;margin:0 0 18px;
         display:flex;align-items:center;justify-content:center;color:HighlightText;font-size:28px;font-weight:700}
  h1{font-size:21px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:color-mix(in srgb, CanvasText 68%, Canvas);margin:0}
  .ar{direction:rtl;text-align:right;margin-top:10px}.meta{margin-top:20px;background:color-mix(in srgb, CanvasText 4%, Canvas);border-radius:10px;padding:14px}
  .row{display:flex;justify-content:space-between;gap:18px;padding:7px 0;border-bottom:1px solid color-mix(in srgb, CanvasText 12%, Canvas)}
  .row:last-child{border-bottom:0}.label{font-size:12px;color:color-mix(in srgb, CanvasText 52%, Canvas)}.value{font-size:13px;color:inherit;text-align:end}
  .actions{margin-top:22px}.button{display:inline-block;background:Highlight;color:HighlightText;text-decoration:none;
        padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600}.brand{margin-top:22px;font-size:12px;color:color-mix(in srgb, CanvasText 52%, Canvas)}
</style></head><body>
  <div class="card">
    <div class="badge">✓</div>
    <h1>Request already actioned</h1>
    <p>You ${label.pastEn} this request on ${escapeHtml(enTime)}.</p>
    <p class="ar" lang="ar">${label.sentenceAr} ${escapeHtml(arTime)}.</p>
    <div class="meta" aria-label="Request details">
      <div class="row"><span class="label">Requester · مقدم الطلب</span><span class="value">${escapeHtml(ctx.requester)}</span></div>
      <div class="row"><span class="label">Request type · نوع الطلب</span><span class="value">${escapeHtml(ctx.requestType)}</span></div>
      <div class="row"><span class="label">Action taken · الإجراء المتخذ</span><span class="value">${escapeHtml(label.en)} · ${escapeHtml(label.ar)}</span></div>
      <div class="row"><span class="label">Timestamp · الوقت</span><span class="value">${escapeHtml(enTime)}</span></div>
    </div>
    <div class="actions"><a class="button" href="${escapeHtml(ctx.viewUrl)}">View in AVANIIS · عرض في أفانيس</a></div>
    <div class="brand">AVANIIS HR</div>
  </div></body></html>`
  return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function reissueEligibility(ctx: ActionLinkContext): { ok: true } | { ok: false; reason: string } {
  if (!isReissueAction(ctx.intendedAction)) return { ok: false, reason: 'Delegation links must be handled in AVANIIS.' }
  if (ctx.tokenUsedAt) return { ok: false, reason: 'This link was already used.' }
  if (ctx.stepStatus !== 'PENDING') return { ok: false, reason: 'This request is no longer awaiting approval.' }
  const isCurrentApprover = ctx.stepAssignedToPersonId === ctx.originalApproverPersonId
    || ctx.stepDelegatedToPersonId === ctx.originalApproverPersonId
  if (!isCurrentApprover) return { ok: false, reason: 'This request is now assigned to another approver.' }
  if (!ctx.originalApproverEmail) return { ok: false, reason: 'No active email address is linked to the original approver.' }
  return { ok: true }
}

function expiredTokenPage(ctx: ActionLinkContext, token: string): NextResponse {
  const enExpiry = formatDubaiDateTime(ctx.expiresAt, 'en-AE')
  const arExpiry = formatDubaiDateTime(ctx.expiresAt, 'ar-AE')
  const eligibility = reissueEligibility(ctx)
  const actionName = actionLabel(ctx.intendedAction).en
  const actionControl = eligibility.ok
    ? `<form method="post" action="/api/workflow/action">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <button class="button" type="submit">Send me a new link · أرسل رابطاً جديداً</button>
      </form>`
    : `<p class="notice">${escapeHtml(eligibility.reason)} Please view the request in AVANIIS. يرجى عرض الطلب في أفانيس.</p>
       <a class="button" href="${escapeHtml(ctx.viewUrl)}">View in AVANIIS · عرض في أفانيس</a>`
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Approval link expired</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:Canvas;color:CanvasText;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:Canvas;border:1px solid color-mix(in srgb, CanvasText 14%, Canvas);border-radius:14px;max-width:560px;width:90%;
        padding:32px;text-align:start;box-shadow:0 6px 24px color-mix(in srgb, CanvasText 10%, transparent)}
  .badge{width:56px;height:56px;border-radius:50%;background:Mark;margin:0 0 18px;
         display:flex;align-items:center;justify-content:center;color:MarkText;font-size:28px;font-weight:700}
  h1{font-size:21px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:color-mix(in srgb, CanvasText 68%, Canvas);margin:0}
  .ar{direction:rtl;text-align:right;margin-top:10px}.meta{margin-top:20px;background:color-mix(in srgb, CanvasText 4%, Canvas);border-radius:10px;padding:14px}
  .row{display:flex;justify-content:space-between;gap:18px;padding:7px 0;border-bottom:1px solid color-mix(in srgb, CanvasText 12%, Canvas)}
  .row:last-child{border-bottom:0}.label{font-size:12px;color:color-mix(in srgb, CanvasText 52%, Canvas)}.value{font-size:13px;color:inherit;text-align:end}
  .actions{margin-top:22px}.button{display:inline-block;border:0;background:Highlight;color:HighlightText;text-decoration:none;
        padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}.notice{margin-bottom:12px}.brand{margin-top:22px;font-size:12px;color:color-mix(in srgb, CanvasText 52%, Canvas)}
</style></head><body>
  <div class="card">
    <div class="badge">!</div>
    <h1>Approval link expired</h1>
    <p>This ${escapeHtml(actionName.toLowerCase())} link expired on ${escapeHtml(enExpiry)}.</p>
    <p class="ar" lang="ar">انتهت صلاحية رابط الموافقة بتاريخ ${escapeHtml(arExpiry)}.</p>
    <div class="meta" aria-label="Request details">
      <div class="row"><span class="label">Requester · مقدم الطلب</span><span class="value">${escapeHtml(ctx.requester)}</span></div>
      <div class="row"><span class="label">Request type · نوع الطلب</span><span class="value">${escapeHtml(ctx.requestType)}</span></div>
      <div class="row"><span class="label">Original approver · المعتمد الأصلي</span><span class="value">${escapeHtml(ctx.originalApprover)}</span></div>
      <div class="row"><span class="label">Expiry · وقت الانتهاء</span><span class="value">${escapeHtml(enExpiry)}</span></div>
    </div>
    <div class="actions">${actionControl}</div>
    <div class="brand">AVANIIS HR</div>
  </div></body></html>`
  return new NextResponse(html, { status: 410, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function delegationEligibility(ctx: ActionLinkContext): { ok: true } | { ok: false; reason: string } {
  if (ctx.intendedAction !== 'DELEGATE') return { ok: false, reason: 'This link is not a delegation link.' }
  if (ctx.tokenUsedAt) return { ok: false, reason: 'This delegation link was already used.' }
  if (ctx.stepStatus !== 'PENDING') return { ok: false, reason: 'This request is no longer awaiting approval.' }
  if (!ctx.stepCanDelegate) return { ok: false, reason: 'This workflow step does not allow delegation.' }
  const isCurrentApprover = ctx.stepAssignedToPersonId === ctx.originalApproverPersonId
    || ctx.stepDelegatedToPersonId === ctx.originalApproverPersonId
  if (!isCurrentApprover) return { ok: false, reason: 'This request is now assigned to another approver.' }
  return { ok: true }
}

function delegateSelectionPage(
  ctx: ActionLinkContext,
  token: string,
  opts: { error?: string; delegateTo?: string; reason?: string; status?: number } = {},
): NextResponse {
  const eligibility = delegationEligibility(ctx)
  const actionControl = eligibility.ok
    ? `<form method="post" action="/api/workflow/action">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <label class="label" for="delegateTo">Delegate work email, employee number, or person ID · بريد المفوّض أو رقمه الوظيفي</label>
        <input id="delegateTo" name="delegateTo" required value="${escapeHtml(opts.delegateTo ?? '')}" placeholder="name@avaniis.dev or K1036">
        <label class="label" for="delegateReason">Delegation reason · سبب التفويض</label>
        <textarea id="delegateReason" name="delegateReason" required rows="4" placeholder="Why should this request be delegated?">${escapeHtml(opts.reason ?? '')}</textarea>
        <button class="button" type="submit">Delegate request · تفويض الطلب</button>
      </form>`
    : `<p class="notice">${escapeHtml(eligibility.reason)} Please view the request in AVANIIS. يرجى عرض الطلب في أفانيس.</p>
       <a class="button" href="${escapeHtml(ctx.viewUrl)}">View in AVANIIS · عرض في أفانيس</a>`
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Delegate workflow request</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:Canvas;color:CanvasText;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:Canvas;border:1px solid color-mix(in srgb, CanvasText 14%, Canvas);border-radius:14px;max-width:620px;width:90%;
        padding:32px;text-align:start;box-shadow:0 6px 24px color-mix(in srgb, CanvasText 10%, transparent)}
  .badge{width:56px;height:56px;border-radius:50%;background:Highlight;margin:0 0 18px;
         display:flex;align-items:center;justify-content:center;color:HighlightText;font-size:28px;font-weight:700}
  h1{font-size:21px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:color-mix(in srgb, CanvasText 68%, Canvas);margin:0}
  .ar{direction:rtl;text-align:right;margin-top:10px}.meta{margin-top:20px;background:color-mix(in srgb, CanvasText 4%, Canvas);border-radius:10px;padding:14px}
  .row{display:flex;justify-content:space-between;gap:18px;padding:7px 0;border-bottom:1px solid color-mix(in srgb, CanvasText 12%, Canvas)}
  .row:last-child{border-bottom:0}.label{display:block;font-size:12px;font-weight:600;color:color-mix(in srgb, CanvasText 64%, Canvas);margin:14px 0 6px}
  .value{font-size:13px;color:inherit;text-align:end}.actions{margin-top:22px}.button{display:inline-block;border:0;background:Highlight;color:HighlightText;text-decoration:none;
        padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:14px}
  input,textarea{width:100%;box-sizing:border-box;border:1px solid color-mix(in srgb, CanvasText 18%, Canvas);border-radius:8px;background:Canvas;color:CanvasText;
        font:14px 'Segoe UI',Helvetica,Arial,sans-serif;padding:10px 12px;line-height:1.5}
  textarea{resize:vertical}.error{margin-top:16px;padding:10px 12px;border-radius:8px;background:color-mix(in srgb, Mark 20%, Canvas);color:CanvasText;font-size:13px}
  .notice{margin-bottom:12px}.brand{margin-top:22px;font-size:12px;color:color-mix(in srgb, CanvasText 52%, Canvas)}
</style></head><body>
  <div class="card">
    <div class="badge">↪</div>
    <h1>Delegate workflow request</h1>
    <p>Select an eligible delegate and record why this approver should take over.</p>
    <p class="ar" lang="ar">اختر مفوّضاً مؤهلاً وسجّل سبب نقل الموافقة إليه.</p>
    <div class="meta" aria-label="Request details">
      <div class="row"><span class="label">Requester · مقدم الطلب</span><span class="value">${escapeHtml(ctx.requester)}</span></div>
      <div class="row"><span class="label">Request type · نوع الطلب</span><span class="value">${escapeHtml(ctx.requestType)}</span></div>
      <div class="row"><span class="label">Current approver · المعتمد الحالي</span><span class="value">${escapeHtml(ctx.originalApprover)}</span></div>
    </div>
    ${opts.error ? `<div class="error">${escapeHtml(opts.error)} · يرجى التصحيح والمحاولة مرة أخرى.</div>` : ''}
    <div class="actions">${actionControl}</div>
    <div class="brand">AVANIIS HR</div>
  </div></body></html>`
  return new NextResponse(html, { status: opts.status ?? 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDecisionContext(value: unknown): value is DecisionContext {
  if (!isRecord(value)) return false
  return value.version === 1
    && typeof value.type === 'string'
    && typeof value.titleEn === 'string'
    && typeof value.titleAr === 'string'
    && isRecord(value.requester)
    && typeof value.requestTypeEn === 'string'
    && typeof value.requestTypeAr === 'string'
    && typeof value.effectiveDateEn === 'string'
    && typeof value.impactEn === 'string'
    && typeof value.impactAr === 'string'
    && typeof value.reasonEn === 'string'
    && Array.isArray(value.facts)
}

async function loadDecisionContextForStep(ctx: ActionLinkContext): Promise<DecisionContext | null> {
  const rows = await db
    .select({ payloadJson: emailMessages.payloadJson })
    .from(emailMessages)
    .where(and(
      eq(emailMessages.workflowRequestId, ctx.instanceId),
      eq(emailMessages.workflowStepId, ctx.stepInstanceId),
    ))
    .orderBy(desc(emailMessages.createdDate))
    .limit(5)

  for (const row of rows) {
    const decisionContext = row.payloadJson?.decisionContext
    if (isDecisionContext(decisionContext)) return decisionContext
  }
  return null
}

function withDelegationContext(ctx: DecisionContext, delegator: string, delegate: DelegateRecipient, reason: string): DecisionContext {
  return {
    ...ctx,
    facts: [
      ...ctx.facts,
      { labelEn: 'Delegated by', labelAr: 'تم التفويض بواسطة', valueEn: delegator },
      { labelEn: 'Delegated to', labelAr: 'تم التفويض إلى', valueEn: `${delegate.name} (${delegate.personNumber})`, valueAr: delegate.nameAr ?? undefined },
      { labelEn: 'Delegation reason', labelAr: 'سبب التفويض', valueEn: reason, valueAr: reason },
    ],
    footerEn: `${ctx.footerEn ? `${ctx.footerEn} ` : ''}This approval was delegated; decide only if you are the correct decision maker.`,
    footerAr: `${ctx.footerAr ? `${ctx.footerAr} ` : ''}تم تفويض هذه الموافقة؛ اتخذ القرار فقط إذا كنت صاحب القرار الصحيح.`,
  }
}

async function resolveDelegateRecipient(input: string, ctx: ActionLinkContext): Promise<{ ok: true; delegate: DelegateRecipient } | { ok: false; reason: string }> {
  const lookup = input.trim()
  if (!lookup) return { ok: false, reason: 'Delegate is required.' }

  const normalized = lookup.toLowerCase()
  const rows = await db
    .select({
      id: persons.id,
      name: persons.fullNameEn,
      nameAr: persons.fullNameAr,
      personNumber: persons.personNumber,
      legalEntityId: persons.legalEntityId,
      assignmentStatus: persons.assignmentStatus,
      email: userAccounts.primaryEmail,
    })
    .from(persons)
    .innerJoin(userAccounts, and(
      eq(userAccounts.personId, persons.id),
      eq(userAccounts.isActive, true),
    ))
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      or(
        eq(persons.id, lookup),
        eq(persons.personNumber, lookup),
        sql`lower(${userAccounts.primaryEmail}) = ${normalized}`,
      ),
    ))
    .limit(2)

  if (rows.length === 0) return { ok: false, reason: 'No active linked user was found for that delegate.' }
  if (rows.length > 1) return { ok: false, reason: 'Delegate lookup matched more than one user.' }

  const row = rows[0]
  if (row.id === ctx.originalApproverPersonId) return { ok: false, reason: 'You cannot delegate a request to yourself.' }
  if (row.legalEntityId !== ctx.legalEntityId) return { ok: false, reason: 'Delegation cannot cross legal entities.' }
  if (row.assignmentStatus === 'TERMINATED' || row.assignmentStatus === 'DECEASED') {
    return { ok: false, reason: 'The selected delegate is not an active worker.' }
  }

  return {
    ok: true,
    delegate: {
      id: row.id,
      name: row.name ?? 'Workflow approver',
      nameAr: row.nameAr,
      personNumber: row.personNumber,
      email: row.email,
      legalEntityId: row.legalEntityId,
      assignmentStatus: row.assignmentStatus,
    },
  }
}

async function claimWorkflowEmailToken(jti: string, ipAddress: string | null) {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .update(workflowEmailTokens)
      .set({
        usedAt:    new Date(),
        ipAddress,
      })
      .where(and(eq(workflowEmailTokens.jti, jti), isNull(workflowEmailTokens.usedAt)))
      .returning()
    return record ?? null
  })
}

type ClaimedWorkflowEmailToken = NonNullable<Awaited<ReturnType<typeof claimWorkflowEmailToken>>>

function tokenRecordMatchesPayload(record: ClaimedWorkflowEmailToken, payload: TokenPayload): boolean {
  const intendedAction = normalizeAction(record.intendedAction, payload.act)
  return record.instanceId === payload.inst
    && record.stepInstanceId === payload.step
    && record.issuedToPersonId === payload.sub
    && Math.floor(record.expiresAt.getTime() / 1000) === payload.exp
    && intendedAction === payload.act
}

async function invalidatePendingStepTokens(stepInstanceId: string, ipAddress: string | null): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(workflowEmailTokens)
      .set({
        usedAt:    new Date(),
        ipAddress,
      })
      .where(and(eq(workflowEmailTokens.stepInstanceId, stepInstanceId), isNull(workflowEmailTokens.usedAt)))
      .returning({ jti: workflowEmailTokens.jti })
    return rows.length
  })
}

async function auditDelegatePolicyRejection(ctx: ActionLinkContext, delegate: DelegateRecipient, policy: ReturnType<typeof validateEmailDeliveryPolicy>): Promise<void> {
  await db.transaction(async (tx) => {
    await writeAuditLog({
      actorId: ctx.originalApproverPersonId,
      actorName: ctx.originalApprover,
      actorRole: 'MANAGER',
      channel: 'SYSTEM',
      eventType: EMAIL_DELIVERY_REJECTION_EVENT,
      resourceType: 'workflow_instances_v2',
      resourceId: ctx.instanceId,
      metadata: emailDeliveryPolicyMetadata(delegate.email, policy, 'workflowEmailDelegate', {
        workflowRequestId: ctx.instanceId,
        workflowStepId: ctx.stepInstanceId,
        delegatePersonId: delegate.id,
      }),
    }, tx)
  })
}

async function queueDelegatedWorkflowEmail(ctx: ActionLinkContext, delegate: DelegateRecipient, reason: string): Promise<string | null> {
  const providerRow = await getActiveProviderRow()
  const persistedContext = await loadDecisionContextForStep(ctx)
  const baseContext = persistedContext ?? buildGenericDecisionContext({
    requester: { nameEn: ctx.requester },
    requestType: ctx.requestType,
    effectiveDate: 'See request details',
    impact: 'Workflow approval ownership is transferred to the delegated approver',
    reason,
    reference: ctx.instanceId,
  })
  const decisionContext = withDelegationContext(baseContext, ctx.originalApprover, delegate, reason)

  return queueWorkflowApprovalEmail({
    templateCode: 'WORKFLOW_PENDING_APPROVAL',
    module: 'workflow',
    recipientEmail: delegate.email,
    recipientPersonId: delegate.id,
    recipientName: delegate.name,
    vars: {
      managerName: delegate.name,
      employeeName: ctx.requester,
      workflowRequestId: ctx.requestType,
      delegationNotice: `Delegated by ${ctx.originalApprover}. Reason: ${reason}`,
      companyName: 'AVANIIS HR',
    },
    workflowInstanceId: ctx.instanceId,
    workflowStepInstanceId: ctx.stepInstanceId,
    approverPersonId: delegate.id,
    businessObjectType: ctx.resourceType,
    businessObjectId: ctx.resourceId,
    enableWorkflowActions: true,
    tokenExpiryMinutes: providerRow?.tokenExpiryMinutes ?? 2880,
    decisionContext,
    actor: { id: ctx.originalApproverPersonId, name: ctx.originalApprover },
  })
}

async function auditEmailDelegation(args: {
  ctx: ActionLinkContext
  delegate: DelegateRecipient
  reason: string
  emailMessageId: string | null
  invalidatedTokenCount: number
  success: boolean
  error?: string
}): Promise<void> {
  const providerRow = await getActiveProviderRow()
  await db.transaction(async (tx) => {
    await writeAuditLog({
      actorId: args.ctx.originalApproverPersonId,
      actorName: args.ctx.originalApprover,
      actorRole: 'MANAGER',
      channel: providerRow?.providerType === 'SMTP' ? 'EMAIL_SMTP' : 'EMAIL_GRAPH',
      eventType: args.success ? EMAIL_DELEGATE_AUDIT_EVENT : 'WORKFLOW.EMAIL_ACTION_REJECTED',
      resourceType: 'workflow_instances_v2',
      resourceId: args.ctx.instanceId,
      metadata: {
        stepInstanceId: args.ctx.stepInstanceId,
        action: 'DELEGATE',
        delegateToPersonId: args.delegate.id,
        delegateName: args.delegate.name,
        reason: args.reason,
        emailMessageId: args.emailMessageId,
        invalidatedTokenCount: args.invalidatedTokenCount,
        success: args.success,
        error: args.error,
      },
    }, tx)
  })
}

function reissueResultPage(kind: 'success' | 'error', title: string, messageEn: string, messageAr: string, status: number): NextResponse {
  const badge = kind === 'success' ? '✓' : '!'
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:Canvas;color:CanvasText;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:Canvas;border:1px solid color-mix(in srgb, CanvasText 14%, Canvas);border-radius:14px;max-width:500px;width:90%;
        padding:32px;text-align:start;box-shadow:0 6px 24px color-mix(in srgb, CanvasText 10%, transparent)}
  .badge{width:56px;height:56px;border-radius:50%;background:Highlight;margin:0 0 18px;
         display:flex;align-items:center;justify-content:center;color:HighlightText;font-size:28px;font-weight:700}
  h1{font-size:21px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:color-mix(in srgb, CanvasText 68%, Canvas);margin:0}
  .ar{direction:rtl;text-align:right;margin-top:10px}.brand{margin-top:22px;font-size:12px;color:color-mix(in srgb, CanvasText 52%, Canvas)}
</style></head><body>
  <div class="card">
    <div class="badge">${badge}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(messageEn)}</p>
    <p class="ar" lang="ar">${escapeHtml(messageAr)}</p>
    <div class="brand">AVANIIS HR</div>
  </div></body></html>`
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

async function readActionPost(request: NextRequest): Promise<{
  token: string | null
  delegateTo?: string
  delegateReason?: string
}> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => null) as {
      token?: unknown
      delegateTo?: unknown
      delegateReason?: unknown
    } | null
    return {
      token: typeof body?.token === 'string' ? body.token : null,
      delegateTo: typeof body?.delegateTo === 'string' ? body.delegateTo : undefined,
      delegateReason: typeof body?.delegateReason === 'string' ? body.delegateReason : undefined,
    }
  }

  const form = await request.formData().catch(() => null)
  const token = form?.get('token')
  const delegateTo = form?.get('delegateTo')
  const delegateReason = form?.get('delegateReason')
  return {
    token: typeof token === 'string' ? token : null,
    delegateTo: typeof delegateTo === 'string' ? delegateTo : undefined,
    delegateReason: typeof delegateReason === 'string' ? delegateReason : undefined,
  }
}

function buildReissueEmail(ctx: ActionLinkContext, action: ReissueAction, actionUrl: string, expiresAt: Date): { subject: string; html: string } {
  const actionText = action === 'APPROVE' ? 'approve' : 'reject'
  const actionTextAr = action === 'APPROVE' ? 'الموافقة على' : 'رفض'
  const expiresText = formatDubaiDateTime(expiresAt, 'en-AE')
  const subject = `AVANIIS HR — New ${actionText} link for ${ctx.requestType}`
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body>
  <h1>New workflow approval link</h1>
  <p>A new link was requested for you to ${escapeHtml(actionText)} this workflow request.</p>
  <p lang="ar" dir="rtl">تم إصدار رابط جديد لك من أجل ${escapeHtml(actionTextAr)} طلب سير العمل هذا.</p>
  <ul>
    <li><strong>Requester:</strong> ${escapeHtml(ctx.requester)}</li>
    <li><strong>Request type:</strong> ${escapeHtml(ctx.requestType)}</li>
    <li><strong>Original approver:</strong> ${escapeHtml(ctx.originalApprover)}</li>
    <li><strong>New link expires:</strong> ${escapeHtml(expiresText)}</li>
  </ul>
  <p><a href="${escapeHtml(actionUrl)}">Open secure ${escapeHtml(actionText)} link</a></p>
  <p>This link is single-use and must not be forwarded.</p>
</body></html>`
  return { subject, html }
}

async function auditReissuePolicyRejection(ctx: ActionLinkContext, policy: ReturnType<typeof validateEmailDeliveryPolicy>): Promise<void> {
  await db.transaction(async (tx) => {
    await writeAuditLog({
      actorId: ctx.originalApproverPersonId,
      actorName: ctx.originalApprover,
      actorRole: 'MANAGER',
      channel: 'SYSTEM',
      eventType: EMAIL_DELIVERY_REJECTION_EVENT,
      resourceType: 'workflow_instances_v2',
      resourceId: ctx.instanceId,
      metadata: emailDeliveryPolicyMetadata(ctx.originalApproverEmail ?? 'unknown', policy, 'workflowActionReissue', {
        workflowRequestId: ctx.instanceId,
        workflowStepId: ctx.stepInstanceId,
        recipientPersonId: ctx.originalApproverPersonId,
      }),
    }, tx)
  })
}

async function handleDelegatePost(
  request: NextRequest,
  payload: TokenPayload,
  token: string,
  form: { delegateTo?: string; delegateReason?: string },
): Promise<NextResponse> {
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    const expiredContext = await loadActionLinkContext(payload, request.nextUrl.origin)
    if (expiredContext) return expiredTokenPage(expiredContext, token)
    return reissueResultPage('error', 'Link expired', 'This delegation link has expired. Please action the request in AVANIIS.', 'انتهت صلاحية رابط التفويض. يرجى تنفيذ الطلب في أفانيس.', 400)
  }

  const ctx = await loadActionLinkContext(payload, request.nextUrl.origin)
  if (!ctx) {
    return reissueResultPage('error', 'Invalid link', 'This delegation link is not linked to an active workflow request.', 'رابط التفويض غير مرتبط بطلب سير عمل نشط.', 401)
  }

  const eligibility = delegationEligibility(ctx)
  if (!eligibility.ok) {
    return delegateSelectionPage(ctx, token, { error: eligibility.reason, status: 409 })
  }

  const delegateLookup = (form.delegateTo ?? '').trim()
  const delegateReason = (form.delegateReason ?? '').trim().slice(0, 1000)
  if (!delegateLookup || !delegateReason) {
    return delegateSelectionPage(ctx, token, {
      error: 'Delegate and reason are required.',
      delegateTo: delegateLookup,
      reason: delegateReason,
      status: 400,
    })
  }

  const delegateResult = await resolveDelegateRecipient(delegateLookup, ctx)
  if (!delegateResult.ok) {
    return delegateSelectionPage(ctx, token, {
      error: delegateResult.reason,
      delegateTo: delegateLookup,
      reason: delegateReason,
      status: 400,
    })
  }
  const { delegate } = delegateResult

  const policy = validateEmailDeliveryPolicy(delegate.email)
  if (!policy.allowed) {
    await auditDelegatePolicyRejection(ctx, delegate, policy)
    return delegateSelectionPage(ctx, token, {
      error: 'The selected delegate email is not allowed by the current delivery policy.',
      delegateTo: delegateLookup,
      reason: delegateReason,
      status: 403,
    })
  }

  const ipAddress = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null
  const record = await claimWorkflowEmailToken(payload.jti, ipAddress)
  if (!record) {
    const alreadyActioned = await loadAlreadyActionedContext(payload, request.nextUrl.origin)
    if (alreadyActioned) return alreadyActionedPage(alreadyActioned)
    return reissueResultPage('error', 'Already actioned', 'This delegation link has already been used or is no longer valid.', 'تم استخدام رابط التفويض أو لم يعد صالحاً.', 409)
  }
  if (!tokenRecordMatchesPayload(record, payload)) {
    return reissueResultPage('error', 'Invalid link', 'This delegation link does not match the workflow token record.', 'رابط التفويض لا يطابق سجل رمز سير العمل.', 401)
  }

  const actionResult = await takeWorkflowAction({
    stepInstanceId: record.stepInstanceId,
    actorPersonId:  payload.sub,
    decision:       'DELEGATE',
    decisionNote:   delegateReason,
    delegateToPersonId: delegate.id,
    ipAddress:      record.ipAddress ?? undefined,
    userAgent:      request.headers.get('user-agent') ?? undefined,
  })

  if (!actionResult.success) {
    await auditEmailDelegation({
      ctx,
      delegate,
      reason: delegateReason,
      emailMessageId: null,
      invalidatedTokenCount: 0,
      success: false,
      error: actionResult.error,
    })
    if (isAlreadyActionedError(actionResult.error)) {
      const alreadyActioned = await loadAlreadyActionedContext(payload, request.nextUrl.origin)
      if (alreadyActioned) return alreadyActionedPage(alreadyActioned)
    }
    return reissueResultPage('error', 'Could not delegate', actionResult.error ?? 'This request can no longer be delegated.', 'تعذر تفويض هذا الطلب.', 422)
  }

  const invalidatedTokenCount = await invalidatePendingStepTokens(record.stepInstanceId, ipAddress)
  const emailMessageId = await queueDelegatedWorkflowEmail(ctx, delegate, delegateReason)
  await auditEmailDelegation({
    ctx,
    delegate,
    reason: delegateReason,
    emailMessageId,
    invalidatedTokenCount,
    success: emailMessageId !== null,
  })

  if (!emailMessageId) {
    return reissueResultPage('error', 'Delegated, email not queued', 'The workflow was delegated, but the delegate email could not be queued. Please notify the delegate in AVANIIS.', 'تم تفويض سير العمل، لكن تعذر إنشاء بريد المفوّض. يرجى إشعار المفوّض داخل أفانيس.', 500)
  }

  return reissueResultPage(
    'success',
    'Request delegated',
    `This request has been delegated to ${delegate.name}. A fresh workflow email has been queued for the delegate.`,
    `تم تفويض هذا الطلب إلى ${delegate.name}. تم إنشاء بريد سير عمل جديد للمفوّض.`,
    200,
  )
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // EPRC-01 B2 (RATE-01): throttle tokenised action submissions per IP.
  if (!rateLimit(rateLimitKey('workflow-token', clientIp(request.headers)), RATE_LIMITS.WORKFLOW_TOKEN).allowed) {
    return reissueResultPage('error', 'Too many requests', 'Too many attempts. Please wait a minute and try again.', 'محاولات كثيرة جدًا. يرجى الانتظار دقيقة والمحاولة مرة أخرى.', 429)
  }

  const form = await readActionPost(request)
  const token = form.token
  if (!token) {
    return reissueResultPage('error', 'Missing token', 'This reissue request is incomplete.', 'طلب إعادة الإصدار غير مكتمل.', 400)
  }

  const result = verifyJwt(token)
  if (!result.ok) {
    return reissueResultPage('error', 'Invalid link', 'This approval link could not be verified.', 'تعذر التحقق من رابط الموافقة.', 401)
  }

  const { payload } = result
  if (payload.act === 'DELEGATE') {
    return handleDelegatePost(request, payload, token, form)
  }

  if (payload.exp >= Math.floor(Date.now() / 1000)) {
    return reissueResultPage('error', 'Link still active', 'This approval link has not expired yet. Please use the original email link.', 'لم تنته صلاحية رابط الموافقة بعد. يرجى استخدام الرابط الأصلي.', 400)
  }

  const ctx = await loadActionLinkContext(payload, request.nextUrl.origin)
  if (!ctx) {
    return reissueResultPage('error', 'Invalid link', 'This approval link is not linked to an active workflow request.', 'هذا الرابط غير مرتبط بطلب سير عمل نشط.', 401)
  }

  const eligibility = reissueEligibility(ctx)
  if (!eligibility.ok) {
    return reissueResultPage('error', 'Link cannot be reissued', eligibility.reason, 'لا يمكن إصدار رابط جديد لهذا الطلب. يرجى فتح الطلب في أفانيس.', 409)
  }

  const recipientEmail = ctx.originalApproverEmail
  if (!recipientEmail) {
    return reissueResultPage('error', 'Email not found', 'No active email address is linked to the original approver.', 'لا يوجد بريد إلكتروني نشط مرتبط بالمعتمد الأصلي.', 409)
  }

  const policy = validateEmailDeliveryPolicy(recipientEmail)
  if (!policy.allowed) {
    await auditReissuePolicyRejection(ctx, policy)
    return reissueResultPage('error', 'Email not sent', 'The approver email is not allowed by the current email delivery policy.', 'لم يتم إرسال البريد لأن عنوان المعتمد غير مسموح به حسب سياسة الإرسال الحالية.', 403)
  }

  const providerRow = await getActiveProviderRow()
  const tokenExpiryMinutes = providerRow?.tokenExpiryMinutes ?? 2880
  const newExpiresAt = new Date(Date.now() + tokenExpiryMinutes * 60_000)
  const action = ctx.intendedAction
  if (!isReissueAction(action)) {
    return reissueResultPage('error', 'Unsupported action', 'Delegation links must be handled in AVANIIS.', 'يجب تنفيذ التفويض من داخل أفانيس.', 400)
  }

  const { jti, token: newToken } = signActionToken({
    instanceId: ctx.instanceId,
    stepInstanceId: ctx.stepInstanceId,
    personId: ctx.originalApproverPersonId,
    action,
    expiresAt: newExpiresAt,
  })
  const actionUrl = `${request.nextUrl.origin}/api/workflow/action?token=${newToken}`
  const message = buildReissueEmail(ctx, action, actionUrl, newExpiresAt)

  const outcome = await db.transaction(async (tx) => {
    const since = new Date(Date.now() - REISSUE_WINDOW_MS)
    const recent = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.eventType, REISSUE_AUDIT_EVENT),
        eq(auditLog.resourceType, 'workflow_instances_v2'),
        eq(auditLog.resourceId, ctx.instanceId),
        gte(auditLog.eventTime, since),
      ))
      .limit(REISSUE_LIMIT_PER_DAY)

    if (recent.length >= REISSUE_LIMIT_PER_DAY) {
      await writeAuditLog({
        actorId: ctx.originalApproverPersonId,
        actorName: ctx.originalApprover,
        actorRole: 'MANAGER',
        channel: 'SYSTEM',
        eventType: REISSUE_RATE_LIMIT_AUDIT_EVENT,
        resourceType: 'workflow_instances_v2',
        resourceId: ctx.instanceId,
        metadata: {
          stepInstanceId: ctx.stepInstanceId,
          originalJti: payload.jti,
          limit: REISSUE_LIMIT_PER_DAY,
          windowHours: 24,
        },
      }, tx)
      return { ok: false as const, reason: 'RATE_LIMITED' as const }
    }

    await tx.insert(workflowEmailTokens).values({
      jti,
      tenantId: TENANT_ID,
      instanceId: ctx.instanceId,
      stepInstanceId: ctx.stepInstanceId,
      intendedAction: action,
      issuedToPersonId: ctx.originalApproverPersonId,
      expiresAt: newExpiresAt,
      createdAt: new Date(),
    })

    const [emailMessage] = await tx.insert(emailMessages).values({
      tenantId: TENANT_ID,
      module: 'workflow',
      recipientEmail,
      recipientPersonId: ctx.originalApproverPersonId,
      senderEmail: providerRow?.providerType === 'SMTP' ? providerRow.smtpSenderEmail : providerRow?.graphSenderMailbox,
      subject: message.subject,
      status: 'QUEUED',
      businessObjectType: 'workflow_instances_v2',
      businessObjectId: ctx.instanceId,
      workflowRequestId: ctx.instanceId,
      workflowStepId: ctx.stepInstanceId,
      payloadJson: {
        html: message.html,
        recipientName: ctx.originalApprover,
        reissuedFromJti: payload.jti,
        reissuedToJti: jti,
      },
      createdBy: ctx.originalApproverPersonId,
      createdByName: ctx.originalApprover,
    }).returning({ id: emailMessages.id })

    if (emailMessage) {
      await tx.insert(emailDeliveryEvents).values({
        tenantId: TENANT_ID,
        emailMessageId: emailMessage.id,
        eventType: 'QUEUED',
        eventPayload: {
          source: 'workflowActionReissue',
          workflowRequestId: ctx.instanceId,
          workflowStepId: ctx.stepInstanceId,
        },
      })
    }

    await writeAuditLog({
      actorId: ctx.originalApproverPersonId,
      actorName: ctx.originalApprover,
      actorRole: 'MANAGER',
      channel: providerRow?.providerType === 'SMTP' ? 'EMAIL_SMTP' : 'EMAIL_GRAPH',
      eventType: REISSUE_AUDIT_EVENT,
      resourceType: 'workflow_instances_v2',
      resourceId: ctx.instanceId,
      metadata: {
        stepInstanceId: ctx.stepInstanceId,
        oldJti: payload.jti,
        newJti: jti,
        emailMessageId: emailMessage?.id ?? null,
        intendedAction: action,
        newExpiresAt: newExpiresAt.toISOString(),
        oldTokenRemainsExpired: true,
      },
    }, tx)

    return { ok: true as const }
  })

  if (!outcome.ok) {
    return reissueResultPage('error', 'Reissue limit reached', 'You can request up to 3 new links per request per day. Please open AVANIIS or contact HR.', 'يمكنك طلب ثلاثة روابط جديدة فقط لكل طلب في اليوم. يرجى فتح أفانيس أو التواصل مع الموارد البشرية.', 429)
  }

  return reissueResultPage('success', 'New link sent', 'A fresh approval link has been sent to the original approver email address.', 'تم إرسال رابط موافقة جديد إلى بريد المعتمد الأصلي.', 200)
}

// ── Branded confirmation page (self-contained; no auth required) ──────────────
function page(kind: 'success' | 'error', title: string, message: string, status: number): NextResponse {
  const accent = kind === 'success' ? '#2E6170' : '#9B2C2C'
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#F6F8F9;color:#1F2A2E;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  @media (prefers-color-scheme:dark){body{background:#0E1517;color:#E7EDEF}.card{background:#16211F!important;border-color:#26312F!important}}
  .card{background:#fff;border:1px solid #E3E8EA;border-radius:14px;max-width:440px;width:90%;
        padding:32px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.06)}
  .badge{width:56px;height:56px;border-radius:50%;background:${accent};margin:0 auto 18px;
         display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:700}
  h1{font-size:20px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:#5B6B70;margin:0}
  .brand{margin-top:22px;font-size:12px;color:#8A989C}
</style></head><body>
  <div class="card">
    <div class="badge">${kind === 'success' ? '✓' : '!'}</div>
    <h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
    <div class="brand">AVANIIS HR</div>
  </div></body></html>`
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // EPRC-01 B2 (RATE-01): throttle tokenised approval-link hits per IP to limit
  // token brute-force / replay attempts on this public surface.
  if (!rateLimit(rateLimitKey('workflow-token', clientIp(request.headers)), RATE_LIMITS.WORKFLOW_TOKEN).allowed) {
    return page('error', 'Too many requests', 'Too many attempts. Please wait a minute and try again.', 429)
  }

  const token = request.nextUrl.searchParams.get('token')
  if (!token) return page('error', 'Missing token', 'This approval link is incomplete.', 400)

  const result = verifyJwt(token)
  if (!result.ok) return page('error', 'Invalid link', 'This approval link could not be verified.', 401)

  const { payload } = result
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    const expiredContext = await loadActionLinkContext(payload, request.nextUrl.origin)
    if (expiredContext) return expiredTokenPage(expiredContext, token)
    return page('error', 'Link expired', 'This approval link has expired. Please action the request in the app.', 400)
  }

  if (payload.act === 'DELEGATE') {
    const delegateContext = await loadActionLinkContext(payload, request.nextUrl.origin)
    if (!delegateContext) return page('error', 'Invalid link', 'This delegation link could not be verified.', 401)
    return delegateSelectionPage(delegateContext, token)
  }

  // Atomically claim the token — only succeeds when usedAt IS NULL (single-use).
  const record = await claimWorkflowEmailToken(
    payload.jti,
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
  )

  if (!record) {
    const alreadyActioned = await loadAlreadyActionedContext(payload, request.nextUrl.origin)
    if (alreadyActioned) return alreadyActionedPage(alreadyActioned)
    return page('error', 'Already actioned', 'This link has already been used or is no longer valid.', 409)
  }
  if (!tokenRecordMatchesPayload(record, payload)) {
    return page('error', 'Invalid link', 'This approval link does not match the workflow token record.', 401)
  }

  const actionResult = await takeWorkflowAction({
    stepInstanceId: record.stepInstanceId,
    actorPersonId:  payload.sub,
    decision:       payload.act,
    ipAddress:      record.ipAddress ?? undefined,
    userAgent:      request.headers.get('user-agent') ?? undefined,
  })

  // Provider-aware audit channel (Section 8): EMAIL_GRAPH / EMAIL_SMTP.
  try {
    const providerRow = await getActiveProviderRow()
    const channel = providerRow?.providerType === 'SMTP' ? 'EMAIL_SMTP' : 'EMAIL_GRAPH'
    const [actor] = await db.select({ name: persons.fullNameEn })
      .from(persons).where(eq(persons.id, payload.sub)).limit(1)
    await writeAuditLog({
      actorId: payload.sub,
      actorName: actor?.name ?? payload.sub,
      actorRole: 'MANAGER',
      channel,
      eventType: actionResult.success
        ? `WORKFLOW.EMAIL_${payload.act}`
        : 'WORKFLOW.EMAIL_ACTION_REJECTED',
      resourceType: 'workflow_instances_v2',
      resourceId: payload.inst,
      metadata: { stepInstanceId: record.stepInstanceId, action: payload.act, success: actionResult.success, reason: actionResult.error },
    })
  } catch (err) {
    console.error('[workflow/action] audit failed (non-fatal):', err instanceof Error ? err.message : err)
  }

  if (!actionResult.success) {
    if (isAlreadyActionedError(actionResult.error)) {
      const alreadyActioned = await loadAlreadyActionedContext(payload, request.nextUrl.origin)
      if (alreadyActioned) return alreadyActionedPage(alreadyActioned)
    }
    return page('error', 'Could not complete', actionResult.error ?? 'This request can no longer be actioned.', 422)
  }

  const verb = payload.act === 'APPROVE' ? 'approved' : payload.act === 'REJECT' ? 'rejected' : 'actioned'
  return page('success', `Request ${verb}`, `You have successfully ${verb} this request. You may close this window.`, 200)
}
