/**
 * AVANIIS HR — Workflow Engine v2 Seed Data
 * Seeds: SLA calendar, approval rules, workflow definitions (12 core), and steps.
 * Run: npx tsx drizzle/seed-workflow-v2.ts
 */
import 'dotenv/config'
import { db } from '../lib/db'
import { randomUUID } from 'crypto'
import {
  workflowRules,
  workflowDefinitionsV2,
  workflowStepsV2,
  workflowSlaCalendars,
} from './schema/workflow-engine'
import { TENANT_ID } from '../lib/constants'
import { eq, and } from 'drizzle-orm'

const SYSTEM = { id: '00000000-0000-0000-0000-000000000001', name: 'System Seed' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function auditCols() {
  return {
    createdBy:    SYSTEM.id,
    createdByName: SYSTEM.name,
    createdDate:  new Date(),
  }
}

async function upsertRule(rule: {
  ruleCode: string
  ruleNameEn: string
  description: string
  conditionTree: object
  priority?: number
}): Promise<string> {
  const existing = await db
    .select({ id: workflowRules.id })
    .from(workflowRules)
    .where(and(eq(workflowRules.tenantId, TENANT_ID), eq(workflowRules.ruleCode, rule.ruleCode)))
    .limit(1)

  if (existing.length) return existing[0].id

  const id = randomUUID()
  await db.insert(workflowRules).values({
    id,
    tenantId:      TENANT_ID,
    ruleCode:      rule.ruleCode,
    ruleNameEn:    rule.ruleNameEn,
    description:   rule.description,
    conditionTree: rule.conditionTree as never,
    priority:      rule.priority ?? 0,
    isActive:      true,
    ...auditCols(),
  })
  return id
}

async function upsertDef(def: {
  workflowCode: string
  workflowNameEn: string
  workflowNameAr?: string
  description?: string
  triggerEvent: string
  selectorRuleId?: string | null
  defaultHierarchyType?: 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'
  defaultSlaHours?: number
  defaultEscalationHours?: number
  requiresMedicalCert?: boolean
  requiresManagerComment?: boolean
}): Promise<string> {
  const existing = await db
    .select({ id: workflowDefinitionsV2.id })
    .from(workflowDefinitionsV2)
    .where(and(
      eq(workflowDefinitionsV2.tenantId, TENANT_ID),
      eq(workflowDefinitionsV2.workflowCode, def.workflowCode),
    ))
    .limit(1)

  if (existing.length) return existing[0].id

  const id = randomUUID()
  await db.insert(workflowDefinitionsV2).values({
    id,
    tenantId:               TENANT_ID,
    workflowCode:           def.workflowCode,
    workflowNameEn:         def.workflowNameEn,
    workflowNameAr:         def.workflowNameAr,
    description:            def.description,
    triggerEvent:           def.triggerEvent,
    selectorRuleId:         def.selectorRuleId,
    defaultHierarchyType:   def.defaultHierarchyType ?? 'LINE_MANAGER',
    onApproverNotFound:     'ESCALATE_UP',
    defaultSlaHours:        def.defaultSlaHours ?? 48,
    defaultEscalationHours: def.defaultEscalationHours ?? 72,
    requiresMedicalCert:    def.requiresMedicalCert ?? false,
    requiresManagerComment: def.requiresManagerComment ?? false,
    encryptSnapshot:        true,
    isActive:               true,
    version:                1,
    ...auditCols(),
  })
  return id
}

async function addStep(step: {
  defId: string
  stepOrder: number
  stepCode: string
  stepNameEn: string
  stepNameAr?: string
  hierarchyType: 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'
  hierarchyLevel?: number
  activationConditionId?: string | null
  stepEffect?: 'NORMAL' | 'ADD_IF_MATCHES' | 'REPLACE' | 'SKIP_PREVIOUS' | 'INJECT_BEFORE' | 'INJECT_AFTER' | 'PARALLEL_ADD'
  slaHours?: number
  onSlaBreach?: 'ESCALATE' | 'AUTO_APPROVE' | 'AUTO_REJECT' | 'SEND_REMINDER' | 'BLOCK_FREEZE'
  isFyiOnly?: boolean
  canDelegate?: boolean
  isOptional?: boolean
}) {
  await db.insert(workflowStepsV2).values({
    id:                    randomUUID(),
    tenantId:              TENANT_ID,
    workflowDefinitionId:  step.defId,
    stepOrder:             step.stepOrder,
    stepCode:              step.stepCode,
    stepNameEn:            step.stepNameEn,
    stepNameAr:            step.stepNameAr,
    hierarchyType:         step.hierarchyType,
    hierarchyLevel:        step.hierarchyLevel,
    activationConditionId: step.activationConditionId,
    stepEffect:            step.stepEffect ?? 'NORMAL',
    slaHours:              step.slaHours ?? 48,
    onSlaBreach:           step.onSlaBreach ?? 'ESCALATE',
    isFyiOnly:             step.isFyiOnly ?? false,
    canDelegate:           step.canDelegate ?? true,
    isOptional:            step.isOptional ?? false,
    skipIfAlreadyApproved: true,
    isActive:              true,
    ...auditCols(),
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SEED
// ═════════════════════════════════════════════════════════════════════════════

async function seed() {
  console.log('🌱 Seeding Workflow Engine v2...')

  // ── 1. SLA Calendar ──────────────────────────────────────────────────────

  const calendarExists = await db
    .select({ id: workflowSlaCalendars.id })
    .from(workflowSlaCalendars)
    .where(and(
      eq(workflowSlaCalendars.tenantId, TENANT_ID),
      eq(workflowSlaCalendars.calendarCode, 'UAE_STANDARD'),
    ))
    .limit(1)

  if (!calendarExists.length) {
    await db.insert(workflowSlaCalendars).values({
      id:              randomUUID(),
      tenantId:        TENANT_ID,
      calendarCode:    'UAE_STANDARD',
      calendarNameEn:  'UAE Standard Working Hours (Sun–Thu)',
      workingDays:     [0, 1, 2, 3, 4],   // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu
      timezone:        'Asia/Dubai',
      dayStartTime:    '09:00',
      dayEndTime:      '18:00',
      ramadanStartTime: '09:00',
      ramadanEndTime:   '14:00',
      // Ramadan 2026 (approx) — updated annually
      ramadanStartDate: '2026-02-18',
      ramadanEndDate:   '2026-03-19',
      isActive:         true,
      isDefault:        true,
      ...auditCols(),
    })
    console.log('  ✓ SLA calendar: UAE_STANDARD')
  }

  // ── 2. Workflow Rules ─────────────────────────────────────────────────────

  // Rule: AL_BASIC — standard annual leave (≤7 days, no flags)
  const ruleAlBasicId = await upsertRule({
    ruleCode:    'AL_BASIC',
    ruleNameEn:  'Annual Leave — Basic (≤7 days)',
    description: 'Fires for standard annual leave requests of 7 days or fewer',
    conditionTree: {
      id: 'root',
      operator: 'AND',
      conditions: [
        { id: 'c1', field: 'leave.type_code', operator: 'EQUALS', value: 'ANNUAL', dataType: 'STRING' },
        { id: 'c2', field: 'leave.days', operator: 'LESS_THAN_OR_EQUAL', value: 7, dataType: 'NUMBER' },
        { id: 'c3', field: 'leave.is_backdated', operator: 'IS_FALSE', dataType: 'BOOLEAN' },
      ],
    },
    priority: 10,
  })

  // Rule: AL_HOD — annual leave requiring HOD approval (>7 days OR grade ≥7 OR backdated OR >80% balance used)
  const ruleAlHodId = await upsertRule({
    ruleCode:    'AL_HOD',
    ruleNameEn:  'Annual Leave — HOD Approval Required',
    description: 'Adds HOD approval step when leave is extended, senior, backdated, or near balance limit',
    conditionTree: {
      id: 'root',
      operator: 'OR',
      conditions: [
        { id: 'c1', field: 'leave.days', operator: 'GREATER_THAN', value: 7, dataType: 'NUMBER' },
        { id: 'c2', field: 'employee.grade_level', operator: 'GREATER_THAN_OR_EQUAL', value: 7, dataType: 'NUMBER' },
        { id: 'c3', field: 'leave.is_backdated', operator: 'IS_TRUE', dataType: 'BOOLEAN' },
        { id: 'c4', field: 'leave.balance_pct_used', operator: 'GREATER_THAN', value: 80, dataType: 'NUMBER' },
      ],
    },
    priority: 20,
  })

  // Rule: AL_HAJJ — Hajj leave (Article 28 FDL 33/2021): Muslim employees only, once per service
  const ruleAlHajjId = await upsertRule({
    ruleCode:    'AL_HAJJ',
    ruleNameEn:  'Hajj Leave — UAE FDL 33/2021 Article 28',
    description: 'Applies to Muslim employees requesting Hajj leave',
    conditionTree: {
      id: 'root',
      operator: 'AND',
      conditions: [
        { id: 'c1', field: 'leave.type_code', operator: 'EQUALS', value: 'HAJJ', dataType: 'STRING' },
        { id: 'c2', field: 'employee.religion', operator: 'EQUALS', value: 'ISLAM', dataType: 'STRING' },
      ],
    },
    priority: 5,
  })

  // Rule: SL_CERT — sick leave certificate gate (>3 days)
  const ruleSlCertId = await upsertRule({
    ruleCode:    'SL_CERT',
    ruleNameEn:  'Sick Leave — Certificate Validation Required (>3 days)',
    description: 'Fires for sick leave exceeding 3 days, requiring medical cert validation step',
    conditionTree: {
      id: 'root',
      operator: 'AND',
      conditions: [
        { id: 'c1', field: 'leave.type_code', operator: 'EQUALS', value: 'SICK', dataType: 'STRING' },
        { id: 'c2', field: 'leave.days', operator: 'GREATER_THAN', value: 3, dataType: 'NUMBER' },
      ],
    },
    priority: 10,
  })

  // Rule: ML_FULL — maternity leave 60 days (Article 30 FDL 33/2021)
  const ruleMlFullId = await upsertRule({
    ruleCode:    'ML_FULL',
    ruleNameEn:  'Maternity Leave — Full Entitlement (Article 30)',
    description: 'Standard maternity leave for female employees',
    conditionTree: {
      id: 'root',
      operator: 'AND',
      conditions: [
        { id: 'c1', field: 'leave.type_code', operator: 'EQUALS', value: 'MATERNITY', dataType: 'STRING' },
        { id: 'c2', field: 'employee.gender', operator: 'EQUALS', value: 'FEMALE', dataType: 'STRING' },
      ],
    },
    priority: 5,
  })

  // Rule: OT_WEEKEND — overtime on weekend / public holiday
  const ruleOtWeekendId = await upsertRule({
    ruleCode:    'OT_WEEKEND',
    ruleNameEn:  'Overtime — Weekend or Public Holiday',
    description: 'Adds extra Finance approval for overtime on weekends or public holidays',
    conditionTree: {
      id: 'root',
      operator: 'OR',
      conditions: [
        { id: 'c1', field: 'overtime.is_weekend', operator: 'IS_TRUE', dataType: 'BOOLEAN' },
        { id: 'c2', field: 'overtime.is_public_holiday', operator: 'IS_TRUE', dataType: 'BOOLEAN' },
      ],
    },
    priority: 10,
  })

  // Rule: SAL_MAJOR — salary revision >10% change
  const ruleSalMajorId = await upsertRule({
    ruleCode:    'SAL_MAJOR',
    ruleNameEn:  'Salary Revision — Major Change (>10%)',
    description: 'Routes salary revisions exceeding 10% to Entity Head for approval',
    conditionTree: {
      id: 'root',
      operator: 'AND',
      conditions: [
        { id: 'c1', field: 'assignment.action_type', operator: 'EQUALS', value: 'SALARY_REVISION', dataType: 'STRING' },
        { id: 'c2', field: 'assignment.salary_change_pct', operator: 'GREATER_THAN', value: 10, dataType: 'NUMBER' },
      ],
    },
    priority: 10,
  })

  console.log('  ✓ Workflow rules seeded (7 rules)')

  // ── 3. Workflow Definitions ───────────────────────────────────────────────

  // WF-001: Annual Leave
  const wf001Id = await upsertDef({
    workflowCode:    'WF_ANNUAL_LEAVE',
    workflowNameEn:  'Annual Leave Request',
    workflowNameAr:  'طلب إجازة سنوية',
    description:     'Standard annual leave approval. HOD step added dynamically for extended/senior requests.',
    triggerEvent:    'LEAVE_REQUEST',
    defaultSlaHours: 48,
  })

  await addStep({ defId: wf001Id, stepOrder: 1, stepCode: 'LM_APPROVAL', stepNameEn: 'Line Manager Approval', stepNameAr: 'موافقة المدير المباشر', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1, slaHours: 48 })
  await addStep({ defId: wf001Id, stepOrder: 2, stepCode: 'HOD_APPROVAL', stepNameEn: 'Head of Department Approval', stepNameAr: 'موافقة رئيس القسم', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1, activationConditionId: ruleAlHodId, stepEffect: 'ADD_IF_MATCHES', slaHours: 24 })

  // WF-002: Sick Leave
  const wf002Id = await upsertDef({
    workflowCode:    'WF_SICK_LEAVE',
    workflowNameEn:  'Sick Leave Request',
    workflowNameAr:  'طلب إجازة مرضية',
    description:     'Sick leave with medical certificate validation for >3 days (Article 30 FDL 33/2021)',
    triggerEvent:    'LEAVE_REQUEST',
    requiresMedicalCert: true,
    defaultSlaHours: 24,
  })

  await addStep({ defId: wf002Id, stepOrder: 1, stepCode: 'LM_APPROVAL', stepNameEn: 'Line Manager Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1, slaHours: 24 })
  await addStep({ defId: wf002Id, stepOrder: 2, stepCode: 'HR_CERT_VERIFY', stepNameEn: 'HR Certificate Verification', hierarchyType: 'CUSTOM_GROUP', activationConditionId: ruleSlCertId, stepEffect: 'ADD_IF_MATCHES', slaHours: 24, isFyiOnly: false })

  // WF-003: Maternity Leave
  const wf003Id = await upsertDef({
    workflowCode:    'WF_MATERNITY_LEAVE',
    workflowNameEn:  'Maternity Leave Request',
    workflowNameAr:  'طلب إجازة أمومة',
    description:     'Maternity leave — Article 30 FDL 33/2021. 60 calendar days for female employees.',
    triggerEvent:    'LEAVE_REQUEST',
    selectorRuleId:  ruleMlFullId,
    defaultSlaHours: 24,
  })

  await addStep({ defId: wf003Id, stepOrder: 1, stepCode: 'LM_APPROVAL', stepNameEn: 'Line Manager Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1, slaHours: 24 })
  await addStep({ defId: wf003Id, stepOrder: 2, stepCode: 'HR_ADMIN_VERIFY', stepNameEn: 'HR Admin Verification', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })
  await addStep({ defId: wf003Id, stepOrder: 3, stepCode: 'HOD_FYI', stepNameEn: 'HOD Notification (FYI)', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1, slaHours: 0, isFyiOnly: true })

  // WF-004: Hajj Leave
  const wf004Id = await upsertDef({
    workflowCode:    'WF_HAJJ_LEAVE',
    workflowNameEn:  'Hajj Leave Request',
    workflowNameAr:  'طلب إجازة حج',
    description:     'Hajj leave — Article 28 FDL 33/2021. 30 days, once per service.',
    triggerEvent:    'LEAVE_REQUEST',
    selectorRuleId:  ruleAlHajjId,
    defaultSlaHours: 48,
  })

  await addStep({ defId: wf004Id, stepOrder: 1, stepCode: 'LM_APPROVAL', stepNameEn: 'Line Manager Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1, slaHours: 48 })
  await addStep({ defId: wf004Id, stepOrder: 2, stepCode: 'HOD_APPROVAL', stepNameEn: 'HOD Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1, slaHours: 24 })
  await addStep({ defId: wf004Id, stepOrder: 3, stepCode: 'HR_VERIFY', stepNameEn: 'HR Eligibility Verification', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })

  // WF-005: Overtime Request
  const wf005Id = await upsertDef({
    workflowCode:    'WF_OVERTIME',
    workflowNameEn:  'Overtime Request',
    workflowNameAr:  'طلب عمل إضافي',
    description:     'Overtime approval. Finance step added for weekend/holiday overtime.',
    triggerEvent:    'OVERTIME_REQUEST',
    defaultSlaHours: 24,
  })

  await addStep({ defId: wf005Id, stepOrder: 1, stepCode: 'LM_APPROVAL', stepNameEn: 'Line Manager Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1, slaHours: 24 })
  await addStep({ defId: wf005Id, stepOrder: 2, stepCode: 'FINANCE_APPROVAL', stepNameEn: 'Finance Approval (Weekend/Holiday OT)', hierarchyType: 'CUSTOM_GROUP', activationConditionId: ruleOtWeekendId, stepEffect: 'ADD_IF_MATCHES', slaHours: 24 })

  // WF-006: Salary Revision
  const wf006Id = await upsertDef({
    workflowCode:    'WF_SALARY_REVISION',
    workflowNameEn:  'Salary Revision',
    workflowNameAr:  'مراجعة الراتب',
    description:     'Salary revision approval chain. Entity Head approval required for >10% changes.',
    triggerEvent:    'SALARY_REVISION',
    defaultHierarchyType: 'LINE_MANAGER',
    defaultSlaHours: 72,
    requiresManagerComment: true,
  })

  await addStep({ defId: wf006Id, stepOrder: 1, stepCode: 'HOD_APPROVAL', stepNameEn: 'HOD Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1, slaHours: 48 })
  await addStep({ defId: wf006Id, stepOrder: 2, stepCode: 'HR_REVIEW', stepNameEn: 'HR Review & Grade Check', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })
  await addStep({ defId: wf006Id, stepOrder: 3, stepCode: 'ENTITY_HEAD', stepNameEn: 'Entity Head Approval (>10%)', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -2, activationConditionId: ruleSalMajorId, stepEffect: 'ADD_IF_MATCHES', slaHours: 48 })

  // WF-007: New Hire
  const wf007Id = await upsertDef({
    workflowCode:    'WF_NEW_HIRE',
    workflowNameEn:  'New Employee Hire',
    workflowNameAr:  'تعيين موظف جديد',
    description:     'New hire approval chain: HOD → HR → Finance → Legal Entity Head',
    triggerEvent:    'HIRE',
    defaultSlaHours: 72,
    requiresManagerComment: true,
  })

  await addStep({ defId: wf007Id, stepOrder: 1, stepCode: 'HOD_APPROVAL', stepNameEn: 'HOD Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1, slaHours: 48 })
  await addStep({ defId: wf007Id, stepOrder: 2, stepCode: 'HR_APPROVAL', stepNameEn: 'HR Admin Approval', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })
  await addStep({ defId: wf007Id, stepOrder: 3, stepCode: 'FINANCE_APPROVAL', stepNameEn: 'Finance Approval', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })

  // WF-008: Transfer/Promotion
  const wf008Id = await upsertDef({
    workflowCode:    'WF_TRANSFER',
    workflowNameEn:  'Transfer / Promotion',
    workflowNameAr:  'نقل / ترقية',
    description:     'Internal transfer and promotion approval',
    triggerEvent:    'TRANSFER',
    defaultSlaHours: 48,
  })

  await addStep({ defId: wf008Id, stepOrder: 1, stepCode: 'CURRENT_HOD', stepNameEn: 'Current HOD Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1, slaHours: 48 })
  await addStep({ defId: wf008Id, stepOrder: 2, stepCode: 'HR_REVIEW', stepNameEn: 'HR Review', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })

  // WF-009: Termination
  const wf009Id = await upsertDef({
    workflowCode:    'WF_TERMINATION',
    workflowNameEn:  'Employee Termination',
    workflowNameAr:  'إنهاء الخدمة',
    description:     'Termination approval: HOD → HR → Legal Entity Head',
    triggerEvent:    'TERMINATION',
    defaultSlaHours: 72,
  })

  await addStep({ defId: wf009Id, stepOrder: 1, stepCode: 'HOD_APPROVAL', stepNameEn: 'HOD Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1, slaHours: 48 })
  await addStep({ defId: wf009Id, stepOrder: 2, stepCode: 'HR_APPROVAL', stepNameEn: 'HR Approval', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })
  await addStep({ defId: wf009Id, stepOrder: 3, stepCode: 'ENTITY_HEAD', stepNameEn: 'Entity Head Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -2, slaHours: 48 })

  // WF-010: Exit Clearance
  const wf010Id = await upsertDef({
    workflowCode:    'WF_EXIT_CLEARANCE',
    workflowNameEn:  'Exit Clearance',
    workflowNameAr:  'مخالصة نهاية الخدمة',
    description:     'Multi-department exit clearance checklist',
    triggerEvent:    'EXIT_CLEARANCE',
    defaultSlaHours: 72,
  })

  await addStep({ defId: wf010Id, stepOrder: 1, stepCode: 'IT_CLEARANCE', stepNameEn: 'IT Clearance', hierarchyType: 'CUSTOM_GROUP', slaHours: 48, isFyiOnly: false })
  await addStep({ defId: wf010Id, stepOrder: 2, stepCode: 'FINANCE_CLEARANCE', stepNameEn: 'Finance Clearance', hierarchyType: 'CUSTOM_GROUP', slaHours: 48 })
  await addStep({ defId: wf010Id, stepOrder: 3, stepCode: 'HR_FINAL', stepNameEn: 'HR Final Sign-off', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })

  // WF-011: Probation Confirmation
  const wf011Id = await upsertDef({
    workflowCode:    'WF_PROBATION_CONFIRM',
    workflowNameEn:  'Probation Period Confirmation',
    workflowNameAr:  'تأكيد فترة التجربة',
    description:     'Confirm or extend employee probation period',
    triggerEvent:    'PROBATION_CONFIRM',
    defaultSlaHours: 48,
  })

  await addStep({ defId: wf011Id, stepOrder: 1, stepCode: 'LM_ASSESSMENT', stepNameEn: 'Line Manager Assessment', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1, slaHours: 48 })
  await addStep({ defId: wf011Id, stepOrder: 2, stepCode: 'HR_CONFIRM', stepNameEn: 'HR Confirmation', hierarchyType: 'CUSTOM_GROUP', slaHours: 24 })

  // WF-012: Visa Renewal
  const wf012Id = await upsertDef({
    workflowCode:    'WF_VISA_RENEWAL',
    workflowNameEn:  'Visa / Residency Renewal',
    workflowNameAr:  'تجديد التأشيرة / الإقامة',
    description:     'Residency visa renewal workflow — MOHRE compliance',
    triggerEvent:    'VISA_RENEWAL',
    defaultSlaHours: 48,
  })

  await addStep({ defId: wf012Id, stepOrder: 1, stepCode: 'LM_APPROVAL', stepNameEn: 'Line Manager Approval', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1, slaHours: 48 })
  await addStep({ defId: wf012Id, stepOrder: 2, stepCode: 'PRO_PROCESS', stepNameEn: 'PRO Processing (FYI)', hierarchyType: 'CUSTOM_GROUP', slaHours: 24, isFyiOnly: true })

  console.log('  ✓ Workflow definitions seeded (12 core workflows)')
  console.log('  ✓ Workflow steps seeded')
  console.log('\n✅ Workflow Engine v2 seed complete.')
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  })
