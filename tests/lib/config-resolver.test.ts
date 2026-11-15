import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for lib/config-resolver.ts.
 * Guide requirement: "workflow routing rules applied correctly, leave rule priority correct."
 *
 * Strategy: a Proxy-based db mock that handles any Drizzle chain depth.
 * Every terminal call (.limit() or direct await) pops the next item from
 * queryQueue, letting each test control exactly what the DB returns.
 */

// ── Queue state (reset in each beforeEach) ────────────────────────────────
let queryQueue: unknown[][] = []
let callIndex = 0

// Proxy that behaves like a Drizzle query builder:
// - any chaining method (.from, .where, .orderBy, …) returns a new proxy
// - .limit() resolves from queue
// - awaiting the proxy (via .then) also resolves from queue
const makeProxy = (): unknown => new Proxy({} as Record<string, unknown>, {
  get(_: Record<string, unknown>, prop: string) {
    if (prop === 'then') {
      return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve, reject)
    }
    if (prop === 'catch')   return (fn: (e: unknown) => unknown) => Promise.resolve(queryQueue[callIndex++] ?? []).catch(fn)
    if (prop === 'finally') return (fn: () => unknown) => Promise.resolve(queryQueue[callIndex++] ?? []).finally(fn)
    if (prop === 'limit')   return () => Promise.resolve(queryQueue[callIndex++] ?? [])
    return () => makeProxy()
  },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = { select: vi.fn() }

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/drizzle/schema', () => ({
  policySettings:         {},
  complianceRules:        {},
  customFieldDefinitions: {},
  workflowDefinitions:    {},
  workflowStages:         {},
  workflowRoutingRules:   {},
  leaveRuleSets:          {},
  leaveRuleLines:         {},
}))
vi.mock('drizzle-orm', () => ({
  eq:     () => ({}),
  and:    (...a: unknown[]) => a,
  lte:    () => ({}),
  or:     () => ({}),
  isNull: () => ({}),
  count:  () => ({ as: () => ({}) }),
}))
vi.mock('@/lib/effective-date', () => ({ todayUae: () => '2026-04-28' }))

const {
  resolveWorkflowTemplate,
  resolveLeaveRuleSet,
  resolveCustomFields,
} = await import('@/lib/config-resolver')

// QA-Audit-S4-Q6 — single source of truth for the test tenant.
const { TENANT_ID: TENANT } = await import('@/lib/constants')

// ─────────────────────────────────────────────────────────────────────────────

describe('resolveWorkflowTemplate — routing rules', () => {
  beforeEach(() => {
    callIndex = 0
    queryQueue = []
    vi.clearAllMocks()
    mockDb.select.mockImplementation(() => makeProxy())
  })

  it('returns null when no active workflow template exists', async () => {
    queryQueue = [[]]  // wf definition query → empty
    const result = await resolveWorkflowTemplate('LEAVE_REQUEST', {}, TENANT)
    expect(result).toBeNull()
  })

  it('returns all stages when no routing rules match', async () => {
    const wf = { id: 'wf-1', workflowCode: 'LEAVE-STD', triggerEvent: 'LEAVE_REQUEST', version: 1 }
    const stages = [
      { stageOrder: 1, stageNameEn: 'Manager Approval', approverType: 'ROLE', approverRoleCode: 'LINE_MANAGER', stageSlaHours: 48 },
      { stageOrder: 2, stageNameEn: 'HR Director',      approverType: 'ROLE', approverRoleCode: 'HR_DIRECTOR',  stageSlaHours: 24 },
    ]
    queryQueue = [[wf], stages, []]  // wf → stages → routing rules (empty)
    const result = await resolveWorkflowTemplate('LEAVE_REQUEST', {}, TENANT)
    expect(result).not.toBeNull()
    expect(result!.stages).toHaveLength(2)
    expect(result!.stages[0].approverRoleCode).toBe('LINE_MANAGER')
    expect(result!.stages[1].approverRoleCode).toBe('HR_DIRECTOR')
  })

  it('SKIP_STEP routing rule removes the matching stage', async () => {
    const wf = { id: 'wf-1', workflowCode: 'LEAVE-STD', triggerEvent: 'LEAVE_REQUEST', version: 1 }
    const stages = [
      { stageOrder: 1, stageNameEn: 'Manager', approverType: 'ROLE', approverRoleCode: 'LINE_MANAGER', stageSlaHours: 48 },
      { stageOrder: 2, stageNameEn: 'HR Dir',  approverType: 'ROLE', approverRoleCode: 'HR_DIRECTOR',  stageSlaHours: 24 },
    ]
    // conditionValue = 'LINE_MANAGER' with = operator on context field 'gradeLevel'
    const rules = [
      { priority: 1, conditionField: 'gradeLevel', conditionOperator: '=', conditionValue: 'LINE_MANAGER', isActive: true },
    ]
    queryQueue = [[wf], stages, rules]
    const result = await resolveWorkflowTemplate('LEAVE_REQUEST', { gradeLevel: 'LINE_MANAGER' }, TENANT)
    expect(result).not.toBeNull()
    // LINE_MANAGER stage removed — only HR_DIRECTOR remains
    expect(result!.stages).toHaveLength(1)
    expect(result!.stages[0].approverRoleCode).toBe('HR_DIRECTOR')
  })

  it('does NOT remove stages when routing rule condition is false', async () => {
    const wf = { id: 'wf-2', workflowCode: 'LEAVE-STD', triggerEvent: 'LEAVE_REQUEST', version: 1 }
    const stages = [
      { stageOrder: 1, stageNameEn: 'Manager', approverType: 'ROLE', approverRoleCode: 'LINE_MANAGER', stageSlaHours: 48 },
    ]
    const rules = [
      { priority: 1, conditionField: 'gradeLevel', conditionOperator: '=', conditionValue: 'HOD', isActive: true },
    ]
    queryQueue = [[wf], stages, rules]
    // context gradeLevel = 'EMPLOYEE' — rule targets 'HOD', no match
    const result = await resolveWorkflowTemplate('LEAVE_REQUEST', { gradeLevel: 'EMPLOYEE' }, TENANT)
    expect(result!.stages).toHaveLength(1)
  })

  it('preserves stageOrder on returned stages', async () => {
    const wf = { id: 'wf-3', workflowCode: 'HIRE-STD', triggerEvent: 'EMPLOYEE_HIRE', version: 1 }
    const stages = [
      { stageOrder: 1, stageNameEn: 'HOD',    approverType: 'ROLE', approverRoleCode: 'HOD',        stageSlaHours: 48 },
      { stageOrder: 2, stageNameEn: 'HR Dir', approverType: 'ROLE', approverRoleCode: 'HR_DIRECTOR', stageSlaHours: 48 },
      { stageOrder: 3, stageNameEn: 'CEO',    approverType: 'ROLE', approverRoleCode: 'CEO',         stageSlaHours: 24 },
    ]
    queryQueue = [[wf], stages, []]
    const result = await resolveWorkflowTemplate('EMPLOYEE_HIRE', {}, TENANT)
    expect(result!.stages.map(s => s.stageOrder)).toEqual([1, 2, 3])
  })

  it('maps resolved template fields correctly', async () => {
    const wf = { id: 'wf-x', workflowCode: 'PAYROLL-STD', triggerEvent: 'PAYROLL_APPROVAL', version: 2 }
    queryQueue = [[wf], [], []]
    const result = await resolveWorkflowTemplate('PAYROLL_APPROVAL', {}, TENANT)
    expect(result!.workflowDefinitionId).toBe('wf-x')
    expect(result!.workflowCode).toBe('PAYROLL-STD')
    expect(result!.triggerEvent).toBe('PAYROLL_APPROVAL')
  })
})

describe('resolveLeaveRuleSet — leave rule priority', () => {
  beforeEach(() => {
    callIndex = 0
    queryQueue = []
    vi.clearAllMocks()
    mockDb.select.mockImplementation(() => makeProxy())
  })

  it('returns null when no rule set contains the requested leave type', async () => {
    const set = { id: 'rs-1', ruleSetCode: 'AL-EXPAT', ruleSetNameEn: 'Annual Expat', effectiveFrom: '2024-01-01' }
    queryQueue = [[set], []]  // sets → no matching SICK lines in rs-1
    const result = await resolveLeaveRuleSet('emp-1', 'SICK', TENANT)
    expect(result).toBeNull()
  })

  it('returns the first matching rule set (sorted by effectiveFrom)', async () => {
    const sets = [
      { id: 'rs-1', ruleSetCode: 'AL-EXPAT', ruleSetNameEn: 'Annual Expat', effectiveFrom: '2024-01-01' },
      { id: 'rs-2', ruleSetCode: 'AL-NAT',   ruleSetNameEn: 'Annual National', effectiveFrom: '2024-01-01' },
    ]
    const matchingLine = {
      absenceTypeCode: 'ANNUAL', entitlementTiersJson: [{ minServiceMonths: 0, daysEntitled: 22 }],
      maxCarryForwardDays: '15', isProRated: true, accrualFrequency: 'MONTHLY',
      minServiceMonths: 6, maxDaysPerYear: null, encashmentAllowed: false, isActive: true,
    }
    queryQueue = [sets, [matchingLine]]  // rs-1 has the ANNUAL line → returns it
    const result = await resolveLeaveRuleSet('emp-1', 'ANNUAL', TENANT)
    expect(result).not.toBeNull()
    expect(result!.ruleSetCode).toBe('AL-EXPAT')
    expect(result!.absenceTypeCode).toBe('ANNUAL')
    expect(result!.maxCarryForwardDays).toBe('15')
  })

  it('falls through to second set when first has no matching line', async () => {
    const sets = [
      { id: 'rs-1', ruleSetCode: 'AL-EXPAT',    ruleSetNameEn: 'Annual Expat',   effectiveFrom: '2024-01-01' },
      { id: 'rs-2', ruleSetCode: 'SL-STANDARD',  ruleSetNameEn: 'Sick Leave Std', effectiveFrom: '2024-01-01' },
    ]
    const sickLine = {
      absenceTypeCode: 'SICK', entitlementTiersJson: [{ minServiceMonths: 0, daysEntitled: 15 }],
      maxCarryForwardDays: '0', isProRated: false, accrualFrequency: 'MONTHLY',
      minServiceMonths: 0, maxDaysPerYear: '15', encashmentAllowed: false, isActive: true,
    }
    queryQueue = [sets, [], [sickLine]]  // rs-1 no match → rs-2 has SICK line
    const result = await resolveLeaveRuleSet('emp-1', 'SICK', TENANT)
    expect(result!.ruleSetCode).toBe('SL-STANDARD')
    expect(result!.maxDaysPerYear).toBe('15')
    expect(result!.isProRated).toBe(false)
  })

  it('maps all leave rule fields onto the return type', async () => {
    const sets = [{ id: 'rs-1', ruleSetCode: 'EL-STD', ruleSetNameEn: 'Emergency Leave', effectiveFrom: '2024-01-01' }]
    const line = {
      absenceTypeCode: 'EMERGENCY', entitlementTiersJson: [{ daysEntitled: 3 }],
      maxCarryForwardDays: '0', isProRated: false, accrualFrequency: 'ANNUALLY',
      minServiceMonths: 0, maxDaysPerYear: '3', encashmentAllowed: false, isActive: true,
    }
    queryQueue = [sets, [line]]
    const result = await resolveLeaveRuleSet('emp-2', 'EMERGENCY', TENANT)
    expect(result!.encashmentAllowed).toBe(false)
    expect(result!.accrualFrequency).toBe('ANNUALLY')
    expect(result!.entitlementTiersJson).toEqual([{ daysEntitled: 3 }])
  })
})

describe('resolveCustomFields', () => {
  beforeEach(() => {
    callIndex = 0
    queryQueue = []
    vi.clearAllMocks()
    mockDb.select.mockImplementation(() => makeProxy())
  })

  it('returns empty array when no custom fields defined', async () => {
    queryQueue = [[]]
    const result = await resolveCustomFields('PERSON', TENANT)
    expect(result).toEqual([])
  })

  it('maps schema rows to FieldDefinition shape', async () => {
    const row = {
      id: 'cf-1', apiName: 'employee_badge', labelEn: 'Badge No.', labelAr: 'رقم الشارة',
      dataType: 'TEXT', isRequired: false, isSearchable: true, isEncrypted: false,
      displayOrder: 0, sectionCode: 'EMPLOYMENT_INFO', validationRules: null,
      helpTextEn: null, helpTextAr: null,
    }
    queryQueue = [[row]]
    const result = await resolveCustomFields('PERSON', TENANT)
    expect(result).toHaveLength(1)
    expect(result[0].apiName).toBe('employee_badge')
    expect(result[0].labelAr).toBe('رقم الشارة')
    expect(result[0].isSearchable).toBe(true)
    expect(result[0].sectionCode).toBe('EMPLOYMENT_INFO')
  })

  it('returns null for absent optional fields instead of undefined', async () => {
    const row = {
      id: 'cf-2', apiName: 'custom_date', labelEn: 'Join Date', labelAr: null,
      dataType: 'DATE', isRequired: true, isSearchable: false, isEncrypted: false,
      displayOrder: 1, sectionCode: null, validationRules: null,
      helpTextEn: null, helpTextAr: null,
    }
    queryQueue = [[row]]
    const result = await resolveCustomFields('CONTRACT', TENANT)
    expect(result[0].labelAr).toBeNull()
    expect(result[0].sectionCode).toBeNull()
    expect(result[0].helpTextEn).toBeNull()
  })
})
