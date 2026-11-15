import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../schema'
import { TENANT_ID } from '../../lib/constants'

// ── Bootstrap ──────────────────────────────────────────────────────────────

const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000002'

const SYS = {
  tenantId:      TENANT_ID,
  createdBy:     SYSTEM_USER_ID,
  createdByName: 'Seed Script',
}

// ── Fixed UUIDs ────────────────────────────────────────────────────────────

const ENTITY_TEST_001 = 'aaaa0001-0000-0000-0000-000000000001'

// Workflow Definitions
const WF_TEST_001 = 'ffff0001-0000-0000-0000-000000000001'
const WF_TEST_002 = 'ffff0001-0000-0000-0000-000000000002'
const WF_TEST_003 = 'ffff0001-0000-0000-0000-000000000003'
const WF_TEST_004 = 'ffff0001-0000-0000-0000-000000000004'
const WF_TEST_005 = 'ffff0001-0000-0000-0000-000000000005'
const WF_TEST_006 = 'ffff0001-0000-0000-0000-000000000006'

// Workflow Stages — sequential from ffff0002-...-000000000001
const WFS_001 = 'ffff0002-0000-0000-0000-000000000001'  // WF-001 Stage 1
const WFS_002 = 'ffff0002-0000-0000-0000-000000000002'  // WF-001 Stage 2
const WFS_003 = 'ffff0002-0000-0000-0000-000000000003'  // WF-003 Stage 1
const WFS_004 = 'ffff0002-0000-0000-0000-000000000004'  // WF-003 Stage 2
const WFS_005 = 'ffff0002-0000-0000-0000-000000000005'  // WF-003 Stage 3
const WFS_006 = 'ffff0002-0000-0000-0000-000000000006'  // WF-004 Stage 1
const WFS_007 = 'ffff0002-0000-0000-0000-000000000007'  // WF-004 Stage 2
const WFS_008 = 'ffff0002-0000-0000-0000-000000000008'  // WF-004 Stage 3

// Approval Delegation
const DELG_001 = 'ffff0003-0000-0000-0000-000000000001'

// Persons (from AGENT-1D)
const PERSON_012 = 'dddd0001-0000-0000-0000-000000000012'  // EMP-012 Ana Silva (delegator)
const PERSON_001 = 'dddd0001-0000-0000-0000-000000000001'  // EMP-001 Mohammed (delegate)

// ── Result tracking ────────────────────────────────────────────────────────

interface TestResult {
  id: string
  name: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  detail: string
}

const results: TestResult[] = []

async function run(id: string, name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn()
    results.push({ id, name, status: 'PASS', detail })
    console.info(`  [PASS] ${name} — ${detail}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    results.push({ id, name, status: 'FAIL', detail: msg })
    console.error(`  [FAIL] ${name} — ${msg}`)
  }
}

async function skip(id: string, name: string, reason: string) {
  results.push({ id, name, status: 'SKIP', detail: reason })
  console.info(`  [SKIP] ${name} — ${reason}`)
}

// ── Seed functions ─────────────────────────────────────────────────────────

async function seedWorkflowDefinitions() {
  await db.insert(schema.workflowDefinitions).values([
    {
      id:               WF_TEST_001,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      workflowCode:     'WF-TEST-LEAVE-ANNUAL',
      workflowNameEn:   'Annual Leave Approval (Test)',
      workflowNameAr:   'موافقة الإجازة السنوية (اختبار)',
      triggerEvent:     'LEAVE',
      approvalMode:     'SEQUENTIAL',
      slaHours:         24,
      escalationHours:  48,
      isActive:         true,
      version:          1,
    },
    {
      id:               WF_TEST_002,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      workflowCode:     'WF-TEST-LEAVE-SICK',
      workflowNameEn:   'Sick Leave Notification (Test)',
      workflowNameAr:   'إشعار الإجازة المرضية (اختبار)',
      triggerEvent:     'LEAVE',
      approvalMode:     'SEQUENTIAL',
      slaHours:         4,
      escalationHours:  8,
      isActive:         true,
      version:          1,
    },
    {
      id:               WF_TEST_003,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      workflowCode:     'WF-TEST-SALARY',
      workflowNameEn:   'Salary Change Approval (Test)',
      workflowNameAr:   'موافقة تعديل الراتب (اختبار)',
      triggerEvent:     'SALARY_REVISION',
      approvalMode:     'SEQUENTIAL',
      slaHours:         48,
      escalationHours:  72,
      isActive:         true,
      version:          1,
    },
    {
      id:               WF_TEST_004,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      workflowCode:     'WF-TEST-TERMINATION',
      workflowNameEn:   'Termination Approval (Test)',
      workflowNameAr:   'موافقة إنهاء الخدمة (اختبار)',
      triggerEvent:     'TERMINATION',
      approvalMode:     'SEQUENTIAL',
      slaHours:         48,
      escalationHours:  72,
      isActive:         true,
      version:          1,
    },
    {
      id:               WF_TEST_005,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      workflowCode:     'WF-TEST-UNPAID-LEAVE',
      workflowNameEn:   'Unpaid Leave Approval (Test)',
      workflowNameAr:   'موافقة الإجازة بدون راتب (اختبار)',
      triggerEvent:     'LEAVE',
      approvalMode:     'SEQUENTIAL',
      slaHours:         48,
      escalationHours:  72,
      isActive:         true,
      version:          1,
    },
    {
      id:               WF_TEST_006,
      ...SYS,
      legalEntityId:    ENTITY_TEST_001,
      workflowCode:     'WF-TEST-MATERNITY',
      workflowNameEn:   'Maternity Leave Processing (Test)',
      workflowNameAr:   'معالجة إجازة الأمومة (اختبار)',
      triggerEvent:     'LEAVE',
      approvalMode:     'SEQUENTIAL',
      slaHours:         4,
      escalationHours:  8,
      isActive:         true,
      version:          1,
    },
  ]).onConflictDoNothing()

  return '6 workflow definitions inserted (or already present)'
}

async function seedWorkflowStages() {
  await db.insert(schema.workflowStages).values([
    // WF-TEST-001 (Annual Leave) — 2 stages
    {
      id:                   WFS_001,
      ...SYS,
      workflowDefinitionId: WF_TEST_001,
      stageOrder:           1,
      stageNameEn:          'Manager Approval',
      stageNameAr:          'موافقة المدير',
      approverType:         'ROLE',
      approverRoleCode:     'DIRECT_MANAGER',
      canDelegate:          true,
      isOptional:           false,
      stageSlaHours:        24,
      actionType:           'APPROVE_REJECT',
    },
    {
      id:                   WFS_002,
      ...SYS,
      workflowDefinitionId: WF_TEST_001,
      stageOrder:           2,
      stageNameEn:          'HR Review',
      stageNameAr:          'مراجعة الموارد البشرية',
      approverType:         'ROLE',
      approverRoleCode:     'HR_MANAGER',
      canDelegate:          true,
      isOptional:           false,
      stageSlaHours:        48,
      actionType:           'APPROVE_REJECT',
    },
    // WF-TEST-003 (Salary) — 3 stages
    {
      id:                   WFS_003,
      ...SYS,
      workflowDefinitionId: WF_TEST_003,
      stageOrder:           1,
      stageNameEn:          'Manager Approval',
      stageNameAr:          'موافقة المدير',
      approverType:         'ROLE',
      approverRoleCode:     'DIRECT_MANAGER',
      canDelegate:          true,
      isOptional:           false,
      stageSlaHours:        48,
      actionType:           'APPROVE_REJECT',
    },
    {
      id:                   WFS_004,
      ...SYS,
      workflowDefinitionId: WF_TEST_003,
      stageOrder:           2,
      stageNameEn:          'HR Director Approval',
      stageNameAr:          'موافقة مدير الموارد البشرية',
      approverType:         'ROLE',
      approverRoleCode:     'HR_MANAGER',
      canDelegate:          true,
      isOptional:           false,
      stageSlaHours:        48,
      actionType:           'APPROVE_REJECT',
    },
    {
      id:                   WFS_005,
      ...SYS,
      workflowDefinitionId: WF_TEST_003,
      stageOrder:           3,
      stageNameEn:          'Finance Approval',
      stageNameAr:          'موافقة المالية',
      approverType:         'ROLE',
      approverRoleCode:     'FINANCE_HEAD',
      canDelegate:          true,
      isOptional:           false,
      stageSlaHours:        48,
      actionType:           'APPROVE_REJECT',
    },
    // WF-TEST-004 (Termination) — 3 stages
    {
      id:                   WFS_006,
      ...SYS,
      workflowDefinitionId: WF_TEST_004,
      stageOrder:           1,
      stageNameEn:          'Manager Approval',
      stageNameAr:          'موافقة المدير',
      approverType:         'ROLE',
      approverRoleCode:     'DIRECT_MANAGER',
      canDelegate:          true,
      isOptional:           false,
      stageSlaHours:        24,
      actionType:           'APPROVE_REJECT',
    },
    {
      id:                   WFS_007,
      ...SYS,
      workflowDefinitionId: WF_TEST_004,
      stageOrder:           2,
      stageNameEn:          'HR Director Approval',
      stageNameAr:          'موافقة مدير الموارد البشرية',
      approverType:         'ROLE',
      approverRoleCode:     'HR_MANAGER',
      canDelegate:          true,
      isOptional:           false,
      stageSlaHours:        48,
      actionType:           'APPROVE_REJECT',
    },
    {
      id:                   WFS_008,
      ...SYS,
      workflowDefinitionId: WF_TEST_004,
      stageOrder:           3,
      stageNameEn:          'Finance Approval',
      stageNameAr:          'موافقة المالية',
      approverType:         'ROLE',
      approverRoleCode:     'FINANCE_HEAD',
      canDelegate:          true,
      isOptional:           false,
      stageSlaHours:        48,
      actionType:           'APPROVE_REJECT',
    },
  ]).onConflictDoNothing()

  return '8 workflow stages inserted (or already present)'
}

async function seedApprovalDelegation() {
  // Check whether the persons from AGENT-1D exist before inserting
  const delegator = await db.query.persons.findFirst({
    where: (p, { eq }) => eq(p.id, PERSON_012),
  })

  const delegate = await db.query.persons.findFirst({
    where: (p, { eq }) => eq(p.id, PERSON_001),
  })

  if (!delegator || !delegate) {
    const missing: string[] = []
    if (!delegator) missing.push(`delegator ${PERSON_012} (EMP-012 Ana Silva)`)
    if (!delegate)  missing.push(`delegate ${PERSON_001} (EMP-001 Mohammed)`)
    throw new Error(`Prerequisite persons not found: ${missing.join(', ')} — run AGENT-1D seed first`)
  }

  await db.insert(schema.approvalDelegations).values([
    {
      id:             DELG_001,
      ...SYS,
      legalEntityId:  ENTITY_TEST_001,
      delegatorId:    PERSON_012,
      delegateId:     PERSON_001,
      delegationFrom: '2026-05-01',
      delegationTo:   '2026-05-31',
      isActive:       true,
      reason:         'Annual leave coverage delegation (Test)',
    },
  ]).onConflictDoNothing()

  return '1 approval delegation inserted (or already present)'
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.info('\n=== AGENT-1E: Workflow Definitions, Stages & Delegation Seed ===\n')

  await run('SEED-1E-001', 'Workflow definitions seeded', seedWorkflowDefinitions)
  await run('SEED-1E-002', 'Workflow stages seeded',      seedWorkflowStages)

  // Approval delegation depends on persons from AGENT-1D — handle gracefully
  const delegatorExists = await db.query.persons.findFirst({
    where: (p, { eq }) => eq(p.id, PERSON_012),
  }).catch(() => null)

  if (delegatorExists) {
    await run('SEED-1E-003', 'Approval delegation seeded', seedApprovalDelegation)
  } else {
    await skip('SEED-1E-003', 'Approval delegation seeded', 'Persons not yet seeded (AGENT-1D prerequisite) — skipped gracefully')
  }

  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  const skipped = results.filter(r => r.status === 'SKIP').length

  console.info(`\n=== Summary: ${pass} passed, ${fail} failed, ${skipped} skipped ===\n`)

  const output = {
    agent:     'AGENT-1E',
    category:  'Workflow Seed Data',
    timestamp: new Date().toISOString(),
    tests:     results,
    summary: {
      total: results.length,
      pass,
      fail,
      skip: skipped,
      warn: 0,
    },
  }

  const fs = await import('fs')
  fs.mkdirSync('/tmp/test_results', { recursive: true })
  fs.writeFileSync('/tmp/test_results/AGENT-1E.json', JSON.stringify(output, null, 2))
  console.info('Results written to /tmp/test_results/AGENT-1E.json')

  await client.end()
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
