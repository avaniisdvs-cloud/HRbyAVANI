import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  emailDeliveryPolicyMetadata,
  validateEmailDeliveryPolicy,
} from '@/modules/communication/delivery-policy'

function env(overrides: Record<string, string | undefined>) {
  return {
    DATABASE_ENV: 'uat',
    EMAIL_DELIVERY_MODE: 'allowlist',
    EMAIL_TEST_ALLOWLIST: 'tester@avaniis.example,@avaniis.dev,*.uat.example.com',
    ...overrides,
  }
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('communication allowlist delivery policy', () => {
  it('blocks email when delivery mode is disabled', () => {
    const result = validateEmailDeliveryPolicy('tester@avaniis.example', env({
      EMAIL_DELIVERY_MODE: 'disabled',
    }))

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toBe('EMAIL_DELIVERY_DISABLED')
      expect(result.error).toBe('Email delivery is disabled.')
    }
  })

  it('allows exact, domain, and wildcard allowlist matches', () => {
    expect(validateEmailDeliveryPolicy('tester@avaniis.example', env({})).allowed).toBe(true)
    expect(validateEmailDeliveryPolicy('employee@avaniis.dev', env({})).allowed).toBe(true)
    expect(validateEmailDeliveryPolicy('approver@pilot.uat.example.com', env({})).allowed).toBe(true)
  })

  it('rejects recipients outside EMAIL_TEST_ALLOWLIST', () => {
    const result = validateEmailDeliveryPolicy('employee@outside.example', env({}))

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toBe('EMAIL_RECIPIENT_NOT_ALLOWLISTED')
      expect(result.error).toBe('Recipient is not in EMAIL_TEST_ALLOWLIST.')
    }
  })

  it('requires EMAIL_TEST_ALLOWLIST in allowlist mode', () => {
    const result = validateEmailDeliveryPolicy('tester@avaniis.example', env({
      EMAIL_TEST_ALLOWLIST: '',
    }))

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toBe('EMAIL_TEST_ALLOWLIST_REQUIRED')
    }
  })

  it('rejects live mode outside production DATABASE_ENV', () => {
    const result = validateEmailDeliveryPolicy('tester@avaniis.example', env({
      DATABASE_ENV: 'uat',
      EMAIL_DELIVERY_MODE: 'live',
    }))

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toBe('EMAIL_LIVE_MODE_REQUIRES_PRODUCTION_DATABASE_ENV')
    }
  })

  it('keeps local-part PII out of rejection audit metadata', () => {
    const result = validateEmailDeliveryPolicy('blocked.user@outside.example', env({}))
    const metadata = emailDeliveryPolicyMetadata('blocked.user@outside.example', result, 'queueEmail')

    expect(metadata.recipientDomain).toBe('outside.example')
    expect(JSON.stringify(metadata)).not.toContain('blocked.user')
  })
})

describe('communication allowlist enforcement wiring', () => {
  it('enforces policy before queue creation', () => {
    const src = read('modules/communication/orchestrator.ts')
    const workflowApprovalPolicyIndex = src.indexOf('const approvalEmailPolicy = validateEmailDeliveryPolicy(args.recipientEmail)')
    const workflowApprovalTokenIndex = src.indexOf('issueApprovalLinks({')

    expect(src).toContain('validateEmailDeliveryPolicy(args.recipientEmail)')
    expect(src).toContain('EMAIL_DELIVERY_REJECTION_EVENT')
    expect(src).toContain("'queueEmail'")
    expect(workflowApprovalPolicyIndex).toBeGreaterThan(-1)
    expect(workflowApprovalTokenIndex).toBeGreaterThan(workflowApprovalPolicyIndex)
  })

  it('enforces policy before dispatch and provider sends', () => {
    const src = read('modules/communication/email-service.ts')

    expect(src).toContain('validateEmailDeliveryPolicy(row.recipientEmail)')
    expect(src).toContain('validateEmailDeliveryPolicy(to)')
    expect(src).toContain('validateEmailDeliveryPolicy(args.to)')
    expect(src).toContain("status: 'CANCELLED'")
    expect(src).toContain('EMAIL_DELIVERY_REJECTION_EVENT')
  })

  it('enforces policy before test email actions update provider test status', () => {
    const src = read('modules/communication/actions.ts')
    const validationIndex = src.indexOf('validateEmailDeliveryPolicy(recipient)')
    const providerUpdateIndex = src.indexOf('lastTestStatus: result.ok')

    expect(validationIndex).toBeGreaterThan(-1)
    expect(providerUpdateIndex).toBeGreaterThan(-1)
    expect(validationIndex).toBeLessThan(providerUpdateIndex)
    expect(src).toContain("'sendTestEmailAction'")
  })

  it('lets cron routes reach their route-level CRON_SECRET guard', () => {
    const middleware = read('middleware.ts')
    const cronRoute = read('app/api/cron/email-dispatch/route.ts')

    expect(middleware).toContain("pathname.startsWith('/api/cron')")
    expect(cronRoute).toContain('process.env.CRON_SECRET')
    expect(cronRoute).toContain('Authorization')
    expect(cronRoute).toContain('dispatchBatch(50)')
  })

  it('keeps cron as a deployable fallback instead of the primary approval-email dispatcher', () => {
    const vercelConfig = JSON.parse(read('vercel.json')) as {
      crons?: { path?: string; schedule?: string }[]
    }
    const emailCron = vercelConfig.crons?.find((cron) => cron.path === '/api/cron/email-dispatch')

    expect(emailCron).toBeDefined()
    expect(emailCron?.schedule).toBe('0 6 * * *')
  })

  it('dispatches workflow approval emails immediately after queue commit', () => {
    const orchestrator = read('modules/communication/orchestrator.ts')
    const emailService = read('modules/communication/email-service.ts')
    const communicationIndex = read('modules/communication/index.ts')

    const queueInsertIndex = orchestrator.indexOf('await db.transaction(async (tx) =>')
    const immediateDispatchIndex = orchestrator.indexOf("args.dispatchStrategy === 'immediate'")

    expect(orchestrator).toContain('dispatchStrategy?:')
    expect(orchestrator).toContain('dispatchQueuedMessageById(messageId)')
    expect(orchestrator).toContain("dispatchStrategy: 'immediate'")
    expect(orchestrator).toContain('immediate email dispatch threw (queue row retained)')
    expect(queueInsertIndex).toBeGreaterThan(-1)
    expect(immediateDispatchIndex).toBeGreaterThan(queueInsertIndex)
    expect(emailService).toContain('export async function dispatchQueuedMessageById')
    expect(emailService).toContain('return dispatchQueued(row)')
    expect(emailService).toContain("eq(emailMessages.status, 'QUEUED')")
    expect(communicationIndex).toContain('dispatchQueuedMessageById')
  })

  it('lets workflow email action links reach route-level token validation', () => {
    const middleware = read('middleware.ts')
    const workflowActionRoute = read('app/api/workflow/action/route.ts')

    expect(middleware).toContain("pathname === '/api/workflow/action'")
    expect(workflowActionRoute).toContain('verifyJwt(token)')
    expect(workflowActionRoute).toContain('timingSafeEqual')
    expect(workflowActionRoute).toContain('isTokenPayload(parsedPayload)')
    expect(workflowActionRoute).toContain('tokenRecordMatchesPayload(record, payload)')
    expect(workflowActionRoute).toContain('escapeHtml(message)')
    expect(workflowActionRoute).toContain('workflowEmailTokens')
    expect(workflowActionRoute).toContain('isNull(workflowEmailTokens.usedAt)')
    expect(workflowActionRoute).toContain('takeWorkflowAction')
  })

  it('renders a friendly already-actioned replay page without weakening token claim', () => {
    const workflowActionRoute = read('app/api/workflow/action/route.ts')
    const claimIndex = workflowActionRoute.indexOf('isNull(workflowEmailTokens.usedAt)')
    const replayContextIndex = workflowActionRoute.indexOf('loadAlreadyActionedContext(payload, request.nextUrl.origin)')
    const replayPageIndex = workflowActionRoute.indexOf('alreadyActionedPage(alreadyActioned)')

    expect(claimIndex).toBeGreaterThan(-1)
    expect(replayContextIndex).toBeGreaterThan(claimIndex)
    expect(replayPageIndex).toBeGreaterThan(replayContextIndex)
    expect(workflowActionRoute).toContain('Request already actioned')
    expect(workflowActionRoute).toContain('Requester · مقدم الطلب')
    expect(workflowActionRoute).toContain('Request type · نوع الطلب')
    expect(workflowActionRoute).toContain('Action taken · الإجراء المتخذ')
    expect(workflowActionRoute).toContain('View in ${escapeHtml(branding.companyName)} · عرض في ${escapeHtml(branding.companyNameAr)}')
    expect(workflowActionRoute).toContain('isAlreadyActionedError(actionResult.error)')
    expect(workflowActionRoute).toContain('return new NextResponse(html, { status: 200')
  })

  it('renders expired-token UX and reissues only through the guarded email queue path', () => {
    const workflowActionRoute = read('app/api/workflow/action/route.ts')
    const deliveryPolicy = read('modules/communication/delivery-policy.ts')
    const communicationIndex = read('modules/communication/index.ts')

    const expiredCheckIndex = workflowActionRoute.indexOf('payload.exp < Math.floor(Date.now() / 1000)')
    const expiredContextIndex = workflowActionRoute.indexOf('loadActionLinkContext(payload, request.nextUrl.origin)', expiredCheckIndex)
    const expiredPageIndex = workflowActionRoute.indexOf('expiredTokenPage(expiredContext, token)')
    const postIndex = workflowActionRoute.indexOf('export async function POST')
    const policyIndex = workflowActionRoute.indexOf('validateEmailDeliveryPolicy(recipientEmail)')
    const queueIndex = workflowActionRoute.indexOf('tx.insert(emailMessages)')
    const tokenInsertIndex = workflowActionRoute.indexOf('tx.insert(workflowEmailTokens)')
    const auditIndex = workflowActionRoute.indexOf("eventType: REISSUE_AUDIT_EVENT")

    expect(expiredCheckIndex).toBeGreaterThan(-1)
    expect(expiredContextIndex).toBeGreaterThan(expiredCheckIndex)
    expect(expiredPageIndex).toBeGreaterThan(expiredContextIndex)
    expect(postIndex).toBeGreaterThan(-1)
    expect(workflowActionRoute).toContain('Approval link expired')
    expect(workflowActionRoute).toContain('Original approver · المعتمد الأصلي')
    expect(workflowActionRoute).toContain('Send me a new link · أرسل رابطاً جديداً')
    expect(workflowActionRoute).toContain("tokenRecord.issuedToPersonId !== payload.sub")
    expect(workflowActionRoute).toContain('tokenRecord.expiresAt.getTime()')
    expect(workflowActionRoute).toContain('intendedAction !== payload.act')
    expect(workflowActionRoute).toContain("ctx.stepStatus !== 'PENDING'")
    expect(policyIndex).toBeGreaterThan(postIndex)
    expect(queueIndex).toBeGreaterThan(policyIndex)
    expect(tokenInsertIndex).toBeGreaterThan(policyIndex)
    expect(auditIndex).toBeGreaterThan(tokenInsertIndex)
    expect(workflowActionRoute).toContain('REISSUE_LIMIT_PER_DAY = 3')
    expect(workflowActionRoute).toContain('oldTokenRemainsExpired: true')
    expect(workflowActionRoute).toContain('signActionToken({')
    expect(deliveryPolicy).toContain("'workflowActionReissue'")
    expect(communicationIndex).toContain('validateEmailDeliveryPolicy')
  })

  it('persists rich approval decision context without changing approval-token security', () => {
    const orchestrator = read('modules/communication/orchestrator.ts')
    const absenceActions = read('modules/absence/actions.ts')

    expect(orchestrator).toContain('decisionContext?: DecisionContext')
    expect(orchestrator).toContain('renderDecisionContextHtml(args.decisionContext)')
    expect(orchestrator).toContain('decisionContext: args.decisionContext')
    expect(orchestrator).toContain('vars: { ...args.vars, decisionContextHtml, actionButtons }')
    expect(orchestrator).toContain('issueApprovalLinks({')
    expect(absenceActions).toContain('buildLeaveDecisionContext({')
    expect(absenceActions).toContain('decisionContext: buildLeaveDecisionContext')
  })

  it('wires email delegate action through the same signed token and workflow action path', () => {
    const tokens = read('modules/communication/action-tokens.ts')
    const orchestrator = read('modules/communication/orchestrator.ts')
    const workflowActionRoute = read('app/api/workflow/action/route.ts')
    const deliveryPolicy = read('modules/communication/delivery-policy.ts')

    expect(tokens).toContain("type ActionType = 'APPROVE' | 'REJECT' | 'DELEGATE'")
    expect(tokens).toContain('delegateUrl: string')
    expect(tokens).toContain("['APPROVE', 'REJECT', 'DELEGATE']")
    expect(orchestrator).toContain('ctaButton(\'Delegate · تفويض\', links.delegateUrl, \'neutral\')')

    const getIndex = workflowActionRoute.indexOf('export async function GET')
    const delegateGetIndex = workflowActionRoute.indexOf("payload.act === 'DELEGATE'", getIndex)
    const claimIndex = workflowActionRoute.indexOf('claimWorkflowEmailToken(', delegateGetIndex)

    expect(delegateGetIndex).toBeGreaterThan(getIndex)
    expect(claimIndex).toBeGreaterThan(delegateGetIndex)
    expect(workflowActionRoute).toContain('return delegateSelectionPage(delegateContext, token)')
    expect(workflowActionRoute).toContain('function delegationEligibility(ctx: ActionLinkContext)')
    expect(workflowActionRoute).toContain('ctx.stepCanDelegate')
    expect(workflowActionRoute).toContain('resolveDelegateRecipient(delegateLookup, ctx)')
    expect(workflowActionRoute).toContain('validateEmailDeliveryPolicy(delegate.email)')
    expect(workflowActionRoute).toContain("decision:       'DELEGATE'")
    expect(workflowActionRoute).toContain('delegateToPersonId: delegate.id')
    expect(workflowActionRoute).toContain('invalidatePendingStepTokens(record.stepInstanceId')
    expect(workflowActionRoute).toContain('queueDelegatedWorkflowEmail(ctx, delegate, delegateReason)')
    expect(workflowActionRoute).toContain('queueWorkflowApprovalEmail({')
    expect(workflowActionRoute).toContain('EMAIL_DELEGATE_AUDIT_EVENT')
    expect(deliveryPolicy).toContain("'workflowEmailDelegate'")
  })
})
