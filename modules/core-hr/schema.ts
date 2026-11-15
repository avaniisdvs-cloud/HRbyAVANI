/**
 * core-hr schema re-exports — Sprint 2 skeleton.
 * Drizzle tables and inferred types owned by the core-hr domain
 * (persons, contracts, org structure, encrypted personal data).
 * Cross-module imports MUST come through index.ts (Hard Rule 6).
 */
export {
  persons,
  personContacts,
  personAddresses,
  personDocuments,
  personBankDetails,
  personDependents,
  personEmergencyContacts,
  personEducation,
  personProfessionalCerts,
  contracts,
  workerAssignments,
  employmentActions,
  legalEntities,
  businessUnits,
  departments,
  locations,
  jobs,
  positions,
  grades,
} from '@/drizzle/schema'

export type {
  Person,
  Contract,
  WorkerAssignment,
  EmploymentAction,
  LegalEntity,
  BusinessUnit,
  Department,
  Location,
  Job,
  Position,
  Grade,
} from '@/drizzle/schema'
