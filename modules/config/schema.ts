/**
 * config schema re-exports — Sprint 2 skeleton.
 * Configuration tables that drive the runtime: custom-field definitions,
 * policy settings, lookup values, work schedules, document-type configs,
 * onboarding checklists, and the events outbox emitted from Server Actions.
 */
export {
  customFieldDefinitions,
  policySettings,
  lookupValues,
  workSchedules,
  workSchedulePatterns,
  documentTypeConfigs,
  medicalInsurancePlans,
  medicalInsurancePolicySettings,
  onboardingChecklists,
  onboardingChecklistItems,
  events,
  formConfigurations,
} from '@/drizzle/schema'

export type {
  CustomFieldDefinition,
  PolicySetting,
  LookupValue,
  WorkSchedule,
  WorkSchedulePattern,
  DocumentTypeConfig,
  MedicalInsurancePlan,
  MedicalInsurancePolicySetting,
  OnboardingChecklist,
  OnboardingChecklistItem,
  EventOutbox,
  NewEventOutbox,
  FormConfiguration,
  NewFormConfiguration,
} from '@/drizzle/schema'
