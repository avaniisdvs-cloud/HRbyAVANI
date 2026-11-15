/**
 * core-hr public API barrel — Sprint 3.
 * Other modules MUST import only from here, never from internal files
 * (Hard Rule 6).
 */
export * from './schema'
export * from './types'

// Server Actions
export {
  createPerson,
  getPerson,
  listPersons,
  updatePerson,
  updatePersonProject,
  getPersonCurrentProject,
  requestPersonalDataExport,
  type PersonDataExport,
  // Task 2B — personal profile field upserts
  upsertPersonEmergencyContact,
  upsertPersonHomeAddress,
  upsertPersonEducation,
} from './actions'

// Contact management
export { upsertPersonContacts, type UpsertContactsResult } from './contacts/actions'
export { CONTACT_TYPES, type ContactType } from './contacts/constants'

// Validation schemas — exported so client forms can re-use the same Zod
// definitions for symmetric validation.
export {
  CreatePersonSchema,
  UpdatePersonSchema,
  ListPersonsFilterSchema,
  EMIRATES_ID_REGEX,
  UAE_IBAN_REGEX,
  Gender,
  MaritalStatus,
  NationalityCategory,
  EmploymentType,
  AssignmentStatus,
  VisaStatus,
  BloodType,
  WorkerCategory,
  type CreatePersonInput,
  type UpdatePersonInput,
  type ListPersonsFilter,
} from './validations'

// Pure helpers needed by Server Components / form pages.
export {
  composeFullNameEn,
  maskEmiratesId,
  maskTail,
  isEmiratisationEligible,
} from './services'

// S3-04 — Contract lifecycle
export {
  createContract,
  amendContract,
  terminateContract,
} from './contracts/actions'
export {
  CreateContractSchema,
  AmendContractSchema,
  TerminateContractSchema,
  type CreateContractInput,
  type AmendContractInput,
  type TerminateContractInput,
} from './contracts/validations'
export { deriveNoticePeriodDays } from './contracts/services'

// S3-05 — Worker assignments (effective-dated)
export {
  createWorkerAssignment,
  changeWorkerAssignment,
} from './worker-assignments/actions'
// NOTE: tx-aware helpers in worker-assignments/services are deliberately NOT
// re-exported here — this barrel is imported by client components (for Server
// Actions), and services.ts → audit → db would bundle the postgres driver
// client-side. Server code imports them from the services path directly.
export {
  CreateWorkerAssignmentSchema,
  ChangeWorkerAssignmentSchema,
  type CreateWorkerAssignmentInput,
  type ChangeWorkerAssignmentInput,
} from './worker-assignments/validations'

// S3-06 — Employment actions (hire / transfer / promotion / grade change)
export {
  hire,
  transfer,
  promotion,
  gradeChange,
} from './employment-actions/actions'
export {
  HireSchema,
  TransferSchema,
  PromotionSchema,
  GradeChangeSchema,
  type HireInput,
  type TransferInput,
  type PromotionInput,
  type GradeChangeInput,
} from './employment-actions/validations'

// S3-10 — Bank details (IBAN encryption)
export {
  createBankDetails,
  getBankDetails,
} from './bank-details/actions'
export {
  CreateBankDetailsSchema,
  type CreateBankDetailsInput,
} from './bank-details/validations'

// S3-10 — Dependents (encrypted EID + passport)
export { addDependent } from './dependents/actions'
export {
  AddDependentSchema,
  type AddDependentInput,
} from './dependents/validations'

// S3-11 — Documents (Azure Blob upload + SAS retrieval)
export {
  uploadPersonDocument,
  uploadMyDocument,
  getDocumentUrl,
  listPersonDocuments,
  updateMyDocumentMeta,
  deleteMyDocument,
  type PersonDocumentRow,
  type DocumentAccessErrorCode,
  type DocumentUrlResult,
  type UpdateMyDocumentInput,
} from './documents/actions'

// Edit Person — dedicated server action for the Edit Person form.
export { updatePersonFromEdit } from './edit-person'
export type { EditPersonInput, EditPersonResult } from './edit-person'

// Picklists — positions/departments/grades/managers for drawer dropdowns.
export { getPersonPicklists } from './picklists'
export type { PersonPicklists, PicklistOption } from './picklists'

// Profile photo upload
export { uploadProfilePhoto } from './photo-upload'

// Department Head — workflow-actor data-availability helper (read-only).
export { getDepartmentHead } from './department-head'
export type { DepartmentHead } from './department-head'

// P2-3 — Exit clearance (offboarding checklist)
export {
  completeOffboardingItem,
  waiveOffboardingItem,
} from './exit-clearance/actions'

// P2-4 — Probation confirmation
export { confirmProbation } from './probation/actions'
export type { ConfirmProbationInput } from './probation/actions'

// BQ-4 — Employee self-service bank details update
export { selfServiceUpdateBankDetails } from './bank-details/self-service-actions'

// Priority D — Work schedule assignment history
export {
  assignWorkSchedule,
  correctWorkScheduleAssignment,
  getWorkScheduleAssignmentHistory,
  type AssignWorkScheduleInput,
  type CorrectWorkScheduleAssignmentInput,
} from './work-schedule-assignment-actions'
export { workScheduleAssignments, type WorkScheduleAssignment } from '@/drizzle/schema'

// Bulk employee import — Server Actions + types only.
// Internal helpers (parseSheet, validateImportRows, importEmployeesTx,
// buildImportTemplate) are NOT re-exported here: they import lib/db which
// is a Node.js-only module and must never reach Client Components.
export {
  validateImportFile,
  confirmImport,
  getTemplateRefData,
  EMPLOYEE_HEADERS,
} from './bulk-import'
export type {
  RawImportRow,
  ValidatedImportRow,
  ResolvedRefs,
  RowIssue,
  IssueSeverity,
  ImportPreview,
  ImportRowResult,
  ImportResult,
  TemplateRefData,
} from './bulk-import'

// Transfer / Promotion request orchestrator (create request + start approval workflow)
export { requestTransfer } from './employment-actions/transfer-request'
export type { RequestTransferInput, RequestTransferResult } from './employment-actions/transfer-request'
