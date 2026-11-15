/**
 * Config module public API — Task 8a.
 * All cross-module access MUST import from here — never from actions.ts or guards.ts directly.
 * Hard Rule 6: cross-module imports only via each module's index.ts barrel.
 */

// ── Fully-implemented Server Actions (Task 8c) ─────────────────────────────
export {
  createCustomField,
  updateNotificationTemplate,
  updatePolicySetting,
  initiateWorkflow,
  actOnWorkflowStep,
  updateFormConfiguration,
} from './actions'

// ── S9-01..S9-04: Workflow + delegation CRUD ──────────────────────────────
export {
  createWorkflowTemplate,
  updateWorkflowTemplate,
  disableWorkflowTemplate,
  enableWorkflowTemplate,
  getWorkflowTemplates,
  getWorkflowTemplate,
  getWorkflowInstance,
  getDelegateCandidates,
  // S9-04: ongoing approval delegations
  createApprovalDelegation,
  deactivateApprovalDelegation,
  listApprovalDelegations,
} from './actions'

export type {
  WorkflowInstanceDetail,
  WorkflowChainEvent,
  WorkflowChainStageSnapshot,
  ApprovalDelegationRow,
} from './actions'

// ── S10-01..S10-06: Settings query actions (Sprint 10) ────────────────────
export {
  getPolicySettings,
  getNotificationTemplates,
  getCustomFields,
  getLeaveRuleSets,
} from './actions'

export type {
  PolicySettingRow,
  NotificationTemplateRow,
  CustomFieldRow,
  LeaveRuleSetRow,
} from './actions'

// ── Sprint 2 stubs (shape present, throw NOT_IMPLEMENTED) ──────────────────
export {
  updateCustomField,
  saveCustomFieldValue,
  getCustomFieldValues,
  createLeaveRuleSet,
  updateLeaveRuleSet,
  resolveLeaveRule,
  createNotificationSchedule,
  getFormConfiguration,
} from './actions'

// NOTE: domain guardrails (assertNotSystemField, assertLeaveRuleNotBelowMinimum,
// assertMaxCustomFields, assertWorkflowRoleValid, assertEscalationRoleHigher,
// assertPlaceholdersValid) live in `./guards`. They are intentionally NOT
// re-exported here — `guards.ts` imports `lib/db.ts`, which would drag the
// postgres client into any client component that touches this barrel for
// even a Server Action. Server-side callers must import directly:
//   import { assertLeaveRuleNotBelowMinimum } from '@/modules/config/guards'

// ── Input types ────────────────────────────────────────────────────────────
export type {
  CreateCustomFieldInput,
  UpdateNotificationTemplatePatch,
  UpdateFormConfigInput,
  SaveWorkflowTemplateInput,
} from './actions'

// ── Company Currency Setup ─────────────────────────────────────────────────
export {
  listCompanyCurrencySettings,
  getCompanyCurrencySetting,
  createCompanyCurrencySetting,
  updateCompanyCurrencySetting,
  deactivateCompanyCurrencySetting,
} from './currency-actions'

export type {
  CurrencySettingRow,
  CreateCurrencySettingInput,
  UpdateCurrencySettingInput,
} from './currency-actions'
