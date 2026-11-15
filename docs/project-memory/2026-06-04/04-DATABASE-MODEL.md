# 04 — DATABASE MODEL

> Last updated: 2026-06-04
> Source: drizzle/schema/* (109 pgTable definitions across 11 schema files)

---

## Overview

- **109 pgTable definitions** across 11 schema files
- **PostgreSQL 16** (Neon eu-central-1, co-located with Vercel fra1)
- **Single tenant** (tenant_id DEFAULT '00000000-0000-0000-0000-000000000001')
- **Drizzle ORM 0.45.2** + drizzle-kit 0.31.10
- **Every table** carries: `tenant_id` (BR-TENANT-001) + 7 audit columns (BR-AUDIT-001)
- **Records are NEVER hard-deleted** — effective dates + `is_active` flags (BR-NO-DELETE)
- **PII fields** (emirates_id, passport_number, iban) are AES-256-GCM encrypted before persist

---

## Schema Files

| File | Purpose | Key Tables |
|---|---|---|
| `drizzle/schema/foundation.ts` | Core HR entities — the largest file (~91KB). Persons, org structure, leave, payroll, audit. | lookupValues, legalEntities, grades, payrollDefinitions, persons, businessUnits, departments, locations, jobs, positions, personContacts, personAddresses, personDocuments, personBankDetails, personDependents, personEmergencyContacts, personEducation, personProfessionalCerts, contracts, workerAssignments, employmentActions, absencePlans, absenceTypes, absenceEntries, absenceBalances, accommodationRequests, leavePlanEnrolments, workScheduleAssignments, payrollAssignments, gradeHistory, departmentHistory, locationHistory, jobHistory, positionHistory, projects, salaryElements, payrollRuns, payrollResults, eosbCalculations, auditLog |
| `drizzle/schema/configuration.ts` | HR Admin-configurable tables (~46KB). Workflows, schedules, leave rules, insurance plans, permissions. | customFieldDefinitions, workflowDefinitions, workflowStages, workflowRoutingRules, workSchedules, workSchedulePatterns, publicHolidays, leaveRuleSets, leaveRuleLines, notificationTemplates, policySettings, complianceRules, gradeSalaryRanges, medicalInsurancePlans, documentTypeConfigs, formConfigurations, pagePersonalization, featurePermissions, companyCurrencySettings, ariaAgentConfig, ariaModelConfig, ariaBehaviourConfig, ariaKnowledgeSources, leaveBackdatePolicies |
| `drizzle/schema/transactions.ts` | Operational runtime tables — created/updated at runtime (not config time). | workflowInstances, approvalDelegations, notificationLog, onboardingChecklists, onboardingChecklistItems, blackoutPeriods, wpsSifRecords, glJournalLines, userAccounts, refreshTokens, ssoProviderConfig, medicalInsuranceEnrolments, medicalInsurancePolicySettings, dewsContributions, gpssaContributions, timesheetPeriods, timesheetEntries, vssContributions, events |
| `drizzle/schema/workflow-engine.ts` | Workflow Engine v2 — hybrid hierarchy (LINE_MANAGER/POSITION/CUSTOM_GROUP) + AND/OR condition trees, SLA, immutable audit. | workflowRules, workflowDefinitionsV2, approvalGroups, approvalGroupMembers, workflowStepsV2, workflowSlaCalendars, workflowInstancesV2, workflowStepInstances, workflowAuditLog, workflowEmailTokens, workflowDelegationRules, workflowNotificationQueue |
| `drizzle/schema/employee-letters.ts` | PDF letter generation lifecycle. | letterFieldRegistry, letterTemplateTypes, letterTemplates, employeeLetters, letterEmailJobs |
| `drizzle/schema/probation.ts` | Probation review workflow. | probationReviews |
| `drizzle/schema/timesheets.ts` | Attendance device sync and exceptions. | attendanceRecords, attendanceExceptions, deviceSyncLog, devicePunchRaw |
| `drizzle/schema/actions.ts` | HR action requests requiring approval (org chart actions). | hiringRequests, transferRequests |
| `drizzle/schema/org-cache.ts` | Materialized org hierarchy snapshot (performance cache). | orgHierarchySnapshots |
| `drizzle/schema/document-files.ts` | Document file metadata (storage-provider-agnostic). | documentFiles |

> Note: foundation.ts and configuration.ts together account for ~60+ tables and ~137KB of schema definition. Never load both in the same session unless doing cross-schema work.

---

## Core HR Tables

### persons (V005 — Master person record)

The most important table. Every employee lifecycle event eventually traces back here.

| Column Group | Key Columns | Notes |
|---|---|---|
| Identity | personNumber (AVN-000123), firstNameEn, lastNameEn, fullNameEn, fullNameAr, dateOfBirth, gender, maritalStatus | personNumber is unique auto-generated. fullNameEn computed by application. |
| Nationality | nationalityCode, nationalityCategory (UAE_NATIONAL/GCC_NATIONAL/EXPAT), bloodType | bloodType is PDPL-sensitive, gate behind sensitiveDataConsent |
| PII (encrypted) | emiratesId (AES-256-GCM), passportNumber (AES-256-GCM) | Never store plaintext. lib/encryption.ts. |
| Residency | visaNumber, visaType, visaExpiry, labourCardNumber, labourCardExpiry | UAE-specific compliance fields |
| Employment | employmentType (FULL_TIME/PART_TIME/TEMPORARY/TASK_BASED/FLEXIBLE/REMOTE/SHARED), assignmentStatus (ACTIVE/ON_LEAVE/SUSPENDED/TERMINATED/RETIRED/DECEASED/PENDING_HIRE), hireDate, probationEndDate, probationStatus (ACTIVE/CONFIRMED/EXTENDED/FAILED), noticePeriodDays | `isActive` is NOT cleared on termination — only `assignmentStatus` changes |
| Worker Classification | workerCategory (FTE/CONTINGENT/CONTRACTOR), employeeCode | Separate axis from employmentType |
| Current Assignment | currentPositionId, currentJobId, currentDepartmentId, currentGradeId, lineManagerId (self-ref), dottedLineManagerId (self-ref) | Forward refs — FK enforced at DB level, not Drizzle level |
| Payroll | payrollId, basicSalary, totalPackage, payFrequency | Denormalized for fast access; source of truth is salary_elements |
| Insurance | insurancePlanId, insuranceStatus (ENROLLED/PENDING_ENROLMENT/RENEWAL_DUE/EXPIRED/CANCELLED/NOT_ENROLLED), annualPremiumAed | |
| PDPL Consent | pdplConsentGiven, pdplConsentDate, sensitiveDataConsent | UAE Personal Data Protection Law 2021 |
| System | isActive, userAccountId, profilePhotoUrl (Azure Blob SAS URL), profilePhotoData (base64 fallback), extraData (JSONB custom fields) | `isActive` defaults true; not cleared on termination |

**Critical warning:** `isActive` on persons is NOT a termination flag. Gate termination checks on `assignmentStatus = 'ACTIVE'` not `isActive = true`.

### positions (V009-adjacent)

| Column | Notes |
|---|---|
| reportsToPositionId | Self-referential — drives org chart hierarchy |
| isVacant | True when no active worker_assignment points here |
| isConfidential | Hides position from non-HR in org chart |
| isFrozen | Budget frozen — hiring blocked |
| isActing | Current occupant is in acting capacity |
| vacancyStartDate | When the position became vacant |

### worker_assignments (V019 — Links person ↔ position)

| Column | Notes |
|---|---|
| personId | FK to persons |
| positionId | FK to positions |
| isCurrent | Boolean — only one row per person can be true at a time |
| assignmentStatus | ACTIVE/ON_LEAVE/SUSPENDED/TERMINATED/etc. |
| workScheduleId | Denormalized from work_schedule_assignments for timesheet resolver |
| isActing | Acting assignment flag |
| actingEndDate | When the acting period ends |
| actionInitiatedBy | FK to persons — who triggered this assignment |

### departments (V007)

| Column | Notes |
|---|---|
| headPersonId | Department head person (pre-existed in schema, wired in Sprint 11) |
| parentDepartmentId | Self-referential for nested departments |
| workScheduleId | Department-level schedule tier (migration 0054; bare uuid, FK in SQL only) |
| businessUnitId | FK to business_units |
| legalEntityId | Entity scoping |
| approvedHeadcount | Budget headcount |

### legal_entities (V002)

| Column | Notes |
|---|---|
| entityType | MAINLAND / DIFC / ADGM / FREEZONE — drives EOSB/DEWS routing |
| eosbScheme | TRADITIONAL / VSS / DEWS — BR-EOSB-001 |
| empNumberPrefix, empNumberDigits, empNumberSeed | Employee number config (Settings → Employee Numbers) |
| Primary/secondary logo URLs, signatory fields | Document branding (Settings → Document Branding) |

### absence_balances

| Column | Notes |
|---|---|
| personId | FK to persons |
| absenceTypeId | FK to absenceTypes |
| balanceYear | The leave year this balance applies to |
| openingBalanceDays | Starting balance in days |
| isCurrent | Effective-date pattern column |
| effectiveSequence | Row version sequence |
| actionMode | UPDATE/CORRECT — correction mode infrastructure |

**Note:** `absence_balances` does NOT have `is_current`/`effective_sequence` on the same effective-date pattern as some other tables — confirm column names from schema before writing INSERT.

### leave_requests / absenceEntries

Stored as `absence_entries` in the schema (not `leave_requests`). Linked to `workflow_instances` via `resourceType = 'absence_entry'` and `resourceId`.

---

## Status Fields & Enums

| Entity | Status Values |
|---|---|
| persons.assignmentStatus | ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED, RETIRED, DECEASED, PENDING_HIRE |
| persons.probationStatus | ACTIVE, CONFIRMED, EXTENDED, FAILED |
| persons.visaStatus | VALID, EXPIRING, EXPIRED, CANCELLED |
| persons.insuranceStatus | ENROLLED, PENDING_ENROLMENT, RENEWAL_DUE, EXPIRED, CANCELLED, NOT_ENROLLED |
| persons.employmentType | FULL_TIME, PART_TIME, TEMPORARY, TASK_BASED, FLEXIBLE, REMOTE, SHARED |
| persons.workerCategory | FTE, CONTINGENT, CONTRACTOR |
| legalEntities.entityType | MAINLAND, DIFC, ADGM, FREEZONE |
| legalEntities.eosbScheme | TRADITIONAL, VSS, DEWS |
| workflow_instances.status | PENDING, IN_PROGRESS, APPROVED, REJECTED, CANCELLED, ESCALATED |
| workflowInstancesV2 status | PENDING, IN_PROGRESS, APPROVED, REJECTED, CANCELLED, ESCALATED, ON_HOLD, RECALLED |
| workflowStepInstances status | WAITING, PENDING, APPROVED, REJECTED, DELEGATED, ESCALATED, SKIPPED, RECALLED, AUTO_APPROVED |
| hiringRequests.status | PENDING_APPROVAL, APPROVED, REJECTED, FULFILLED, CANCELLED |
| transferRequests.status | PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED |
| absenceEntries.status | DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED |
| employee_letters.status | DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, SENT, PENDING_SIGNATURE, SIGNED, FAILED, REJECTED |
| notificationLog.status | PENDING, SENT, FAILED |

### Workflow Engine Enums (workflow-engine.ts)

| Enum | Values |
|---|---|
| hierarchyTypeEnum | LINE_MANAGER, POSITION, CUSTOM_GROUP |
| stepEffectEnum | NORMAL, ADD_IF_MATCHES, REPLACE, SKIP_PREVIOUS, INJECT_BEFORE, INJECT_AFTER, PARALLEL_ADD |
| slaBreachActionEnum | ESCALATE, AUTO_APPROVE, AUTO_REJECT, SEND_REMINDER, BLOCK_FREEZE |
| approverNotFoundActionEnum | ESCALATE_UP, USE_FALLBACK, ASSIGN_HR_ADMIN, BLOCK_WITH_ERROR |
| groupMemberTypeEnum | STATIC, DYNAMIC, HYBRID |
| groupVotingMethodEnum | ANY_ONE, MAJORITY, ALL, WEIGHTED |

---

## Migration State

### Journal Coverage

Drizzle journal (`drizzle/meta/_journal.json`) covers **0000–0039 only**. Running `pnpm drizzle-kit migrate` on a fresh DB applies 0000–0039 but **NOT 0040+**. The next additive migration slot is **0055** (but 0055 already has two WIP files — use 0062 or higher for new migrations to avoid collision).

### Applied to Neon (0040–0054) — ALL APPLIED via Neon SQL Editor

| Migration | What It Does | Applied? |
|---|---|---|
| 0040_aria_branding_config.sql | ARIA + document branding config tables | ✅ |
| 0041_hiring_request_uniqueness.sql | `uq_hiring_request_pending` partial unique index (COLLISION-004 fix) | ✅ |
| 0042_transfer_request_uniqueness.sql | `uq_transfer_request_pending` partial unique index (COLLISION-004B fix) | ✅ |
| 0043_personal_profile_fields.sql | Blood type + emergency contacts + home address fields | ✅ |
| 0044_employment_fields.sql | worker_category, employee_code, probation_months_granted columns | ✅ |
| 0045_persons_is_active_backfill.sql | Backfill is_active on persons | ✅ |
| 0046_person_documents_scope.sql | Document scope/visibility columns | ✅ |
| 0047_leave_backdate_policy.sql | Creates `leave_backdate_policies` table | ✅ Applied 2026-05-26 |
| 0048_backdate_policy_comment_fix.sql | Corrects DB comments: "No row = BLOCKED by default" | ✅ Applied 2026-05-26 |
| 0049_letter_types_ess_expansion.sql | ESS letter types expansion | ✅ |
| 0050_document_management_v2.sql | Document Management v2: 7 new columns, backfill, indexes | ✅ |
| 0051_document_type_check_expansion.sql | Expands `person_documents_type_check` from 8 to 36 types | ✅ Applied 2026-05-28 |
| 0052_document_file_data.sql | Document file data table | ✅ |
| 0052_person_profile_photo_data.sql | Person profile photo data (base64 column) | ✅ |
| 0053_letter_pdf_data_failure_reason.sql | Letter PDF data + failure reason column | ✅ |
| 0054_department_work_schedule.sql | `departments.work_schedule_id` + FK + partial index | ✅ Applied 2026-05-31 |

### WIP Migrations — NOT Applied

| Migration | Status | Notes |
|---|---|---|
| 0055_payroll_run_number_per_entity.sql | WIP — not applied | Payroll run number scoping |
| 0055_wip_step_instance_columns.sql | WIP — not applied | Conflicts with 0055 payroll file |
| 0056_wip_notification_queue_meta.sql | WIP — not applied | Notification queue metadata |
| 0057_wip_audit_immutability.sql | WIP — not applied | Audit log immutability enforcement |
| 0060_wip_intelligence_view.sql | WIP — not applied | Intelligence/analytics view |
| 0061_absence_type_requires_balance.sql | WIP — not applied | Absence type balance requirement |

Also present: `_PRODUCTION_SCHEMA_BUNDLE.sql` — full schema bundle for production deployment.

---

## Risky Schema Areas

| Risk | Detail |
|---|---|
| PII Encryption | `emirates_id`, `passport_number`, `iban` stored as AES-256-GCM ciphertext. `lib/encryption.ts` handles encrypt/decrypt. Never store or compare plaintext. |
| Effective-date pattern | Never DELETE records. Use close + open (set `is_current=false` on old row, insert new with `is_current=true`). Drizzle has no automatic guard — discipline required. |
| tenant_id on every insert | Every `db.insert()` must include `tenantId: TENANT_ID`. The column default only fires when the column is omitted entirely; explicit `undefined` bypasses it. |
| foundation.ts size | 91KB — the largest file in the codebase. Load only the sections you need via targeted reads with offset/limit. |
| configuration.ts size | ~46KB. Contains 25 pgTable definitions. Load selectively. |
| persons.isActive vs assignmentStatus | `isActive` is NOT cleared on termination. Always gate termination checks on `assignmentStatus = 'ACTIVE'`, not `isActive = true`. |
| Cross-entity data leakage | HR_ADMIN is entity-scoped. Always include `legalEntityId` in WHERE clauses for HR_ADMIN queries. SUPER_ADMIN bypasses this. |
| Forward references in persons | `currentPositionId`, `currentJobId`, `currentDepartmentId` are bare UUIDs in Drizzle (no `.references()`). FK enforced at DB level only. |
| Circular imports | foundation.ts imports nothing from schema. configuration.ts imports from foundation. transactions.ts imports from foundation + configuration. Never reverse this chain. |
| Migration journal gap | Journal covers 0000–0039. New migrations (0055+) must be applied manually via Neon SQL Editor — `pnpm drizzle-kit migrate` will NOT apply them. |

---

## Payroll Schema Dependencies

The payroll subsystem spans multiple tables across foundation.ts:

| Table | Role |
|---|---|
| `payrollDefinitions` | Payroll groups (monthly, biweekly, etc.) — referenced by `persons.payrollId` |
| `payrollRuns` | Individual payroll run instances per entity per period |
| `payrollResults` | Per-employee per-run computed amounts |
| `salaryElements` | Component breakdown (basic, housing, transport, etc.) |
| `payrollAssignments` | Employee → payroll group assignment history |
| `eosbCalculations` | EOSB gratuity calculations (UAE Labour Law) |
| `wpsSifRecords` | WPS Salary Information File records (MOHRE compliance) |
| `dewsContributions` (transactions.ts) | DEWS scheme contributions (DIFC/ADGM) |
| `gpssaContributions` (transactions.ts) | GPSSA scheme contributions (UAE Nationals) |
| `vssContributions` (transactions.ts) | VSS scheme contributions |
| `glJournalLines` (transactions.ts) | GL journal lines for payroll accounting |

**Payroll run number concurrency:** `nextRunNumber` must be called inside a `db.transaction` with `pg_advisory_xact_lock(hashtext('payroll_run:' || entityId))` to prevent duplicate run numbers under concurrent requests (RISK-PAYROLL-2 fix — `modules/payroll/actions.ts`).
