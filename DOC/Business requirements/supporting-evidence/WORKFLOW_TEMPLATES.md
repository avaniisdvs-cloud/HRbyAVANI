# AVANIIS HR — Workflow Templates
## All 12 Core Workflow Configurations (Seed Data)

**Status:** Design — Ready for seed data implementation  
**Date:** 2026-05-01  
**Format:** TypeScript objects matching Drizzle schema from WORKFLOW_DATA_MODEL.md

---

## Seed Data Constants

```typescript
// Used in all seed records
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'
const TENANT_ID       = process.env.TENANT_ID!

// Workflow definition codes
export const WF_CODES = {
  LEAVE_ANNUAL:         'WF-LEAVE-ANNUAL',
  LEAVE_SICK:           'WF-LEAVE-SICK',
  LEAVE_EMERGENCY:      'WF-LEAVE-EMERGENCY',
  LEAVE_MATERNITY:      'WF-LEAVE-MATERNITY',
  LEAVE_PATERNITY:      'WF-LEAVE-PATERNITY',
  LEAVE_HAJJ:           'WF-LEAVE-HAJJ',
  LEAVE_STUDY:          'WF-LEAVE-STUDY',
  LEAVE_UNPAID:         'WF-LEAVE-UNPAID',
  HIRE_BACKDATED:       'WF-HIRE-BACKDATED',
  SALARY_INCREMENT:     'WF-SALARY-INCREMENT',
  DOCUMENT_APPROVAL:    'WF-DOCUMENT-APPROVAL',
  ATTENDANCE_CORRECTION:'WF-ATTENDANCE-CORRECTION',
  TRAVEL_REQUEST:       'WF-TRAVEL-REQUEST',
  EMPLOYMENT_ACTION:    'WF-EMPLOYMENT-ACTION',
  PROBATION_CONFIRM:    'WF-PROBATION-CONFIRM',
  RESIGNATION:          'WF-RESIGNATION',
  OVERTIME:             'WF-OVERTIME',
  BANK_DETAILS:         'WF-BANK-DETAILS',
  ACCESS_REQUEST:       'WF-ACCESS-REQUEST',
} as const

// Rule codes
export const RULE_CODES = {
  // Leave rules
  AL_HOD:       'RULE-AL-HOD',
  AL_HRADMIN:   'RULE-AL-HRADMIN',
  SL_HR:        'RULE-SL-HR',
  // Salary rules
  SAL_HOD:      'RULE-SAL-HOD',
  SAL_FINANCE:  'RULE-SAL-FINANCE',
  SAL_EXEC:     'RULE-SAL-EXEC',
  // Attendance
  ATT_HR:       'RULE-ATT-HR',
  // Travel
  TRAVEL_FIN:   'RULE-TRAVEL-FIN',
  TRAVEL_HOD:   'RULE-TRAVEL-HOD',
  TRAVEL_EXEC:  'RULE-TRAVEL-EXEC',
  // Employment action
  EA_POSITION:  'RULE-EA-POSITION',
  EA_FINANCE:   'RULE-EA-FINANCE',
  // Access
  ACCESS_HR:    'RULE-ACCESS-HR',
} as const
```

---

## Part 1 — Workflow Rules (Condition Trees)

```typescript
export const workflowRuleSeeds = [

  // ── ANNUAL LEAVE RULES ───────────────────────────────────────────────────

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.AL_HOD,
    ruleName:     'Annual Leave — HOD Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'leave.days',            operator: 'GREATER_THAN',             value: 7,    dataType: 'NUMBER' },
      { id: 'c2', field: 'employee.grade_level',  operator: 'GREATER_THAN_OR_EQUAL',    value: 7,    dataType: 'NUMBER' },
      { id: 'c3', field: 'leave.is_backdated',    operator: 'IS_TRUE',                  dataType: 'BOOLEAN' },
      { id: 'c4', field: 'leave.balance_pct_used', operator: 'GREATER_THAN',            value: 80,   dataType: 'NUMBER' },
    ],
    description: 'HOD reviews: leave >7 days, senior staff (grade 7+), backdated, or low balance',
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.AL_HRADMIN,
    ruleName:     'Annual Leave — HR Admin Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'leave.days',          operator: 'GREATER_THAN',  value: 14, dataType: 'NUMBER' },
      { id: 'c2', field: 'leave.type',          operator: 'IN',
        value: ['MATERNITY', 'PATERNITY', 'HAJJ', 'STUDY'], dataType: 'ARRAY_STRING' },
      {
        id: 'c3', type: 'GROUP', operator: 'AND',
        conditions: [
          { id: 'c3a', field: 'leave.is_backdated',   operator: 'IS_TRUE',        dataType: 'BOOLEAN' },
          { id: 'c3b', field: 'leave.backdated_days', operator: 'GREATER_THAN',   value: 30, dataType: 'NUMBER' },
        ],
      },
      { id: 'c4', field: 'leave.balance_remaining', operator: 'LESS_THAN', value: 0, dataType: 'NUMBER' },
    ],
    description: 'HR Admin reviews: long leave, special types, extreme backdating, negative balance',
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── SICK LEAVE RULES ─────────────────────────────────────────────────────

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.SL_HR,
    ruleName:     'Sick Leave — HR Admin Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'leave.days', operator: 'GREATER_THAN', value: 2,  dataType: 'NUMBER' },
      { id: 'c2', field: 'leave.days', operator: 'GREATER_THAN', value: 15, dataType: 'NUMBER' },
    ],
    description: 'HR Admin: sick leave >2 days (cert required) or >15 days (half-pay tier)',
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── SALARY INCREMENT RULES ───────────────────────────────────────────────

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.SAL_HOD,
    ruleName:     'Salary Increment — HOD Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'salary.increment_pct', operator: 'GREATER_THAN', value: 5,     dataType: 'NUMBER' },
      { id: 'c2', field: 'salary.new_basic',     operator: 'GREATER_THAN', value: 20000, dataType: 'NUMBER' },
    ],
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.SAL_FINANCE,
    ruleName:     'Salary Increment — Finance Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'salary.new_basic',     operator: 'GREATER_THAN', value: 30000, dataType: 'NUMBER' },
      { id: 'c2', field: 'salary.increment_pct', operator: 'GREATER_THAN', value: 15,    dataType: 'NUMBER' },
    ],
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.SAL_EXEC,
    ruleName:     'Salary Increment — Executive Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'salary.new_basic',     operator: 'GREATER_THAN', value: 50000, dataType: 'NUMBER' },
      { id: 'c2', field: 'salary.increment_pct', operator: 'GREATER_THAN', value: 20,    dataType: 'NUMBER' },
    ],
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── ATTENDANCE CORRECTION RULES ──────────────────────────────────────────

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.ATT_HR,
    ruleName:     'Attendance Correction — HR Admin Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'attendance.correction_type', operator: 'EQUALS',  value: 'BOTH', dataType: 'STRING' },
      { id: 'c2', field: 'attendance.missed_days',     operator: 'GREATER_THAN', value: 3,  dataType: 'NUMBER' },
      { id: 'c3', field: 'attendance.is_repeated',     operator: 'IS_TRUE',           dataType: 'BOOLEAN' },
    ],
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── TRAVEL RULES ─────────────────────────────────────────────────────────

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.TRAVEL_FIN,
    ruleName:     'Travel — Finance Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'travel.estimated_cost_aed', operator: 'GREATER_THAN', value: 5000, dataType: 'NUMBER' },
      { id: 'c2', field: 'travel.is_international',   operator: 'IS_TRUE',                    dataType: 'BOOLEAN' },
    ],
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.TRAVEL_HOD,
    ruleName:     'Travel — HOD Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'travel.duration_days', operator: 'GREATER_THAN', value: 5, dataType: 'NUMBER' },
      {
        id: 'c2', type: 'GROUP', operator: 'AND',
        conditions: [
          { id: 'c2a', field: 'travel.is_international', operator: 'IS_TRUE',  dataType: 'BOOLEAN' },
          { id: 'c2b', field: 'travel.is_gcc_country',   operator: 'IS_FALSE', dataType: 'BOOLEAN' },
        ],
      },
    ],
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.TRAVEL_EXEC,
    ruleName:     'Travel — Executive Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'travel.estimated_cost_aed', operator: 'GREATER_THAN', value: 20000, dataType: 'NUMBER' },
      { id: 'c2', field: 'travel.duration_days',      operator: 'GREATER_THAN', value: 14,    dataType: 'NUMBER' },
    ],
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── EMPLOYMENT ACTION RULES ───────────────────────────────────────────────

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.EA_POSITION,
    ruleName:     'Employment Action — Position Hierarchy Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'OR' as const,
    conditions: [
      { id: 'c1', field: 'employment_action.type', operator: 'IN',
        value: ['PROMOTE', 'GRADE_CHANGE'], dataType: 'ARRAY_STRING' },
    ],
    description: 'Promote and grade changes go through position hierarchy for formal org approval',
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.EA_FINANCE,
    ruleName:     'Employment Action — Finance Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'AND' as const,
    conditions: [
      { id: 'c1', field: 'employment_action.salary_impact_pct', operator: 'GREATER_THAN', value: 10, dataType: 'NUMBER' },
    ],
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── ACCESS REQUEST RULES ──────────────────────────────────────────────────

  {
    tenantId:     TENANT_ID,
    ruleCode:     RULE_CODES.ACCESS_HR,
    ruleName:     'Access Request — HR Admin Step Activation',
    rulePurpose:  'STEP_ACTIVATION' as const,
    logicOperator: 'AND' as const,
    conditions: [
      { id: 'c1', field: 'request.requested_role', operator: 'IN',
        value: ['HR_ADMIN', 'PAYROLL_MANAGER', 'EXECUTIVE', 'SUPER_ADMIN'], dataType: 'ARRAY_STRING' },
    ],
    description: 'HR Admin must approve high-privilege role assignments',
    isActive: true,
    createdBy: SYSTEM_ACTOR_ID,
  },
]
```

---

## Part 2 — Workflow Definitions

```typescript
export const workflowDefinitionSeeds = [

  // ── WF-001: Annual Leave ──────────────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.LEAVE_ANNUAL,
    name: 'Annual Leave Approval', nameAr: 'موافقة على الإجازة السنوية',
    module: 'LEAVE' as const, triggerEvent: 'LEAVE_SUBMITTED_ANNUAL',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ESCALATE_UP' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-002: Backdated Hire ────────────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.HIRE_BACKDATED,
    name: 'Backdated Hire Approval', nameAr: 'موافقة على التوظيف بأثر رجعي',
    module: 'CORE_HR' as const, triggerEvent: 'HIRE_BACKDATED',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ASSIGN_HR_ADMIN' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-003: Salary Increment ──────────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.SALARY_INCREMENT,
    name: 'Salary Increment Approval', nameAr: 'موافقة على زيادة الراتب',
    module: 'PAYROLL' as const, triggerEvent: 'SALARY_CHANGE_SUBMITTED',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ESCALATE_UP' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-004: Document Approval ─────────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.DOCUMENT_APPROVAL,
    name: 'Document of Record Approval', nameAr: 'موافقة على المستند الرسمي',
    module: 'CORE_HR' as const, triggerEvent: 'DOCUMENT_UPLOADED',
    defaultHierarchyType: 'ROLE_IN_ORG' as const,
    onApproverNotFound: 'ASSIGN_HR_ADMIN' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-005: Attendance Correction ─────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.ATTENDANCE_CORRECTION,
    name: 'Attendance Correction Approval', nameAr: 'موافقة على تصحيح الحضور',
    module: 'ATTENDANCE' as const, triggerEvent: 'ATTENDANCE_CORRECTION_SUBMITTED',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ASSIGN_HR_ADMIN' as const,
    autoApproveAfterSla: true,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-006: Travel Request ─────────────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.TRAVEL_REQUEST,
    name: 'Business Travel / Meeting Request', nameAr: 'طلب سفر عمل / اجتماع',
    module: 'TRAVEL' as const, triggerEvent: 'TRAVEL_REQUEST_SUBMITTED',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ESCALATE_UP' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-007: Employment Action ──────────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.EMPLOYMENT_ACTION,
    name: 'Employment Action Approval', nameAr: 'موافقة على إجراء توظيف',
    module: 'CORE_HR' as const, triggerEvent: 'EMPLOYMENT_ACTION_SUBMITTED',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ESCALATE_UP' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-008: Probation Confirmation ────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.PROBATION_CONFIRM,
    name: 'Probation Confirmation', nameAr: 'تأكيد انتهاء فترة التجربة',
    module: 'CORE_HR' as const, triggerEvent: 'PROBATION_REVIEW_DUE',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ASSIGN_HR_ADMIN' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-009: Resignation / Offboarding ─────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.RESIGNATION,
    name: 'Resignation & Offboarding Clearance', nameAr: 'إجراءات الاستقالة والإنهاء',
    module: 'CORE_HR' as const, triggerEvent: 'RESIGNATION_SUBMITTED',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ASSIGN_HR_ADMIN' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-010: Overtime Pre-Approval ──────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.OVERTIME,
    name: 'Overtime Pre-Approval', nameAr: 'الموافقة المسبقة على العمل الإضافي',
    module: 'ATTENDANCE' as const, triggerEvent: 'OVERTIME_REQUEST_SUBMITTED',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ESCALATE_UP' as const,
    autoApproveAfterSla: false,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-011: Bank Details Change ────────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.BANK_DETAILS,
    name: 'Bank Details Change (PII — Elevated)', nameAr: 'تغيير بيانات الحساب البنكي',
    module: 'PAYROLL' as const, triggerEvent: 'BANK_DETAILS_CHANGE_SUBMITTED',
    defaultHierarchyType: 'ROLE_IN_ORG' as const,
    onApproverNotFound: 'BLOCK_WITH_ERROR' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },

  // ── WF-012: System Access Request ──────────────────────────────────────────
  {
    tenantId: TENANT_ID, code: WF_CODES.ACCESS_REQUEST,
    name: 'System Access / Role Assignment Request', nameAr: 'طلب صلاحيات النظام',
    module: 'ACCESS' as const, triggerEvent: 'ACCESS_REQUEST_SUBMITTED',
    defaultHierarchyType: 'LINE_MANAGER' as const,
    onApproverNotFound: 'ASSIGN_HR_ADMIN' as const,
    allowSelfApproval: false, isActive: true, version: 1,
    createdBy: SYSTEM_ACTOR_ID,
  },
]
```

---

## Part 3 — Workflow Steps (All 12 Workflows)

Steps reference `workflowDefId` by code (resolved after definitions are inserted).

```typescript
// Steps are grouped by workflow code for readability.
// step_order values are contiguous integers starting at 1.
// Conditional steps have activationConditionRuleCode (resolved to UUID at seed time).

export const workflowStepSeeds: Array<{
  workflowCode: string
  stepOrder: number
  stepName: string
  stepNameAr: string
  stepType: string
  hierarchyType: string
  hierarchyLevel?: number
  hierarchyRole?: string
  activationRuleCode?: string
  stepEffect: string
  slaHours: number
  onSlaBreach: string
  escalationHierarchyType?: string
  escalationLevel?: number
  escalationRole?: string
  parallelVoting?: string
  actionsAvailable: string[]
  requiresCommentOn: string[]
  notifyChannels: string[]
}> = [

  // ══════════════════════════════════════════════════════════════════════════
  // WF-001: ANNUAL LEAVE
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.LEAVE_ANNUAL,
    stepOrder: 1, stepName: 'Line Manager Approval', stepNameAr: 'موافقة المدير المباشر',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'LINE_MANAGER', escalationLevel: 2,
    actionsAvailable: ['APPROVE', 'REJECT', 'DELEGATE', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.LEAVE_ANNUAL,
    stepOrder: 2, stepName: 'Head of Department Approval', stepNameAr: 'موافقة رئيس القسم',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1,
    activationRuleCode: RULE_CODES.AL_HOD,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'ROLE_IN_ORG', escalationRole: 'HR_ADMIN',
    actionsAvailable: ['APPROVE', 'REJECT', 'DELEGATE', 'SEND_BACK'],
    requiresCommentOn: ['REJECT', 'SEND_BACK'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.LEAVE_ANNUAL,
    stepOrder: 3, stepName: 'HR Admin Review', stepNameAr: 'مراجعة مسؤول الموارد البشرية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    activationRuleCode: RULE_CODES.AL_HRADMIN,
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'AUTO_APPROVE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.LEAVE_ANNUAL,
    stepOrder: 4, stepName: 'System: Process Approved Leave', stepNameAr: 'النظام: معالجة الإجازة الموافق عليها',
    stepType: 'AUTO', hierarchyType: 'INITIATOR_SELF',
    stepEffect: 'NORMAL', slaHours: 1, onSlaBreach: 'NOTIFY_ONLY',
    actionsAvailable: [], requiresCommentOn: [],
    notifyChannels: ['IN_APP', 'EMAIL'],
    // AUTO step actions: deduct leave balance, create calendar block, send confirmation
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-002: BACKDATED HIRE
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.HIRE_BACKDATED,
    stepOrder: 1, stepName: "HR Admin's Line Manager", stepNameAr: 'مدير مسؤول الموارد البشرية',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    // Initiator = HR Admin who created record; their line manager approves
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'ROLE_IN_ORG', escalationRole: 'HR_HOD',
    actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.HIRE_BACKDATED,
    stepOrder: 2, stepName: 'HR Head of Department', stepNameAr: 'رئيس قسم الموارد البشرية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_HOD',
    // Always runs — backdated hire is elevated risk (BR-WF-010)
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'ROLE_IN_ORG', escalationRole: 'HR_ADMIN',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-003: SALARY INCREMENT
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.SALARY_INCREMENT,
    stepOrder: 1, stepName: 'Line Manager', stepNameAr: 'المدير المباشر',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    stepEffect: 'NORMAL', slaHours: 72, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'LINE_MANAGER', escalationLevel: 2,
    actionsAvailable: ['APPROVE', 'REJECT', 'SEND_BACK', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT', 'SEND_BACK'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.SALARY_INCREMENT,
    stepOrder: 2, stepName: 'Head of Department', stepNameAr: 'رئيس القسم',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1,
    activationRuleCode: RULE_CODES.SAL_HOD,
    stepEffect: 'NORMAL', slaHours: 72, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'ROLE_IN_ORG', escalationRole: 'HR_ADMIN',
    actionsAvailable: ['APPROVE', 'REJECT', 'SEND_BACK'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.SALARY_INCREMENT,
    stepOrder: 3, stepName: 'HR Admin (Mandatory)', stepNameAr: 'مسؤول الموارد البشرية (إلزامي)',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'ROLE_IN_ORG', escalationRole: 'HR_HOD',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.SALARY_INCREMENT,
    stepOrder: 4, stepName: 'Finance / Payroll Manager', stepNameAr: 'مدير المالية / الرواتب',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'PAYROLL_MANAGER',
    activationRuleCode: RULE_CODES.SAL_FINANCE,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.SALARY_INCREMENT,
    stepOrder: 5, stepName: 'Executive Approval', stepNameAr: 'موافقة الإدارة التنفيذية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'EXECUTIVE',
    activationRuleCode: RULE_CODES.SAL_EXEC,
    stepEffect: 'NORMAL', slaHours: 96, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-004: DOCUMENT APPROVAL
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.DOCUMENT_APPROVAL,
    stepOrder: 1, stepName: 'HR Admin Verification', stepNameAr: 'التحقق من مسؤول الموارد البشرية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-005: ATTENDANCE CORRECTION
  // Auto-approve on SLA breach — cannot block time-sensitive corrections
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.ATTENDANCE_CORRECTION,
    stepOrder: 1, stepName: 'Line Manager', stepNameAr: 'المدير المباشر',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'AUTO_APPROVE',
    actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.ATTENDANCE_CORRECTION,
    stepOrder: 2, stepName: 'HR Admin Review', stepNameAr: 'مراجعة مسؤول الموارد البشرية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    activationRuleCode: RULE_CODES.ATT_HR,
    stepEffect: 'NORMAL', slaHours: 8, onSlaBreach: 'AUTO_APPROVE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-006: TRAVEL REQUEST
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.TRAVEL_REQUEST,
    stepOrder: 1, stepName: 'Line Manager', stepNameAr: 'المدير المباشر',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'LINE_MANAGER', escalationLevel: 2,
    actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.TRAVEL_REQUEST,
    stepOrder: 2, stepName: 'Finance Manager (Budget Check)', stepNameAr: 'مدير المالية (مراجعة الميزانية)',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'FINANCE_MANAGER',
    activationRuleCode: RULE_CODES.TRAVEL_FIN,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.TRAVEL_REQUEST,
    stepOrder: 3, stepName: 'Head of Department', stepNameAr: 'رئيس القسم',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1,
    activationRuleCode: RULE_CODES.TRAVEL_HOD,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT', 'SEND_BACK'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.TRAVEL_REQUEST,
    stepOrder: 4, stepName: 'Executive', stepNameAr: 'الإدارة التنفيذية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'EXECUTIVE',
    activationRuleCode: RULE_CODES.TRAVEL_EXEC,
    stepEffect: 'NORMAL', slaHours: 72, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-007: EMPLOYMENT ACTION (Promote / Transfer / Grade Change)
  // Note: Step 2 uses POSITION hierarchy — explicit per-step switch
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.EMPLOYMENT_ACTION,
    stepOrder: 1, stepName: 'Line Manager (N+1)', stepNameAr: 'المدير المباشر',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    stepEffect: 'NORMAL', slaHours: 72, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'LINE_MANAGER', escalationLevel: 2,
    actionsAvailable: ['APPROVE', 'REJECT', 'SEND_BACK', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT', 'SEND_BACK'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.EMPLOYMENT_ACTION,
    stepOrder: 2, stepName: 'Position Hierarchy (Formal Org Approval)', stepNameAr: 'الموافقة الرسمية عبر هيكل المناصب',
    stepType: 'APPROVAL', hierarchyType: 'POSITION', hierarchyLevel: 2,
    // POSITION hierarchy — formal org chart sign-off for promotions/grade changes
    activationRuleCode: RULE_CODES.EA_POSITION,
    stepEffect: 'NORMAL', slaHours: 72, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT', 'SEND_BACK'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.EMPLOYMENT_ACTION,
    stepOrder: 3, stepName: 'HR Admin (Mandatory)', stepNameAr: 'مسؤول الموارد البشرية (إلزامي)',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.EMPLOYMENT_ACTION,
    stepOrder: 4, stepName: 'Finance / Payroll (Salary Impact)', stepNameAr: 'المالية / الرواتب (تأثير الراتب)',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'PAYROLL_MANAGER',
    activationRuleCode: RULE_CODES.EA_FINANCE,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-008: PROBATION CONFIRMATION
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.PROBATION_CONFIRM,
    stepOrder: 1, stepName: 'Line Manager Recommendation', stepNameAr: 'توصية المدير المباشر',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    stepEffect: 'NORMAL', slaHours: 120, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'ROLE_IN_ORG', escalationRole: 'HR_ADMIN',
    actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'],
    // APPROVE = confirm employment; REJECT = extend probation or terminate
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.PROBATION_CONFIRM,
    stepOrder: 2, stepName: 'HR Admin Processing', stepNameAr: 'معالجة مسؤول الموارد البشرية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-009: RESIGNATION / OFFBOARDING
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.RESIGNATION,
    stepOrder: 1, stepName: 'HR Admin Acknowledgement', stepNameAr: 'إقرار مسؤول الموارد البشرية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.RESIGNATION,
    stepOrder: 2, stepName: 'Department Clearance Checklist', stepNameAr: 'قائمة تسوية القسم',
    stepType: 'PARALLEL_GROUP', hierarchyType: 'ROLE_IN_DEPT', hierarchyRole: 'DEPARTMENT_MANAGER',
    stepEffect: 'NORMAL', slaHours: 120,
    parallelVoting: 'ALL_MUST',
    onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: [],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.RESIGNATION,
    stepOrder: 3, stepName: 'Finance: EOSG Calculation Sign-off', stepNameAr: 'المالية: توقيع حساب مكافأة نهاية الخدمة',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'FINANCE_MANAGER',
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.RESIGNATION,
    stepOrder: 4, stepName: 'System: IT Access Revocation', stepNameAr: 'النظام: إلغاء صلاحيات تقنية المعلومات',
    stepType: 'AUTO', hierarchyType: 'INITIATOR_SELF',
    stepEffect: 'NORMAL', slaHours: 1, onSlaBreach: 'NOTIFY_ONLY',
    actionsAvailable: [], requiresCommentOn: [],
    notifyChannels: ['IN_APP'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-010: OVERTIME PRE-APPROVAL
  // Pre-submit guard: check annual OT hours < 144 (BR-OT-003)
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.OVERTIME,
    stepOrder: 1, stepName: 'Line Manager', stepNameAr: 'المدير المباشر',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    escalationHierarchyType: 'LINE_MANAGER', escalationLevel: 2,
    actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.OVERTIME,
    stepOrder: 2, stepName: 'HR Admin Review', stepNameAr: 'مراجعة مسؤول الموارد البشرية',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    // Activated when monthly OT hours exceed threshold
    // activationRuleCode: would reference a rule checking ot_hours_this_month > 20
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-011: BANK DETAILS CHANGE (PII — Elevated)
  // Pre-submit: step-up re-authentication required
  // On Approve: effective after NEXT payroll run (not immediately)
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.BANK_DETAILS,
    stepOrder: 1, stepName: 'HR Admin (PII Verification)', stepNameAr: 'مسؤول الموارد البشرية (التحقق من البيانات الشخصية)',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    // Always runs — PII change always goes to HR
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.BANK_DETAILS,
    stepOrder: 2, stepName: 'Finance Manager (Payroll Impact)', stepNameAr: 'مدير المالية (تأثير الرواتب)',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'FINANCE_MANAGER',
    // Always runs — bank account touches payroll
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WF-012: SYSTEM ACCESS REQUEST
  // ══════════════════════════════════════════════════════════════════════════
  {
    workflowCode: WF_CODES.ACCESS_REQUEST,
    stepOrder: 1, stepName: 'Line Manager', stepNameAr: 'المدير المباشر',
    stepType: 'APPROVAL', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
    stepEffect: 'NORMAL', slaHours: 48, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.ACCESS_REQUEST,
    stepOrder: 2, stepName: 'HR Admin (High-Privilege Roles)', stepNameAr: 'مسؤول الموارد البشرية (الأدوار ذات الصلاحيات العالية)',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
    activationRuleCode: RULE_CODES.ACCESS_HR,
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
  {
    workflowCode: WF_CODES.ACCESS_REQUEST,
    stepOrder: 3, stepName: 'IT / System Admin', stepNameAr: 'مسؤول تقنية المعلومات / النظام',
    stepType: 'APPROVAL', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'SYSTEM_ADMIN',
    // Always runs — all access changes need IT sign-off
    stepEffect: 'NORMAL', slaHours: 24, onSlaBreach: 'ESCALATE',
    actionsAvailable: ['APPROVE', 'REJECT'],
    requiresCommentOn: ['REJECT'],
    notifyChannels: ['IN_APP', 'EMAIL'],
  },
]
```

---

## Part 4 — Additional Leave Workflow Templates

```typescript
// These use the same step patterns as WF-001 but with leave-type-specific rules.

export const additionalLeaveWorkflowSeeds = [

  // ── WF-013: SICK LEAVE ───────────────────────────────────────────────────
  // Pre-submit guard: if days > 2, require medical certificate upload
  {
    definition: {
      code: WF_CODES.LEAVE_SICK, name: 'Sick Leave Approval', nameAr: 'موافقة على الإجازة المرضية',
      module: 'LEAVE', triggerEvent: 'LEAVE_SUBMITTED_SICK',
      defaultHierarchyType: 'LINE_MANAGER', isActive: true,
    },
    steps: [
      { stepOrder: 1, stepName: 'Line Manager', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
        slaHours: 24, onSlaBreach: 'ESCALATE',
        actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'], requiresCommentOn: ['REJECT'] },
      { stepOrder: 2, stepName: 'HR Admin Review', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
        activationRuleCode: RULE_CODES.SL_HR, slaHours: 12, onSlaBreach: 'AUTO_APPROVE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
    ],
  },

  // ── WF-014: EMERGENCY LEAVE ───────────────────────────────────────────────
  // 4-hour SLA — auto-approve on breach (emergency must not be blocked)
  {
    definition: {
      code: WF_CODES.LEAVE_EMERGENCY, name: 'Emergency Leave Approval', nameAr: 'موافقة على الإجازة الطارئة',
      module: 'LEAVE', triggerEvent: 'LEAVE_SUBMITTED_EMERGENCY',
      defaultHierarchyType: 'LINE_MANAGER', isActive: true,
    },
    steps: [
      { stepOrder: 1, stepName: 'Line Manager', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
        slaHours: 4, onSlaBreach: 'AUTO_APPROVE',
        actionsAvailable: ['APPROVE', 'REJECT', 'REQUEST_INFO'], requiresCommentOn: ['REJECT'] },
      { stepOrder: 2, stepName: 'HR Admin', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
        // Only if leave.days > 3
        slaHours: 8, onSlaBreach: 'AUTO_APPROVE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
    ],
  },

  // ── WF-015: MATERNITY LEAVE ───────────────────────────────────────────────
  // Pre-submit guard: BLOCK if termination workflow running for same employee
  // All steps ALWAYS run (no conditional activation)
  {
    definition: {
      code: WF_CODES.LEAVE_MATERNITY, name: 'Maternity Leave Approval', nameAr: 'موافقة على إجازة الأمومة',
      module: 'LEAVE', triggerEvent: 'LEAVE_SUBMITTED_MATERNITY',
      defaultHierarchyType: 'LINE_MANAGER', isActive: true,
    },
    steps: [
      { stepOrder: 1, stepName: 'Line Manager', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
        slaHours: 24, onSlaBreach: 'ESCALATE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
      { stepOrder: 2, stepName: 'Head of Department (Mandatory)', hierarchyType: 'LINE_MANAGER', hierarchyLevel: -1,
        // No activation condition — always runs for maternity
        slaHours: 24, onSlaBreach: 'ESCALATE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
      { stepOrder: 3, stepName: 'HR Admin (Mandatory — Legal)', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
        // Always runs — maternity is legally governed (FDL 33/2021 Art. 32)
        slaHours: 24, onSlaBreach: 'ESCALATE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
    ],
  },

  // ── WF-016: PATERNITY LEAVE ───────────────────────────────────────────────
  // Pre-submit guard: birth_date + 6 months >= today (BR-PL-002)
  {
    definition: {
      code: WF_CODES.LEAVE_PATERNITY, name: 'Paternity Leave Approval', nameAr: 'موافقة على إجازة الأبوة',
      module: 'LEAVE', triggerEvent: 'LEAVE_SUBMITTED_PATERNITY',
      defaultHierarchyType: 'LINE_MANAGER', isActive: true,
    },
    steps: [
      { stepOrder: 1, stepName: 'Line Manager', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
        slaHours: 24, onSlaBreach: 'ESCALATE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
      { stepOrder: 2, stepName: 'HR Admin', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
        slaHours: 24, onSlaBreach: 'ESCALATE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
    ],
  },

  // ── WF-017: HAJJ LEAVE ────────────────────────────────────────────────────
  // Pre-submit guard: !employee.hajjTakenAtThisEmployer (BR-HJ-002)
  // Hard block if flag is set — second Hajj request cannot be submitted
  {
    definition: {
      code: WF_CODES.LEAVE_HAJJ, name: 'Hajj Leave Approval', nameAr: 'موافقة على إجازة الحج',
      module: 'LEAVE', triggerEvent: 'LEAVE_SUBMITTED_HAJJ',
      defaultHierarchyType: 'LINE_MANAGER', isActive: true,
    },
    steps: [
      { stepOrder: 1, stepName: 'Line Manager', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
        slaHours: 48, onSlaBreach: 'ESCALATE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
      { stepOrder: 2, stepName: 'HR Admin (Mandatory — Once Per Employment)', hierarchyType: 'ROLE_IN_ORG', hierarchyRole: 'HR_ADMIN',
        // Always runs — Hajj is once per employment (BR-HJ-001)
        slaHours: 48, onSlaBreach: 'ESCALATE',
        actionsAvailable: ['APPROVE', 'REJECT'], requiresCommentOn: ['REJECT'] },
      // On APPROVED: set employee.hajjTakenAtThisEmployer = true
    ],
  },
]
```

---

## Part 5 — Default SLA Calendar Seed

```typescript
export const slaCalendarSeed = {
  tenantId: TENANT_ID,
  name: 'UAE Standard — Sun–Thu 09:00–18:00 GST',
  workDays: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
  workStartHour: 9,
  workEndHour: 18,
  timezone: 'Asia/Dubai',
  ramadanEnabled: true,
  ramadanEndHour: 14,
  isDefault: true,
  isActive: true,
  createdBy: SYSTEM_ACTOR_ID,
}
```

---

## Part 6 — Arabic Labels Reference

All user-facing strings require both EN and AR. Key translations:

| English | Arabic |
|---------|--------|
| Approve | موافقة |
| Reject | رفض |
| Delegate | تفويض |
| Send Back | إعادة |
| Request Info | طلب معلومات |
| Pending | قيد الانتظار |
| Approved | موافق عليه |
| Rejected | مرفوض |
| Escalated | تصعيد |
| Skipped | تم التخطي |
| Line Manager | المدير المباشر |
| Head of Department | رئيس القسم |
| HR Admin | مسؤول الموارد البشرية |
| Finance Manager | مدير المالية |
| Executive | الإدارة التنفيذية |
| Position Hierarchy | هيكل المناصب |
| Custom Group | مجموعة مخصصة |
| SLA Deadline | الموعد النهائي لمستوى الخدمة |
| Working Hours | ساعات العمل |
| Annual Leave | الإجازة السنوية |
| Sick Leave | الإجازة المرضية |
| Maternity Leave | إجازة الأمومة |
| Hajj Leave | إجازة الحج |
| Overtime | العمل الإضافي |
| Bank Details | بيانات الحساب البنكي |
