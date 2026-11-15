/**
 * ARIA Capability Contract & Registry.
 *
 * The long-term, provider-independent contract between ARIA, the Workflow
 * Engine, the RBAC Engine, and business logic. ARIA operates through
 * CAPABILITIES — never through database/schema knowledge.
 *
 *   Bad:  "query worker_assignments table"     →  Good: getMyManager()
 *   Bad:  "find leave records"                 →  Good: getLeaveBalance()
 *
 * This registry is the source of truth for what ARIA is ALLOWED to do. It
 * mirrors (and documents) the RBAC + workflow guarantees already enforced in
 * modules/aria/services.ts and modules/aria/actions.ts. Capabilities flagged
 * `workflowRequired` are state-changing and MUST pass through the workflow
 * engine + human confirmation — ARIA never writes directly.
 *
 * Constitutional alignment:
 *  - Rule 1: capabilities read/draft; the engines remain the source of truth.
 *  - Rule 2: no capability approves/executes/routes; workflowRequired routes
 *            through the approval framework.
 *  - Rule 3: this contract is provider-neutral — it does not change when the
 *            LLM provider changes.
 */
import type { AriaIntentCode } from '@/modules/aria/types'

export type CapabilityRole =
  | 'EMPLOYEE' | 'MANAGER' | 'PAYROLL_ADMIN' | 'FINANCE'
  | 'HR_ADMIN' | 'HR_DIRECTOR' | 'SUPER_ADMIN'

export interface CapabilityRbacScope {
  /** Allowed roles. Empty/undefined = any authenticated role (self-service). */
  roles?: CapabilityRole[]
  /** Requires the caller to be linked to a person record (own-record action). */
  requiresPerson?: boolean
  /** Acts only on the caller's own data (RBAC enforced server-side). */
  selfServiceOnly?: boolean
}

export interface CapabilityDefinition {
  name: string
  version: string
  owner: string
  /** The classified intent this capability serves (maps 1:1 today). */
  intent: AriaIntentCode
  /** Read = no state change; Write = state-changing (must use workflow). */
  kind: 'read' | 'draft' | 'write'
  rbacScope: CapabilityRbacScope
  inputSchema: string
  outputSchema: string
  /** Whether invoking this capability must write an audit row (Hard Rule 1). */
  auditRequired: boolean
  /** Whether this capability must route through the workflow engine (Rule 2). */
  workflowRequired: boolean
  description: string
}

const OWNER = 'platform/aria'

export const ARIA_CAPABILITY_REGISTRY: Record<string, CapabilityDefinition> = {
  getMyManager: {
    name: 'getMyManager', version: '1.0.0', owner: OWNER,
    intent: 'ORG_CHART_QUERY', kind: 'read',
    rbacScope: { requiresPerson: true, selfServiceOnly: true },
    inputSchema: '{}', outputSchema: '{ managerName, department }',
    auditRequired: true, workflowRequired: false,
    description: 'Returns the caller\'s line manager and department from their current assignment.',
  },
  getLeaveBalance: {
    name: 'getLeaveBalance', version: '1.0.0', owner: OWNER,
    intent: 'LEAVE_BALANCE_QUERY', kind: 'read',
    rbacScope: { requiresPerson: true, selfServiceOnly: true },
    inputSchema: '{}', outputSchema: '{ balances: [{ type, days, taken }] }',
    auditRequired: true, workflowRequired: false,
    description: 'Returns the caller\'s live leave balances.',
  },
  getLeaveRequestStatus: {
    name: 'getLeaveRequestStatus', version: '1.0.0', owner: OWNER,
    intent: 'LEAVE_REQUEST_STATUS', kind: 'read',
    rbacScope: { requiresPerson: true, selfServiceOnly: true },
    inputSchema: '{}', outputSchema: '{ requests: [{ type, status, dates, pendingApprover }] }',
    auditRequired: true, workflowRequired: false,
    description: 'Returns the status of the caller\'s leave requests, including the pending approver.',
  },
  draftLeaveRequest: {
    name: 'draftLeaveRequest', version: '1.0.0', owner: OWNER,
    intent: 'LEAVE_REQUEST_DRAFT', kind: 'draft',
    rbacScope: { requiresPerson: true, selfServiceOnly: true },
    inputSchema: '{ leaveType, startDate, endDate | days }',
    outputSchema: '{ draft, requiresConfirmation: true }',
    auditRequired: true, workflowRequired: false,
    description: 'Builds a leave-request DRAFT for review. Never persists; requires explicit human confirmation before submission.',
  },
  submitLeaveRequest: {
    name: 'submitLeaveRequest', version: '1.0.0', owner: OWNER,
    intent: 'LEAVE_REQUEST_CONFIRM', kind: 'write',
    rbacScope: { requiresPerson: true, selfServiceOnly: true },
    inputSchema: '{ confirmedDraft }',
    outputSchema: '{ requestNumber, status }',
    auditRequired: true, workflowRequired: true,
    description: 'Submits a CONFIRMED leave draft through the workflow engine (system of record). Only after explicit user confirmation (Hard Rule 7).',
  },
  listDepartments: {
    name: 'listDepartments', version: '1.0.0', owner: OWNER,
    intent: 'DEPARTMENT_QUERY', kind: 'read',
    rbacScope: {},
    inputSchema: '{}', outputSchema: '{ departments: [{ nameEn, nameAr }] }',
    auditRequired: true, workflowRequired: false,
    description: 'Lists active departments.',
  },
  getHeadcount: {
    name: 'getHeadcount', version: '1.0.0', owner: OWNER,
    intent: 'HEADCOUNT_QUERY', kind: 'read',
    rbacScope: {},
    inputSchema: '{ scope?: total|on_leave|new_hires|by_department }',
    outputSchema: '{ headcount }',
    auditRequired: true, workflowRequired: false,
    description: 'Returns headcount metrics.',
  },
  getCompliance: {
    name: 'getCompliance', version: '1.0.0', owner: OWNER,
    intent: 'COMPLIANCE_QUERY', kind: 'read',
    rbacScope: { roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE'] },
    inputSchema: '{}', outputSchema: '{ emiratisation, expiringDocs }',
    auditRequired: true, workflowRequired: false,
    description: 'Returns compliance metrics. HR/admin roles only.',
  },
  getWorkflows: {
    name: 'getWorkflows', version: '1.0.0', owner: OWNER,
    intent: 'WORKFLOW_QUERY', kind: 'read',
    rbacScope: { roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'] },
    inputSchema: '{}', outputSchema: '{ pendingApprovals }',
    auditRequired: true, workflowRequired: false,
    description: 'Returns pending workflow/approval items. Manager+ roles only.',
  },
  getTeam: {
    name: 'getTeam', version: '1.0.0', owner: OWNER,
    intent: 'TEAM_QUERY', kind: 'read',
    rbacScope: { roles: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'] },
    inputSchema: '{}', outputSchema: '{ team: [...] }',
    auditRequired: true, workflowRequired: false,
    description: 'Returns the caller\'s team. Manager+ roles only; scoped to the reporting line.',
  },
  getPolicy: {
    name: 'getPolicy', version: '1.0.0', owner: OWNER,
    intent: 'POLICY_QUERY', kind: 'read',
    rbacScope: {},
    inputSchema: '{ topic? }', outputSchema: '{ policyText }',
    auditRequired: true, workflowRequired: false,
    description: 'Returns HR policy guidance (read-only, explanation).',
  },
  draftTransfer: {
    name: 'draftTransfer', version: '1.0.0', owner: OWNER,
    intent: 'TRANSFER_REQUEST_DRAFT', kind: 'draft',
    rbacScope: { roles: ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE'] },
    inputSchema: '{ target_person_id, target_department, effective_date, transfer_reason? }',
    outputSchema: '{ draft, requiresConfirmation: true }',
    auditRequired: true, workflowRequired: false,
    description: 'Builds a transfer DRAFT (resolves employee + department). Never persists; requires explicit confirmation. Manager (own reports) / HR+.',
  },
  submitTransfer: {
    name: 'submitTransfer', version: '1.0.0', owner: OWNER,
    intent: 'TRANSFER_REQUEST_CONFIRM', kind: 'write',
    rbacScope: { roles: ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE'] },
    inputSchema: '{ confirmedTransferDraft }',
    outputSchema: '{ requestId, instanceId }',
    auditRequired: true, workflowRequired: true,
    description: 'Submits a CONFIRMED transfer OR promotion through the approval workflow (system of record). Only after explicit user confirmation (Hard Rule 7). ARIA never applies the change — the engine does, on approval.',
  },
  draftPromotion: {
    name: 'draftPromotion', version: '1.0.0', owner: OWNER,
    intent: 'PROMOTION_REQUEST_DRAFT', kind: 'draft',
    rbacScope: { roles: ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE'] },
    inputSchema: '{ target_person_id, target_grade, effective_date, transfer_reason? }',
    outputSchema: '{ draft, requiresConfirmation: true }',
    auditRequired: true, workflowRequired: false,
    description: 'Builds a promotion DRAFT (resolves employee + target grade). Never persists; requires explicit confirmation (submitted via submitTransfer). Manager (own reports) / HR+.',
  },
  getExecutiveSummary: {
    name: 'getExecutiveSummary', version: '1.0.0', owner: OWNER,
    intent: 'EXECUTIVE_SUMMARY', kind: 'read',
    rbacScope: { roles: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE'] },
    inputSchema: '{}',
    outputSchema: '{ pendingApprovals, workforce, onLeave, compliance }',
    auditRequired: true, workflowRequired: false,
    description: 'Composes a one-shot org briefing (pending approvals + workforce + on-leave + compliance) from existing governed read capabilities. HR/admin/exec only; read-only.',
  },
}

/** Look up a capability by the classified intent it serves. */
export function getCapabilityByIntent(intent: AriaIntentCode): CapabilityDefinition | undefined {
  return Object.values(ARIA_CAPABILITY_REGISTRY).find(c => c.intent === intent)
}

/** All capabilities that change state (must route through the workflow engine). */
export function stateChangingCapabilities(): CapabilityDefinition[] {
  return Object.values(ARIA_CAPABILITY_REGISTRY).filter(c => c.workflowRequired)
}
