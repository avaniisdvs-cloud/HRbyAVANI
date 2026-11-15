// @vitest-environment node
/**
 * CHAOS-008a — ARIA AI provider failure resilience tests
 * CHAOS-008d — ARIA AI rate-limit and malformed-response handling
 *
 * These tests simulate external Anthropic API failures by mocking the SDK
 * at the services layer and verifying the application error-handling branches:
 *
 *   008a: provider connectivity failures (endpoint down, invalid key)
 *   008d: 429 rate-limit, malformed/empty AI response
 *
 * Pass criteria (from chaos-plan.md):
 *   008a — ARIA returns a safe AriaResponse; no crash; no credential leakage
 *   008d — Structured response with rate-limit message; retryAfter > 0; no throw
 *
 * Execution: pnpm vitest run tests/integration/aria-resilience.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LlmError } from '@/lib/aria/llm'

// ── Shared DB proxy mock (mirrors aria-tests.test.ts pattern) ───────────────

let queryQueue: unknown[][] = []
let callIndex = 0

const auditSpy = vi.fn()

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve, reject)
      }
      return () => makeProxy()
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: Record<string, any> = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(),
  update:      vi.fn(),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb)),
}

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/db',        () => ({ db: mockDb }))
vi.mock('@/lib/audit',     () => ({ writeAuditLog: auditSpy }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-test-001' }))
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id:            'usr-chaos-001',
      name:          'Chaos Test User',
      email:         'chaos@avaniis.dev',
      role:          'HR_ADMIN',
      legalEntityId: '11111111-1111-1111-1111-111111111111',
      personId:      'person-chaos-001',
    },
  }),
}))

vi.mock('drizzle-orm', () => ({
  eq:        vi.fn((_col: unknown, _val: unknown) => ({ type: 'eq' })),
  and:       vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  relations: () => ({}),
}))

vi.mock('@/drizzle/schema', () => ({
  events:           {},
  absenceBalances:  {},
  absenceTypes:     {},
  workerAssignments: { tenantId: 'tenantId', personId: 'personId', isCurrent: 'isCurrent' },
  persons:          {},
  departments:      {},
  positions:        {},
}))

vi.mock('@/drizzle/schema/workflow-engine', () => ({
  workflowInstancesV2:  {},
  workflowStepInstances: {},
}))

vi.mock('@/drizzle/schema/configuration', () => ({
  ariaAgentConfig:    {},
  ariaModelConfig:    {},
  ariaBehaviourConfig: {},
}))

// ── Provider-neutral LlmError factory helpers ────────────────────────────────
// The provider layer (lib/aria/llm) normalises every vendor SDK error into
// LlmError{kind}. Business code (sendAriaMessage) only ever sees LlmError, so
// these tests inject neutral errors regardless of which provider is active.

function makeRateLimitError(retryAfter = 60): LlmError {
  return new LlmError('rate_limit', 'rate limit exceeded', { provider: 'anthropic', status: 429, retryAfterSec: retryAfter })
}

function makeConnectionError(): LlmError {
  return new LlmError('connection', 'connect ECONNREFUSED 127.0.0.1:9999', { provider: 'anthropic' })
}

function makeAuthError(): LlmError {
  return new LlmError('auth', 'invalid x-api-key', { provider: 'anthropic', status: 401 })
}

// ── Session context for all tests ────────────────────────────────────────────

const SESSION_CTX = {
  personId:      'person-chaos-001',
  role:          'HR_ADMIN',
  legalEntityId: '11111111-1111-1111-1111-111111111111',
  language:      'en' as const,
  userName:      'Chaos Test User',
}

// ── classifyIntent service-level mock (avoids actual Anthropic calls) ─────────

const classifyIntentMock = vi.fn()
const handleIntentMock   = vi.fn()

vi.mock('@/modules/aria/services', () => ({
  classifyIntent: (...args: unknown[]) => classifyIntentMock(...args),
  handleIntent:   (...args: unknown[]) => handleIntentMock(...args),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CHAOS-008a — ARIA provider connectivity failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryQueue = []
    callIndex  = 0

    // Default handleIntent mock — returns a valid AriaResponse
    handleIntentMock.mockResolvedValue({
      message:    'Test response',
      intentCode: null,
      dataSource: null,
      language:   'en',
    })
  })

  // C8A-001 — APIConnectionError is converted to safe AriaResponse (no throw)
  it('C8A-001: APIConnectionError → returns safe AriaResponse, does NOT throw', async () => {
    classifyIntentMock.mockRejectedValue(makeConnectionError())

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('show headcount', SESSION_CTX, [])

    expect(result).toBeDefined()
    expect(result.message).toBeTruthy()
    expect(result.intentCode).toBeNull()
    expect(result.dataSource).toBeNull()
    expect(result.language).toBe('en')
  })

  // C8A-002 — AuthenticationError (invalid API key) → safe AriaResponse, no throw
  it('C8A-002: AuthenticationError (invalid API key) → returns safe AriaResponse', async () => {
    classifyIntentMock.mockRejectedValue(makeAuthError())

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('show headcount', SESSION_CTX, [])

    expect(result).toBeDefined()
    expect(result.message).toBeTruthy()
    // Message must NOT contain raw SDK error text or credential hints
    expect(result.message).not.toMatch(/x-api-key|api_key|authentication_error/i)
    expect(result.intentCode).toBeNull()
  })

  // C8A-003 — ARIA_NOT_CONFIGURED → safe AriaResponse, no throw
  it('C8A-003: ARIA_NOT_CONFIGURED → returns safe AriaResponse with admin guidance', async () => {
    classifyIntentMock.mockRejectedValue(new Error('ARIA_NOT_CONFIGURED'))

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('show headcount', SESSION_CTX, [])

    expect(result).toBeDefined()
    expect(result.message).toBeTruthy()
    // No raw env-var name should leak in the response
    expect(result.message).not.toMatch(/ARIA_API_KEY|process\.env/i)
    expect(result.intentCode).toBeNull()
  })

  // C8A-004 — Arabic session context → bilingual error message returned
  it('C8A-004: Arabic session context returns Arabic error message on connectivity failure', async () => {
    classifyIntentMock.mockRejectedValue(makeConnectionError())

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('أظهر بيانات الموارد البشرية', { ...SESSION_CTX, language: 'ar' }, [])

    expect(result.language).toBe('ar')
    expect(result.message).toBeTruthy()
    // Arabic error messages contain Arabic script
    expect(result.message).toMatch(/[؀-ۿ]/)
  })

  // C8A-005 — HR data stays intact: person record query never runs when ARIA fails
  it('C8A-005: DB select is never called when AI provider fails before intent routing', async () => {
    classifyIntentMock.mockRejectedValue(makeConnectionError())
    const selectSpy = vi.spyOn(mockDb, 'select')

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    await sendAriaMessage('show headcount', SESSION_CTX, [])

    // The DB must not be queried for HR data on provider failure
    expect(selectSpy).not.toHaveBeenCalled()
  })
})

describe('CHAOS-008d — ARIA rate-limit and malformed response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryQueue = []
    callIndex  = 0
  })

  // C8D-001 — RateLimitError → AriaResponse with retry message, no throw
  it('C8D-001: RateLimitError → returns AriaResponse (does NOT throw)', async () => {
    classifyIntentMock.mockRejectedValue(makeRateLimitError(45))

    const { sendAriaMessage } = await import('@/modules/aria/actions')

    // Must not throw — should return AriaResponse
    await expect(sendAriaMessage('test message', SESSION_CTX, [])).resolves.toBeDefined()
  })

  // C8D-002 — Rate-limit response has safe message with no raw error details
  it('C8D-002: RateLimitError response message is user-friendly, no raw SDK details', async () => {
    classifyIntentMock.mockRejectedValue(makeRateLimitError(30))

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('test message', SESSION_CTX, [])

    expect(result.message).toBeTruthy()
    // No raw error types or SDK internals in the message
    expect(result.message).not.toMatch(/rate_limit_error|RateLimitError|429/i)
    // Must mention retry or unavailable
    expect(result.message).toMatch(/unavailable|try again|demand|moment/i)
    expect(result.intentCode).toBeNull()
    expect(result.dataSource).toBeNull()
  })

  // C8D-003 — RateLimitError with default headers (no retry-after) handled safely
  it('C8D-003: RateLimitError with no retry-after header falls back to safe default', async () => {
    // Simulate rate limit error without a retry-after value
    const err = new LlmError('rate_limit', 'rate limit exceeded', { provider: 'anthropic', status: 429 })
    classifyIntentMock.mockRejectedValue(err)

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('test message', SESSION_CTX, [])

    // Must still return a valid AriaResponse (not throw)
    expect(result).toBeDefined()
    expect(result.message).toBeTruthy()
    expect(result.intentCode).toBeNull()
  })

  // C8D-004 — Malformed (null) AI response is handled gracefully
  it('C8D-004: Malformed null intent result still produces valid AriaResponse via handleIntent', async () => {
    // classifyIntent succeeds but returns null intent
    classifyIntentMock.mockResolvedValue({
      intent:     null,
      language:   'en',
      confidence: 0,
      entities:   {},
    })
    // handleIntent returns a free-text response (ARIA answers freely on null intent)
    handleIntentMock.mockResolvedValue({
      message:    'I\'m here to help with HR enquiries.',
      intentCode: null,
      dataSource: null,
      language:   'en',
    })

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('hello', SESSION_CTX, [])

    expect(result.message).toBeTruthy()
    expect(result.intentCode).toBeNull()
  })

  // C8D-005 — No credential leakage in any error path
  it('C8D-005: No API key or connection string leaks in any error response', async () => {
    const errors = [
      makeRateLimitError(),
      makeConnectionError(),
      makeAuthError(),
      new Error('ARIA_NOT_CONFIGURED'),
    ]

    const { sendAriaMessage } = await import('@/modules/aria/actions')

    for (const err of errors) {
      classifyIntentMock.mockRejectedValueOnce(err)
      let resultMsg = ''
      try {
        const result = await sendAriaMessage('test', SESSION_CTX, [])
        resultMsg = result.message
      } catch (appErr) {
        // If it throws an AppError, check the message
        if (appErr instanceof Error) resultMsg = appErr.message
      }
      // Credential patterns must never appear in user-facing messages
      expect(resultMsg).not.toMatch(/sk-ant-|api[_-]key|ANTHROPIC|anthropic_api_key/i)
      expect(resultMsg).not.toMatch(/connection[_-]string|azure[_-]storage|AZURE_STORAGE/i)
    }
  })

  // C8D-006 — Mandatory failure auditing: a failure writes a success=false audit
  // row (no silent failures), and never queries HR data (no select).
  it('C8D-006: AI failure writes a failure audit (success=false), no HR data read', async () => {
    classifyIntentMock.mockRejectedValue(makeRateLimitError())
    const txSpy     = vi.spyOn(mockDb, 'transaction')
    const selectSpy = vi.spyOn(mockDb, 'select')
    auditSpy.mockClear()

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('show pending approvals', SESSION_CTX, [])

    // Returns a safe response (no throw) …
    expect(result.message).toBeTruthy()
    // … writes exactly the failure audit row (in a transaction) …
    expect(txSpy).toHaveBeenCalledTimes(1)
    expect(auditSpy).toHaveBeenCalledTimes(1)
    expect(auditSpy.mock.calls[0][0].newValues).toMatchObject({ success: false })
    // … and never touches HR data on a pre-intent failure.
    expect(selectSpy).not.toHaveBeenCalled()
  })
})

// ── Regression: generic / unexpected errors must degrade gracefully ──────────
// This is the exact failure that produced "Sorry, something went wrong. Please
// try again." for employee self-service queries: an error that is NOT one of the
// three caught SDK classes fell through to translateError() and was rethrown.
describe('ARIA error contract — unexpected errors never rethrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryQueue = []
    callIndex  = 0
  })

  // C8E-001 — a generic provider error (e.g. NotFound/BadRequest/unknown) MUST
  // return a safe AriaResponse, not throw.
  it('C8E-001: generic Error from classifyIntent → safe AriaResponse, does NOT throw', async () => {
    classifyIntentMock.mockRejectedValue(new Error('kaboom: unexpected provider failure'))

    const { sendAriaMessage } = await import('@/modules/aria/actions')

    const result = await sendAriaMessage('Who is my manager?', SESSION_CTX, [])
    expect(result).toBeDefined()
    expect(result.message).toBeTruthy()
    expect(result.intentCode).toBeNull()
    // Must surface the friendly fallback, never raw error text
    expect(result.message).not.toMatch(/kaboom/i)
    expect(result.message).toMatch(/trouble processing|try again|HR Admin/i)
  })

  // C8E-002 — generic error from handleIntent (post-classification) also degrades.
  it('C8E-002: generic Error from handleIntent → safe AriaResponse, does NOT throw', async () => {
    classifyIntentMock.mockResolvedValue({ intent: 'ORG_CHART_QUERY', language: 'en', confidence: 0.9, entities: {} })
    handleIntentMock.mockRejectedValue(new Error('drizzle exploded'))

    const { sendAriaMessage } = await import('@/modules/aria/actions')

    const result = await sendAriaMessage('Who is my manager?', SESSION_CTX, [])
    expect(result.message).toBeTruthy()
    expect(result.message).not.toMatch(/drizzle exploded/i)
    expect(result.intentCode).toBeNull()
  })

  // C8E-003 — Arabic fallback for unexpected errors.
  it('C8E-003: generic error in Arabic session → Arabic fallback message', async () => {
    classifyIntentMock.mockRejectedValue(new Error('boom'))

    const { sendAriaMessage } = await import('@/modules/aria/actions')
    const result = await sendAriaMessage('من هو مديري؟', { ...SESSION_CTX, language: 'ar' }, [])

    expect(result.language).toBe('ar')
    expect(result.message).toMatch(/[؀-ۿ]/)
  })
})
