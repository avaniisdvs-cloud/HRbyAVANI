/**
 * Email approval action tokens for the communication platform.
 *
 * Mirrors lib/workflow-engine.ts issueEmailToken (HS256 JWT, same WORKFLOW_JWT_SECRET)
 * and persists into the EXISTING workflow_email_tokens table so the already-wired
 * /api/workflow/action route can verify + single-use claim them. This avoids a
 * second, divergent token system while still letting the email layer mint the
 * APPROVE, REJECT, and DELEGATE links a manager email needs.
 *
 * Security (Section 8): signed (HMAC), single-use (used_at atomic claim in the
 * route), time-bound (exp), nonce (jti = 32 random bytes). Wrong approver / already
 * completed / reassigned steps are rejected by takeWorkflowAction downstream.
 */
import 'server-only'
import { createHmac, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { workflowEmailTokens } from '@/drizzle/schema/workflow-engine'
import type { DbOrTx } from '@/lib/db'

type ActionType = 'APPROVE' | 'REJECT' | 'DELEGATE'

function signToken(params: {
  instanceId: string
  stepInstanceId: string
  personId: string
  action: ActionType
  expiresAt: Date
}): { jti: string; token: string } {
  const secret = process.env.WORKFLOW_JWT_SECRET
  if (!secret) throw new Error('WORKFLOW_JWT_SECRET env var is required')
  const jti = randomBytes(32).toString('hex')
  const payload = {
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

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://hr.avaniis.ae'
}

export interface ActionLinks {
  approveUrl: string
  rejectUrl: string
  delegateUrl: string
}

/** Issue + persist APPROVE, REJECT, and DELEGATE tokens for a step; return clickable URLs. */
export async function issueApprovalLinks(params: {
  instanceId: string
  stepInstanceId: string
  approverPersonId: string
  expiresAt: Date
  exec?: DbOrTx
}): Promise<ActionLinks> {
  if (!params.exec) {
    return db.transaction(async (tx) => issueApprovalLinks({ ...params, exec: tx as DbOrTx }))
  }

  const exec = params.exec
  const base = appBaseUrl()
  const out: Partial<ActionLinks> = {}

  for (const action of ['APPROVE', 'REJECT', 'DELEGATE'] as ActionType[]) {
    const { jti, token } = signToken({
      instanceId: params.instanceId,
      stepInstanceId: params.stepInstanceId,
      personId: params.approverPersonId,
      action,
      expiresAt: params.expiresAt,
    })
    await exec.insert(workflowEmailTokens).values({
      jti,
      tenantId: TENANT_ID,
      instanceId: params.instanceId,
      stepInstanceId: params.stepInstanceId,
      intendedAction: action,
      issuedToPersonId: params.approverPersonId,
      expiresAt: params.expiresAt,
      createdAt: new Date(),
    })
    const url = `${base}/api/workflow/action?token=${token}`
    if (action === 'APPROVE') out.approveUrl = url
    else if (action === 'REJECT') out.rejectUrl = url
    else out.delegateUrl = url
  }
  return out as ActionLinks
}
