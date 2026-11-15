import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TENANT_ID } from '@/lib/constants'

/**
 * MDM CRUD Integration Tests — AGENT-2A
 *
 * Covers modules/config/actions.ts server actions using the same proxy-based
 * DB mock pattern established in core-hr-actions.test.ts and config-actions.test.ts.
 *
 * Entities / actions tested:
 *   1. Custom Fields          — createCustomField, getCustomFields
 *   2. Notification Templates — updateNotificationTemplate, getNotificationTemplates
 *   3. Policy Settings        — updatePolicySetting, getPolicySettings
 *   4. Workflow Templates     — createWorkflowTemplate, updateWorkflowTemplate, getWorkflowTemplates
 *   5. Approval Delegations   — createApprovalDelegation, deactivateApprovalDelegation, listApprovalDelegations
 *   6. Form Configurations    — updateFormConfiguration (covered in config-actions.test.ts; auth/upsert re-tested here for completeness)
 *
 * Strategy: Proxy-based DB mock (makeProxy + queryQueue) so no real DB is used.
 * vi.mock for @/lib/db, @/lib/audit, @/lib/auth, @/lib/config-resolver,
 * @/drizzle/schema, @/modules/config/guards, and drizzle-orm.
 */

// ── Shared state ──────────────────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy    = vi.fn()
const valuesSpy    = vi.fn()
const updateSpy    = vi.fn()
const setSpy       = vi.fn()
const whereSpy     = vi.fn()
const auditSpy     = vi.fn()
const invalidateSpy = vi.fn()

// ── Proxy helpers ─────────────────────────────────────────────────────────────

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve, reject)
      }
      // All chainable methods (.from, .where, .orderBy, .limit, .offset, .leftJoin,
      // .innerJoin, .groupBy, .select) return another proxy so they await correctly.
      return () => makeProxy()
    },
  })
}

function makeInsertChain(returnRows: unknown[]) {
  return {
    values: vi.fn((payload: unknown) => {
      valuesSpy(payload)
      return {
        returning: vi.fn(() => Promise.resolve(returnRows)),
        // Audit inserts (no .returning) resolve via .then directly.
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(returnRows).then(resolve),
      }
    }),
  }
}

function makeUpdateChain() {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      return {
        where: vi.fn((cond: unknown) => {
          whereSpy(cond)
          return Promise.resolve()
        }),
      }
    }),
  }
}

function buildTxMock(insertReturn: unknown[]) {
  return {
    select: vi.fn(() => makeProxy()),
    insert: vi.fn((table: unknown) => {
      insertSpy(table)
      return makeInsertChain(insertReturn)
    }),
    update: vi.fn((table: unknown) => {
      updateSpy(table)
      return makeUpdateChain()
    }),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    execute: vi.fn(() => Promise.resolve()),
  }
}

// ── mockDb ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(() => makeInsertChain([])),
  update:      vi.fn(() => makeUpdateChain()),
  transaction: vi.fn(),
}

// ── Session ───────────────────────────────────────────────────────────────────
const session = {
  user: {
    id:            '00000000-0000-0000-0000-0000000000c3',
    name:          'HR Admin',
    role:          'HR_ADMIN',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
    personId:      '00000000-0000-0000-0000-000000000001' as string | undefined,
  },
}

// ── vi.mock blocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ db: mockDb }))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, _tx?: unknown) => {
    auditSpy(event, _tx)
    return Promise.resolve()
  }),
  diffFields: () => [],
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn((roles: string[]) => {
    if (!roles.includes(session.user.role)) {
      throw new Error(`FORBIDDEN: requires one of ${roles.join(', ')}`)
    }
    return Promise.resolve(session.user)
  }),
  getCurrentUser: vi.fn(() => Promise.resolve(session.user)),
}))

vi.mock('@/lib/config-resolver', () => ({
  resolveWorkflowTemplate: vi.fn(),
  invalidateConfigCache:   vi.fn(() => { invalidateSpy() }),
}))

vi.mock('@/drizzle/schema', () => ({
  customFieldDefinitions: {
    id: {}, tenantId: {}, objectType: {}, apiName: {}, labelEn: {}, labelAr: {},
    dataType: {}, isRequired: {}, isSearchable: {}, isEncrypted: {}, displayOrder: {},
    sectionCode: {}, isActive: {},
  },
  notificationTemplates: {
    id: {}, tenantId: {}, templateCode: {}, templateNameEn: {}, eventType: {},
    channel: {}, language: {}, subjectEn: {}, subjectAr: {}, bodyEn: {}, bodyAr: {},
    recipientRoles: {}, isActive: {}, availableVarsJson: {}, legalEntityId: {},
  },
  policySettings: {
    id: {}, tenantId: {}, legalEntityId: {}, settingKey: {}, settingNameEn: {},
    settingNameAr: {}, valueType: {}, settingValue: {}, moduleCode: {},
    isOverridable: {}, effectiveFrom: {}, effectiveTo: {}, notes: {},
  },
  workflowDefinitions: {
    id: {}, tenantId: {}, legalEntityId: {}, workflowCode: {}, workflowNameEn: {},
    workflowNameAr: {}, triggerEvent: {}, approvalMode: {}, slaHours: {},
    escalationHours: {}, isActive: {}, version: {},
  },
  workflowStages: {
    id: {}, tenantId: {}, workflowDefinitionId: {}, stageOrder: {}, stageNameEn: {},
    stageNameAr: {}, approverType: {}, approverRoleCode: {}, escalationRoleCode: {},
    stageSlaHours: {}, canDelegate: {}, isOptional: {}, actionType: {},
  },
  workflowInstances: {
    id: {}, tenantId: {}, workflowDefinitionId: {}, resourceType: {}, resourceId: {},
    initiatedByPersonId: {}, legalEntityId: {}, currentStageId: {}, currentStageOrder: {},
    status: {}, approvalChainJson: {}, currentDelegateePersonId: {},
  },
  approvalDelegations: {
    id: {}, tenantId: {}, delegatorId: {}, delegateId: {}, legalEntityId: {},
    delegationFrom: {}, delegationTo: {}, scopeTypes: {}, reason: {}, isActive: {}, createdDate: {},
  },
  userAccounts: {
    id: {}, personId: {}, avaniisRole: {},
  },
  leaveRuleSets: {
    id: {}, tenantId: {}, ruleSetCode: {}, ruleSetNameEn: {}, ruleSetNameAr: {},
    entityTypeScope: {}, nationalityScope: {}, employmentTypeScope: {},
    effectiveFrom: {}, effectiveTo: {}, isActive: {}, isDefault: {},
  },
  leaveRuleLines: {
    id: {}, leaveRuleSetId: {},
  },
  events: {
    id: {}, tenantId: {}, eventType: {}, payload: {},
  },
  formConfigurations: {
    id: {}, tenantId: {}, entityType: {}, role: {},
  },
  persons: {
    id: {}, tenantId: {}, legalEntityId: {}, fullNameEn: {}, fullNameAr: {}, isActive: {},
  },
}))

vi.mock('@/modules/config/guards', () => ({
  assertNotSystemField:        vi.fn(),
  assertLeaveRuleNotBelowMinimum: vi.fn(),
  assertMaxCustomFields:       vi.fn(() => Promise.resolve()),
  assertWorkflowRoleValid:     vi.fn(),
  assertEscalationRoleHigher:  vi.fn(),
  assertPlaceholdersValid:     vi.fn(() => Promise.resolve()),
}))

vi.mock('drizzle-orm', () => ({
  eq:      () => ({}),
  and:     (...a: unknown[]) => a,
  or:      () => ({}),
  inArray: () => ({}),
  ilike:   () => ({}),
  not:     () => ({}),
  asc:     () => ({}),
  desc:    () => ({}),
  gte:     () => ({}),
  lte:     () => ({}),
  isNull:  () => ({}),
  sql:     Object.assign(() => ({}), { raw: () => ({}) }),
  count:   () => ({}),
}))

// ── Late-load actions ─────────────────────────────────────────────────────────
const {
  createCustomField,
  getCustomFields,
  updateNotificationTemplate,
  getNotificationTemplates,
  updatePolicySetting,
  getPolicySettings,
  createWorkflowTemplate,
  updateWorkflowTemplate,
  getWorkflowTemplates,
  createApprovalDelegation,
  deactivateApprovalDelegation,
  listApprovalDelegations,
  updateFormConfiguration,
  getLeaveRuleSets,
} = await import('@/modules/config/actions')

// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_ID = '00000000-0000-0000-0000-0000000000a1'
const PERSON_A  = '00000000-0000-0000-0000-000000000001'
const PERSON_B  = '00000000-0000-0000-0000-000000000002'

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  updateSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
  auditSpy.mockClear()
  invalidateSpy.mockClear()

  session.user.id            = '00000000-0000-0000-0000-0000000000c3'
  session.user.name          = 'HR Admin'
  session.user.role          = 'HR_ADMIN'
  session.user.legalEntityId = ENTITY_ID
  session.user.personId      = PERSON_A

  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

// ══════════════════════════════════════════════════════════════════════════════
// 1 — Custom Fields
// ══════════════════════════════════════════════════════════════════════════════

describe('createCustomField — auth gate', () => {
  it('MDM-001: throws FORBIDDEN for EMPLOYEE role', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(createCustomField({
      legalEntityId: ENTITY_ID,
      objectType:    'PERSON',
      apiName:       'emp_badge_no',
      labelEn:       'Badge Number',
      dataType:      'TEXT',
      isRequired:    false,
      isSearchable:  false,
      isEncrypted:   false,
      displayOrder:  0,
    })).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('MDM-002: allows HR_ADMIN to create custom field', async () => {
    const tx = buildTxMock([{ id: 'cf-001' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createCustomField({
      legalEntityId: ENTITY_ID,
      objectType:    'PERSON',
      apiName:       'emp_badge_no',
      labelEn:       'Badge Number',
      labelAr:       'رقم الشارة',
      dataType:      'TEXT',
      isRequired:    false,
      isSearchable:  true,
      isEncrypted:   false,
      displayOrder:  1,
    })
    expect(result.id).toBe('cf-001')
  })
})

describe('createCustomField — Zod validation', () => {
  it('MDM-003: rejects apiName that is not snake_case', async () => {
    await expect(createCustomField({
      legalEntityId: ENTITY_ID,
      objectType:    'PERSON',
      apiName:       'BadgeNumber',     // PascalCase — invalid
      labelEn:       'Badge Number',
      dataType:      'TEXT',
      isRequired:    false,
      isSearchable:  false,
      isEncrypted:   false,
      displayOrder:  0,
    })).rejects.toThrow()
  })

  it('MDM-004: rejects invalid dataType enum value', async () => {
    await expect(createCustomField({
      legalEntityId: ENTITY_ID,
      objectType:    'PERSON',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiName:       'my_field',
      labelEn:       'My Field',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dataType:      'BLOB' as any,     // not in enum
      isRequired:    false,
      isSearchable:  false,
      isEncrypted:   false,
      displayOrder:  0,
    })).rejects.toThrow()
  })
})

describe('createCustomField — audit + tx', () => {
  it('MDM-005: writes CUSTOM_FIELD.CREATED audit row inside transaction', async () => {
    const tx = buildTxMock([{ id: 'cf-002' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createCustomField({
      legalEntityId: ENTITY_ID,
      objectType:    'PERSON',
      apiName:       'home_emirate',
      labelEn:       'Home Emirate',
      dataType:      'PICKLIST',
      isRequired:    false,
      isSearchable:  false,
      isEncrypted:   false,
      displayOrder:  5,
    })
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'CUSTOM_FIELD.CREATED',
        resourceType: 'custom_field_definitions',
        resourceId:   'cf-002',
      }),
      tx,
    )
  })
})

describe('getCustomFields — list', () => {
  it('MDM-006: HR_DIRECTOR can call getCustomFields — returns array', async () => {
    session.user.role = 'HR_DIRECTOR'
    queryQueue = [[
      { id: 'cf-001', objectType: 'PERSON', apiName: 'badge_no', labelEn: 'Badge', labelAr: null,
        dataType: 'TEXT', isRequired: false, isSearchable: true, isEncrypted: false,
        displayOrder: 1, sectionCode: null, isActive: true },
    ]]
    const result = await getCustomFields('PERSON')
    expect(Array.isArray(result)).toBe(true)
  })

  it('MDM-007: EMPLOYEE is denied access to getCustomFields', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(getCustomFields()).rejects.toThrow(/do not have permission|You can only/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2 — Notification Templates
// ══════════════════════════════════════════════════════════════════════════════

describe('updateNotificationTemplate — auth + happy path', () => {
  it('MDM-008: throws FORBIDDEN for HR_ADMIN (HR_DIRECTOR/SUPER_ADMIN only for getNotificationTemplates)', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(getNotificationTemplates()).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('MDM-009: HR_ADMIN can update notification template — returns new id', async () => {
    // Queue: existing template row (for the select before tx)
    queryQueue = [[{
      id: 'nt-old', tenantId: TENANT_ID, legalEntityId: ENTITY_ID,
      templateCode: 'LEAVE_APPROVED', templateNameEn: 'Leave Approved',
      eventType: 'LEAVE', channel: 'EMAIL', language: 'en',
      subjectEn: 'Old Subject', subjectAr: null, bodyEn: 'Old body',
      bodyAr: null, availableVarsJson: null, recipientRoles: ['EMPLOYEE'],
      isActive: true,
    }]]

    const tx = buildTxMock([{ id: 'nt-new' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updateNotificationTemplate('nt-old', {
      bodyEn: 'New body text',
    })
    expect(result.id).toBe('nt-new')
  })

  it('MDM-010: throws NOT_FOUND when template does not exist', async () => {
    queryQueue = [[]]   // empty result for existing lookup
    await expect(
      updateNotificationTemplate('nt-missing', { bodyEn: 'body' }),
    ).rejects.toThrow(/could not be found/i)
  })
})

describe('updateNotificationTemplate — Zod validation', () => {
  it('MDM-011: rejects empty bodyEn', async () => {
    await expect(
      updateNotificationTemplate('nt-001', { bodyEn: '' }),
    ).rejects.toThrow()
  })
})

describe('updateNotificationTemplate — audit', () => {
  it('MDM-012: writes NOTIFICATION_TEMPLATE.UPDATED audit row in tx', async () => {
    queryQueue = [[{
      id: 'nt-old', tenantId: TENANT_ID, legalEntityId: ENTITY_ID,
      templateCode: 'HIRE_NOTIF', templateNameEn: 'Hire Notification',
      eventType: 'HIRE', channel: 'EMAIL', language: 'en',
      subjectEn: 'Welcome', subjectAr: null, bodyEn: 'Welcome body',
      bodyAr: null, availableVarsJson: null, recipientRoles: ['HR_ADMIN'],
      isActive: true,
    }]]
    const tx = buildTxMock([{ id: 'nt-new' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await updateNotificationTemplate('nt-old', { bodyEn: 'Updated body' })

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'NOTIFICATION_TEMPLATE.UPDATED',
        resourceType: 'notification_templates',
        resourceId:   'nt-new',
      }),
      tx,
    )
  })
})

describe('getNotificationTemplates — list', () => {
  it('MDM-013: HR_DIRECTOR can list notification templates', async () => {
    session.user.role = 'HR_DIRECTOR'
    queryQueue = [[
      { id: 'nt-001', templateCode: 'LEAVE', templateNameEn: 'Leave', eventType: 'LEAVE',
        channel: 'EMAIL', language: 'en', subjectEn: 'Subj', subjectAr: null,
        bodyEn: 'Body', bodyAr: null, recipientRoles: [], isActive: true },
    ]]
    const result = await getNotificationTemplates()
    expect(Array.isArray(result)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3 — Policy Settings
// ══════════════════════════════════════════════════════════════════════════════

describe('updatePolicySetting — auth gate', () => {
  it('MDM-014: throws FORBIDDEN for EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(
      updatePolicySetting('MAX_ANNUAL_LEAVE_DAYS', ENTITY_ID, '30'),
    ).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('MDM-015: HR_ADMIN can update an overridable policy setting', async () => {
    queryQueue = [[{
      id: 'ps-001', settingKey: 'MAX_ANNUAL_LEAVE_DAYS', settingValue: '25',
      isOverridable: true,
    }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updatePolicySetting('MAX_ANNUAL_LEAVE_DAYS', ENTITY_ID, '30')
    expect(result.success).toBe(true)
  })
})

describe('updatePolicySetting — Hard Rule 10 (SYSTEM_ONLY)', () => {
  it('MDM-016: throws FORBIDDEN for non-overridable system setting', async () => {
    queryQueue = [[{
      id: 'ps-sys', settingKey: 'SYSTEM_MAX_ENTITIES', settingValue: '50',
      isOverridable: false,
    }]]
    await expect(
      updatePolicySetting('SYSTEM_MAX_ENTITIES', ENTITY_ID, '100'),
    ).rejects.toThrow(/reserved for system use/i)
  })

  it('MDM-017: throws NOT_FOUND when setting key does not exist', async () => {
    queryQueue = [[]]
    await expect(
      updatePolicySetting('NONEXISTENT_KEY', ENTITY_ID, 'value'),
    ).rejects.toThrow(/could not be found/i)
  })
})

describe('updatePolicySetting — audit', () => {
  it('MDM-018: writes POLICY_SETTING.UPDATED audit row inside tx', async () => {
    queryQueue = [[{
      id: 'ps-002', settingKey: 'MIN_NOTICE_PERIOD_DAYS', settingValue: '30',
      isOverridable: true,
    }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await updatePolicySetting('MIN_NOTICE_PERIOD_DAYS', ENTITY_ID, '60')

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'POLICY_SETTING.UPDATED',
        resourceType: 'policy_settings',
        resourceId:   'ps-002',
      }),
      tx,
    )
  })
})

describe('getPolicySettings — list', () => {
  it('MDM-019: HR_DIRECTOR can list policy settings', async () => {
    session.user.role = 'HR_DIRECTOR'
    queryQueue = [[
      { id: 'ps-001', settingKey: 'MAX_ANNUAL_LEAVE_DAYS', settingNameEn: 'Max Days',
        settingNameAr: null, valueType: 'NUMBER', settingValue: '25', moduleCode: 'LEAVE',
        isOverridable: true, effectiveFrom: '2024-01-01', effectiveTo: null, notes: null },
    ]]
    const result = await getPolicySettings(ENTITY_ID)
    expect(Array.isArray(result)).toBe(true)
  })

  it('MDM-020: HR_ADMIN is denied access to getPolicySettings', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(getPolicySettings()).rejects.toThrow(/do not have permission|You can only/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4 — Workflow Templates
// ══════════════════════════════════════════════════════════════════════════════

const validWorkflowInput = () => ({
  workflowCode:   'LEAVE_APPROVAL',
  workflowNameEn: 'Leave Approval',
  workflowNameAr: 'اعتماد الإجازة',
  triggerEvent:   'LEAVE' as const,
  approvalMode:   'SEQUENTIAL' as const,
  slaHours:       48,
  escalationHours: 72,
  isActive:       true,
  stages: [
    {
      stageOrder:       1,
      stageNameEn:      'Line Manager Approval',
      stageNameAr:      'اعتماد المدير المباشر',
      approverRoleCode: 'LINE_MANAGER',
      stageSlaHours:    24,
      canDelegate:      true,
      isOptional:       false,
      actionType:       'APPROVE_REJECT' as const,
    },
  ],
})

describe('createWorkflowTemplate — auth gate', () => {
  it('MDM-021: throws FORBIDDEN for HR_ADMIN (HR_DIRECTOR/SUPER_ADMIN only)', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(createWorkflowTemplate(validWorkflowInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('MDM-022: HR_DIRECTOR can create workflow template', async () => {
    session.user.role = 'HR_DIRECTOR'
    const tx = buildTxMock([{ id: 'wf-001' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createWorkflowTemplate(validWorkflowInput())
    expect(result.id).toBe('wf-001')
  })
})

describe('createWorkflowTemplate — Zod validation', () => {
  it('MDM-023: rejects workflowCode that contains lowercase', async () => {
    session.user.role = 'HR_DIRECTOR'
    await expect(createWorkflowTemplate({
      ...validWorkflowInput(),
      workflowCode: 'lower_case',   // must be UPPER_SNAKE
    })).rejects.toThrow()
  })

  it('MDM-024: rejects more than 10 stages', async () => {
    session.user.role = 'HR_DIRECTOR'
    const tooManyStages = Array.from({ length: 11 }, (_, i) => ({
      stageOrder:       i + 1,
      stageNameEn:      `Stage ${i + 1}`,
      stageNameAr:      `مرحلة ${i + 1}`,
      approverRoleCode: 'LINE_MANAGER',
      stageSlaHours:    24,
      canDelegate:      true,
      isOptional:       false,
      actionType:       'APPROVE_REJECT' as const,
    }))
    await expect(createWorkflowTemplate({
      ...validWorkflowInput(),
      stages: tooManyStages,
    })).rejects.toThrow()
  })
})

describe('createWorkflowTemplate — audit + invalidation', () => {
  it('MDM-025: writes WORKFLOW_TEMPLATE.CREATED audit row inside tx', async () => {
    session.user.role = 'HR_DIRECTOR'
    const tx = buildTxMock([{ id: 'wf-002' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createWorkflowTemplate(validWorkflowInput())

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'WORKFLOW_TEMPLATE.CREATED',
        resourceType: 'workflow_definitions',
        resourceId:   'wf-002',
      }),
      tx,
    )
  })

  it('MDM-026: calls invalidateConfigCache after creating template', async () => {
    session.user.role = 'HR_DIRECTOR'
    const tx = buildTxMock([{ id: 'wf-003' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createWorkflowTemplate(validWorkflowInput())
    expect(invalidateSpy).toHaveBeenCalled()
  })
})

describe('updateWorkflowTemplate — happy path', () => {
  it('MDM-027: HR_DIRECTOR can update existing workflow template', async () => {
    session.user.role = 'HR_DIRECTOR'
    // Queue: existing record lookup before tx
    queryQueue = [[{
      id: 'wf-001', tenantId: TENANT_ID, version: 1,
      workflowCode: 'LEAVE_APPROVAL', triggerEvent: 'LEAVE', slaHours: 48,
      legalEntityId: null,
    }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updateWorkflowTemplate('wf-001', {
      ...validWorkflowInput(),
      slaHours: 72,
    })
    expect(result.id).toBe('wf-001')
  })

  it('MDM-028: throws NOT_FOUND when template id is missing', async () => {
    session.user.role = 'HR_DIRECTOR'
    queryQueue = [[]]   // no existing record
    await expect(
      updateWorkflowTemplate('nonexistent-id', validWorkflowInput()),
    ).rejects.toThrow(/could not be found/i)
  })
})

describe('getWorkflowTemplates — list', () => {
  it('MDM-029: HR_ADMIN can list workflow templates', async () => {
    // Queue: template rows + one count query per template
    queryQueue = [
      [{ id: 'wf-001', workflowCode: 'LEAVE_APPROVAL', workflowNameEn: 'Leave',
         workflowNameAr: null, triggerEvent: 'LEAVE', approvalMode: 'SEQUENTIAL',
         slaHours: 48, escalationHours: 72, isActive: true, version: 1, legalEntityId: null }],
      [{ n: 1 }],  // stage count for wf-001
    ]
    const result = await getWorkflowTemplates()
    expect(Array.isArray(result)).toBe(true)
  })

  it('MDM-030: EMPLOYEE is denied access to getWorkflowTemplates', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(getWorkflowTemplates()).rejects.toThrow(/do not have permission|You can only/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5 — Approval Delegations
// ══════════════════════════════════════════════════════════════════════════════

const validDelegationInput = () => ({
  delegateId:     PERSON_B,
  delegationFrom: '2026-05-10',
  delegationTo:   '2026-05-20',
  scopeTypes:     [],
  reason:         'Annual leave',
})

describe('createApprovalDelegation — validation guards', () => {
  it('MDM-031: throws NO_PERSON_LINK when user is not linked to a person', async () => {
    session.user.personId = undefined
    await expect(createApprovalDelegation(validDelegationInput())).rejects.toThrow(/employee profile is not fully set up/i)
  })

  it('MDM-032: throws DELEGATE_TO_SELF_FORBIDDEN when delegating to own personId', async () => {
    session.user.personId = PERSON_A
    await expect(createApprovalDelegation({
      ...validDelegationInput(),
      delegateId: PERSON_A,   // same as user's personId
    })).rejects.toThrow(/cannot delegate an approval to yourself/i)
  })
})

describe('createApprovalDelegation — happy path', () => {
  it('MDM-033: creates delegation and returns id', async () => {
    session.user.personId = PERSON_A
    // Queue: delegate person lookup
    queryQueue = [[{ id: PERSON_B, legalEntityId: ENTITY_ID, isActive: true }]]
    const tx = buildTxMock([{ id: 'del-001' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createApprovalDelegation(validDelegationInput())
    expect(result.id).toBe('del-001')
  })

  it('MDM-034: throws NOT_FOUND when delegate person is inactive', async () => {
    session.user.personId = PERSON_A
    queryQueue = [[{ id: PERSON_B, legalEntityId: ENTITY_ID, isActive: false }]]
    await expect(createApprovalDelegation(validDelegationInput())).rejects.toThrow(/could not be found/i)
  })
})

describe('createApprovalDelegation — date validation', () => {
  it('MDM-035: throws when delegationTo is before delegationFrom', async () => {
    session.user.personId = PERSON_A
    await expect(createApprovalDelegation({
      ...validDelegationInput(),
      delegationFrom: '2026-05-20',
      delegationTo:   '2026-05-10',   // before From
    })).rejects.toThrow()
  })
})

describe('createApprovalDelegation — audit', () => {
  it('MDM-036: writes APPROVAL_DELEGATION.CREATED audit row in tx', async () => {
    session.user.personId = PERSON_A
    queryQueue = [[{ id: PERSON_B, legalEntityId: ENTITY_ID, isActive: true }]]
    const tx = buildTxMock([{ id: 'del-002' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createApprovalDelegation(validDelegationInput())

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'APPROVAL_DELEGATION.CREATED',
        resourceType: 'approval_delegations',
        resourceId:   'del-002',
      }),
      tx,
    )
  })
})

describe('deactivateApprovalDelegation — auth + business rules', () => {
  it('MDM-037: throws NOT_FOUND when delegation id does not exist', async () => {
    session.user.personId = PERSON_A
    queryQueue = [[]]   // no existing delegation
    await expect(deactivateApprovalDelegation('del-missing')).rejects.toThrow(/could not be found/i)
  })

  it('MDM-038: throws FORBIDDEN when non-owner non-admin tries to deactivate', async () => {
    session.user.role     = 'EMPLOYEE'
    session.user.personId = PERSON_A
    queryQueue = [[{
      id: 'del-001', delegatorId: PERSON_B, // owner is PERSON_B, not A
      isActive: true, legalEntityId: ENTITY_ID,
    }]]
    await expect(deactivateApprovalDelegation('del-001')).rejects.toThrow(/Only the person who created|can deactivate/i)
  })

  it('MDM-039: owner (delegator) can deactivate their own delegation', async () => {
    session.user.personId = PERSON_A
    queryQueue = [[{
      id: 'del-001', delegatorId: PERSON_A,
      isActive: true, legalEntityId: ENTITY_ID,
    }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await deactivateApprovalDelegation('del-001')
    expect(result.success).toBe(true)
  })

  it('MDM-040: returns success immediately when delegation is already inactive', async () => {
    session.user.personId = PERSON_A
    queryQueue = [[{
      id: 'del-001', delegatorId: PERSON_A,
      isActive: false, legalEntityId: ENTITY_ID,   // already deactivated
    }]]
    // No tx mock needed — exits early before transaction
    const result = await deactivateApprovalDelegation('del-001')
    expect(result.success).toBe(true)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })
})

describe('listApprovalDelegations — access control', () => {
  it('MDM-041: returns empty array when user has no personId', async () => {
    session.user.personId = undefined
    const result = await listApprovalDelegations()
    expect(result).toEqual([])
  })

  it('MDM-042: HR_ADMIN can list delegations — returns array', async () => {
    session.user.personId = PERSON_A
    // Queue: delegation rows
    queryQueue = [
      [{
        id: 'del-001', delegatorId: PERSON_A, delegateId: PERSON_B,
        legalEntityId: ENTITY_ID, delegationFrom: '2026-05-10', delegationTo: '2026-05-20',
        scopeTypes: null, reason: 'Leave', isActive: true, createdDate: new Date(),
      }],
      // person name lookups
      [
        { id: PERSON_A, fullNameEn: 'Alice Admin', fullNameAr: null },
        { id: PERSON_B, fullNameEn: 'Bob Backup', fullNameAr: null },
      ],
    ]
    const result = await listApprovalDelegations()
    expect(Array.isArray(result)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6 — Leave Rule Sets (list only — create/update are NOT_IMPLEMENTED stubs)
// ══════════════════════════════════════════════════════════════════════════════

describe('getLeaveRuleSets — list', () => {
  it('MDM-043: HR_ADMIN can list leave rule sets — returns array', async () => {
    queryQueue = [[
      { id: 'lrs-001', ruleSetCode: 'UAE_DEFAULT', ruleSetNameEn: 'UAE Default', ruleSetNameAr: null,
        entityTypeScope: null, nationalityScope: null, employmentTypeScope: null,
        effectiveFrom: '2024-01-01', effectiveTo: null, isActive: true, isDefault: true, lineCount: 4 },
    ]]
    const result = await getLeaveRuleSets()
    expect(Array.isArray(result)).toBe(true)
  })

  it('MDM-044: EMPLOYEE is denied access to getLeaveRuleSets', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(getLeaveRuleSets()).rejects.toThrow(/do not have permission|You can only/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7 — Form Configurations (upsert re-tested for completeness)
// ══════════════════════════════════════════════════════════════════════════════

describe('updateFormConfiguration — MDM coverage', () => {
  it('MDM-045: HR_DIRECTOR can create form configuration (INSERT branch)', async () => {
    session.user.role = 'HR_DIRECTOR'
    queryQueue = [[]]   // existing lookup → empty
    const tx = buildTxMock([{ id: 'fc-001' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updateFormConfiguration({
      entityType: 'PERSON',
      role:       'HR_ADMIN',
      sections: [
        { sectionCode: 'EMPLOYMENT_DETAILS', labelEn: 'Employment Details', labelAr: 'تفاصيل التوظيف', fields: ['hireDate'] },
      ],
    })
    expect(result.created).toBe(true)
    expect(result.id).toBe('fc-001')
  })

  it('MDM-046: HR_DIRECTOR can update existing form configuration (UPDATE branch)', async () => {
    session.user.role = 'HR_DIRECTOR'
    queryQueue = [[{ id: 'fc-existing' }]]   // row exists
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updateFormConfiguration({
      entityType: 'PERSON',
      role:       'HR_ADMIN',
      sections: [
        { sectionCode: 'EMPLOYMENT_DETAILS', labelEn: 'Employment', labelAr: 'توظيف', fields: [] },
      ],
    })
    expect(result.created).toBe(false)
    expect(result.id).toBe('fc-existing')
  })

  it('MDM-047: throws FORBIDDEN for HR_ADMIN (requires HR_DIRECTOR or SUPER_ADMIN)', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(updateFormConfiguration({
      entityType: 'PERSON',
      role:       'ALL',
      sections: [
        { sectionCode: 'SECTION_A', labelEn: 'A', labelAr: 'أ', fields: [] },
      ],
    })).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('MDM-048: throws on duplicate sectionCode within the payload', async () => {
    session.user.role = 'HR_DIRECTOR'
    await expect(updateFormConfiguration({
      entityType: 'PERSON',
      role:       'ALL',
      sections: [
        { sectionCode: 'DUPE_CODE', labelEn: 'A', labelAr: 'أ', fields: [] },
        { sectionCode: 'DUPE_CODE', labelEn: 'B', labelAr: 'ب', fields: [] },
      ],
    })).rejects.toThrow(/sections cannot share the same code/i)
  })
})
