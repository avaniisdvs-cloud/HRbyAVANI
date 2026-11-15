/**
 * W1 — Critical Authorization + PII Exposure — abuse/negative tests.
 * W1-001–020.
 *
 * Two layers:
 *  1. BEHAVIORAL — sendAriaMessage (P3-A1): a forged client sessionCtx must NOT
 *     reach the intent handler; identity is re-derived from the session.
 *  2. SOURCE-CONTRACT — assert each fixed action/route actually invokes the
 *     authorization guard (forged personId / legalEntityId / role / unauth).
 *     Source inspection is the established regression pattern in this repo for
 *     server actions whose full integration requires a live DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// ── 1. BEHAVIORAL — P3-A1 ARIA identity re-derivation ───────────────────────

const SESSION = {
  user: { id: 'U-SESSION', name: 'Real User', email: 'r@x.com', role: 'EMPLOYEE', legalEntityId: 'E-SESSION', personId: 'P-SESSION' },
}
const authMock = vi.fn(async () => SESSION)
const handleIntentMock = vi.fn(async () => ({ message: 'ok', intentCode: null, dataSource: null, language: 'en' }))
const classifyIntentMock = vi.fn(async () => ({ intent: 'LEAVE_BALANCE', language: 'en', confidence: 1, entities: {} }))

vi.mock('@/lib/auth', () => ({
  auth: authMock,
  requireRole: vi.fn(async () => SESSION.user),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(async () => {}) }))
vi.mock('@/lib/db', () => ({ db: { transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})) } }))
vi.mock('@/lib/app-error', () => ({ translateError: (e: unknown) => { throw e } }))
vi.mock('@/modules/aria/services', () => ({
  classifyIntent: classifyIntentMock,
  handleIntent:   handleIntentMock,
}))

const { sendAriaMessage } = await import('@/modules/aria/actions')

beforeEach(() => { vi.clearAllMocks() })

describe('P3-A1 — sendAriaMessage re-derives identity (forged sessionCtx is inert)', () => {
  it('W1-001 passes SESSION identity to handleIntent, ignoring a forged ctx', async () => {
    await sendAriaMessage(
      'what is my leave balance',
      // forged client context — attacker claims to be a victim HR_ADMIN
      { personId: 'P-VICTIM', role: 'HR_ADMIN', legalEntityId: 'E-VICTIM', language: 'en' } as never,
      [],
    )
    expect(handleIntentMock).toHaveBeenCalledTimes(1)
    const ctxArg = (handleIntentMock.mock.calls[0] as unknown[])[3] as { personId: string; role: string; legalEntityId: string }
    expect(ctxArg.personId).toBe('P-SESSION')
    expect(ctxArg.role).toBe('EMPLOYEE')
    expect(ctxArg.legalEntityId).toBe('E-SESSION')
    // forged values must NOT survive
    expect(ctxArg.personId).not.toBe('P-VICTIM')
    expect(ctxArg.role).not.toBe('HR_ADMIN')
  })

  it('W1-002 preserves client display/preference fields (language) from ctx', async () => {
    await sendAriaMessage('balance', { personId: 'X', role: 'X', legalEntityId: 'X', language: 'ar' } as never, [])
    const ctxArg = (handleIntentMock.mock.calls[0] as unknown[])[3] as { language: string }
    expect(ctxArg.language).toBe('ar')
  })
})

// ── 2. SOURCE-CONTRACT regression locks ─────────────────────────────────────

describe('P3-A1 — ARIA actions source contract', () => {
  const src = read('modules/aria/actions.ts')
  it('W1-003 builds a safeCtx from session.user (not the client ctx)', () => {
    expect(src).toMatch(/const safeCtx[\s\S]*personId:\s*session\.user\.personId/)
    expect(src).toMatch(/role:\s*session\.user\.role/)
    expect(src).toMatch(/legalEntityId:\s*session\.user\.legalEntityId/)
  })
  it('W1-004 dispatches handleIntent + submit with safeCtx, not sessionCtx', () => {
    expect(src).toMatch(/handleIntent\([\s\S]*?safeCtx/)
    expect(src).toMatch(/submitConfirmedLeaveRequest\(pendingDraft,\s*safeCtx\)/)
  })
})

describe('P3-A2 — ARIA cross-employee leave-status gate', () => {
  const src = read('modules/aria/services.ts')
  it('W1-005 gates target_person_id lookups with assertSelfOrTeam', () => {
    expect(src).toMatch(/assertSelfOrTeam/)
    expect(src).toMatch(/found\.id !== ctx\.personId/)
  })
})

describe('P3-A3 — ARIA OS actions require an OS role', () => {
  const src = read('modules/aria/os-actions.ts')
  it('W1-006 defines OS_ROLES without EMPLOYEE', () => {
    expect(src).toMatch(/OS_ROLES[^=]*=\s*\[[^\]]*'HR_ADMIN'[^\]]*\]/)
    expect(src).not.toMatch(/OS_ROLES[^=]*=\s*\[[^\]]*'EMPLOYEE'[^\]]*\]/)
  })
  it('W1-007 getExpiryAlerts requires a role AND entity-scopes non-SUPER_ADMIN', () => {
    const fn = src.slice(src.indexOf('export async function getExpiryAlerts'), src.indexOf('export async function getPeopleStats'))
    expect(fn).toMatch(/requireRole\(OS_ROLES\)/)
    expect(fn).toMatch(/user\.role !== 'SUPER_ADMIN'[\s\S]*legalEntityId/)
  })
  it('W1-008 getPeopleStats / getComplianceData / getKnowledgeSources require a role', () => {
    for (const name of ['getPeopleStats', 'getComplianceData', 'getKnowledgeSources']) {
      const i = src.indexOf(`export async function ${name}`)
      expect(i, name).toBeGreaterThan(-1)
      expect(src.slice(i, i + 400), name).toMatch(/requireRole\(OS_ROLES\)/)
    }
  })
})

describe('P3-A5 / P3-A4 / P3-M — employee-letters source contract', () => {
  const src = read('modules/employee-letters/actions.ts')
  it('W1-009 requestLetter binds EMPLOYEE to the session personId', () => {
    expect(src).toMatch(/let subjectPersonId = input\.personId/)
    expect(src).toMatch(/session\.role === 'EMPLOYEE'[\s\S]*subjectPersonId = session\.personId/)
  })
  it('W1-010 requestLetter never persists the client personId once bound', () => {
    const fn = src.slice(src.indexOf('export async function requestLetter'))
    // both the resolve ctx and the insert use subjectPersonId, not input.personId
    expect(fn).toMatch(/personId:\s*subjectPersonId/)
    expect(fn).not.toMatch(/personId:\s*input\.personId/)
  })
  it('W1-011 requestLetter entity-scopes the subject (assertSameEntity)', () => {
    expect(src).toMatch(/assertSameEntity\(session, person\.legalEntityId\)/)
  })
  it('W1-012 completeLetterSigning is fail-closed (exact personId match)', () => {
    expect(src).toMatch(/session\.personId !== letter\.personId/)
    // the bypass-prone "&& session.personId &&" guard is gone
    expect(src).not.toMatch(/sessionPerson && session\.personId && session\.personId !== letter\.personId/)
  })
  it('W1-013 sendLetterEmailAction has no hardcoded fallback email and fails on no work email', () => {
    expect(src).not.toMatch(/FALLBACK_EMAIL/)
    expect(src).not.toMatch(/d\.kethari@avaniis\.example/)
    const fn = src.slice(src.indexOf('export async function sendLetterEmailAction'), src.indexOf('export async function', src.indexOf('export async function sendLetterEmailAction') + 1))
    expect(fn).toMatch(/no work email/i)
  })
})

describe('P3-A6 / P3-A7 — insurance source contract', () => {
  const src = read('modules/insurance/actions.ts')
  it('W1-014 read actions IDOR-gate EMPLOYEE/MANAGER with assertSelfOrTeam', () => {
    for (const name of ['getPersonEnrolments', 'getActiveEnrolment']) {
      const i = src.indexOf(`export async function ${name}`)
      const fn = src.slice(i, i + 600)
      expect(fn, name).toMatch(/role === 'EMPLOYEE' \|\| user\.role === 'MANAGER'/)
      expect(fn, name).toMatch(/assertSelfOrTeam/)
    }
  })
  it('W1-015 enrol/cancel/extend/card/contractor assert same-entity', () => {
    for (const name of ['enrolEmployee', 'enrolDependent', 'grantContractorInsuranceException', 'cancelEnrolment', 'extendEnrolmentExpiry', 'updateEnrolmentCard']) {
      const i = src.indexOf(`export async function ${name}`)
      const next = src.indexOf('export async function', i + 1)
      const fn = src.slice(i, next === -1 ? undefined : next)
      expect(fn, name).toMatch(/assertSameEntity/)
    }
  })
})

describe('P3-D1 — DataOps read routes are SUPER_ADMIN-gated in-handler', () => {
  const routes = [
    'app/api/dataops/execute/route.ts',
    'app/api/dataops/nl2sql/route.ts',
    'app/api/dataops/schema/route.ts',
    'app/api/dataops/audit/route.ts',
    'app/api/dataops/saved-queries/route.ts',
    'app/api/dataops/tables/[schema]/[table]/rows/route.ts',
  ]
  it('W1-016 every read route rejects non-SUPER_ADMIN with 403', () => {
    for (const r of routes) {
      const src = read(r)
      expect(src, r).toMatch(/user\.role !== 'SUPER_ADMIN'[\s\S]*?status:\s*403/)
    }
  })
  it('W1-017 saved-queries gates BOTH GET and POST', () => {
    const src = read('app/api/dataops/saved-queries/route.ts')
    const matches = src.match(/user\.role !== 'SUPER_ADMIN'/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe('P3-L-BRIEFING-NOGATE — generateDailyBriefing requires a role', () => {
  const src = read('modules/aria/actions.ts')
  it('W1-018 generateDailyBriefing calls requireRole before resolving the provider/key', () => {
    const fn = src.slice(src.indexOf('export async function generateDailyBriefing'))
    expect(fn).toMatch(/requireRole\(\[[^\]]*'HR_ADMIN'/)
    // Provider/key now resolved via loadAriaRuntimeConfig (provider-independent
    // layer). The security property is unchanged: role check runs first.
    expect(fn.indexOf('requireRole')).toBeLessThan(fn.indexOf('loadAriaRuntimeConfig'))
  })
})
