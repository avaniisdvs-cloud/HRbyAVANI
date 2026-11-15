# AVANIIS HR — Enterprise Review Extraction Bundle
## PRIORITY 3 — DEPTH (module source)
Generated: 2026-06-13 · Source repo: /Users/d.kethari/D_Drive/AVANIIS_HR_SYS · Branch: main
Delimiter: each file begins at a line of '=' with FILE [id]: <path>. Content is verbatim, unmodified.

>>> NOTE: Requested modules/workers, modules/workflows, modules/employees, modules/organization do NOT exist under those names in this Drizzle project. Substituted real equivalents per owner approval: core-hr (workers/employees/organization domains), workflow (singular), profile (employee self-service), reports.

### P3-01/03/04 SUBSTITUTE — modules/core-hr (workers + employees + organization)

================================================================================
FILE [P3-01/03/04]: modules/core-hr/actions.ts
LINES: 1307
================================================================================
'use server'

/**
 * core-hr Server Actions — Sprint 3.
 *
 * Persons CRUD (create, read, update — NEVER delete; Hard Rule 3).
 * Every action follows the four-step contract from the Functional Spec:
 *   1. requireRole(...)               — auth + RBAC
 *   2. Schema.parse(input)            — Zod validation
 *   3. business-rule guards           — BR-xx checks tagged in comments
 *   4. db.transaction(async tx => ...) with writeAuditLog(..., tx)
 *      — Hard Rule 1: business write + audit row in SAME transaction.
 *
 * PII fields (emirates_id, passport_number) go through lib/encryption.ts
 * BEFORE INSERT/UPDATE (Hard Rule 4). Reads decrypt only for callers whose
 * JWT carries an authorised role (services.projectPerson).
 */
import { translateError } from '@/lib/app-error'
import { translateToArabic } from '@/lib/translation'
import { and, eq, ilike, or, sql, asc, desc, count } from 'drizzle-orm'
import { ZodError } from 'zod'
import { buildOrderBy } from '@/lib/table-sort'
import {
  persons, legalEntities, departments, jobs, positions, workerAssignments, projects,
  personContacts, personAddresses, personDocuments, personBankDetails, personDependents,
  personEmergencyContacts, personEducation,
  workSchedules, workScheduleAssignments,
} from '@/drizzle/schema'
import type { Person } from '@/drizzle/schema'
import { db, type DbOrTx } from '@/lib/db'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { encryptNullable } from '@/lib/encryption'
import { assertPersonIdentityUnique, identityHashColumns } from '@/lib/identity-uniqueness'
import { requirePermission } from '@/lib/permissions'
import { requireRole, type SessionUser } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { evaluateManagerRole } from '@/lib/evaluate-manager-role'
import { isManagerDirectReport } from './manager-scope'
import {
  CreatePersonSchema, UpdatePersonSchema, ListPersonsFilterSchema,
  normalizeEmiratesId,
  type CreatePersonInput, type UpdatePersonInput, type ListPersonsFilter,
} from './validations'
import {
  composeFullNameEn, nextPersonNumber, projectPerson, isEmiratisationEligible,
} from './services'
import type { PersonView, PersonListRow, PaginatedPersons } from './types'

function shouldRethrowListPersonsError(error: unknown): boolean {
  if (error instanceof ZodError) return true
  if (!(error instanceof Error)) return false

  return (
    error.message.startsWith('FORBIDDEN:') ||
    error.message.startsWith('STEP_UP_REQUIRED:')
  )
}

// ══════════════════════════════════════════════════════════════════════════
// 1 — createPerson
// ══════════════════════════════════════════════════════════════════════════

export async function createPerson(
  input: CreatePersonInput,
): Promise<{ id: string; personNumber: string }> {
  try {
  // 1. auth — only HR_ADMIN can onboard a person record (Security spec §2.2).
  const user = await requireRole(['HR_ADMIN', 'SUPER_ADMIN'])
  // P3-D2: feature-permission layer on top of RBAC (legacy-allow if row absent)
  await requirePermission(user, 'EMPLOYEE_CREATE', 'create')

  // 2. Zod validation (also runs BR-PR-001 cross-field probation check)
  const data = CreatePersonSchema.parse(input)

  // 2a. Auto-translate fullNameAr if not provided (EN → AR, never AR → EN).
  //     Translation is attempted before the PDPL check so we avoid blocking
  //     record creation on a temporary API outage — server action enforces
  //     the FR-CH-15 non-empty requirement AFTER translation resolves.
  if (!data.fullNameAr) {
    const fullNameEnForTranslation = [data.firstNameEn, data.middleNameEn, data.lastNameEn]
      .filter(Boolean).join(' ')
    const translated = await translateToArabic(fullNameEnForTranslation)
    if (translated) {
      data.fullNameAr = translated
    }
  }
  // FR-CH-15 post-translation enforcement: Arabic name is mandatory.
  if (!data.fullNameAr) {
    throw new Error(
      'FR-CH-15: Arabic full name is required. ' +
      'Auto-translation was unavailable — please enter the Arabic name manually. ' +
      '· الاسم الكامل بالعربية مطلوب — يرجى الإدخال يدوياً',
    )
  }

  // BR-WA-01: project_id lives on worker_assignments, which requires BOTH
  // currentPositionId AND currentDepartmentId (department_id is NOT NULL in
  // the schema). Reject the request before any DB write if the caller sends a
  // project without the required assignment context — prevents silent data loss.
  if (data.projectId && !(data.currentPositionId && data.currentDepartmentId)) {
    throw new Error(
      'PROJECT_REQUIRES_ASSIGNMENT: A position and department must be selected ' +
      'before assigning a project. · يجب اختيار المنصب والقسم قبل تعيين المشروع',
    )
  }

  // GAP-C04: PDPL consent must be recorded at point of data collection
  // UAE PDPL Article 11 — employment contract provides legal basis for processing
  // Sensitive fields (religion, biometric) require explicit consent
  if (!data.pdplConsentGiven) {
    throw new Error('PDPL_CONSENT_REQUIRED: Employee consent must be obtained before creating a record')
  }
  // PDPL-sensitive: blood_type requires explicit sensitive data consent (EPE-R08)
  if (data.bloodType && !data.sensitiveDataConsent) {
    throw new Error('PDPL_SENSITIVE_CONSENT_REQUIRED: Blood type requires sensitive data consent to be recorded')
  }

  let newId  = ''
  let newNum = ''

  await db.transaction(async tx => {
    // 3a. Verify the legal entity exists & is active. Cross-entity creates
    //     are blocked unless the caller is SUPER_ADMIN.
    const [entity] = await tx
      .select({ id: legalEntities.id, isActive: legalEntities.isActive })
      .from(legalEntities)
      .where(eq(legalEntities.id, data.legalEntityId))
      .limit(1)
    if (!entity)            throw new Error('legalEntityId not found')
    if (!entity.isActive)   throw new Error('legalEntityId is inactive')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== data.legalEntityId) {
      throw new Error('FORBIDDEN: cannot create persons in another legal entity')
    }

    // 3b. Look up entity's default work schedule for auto-assignment on hire (Task 2D).
    //     Done before person insert so defaultScheduleId is available for both
    //     worker_assignments and work_schedule_assignments writes below.
    const [defaultSched] = await tx
      .select({ id: workSchedules.id })
      .from(workSchedules)
      .where(
        and(
          eq(workSchedules.tenantId, TENANT_ID),
          eq(workSchedules.legalEntityId, data.legalEntityId),
          eq(workSchedules.isDefault, true),
          eq(workSchedules.isActive, true),
        ),
      )
      .limit(1)
    const defaultScheduleId = defaultSched?.id ?? null

    // 3c. Compose full name + generate person_number (FR-CH-12).
    newNum = await nextPersonNumber(data.legalEntityId, tx)
    const fullNameEn = composeFullNameEn(data)

    // 3c. Encrypt PII fields BEFORE INSERT (Hard Rule 4).
    //     Cleartext lifetime is bounded to this stack frame.
    //     QA-Audit-M7 — normalize EID to canonical dashed form before encrypt.
    const normalisedEid = data.emiratesId ? normalizeEmiratesId(data.emiratesId) : undefined
    const encEid      = encryptNullable(normalisedEid)
    const encPassport = encryptNullable(data.passportNumber)

    // P1-H4 (BR-ID-UNIQ-001): identity uniqueness inside the insert tx —
    // employee code always; EID/passport via hash when enforcement enabled.
    await assertPersonIdentityUnique(tx as unknown as DbOrTx, {
      employeeCode:   data.employeeCode,
      emiratesId:     normalisedEid,
      passportNumber: data.passportNumber,
    })

    const [row] = await tx
      .insert(persons)
      .values({
        ...identityHashColumns(normalisedEid, data.passportNumber),
        tenantId:           TENANT_ID,
        personNumber:       newNum,
        legalEntityId:      data.legalEntityId,
        // Identity
        firstNameEn:        data.firstNameEn,
        middleNameEn:       data.middleNameEn,
        lastNameEn:         data.lastNameEn,
        fullNameEn,
        fullNameAr:         data.fullNameAr,
        preferredName:      data.preferredName,
        salutation:         data.salutation,
        dateOfBirth:        data.dateOfBirth,
        gender:             data.gender,
        maritalStatus:      data.maritalStatus,
        numberOfDependents: data.numberOfDependents,
        // Nationality
        nationalityCode:      data.nationalityCode,
        nationalityCategory:  data.nationalityCategory,
        religion:             data.religion,
        religionConsentGiven: data.religionConsentGiven,
        bloodType:            data.bloodType ?? null,
        // PII (encrypted)
        emiratesId:        encEid,
        emiratesIdExpiry:  data.emiratesIdExpiry,
        passportNumber:    encPassport,
        passportCountry:   data.passportCountry,
        passportIssueDate: data.passportIssueDate,
        passportExpiry:    data.passportExpiry,
        // Visa
        visaNumber:    data.visaNumber,
        visaType:      data.visaType,
        visaIssueDate: data.visaIssueDate,
        visaExpiry:    data.visaExpiry,
        visaStatus:    data.visaStatus,
        // Labour
        labourCardNumber:        data.labourCardNumber,
        labourCardExpiry:        data.labourCardExpiry,
        mohreLabourPermitNumber: data.mohreLabourPermitNumber,
        familyBookNumber:        data.familyBookNumber,
        nafisRegistrationNumber: data.nafisRegistrationNumber,
        // Employment
        employmentType:         data.employmentType,
        contractedHoursPerWeek: data.contractedHoursPerWeek.toString(),
        assignmentStatus:       data.assignmentStatus,
        hireDate:               data.hireDate,
        seniorityDate:          data.seniorityDate ?? data.hireDate,
        originalHireDate:       data.originalHireDate ?? data.hireDate,
        probationEndDate:         data.probationEndDate,
        noticePeriodDays:         data.noticePeriodDays,
        workerCategory:           data.workerCategory ?? null,
        employeeCode:             data.employeeCode   ?? null,
        probationMonthsGranted:   data.probationMonthsGranted ?? null,
        currentDepartmentId:      data.currentDepartmentId,
        currentPositionId:      data.currentPositionId,
        currentJobId:           data.currentJobId,
        currentLocationId:      data.currentLocationId,
        currentGradeId:         data.currentGradeId,
        lineManagerId:          data.lineManagerId,
        dottedLineManagerId:    data.dottedLineManagerId,
        hrRepresentativeId:     data.hrRepresentativeId,
        // PDPL consent (GAP-C04)
        pdplConsentGiven:    data.pdplConsentGiven,
        pdplConsentDate:     data.pdplConsentGiven ? new Date() : undefined,
        pdplConsentVersion:  '1.0',
        sensitiveDataConsent: data.sensitiveDataConsent ?? false,
        sensitiveConsentDate: data.sensitiveDataConsent ? new Date() : undefined,
        // Prefs
        preferredLanguage:   data.preferredLanguage,
        notificationChannel: data.notificationChannel,
        // Custom-field bag
        extraData: data.extraData ?? {},
        // Audit columns
        createdBy:     user.id,
        createdByName: user.name,
      })
      .returning({ id: persons.id })

    newId = row.id

    // 4a. Sync denormalised occupancy on the position row so org chart queries
    //     that rely on positions.occupied_by_person_id still work.
    if (data.currentPositionId) {
      // C4: validate position exists, is active, and is not already occupied
      // before committing the hire. Catches stale page-load data where a
      // concurrent hire may have filled the same position.
      const [pos] = await tx
        .select({ id: positions.id, isOccupied: positions.isOccupied, isActive: positions.isActive })
        .from(positions)
        .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, data.currentPositionId)))
        .limit(1)
      if (!pos) {
        throw new Error('BR-POS-001: specified position does not exist · المنصب المحدد غير موجود')
      }
      if (!pos.isActive) {
        throw new Error('BR-POS-002: specified position is inactive · المنصب المحدد غير نشط')
      }
      if (pos.isOccupied) {
        throw new Error('BR-POS-003: specified position is already occupied by another employee · المنصب المحدد مشغول بموظف آخر')
      }

      await tx
        .update(positions)
        .set({ isOccupied: true, occupiedByPersonId: newId })
        .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, data.currentPositionId)))
    }

    // 4b. Insert a worker_assignment row so the CTE's wa JOIN resolves properly.
    if (data.currentPositionId && data.currentDepartmentId) {
      await tx.insert(workerAssignments).values({
        tenantId:            TENANT_ID,
        personId:            newId,
        legalEntityId:       data.legalEntityId,
        assignmentNumber:    `WA-${newNum}`,
        effectiveStartDate:  data.hireDate,
        assignmentStatus:    data.assignmentStatus ?? 'PENDING_HIRE',
        positionId:          data.currentPositionId,
        jobId:               data.currentJobId ?? undefined,
        departmentId:        data.currentDepartmentId,
        locationId:          data.currentLocationId ?? undefined,
        gradeId:             data.currentGradeId ?? undefined,
        employmentType:          data.employmentType,
        contractedHoursPerWeek:  data.contractedHoursPerWeek.toString(),
        lineManagerId:           data.lineManagerId ?? undefined,
        projectId:               data.projectId ?? undefined,
        projectAllocationPct:    data.allocationPercentage != null
          ? String(data.allocationPercentage)
          : undefined,
        // Task 2D: propagate entity default schedule so timesheets resolve immediately.
        workScheduleId:      defaultScheduleId ?? undefined,
        actionType:              'HIRE',
        actionInitiatedBy:   newId,
        isCurrent:           true,
        createdBy:           user.id,
        createdByName:       user.name,
      })
    }

    // 4b½. Task 2D — Auto-assign entity default work schedule (date-effective history).
    //      Inserted for ALL hires (not just those with a position) so ESS profile
    //      and assignment history always have a starting record.
    if (defaultScheduleId) {
      await tx.insert(workScheduleAssignments).values({
        tenantId:           TENANT_ID,
        personId:           newId,
        legalEntityId:      data.legalEntityId,
        workScheduleId:     defaultScheduleId,
        assignmentReason:   'AUTO_HIRED',
        effectiveStartDate: data.hireDate,
        isCurrent:          true,
        actionMode:         'UPDATE',
        assignedBy:         user.id,
        createdBy:          user.id,
        createdByName:      user.name,
      })
    }

    // 4c. Audit row in the SAME transaction (Hard Rule 1).
    //    NEVER write decrypted PII to audit_log — record only field names
    //    that were touched, plus non-sensitive identifiers.
    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: data.legalEntityId,
      channel:       'WEB',
      eventType:     'PERSON.CREATED',
      resourceType:  'persons',
      resourceId:    newId,
      entityId:      data.legalEntityId,
      newValues: {
        personNumber: newNum,
        legalEntityId: data.legalEntityId,
        nationalityCategory: data.nationalityCategory,
        employmentType: data.employmentType,
        hireDate: data.hireDate,
        // Mark which PII fields were populated, but never include their values.
        piiFields: [
          data.emiratesId     ? 'emiratesId'     : null,
          data.passportNumber ? 'passportNumber' : null,
        ].filter(Boolean),
      },
    }, tx)

    // Auto-promote the line manager to MANAGER role if they now have subordinates.
    if (data.lineManagerId) {
      await evaluateManagerRole(data.lineManagerId, user, tx)
    }
  })

  return { id: newId, personNumber: newNum }
  } catch (e) { translateError(e, 'createPerson') }
}

// ══════════════════════════════════════════════════════════════════════════
// 2 — getPerson
// ══════════════════════════════════════════════════════════════════════════

export async function getPerson(id: string): Promise<PersonView | null> {
  try {
  // Read access: HR_ADMIN+, MANAGER (own direct reports via worker_assignments), or self.
  const user = await requireRole([
    'HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR',
    'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN', 'FINANCE',
  ])

  const [row] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, id)))
    .limit(1)
  if (!row) return null

  const isSelf = user.personId && user.personId === row.id

  // MANAGER direct-report authority is resolved from the DB (persons.line_manager_id
  // OR current worker_assignments.line_manager_id), NOT from the session. This is
  // the real authorization for a manager and is robust to a stale/denormalised
  // session legalEntityId — a manager may always view a confirmed direct report,
  // and is blocked from everyone else.
  const isMgrDirectReport =
    user.role === 'MANAGER' && !isSelf && Boolean(user.personId) &&
    (await isManagerDirectReport(id, user.personId as string))

  // QA-Audit-C2 fix — entity-scope guard. Per Security spec §2.4 every API
  // call is validated against the caller's entity scope. SUPER_ADMIN,
  // self-access, and a manager's confirmed direct report are the exceptions.
  if (
    user.role !== 'SUPER_ADMIN'
    && !isSelf
    && !isMgrDirectReport
    && user.legalEntityId !== row.legalEntityId
  ) {
    throw new Error('FORBIDDEN: cross-entity person access denied')
  }

  // EMPLOYEE may only read their own record.
  if (user.role === 'EMPLOYEE' && !isSelf) {
    throw new Error('FORBIDDEN: employees may only read their own record')
  }

  // MANAGER may only read their direct reports (DB-resolved above).
  if (user.role === 'MANAGER' && !isSelf) {
    if (!user.personId) {
      throw new Error('FORBIDDEN: manager session has no linked person record')
    }
    if (!isMgrDirectReport) {
      throw new Error('FORBIDDEN: this person is not in your team · هذا الشخص ليس ضمن فريقك')
    }
  }

  // QA-Audit-M6 fix — best-effort read-side audit. Failures are logged but
  // never block the read (see writeAuditLog catch). PII unmask is the
  // privileged audit event; non-privileged reads still get a PERSON.READ row
  // for PDPL data-subject access trails.
  const isPrivilegedReader = ['HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(user.role)
  try {
    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: row.legalEntityId,
      channel:       'WEB',
      eventType:     isPrivilegedReader ? 'PERSON.PII_VIEWED' : 'PERSON.READ',
      resourceType:  'persons',
      resourceId:    row.id,
      entityId:      row.legalEntityId,
      metadata:      { unmasked: isPrivilegedReader, isSelf },
    })
  } catch (err) {
    console.error('[core-hr] read-side audit failed:', err)
  }

  return projectPerson(row, {
    role:          user.role,
    viewerPersonId: user.personId,
  })
  } catch (e) { translateError(e, 'getPerson') }
}

// ══════════════════════════════════════════════════════════════════════════
// 3 — listPersons (paginated; basic version for S3-01, expanded in S3-08)
// ══════════════════════════════════════════════════════════════════════════

export async function listPersons(
  filter: Partial<ListPersonsFilter> = {},
): Promise<PaginatedPersons> {
  try {
  const user = await requireRole([
    'HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR',
    'MANAGER', 'SUPER_ADMIN', 'FINANCE',
  ])
  const f = ListPersonsFilterSchema.parse(filter)

  // Entity scoping (Security spec §2.4) — non-SUPER_ADMIN can only see their
  // own legal entity. The optional filter must match if provided.
  const scopedEntityId =
    user.role === 'SUPER_ADMIN'
      ? f.legalEntityId
      : (f.legalEntityId ?? user.legalEntityId)

  const conditions = [eq(persons.tenantId, TENANT_ID)]

  // MANAGER sees only their direct reports via worker_assignments.line_manager_id.
  if (user.role === 'MANAGER') {
    if (!user.personId) {
      throw new Error('FORBIDDEN: manager session has no linked person record')
    }
    const directReportRows = await db
      .select({ personId: workerAssignments.personId })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.lineManagerId, user.personId),
        eq(workerAssignments.isCurrent, true),
      ))
    const ids = directReportRows.map(r => r.personId).filter(Boolean) as string[]
    // Return empty result immediately if manager has no active direct reports.
    if (ids.length === 0) {
      return { rows: [], total: 0, page: f.page, pageSize: f.pageSize, totalPages: 1 }
    }
    conditions.push(sql`${persons.id} = ANY(ARRAY[${sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)}])`)
  }

  if (scopedEntityId) conditions.push(eq(persons.legalEntityId, scopedEntityId))
  if (f.departmentId) conditions.push(eq(persons.currentDepartmentId, f.departmentId))
  // Department Head filter — employee → currentDepartmentId → departments.head_person_id.
  // Reuses the existing `departments` leftJoin (present in BOTH count and rows queries),
  // so it adds NO join and stays in the shared `conditions` array — composing with the
  // tenant guard (L451), entity scoping (scopedEntityId), and the MANAGER direct-report
  // restriction above. Persons with a NULL current department never match (correct).
  if (f.departmentHeadId) conditions.push(eq(departments.headPersonId, f.departmentHeadId))
  if (f.status)       conditions.push(eq(persons.assignmentStatus, f.status))
  if (f.projectId) {
    // BR-PROJ-003: filter via current worker_assignment.project_id (subquery avoids extra join)
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM worker_assignments _wa
        WHERE _wa.person_id = ${persons.id}
          AND _wa.project_id = ${f.projectId}::uuid
          AND _wa.is_current = true
          AND _wa.tenant_id = ${TENANT_ID}::uuid
      )`,
    )
  }
  if (f.isActive !== undefined) conditions.push(eq(persons.isActive, f.isActive))
  if (f.search) {
    const pat = `%${f.search}%`
    conditions.push(
      or(
        ilike(persons.personNumber,         pat),
        ilike(persons.fullNameEn,           pat),
        ilike(persons.fullNameAr,           pat),
        ilike(persons.firstNameEn,          pat),
        ilike(persons.lastNameEn,           pat),
        ilike(departments.nameEn,           pat),
        ilike(positions.positionTitleEn,    pat),
        ilike(legalEntities.nameEn,         pat),
        ilike(legalEntities.entityCode,     pat),
        ilike(persons.assignmentStatus,     pat),
      )!,
    )
  }
  if (f.emiratisationEligibleOnly) {
    // S3-12: UAE Nationals AND current job carries is_emiratisation_target.
    conditions.push(eq(persons.nationalityCategory, 'UAE_NATIONAL'))
    conditions.push(eq(jobs.isEmiratisationTarget, true))
  }

  const where = and(...conditions)!

  // count() must mirror all joins referenced in the where clause.
  const [{ total }] = await db
    .select({ total: count() })
    .from(persons)
    .leftJoin(legalEntities, eq(persons.legalEntityId, legalEntities.id))
    .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
    .leftJoin(positions, eq(persons.currentPositionId, positions.id))
    .leftJoin(jobs, eq(persons.currentJobId, jobs.id))
    .where(where)

  const offset = (f.page - 1) * f.pageSize
  const rows = await db
    .select({
      id:                  persons.id,
      personNumber:        persons.personNumber,
      fullNameEn:          persons.fullNameEn,
      fullNameAr:          persons.fullNameAr,
      legalEntityId:       persons.legalEntityId,
      legalEntityCode:     legalEntities.entityCode,
      departmentId:        persons.currentDepartmentId,
      departmentNameEn:    departments.nameEn,
      positionId:          persons.currentPositionId,
      positionTitleEn:     positions.positionTitleEn,
      nationalityCategory: persons.nationalityCategory,
      nationalityCode:     persons.nationalityCode,
      assignmentStatus:    persons.assignmentStatus,
      hireDate:            persons.hireDate,
      probationStatus:     persons.probationStatus,
      probationEndDate:    persons.probationEndDate,
      isActive:            persons.isActive,
      jobIsEmiratisationTarget: jobs.isEmiratisationTarget,
    })
    .from(persons)
    .leftJoin(legalEntities, eq(persons.legalEntityId, legalEntities.id))
    .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
    .leftJoin(positions, eq(persons.currentPositionId, positions.id))
    .leftJoin(jobs, eq(persons.currentJobId, jobs.id))
    .where(where)
    .orderBy(...buildOrderBy(
      { column: f.sortColumn ?? null, direction: f.sortDirection ?? null },
      {
        employee_number: persons.personNumber,
        name:            persons.fullNameEn,
        department:      departments.nameEn,
        position:        positions.positionTitleEn,
        nationality:     persons.nationalityCode,
        status:          persons.assignmentStatus,
        hire_date:       persons.hireDate,
      },
      persons.personNumber,
    ))
    .limit(f.pageSize)
    .offset(offset)

  const list: PersonListRow[] = rows.map(r => ({
    id:                  r.id,
    personNumber:        r.personNumber,
    fullNameEn:          r.fullNameEn,
    fullNameAr:          r.fullNameAr,
    workEmail:           null, // populated when person_contacts is queried
    legalEntityId:       r.legalEntityId,
    legalEntityCode:     r.legalEntityCode,
    departmentId:        r.departmentId,
    departmentNameEn:    r.departmentNameEn,
    positionId:          r.positionId,
    positionTitleEn:     r.positionTitleEn,
    nationalityCategory: r.nationalityCategory,
    nationalityCode:     r.nationalityCode,
    assignmentStatus:    r.assignmentStatus,
    hireDate:            r.hireDate,
    probationStatus:     r.probationStatus,
    probationEndDate:    r.probationEndDate,
    isActive:            r.isActive,
    isEmiratisationEligible: isEmiratisationEligible({
      nationalityCategory:    r.nationalityCategory,
      jobIsEmiratisationTarget: r.jobIsEmiratisationTarget,
    }),
  }))

  return {
    rows:       list,
    total:      Number(total),
    page:       f.page,
    pageSize:   f.pageSize,
    totalPages: Math.ceil(Number(total) / f.pageSize) || 1,
  }
  } catch (e) {
    if (shouldRethrowListPersonsError(e)) throw e

    // BUG-NAV-001: translateError always re-throws, crashing Server Components.
    // listPersons is called from a Server Component (persons/page.tsx) inside
    // Promise.all — return a graceful empty page so the list renders "0 results"
    // instead of "An error occurred in the Server Components render".
    console.error('[listPersons] unexpected error:', e instanceof Error ? e.message : String(e))
    return { rows: [], total: 0, page: 1, pageSize: 25, totalPages: 1 }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 4 — updatePerson
// ══════════════════════════════════════════════════════════════════════════

export async function updatePerson(
  id:    string,
  patch: UpdatePersonInput,
): Promise<{ id: string; changedFields: string[] }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  // P3-D2: feature-permission layer on top of RBAC (legacy-allow if row absent)
  await requirePermission(user, 'EMPLOYEE_PROFILE', 'edit')
  const data = UpdatePersonSchema.parse(patch)

  // Auto-translate fullNameAr when English name parts are being updated.
  // Done OUTSIDE the DB transaction to avoid holding the connection open
  // during an external API call. English is always the source of truth.
  const nameEnPatched =
    data.firstNameEn !== undefined ||
    data.middleNameEn !== undefined ||
    data.lastNameEn !== undefined
  if (nameEnPatched && data.fullNameAr === undefined) {
    // Fetch current name parts so we can compose the full new English name.
    const [existing] = await db
      .select({
        firstNameEn:  persons.firstNameEn,
        middleNameEn: persons.middleNameEn,
        lastNameEn:   persons.lastNameEn,
      })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, id)))
      .limit(1)

    if (existing) {
      const newFullNameEn = [
        data.firstNameEn  ?? existing.firstNameEn,
        data.middleNameEn ?? existing.middleNameEn,
        data.lastNameEn   ?? existing.lastNameEn,
      ].filter(Boolean).join(' ')
      const translated = await translateToArabic(newFullNameEn)
      // Assign into data so the payload block below picks it up.
      if (translated) (data as Record<string, unknown>).fullNameAr = translated
    }
  }

  let changed: string[] = []

  await db.transaction(async tx => {
    const [before] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, id)))
      .limit(1)
    if (!before) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== before.legalEntityId) {
      throw new Error('FORBIDDEN: cannot update persons in another legal entity')
    }

    // Build the update payload. PII fields are encrypted only if PRESENT in
    // the patch — otherwise the existing ciphertext is preserved.
    const updatePayload: Partial<Person> & Record<string, unknown> = {
      // Audit columns
      updatedBy:        user.id,
      updatedByName:    user.name,
      updatedDate:      new Date(),
      lastUpdatedDate:  new Date(),
    }

    // Identity (recompute fullNameEn if any name part changed)
    if (data.firstNameEn  !== undefined) updatePayload.firstNameEn  = data.firstNameEn
    if (data.middleNameEn !== undefined) updatePayload.middleNameEn = data.middleNameEn
    if (data.lastNameEn   !== undefined) updatePayload.lastNameEn   = data.lastNameEn
    if (data.fullNameAr   !== undefined) updatePayload.fullNameAr   = data.fullNameAr
    if (data.firstNameEn !== undefined || data.middleNameEn !== undefined || data.lastNameEn !== undefined) {
      updatePayload.fullNameEn = composeFullNameEn({
        firstNameEn:  data.firstNameEn  ?? before.firstNameEn,
        middleNameEn: data.middleNameEn ?? before.middleNameEn,
        lastNameEn:   data.lastNameEn   ?? before.lastNameEn,
      })
    }
    if (data.preferredName !== undefined) updatePayload.preferredName = data.preferredName
    if (data.salutation    !== undefined) updatePayload.salutation    = data.salutation
    if (data.dateOfBirth   !== undefined) updatePayload.dateOfBirth   = data.dateOfBirth
    if (data.gender        !== undefined) updatePayload.gender        = data.gender
    if (data.maritalStatus !== undefined) updatePayload.maritalStatus = data.maritalStatus
    if (data.numberOfDependents !== undefined) updatePayload.numberOfDependents = data.numberOfDependents

    // Nationality
    if (data.nationalityCode      !== undefined) updatePayload.nationalityCode      = data.nationalityCode
    if (data.nationalityCategory  !== undefined) updatePayload.nationalityCategory  = data.nationalityCategory
    if (data.religion             !== undefined) updatePayload.religion             = data.religion
    if (data.religionConsentGiven !== undefined) updatePayload.religionConsentGiven = data.religionConsentGiven
    // EPE-R08: blood_type is PDPL-sensitive; do not allow clearing sensitiveDataConsent guard here
    if (data.bloodType !== undefined) {
      if (data.bloodType && !before.sensitiveDataConsent) {
        throw new Error('PDPL_SENSITIVE_CONSENT_REQUIRED: Blood type requires sensitive data consent to be recorded')
      }
      updatePayload.bloodType = data.bloodType ?? null
    }

    // PII — encrypted on the way in (Hard Rule 4).
    // P1-H4 (BR-ID-UNIQ-001): keep hash columns in lockstep when enforcement on.
    if (data.emiratesId       !== undefined) {
      const normalisedEidUpd = data.emiratesId ? normalizeEmiratesId(data.emiratesId) : data.emiratesId
      updatePayload.emiratesId = encryptNullable(normalisedEidUpd)
      Object.assign(updatePayload, (() => {
        const h = identityHashColumns(normalisedEidUpd, undefined)
        return 'emiratesIdHash' in h ? { emiratesIdHash: h.emiratesIdHash } : {}
      })())
    }
    if (data.emiratesIdExpiry !== undefined) updatePayload.emiratesIdExpiry = data.emiratesIdExpiry
    if (data.passportNumber   !== undefined) {
      updatePayload.passportNumber = encryptNullable(data.passportNumber)
      Object.assign(updatePayload, (() => {
        const h = identityHashColumns(undefined, data.passportNumber)
        return 'passportNumberHash' in h ? { passportNumberHash: h.passportNumberHash } : {}
      })())
    }
    if (data.passportCountry  !== undefined) updatePayload.passportCountry  = data.passportCountry
    if (data.passportIssueDate !== undefined) updatePayload.passportIssueDate = data.passportIssueDate
    if (data.passportExpiry   !== undefined) updatePayload.passportExpiry   = data.passportExpiry
    if (data.visaNumber       !== undefined) updatePayload.visaNumber       = data.visaNumber
    if (data.visaType         !== undefined) updatePayload.visaType         = data.visaType
    if (data.visaIssueDate    !== undefined) updatePayload.visaIssueDate    = data.visaIssueDate
    if (data.visaExpiry       !== undefined) updatePayload.visaExpiry       = data.visaExpiry
    if (data.visaStatus       !== undefined) updatePayload.visaStatus       = data.visaStatus
    if (data.labourCardNumber        !== undefined) updatePayload.labourCardNumber        = data.labourCardNumber
    if (data.labourCardExpiry        !== undefined) updatePayload.labourCardExpiry        = data.labourCardExpiry
    if (data.mohreLabourPermitNumber !== undefined) updatePayload.mohreLabourPermitNumber = data.mohreLabourPermitNumber
    if (data.familyBookNumber        !== undefined) updatePayload.familyBookNumber        = data.familyBookNumber
    if (data.nafisRegistrationNumber !== undefined) updatePayload.nafisRegistrationNumber = data.nafisRegistrationNumber

    // Insurance
    if (data.insuranceCardNumber    !== undefined) updatePayload.insuranceCardNumber    = data.insuranceCardNumber
    if (data.insuranceMemberId      !== undefined) updatePayload.insuranceMemberId      = data.insuranceMemberId
    if (data.insuranceProviderName  !== undefined) updatePayload.insuranceProviderName  = data.insuranceProviderName
    if (data.insuranceNetwork       !== undefined) updatePayload.insuranceNetwork       = data.insuranceNetwork
    if (data.insuranceCategory      !== undefined) updatePayload.insuranceCategory      = data.insuranceCategory
    if (data.insuranceEffectiveDate !== undefined) updatePayload.insuranceEffectiveDate = data.insuranceEffectiveDate
    if (data.insuranceExpiryDate    !== undefined) updatePayload.insuranceExpiryDate    = data.insuranceExpiryDate
    if (data.insuranceStatus        !== undefined) updatePayload.insuranceStatus        = data.insuranceStatus

    // Reporting & assignment (triggers manager role evaluation below)
    if (data.lineManagerId          !== undefined) updatePayload.lineManagerId          = data.lineManagerId
    if (data.assignmentStatus       !== undefined) updatePayload.assignmentStatus       = data.assignmentStatus
    // Task 2C — employment classification fields
    if (data.workerCategory         !== undefined) updatePayload.workerCategory         = data.workerCategory
    if (data.employeeCode           !== undefined) updatePayload.employeeCode           = data.employeeCode
    if (data.currentJobId           !== undefined) updatePayload.currentJobId           = data.currentJobId
    if (data.dottedLineManagerId    !== undefined) updatePayload.dottedLineManagerId    = data.dottedLineManagerId
    if (data.noticePeriodDays       !== undefined) updatePayload.noticePeriodDays       = data.noticePeriodDays
    if (data.probationMonthsGranted !== undefined) updatePayload.probationMonthsGranted = data.probationMonthsGranted

    // Prefs + custom-field bag
    if (data.preferredLanguage   !== undefined) updatePayload.preferredLanguage   = data.preferredLanguage
    if (data.notificationChannel !== undefined) updatePayload.notificationChannel = data.notificationChannel
    if (data.extraData           !== undefined) updatePayload.extraData           = data.extraData

    if (Object.keys(updatePayload).length <= 4) {
      // only the 4 audit columns — caller sent an empty patch
      changed = []
      return
    }

    // P1-H4 (BR-ID-UNIQ-001): identity uniqueness inside the update tx,
    // excluding this person. Only checks the identifiers being changed.
    await assertPersonIdentityUnique(tx as unknown as DbOrTx, {
      excludePersonId: id,
      employeeCode:    data.employeeCode !== undefined ? data.employeeCode : undefined,
      emiratesId:      data.emiratesId   !== undefined && data.emiratesId
        ? normalizeEmiratesId(data.emiratesId) : undefined,
      passportNumber:  data.passportNumber !== undefined ? data.passportNumber : undefined,
    })

    await tx
      .update(persons)
      .set(updatePayload)
      .where(eq(persons.id, id))

    // Compute changed-fields list for the audit row.
    // NEVER copy PII plaintext into audit_log — we record only the field
    // NAMES that changed, never their values, for the encrypted columns.
    // bloodType added: sensitive health data — never log plaintext value in audit
    const PII_FIELDS = new Set(['emiratesId', 'passportNumber', 'bloodType'])
    const sanitisedBefore: Record<string, unknown> = { ...before }
    const sanitisedAfter:  Record<string, unknown> = { ...before, ...updatePayload }
    for (const f of PII_FIELDS) {
      sanitisedBefore[f] = before[f as keyof Person] ? '<encrypted>' : null
      sanitisedAfter[f]  = updatePayload[f]            ? '<encrypted>' : sanitisedBefore[f]
    }
    changed = diffFields(sanitisedBefore, sanitisedAfter)

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: before.legalEntityId,
      channel:       'WEB',
      eventType:     'PERSON.UPDATED',
      resourceType:  'persons',
      resourceId:    id,
      entityId:      before.legalEntityId,
      changedFields: changed,
      // oldValues/newValues are intentionally omitted for sensitive columns
      // (see sanitisedBefore/sanitisedAfter above). Audit log keeps the
      // change record without leaking PII plaintext.
      metadata: {
        piiFieldsChanged: changed.filter(f => PII_FIELDS.has(f)),
      },
    }, tx)

    // Sync positions.occupied_by_person_id when currentPositionId changes.
    const positionChanged = data.lineManagerId !== undefined &&
      (updatePayload as Record<string, unknown>).currentPositionId !== undefined
    if ('currentPositionId' in updatePayload) {
      const newPosId = (updatePayload as Record<string, unknown>).currentPositionId as string | null
      if (before.currentPositionId && before.currentPositionId !== newPosId) {
        await tx
          .update(positions)
          .set({ isOccupied: false, occupiedByPersonId: null })
          .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, before.currentPositionId)))
      }
      if (newPosId) {
        await tx
          .update(positions)
          .set({ isOccupied: true, occupiedByPersonId: id })
          .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, newPosId)))
      }
    }

    // Auto-promote / demote line managers based on updated reporting relationships.
    // Evaluate old manager (may have lost a subordinate) if lineManagerId changed or
    // this person's status moved to an inactive state.
    const lineManagerChanged   = data.lineManagerId !== undefined && data.lineManagerId !== before.lineManagerId
    const statusBecameInactive = data.assignmentStatus !== undefined &&
      !['ACTIVE', 'ON_LEAVE'].includes(data.assignmentStatus) &&
      ['ACTIVE', 'ON_LEAVE'].includes(before.assignmentStatus ?? '')

    if (lineManagerChanged && before.lineManagerId) {
      await evaluateManagerRole(before.lineManagerId, user, tx)
    }
    if ((lineManagerChanged || statusBecameInactive) && data.lineManagerId) {
      await evaluateManagerRole(data.lineManagerId as string, user, tx)
    } else if (statusBecameInactive && before.lineManagerId) {
      await evaluateManagerRole(before.lineManagerId, user, tx)
    }
  })

  return { id, changedFields: changed }
  } catch (e) { translateError(e, 'updatePerson') }
}

// ── Get current worker assignment project/allocation for a person ─────────
export async function getPersonCurrentProject(
  personId: string,
): Promise<{ projectId: string | null; allocationPercentage: string | null }> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const [wa] = await db
      .select({ projectId: workerAssignments.projectId, allocationPercentage: workerAssignments.projectAllocationPct })
      .from(workerAssignments)
      .where(and(eq(workerAssignments.tenantId, TENANT_ID), eq(workerAssignments.personId, personId), eq(workerAssignments.isCurrent, true)))
      .limit(1)
    return { projectId: wa?.projectId ?? null, allocationPercentage: wa?.allocationPercentage ?? null }
  } catch {
    return { projectId: null, allocationPercentage: null }
  }
}

// ── Update current worker assignment project/allocation ──────────────────
// Returns { success: true } on persist, { noAssignment: true } when the
// person has no active worker_assignment yet (PENDING_HIRE), or { error }
// on validation/DB failure.
export async function updatePersonProject(
  personId: string,
  projectId: string | null,
  allocationPercentage: number | null,
): Promise<{ success?: boolean; noAssignment?: boolean; error?: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    // Validate project is active before touching the DB (fast-fail outside tx)
    if (projectId) {
      const [proj] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.isActive, true)))
        .limit(1)
      if (!proj) throw new Error('Selected project is inactive or does not exist.')
    }

    // Find the current worker assignment (inside the upcoming tx is fine too but
    // reading outside avoids holding a row lock during the validation above).
    const [currentAssignment] = await db
      .select({ id: workerAssignments.id })
      .from(workerAssignments)
      .where(
        and(
          eq(workerAssignments.tenantId, TENANT_ID),
          eq(workerAssignments.personId, personId),
          eq(workerAssignments.isCurrent, true),
        ),
      )
      .limit(1)

    if (!currentAssignment) {
      // Person is PENDING_HIRE or has no active assignment yet. The project
      // selection cannot be stored until an assignment row exists. Return a
      // distinct flag so the UI can explain this to the HR admin rather than
      // silently discarding the value.
      return { noAssignment: true }
    }

    // Hard Rule 1 — DB write and audit row in the SAME transaction.
    await db.transaction(async tx => {
      await tx
        .update(workerAssignments)
        .set({
          projectId:            projectId ?? null,
          projectAllocationPct: allocationPercentage != null ? String(allocationPercentage) : null,
          updatedBy:            user.id,
          updatedByName:        user.name,
          lastUpdatedDate:      new Date(),
        })
        .where(eq(workerAssignments.id, currentAssignment.id))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: user.legalEntityId,
        channel:       'WEB',
        eventType:     'PERSON.PROJECT_UPDATED',
        resourceType:  'worker_assignments',
        resourceId:    currentAssignment.id,
        entityId:      user.legalEntityId,
        newValues:     { projectId, allocationPercentage },
        description:   `Project assignment updated for person ${personId}`,
      }, tx)
    })

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong.'
    return { error: msg }
  }
}

// ── re-export the input types so the form page (S3-02) can import them
//    via modules/core-hr/index.ts (Hard Rule 6). ──────────────────────────
export type { CreatePersonInput, UpdatePersonInput } from './validations'

// ══════════════════════════════════════════════════════════════════════════
// Task 2B — Personal Profile Field Upserts
// ══════════════════════════════════════════════════════════════════════════

export async function upsertPersonEmergencyContact(
  personId: string,
  data: {
    contactNameEn: string
    relationship:  string
    phonePrimary:  string
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    if (!data.contactNameEn.trim() || !data.phonePrimary.trim()) {
      return { success: false, error: 'Name and phone are required' }
    }
    await db.transaction(async tx => {
      const [existing] = await tx
        .select({ id: personEmergencyContacts.id })
        .from(personEmergencyContacts)
        .where(and(
          eq(personEmergencyContacts.personId, personId),
          eq(personEmergencyContacts.tenantId, TENANT_ID),
          eq(personEmergencyContacts.priorityOrder, 1),
        ))
        .limit(1)
      const now = new Date()
      if (existing) {
        await tx.update(personEmergencyContacts)
          .set({
            contactNameEn:   data.contactNameEn,
            relationship:    data.relationship,
            phonePrimary:    data.phonePrimary,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: now,
          })
          .where(eq(personEmergencyContacts.id, existing.id))
      } else {
        await tx.insert(personEmergencyContacts).values({
          tenantId:      TENANT_ID,
          personId,
          contactNameEn: data.contactNameEn,
          contactNameAr: '',
          relationship:  data.relationship,
          phonePrimary:  data.phonePrimary,
          priorityOrder: 1,
          createdBy:     user.id,
          createdByName: user.name,
          createdDate:   now,
        })
      }
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        channel: 'WEB', eventType: 'PERSON.EMERGENCY_CONTACT_UPDATED',
        resourceType: 'person_emergency_contacts', resourceId: personId,
        entityId: user.legalEntityId,
        description: `Emergency contact updated for person ${personId}`,
      }, tx)
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save emergency contact' }
  }
}

export async function upsertPersonHomeAddress(
  personId: string,
  data: {
    addressLine1: string
    addressLine2?: string | null
    city:         string
    stateEmirate?: string | null
    country:      string
    postalCode?:  string | null
    poBox?:       string | null
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    if (!data.addressLine1.trim() || !data.city.trim() || !data.country.trim()) {
      return { success: false, error: 'Address line 1, city, and country are required' }
    }
    const today = new Date().toISOString().slice(0, 10)
    await db.transaction(async tx => {
      const [existing] = await tx
        .select({ id: personAddresses.id })
        .from(personAddresses)
        .where(and(
          eq(personAddresses.personId,    personId),
          eq(personAddresses.tenantId,    TENANT_ID),
          eq(personAddresses.addressType, 'HOME_COUNTRY'),
        ))
        .limit(1)
      const now = new Date()
      if (existing) {
        await tx.update(personAddresses)
          .set({
            addressLine1:    data.addressLine1,
            addressLine2:    data.addressLine2 ?? null,
            city:            data.city,
            stateEmirate:    data.stateEmirate ?? null,
            country:         data.country,
            postalCode:      data.postalCode ?? null,
            poBox:           data.poBox ?? null,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: now,
          })
          .where(eq(personAddresses.id, existing.id))
      } else {
        await tx.insert(personAddresses).values({
          tenantId:      TENANT_ID,
          personId,
          addressType:   'HOME_COUNTRY',
          addressLine1:  data.addressLine1,
          addressLine2:  data.addressLine2 ?? null,
          city:          data.city,
          stateEmirate:  data.stateEmirate ?? null,
          country:       data.country,
          postalCode:    data.postalCode ?? null,
          poBox:         data.poBox ?? null,
          isPrimary:     false,
          effectiveFrom: today,
          createdBy:     user.id,
          createdByName: user.name,
          createdDate:   now,
        })
      }
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        channel: 'WEB', eventType: 'PERSON.HOME_ADDRESS_UPDATED',
        resourceType: 'person_addresses', resourceId: personId,
        entityId: user.legalEntityId,
        description: `Home country address updated for person ${personId}`,
      }, tx)
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save address' }
  }
}

export async function upsertPersonEducation(
  personId: string,
  data: {
    institutionName: string
    degreeType?:     string | null
    fieldOfStudy?:   string | null
    country?:        string | null
    startYear?:      number | null
    graduationYear?: number | null
    isHighestDegree: boolean
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    if (!data.institutionName.trim()) {
      return { success: false, error: 'Institution name is required' }
    }
    await db.transaction(async tx => {
      // Find highest-degree record if marking as highest
      const [existingHighest] = await tx
        .select({ id: personEducation.id })
        .from(personEducation)
        .where(and(
          eq(personEducation.personId,       personId),
          eq(personEducation.tenantId,       TENANT_ID),
          eq(personEducation.isHighestDegree, true),
        ))
        .limit(1)
      const now = new Date()
      if (existingHighest) {
        await tx.update(personEducation)
          .set({
            institutionName: data.institutionName,
            degreeType:      data.degreeType ?? null,
            fieldOfStudy:    data.fieldOfStudy ?? null,
            country:         data.country ?? null,
            startYear:       data.startYear ?? null,
            graduationYear:  data.graduationYear ?? null,
            isHighestDegree: data.isHighestDegree,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: now,
          })
          .where(eq(personEducation.id, existingHighest.id))
      } else {
        await tx.insert(personEducation).values({
          tenantId:        TENANT_ID,
          personId,
          institutionName: data.institutionName,
          degreeType:      data.degreeType ?? null,
          fieldOfStudy:    data.fieldOfStudy ?? null,
          country:         data.country ?? null,
          startYear:       data.startYear ?? null,
          graduationYear:  data.graduationYear ?? null,
          isHighestDegree: data.isHighestDegree,
          createdBy:       user.id,
          createdByName:   user.name,
          createdDate:     now,
        })
      }
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        channel: 'WEB', eventType: 'PERSON.EDUCATION_UPDATED',
        resourceType: 'person_education', resourceId: personId,
        entityId: user.legalEntityId,
        description: `Education record updated for person ${personId}`,
      }, tx)
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save education' }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Data Subject Access Request (DSAR) — GAP-C04 FIX
// UAE PDPL Article 13: data subject right to access their personal data.
// ══════════════════════════════════════════════════════════════════════════

export interface PersonDataExport {
  person:      Record<string, unknown>
  contacts:    unknown[]
  addresses:   unknown[]
  documents:   { id: string; documentType: string; documentStatus: string; issueDate: string | null; expiryDate: string | null }[]
  bankSummary: { accountType: string | null; isPrimary: boolean }[]
  dependents:  { id: string; relationship: string; firstNameEn: string; lastNameEn: string }[]
}

export async function requestPersonalDataExport(
  personId: string,
): Promise<PersonDataExport> {
  try {
  const user = await requireRole([
    'EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
  ])

  // Employee can only request their own data;
  // HR_DIRECTOR / SUPER_ADMIN can request for any person.
  const isOwnRequest = user.personId === personId
  const isAdmin = user.role === 'HR_DIRECTOR' || user.role === 'SUPER_ADMIN'
  if (!isOwnRequest && !isAdmin) {
    throw new Error('FORBIDDEN: Can only request your own personal data')
  }

  const [person] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  if (!person) throw new Error('NOT_FOUND: person record not found')

  const [contacts, addresses, documents, bankRows, dependents] = await Promise.all([
    db.select().from(personContacts)
      .where(and(eq(personContacts.tenantId, TENANT_ID), eq(personContacts.personId, personId))),
    db.select().from(personAddresses)
      .where(and(eq(personAddresses.tenantId, TENANT_ID), eq(personAddresses.personId, personId))),
    db.select({
      id:             personDocuments.id,
      documentType:   personDocuments.documentType,
      documentStatus: personDocuments.documentStatus,
      issueDate:      personDocuments.issueDate,
      expiryDate:     personDocuments.expiryDate,
    })
      .from(personDocuments)
      .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.personId, personId))),
    db.select({
      accountType: personBankDetails.accountType,
      isPrimary:   personBankDetails.isPrimary,
      // IBAN deliberately excluded — masked summary only for DSAR export
    })
      .from(personBankDetails)
      .where(and(eq(personBankDetails.tenantId, TENANT_ID), eq(personBankDetails.personId, personId))),
    db.select({
      id:           personDependents.id,
      relationship: personDependents.relationship,
      firstNameEn:  personDependents.firstNameEn,
      lastNameEn:   personDependents.lastNameEn,
    })
      .from(personDependents)
      .where(and(eq(personDependents.tenantId, TENANT_ID), eq(personDependents.personId, personId))),
  ])

  // PDPL Article 15: log the data access request (immutable audit trail)
  await writeAuditLog({
    actorId:      user.id,
    actorName:    user.name,
    actorRole:    user.role,
    channel:      'WEB',
    eventType:    'PERSON.DSAR_REQUESTED',
    resourceType: 'persons',
    resourceId:   personId,
    entityId:     person.legalEntityId,
    metadata:     { requestedBy: isOwnRequest ? 'SELF' : 'ADMIN' },
  })

  // Strip PII ciphertext fields from the export — return structural summary
  const { emiratesId, passportNumber, ...safePersonFields } = person

  return {
    person:     { ...safePersonFields, emiratesIdOnFile: !!emiratesId, passportOnFile: !!passportNumber },
    contacts,
    addresses,
    documents,
    bankSummary: bankRows,
    dependents,
  }
  } catch (e) { translateError(e, 'requestPersonalDataExport') }
}
export type { SessionUser }


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bank-details/actions.ts
LINES: 234
================================================================================
'use server'

/**
 * S3-10 — Bank-details Server Actions with IBAN encryption.
 *
 * BR-WPS-004: UAE IBAN must be 23 chars starting with AE.
 * Hard Rule 4: IBAN ciphertext is the only thing persisted; the plaintext
 *              never lives outside this stack frame.
 * Hard Rule 3: closing a bank-details row uses effective-date close +
 *              insert (never DELETE).
 */
import { translateError } from '@/lib/app-error'
import { and, eq } from 'drizzle-orm'
import { personBankDetails, persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { encrypt, decryptNullable } from '@/lib/encryption'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { addDays } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import type { ActionMode } from '@/lib/action-mode'
import { requireCorrectionModePermission } from '@/modules/config/guards'
import { assertUaeIbanFormat, maskTail } from '../services'
import { CreateBankDetailsSchema, type CreateBankDetailsInput } from './validations'

export async function createBankDetails(
  input: CreateBankDetailsInput,
  mode: ActionMode = 'UPDATE',
  correctionNote?: string,
): Promise<{ id: string }> {
  try {
  if (mode === 'CORRECTION' && !correctionNote?.trim()) {
    throw new Error('CORRECTION mode requires a non-empty correctionNote')
  }
  const user = await requireRole(['HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  // CORRECTION mode is restricted to HR_DIRECTOR / SUPER_ADMIN.
  if (mode === 'CORRECTION') requireCorrectionModePermission(user.role)

  const data = CreateBankDetailsSchema.parse(input)
  assertUaeIbanFormat(data.iban)

  let resultId = ''

  await db.transaction(async tx => {
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, data.personId)).limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity bank-details write denied')
    }

    const ibanCiphertext = encrypt(data.iban)

    if (mode === 'CORRECTION') {
      // ── CORRECTION: update existing primary row in-place; no new history row ──
      // Read the current primary row so we can audit masked before/after IBAN.
      const [existing] = await tx
        .select({ id: personBankDetails.id, iban: personBankDetails.iban,
                  bankName: personBankDetails.bankName, bankCode: personBankDetails.bankCode })
        .from(personBankDetails)
        .where(and(
          eq(personBankDetails.tenantId, TENANT_ID),
          eq(personBankDetails.personId, data.personId),
          eq(personBankDetails.isPrimary, true),
        ))
        .limit(1)
      if (!existing) throw new Error('no active bank-details record to correct')

      await tx
        .update(personBankDetails)
        .set({
          bankName:        data.bankName,
          bankCode:        data.bankCode,
          iban:            ibanCiphertext,
          accountName:     data.accountName,
          accountType:     data.accountType,
          currency:        data.currency,
          isWpsAccount:    data.isWpsAccount,
          actionMode:      'CORRECTION',
          updatedBy:       user.id,
          updatedByName:   user.name,
          updatedDate:     new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(personBankDetails.id, existing.id))
      resultId = existing.id

      const oldIbanMasked = maskTail(decryptNullable(existing.iban), 4)
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: person.legalEntityId,
        channel: 'WEB',
        eventType: 'BANK_DETAILS.CORRECTED',
        resourceType: 'person_bank_details',
        resourceId: resultId,
        entityId: person.legalEntityId,
        actionMode: 'CORRECTION',
        oldValues: { bankName: existing.bankName, bankCode: existing.bankCode, ibanMasked: oldIbanMasked },
        newValues: { bankName: data.bankName, bankCode: data.bankCode,
                     ibanMasked: maskTail(data.iban, 4), isWpsAccount: data.isWpsAccount },
        metadata: { correctionNote },
      }, tx)

    } else {
      // ── UPDATE: close current primary row, insert new effective-dated row ─────
      const closeDate = addDays(data.effectiveFrom, -1)
      await tx
        .update(personBankDetails)
        .set({
          effectiveTo: closeDate, isPrimary: false,
          updatedBy: user.id, updatedByName: user.name,
          updatedDate: new Date(), lastUpdatedDate: new Date(),
        })
        .where(and(
          eq(personBankDetails.tenantId, TENANT_ID),
          eq(personBankDetails.personId, data.personId),
          eq(personBankDetails.isPrimary, true),
        ))

      const [row] = await tx
        .insert(personBankDetails)
        .values({
          tenantId: TENANT_ID, personId: data.personId,
          bankName: data.bankName, bankCode: data.bankCode,
          iban: ibanCiphertext, accountName: data.accountName,
          accountType: data.accountType, currency: data.currency,
          isPrimary: true, isWpsAccount: data.isWpsAccount,
          effectiveFrom: data.effectiveFrom, effectiveTo: null,
          actionMode: 'UPDATE',
          createdBy: user.id, createdByName: user.name,
        })
        .returning({ id: personBankDetails.id })
      resultId = row.id

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: person.legalEntityId,
        channel: 'WEB', eventType: 'BANK_DETAILS.CREATED',
        resourceType: 'person_bank_details', resourceId: resultId,
        entityId: person.legalEntityId, actionMode: 'UPDATE',
        newValues: { personId: data.personId, bankName: data.bankName, bankCode: data.bankCode,
                     ibanMasked: maskTail(data.iban, 4), isWpsAccount: data.isWpsAccount,
                     effectiveFrom: data.effectiveFrom },
      }, tx)
    }
  })

  return { id: resultId }
  } catch (e) { translateError(e, 'createBankDetails') }
}

/**
 * Returns the active bank record for a person with the IBAN either
 * decrypted (PAYROLL_ADMIN, HR_DIRECTOR, SUPER_ADMIN) or masked. HR_ADMIN
 * sees the masked form by default — matches Security spec §2.3.
 */
export async function getBankDetails(personId: string): Promise<{
  id:           string | null
  bankName:     string | null
  bankCode:     string | null
  iban:         string | null
  ibanMasked:   boolean
  accountName:  string | null
  isWpsAccount: boolean
} | null> {
  try {
  const user = await requireRole([
    'HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'EMPLOYEE',
  ])

  const [row] = await db
    .select()
    .from(personBankDetails)
    .where(and(
      eq(personBankDetails.tenantId, TENANT_ID),
      eq(personBankDetails.personId, personId),
      eq(personBankDetails.isPrimary, true),
    ))
    .limit(1)
  if (!row) return null

  // QA-Audit-C2 — entity scope: caller must share the person's legal entity.
  const [person] = await db
    .select({ legalEntityId: persons.legalEntityId })
    .from(persons).where(eq(persons.id, personId)).limit(1)
  if (!person) return null
  const isSelf = user.personId === personId
  if (
    user.role !== 'SUPER_ADMIN'
    && !isSelf
    && user.legalEntityId !== person.legalEntityId
  ) {
    throw new Error('FORBIDDEN: cross-entity bank-details read denied')
  }
  // EMPLOYEE may only read their own — same gate as getPerson.
  if (user.role === 'EMPLOYEE' && !isSelf) {
    throw new Error('FORBIDDEN: employees may only read their own bank details')
  }

  // PII reveal: PAYROLL_ADMIN, HR_DIRECTOR, SUPER_ADMIN, or self.
  const fullPii = ['PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(user.role)
                || isSelf
  const plaintextIban = decryptNullable(row.iban)

  if (fullPii) {
    try {
      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: person.legalEntityId,
        channel:       'WEB',
        eventType:     'BANK_DETAILS.IBAN_VIEWED',
        resourceType:  'person_bank_details',
        resourceId:    row.id,
        metadata:      { unmasked: true },
      })
    } catch (err) {
      console.error('[bank-details] audit failed:', err)
    }
  }

  return {
    id:           row.id,
    bankName:     row.bankName,
    bankCode:     row.bankCode,
    iban:         fullPii ? plaintextIban : maskTail(plaintextIban, 4),
    ibanMasked:   !fullPii,
    accountName:  row.accountName,
    isWpsAccount: row.isWpsAccount,
  }
  } catch (e) { translateError(e, 'getBankDetails') }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bank-details/self-service-actions.ts
LINES: 325
================================================================================
'use server'

/**
 * BQ-4 — Employee self-service bank details update.
 *
 * Business rule (BQ-4):
 *   • If no Salary Transfer Letter (STL) was issued in the last 30 days →
 *     employee may update their IBAN directly (immediate effect).
 *   • If an STL was issued within the last 30 days →
 *     the change is held pending HR Admin approval (BANK_CHANGE_APPROVAL workflow).
 *
 * Hard Rule 4: IBAN always encrypted before persisting.
 * Hard Rule 1: every DB write + audit in same transaction.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  personBankDetails, persons, employeeLetters, notificationLog, userAccounts,
} from '@/drizzle/schema'
import {
  workflowDefinitionsV2, workflowStepsV2, workflowInstancesV2,
  workflowStepInstances,
  type ResolvedApprover, type HierarchySnapshot, type ContextSnapshot,
} from '@/drizzle/schema/workflow-engine'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/encryption'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { addDays } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import { assertUaeIbanFormat, maskTail } from '../services'
import { randomUUID } from 'crypto'
import { asc } from 'drizzle-orm'

const BANK_CHANGE_WF_CODE = 'BANK_DETAILS_CHANGE_APPROVAL'

// ── Input schema ──────────────────────────────────────────────────────────────

const SelfServiceBankDetailsSchema = z.object({
  bankName:     z.string().min(1).max(200),
  bankCode:     z.string().min(1).max(20),
  iban:         z.string().regex(/^AE\d{21}$/, 'BR-WPS-004: UAE IBAN required (AE + 21 digits)'),
  accountName:  z.string().min(1).max(200),
  accountType:  z.enum(['CURRENT', 'SAVINGS', 'SALARY']).default('CURRENT'),
  isWpsAccount: z.boolean().default(true),
})

type SelfServiceBankDetailsInput = z.infer<typeof SelfServiceBankDetailsSchema>

export type SelfServiceBankDetailsResult =
  | { outcome: 'UPDATED'; bankDetailsId: string }
  | { outcome: 'PENDING_APPROVAL'; workflowInstanceId: string }

/**
 * Employee-initiated bank details update.
 * Caller must be the employee whose record is being changed (self-only).
 */
export async function selfServiceUpdateBankDetails(
  input: SelfServiceBankDetailsInput,
): Promise<SelfServiceBankDetailsResult> {
  try {
    const user = await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    if (!user.personId) throw new Error('NO_PERSON_RECORD: link your user account to an employee record first.')

    const data = SelfServiceBankDetailsSchema.parse(input)
    assertUaeIbanFormat(data.iban)

    const personId = user.personId
    const today    = new Date().toISOString().slice(0, 10)
    const thirtyDaysAgo = addDays(today, -30)

    return await db.transaction(async tx => {
      // Person + entity scope
      const [person] = await tx
        .select({ id: persons.id, legalEntityId: persons.legalEntityId, fullNameEn: persons.fullNameEn })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
        .limit(1)
      if (!person) throw new Error('person not found')

      // BQ-4 — check for any STL issued in the last 30 days.
      // typeCode 'STL' = Salary Transfer Letter. Active statuses only.
      const [recentStl] = await tx
        .select({ id: employeeLetters.id, letterNumber: employeeLetters.letterNumber })
        .from(employeeLetters)
        .where(and(
          eq(employeeLetters.tenantId, TENANT_ID),
          eq(employeeLetters.personId, personId),
          eq(employeeLetters.typeCode, 'STL'),
          inArray(employeeLetters.status, ['APPROVED', 'SIGNED', 'SENT']),
          gte(employeeLetters.createdDate, new Date(thirtyDaysAgo + 'T00:00:00Z')),
        ))
        .limit(1)

      if (recentStl) {
        // ── Path B: STL exists → create workflow approval request ─────────────
        const workflowInstanceId = await createBankChangeWorkflow(
          tx, actor(user), person, data, recentStl.letterNumber,
        )
        return { outcome: 'PENDING_APPROVAL', workflowInstanceId }
      }

      // ── Path A: No recent STL → update immediately ─────────────────────────
      const closeDate    = addDays(today, -1)
      const ibanCiphertext = encrypt(data.iban)

      // Close existing primary record (effective-date pattern, Hard Rule 3).
      await tx
        .update(personBankDetails)
        .set({
          effectiveTo: closeDate, isPrimary: false,
          updatedBy: user.id, updatedByName: user.name,
          updatedDate: new Date(), lastUpdatedDate: new Date(),
        })
        .where(and(
          eq(personBankDetails.tenantId, TENANT_ID),
          eq(personBankDetails.personId, personId),
          eq(personBankDetails.isPrimary, true),
        ))

      const [row] = await tx
        .insert(personBankDetails)
        .values({
          tenantId:      TENANT_ID,
          personId,
          bankName:      data.bankName,
          bankCode:      data.bankCode,
          iban:          ibanCiphertext,
          accountName:   data.accountName,
          accountType:   data.accountType,
          currency:      'AED',
          isPrimary:     true,
          isWpsAccount:  data.isWpsAccount,
          effectiveFrom: today,
          effectiveTo:   null,
          actionMode:    'UPDATE',
          createdBy:     user.id,
          createdByName: user.name,
        })
        .returning({ id: personBankDetails.id })

      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: person.legalEntityId,
        channel: 'WEB',
        eventType: 'BANK_DETAILS.SELF_SERVICE_UPDATED',
        resourceType: 'person_bank_details',
        resourceId: row.id,
        entityId: person.legalEntityId,
        newValues: {
          personId, bankName: data.bankName, bankCode: data.bankCode,
          ibanMasked: maskTail(data.iban, 4), isWpsAccount: data.isWpsAccount,
          triggeredByStl: false,
        },
      }, tx)

      return { outcome: 'UPDATED', bankDetailsId: row.id }
    })
  } catch (e) { translateError(e, 'selfServiceUpdateBankDetails') }
}

// ── Internal helper ───────────────────────────────────────────────────────────

function actor(user: { id: string; name: string; role: string }) {
  return { id: user.id, name: user.name }
}

async function createBankChangeWorkflow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actorRef: { id: string; name: string },
  person: { id: string; legalEntityId: string; fullNameEn: string | null },
  data: SelfServiceBankDetailsInput,
  stlLetterNumber: string,
): Promise<string> {
  // Upsert workflow definition (self-seeding)
  const [existingDef] = await tx
    .select({ id: workflowDefinitionsV2.id })
    .from(workflowDefinitionsV2)
    .where(and(
      eq(workflowDefinitionsV2.tenantId, TENANT_ID),
      eq(workflowDefinitionsV2.workflowCode, BANK_CHANGE_WF_CODE),
    ))
    .limit(1)

  let defId   = ''
  let step1Id = ''

  if (existingDef) {
    defId = existingDef.id
    const [s1] = await tx
      .select({ id: workflowStepsV2.id })
      .from(workflowStepsV2)
      .where(and(
        eq(workflowStepsV2.tenantId, TENANT_ID),
        eq(workflowStepsV2.workflowDefinitionId, defId),
        eq(workflowStepsV2.stepOrder, 1),
      ))
      .limit(1)
    step1Id = s1?.id ?? ''
  } else {
    const [created] = await tx
      .insert(workflowDefinitionsV2)
      .values({
        tenantId: TENANT_ID, workflowCode: BANK_CHANGE_WF_CODE,
        workflowNameEn: 'Bank Details Change Approval',
        workflowNameAr: 'موافقة تغيير البيانات البنكية',
        triggerEvent: 'BANK_DETAILS_CHANGE',
        defaultHierarchyType: 'CUSTOM_GROUP',
        defaultSlaHours: 48, defaultEscalationHours: 72,
        isActive: true, version: 1,
        createdBy: actorRef.id, createdByName: actorRef.name,
      })
      .returning({ id: workflowDefinitionsV2.id })
    defId = created.id

    const [s1] = await tx
      .insert(workflowStepsV2)
      .values({
        tenantId: TENANT_ID, workflowDefinitionId: defId,
        stepOrder: 1, stepCode: 'HR_ADMIN_APPROVAL',
        stepNameEn: 'HR Admin Approval', stepNameAr: 'موافقة مدير الموارد البشرية',
        hierarchyType: 'CUSTOM_GROUP', hierarchyRole: 'HR_ADMIN',
        hierarchyLevel: 1, slaHours: 48, onSlaBreach: 'ESCALATE',
        canDelegate: true, isOptional: false,
        createdBy: actorRef.id, createdByName: actorRef.name,
      })
      .returning({ id: workflowStepsV2.id })
    step1Id = s1.id
  }

  // Resolve HR Admin approver
  const [hrRow] = await tx
    .select({ personId: userAccounts.personId })
    .from(userAccounts)
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      inArray(userAccounts.avaniisRole, ['HR_ADMIN', 'HR_DIRECTOR']),
      eq(userAccounts.isActive, true),
    ))
    .orderBy(asc(userAccounts.avaniisRole)) // HR_ADMIN before HR_DIRECTOR
    .limit(1)

  const hrPersonId = hrRow?.personId ?? null

  const now = new Date()
  const slaDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const resolvedApprovers: ResolvedApprover[] = []
  if (hrPersonId) {
    resolvedApprovers.push({
      personId: hrPersonId, personName: '',
      stepOrder: 1, stepCode: 'HR_ADMIN_APPROVAL',
      hierarchyType: 'CUSTOM_GROUP', resolvedAt: now.toISOString(),
    })
  }

  const hierarchySnapshot: HierarchySnapshot = {
    encryptedAt: now.toISOString(), resolvedSteps: resolvedApprovers, resolvedBy: 'avaniis-workflow-engine-v2',
  }
  const contextSnapshot: ContextSnapshot = {
    encryptedAt: now.toISOString(),
    resourceType: 'person_bank_details',
    resourceId: person.id,
    fields: {
      personId: person.id,
      bankName: data.bankName, bankCode: data.bankCode,
      ibanMasked: maskTail(data.iban, 4),
      stlLetterNumber,
      reason: `Employee self-service IBAN change blocked by STL ${stlLetterNumber} (issued within 30 days)`,
    },
  }

  const instanceId = randomUUID()
  await tx.insert(workflowInstancesV2).values({
    id: instanceId, tenantId: TENANT_ID, workflowDefinitionId: defId,
    legalEntityId: person.legalEntityId,
    resourceType: 'person_bank_details', resourceId: person.id,
    initiatedByPersonId: person.id,
    status: 'IN_PROGRESS', currentStepOrder: 1,
    hierarchySnapshot: hierarchySnapshot as never,
    contextSnapshot: contextSnapshot as never,
    resolvedSteps: resolvedApprovers as never,
    slaDeadline, startedAt: now,
    createdBy: actorRef.id, createdByName: actorRef.name, createdDate: now,
  })

  if (step1Id && hrPersonId) {
    await tx.insert(workflowStepInstances).values({
      id: randomUUID(), tenantId: TENANT_ID, instanceId,
      stepId: step1Id, stepOrder: 1, status: 'PENDING',
      assignedToPersonId: hrPersonId, slaDeadline,
      createdBy: actorRef.id, createdByName: actorRef.name, createdDate: now,
    })
  }

  if (hrPersonId) {
    await tx.insert(notificationLog).values([{
      tenantId: TENANT_ID, legalEntityId: person.legalEntityId,
      recipientPersonId: hrPersonId,
      notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP',
      subjectEn: `Bank details change requires approval — ${person.fullNameEn}`,
      bodyEn: `${person.fullNameEn} has requested a change to their bank account (${data.bankName} · ${maskTail(data.iban, 4)}). ` +
              `A Salary Transfer Letter (${stlLetterNumber}) was issued within the last 30 days, so your approval is required before this change takes effect.`,
      referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId,
      status: 'PENDING', createdBy: actorRef.id, createdByName: actorRef.name,
    }])
  }

  await writeAuditLog({
    actorId: actorRef.id, actorName: actorRef.name, actorRole: 'EMPLOYEE',
    actorEntityId: person.legalEntityId,
    channel: 'WEB',
    eventType: 'BANK_DETAILS.SELF_SERVICE_CHANGE_PENDING',
    resourceType: 'workflow_instances_v2',
    resourceId: instanceId,
    entityId: person.legalEntityId,
    newValues: {
      personId: person.id, bankName: data.bankName,
      ibanMasked: maskTail(data.iban, 4), stlLetterNumber, instanceId,
    },
  }, tx)

  return instanceId
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bank-details/validations.ts
LINES: 15
================================================================================
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

export const CreateBankDetailsSchema = z.object({
  personId:      z.string().uuid(),
  bankName:      z.string().min(1).max(200),
  bankCode:      z.string().min(1).max(20),
  iban:          z.string().regex(/^AE\d{21}$/, 'BR-WPS-004: UAE IBAN required'),
  accountName:   z.string().min(1).max(200),
  accountType:   z.enum(['CURRENT', 'SAVINGS', 'SALARY']).default('CURRENT'),
  currency:      z.string().length(3).default('AED'),
  isWpsAccount:  z.boolean().default(true),
  effectiveFrom: hrDateString(),
})
export type CreateBankDetailsInput = z.infer<typeof CreateBankDetailsSchema>


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bulk-import/actions.ts
LINES: 217
================================================================================
'use server'

/**
 * Bulk Employee Import — Server Actions.
 *
 * Pattern: auth → Zod validate → business rules → tx + audit → revalidatePath
 *
 * Two public actions:
 *   validateImportFile  — parse + validate xlsx, return ImportPreview (NO writes)
 *   confirmImport       — insert all valid rows atomically (Hard Rule 1)
 *
 * Template reference data is served via the API route:
 *   GET /api/persons/import/template
 */
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  legalEntities, departments, positions, grades, locations,
} from '@/drizzle/schema'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { translateError } from '@/lib/app-error'
import { parseSheet, validateImportRows } from './row-validator'
import { importEmployeesTx } from './import-engine'
import type { ImportPreview, ImportResult, ValidatedImportRow } from './types'

// ── Allowed roles ─────────────────────────────────────────────────────────
const IMPORT_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const

// ── File size / row limits ────────────────────────────────────────────────
const MAX_BYTES = 5 * 1024 * 1024  // 5 MB
const MAX_ROWS  = 1_000

// ── Magic bytes signatures ────────────────────────────────────────────────
// Reject files whose binary header doesn't match the declared extension.
// Prevents a malicious file renamed to .xlsx from being parsed by xlsx.
// XLSX (OOXML) = ZIP container: 50 4B 03 04
// XLS  (BIFF8) = OLE2 compound doc: D0 CF 11 E0
function hasValidMagicBytes(bytes: Uint8Array, ext: 'xlsx' | 'xls'): boolean {
  if (ext === 'xlsx') {
    return bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04
  }
  return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0
}

// ══════════════════════════════════════════════════════════════════════════
// 1 — validateImportFile
//     Accepts a FormData with a 'file' field (xlsx), parses and validates
//     every row, returns a preview. Makes NO DB writes.
// ══════════════════════════════════════════════════════════════════════════

export async function validateImportFile(
  formData: FormData,
): Promise<ImportPreview> {
  try {
    // 1. Auth
    await requireRole([...IMPORT_ROLES])

    // 2. Extract file
    const file = formData.get('file')
    if (!(file instanceof File)) throw new Error('No file provided')
    if (file.size > MAX_BYTES)  throw new Error(`File exceeds ${MAX_BYTES / 1024 / 1024} MB limit`)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') throw new Error('Only .xlsx or .xls files are accepted')

    // 3. Parse xlsx
    const arrayBuffer = await file.arrayBuffer()

    // Magic bytes check — must come before XLSX.read() to block malicious files
    // that have been renamed with an .xlsx/.xls extension.
    if (!hasValidMagicBytes(new Uint8Array(arrayBuffer.slice(0, 4)), ext as 'xlsx' | 'xls')) {
      throw new Error('File content does not match the declared file type')
    }
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false })
    const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'employees') ?? wb.SheetNames[0]
    if (!sheetName) throw new Error('No sheet found in the uploaded file')
    const ws = wb.Sheets[sheetName]

    // 4. Parse rows
    const rawRows = parseSheet(ws)
    if (rawRows.length === 0) {
      return {
        totalRows: 0, validRows: 0, errorRows: 0,
        warningRows: 0, duplicateRows: 0,
        rowsRequiringUser: 0, rowsWithoutUser: 0,
        issues: [], validatedRows: [],
      }
    }
    if (rawRows.length > MAX_ROWS) {
      throw new Error(`File contains ${rawRows.length} data rows. Maximum allowed is ${MAX_ROWS} per upload.`)
    }

    // 5. Validate all rows (DB lookups, business rules)
    return await validateImportRows(rawRows)
  } catch (e) {
    translateError(e, 'validateImportFile')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 2 — confirmImport
//     Receives the pre-validated rows from the UI (already returned by
//     validateImportFile). Re-validates auth and checks that there are no
//     blocking errors before calling the import engine.
//
//     All-or-nothing: if any row throws inside the transaction, the whole
//     batch rolls back and no rows are committed.
// ══════════════════════════════════════════════════════════════════════════

export async function confirmImport(
  validatedRows: ValidatedImportRow[],
): Promise<ImportResult | { error: string }> {
  try {
    // 1. Auth
    const user = await requireRole([...IMPORT_ROLES])

    // 2. Basic sanity checks
    if (!Array.isArray(validatedRows) || validatedRows.length === 0) {
      throw new Error('No valid rows to import')
    }
    if (validatedRows.length > MAX_ROWS) {
      throw new Error(`Batch size ${validatedRows.length} exceeds maximum ${MAX_ROWS}`)
    }

    // 3. Run all-or-nothing import
    const result = await importEmployeesTx(
      {
        id:            user.id,
        name:          user.name,
        role:          user.role,
        personId:      user.personId,
        legalEntityId: user.legalEntityId,
      },
      validatedRows,
    )

    // 4. Revalidate persons list
    revalidatePath('/persons')

    return result
  } catch (e) {
    console.error('[confirmImport]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 3 — getTemplateRefData
//     Called server-side by the template API route and the page to load
//     reference data for the Excel template sheets.
// ══════════════════════════════════════════════════════════════════════════

export async function getTemplateRefData() {
  try {
    await requireRole([...IMPORT_ROLES])

    const [entityRows, deptRows, posRows, gradeRows, locRows] = await Promise.all([
      db.select({ code: legalEntities.entityCode, nameEn: legalEntities.nameEn })
        .from(legalEntities)
        .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
        .orderBy(asc(legalEntities.nameEn)),

      db.select({ code: departments.code, nameEn: departments.nameEn, entityId: departments.legalEntityId })
        .from(departments)
        .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)))
        .orderBy(asc(departments.nameEn)),

      db.select({
        code: positions.positionCode,
        titleEn: positions.positionTitleEn,
        entityId: positions.legalEntityId,
      })
        .from(positions)
        .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true)))
        .orderBy(asc(positions.positionTitleEn)),

      db.select({ code: grades.gradeCode, nameEn: grades.gradeNameEn })
        .from(grades)
        .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
        .orderBy(asc(grades.gradeCode)),

      db.select({ code: locations.code, nameEn: locations.nameEn })
        .from(locations)
        .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true)))
        .orderBy(asc(locations.nameEn)),
    ])

    // Resolve entityCode for departments + positions
    const entityCodeById = new Map(entityRows.map(e => [e.code, e.code]))
    const entityIdToCode = new Map<string, string>()
    const allEntities = await db
      .select({ id: legalEntities.id, code: legalEntities.entityCode })
      .from(legalEntities)
      .where(eq(legalEntities.tenantId, TENANT_ID))
    allEntities.forEach(e => entityIdToCode.set(e.id, e.code))

    return {
      legalEntities: entityRows,
      departments:   deptRows.map(d => ({
        code:       d.code ?? '',
        nameEn:     d.nameEn,
        entityCode: d.entityId ? (entityIdToCode.get(d.entityId) ?? '') : '',
      })),
      positions: posRows.map(p => ({
        code:       p.code ?? '',
        titleEn:    p.titleEn,
        entityCode: p.entityId ? (entityIdToCode.get(p.entityId) ?? '') : '',
      })),
      grades:    gradeRows.map(g => ({ code: g.code ?? '', nameEn: g.nameEn ?? '' })),
      locations: locRows.map(l => ({ code: l.code ?? '', nameEn: l.nameEn ?? '' })),
    }
  } catch (e) {
    translateError(e, 'getTemplateRefData')
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bulk-import/import-engine.ts
LINES: 390
================================================================================
/**
 * Bulk import engine — transaction-aware helpers.
 *
 * All rows must be pre-validated by row-validator.ts before calling
 * importEmployeesTx. This function owns one single db.transaction that
 * wraps every person, assignment, contract, contact, and user_account
 * insert. If any row fails, the whole batch rolls back (all-or-nothing).
 *
 * Caller is responsible for auth + Zod validation (done in actions.ts).
 */
import { and, eq, sql } from 'drizzle-orm'
import {
  persons, workerAssignments, contracts, personContacts, userAccounts,
  legalEntities,
} from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { encryptNullable } from '@/lib/encryption'
import { TENANT_ID } from '@/lib/constants'
import { nextPersonNumber } from '@/modules/core-hr/services'
import { normalizeEmiratesId } from '@/modules/core-hr/validations'
import { EFFECTIVE_END_OF_TIME } from '@/lib/effective-date'
import type { ValidatedImportRow, ImportResult, ImportRowResult } from './types'

// Tx shape required by this engine (query is required by nextPersonNumber)
type Tx = {
  select: typeof db.select
  insert: typeof db.insert
  update: typeof db.update
  query:  typeof db.query
}

interface ActorContext {
  id:            string
  name:          string
  role:          string
  personId?:     string
  legalEntityId: string
}

// ── Next contract number ──────────────────────────────────────────────────

async function nextContractNumberTx(
  tx: Pick<Tx, 'select'>,
  legalEntityId: string,
): Promise<string> {
  const result = await tx
    .select({ n: sql<number>`COALESCE(COUNT(*), 0)` })
    .from(contracts)
    .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.legalEntityId, legalEntityId)))
  return `CTR-${String((result[0]?.n ?? 0) + 1).padStart(7, '0')}`
}

// ── Next assignment number ────────────────────────────────────────────────

async function nextAssignmentNumberTx(
  tx: Pick<Tx, 'select'>,
  legalEntityId: string,
): Promise<string> {
  const result = await tx
    .select({ n: sql<number>`COALESCE(COUNT(*), 0)` })
    .from(workerAssignments)
    .where(and(eq(workerAssignments.tenantId, TENANT_ID), eq(workerAssignments.legalEntityId, legalEntityId)))
  return `WA-${String((result[0]?.n ?? 0) + 1).padStart(7, '0')}`
}

// ── Import a single validated row inside an existing transaction ──────────

async function importOneRowTx(
  tx:     Tx,
  actor:  ActorContext,
  row:    ValidatedImportRow,
  rowSeq: number,  // sequence within this batch for number generation
): Promise<ImportRowResult> {
  // ── Person number ──────────────────────────────────────────────────────
  // Use provided employee number or auto-generate via legal entity sequence.
  const personNumber = row.personNumber
    ? row.personNumber
    : await nextPersonNumber(row.refs.legalEntityId, tx)

  // ── Encrypt PII fields (Hard Rule 4) ──────────────────────────────────
  const encEmiratesId = row.emiratesId
    ? encryptNullable(normalizeEmiratesId(row.emiratesId))
    : null
  const encPassport = encryptNullable(row.passportNumber)

  // ── Determine actor ID to use for FK fields ────────────────────────────
  // actionInitiatedBy requires a persons.id; use actor.personId when available.
  // For demo accounts, fall back to a system person if one exists, or a placeholder.
  const actorPersonId = actor.personId

  // ── Insert persons ─────────────────────────────────────────────────────
  const [newPerson] = await tx
    .insert(persons)
    .values({
      tenantId:        TENANT_ID,
      personNumber,
      legalEntityId:   row.refs.legalEntityId,
      // Identity
      firstNameEn:     row.firstNameEn,
      middleNameEn:    row.middleNameEn ?? undefined,
      lastNameEn:      row.lastNameEn,
      fullNameEn:      row.fullNameEn,
      fullNameAr:      row.fullNameAr,
      dateOfBirth:     row.dateOfBirth,
      gender:          row.gender,
      maritalStatus:   row.maritalStatus ?? undefined,
      // Nationality
      nationalityCode:     row.nationalityCode,
      nationalityCategory: row.nationalityCategory,
      // PII (encrypted)
      emiratesId:      encEmiratesId ?? undefined,
      passportNumber:  encPassport ?? undefined,
      visaNumber:      row.visaNumber ?? undefined,
      labourCardNumber: row.labourCardNumber ?? undefined,
      // Employment
      employmentType:  row.employmentType,
      hireDate:        row.hireDate,
      probationEndDate: row.probationEndDate ?? undefined,
      assignmentStatus: 'ACTIVE',
      // Current assignment pointers
      currentDepartmentId: row.refs.departmentId,
      currentPositionId:   row.refs.positionId,
      currentGradeId:      row.refs.gradeId,
      currentLocationId:   row.refs.locationId ?? undefined,
      lineManagerId:       row.refs.lineManagerId ?? undefined,
      // Salary
      basicSalary:  row.basicSalary ?? undefined,
      totalPackage: row.totalPackage ?? undefined,
      // Insurance
      insurancePlanId: row.refs.insurancePlanId ?? undefined,
      // PDPL consent — bulk import = employment contract legal basis (UAE PDPL Art. 11)
      pdplConsentGiven: true,
      pdplConsentDate:  new Date(),
      // System linkage
      isSystemUser: row.requiresUser,
      isActive:     true,
      // Audit
      createdBy:     actor.id,
      createdByName: actor.name,
    })
    .returning({ id: persons.id })

  const personId = newPerson.id

  // ── Insert worker_assignment ───────────────────────────────────────────
  const assignmentNumber = await nextAssignmentNumberTx(tx, row.refs.legalEntityId)
  const [newAssignment] = await tx
    .insert(workerAssignments)
    .values({
      tenantId:           TENANT_ID,
      personId,
      legalEntityId:      row.refs.legalEntityId,
      assignmentNumber,
      effectiveStartDate: row.hireDate,
      effectiveEndDate:   EFFECTIVE_END_OF_TIME,
      assignmentStatus:   'ACTIVE',
      positionId:         row.refs.positionId,
      departmentId:       row.refs.departmentId,
      locationId:         row.refs.locationId ?? undefined,
      gradeId:            row.refs.gradeId,
      lineManagerId:      row.refs.lineManagerId ?? undefined,
      employmentType:     row.employmentType,
      contractedHoursPerWeek: '48.00',
      actionType:         'HIRE',
      actionReason:       'Bulk import',
      // actionInitiatedBy is NOT NULL references persons.id
      actionInitiatedBy:  actorPersonId ?? personId,
      actionApprovedBy:   actorPersonId ?? personId,
      actionApprovalDate: row.hireDate,
      isCurrent:          true,
      isActing:           false,
      createdBy:          actor.id,
      createdByName:      actor.name,
    })
    .returning({ id: workerAssignments.id })

  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: row.refs.legalEntityId,
    channel:       'BATCH',
    eventType:     'WORKER_ASSIGNMENT.CREATED',
    resourceType:  'worker_assignments',
    resourceId:    newAssignment.id,
    entityId:      row.refs.legalEntityId,
    description:   `Bulk import: assignment created for ${row.fullNameEn}`,
  }, tx)

  // ── Insert contract (if contract fields present) ───────────────────────
  const hasContractData = row.contractEndDate || row.contractStartDate
  if (hasContractData) {
    const contractNumber = await nextContractNumberTx(tx, row.refs.legalEntityId)
    const startDate = row.contractStartDate ?? row.hireDate
    const endDate   = row.contractEndDate   ?? (() => {
      // Default end = start + 1 year for FIXED_TERM
      const d = new Date(startDate)
      d.setFullYear(d.getFullYear() + 1)
      return d.toISOString().slice(0, 10)
    })()

    await tx.insert(contracts).values({
      tenantId:            TENANT_ID,
      personId,
      legalEntityId:       row.refs.legalEntityId,
      contractNumber,
      contractType:        row.contractType ?? 'FIXED_TERM',
      employmentType:      row.employmentType,
      startDate,
      endDate,
      probationStart:      row.hireDate,
      probationEnd:        row.probationEndDate ?? undefined,
      noticePeriodDays:    30,
      workingHoursPerWeek: '48.00',
      status:              'ACTIVE',
      extraData:           {},
      createdBy:           actor.id,
      createdByName:       actor.name,
    })

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: row.refs.legalEntityId,
      channel:       'BATCH',
      eventType:     'CONTRACT.CREATED',
      resourceType:  'contracts',
      entityId:      row.refs.legalEntityId,
      description:   `Bulk import: contract ${contractNumber} for ${row.fullNameEn}`,
    }, tx)
  }

  // ── Insert person_contacts ─────────────────────────────────────────────
  const contactsToInsert: Array<{
    contactType: string
    contactValue: string
    isPrimary: boolean
  }> = []

  if (row.workEmail)    contactsToInsert.push({ contactType: 'WORK_EMAIL',    contactValue: row.workEmail,    isPrimary: true })
  if (row.personalEmail) contactsToInsert.push({ contactType: 'PERSONAL_EMAIL', contactValue: row.personalEmail, isPrimary: false })
  if (row.mobile)       contactsToInsert.push({ contactType: 'MOBILE_PRIMARY', contactValue: row.mobile,      isPrimary: true })

  for (const contact of contactsToInsert) {
    await tx.insert(personContacts).values({
      tenantId:     TENANT_ID,
      personId,
      contactType:  contact.contactType,
      contactValue: contact.contactValue,
      isPrimary:    contact.isPrimary,
      isVerified:   false,
      isActive:     true,
      createdBy:    actor.id,
      createdByName: actor.name,
    })
  }

  if (contactsToInsert.length > 0) {
    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: row.refs.legalEntityId,
      channel:       'BATCH',
      eventType:     'PERSON.CONTACTS.CREATED',
      resourceType:  'person_contacts',
      resourceId:    personId,
      entityId:      row.refs.legalEntityId,
      description:   `Bulk import: ${contactsToInsert.length} contact(s) for ${row.fullNameEn}`,
    }, tx)
  }

  // ── Insert user_account (if requiresUser = true) ───────────────────────
  let userCreated = false
  if (row.requiresUser && row.workEmail) {
    // Look up entity's primaryEntityId
    const [entityRow] = await tx
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.id, row.refs.legalEntityId))
      .limit(1)

    const [newAccount] = await tx
      .insert(userAccounts)
      .values({
        tenantId:           TENANT_ID,
        personId,
        // Entra ID integration — msAdObjectId left null (pending SSO link)
        msAdObjectId:       null,
        msUpn:              row.workEmail,
        // Local app record — no Oracle IDCS link needed
        primaryEmail:       row.workEmail,
        primarySsoProvider: 'MICROSOFT_AD',
        avaniisRole:        'EMPLOYEE',
        allowedEntityIds:   [row.refs.legalEntityId],
        primaryEntityId:    entityRow?.id ?? row.refs.legalEntityId,
        isActive:           true,
        mfaEnrolled:        false,
        loginCount:         0,
        failedLoginCount:   0,
        activeRefreshTokens: 0,
        preferences:        {},
        createdBy:          actor.id,
        createdByName:      actor.name,
      })
      .returning({ id: userAccounts.id })

    // Link persons.user_account_id
    await tx
      .update(persons)
      .set({ userAccountId: newAccount.id, updatedBy: actor.id, updatedByName: actor.name, updatedDate: new Date() })
      .where(eq(persons.id, personId))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: row.refs.legalEntityId,
      channel:       'BATCH',
      eventType:     'USER_ACCOUNT.CREATED',
      resourceType:  'user_accounts',
      resourceId:    newAccount.id,
      entityId:      row.refs.legalEntityId,
      newValues:     { primaryEmail: row.workEmail, avaniisRole: 'EMPLOYEE', primarySsoProvider: 'MICROSOFT_AD' },
      description:   `Bulk import: user account created for ${row.fullNameEn} (${row.workEmail})`,
    }, tx)

    userCreated = true
  }

  // ── Audit the person creation itself ──────────────────────────────────
  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: row.refs.legalEntityId,
    channel:       'BATCH',
    eventType:     'PERSON.CREATED',
    resourceType:  'persons',
    resourceId:    personId,
    entityId:      row.refs.legalEntityId,
    newValues:     {
      personNumber, fullNameEn: row.fullNameEn,
      employmentType: row.employmentType, hireDate: row.hireDate,
    },
    description:   `Bulk import: employee ${personNumber} — ${row.fullNameEn}`,
  }, tx)

  return { rowNumber: row.rowNumber, personNumber, personId, fullNameEn: row.fullNameEn, userCreated }
}

// ── Public: import all validated rows in one atomic transaction ───────────

export async function importEmployeesTx(
  actor:         ActorContext,
  validatedRows: ValidatedImportRow[],
): Promise<ImportResult> {
  const results: ImportRowResult[] = []

  // Validate actor.personId against persons table once before the loop.
  // Dev credentials carry a placeholder UUID that does not exist in persons,
  // which would violate the action_initiated_by FK on worker_assignments.
  // If the personId is not a real person, clear it so each row falls back
  // to using its own newly inserted personId.
  let resolvedActorPersonId: string | undefined = undefined
  if (actor.personId) {
    const [found] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, actor.personId)))
      .limit(1)
    if (found) resolvedActorPersonId = actor.personId
  }
  const resolvedActor: ActorContext = { ...actor, personId: resolvedActorPersonId }

  await db.transaction(async tx => {
    for (let i = 0; i < validatedRows.length; i++) {
      const result = await importOneRowTx(tx, resolvedActor, validatedRows[i], i)
      results.push(result)
    }
  })

  return {
    imported:     results.length,
    usersCreated: results.filter(r => r.userCreated).length,
    rows:         results,
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bulk-import/index.ts
LINES: 33
================================================================================
/**
 * Bulk Employee Import — public barrel.
 *
 * IMPORTANT: Do NOT export anything that imports lib/db here.
 * row-validator, import-engine, and template all import Node.js-only
 * modules (postgres → net). Exporting them would bundle them into
 * Client Components that import @/modules/core-hr.
 *
 * Safe to export: types, Server Actions ('use server'), EMPLOYEE_HEADERS.
 * Internal only: parseSheet, validateImportRows, importEmployeesTx, buildImportTemplate.
 */
export type {
  RawImportRow,
  ValidatedImportRow,
  ResolvedRefs,
  RowIssue,
  IssueSeverity,
  ImportPreview,
  ImportRowResult,
  ImportResult,
} from './types'

export type { TemplateRefData } from './template'

// EMPLOYEE_HEADERS is a plain const array — safe for client bundles.
export { EMPLOYEE_HEADERS } from './template'

// Server Actions — Next.js isolates these via 'use server'; safe to export.
export {
  validateImportFile,
  confirmImport,
  getTemplateRefData,
} from './actions'


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bulk-import/row-validator.ts
LINES: 573
================================================================================
/**
 * Bulk import row validator.
 *
 * Parses the raw xlsx sheet, resolves reference codes to IDs via DB lookups,
 * and returns a structured ImportPreview (valid rows + all issues).
 *
 * Design: validate ALL rows before returning — callers see the full picture.
 * No DB writes here. All validation is read-only.
 */
import * as XLSX from 'xlsx'
import { and, eq, or, ilike } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  legalEntities, departments, positions, grades, locations,
  persons, personContacts, userAccounts, medicalInsurancePlans,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { normalizeEmiratesId } from '@/modules/core-hr/validations'
import { EMPLOYEE_HEADERS } from './template'
import type {
  RawImportRow, ValidatedImportRow, RowIssue, ImportPreview, ResolvedRefs,
} from './types'

// ── UAE mobile number normalization ──────────────────────────────────────────
// Rules (applied in order after stripping spaces/hyphens/brackets):
//   +971XXXXXXXX  → keep as-is
//   971XXXXXXXX   → prefix +
//   0XXXXXXXXX    → remove leading 0, prefix +971
//   5XXXXXXXX     → prefix +971
//   anything else → return null (invalid)
// Expected result: +971XXXXXXXXX (12 chars, starts with +971 5/6)

export function normalizeUaeMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Strip non-digit characters except leading +
  const cleaned = raw.replace(/[\s\-().]/g, '')
  if (!cleaned) return null

  if (/^\+971\d{8,9}$/.test(cleaned))  return cleaned          // already +971XXXXXXXXX
  if (/^971\d{8,9}$/.test(cleaned))    return '+' + cleaned    // 971 → +971
  if (/^0\d{9}$/.test(cleaned))        return '+971' + cleaned.slice(1)  // 0XX → +971XX
  if (/^[5-9]\d{8}$/.test(cleaned))    return '+971' + cleaned           // 5XXXXXXXX → +9715XXXXXXXX

  return null  // cannot normalize — caller should flag as invalid
}

// ── GCC nationality codes (drives nationalityCategory) ───────────────────
const GCC_CODES = new Set(['SAU', 'KWT', 'BHR', 'QAT', 'OMN'])

function deriveNationalityCategory(code: string): 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT' {
  if (code === 'ARE') return 'UAE_NATIONAL'
  if (GCC_CODES.has(code)) return 'GCC_NATIONAL'
  return 'EXPAT'
}

// ── Valid enum values ─────────────────────────────────────────────────────
const VALID_EMPLOYMENT_TYPES = new Set([
  'FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED',
])
const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'NOT_SPECIFIED'])
const VALID_MARITAL = new Set(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'NOT_SPECIFIED'])
// BR-CT-001: DB CHECK constraint allows only FIXED_TERM (migration 0003)
const VALID_CONTRACT_TYPES = new Set(['FIXED_TERM'])
const EMIRATES_ID_REGEX = /^(?:784-\d{4}-\d{7}-\d{1}|784\d{12})$/
const ISO_COUNTRY_REGEX = /^[A-Z]{3}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// ── Formula injection prefix characters ──────────────────────────────────
// =, +, -, @ at the start of a cell trigger formula execution when data is
// re-opened in Excel/Sheets. Strip them as defense-in-depth so that import
// data is safe regardless of the downstream export format.
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]+/

// ── Parse cell value to string ───────────────────────────────────────────
function cellStr(val: unknown): string | undefined {
  if (val == null) return undefined
  const s = String(val).trim().replace(FORMULA_PREFIX_RE, '')
  return s === '' ? undefined : s
}

// ── Parse one header row + data rows from worksheet ──────────────────────
export function parseSheet(ws: XLSX.WorkSheet): RawImportRow[] {
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (aoa.length < 2) return []

  // Find header row (first row matching our expected first column)
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    if (String(aoa[i][0]).trim() === EMPLOYEE_HEADERS[0]) {
      headerIdx = i
      break
    }
  }

  const headerRow = (aoa[headerIdx] as unknown[]).map(c => String(c).trim())

  // Build a map: our canonical header → column index
  const colIdx: Record<string, number> = {}
  EMPLOYEE_HEADERS.forEach(h => {
    const idx = headerRow.indexOf(h)
    if (idx !== -1) colIdx[h] = idx
  })

  const rows: RawImportRow[] = []
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[]
    // Skip fully empty rows
    if (row.every(c => !String(c).trim())) continue

    const g = (h: typeof EMPLOYEE_HEADERS[number]) =>
      colIdx[h] !== undefined ? cellStr(row[colIdx[h]]) : undefined

    rows.push({
      requiresUser:              g('Requires User'),
      employeeNumber:            g('Employee Number'),
      fullNameEn:                g('Full Name EN'),
      fullNameAr:                g('Full Name AR'),
      workEmail:                 g('Work Email'),
      personalEmail:             g('Personal Email'),
      mobile:                    g('Mobile'),
      gender:                    g('Gender'),
      dateOfBirth:               g('Date of Birth'),
      nationalityCode:           g('Nationality Code'),
      maritalStatus:             g('Marital Status'),
      legalEntityCode:           g('Legal Entity Code'),
      departmentCode:            g('Department Code'),
      positionCode:              g('Position Code'),
      gradeCode:                 g('Grade Code'),
      locationCode:              g('Location Code'),
      lineManagerEmployeeNumber: g('Line Manager Employee Number'),
      hireDate:                  g('Hire Date'),
      employmentType:            g('Employment Type'),
      basicSalary:               g('Basic Salary'),
      totalPackage:              g('Total Package'),
      contractType:              g('Contract Type'),
      contractStartDate:         g('Contract Start Date'),
      contractEndDate:           g('Contract End Date'),
      probationEndDate:          g('Probation End Date'),
      passportNumber:            g('Passport Number'),
      emiratesId:                g('Emirates ID'),
      visaNumber:                g('Visa Number'),
      labourCardNumber:          g('Labour Card Number'),
      insurancePlanCode:         g('Insurance Plan Code'),
    })
  }
  return rows
}

// ── Helper: validate ISO date string ────────────────────────────────────
function validateDate(
  value: string | undefined,
  field: string,
  rowNumber: number,
  issues: RowIssue[],
  required: boolean,
): string | null {
  if (!value) {
    if (required) {
      issues.push({ rowNumber, field, message: `${field} is required`, severity: 'ERROR' })
    }
    return null
  }
  // Excel may format dates as numbers — handle serial dates
  if (/^\d+$/.test(value)) {
    try {
      const d = XLSX.SSF.parse_date_code(Number(value))
      const iso = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      return iso
    } catch { /* fall through */ }
  }
  if (!DATE_REGEX.test(value)) {
    issues.push({ rowNumber, field, message: `${field} must be YYYY-MM-DD`, severity: 'ERROR' })
    return null
  }
  const d = new Date(value)
  if (isNaN(d.getTime())) {
    issues.push({ rowNumber, field, message: `${field} is not a valid date`, severity: 'ERROR' })
    return null
  }
  return value
}

// ── Main validation function ──────────────────────────────────────────────

export async function validateImportRows(
  rawRows: RawImportRow[],
): Promise<ImportPreview> {
  const issues: RowIssue[] = []
  const validatedRows: ValidatedImportRow[] = []
  const rowsWithErrors = new Set<number>()
  const rowsWithWarnings = new Set<number>()
  const duplicateRows = new Set<number>()

  if (rawRows.length === 0) {
    return {
      totalRows: 0, validRows: 0, errorRows: 0,
      warningRows: 0, duplicateRows: 0,
      rowsRequiringUser: 0, rowsWithoutUser: 0,
      issues: [], validatedRows: [],
    }
  }

  // ── Pre-load reference data for the entire batch ──────────────────────
  const [
    allEntities, allDepts, allPositions, allGrades, allLocations, allInsurancePlans,
  ] = await Promise.all([
    db.select({ id: legalEntities.id, code: legalEntities.entityCode, isActive: legalEntities.isActive })
      .from(legalEntities).where(eq(legalEntities.tenantId, TENANT_ID)),
    db.select({ id: departments.id, code: departments.code, nameEn: departments.nameEn, entityId: departments.legalEntityId, isActive: departments.isActive })
      .from(departments).where(eq(departments.tenantId, TENANT_ID)),
    db.select({ id: positions.id, code: positions.positionCode, titleEn: positions.positionTitleEn, entityId: positions.legalEntityId, isActive: positions.isActive })
      .from(positions).where(eq(positions.tenantId, TENANT_ID)),
    db.select({ id: grades.id, code: grades.gradeCode, nameEn: grades.gradeNameEn, entityId: grades.legalEntityId, isActive: grades.isActive })
      .from(grades).where(eq(grades.tenantId, TENANT_ID)),
    db.select({ id: locations.id, code: locations.code, nameEn: locations.nameEn, entityId: locations.legalEntityId, isActive: locations.isActive })
      .from(locations).where(eq(locations.tenantId, TENANT_ID)),
    db.select({ id: medicalInsurancePlans.id, code: medicalInsurancePlans.planCode, isActive: medicalInsurancePlans.isActive })
      .from(medicalInsurancePlans).where(eq(medicalInsurancePlans.tenantId, TENANT_ID)),
  ])

  // Index by code (lowercase for case-insensitive lookup)
  const entityByCode   = new Map(allEntities.map(e  => [e.code.toLowerCase(),  e]))
  const deptByCode     = new Map(allDepts.map(d    => [d.code?.toLowerCase() ?? '',    d]))
  const posByCode      = new Map(allPositions.map(p => [p.code?.toLowerCase() ?? '', p]))
  const gradeByCode    = new Map(allGrades.map(g   => [g.code?.toLowerCase() ?? '',   g]))
  const locByCode      = new Map(allLocations.map(l => [l.code?.toLowerCase() ?? '',   l]))
  const planByCode     = new Map(allInsurancePlans.map(p => [p.code?.toLowerCase() ?? '', p]))

  // ── Load existing employee numbers (for uniqueness check) ─────────────
  const existingPersonNumbers = await db
    .select({ personNumber: persons.personNumber })
    .from(persons)
    .where(eq(persons.tenantId, TENANT_ID))
  const existingNumberSet = new Set(existingPersonNumbers.map(p => p.personNumber.toLowerCase()))

  // ── Load existing work emails (user_accounts + person_contacts) ───────
  const [existingUserEmails, existingContactEmails] = await Promise.all([
    db.select({ email: userAccounts.primaryEmail })
      .from(userAccounts).where(eq(userAccounts.tenantId, TENANT_ID)),
    db.select({ value: personContacts.contactValue })
      .from(personContacts)
      .where(and(
        eq(personContacts.tenantId, TENANT_ID),
        eq(personContacts.contactType, 'WORK_EMAIL'),
      )),
  ])
  const existingEmailSet = new Set([
    ...existingUserEmails.map(e => e.email.toLowerCase()),
    ...existingContactEmails.map(e => e.value.toLowerCase()),
  ])

  // ── Load existing manager person numbers ──────────────────────────────
  const existingManagerMap = new Map<string, string>() // personNumber → personId
  const allPersons = await db
    .select({ id: persons.id, personNumber: persons.personNumber })
    .from(persons).where(eq(persons.tenantId, TENANT_ID))
  allPersons.forEach(p => existingManagerMap.set(p.personNumber.toLowerCase(), p.id))

  // ── Track emails and employee numbers seen within this batch ──────────
  const batchEmails    = new Map<string, number>() // email → first rowNumber
  const batchNumbers   = new Map<string, number>() // empNum → first rowNumber

  // ── Validate each row ─────────────────────────────────────────────────
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    const rowNumber = i + 2  // +2: header row is row 1, data starts at row 2
    const rowIssues: RowIssue[] = []

    const addError   = (field: string, message: string) =>
      rowIssues.push({ rowNumber, field, message, severity: 'ERROR' })
    const addWarning = (field: string, message: string) =>
      rowIssues.push({ rowNumber, field, message, severity: 'WARNING' })

    // ── Requires User (default YES) ───────────────────────────────────
    const ruRaw      = (raw.requiresUser ?? '').toUpperCase().trim()
    const requiresUser = ruRaw === 'NO' ? false : true   // blank or YES → true

    // ── Full Name EN (mandatory) ───────────────────────────────────────
    const fullNameEnRaw = (raw.fullNameEn ?? '').trim()
    if (!fullNameEnRaw) {
      addError('Full Name EN', 'Full Name EN is required')
    }

    // Split: last token = lastNameEn, rest = firstNameEn [+ middleNameEn]
    const nameParts   = fullNameEnRaw.split(/\s+/).filter(Boolean)
    const lastNameEn  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullNameEnRaw
    const firstNameEn = nameParts.length > 2
      ? nameParts.slice(0, -2).join(' ')   // multi-part first
      : nameParts.length === 2
        ? nameParts[0]
        : fullNameEnRaw
    const middleNameEn = nameParts.length > 2 ? nameParts[nameParts.length - 2] : null

    // ── Full Name AR (warning if missing, fallback to EN) ─────────────
    const fullNameAr = raw.fullNameAr?.trim()
      ? raw.fullNameAr.trim()
      : (() => {
          addWarning('Full Name AR', 'Full Name AR is missing — Full Name EN will be used until Arabic value is provided')
          return fullNameEnRaw
        })()

    // ── Work Email (mandatory if requiresUser=true) ────────────────────
    const workEmail = raw.workEmail?.trim().toLowerCase() || null
    if (requiresUser && !workEmail) {
      addError('Work Email', 'Work Email is required when Requires User = YES')
    }
    if (workEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
        addError('Work Email', 'Work Email is not a valid email address')
      } else if (existingEmailSet.has(workEmail)) {
        addError('Work Email', `Work Email "${workEmail}" already exists in the system`)
        duplicateRows.add(rowNumber)
      } else if (batchEmails.has(workEmail)) {
        addError('Work Email', `Work Email "${workEmail}" is duplicated in this file (first seen at row ${batchEmails.get(workEmail)})`)
        duplicateRows.add(rowNumber)
      } else {
        batchEmails.set(workEmail, rowNumber)
      }
    }

    // ── Employee Number uniqueness (optional) ─────────────────────────
    const employeeNumber = raw.employeeNumber?.trim() || null
    if (employeeNumber) {
      if (existingNumberSet.has(employeeNumber.toLowerCase())) {
        addError('Employee Number', `Employee Number "${employeeNumber}" already exists in the system`)
        duplicateRows.add(rowNumber)
      } else if (batchNumbers.has(employeeNumber.toLowerCase())) {
        addError('Employee Number', `Employee Number "${employeeNumber}" is duplicated in this file (first seen at row ${batchNumbers.get(employeeNumber.toLowerCase())})`)
        duplicateRows.add(rowNumber)
      } else {
        batchNumbers.set(employeeNumber.toLowerCase(), rowNumber)
      }
    }

    // ── Gender ────────────────────────────────────────────────────────
    const genderRaw = (raw.gender ?? '').toUpperCase().trim()
    const gender: 'MALE' | 'FEMALE' | 'NOT_SPECIFIED' = VALID_GENDERS.has(genderRaw)
      ? genderRaw as 'MALE' | 'FEMALE' | 'NOT_SPECIFIED'
      : 'NOT_SPECIFIED'
    if (genderRaw && !VALID_GENDERS.has(genderRaw)) {
      addWarning('Gender', `Unknown gender "${raw.gender}" — defaulting to NOT_SPECIFIED`)
    }

    // ── Date of Birth ─────────────────────────────────────────────────
    const dateOfBirth = validateDate(raw.dateOfBirth, 'Date of Birth', rowNumber, rowIssues, true)

    // ── Nationality Code ──────────────────────────────────────────────
    const natCodeRaw = (raw.nationalityCode ?? '').toUpperCase().trim()
    if (!natCodeRaw) {
      addError('Nationality Code', 'Nationality Code is required')
    } else if (!ISO_COUNTRY_REGEX.test(natCodeRaw)) {
      addError('Nationality Code', 'Nationality Code must be an ISO 3166-1 alpha-3 code (e.g. ARE, GBR, IND)')
    }
    const nationalityCode = natCodeRaw || 'ARE'
    const nationalityCategory = deriveNationalityCategory(nationalityCode)

    // ── Marital Status ────────────────────────────────────────────────
    const maritalRaw = (raw.maritalStatus ?? '').toUpperCase().trim()
    const maritalStatus = VALID_MARITAL.has(maritalRaw) ? maritalRaw : null
    if (maritalRaw && !VALID_MARITAL.has(maritalRaw)) {
      addWarning('Marital Status', `Unknown marital status "${raw.maritalStatus}" — will be omitted`)
    }

    // ── Legal Entity Code (mandatory, must exist) ─────────────────────
    const entityCode = (raw.legalEntityCode ?? '').trim().toLowerCase()
    if (!entityCode) {
      addError('Legal Entity Code', 'Legal Entity Code is required')
    }
    const entity = entityByCode.get(entityCode)
    if (entityCode && !entity) {
      addError('Legal Entity Code', `Legal Entity "${raw.legalEntityCode}" not found`)
    }
    if (entity && !entity.isActive) {
      addError('Legal Entity Code', `Legal Entity "${raw.legalEntityCode}" is inactive`)
    }

    // ── Department Code (mandatory) ───────────────────────────────────
    const deptCode = (raw.departmentCode ?? '').trim().toLowerCase()
    if (!deptCode) {
      addError('Department Code', 'Department Code is required')
    }
    const dept = deptByCode.get(deptCode)
    if (deptCode && !dept) {
      addError('Department Code', `Department "${raw.departmentCode}" not found`)
    }

    // ── Position Code (mandatory) ─────────────────────────────────────
    const posCode = (raw.positionCode ?? '').trim().toLowerCase()
    if (!posCode) {
      addError('Position Code', 'Position Code is required')
    }
    const pos = posByCode.get(posCode)
    if (posCode && !pos) {
      addError('Position Code', `Position "${raw.positionCode}" not found`)
    }

    // ── Grade Code (mandatory) ────────────────────────────────────────
    const gradeCode = (raw.gradeCode ?? '').trim().toLowerCase()
    if (!gradeCode) {
      addError('Grade Code', 'Grade Code is required')
    }
    const grade = gradeByCode.get(gradeCode)
    if (gradeCode && !grade) {
      addError('Grade Code', `Grade "${raw.gradeCode}" not found`)
    }

    // ── Location Code (optional) ──────────────────────────────────────
    const locCode = (raw.locationCode ?? '').trim().toLowerCase()
    const loc = locCode ? locByCode.get(locCode) : null
    if (locCode && !loc) {
      addWarning('Location Code', `Location "${raw.locationCode}" not found — location will be omitted`)
    }

    // ── Line Manager Employee Number (optional) ───────────────────────
    const mgrNumRaw = (raw.lineManagerEmployeeNumber ?? '').trim()
    let lineManagerId: string | null = null
    if (mgrNumRaw) {
      const mgr = existingManagerMap.get(mgrNumRaw.toLowerCase())
      if (!mgr) {
        addError('Line Manager Employee Number', `Manager employee number "${mgrNumRaw}" not found in the system`)
      } else {
        lineManagerId = mgr
      }
    }

    // ── Hire Date (mandatory) ─────────────────────────────────────────
    const hireDate = validateDate(raw.hireDate, 'Hire Date', rowNumber, rowIssues, true)

    // ── Employment Type (mandatory) ───────────────────────────────────
    const etRaw = (raw.employmentType ?? '').toUpperCase().trim()
    if (!etRaw) {
      addError('Employment Type', 'Employment Type is required')
    } else if (!VALID_EMPLOYMENT_TYPES.has(etRaw)) {
      addError('Employment Type', `Invalid Employment Type "${raw.employmentType}". Valid values: ${[...VALID_EMPLOYMENT_TYPES].join(', ')}`)
    }

    // ── Salary fields ─────────────────────────────────────────────────
    let basicSalary: string | null = null
    let totalPackage: string | null = null
    if (raw.basicSalary) {
      const n = Number(raw.basicSalary)
      if (isNaN(n) || n < 0) {
        addError('Basic Salary', 'Basic Salary must be a positive number')
      } else {
        basicSalary = String(n)
      }
    }
    if (raw.totalPackage) {
      const n = Number(raw.totalPackage)
      if (isNaN(n) || n < 0) {
        addError('Total Package', 'Total Package must be a positive number')
      } else {
        totalPackage = String(n)
      }
    }

    // ── Contract Type ─────────────────────────────────────────────────
    // BR-CT-001: only FIXED_TERM is permitted (DB CHECK constraint, migration 0003)
    const ctRaw = (raw.contractType ?? '').toUpperCase().trim()
    const contractType = ctRaw === 'FIXED_TERM' ? ctRaw : null
    if (ctRaw && ctRaw !== 'FIXED_TERM') {
      addError('Contract Type', `Invalid Contract Type "${raw.contractType}". Only FIXED_TERM is permitted under UAE Labour Law (BR-CT-001)`)
    }

    // ── Contract dates ────────────────────────────────────────────────
    const contractStartDate = validateDate(raw.contractStartDate, 'Contract Start Date', rowNumber, rowIssues, false)
    const contractEndDate   = validateDate(raw.contractEndDate,   'Contract End Date',   rowNumber, rowIssues, false)
    const probationEndDate  = validateDate(raw.probationEndDate,  'Probation End Date',  rowNumber, rowIssues, false)

    if (probationEndDate && hireDate) {
      const hire     = new Date(hireDate)
      const probEnd  = new Date(probationEndDate)
      const sixMonths = new Date(hire)
      sixMonths.setMonth(sixMonths.getMonth() + 6)
      if (probEnd > sixMonths) {
        addError('Probation End Date', 'BR-PR-001: Probation End Date exceeds 6 months from Hire Date')
      }
    }

    // ── Emirates ID (PII) ─────────────────────────────────────────────
    let emiratesId: string | null = null
    if (raw.emiratesId) {
      if (!EMIRATES_ID_REGEX.test(raw.emiratesId.trim())) {
        addError('Emirates ID', 'Emirates ID must match format 784-XXXX-XXXXXXX-X')
      } else {
        try {
          emiratesId = normalizeEmiratesId(raw.emiratesId.trim())
        } catch {
          addError('Emirates ID', 'Emirates ID could not be normalised to canonical form')
        }
      }
    }

    // ── Insurance Plan Code (optional) ────────────────────────────────
    const insCodeRaw = (raw.insurancePlanCode ?? '').trim().toLowerCase()
    const insurancePlan = insCodeRaw ? planByCode.get(insCodeRaw) : null
    if (insCodeRaw && !insurancePlan) {
      addWarning('Insurance Plan Code', `Insurance plan "${raw.insurancePlanCode}" not found — will be omitted`)
    }

    // ── Mobile number — UAE normalization ────────────────────────────
    // Normalizes to +971XXXXXXXXX format. Invalid numbers are cleared (null)
    // and flagged as a WARNING (not ERROR — does not block import).
    const rawMobile = raw.mobile?.trim() || null
    const normalizedMobile = normalizeUaeMobile(rawMobile)
    if (rawMobile && normalizedMobile === null) {
      addWarning('Mobile', `Mobile number "${rawMobile}" could not be normalized to UAE format (+971XXXXXXXXX) — it will be stored as-is`)
    }

    // ── Accumulate issues ─────────────────────────────────────────────
    issues.push(...rowIssues)
    const hasBlockingError = rowIssues.some(i => i.severity === 'ERROR')
    if (hasBlockingError) rowsWithErrors.add(rowNumber)
    if (rowIssues.some(i => i.severity === 'WARNING')) rowsWithWarnings.add(rowNumber)

    if (!hasBlockingError) {
      validatedRows.push({
        rowNumber,
        requiresUser,
        personNumber:     employeeNumber,
        firstNameEn,
        middleNameEn,
        lastNameEn,
        fullNameEn:        fullNameEnRaw,
        fullNameAr,
        workEmail,
        personalEmail:     raw.personalEmail?.trim().toLowerCase() || null,
        mobile:            normalizedMobile ?? rawMobile,
        gender,
        dateOfBirth:       dateOfBirth ?? '1970-01-01',
        nationalityCode,
        nationalityCategory,
        maritalStatus,
        hireDate:          hireDate ?? '',
        employmentType:    etRaw,
        basicSalary,
        totalPackage,
        contractType,
        contractStartDate,
        contractEndDate,
        probationEndDate,
        passportNumber:    raw.passportNumber?.trim() || null,
        emiratesId,
        visaNumber:        raw.visaNumber?.trim() || null,
        labourCardNumber:  raw.labourCardNumber?.trim() || null,
        refs: {
          legalEntityId:   entity?.id ?? '',
          departmentId:    dept?.id   ?? '',
          positionId:      pos?.id    ?? '',
          gradeId:         grade?.id  ?? '',
          locationId:      loc?.id    ?? null,
          lineManagerId,
          insurancePlanId: insurancePlan?.id ?? null,
        },
      })
    }
  }

  const rowsRequiringUser = validatedRows.filter(r => r.requiresUser).length
  const rowsWithoutUser   = validatedRows.filter(r => !r.requiresUser).length

  return {
    totalRows:         rawRows.length,
    validRows:         validatedRows.length,
    errorRows:         rowsWithErrors.size,
    warningRows:       [...rowsWithWarnings].filter(r => !rowsWithErrors.has(r)).length,
    duplicateRows:     duplicateRows.size,
    rowsRequiringUser,
    rowsWithoutUser,
    issues,
    validatedRows,
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bulk-import/template.ts
LINES: 228
================================================================================
/**
 * Excel template generator for bulk employee import.
 * Produces a .xlsx workbook with:
 *   Sheet 1 — Instructions
 *   Sheet 2 — Employees (data entry, headers styled)
 *   Sheets 3–9 — Reference data (Legal Entities, Depts, Positions, Grades,
 *                Locations, Employment Types, Nationalities)
 *
 * Uses the xlsx package already in package.json (^0.18.5).
 * Pure function — no DB calls; reference data is passed in as params.
 */
import * as XLSX from 'xlsx'

// ── Column headers (must stay in sync with COLUMN_MAP in row-validator.ts) ─

export const EMPLOYEE_HEADERS = [
  'Requires User',
  'Employee Number',
  'Full Name EN',
  'Full Name AR',
  'Work Email',
  'Personal Email',
  'Mobile',
  'Gender',
  'Date of Birth',
  'Nationality Code',
  'Marital Status',
  'Legal Entity Code',
  'Department Code',
  'Position Code',
  'Grade Code',
  'Location Code',
  'Line Manager Employee Number',
  'Hire Date',
  'Employment Type',
  'Basic Salary',
  'Total Package',
  'Contract Type',
  'Contract Start Date',
  'Contract End Date',
  'Probation End Date',
  'Passport Number',
  'Emirates ID',
  'Visa Number',
  'Labour Card Number',
  'Insurance Plan Code',
] as const

export interface TemplateRefData {
  legalEntities: { code: string; nameEn: string }[]
  departments:   { code: string; nameEn: string; entityCode: string }[]
  positions:     { code: string; titleEn: string; entityCode: string }[]
  grades:        { code: string; nameEn: string }[]
  locations:     { code: string; nameEn: string }[]
}

// ── Instructions content ───────────────────────────────────────────────────

const INSTRUCTIONS: [string, string][] = [
  ['AVANIIS HR — Bulk Employee Import Template', ''],
  ['', ''],
  ['HOW TO USE', ''],
  ['1.', 'Fill the "Employees" sheet. Do NOT change the column headers.'],
  ['2.', 'Use the reference sheets (Legal Entities, Departments, etc.) to find valid codes.'],
  ['3.', 'Upload the completed file in People → Import Employees.'],
  ['4.', 'Review the validation preview before confirming the import.'],
  ['', ''],
  ['MANDATORY COLUMNS', ''],
  ['Full Name EN', 'Employee full name in English. Required.'],
  ['Legal Entity Code', 'Must match a code in the Legal Entities sheet.'],
  ['Department Code', 'Must match a code in the Departments sheet.'],
  ['Position Code', 'Must match a code in the Positions sheet.'],
  ['Grade Code', 'Must match a code in the Grades sheet.'],
  ['Hire Date', 'Format: YYYY-MM-DD (e.g. 2024-01-15). Required.'],
  ['Employment Type', 'One of: FULL_TIME, PART_TIME, TEMPORARY, TASK_BASED, FLEXIBLE, REMOTE, SHARED. Required.'],
  ['Date of Birth', 'Format: YYYY-MM-DD. Required.'],
  ['Nationality Code', 'ISO 3166-1 alpha-3 country code (e.g. ARE, GBR, IND). Required.'],
  ['', ''],
  ['CONDITIONAL COLUMNS', ''],
  ['Requires User', 'YES or NO. Blank defaults to YES. If YES, Work Email is mandatory.'],
  ['Work Email', 'Mandatory when Requires User = YES. Must be unique in the system.'],
  ['', ''],
  ['OPTIONAL COLUMNS', ''],
  ['Employee Number', 'Leave blank to auto-generate based on entity sequence.'],
  ['Full Name AR', 'Arabic full name. If blank, Full Name EN is used as fallback.'],
  ['Personal Email', 'Secondary personal email address.'],
  ['Mobile', 'Mobile number (e.g. +971501234567).'],
  ['Gender', 'MALE, FEMALE, or NOT_SPECIFIED. Defaults to NOT_SPECIFIED if blank.'],
  ['Marital Status', 'SINGLE, MARRIED, DIVORCED, WIDOWED, or NOT_SPECIFIED.'],
  ['Location Code', 'Must match a code in the Locations sheet.'],
  ['Line Manager Employee Number', 'Employee Number of the line manager. Must already exist in the system.'],
  ['Basic Salary', 'Numeric value in AED (e.g. 15000).'],
  ['Total Package', 'Numeric value in AED (e.g. 20000).'],
  ['Contract Type', 'FIXED_TERM or UNLIMITED. Defaults to FIXED_TERM.'],
  ['Contract Start Date', 'Format: YYYY-MM-DD. Defaults to Hire Date if blank.'],
  ['Contract End Date', 'Format: YYYY-MM-DD. Required for FIXED_TERM contracts.'],
  ['Probation End Date', 'Format: YYYY-MM-DD. Max 6 months from Hire Date (BR-PR-001).'],
  ['Passport Number', 'Stored encrypted. Optional.'],
  ['Emirates ID', 'Format: 784-XXXX-XXXXXXX-X. Stored encrypted. Optional.'],
  ['Visa Number', 'UAE residency visa number. Optional.'],
  ['Labour Card Number', 'MOHRE labour card number. Optional.'],
  ['Insurance Plan Code', 'Must match a code in the system (optional at import).'],
  ['', ''],
  ['PII NOTICE', ''],
  ['', 'Emirates ID, Passport Number, Visa Number and Labour Card Number are encrypted at rest.'],
  ['', 'Access is restricted to authorised HR roles per UAE PDPL requirements.'],
]

// ── Build workbook ─────────────────────────────────────────────────────────

export function buildImportTemplate(refs: TemplateRefData): Buffer {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Instructions ───────────────────────────────────────────────
  const instrWs = XLSX.utils.aoa_to_sheet(INSTRUCTIONS)
  instrWs['!cols'] = [{ wch: 35 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions')

  // ── Sheet 2: Employees ─────────────────────────────────────────────────
  const empWs = XLSX.utils.aoa_to_sheet([EMPLOYEE_HEADERS as unknown as string[]])
  empWs['!cols'] = EMPLOYEE_HEADERS.map(() => ({ wch: 24 }))
  // Sample row to guide users
  XLSX.utils.sheet_add_aoa(empWs, [[
    'YES', '', 'Jane Smith', 'جين سميث', 'jane.smith@company.com',
    '', '+971501234567', 'FEMALE', '1990-05-15', 'GBR',
    'SINGLE', refs.legalEntities[0]?.code ?? 'AVN',
    refs.departments[0]?.code ?? 'FIN',
    refs.positions[0]?.code ?? 'POS001',
    refs.grades[0]?.code ?? 'G1',
    refs.locations[0]?.code ?? 'DXB',
    '', '2024-01-15', 'FULL_TIME', '15000', '20000',
    'FIXED_TERM', '2024-01-15', '2025-01-14', '2024-07-15',
    '', '', '', '', '',
  ]], { origin: 'A2' })
  XLSX.utils.book_append_sheet(wb, empWs, 'Employees')

  // ── Sheet 3: Legal Entities ────────────────────────────────────────────
  const leRows = [
    ['Code', 'Name (EN)'],
    ...refs.legalEntities.map(e => [e.code, e.nameEn]),
  ]
  const leWs = XLSX.utils.aoa_to_sheet(leRows)
  leWs['!cols'] = [{ wch: 15 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, leWs, 'Legal Entities')

  // ── Sheet 4: Departments ───────────────────────────────────────────────
  const deptRows = [
    ['Code', 'Name (EN)', 'Entity Code'],
    ...refs.departments.map(d => [d.code, d.nameEn, d.entityCode]),
  ]
  const deptWs = XLSX.utils.aoa_to_sheet(deptRows)
  deptWs['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, deptWs, 'Departments')

  // ── Sheet 5: Positions ─────────────────────────────────────────────────
  const posRows = [
    ['Code', 'Title (EN)', 'Entity Code'],
    ...refs.positions.map(p => [p.code, p.titleEn, p.entityCode]),
  ]
  const posWs = XLSX.utils.aoa_to_sheet(posRows)
  posWs['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, posWs, 'Positions')

  // ── Sheet 6: Grades ────────────────────────────────────────────────────
  const gradeRows = [
    ['Code', 'Name (EN)'],
    ...refs.grades.map(g => [g.code, g.nameEn]),
  ]
  const gradeWs = XLSX.utils.aoa_to_sheet(gradeRows)
  gradeWs['!cols'] = [{ wch: 15 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, gradeWs, 'Grades')

  // ── Sheet 7: Locations ─────────────────────────────────────────────────
  const locRows = [
    ['Code', 'Name (EN)'],
    ...refs.locations.map(l => [l.code, l.nameEn]),
  ]
  const locWs = XLSX.utils.aoa_to_sheet(locRows)
  locWs['!cols'] = [{ wch: 15 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, locWs, 'Locations')

  // ── Sheet 8: Employment Types ──────────────────────────────────────────
  const etRows = [
    ['Code', 'Description'],
    ['FULL_TIME',   'Regular full-time employment'],
    ['PART_TIME',   'Part-time employment'],
    ['TEMPORARY',   'Fixed-duration temporary contract'],
    ['TASK_BASED',  'Project / task-based engagement'],
    ['FLEXIBLE',    'Flexible working arrangement'],
    ['REMOTE',      'Fully remote employment'],
    ['SHARED',      'Shared (split between entities)'],
  ]
  const etWs = XLSX.utils.aoa_to_sheet(etRows)
  etWs['!cols'] = [{ wch: 18 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, etWs, 'Employment Types')

  // ── Sheet 9: Common Nationalities ─────────────────────────────────────
  const natRows = [
    ['ISO Code', 'Country'],
    ['ARE', 'United Arab Emirates'],
    ['SAU', 'Saudi Arabia'],
    ['KWT', 'Kuwait'],
    ['BHR', 'Bahrain'],
    ['QAT', 'Qatar'],
    ['OMN', 'Oman'],
    ['EGY', 'Egypt'],
    ['IND', 'India'],
    ['PAK', 'Pakistan'],
    ['PHL', 'Philippines'],
    ['BGD', 'Bangladesh'],
    ['LKA', 'Sri Lanka'],
    ['NPL', 'Nepal'],
    ['GBR', 'United Kingdom'],
    ['USA', 'United States'],
    ['CAN', 'Canada'],
    ['AUS', 'Australia'],
    ['JOR', 'Jordan'],
    ['LBN', 'Lebanon'],
    ['SDN', 'Sudan'],
    ['ETH', 'Ethiopia'],
  ]
  const natWs = XLSX.utils.aoa_to_sheet(natRows)
  natWs['!cols'] = [{ wch: 12 }, { wch: 35 }]
  XLSX.utils.book_append_sheet(wb, natWs, 'Nationalities')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buf)
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/bulk-import/types.ts
LINES: 126
================================================================================
/**
 * Bulk Employee Import — shared types.
 * Used by template generator, row-validator, import-engine, and UI.
 */

// ── Raw Excel row (string values as read from xlsx) ───────────────────────

export interface RawImportRow {
  requiresUser:              string | undefined
  employeeNumber:            string | undefined
  fullNameEn:                string | undefined
  fullNameAr:                string | undefined
  workEmail:                 string | undefined
  personalEmail:             string | undefined
  mobile:                    string | undefined
  gender:                    string | undefined
  dateOfBirth:               string | undefined
  nationalityCode:           string | undefined
  maritalStatus:             string | undefined
  legalEntityCode:           string | undefined
  departmentCode:            string | undefined
  positionCode:              string | undefined
  gradeCode:                 string | undefined
  locationCode:              string | undefined
  lineManagerEmployeeNumber: string | undefined
  hireDate:                  string | undefined
  employmentType:            string | undefined
  basicSalary:               string | undefined
  totalPackage:              string | undefined
  contractType:              string | undefined
  contractStartDate:         string | undefined
  contractEndDate:           string | undefined
  probationEndDate:          string | undefined
  passportNumber:            string | undefined
  emiratesId:                string | undefined
  visaNumber:                string | undefined
  labourCardNumber:          string | undefined
  insurancePlanCode:         string | undefined
}

// ── Resolved IDs and lookups after reference validation ───────────────────

export interface ResolvedRefs {
  legalEntityId:   string
  departmentId:    string
  positionId:      string
  gradeId:         string
  locationId:      string | null
  lineManagerId:   string | null
  insurancePlanId: string | null
}

// ── Typed, validated row ready for import ─────────────────────────────────

export interface ValidatedImportRow {
  rowNumber:        number
  requiresUser:     boolean
  personNumber:     string | null   // null = auto-generate
  firstNameEn:      string
  middleNameEn:     string | null
  lastNameEn:       string
  fullNameEn:       string
  fullNameAr:       string
  workEmail:        string | null
  personalEmail:    string | null
  mobile:           string | null
  gender:           'MALE' | 'FEMALE' | 'NOT_SPECIFIED'
  dateOfBirth:      string           // YYYY-MM-DD
  nationalityCode:  string           // ISO 3166-1 alpha-3
  nationalityCategory: 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT'
  maritalStatus:    string | null
  hireDate:         string           // YYYY-MM-DD
  employmentType:   string
  basicSalary:      string | null    // numeric string
  totalPackage:     string | null    // numeric string
  contractType:     string | null
  contractStartDate: string | null
  contractEndDate:  string | null
  probationEndDate: string | null
  passportNumber:   string | null    // will be encrypted
  emiratesId:       string | null    // will be encrypted (normalised)
  visaNumber:       string | null
  labourCardNumber: string | null
  refs: ResolvedRefs
}

// ── Validation error / warning per row ───────────────────────────────────

export type IssueSeverity = 'ERROR' | 'WARNING'

export interface RowIssue {
  rowNumber: number
  field:     string
  message:   string
  severity:  IssueSeverity
}

// ── Preview / validation result returned to the UI ───────────────────────

export interface ImportPreview {
  totalRows:          number
  validRows:          number
  errorRows:          number
  warningRows:        number
  duplicateRows:      number
  rowsRequiringUser:  number
  rowsWithoutUser:    number
  issues:             RowIssue[]
  validatedRows:      ValidatedImportRow[]
}

// ── Import result returned after confirm ─────────────────────────────────

export interface ImportRowResult {
  rowNumber:    number
  personNumber: string
  personId:     string
  fullNameEn:   string
  userCreated:  boolean
}

export interface ImportResult {
  imported:     number
  usersCreated: number
  rows:         ImportRowResult[]
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/contacts/actions.ts
LINES: 157
================================================================================
'use server'

/**
 * Contact upsert action — creates, updates, or deactivates person_contacts rows.
 *
 * Strategy per contact type:
 *   value non-empty + row exists  → UPDATE contact_value, set is_active=true
 *   value non-empty + no row yet  → INSERT new active row
 *   value empty     + row exists  → SET is_active=false (soft-delete, keeps audit history)
 *   value empty     + no row      → no-op
 *
 * All mutations run in one transaction with a single audit row.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { personContacts, persons } from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { CONTACT_TYPES } from './constants'
export type { ContactType } from './constants'

// ── Input schema ───────────────────────────────────────────────────────────
const ContactEntrySchema = z.object({
  type:  z.enum(CONTACT_TYPES),
  value: z.string().max(200),
})

const UpsertContactsSchema = z.object({
  personId: z.string().uuid(),
  contacts: z.array(ContactEntrySchema),
})

export type UpsertContactsInput = z.infer<typeof UpsertContactsSchema>

export interface UpsertContactsResult {
  inserted: number
  updated:  number
  removed:  number
}

export async function upsertPersonContacts(
  personId: string,
  contacts: Array<{ type: string; value: string }>,
): Promise<UpsertContactsResult> {
  const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const input = UpsertContactsSchema.parse({ personId, contacts })

  // Confirm person exists and is in actor's entity scope
  const [person] = await db
    .select({ id: persons.id, legalEntityId: persons.legalEntityId, fullNameEn: persons.fullNameEn })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, input.personId)))
    .limit(1)
  if (!person) throw new Error('Person not found')
  if (actor.role !== 'SUPER_ADMIN' && actor.legalEntityId !== person.legalEntityId) {
    throw new Error('FORBIDDEN: person is outside your entity scope')
  }

  // Load all existing active contacts for this person
  const existing = await db
    .select()
    .from(personContacts)
    .where(and(
      eq(personContacts.tenantId, TENANT_ID),
      eq(personContacts.personId, input.personId),
      inArray(personContacts.contactType, CONTACT_TYPES as unknown as string[]),
    ))

  const existingByType = new Map(existing.map(r => [r.contactType, r]))

  let inserted = 0
  let updated  = 0
  let removed  = 0

  const now = new Date()

  await db.transaction(async tx => {
    for (const entry of input.contacts) {
      const existing = existingByType.get(entry.type)
      const trimmed  = entry.value.trim()

      if (trimmed) {
        if (existing) {
          if (existing.contactValue !== trimmed || !existing.isActive) {
            // Update existing row
            await tx.update(personContacts)
              .set({
                contactValue:    trimmed,
                isActive:        true,
                updatedBy:       actor.id,
                updatedByName:   actor.name,
                lastUpdatedDate: now,
              })
              .where(eq(personContacts.id, existing.id))
            updated++
          }
          // else: unchanged — no-op
        } else {
          // Insert new row
          await tx.insert(personContacts).values({
            tenantId:     TENANT_ID,
            personId:     input.personId,
            contactType:  entry.type,
            contactValue: trimmed,
            isPrimary:    entry.type === 'WORK_EMAIL' || entry.type === 'MOBILE_PRIMARY',
            isVerified:   false,
            isActive:     true,
            createdBy:    actor.id,
            createdByName: actor.name,
          })
          inserted++
        }
      } else if (existing && existing.isActive) {
        // Soft-delete: blank value = deactivate
        await tx.update(personContacts)
          .set({
            isActive:        false,
            updatedBy:       actor.id,
            updatedByName:   actor.name,
            lastUpdatedDate: now,
          })
          .where(eq(personContacts.id, existing.id))
        removed++
      }
    }

    if (inserted + updated + removed > 0) {
      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'PERSON.CONTACTS_UPDATED',
        resourceType: 'person_contacts',
        resourceId:   input.personId,
        newValues: {
          personId:   input.personId,
          personName: person.fullNameEn,
          inserted, updated, removed,
          contacts: input.contacts
            .filter(c => c.value.trim())
            .map(c => ({ type: c.type, value: c.value.trim() })),
        },
      }, tx)
    }
  })

  revalidatePath(`/persons/${input.personId}/edit`)
  revalidatePath(`/persons/${input.personId}`)

  return { inserted, updated, removed }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/contacts/constants.ts
LINES: 16
================================================================================
/**
 * Contact-type constants — plain module (no 'use server').
 * Imported by both the server action and any client-facing code.
 */

export const CONTACT_TYPES = [
  'WORK_EMAIL',
  'PERSONAL_EMAIL',
  'MOBILE_PRIMARY',
  'MOBILE_SECONDARY',
  'WORK_PHONE',
  'HOME_PHONE',
  'WHATSAPP',
] as const

export type ContactType = (typeof CONTACT_TYPES)[number]


================================================================================
FILE [P3-01/03/04]: modules/core-hr/contracts/actions.ts
LINES: 544
================================================================================
'use server'

/**
 * S3-04 — Contract lifecycle Server Actions.
 *
 * Three public actions: create, amend, terminate.
 *   • create     — issues a new fixed-term contract (BR-CT-001)
 *   • amend      — close-current + open-new pattern (effective-dated history)
 *   • terminate  — flips status, sets termination metadata; row is preserved
 *                  forever (Hard Rule 3 — HR records never deleted)
 *
 * Every BR-xx rule check is tagged with a comment so a future law change is
 * greppable.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, sql } from 'drizzle-orm'
import {
  contracts, persons, workerAssignments, medicalInsuranceEnrolments,
  onboardingChecklists, onboardingChecklistItems,
} from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { addDays } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import { requireCorrectionModePermission } from '@/modules/config/guards'
import { cancelEnrolmentTx } from '@/modules/insurance'
import {
  CreateContractSchema, AmendContractSchema, TerminateContractSchema, CorrectContractSchema,
  type CreateContractInput, type AmendContractInput, type TerminateContractInput, type CorrectContractInput,
} from './validations'

// ── Helpers ────────────────────────────────────────────────────────────────

async function nextContractNumber(
  legalEntityId: string,
  tx: { select: typeof db.select },
): Promise<string> {
  // Format: CTR-<entityShort>-NNNNNN — counts existing rows for the entity.
  const result = await tx
    .select({ n: sql<number>`COALESCE(COUNT(*), 0)` })
    .from(contracts)
    .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.legalEntityId, legalEntityId)))
  const next = (result[0]?.n ?? 0) + 1
  return `CTR-${String(next).padStart(7, '0')}`
}

// BR-NP-001 helper lives in ./services.ts (sync — keeps this 'use server'
// file compliant with the "every export must be async" rule).

// ══════════════════════════════════════════════════════════════════════════
// 1 — createContract
// ══════════════════════════════════════════════════════════════════════════

export async function createContract(
  input: CreateContractInput,
): Promise<{ id: string; contractNumber: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = CreateContractSchema.parse(input)

  let newId  = ''
  let newNum = ''

  await db.transaction(async tx => {
    // Person must exist + caller must be in scope.
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId, hireDate: persons.hireDate })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
      .limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cannot issue contracts in another legal entity')
    }
    if (person.legalEntityId !== data.legalEntityId) {
      throw new Error('legalEntityId must match the person\'s entity')
    }

    newNum = await nextContractNumber(data.legalEntityId, tx)

    const [row] = await tx
      .insert(contracts)
      .values({
        tenantId:        TENANT_ID,
        personId:        data.personId,
        legalEntityId:   data.legalEntityId,
        contractNumber:  newNum,
        contractType:    data.contractType,                    // BR-CT-001: FIXED_TERM
        employmentType:  data.employmentType,
        startDate:       data.startDate,
        endDate:         data.endDate,                         // BR-CT-002: validated above
        probationStart:  data.probationStart ?? data.startDate,
        probationEnd:    data.probationEnd,                    // BR-PR-001: validated above
        noticePeriodDays: data.noticePeriodDays,               // BR-NP-001 (caller can pre-set)
        workingHoursPerWeek: data.workingHoursPerWeek.toString(),
        workLocation:    data.workLocation,
        contractDocumentId: data.contractDocumentId,
        renewalCount:    0,
        status:          'ACTIVE',
        actionMode:      'UPDATE',
        notes:           data.notes,
        extraData:       {},
        createdBy:       user.id,
        createdByName:   user.name,
      })
      .returning({ id: contracts.id })
    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: data.legalEntityId,
      channel:       'WEB',
      eventType:     'CONTRACT.CREATED',
      resourceType:  'contracts',
      resourceId:    newId,
      entityId:      data.legalEntityId,
      newValues: {
        contractNumber: newNum,
        personId: data.personId,
        startDate: data.startDate,
        endDate: data.endDate,
        employmentType: data.employmentType,
      },
    }, tx)
  })

  return { id: newId, contractNumber: newNum }
  } catch (e) { translateError(e, 'createContract') }
}

// ══════════════════════════════════════════════════════════════════════════
// 2 — amendContract  (close current + open new — effective-date pattern)
// ══════════════════════════════════════════════════════════════════════════

export async function amendContract(
  input: AmendContractInput,
): Promise<{ closedId: string; newId: string; newContractNumber: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = AmendContractSchema.parse(input)

  let closedId = ''
  let newId    = ''
  let newNum   = ''

  await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.id, data.contractId)))
      .limit(1)
    if (!current) throw new Error('contract not found')
    if (current.status !== 'ACTIVE') throw new Error('only ACTIVE contracts can be amended')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== current.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity amendment not allowed')
    }

    // BR-CT-002 — re-check the new term doesn't exceed 3 years from the
    //              ORIGINAL startDate (we keep the same start; only end shifts).
    const newEndDate = data.newEndDate ?? current.endDate
    const start = new Date(current.startDate)
    const newEnd = new Date(newEndDate)
    const threeYears = new Date(start)
    threeYears.setFullYear(threeYears.getFullYear() + 3)
    if (newEnd > threeYears) {
      throw new Error('BR-CT-002: amended term exceeds 3 years from original start')
    }

    // 1) close the current row (status=RENEWED, terminationDate=effectiveDate-1)
    const closeDate = addDays(data.effectiveDate, -1)
    await tx
      .update(contracts)
      .set({
        status:           'RENEWED',
        terminationDate:  closeDate,
        terminationReason: `Amended: ${data.reason}`,
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(eq(contracts.id, current.id))
    closedId = current.id

    // 2) open the new row carrying forward all unchanged columns.
    newNum = await nextContractNumber(current.legalEntityId, tx)
    const [row] = await tx
      .insert(contracts)
      .values({
        tenantId:        TENANT_ID,
        personId:        current.personId,
        legalEntityId:   current.legalEntityId,
        contractNumber:  newNum,
        contractType:    current.contractType,                 // BR-CT-001 preserved
        employmentType:  data.newEmploymentType ?? current.employmentType,
        startDate:       data.effectiveDate,
        endDate:         newEndDate,
        probationStart:  current.probationStart,
        probationEnd:    null,                                 // BR-PR-003: no new probation on renewal
        noticePeriodDays: data.newNoticePeriodDays ?? current.noticePeriodDays,
        workingHoursPerWeek: (data.newWorkingHoursPerWeek?.toString() ?? current.workingHoursPerWeek),
        workLocation:    data.newWorkLocation ?? current.workLocation,
        contractDocumentId: current.contractDocumentId,
        renewalCount:    current.renewalCount + 1,
        previousContractId: current.id,
        status:          'ACTIVE',
        actionMode:      'UPDATE',
        notes:           data.notes ?? current.notes,
        extraData:       (current.extraData as Record<string, unknown>) ?? {},
        createdBy:       user.id,
        createdByName:   user.name,
      })
      .returning({ id: contracts.id })
    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'CONTRACT.AMENDED',
      resourceType:  'contracts',
      resourceId:    newId,
      entityId:      current.legalEntityId,
      metadata: {
        previousContractId: current.id,
        previousContractNumber: current.contractNumber,
        effectiveDate: data.effectiveDate,
        reason: data.reason,
      },
    }, tx)
  })

  return { closedId, newId, newContractNumber: newNum }
  } catch (e) { translateError(e, 'amendContract') }
}

// ══════════════════════════════════════════════════════════════════════════
// 3 — terminateContract
// ══════════════════════════════════════════════════════════════════════════

export async function terminateContract(
  input: TerminateContractInput,
): Promise<{ id: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = TerminateContractSchema.parse(input)

  await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.id, data.contractId)))
      .limit(1)
    if (!current) throw new Error('contract not found')
    if (current.status === 'TERMINATED') throw new Error('contract is already terminated')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== current.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity termination not allowed')
    }

    // BR-EOSB-PAY-001: outstanding balances must be paid within 14 days of
    //   termination_date. Payroll module enforces — we record the date here.
    await tx
      .update(contracts)
      .set({
        status:            'TERMINATED',
        terminationDate:   data.terminationDate,
        terminationReason: data.terminationReason,
        notes:             data.notes ?? current.notes,
        updatedBy:         user.id,
        updatedByName:     user.name,
        updatedDate:       new Date(),
        lastUpdatedDate:   new Date(),
      })
      .where(eq(contracts.id, current.id))

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'CONTRACT.TERMINATED',
      resourceType:  'contracts',
      resourceId:    current.id,
      entityId:      current.legalEntityId,
      changedFields: ['status', 'terminationDate', 'terminationReason'],
      metadata:      { terminationDate: data.terminationDate, reason: data.terminationReason },
    }, tx)

    // QF-1 — Close the current worker_assignment for this person.
    // Hard Rule 3: never DELETE — mark TERMINATED + set effectiveEndDate.
    const [currentAssignment] = await tx
      .select({ id: workerAssignments.id })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, current.personId),
        eq(workerAssignments.isCurrent, true),
      ))
      .limit(1)

    if (currentAssignment) {
      await tx
        .update(workerAssignments)
        .set({
          assignmentStatus: 'TERMINATED',
          effectiveEndDate: data.terminationDate,
          isCurrent:        false,
          updatedBy:        user.id,
          updatedByName:    user.name,
          updatedDate:      new Date(),
          lastUpdatedDate:  new Date(),
        })
        .where(eq(workerAssignments.id, currentAssignment.id))
    }

    // QF-1 — Sync persons denormalised status so person lists show TERMINATED.
    await tx
      .update(persons)
      .set({
        assignmentStatus: 'TERMINATED',
        separationDate:   data.terminationDate,
        separationReason: data.terminationReason.slice(0, 100),
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, current.personId)))

    // QF-2 — BR-INS-006: insurance must cover the notice period after termination.
    // Cancel all active enrolments; extend expiry to terminationDate + noticePeriodDays.
    const activeEnrolments = await tx
      .select({ id: medicalInsuranceEnrolments.id })
      .from(medicalInsuranceEnrolments)
      .where(and(
        eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
        eq(medicalInsuranceEnrolments.personId, current.personId),
        eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
      ))

    const noticeDays = current.noticePeriodDays ?? 0
    const insuranceExpiryDate = addDays(data.terminationDate, noticeDays)

    for (const enrolment of activeEnrolments) {
      try {
        await cancelEnrolmentTx(tx, {
          id:            user.id,
          name:          user.name,
          role:          user.role,
          legalEntityId: current.legalEntityId,
        }, {
          enrolmentId:        enrolment.id,
          cancellationDate:   data.terminationDate,
          cancellationReason: `Employment terminated: ${data.terminationReason}`,
          ...(noticeDays > 0 && {
            extensionDate:   insuranceExpiryDate,
            extensionReason: `BR-INS-006: coverage extended through notice period (${noticeDays} days)`,
          }),
        })
      } catch {
        // Insurance cancellation must not block contract termination.
        // HR can manually cancel enrolments from the insurance tab.
      }
    }

    // P2-3 — BR-OFFB-001: Create a full offboarding checklist for ALL departing employees.
    // VISA_CANCELLATION is added only for EXPATs (BR-VISA-001).
    const [personDetail] = await tx
      .select({ nationalityCategory: persons.nationalityCategory })
      .from(persons)
      .where(eq(persons.id, current.personId))
      .limit(1)

    const [checklist] = await tx
      .insert(onboardingChecklists)
      .values({
        tenantId:      TENANT_ID,
        personId:      current.personId,
        legalEntityId: current.legalEntityId,
        checklistType: 'OFFBOARDING',
        initiatedDate: new Date().toISOString().slice(0, 10),
        targetDate:    data.terminationDate,
        status:        'IN_PROGRESS',
        completionPct: 0,
        createdBy:     user.id,
        createdByName: user.name,
      })
      .returning({ id: onboardingChecklists.id })

    type ChecklistItemInsert = typeof onboardingChecklistItems.$inferInsert
    const baseItems: Omit<ChecklistItemInsert, 'tenantId' | 'checklistId' | 'createdBy' | 'createdByName'>[] = [
      {
        itemCode: 'IT_ACCESS_REVOCATION', category: 'IT', isMandatory: true,
        itemNameEn: 'IT Access Revocation', itemNameAr: 'إلغاء صلاحيات تقنية المعلومات',
        assignedToRole: 'IT', dueDaysFromStart: 0, status: 'PENDING',
      },
      {
        itemCode: 'EQUIPMENT_RETURN', category: 'IT', isMandatory: true,
        itemNameEn: 'Equipment Return', itemNameAr: 'إعادة المعدات',
        assignedToRole: 'MANAGER', dueDaysFromStart: 3, status: 'PENDING',
      },
      {
        itemCode: 'WORK_HANDOVER', category: 'MANAGER', isMandatory: true,
        itemNameEn: 'Work Handover', itemNameAr: 'تسليم المهام الوظيفية',
        assignedToRole: 'MANAGER', dueDaysFromStart: 5, status: 'PENDING',
      },
      {
        itemCode: 'EXIT_INTERVIEW', category: 'HR', isMandatory: false,
        itemNameEn: 'Exit Interview', itemNameAr: 'مقابلة نهاية الخدمة',
        assignedToRole: 'HR_ADMIN', dueDaysFromStart: 5, status: 'PENDING',
      },
      {
        itemCode: 'HR_DOCUMENTS_COLLECTION', category: 'HR', isMandatory: true,
        itemNameEn: 'HR Documents Collection', itemNameAr: 'جمع مستندات الموارد البشرية',
        assignedToRole: 'HR_ADMIN', dueDaysFromStart: 7, status: 'PENDING',
      },
      {
        itemCode: 'FINAL_PAYROLL_PROCESSING', category: 'PAYROLL', isMandatory: true,
        itemNameEn: 'Final Payroll & EOSB Processing', itemNameAr: 'معالجة الراتب النهائي ومكافأة نهاية الخدمة',
        assignedToRole: 'PAYROLL_ADMIN', dueDaysFromStart: 14, status: 'PENDING',
      },
    ]

    // BR-VISA-001: Add EXPAT-only visa cancellation item.
    if (personDetail?.nationalityCategory === 'EXPAT') {
      baseItems.push({
        itemCode: 'VISA_CANCELLATION', category: 'HR', isMandatory: true,
        itemNameEn: 'UAE Residence Visa Cancellation', itemNameAr: 'إلغاء تأشيرة الإقامة الإماراتية',
        assignedToRole: 'HR_ADMIN', dueDaysFromStart: 30, status: 'PENDING',
      })
    }

    await tx
      .insert(onboardingChecklistItems)
      .values(
        baseItems.map(item => ({
          tenantId:      TENANT_ID,
          checklistId:   checklist.id,
          createdBy:     user.id,
          createdByName: user.name,
          ...item,
        })),
      )
  })

  return { id: data.contractId }
  } catch (e) { translateError(e, 'terminateContract') }
}

// ══════════════════════════════════════════════════════════════════════════
// 4 — correctContract  (in-place correction — HR_DIRECTOR / SUPER_ADMIN only)
// ══════════════════════════════════════════════════════════════════════════

export async function correctContract(
  input: CorrectContractInput,
): Promise<{ id: string }> {
  try {
  const user = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
  requireCorrectionModePermission(user.role)
  const data = CorrectContractSchema.parse(input)

  if (!data.correctionNote?.trim()) {
    throw new Error('CORRECTION mode requires a non-empty correctionNote')
  }

  await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.id, data.contractId)))
      .limit(1)
    if (!current) throw new Error('contract not found')
    if (current.status === 'TERMINATED') throw new Error('cannot correct a TERMINATED contract')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== current.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity correction not allowed')
    }

    // Snapshot before-values for audit diff
    const oldValues = {
      employmentType:      current.employmentType,
      startDate:           current.startDate,
      endDate:             current.endDate,
      noticePeriodDays:    current.noticePeriodDays,
      workingHoursPerWeek: current.workingHoursPerWeek,
      workLocation:        current.workLocation,
      probationEnd:        current.probationEnd,
    }

    await tx
      .update(contracts)
      .set({
        employmentType:      data.employmentType      ?? current.employmentType,
        startDate:           data.startDate           ?? current.startDate,
        endDate:             data.endDate             ?? current.endDate,
        noticePeriodDays:    data.noticePeriodDays    ?? current.noticePeriodDays,
        workingHoursPerWeek: data.workingHoursPerWeek?.toString() ?? current.workingHoursPerWeek,
        workLocation:        data.workLocation        ?? current.workLocation,
        probationEnd:        data.probationEnd        !== undefined ? data.probationEnd : current.probationEnd,
        notes:               data.notes               ?? current.notes,
        actionMode:          'CORRECTION',
        correctsRowId:       null,
        updatedBy:           user.id,
        updatedByName:       user.name,
        updatedDate:         new Date(),
        lastUpdatedDate:     new Date(),
      })
      .where(eq(contracts.id, current.id))

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'CONTRACT.CORRECTED',
      resourceType:  'contracts',
      resourceId:    current.id,
      entityId:      current.legalEntityId,
      actionMode:    'CORRECTION',
      oldValues,
      newValues: {
        employmentType:      data.employmentType      ?? current.employmentType,
        startDate:           data.startDate           ?? current.startDate,
        endDate:             data.endDate             ?? current.endDate,
        noticePeriodDays:    data.noticePeriodDays    ?? current.noticePeriodDays,
        workingHoursPerWeek: data.workingHoursPerWeek ?? current.workingHoursPerWeek,
        workLocation:        data.workLocation        ?? current.workLocation,
        probationEnd:        data.probationEnd        !== undefined ? data.probationEnd : current.probationEnd,
      },
      metadata: { correctionNote: data.correctionNote },
    }, tx)
  })

  return { id: data.contractId }
  } catch (e) { translateError(e, 'correctContract') }
}

// (Pure helpers live in ./services.ts — imported there by employment-actions.)


================================================================================
FILE [P3-01/03/04]: modules/core-hr/contracts/services.ts
LINES: 16
================================================================================
/**
 * Contracts — pure helpers (no DB, no async). Sits alongside actions.ts so
 * the 'use server' file stays compliant with "every export must be async".
 */

/**
 * BR-NP-001 — derive notice period (days) from years of service.
 *  < 5 yrs   → 30
 *  5–10 yrs  → 60
 *  ≥ 10 yrs  → 90
 */
export function deriveNoticePeriodDays(yearsOfService: number): number {
  if (yearsOfService >= 10) return 90
  if (yearsOfService >= 5)  return 60
  return 30
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/contracts/validations.ts
LINES: 93
================================================================================
/**
 * Zod schemas for the contracts sub-module. Lives outside actions.ts so
 * the 'use server' file can satisfy "every export must be async".
 */
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

export const ContractTypeEnum   = z.enum(['FIXED_TERM']) // BR-CT-001
export const EmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED'])
export const WorkLocationEnum   = z.enum(['OFFICE', 'REMOTE', 'HYBRID', 'FIELD'])

export const CreateContractSchema = z.object({
  personId:        z.string().uuid(),
  legalEntityId:   z.string().uuid(),
  contractType:    ContractTypeEnum.default('FIXED_TERM'),
  employmentType:  EmploymentTypeEnum,
  startDate:       hrDateString(),
  endDate:         hrDateString(),
  probationStart:  hrDateString().optional(),
  probationEnd:    hrDateString().optional(),
  noticePeriodDays:    z.number().int().min(0).max(180).default(30),
  workingHoursPerWeek: z.number().min(1).max(48).default(48),
  workLocation:        WorkLocationEnum.default('OFFICE'),
  contractDocumentId:  z.string().uuid().optional(),
  notes:               z.string().max(2000).optional(),
}).superRefine((d, ctx) => {
  // BR-CT-002: contract term must not exceed 3 years from start_date.
  const start = new Date(d.startDate)
  const end   = new Date(d.endDate)
  if (end <= start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'endDate must be after startDate' })
  }
  const threeYears = new Date(start)
  threeYears.setFullYear(threeYears.getFullYear() + 3)
  if (end > threeYears) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'BR-CT-002: contract term exceeds 3 years' })
  }
  // BR-PR-001: probation period max 6 months from start_date.
  if (d.probationEnd) {
    const probEnd = new Date(d.probationEnd)
    const sixMonths = new Date(start)
    sixMonths.setMonth(sixMonths.getMonth() + 6)
    if (probEnd > sixMonths) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probationEnd'], message: 'BR-PR-001: probation exceeds 6 months' })
    }
    if (probEnd < start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probationEnd'], message: 'probationEnd cannot precede startDate' })
    }
  }
})
export type CreateContractInput = z.infer<typeof CreateContractSchema>

export const AmendContractSchema = z.object({
  contractId:     z.string().uuid(),
  effectiveDate:  hrDateString(),
  reason:         z.string().min(1).max(500),
  newEndDate:        hrDateString().optional(),
  newEmploymentType: EmploymentTypeEnum.optional(),
  newWorkingHoursPerWeek: z.number().min(1).max(48).optional(),
  newWorkLocation:        WorkLocationEnum.optional(),
  newNoticePeriodDays:    z.number().int().min(0).max(180).optional(),
  notes:             z.string().max(2000).optional(),
})
export type AmendContractInput = z.infer<typeof AmendContractSchema>

export const TerminateContractSchema = z.object({
  contractId:        z.string().uuid(),
  terminationDate:   hrDateString(),
  terminationReason: z.string().min(1).max(200),
  notes:             z.string().max(2000).optional(),
})
export type TerminateContractInput = z.infer<typeof TerminateContractSchema>

// CORRECTION — in-place fix of a data-entry error (HR_DIRECTOR / SUPER_ADMIN only)
export const CorrectContractSchema = z.object({
  contractId:          z.string().uuid(),
  correctionNote:      z.string().min(1).max(1000),
  // All fields below are optional — only corrected fields need to be supplied
  employmentType:      EmploymentTypeEnum.optional(),
  startDate:           hrDateString().optional(),
  endDate:             hrDateString().optional(),
  probationEnd:        hrDateString().nullable().optional(),
  noticePeriodDays:    z.number().int().min(0).max(180).optional(),
  workingHoursPerWeek: z.number().min(1).max(48).optional(),
  workLocation:        WorkLocationEnum.optional(),
  notes:               z.string().max(2000).optional(),
}).refine(d => {
  // At least one field to correct must be provided
  const fields = ['employmentType', 'startDate', 'endDate', 'probationEnd',
                  'noticePeriodDays', 'workingHoursPerWeek', 'workLocation', 'notes'] as const
  return fields.some(f => d[f] !== undefined)
}, { message: 'At least one field must be provided for correction' })
export type CorrectContractInput = z.infer<typeof CorrectContractSchema>


================================================================================
FILE [P3-01/03/04]: modules/core-hr/department-head.ts
LINES: 52
================================================================================
'use server'

/**
 * Department Head — workflow-actor data-availability helper.
 *
 * Read-only resolver that exposes a department's head so a FUTURE workflow
 * approver resolver can route to it without re-architecture. No routing
 * behaviour is implemented here. The returned personId resolves to the full
 * person record and, from there, to position / current worker_assignment —
 * satisfying the "resolvable to person → position → org assignment" requirement.
 *
 * Design note: departments.head_person_id is the denormalised "current head"
 * pointer. If effective-dated head history or delegation is needed later, add a
 * department_head_assignments side table (mirroring work_schedule_assignments)
 * without changing this read contract.
 */

import { db } from '@/lib/db'
import { departments, persons } from '@/drizzle/schema'
import { and, eq } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'

export interface DepartmentHead {
  departmentId: string
  personId:     string
  personName:   string
  personNumber: string
}

export async function getDepartmentHead(
  departmentId: string,
): Promise<DepartmentHead | null> {
  const [row] = await db
    .select({
      personId:     persons.id,
      personName:   persons.fullNameEn,
      personNumber: persons.personNumber,
    })
    .from(departments)
    .innerJoin(persons, eq(persons.id, departments.headPersonId))
    .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.id, departmentId)))
    .limit(1)

  if (!row) return null

  return {
    departmentId,
    personId:     row.personId,
    personName:   row.personName ?? '',
    personNumber: row.personNumber,
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/dependents/actions.ts
LINES: 119
================================================================================
'use server'

/**
 * S3-10 — Person dependents (with encrypted EID + passport).
 *
 * BR-INS-004 — max 9 active dependents per employee.
 * BR-INS-005 — child age cap 18 (or 25 if student); enforced at insurance enrolment.
 * Hard Rule 4: emirates_id and passport_number ciphertext only.
 *
 * Insurance auto-enrolment note: dependent is NOT automatically enrolled on add.
 * HR Admin must explicitly enrol via the insurance tab once the visa doc is uploaded.
 * This is intentional: dependent visa upload typically happens after the dependent record
 * is created, and BR-INS-002 blocks enrolment without a visa document.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, count } from 'drizzle-orm'
import { personDependents, persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { encryptNullable } from '@/lib/encryption'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import type { ActionMode } from '@/lib/action-mode'
import { requireCorrectionModePermission } from '@/modules/config/guards'
import { AddDependentSchema, type AddDependentInput } from './validations'

export async function addDependent(
  input: AddDependentInput,
  mode: ActionMode = 'UPDATE',
): Promise<{ id: string; dependentNumber: number }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  if (mode === 'CORRECTION') requireCorrectionModePermission(user.role)
  const data = AddDependentSchema.parse(input)

  let newId = ''
  let depNumber = 0

  await db.transaction(async tx => {
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, data.personId)).limit(1)
    if (!person) throw new Error('person not found')
    // QA-Audit-C2 — entity-scope gate.
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity dependent write denied')
    }

    // BR-INS-004 — max 9 active dependents.
    const [{ activeCount }] = await tx
      .select({ activeCount: count() })
      .from(personDependents)
      .where(and(
        eq(personDependents.tenantId, TENANT_ID),
        eq(personDependents.personId, data.personId),
      ))
    if (Number(activeCount) >= 9) {
      throw new Error('BR-INS-004: maximum 9 dependents per employee')
    }
    depNumber = Number(activeCount) + 1

    // Hard Rule 4 — encrypt before insert.
    const encEid      = encryptNullable(data.emiratesId)
    const encPassport = encryptNullable(data.passportNumber)

    const [row] = await tx
      .insert(personDependents)
      .values({
        tenantId:        TENANT_ID,
        personId:        data.personId,
        dependentNumber: depNumber,
        relationship:    data.relationship,
        firstNameEn:     data.firstNameEn,
        middleNameEn:    data.middleNameEn,
        lastNameEn:      data.lastNameEn,
        fullNameAr:      data.fullNameAr,
        dateOfBirth:     data.dateOfBirth,
        gender:          data.gender,
        nationalityCode: data.nationalityCode,
        emiratesId:        encEid,
        emiratesIdExpiry:  data.emiratesIdExpiry,
        passportNumber:    encPassport,
        passportCountry:   data.passportCountry,
        passportExpiry:    data.passportExpiry,
        effectiveFrom:   data.effectiveFrom,
        approvalStatus:  'PENDING',
        actionMode:      mode,
        createdBy:       user.id,
        createdByName:   user.name,
      })
      .returning({ id: personDependents.id })
    newId = row.id

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: person.legalEntityId,
      channel:       'WEB',
      eventType:     'DEPENDENT.ADDED',
      resourceType:  'person_dependents',
      resourceId:    newId,
      entityId:      person.legalEntityId,
      actionMode:    mode,
      newValues: {
        personId: data.personId,
        relationship: data.relationship,
        dependentNumber: depNumber,
        piiFields: [
          data.emiratesId      ? 'emiratesId'      : null,
          data.passportNumber  ? 'passportNumber'  : null,
        ].filter(Boolean),
      },
    }, tx)
  })

  return { id: newId, dependentNumber: depNumber }
  } catch (e) { translateError(e, 'addDependent') }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/dependents/validations.ts
LINES: 22
================================================================================
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'
import { EMIRATES_ID_REGEX } from '../validations'

export const AddDependentSchema = z.object({
  personId:        z.string().uuid(),
  relationship:    z.enum(['SPOUSE', 'CHILD', 'PARENT', 'PARENT_IN_LAW', 'SIBLING', 'OTHER']),
  firstNameEn:     z.string().min(1).max(100),
  middleNameEn:    z.string().max(100).optional(),
  lastNameEn:      z.string().min(1).max(100),
  fullNameAr:      z.string().min(1).max(300),
  dateOfBirth:     hrDateString(),
  gender:          z.enum(['MALE', 'FEMALE', 'NOT_SPECIFIED']),
  nationalityCode: z.string().regex(/^[A-Z]{3}$/),
  emiratesId:      z.string().regex(EMIRATES_ID_REGEX).optional(),
  emiratesIdExpiry: hrDateString().optional(),
  passportNumber:  z.string().min(6).max(20).optional(),
  passportCountry: z.string().regex(/^[A-Z]{3}$/).optional(),
  passportExpiry:  hrDateString().optional(),
  effectiveFrom:   hrDateString(),
})
export type AddDependentInput = z.infer<typeof AddDependentSchema>


================================================================================
FILE [P3-01/03/04]: modules/core-hr/documents/actions.ts
LINES: 798
================================================================================
'use server'

/**
 * S3-11 — Person document upload + retrieval.
 *
 * Two upload paths:
 *  uploadPersonDocument — HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN only
 *  uploadMyDocument     — EMPLOYEE only (self-upload, limited type set)
 *
 * Files go through lib/blob-storage.ts → Azure Blob (UAE North) and the
 * resulting storageKey, fileSizeBytes, mimeType, checksumSha256 land in
 * person_documents. Retrieval re-issues a 15-minute SAS URL each time so a
 * stale link can never leak.
 *
 * Document taxonomy is defined in lib/documents/document-types.ts — never
 * hardcode type lists here.
 */
import { translateError } from '@/lib/app-error'
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'
import { and, eq } from 'drizzle-orm'
import { personDocuments, persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { uploadDocument as blobUpload, deleteDocument as blobDelete } from '@/lib/blob-storage'
import { isLocalStorageActive, isPostgresStorageActive, getStorageProvider, getStorageUIState } from '@/lib/storage'
import {
  TENANT_ID, MAX_DOCUMENT_BYTES, ALLOWED_DOCUMENT_MIME_TYPES,
} from '@/lib/constants'
import {
  HR_UPLOADABLE_TYPES,
  EMPLOYEE_UPLOADABLE_TYPES,
  EMPLOYEE_VISIBLE_TYPES,
  getDocTypeCategory,
  computeDocumentStatus,
} from '@/lib/documents/document-types'

// ── Shared validation helpers ─────────────────────────────────────────────────

const UploadBaseSchema = z.object({
  personId:         z.string().uuid(),
  documentTitle:    z.string().min(1).max(200),
  documentNumber:   z.string().max(100).optional(),
  issuingAuthority: z.string().max(200).optional(),
  issuingCountry:   z.string().regex(/^[A-Z]{3}$/).optional(),
  issueDate:        hrDateString().optional(),
  expiryDate:       hrDateString().optional(),
  isMandatory:      z.boolean().default(false),
  notes:            z.string().max(2000).optional(),
})

const HrUploadSchema = UploadBaseSchema.extend({
  // HR_UPLOADABLE_TYPES now includes 'OTHER' via the taxonomy (legacy backward-compat entry)
  documentType:   z.string().refine(v => HR_UPLOADABLE_TYPES.includes(v), {
    message: 'Invalid document type for HR upload',
  }),
  hrOnlyVisibility: z.boolean().default(false),
})

const EmployeeUploadSchema = UploadBaseSchema.extend({
  documentType: z.string().refine(v => EMPLOYEE_UPLOADABLE_TYPES.includes(v), {
    message: 'This document type cannot be uploaded by employees',
  }),
})

// ── File validation helper ────────────────────────────────────────────────────

function validateFile(file: unknown): File {
  if (!(file instanceof File)) throw new Error('file is required')
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`File exceeds maximum size of ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`)
  }
  if (file.size === 0) throw new Error('file is empty')
  if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(
      `Unsupported file type (${file.type || 'unknown'}). Allowed: PDF, JPEG, PNG, WebP, DOCX.`,
    )
  }
  return file
}

// ── HR upload (HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN) ──────────────────────────

/**
 * Server Action — HR-side document upload.
 * Allows full HR_UPLOADABLE_TYPES taxonomy + 'OTHER' fallback.
 * Accepts FormData: file (binary) + metadata (JSON string).
 */
export async function uploadPersonDocument(
  formData: FormData,
): Promise<{ id: string; sasUrl: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const file     = validateFile(formData.get('file'))
    const rawMeta  = formData.get('metadata')
    if (typeof rawMeta !== 'string') throw new Error('metadata is required')

    let metadata: z.infer<typeof HrUploadSchema>
    try {
      metadata = HrUploadSchema.parse(JSON.parse(rawMeta))
    } catch {
      throw new Error('invalid metadata payload')
    }

    // Pre-flight: person exists + entity scope (before blob upload to avoid orphans)
    const [scopeRow] = await db
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, metadata.personId)).limit(1)
    if (!scopeRow) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== scopeRow.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity document upload denied')
    }

    const uploaded = await blobUpload({
      personId: metadata.personId,
      file,
      fileName: file.name,
      mimeType: file.type || undefined,
    })

    let newId = ''
    try {
      await db.transaction(async tx => {
        // TOCTOU defence: re-read inside transaction
        const [person] = await tx
          .select({ id: persons.id, legalEntityId: persons.legalEntityId })
          .from(persons).where(eq(persons.id, metadata.personId)).limit(1)
        if (!person) throw new Error('person not found')
        if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
          throw new Error('FORBIDDEN: cross-entity document upload denied')
        }

        const category = getDocTypeCategory(metadata.documentType)

        const [row] = await tx
          .insert(personDocuments)
          .values({
            tenantId:          TENANT_ID,
            personId:          metadata.personId,
            legalEntityId:     person.legalEntityId,
            documentType:      metadata.documentType,
            documentCategory:  category,
            documentTitle:     metadata.documentTitle,
            documentNumber:    metadata.documentNumber,
            issuingAuthority:  metadata.issuingAuthority,
            issuingCountry:    metadata.issuingCountry,
            issueDate:         metadata.issueDate,
            expiryDate:        metadata.expiryDate,
            isMandatory:       metadata.isMandatory,
            storageKey:        uploaded.storageKey,
            fileName:          uploaded.fileName,
            fileSizeBytes:     uploaded.fileSizeBytes,
            mimeType:          uploaded.mimeType,
            checksumSha256:    uploaded.checksumSha256,
            documentStatus:    'VALID',
            sourceType:        'HR',
            employeeCanReplace: false,
            hrOnlyVisibility:  metadata.hrOnlyVisibility ?? false,
            notes:             metadata.notes,
            createdBy:         user.id,
            createdByName:     user.name,
          })
          .returning({ id: personDocuments.id })
        newId = row.id

        await writeAuditLog({
          actorId:       user.id,
          actorName:     user.name,
          actorRole:     user.role,
          actorEntityId: person.legalEntityId,
          channel:       'WEB',
          eventType:     'DOCUMENT.UPLOADED',
          resourceType:  'person_documents',
          resourceId:    newId,
          entityId:      person.legalEntityId,
          newValues: {
            documentType:     metadata.documentType,
            documentCategory: category,
            documentTitle:    metadata.documentTitle,
            fileName:         uploaded.fileName,
            fileSizeBytes:    uploaded.fileSizeBytes,
            checksumSha256:   uploaded.checksumSha256,
            sourceType:       'HR',
          },
        }, tx)
      })
    } catch (err) {
      try { await blobDelete(uploaded.storageKey) } catch { /* best-effort cleanup */ }
      throw err
    }

    return { id: newId, sasUrl: uploaded.sasUrl }
  } catch (e) { translateError(e, 'uploadPersonDocument') }
}

// ── Employee self-upload (EMPLOYEE role only) ─────────────────────────────────

/**
 * Server Action — Employee self-upload from ESS.
 * Restricted to EMPLOYEE_UPLOADABLE_TYPES only (identity, personal, education, etc.).
 * Employee can only upload for their own personId.
 * sourceType is always set to 'EMPLOYEE'; employeeCanReplace = true.
 */
export async function uploadMyDocument(
  formData: FormData,
): Promise<{ id: string; sasUrl: string; isTemporaryStorage: boolean } | { error: string }> {
  try {
    // Guard: respect the storage mode.
    // 'not-configured' = durable mode required but no provider set → block upload.
    // 'disabled' = file ops explicitly disabled.
    // 'uat-temporary' = local/tmp storage — allowed with UAT warning shown in UI.
    // 'operational' = durable cloud provider active — full ops.
    const uiState = getStorageUIState()
    if (uiState === 'not-configured') {
      return {
        error:
          'Document storage is not configured for this environment. ' +
          'Upload is disabled until Azure Blob Storage or AWS S3 is configured. ' +
          'Contact your system administrator.',
      }
    }
    if (uiState === 'disabled') {
      return { error: 'Document file operations are disabled in this environment.' }
    }

    const isTemporary = isLocalStorageActive()
    if (isTemporary) {
      console.info(
        '[uploadMyDocument] Using local storage provider (developer mode). ' +
        'DOCUMENT_STORAGE_PROVIDER=local — files written to /tmp or public/uploads. ' +
        'Files are ephemeral and will be lost on server restart. ' +
        'Only suitable for local developer machines. ' +
        'Set DOCUMENT_STORAGE_PROVIDER=azure or aws for any shared environment.',
      )
    }

    const user = await requireRole(['EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const file    = validateFile(formData.get('file'))
    const rawMeta = formData.get('metadata')
    if (typeof rawMeta !== 'string') throw new Error('metadata is required')

    let metadata: z.infer<typeof EmployeeUploadSchema>
    try {
      metadata = EmployeeUploadSchema.parse(JSON.parse(rawMeta))
    } catch (e) {
      throw new Error(e instanceof z.ZodError ? e.errors[0]?.message ?? 'invalid metadata' : 'invalid metadata payload')
    }

    // EMPLOYEE role: enforce self-only upload (HR roles can call this on behalf of employees)
    if (user.role === 'EMPLOYEE') {
      if (!user.personId) throw new Error('Your employee profile is not linked. Contact HR.')
      if (user.personId !== metadata.personId) {
        throw new Error('FORBIDDEN: you may only upload documents for yourself')
      }
    }

    // Pre-flight: person exists + entity scope
    const [scopeRow] = await db
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, metadata.personId)).limit(1)
    if (!scopeRow) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'EMPLOYEE' && user.legalEntityId !== scopeRow.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity document upload denied')
    }

    const uploaded = await blobUpload({
      personId: metadata.personId,
      file,
      fileName: file.name,
      mimeType: file.type || undefined,
    })

    let newId = ''
    try {
      await db.transaction(async tx => {
        const [person] = await tx
          .select({ id: persons.id, legalEntityId: persons.legalEntityId })
          .from(persons).where(eq(persons.id, metadata.personId)).limit(1)
        if (!person) throw new Error('person not found')

        const category = getDocTypeCategory(metadata.documentType)

        const [row] = await tx
          .insert(personDocuments)
          .values({
            tenantId:          TENANT_ID,
            personId:          metadata.personId,
            legalEntityId:     person.legalEntityId,
            documentType:      metadata.documentType,
            documentCategory:  category,
            documentTitle:     metadata.documentTitle,
            documentNumber:    metadata.documentNumber,
            issuingAuthority:  metadata.issuingAuthority,
            issuingCountry:    metadata.issuingCountry,
            issueDate:         metadata.issueDate,
            expiryDate:        metadata.expiryDate,
            isMandatory:       false,
            storageKey:        uploaded.storageKey,
            fileName:          uploaded.fileName,
            fileSizeBytes:     uploaded.fileSizeBytes,
            mimeType:          uploaded.mimeType,
            checksumSha256:    uploaded.checksumSha256,
            documentStatus:    'VALID',
            sourceType:        'EMPLOYEE',
            employeeCanReplace: true,
            hrOnlyVisibility:  false,
            notes:             metadata.notes,
            createdBy:         user.id,
            createdByName:     user.name,
          })
          .returning({ id: personDocuments.id })
        newId = row.id

        await writeAuditLog({
          actorId:       user.id,
          actorName:     user.name,
          actorRole:     user.role,
          actorEntityId: person.legalEntityId,
          channel:       'WEB',
          eventType:     'DOCUMENT.SELF_UPLOADED',
          resourceType:  'person_documents',
          resourceId:    newId,
          entityId:      person.legalEntityId,
          newValues: {
            documentType:     metadata.documentType,
            documentCategory: category,
            documentTitle:    metadata.documentTitle,
            fileName:         uploaded.fileName,
            fileSizeBytes:    uploaded.fileSizeBytes,
            checksumSha256:   uploaded.checksumSha256,
            sourceType:       'EMPLOYEE',
          },
        }, tx)
      })
    } catch (err) {
      try { await blobDelete(uploaded.storageKey) } catch { /* best-effort cleanup */ }
      throw err
    }

    return { id: newId, sasUrl: uploaded.sasUrl, isTemporaryStorage: isTemporary }
  } catch (e) {
    // Return an error object rather than throwing.
    // In production Next.js 15, Server Action throws are sanitized to a generic
    // "An error occurred in the Server Components render" before reaching the
    // client — the real message is lost. Returning { error } keeps it intact.
    const msg = e instanceof Error ? e.message : 'Upload failed. Please try again.'
    console.error('[uploadMyDocument]', msg, e)
    return { error: msg }
  }
}

// ── Document access result type ───────────────────────────────────────────────

/** Error codes returned when document access fails. */
export type DocumentAccessErrorCode =
  | 'FILE_MISSING'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'STORAGE_MISCONFIGURED'
  | 'SIGNED_URL_FAILED'

/**
 * Result of getDocumentUrl — either a secure serve URL or a typed error.
 * The URL points to /api/documents/[id] which handles auth + delivery.
 */
export type DocumentUrlResult =
  | { url: string }
  | { error: string; code: DocumentAccessErrorCode }

// ── SAS URL retrieval (all roles) ─────────────────────────────────────────────

/**
 * Authorises access to a document and returns the secure serve URL.
 *
 * The returned URL is /api/documents/[id] — an authenticated route that handles
 * provider-specific delivery: redirect for cloud (Azure/AWS), filesystem stream
 * for local /tmp (UAT on Vercel).  This design means:
 *  - No raw signed URLs are ever sent to the client
 *  - /tmp files on Vercel can be served (streamed through the API route)
 *  - File existence is pre-checked for local provider to give inline UI errors
 *
 * Download tracking (download_count, last_viewed_at) is updated by the API route
 * when the file is actually served, not here.
 */
export async function getDocumentUrl(
  documentId: string,
): Promise<DocumentUrlResult> {
  try {
    const user = await requireRole([
      'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN',
    ])

    const [row] = await db
      .select({
        id:               personDocuments.id,
        personId:         personDocuments.personId,
        legalEntityId:    personDocuments.legalEntityId,
        storageKey:       personDocuments.storageKey,
        hrOnlyVisibility: personDocuments.hrOnlyVisibility,
      })
      .from(personDocuments)
      .where(and(
        eq(personDocuments.tenantId, TENANT_ID),
        eq(personDocuments.id, documentId),
      ))
      .limit(1)

    if (!row) return { error: 'Document not found.', code: 'NOT_FOUND' }

    // EMPLOYEE: self-only access
    if (user.role === 'EMPLOYEE' && user.personId !== row.personId) {
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: user.legalEntityId ?? '', channel: 'WEB',
        eventType: 'DOCUMENT.ACCESS_DENIED', resourceType: 'person_documents',
        resourceId: documentId, entityId: row.legalEntityId,
        metadata: { failureReason: 'UNAUTHORIZED' },
      })
      return { error: 'You do not have permission to access this document.', code: 'UNAUTHORIZED' }
    }
    // EMPLOYEE: cannot see HR-only documents
    if (user.role === 'EMPLOYEE' && row.hrOnlyVisibility) {
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: user.legalEntityId ?? '', channel: 'WEB',
        eventType: 'DOCUMENT.ACCESS_DENIED', resourceType: 'person_documents',
        resourceId: documentId, entityId: row.legalEntityId,
        metadata: { failureReason: 'UNAUTHORIZED' },
      })
      return { error: 'You do not have permission to access this document.', code: 'UNAUTHORIZED' }
    }
    // Cross-entity check for HR roles
    const isSelfDoc = user.personId === row.personId
    if (
      user.role !== 'SUPER_ADMIN'
      && !isSelfDoc
      && user.legalEntityId !== row.legalEntityId
    ) {
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: user.legalEntityId ?? '', channel: 'WEB',
        eventType: 'DOCUMENT.ACCESS_DENIED', resourceType: 'person_documents',
        resourceId: documentId, entityId: row.legalEntityId,
        metadata: { failureReason: 'UNAUTHORIZED' },
      })
      return { error: 'You do not have permission to access this document.', code: 'UNAUTHORIZED' }
    }

    if (!row.storageKey) {
      return { error: 'No file attached to this document.', code: 'NOT_FOUND' }
    }

    // Pre-flight file existence check for local (/tmp) and durable Postgres
    // providers.  Both expose a cheap fileExists — local is a stat, Postgres is
    // a single-row SELECT — so the user sees an inline error instead of a blank
    // tab when the bytes are absent.  Skipped for cloud providers (the API route
    // does its own existence check before issuing a signed URL).
    const localActive    = isLocalStorageActive()
    const postgresActive = isPostgresStorageActive()
    if (localActive || postgresActive) {
      const exists = await getStorageProvider().fileExists(row.storageKey).catch(() => true)
      if (!exists) {
        await writeAuditLog({
          actorId: user.id, actorName: user.name, actorRole: user.role,
          actorEntityId: row.legalEntityId, channel: 'WEB',
          eventType: 'DOCUMENT.ACCESS_DENIED', resourceType: 'person_documents',
          resourceId: documentId, entityId: row.legalEntityId,
          metadata: { failureReason: 'FILE_MISSING' },
        })
        return {
          error: postgresActive
            ? 'The file bytes for this document were not found in storage. Please re-upload the document.'
            : 'Temporary UAT file is unavailable — it may have been lost due to serverless container isolation or after redeployment. Please re-upload to continue testing.',
          code: 'FILE_MISSING',
        }
      }
    }

    // Access authorised — log and return the secure API endpoint URL.
    // The API route performs defence-in-depth auth + handles provider-specific
    // delivery (stream for /tmp, redirect for cloud).
    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: row.legalEntityId,
      channel:       'WEB',
      eventType:     'DOCUMENT.URL_ISSUED',
      resourceType:  'person_documents',
      resourceId:    row.id,
      entityId:      row.legalEntityId,
      metadata:      { ttlMinutes: 5 },
    })

    return { url: `/api/documents/${documentId}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to retrieve document.'
    console.error('[getDocumentUrl]', msg, e)
    return { error: msg, code: 'STORAGE_MISCONFIGURED' }
  }
}

// ── List documents for a person (with filtering) ──────────────────────────────

export interface PersonDocumentRow {
  id:               string
  documentType:     string
  documentCategory: string | null
  documentTitle:    string
  documentNumber:   string | null
  fileName:         string | null
  fileSizeBytes:    number
  mimeType:         string | null
  issueDate:        string | null
  expiryDate:       string | null
  isMandatory:      boolean
  documentStatus:   string
  sourceType:       string
  employeeCanReplace: boolean
  hrOnlyVisibility: boolean
  downloadCount:    number
  createdByName:    string | null
  createdDate:      string | null
  hasFile:          boolean
}

export async function listPersonDocuments(
  personId: string,
): Promise<PersonDocumentRow[]> {
  try {
    const user = await requireRole([
      'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN',
    ])

    // EMPLOYEE: self-only
    if (user.role === 'EMPLOYEE' && user.personId !== personId) {
      throw new Error('FORBIDDEN: employees may only list their own documents')
    }

    // Entity scope for HR roles
    if (!['SUPER_ADMIN', 'EMPLOYEE'].includes(user.role)) {
      const [person] = await db
        .select({ legalEntityId: persons.legalEntityId })
        .from(persons).where(eq(persons.id, personId)).limit(1)
      if (person && person.legalEntityId !== user.legalEntityId) {
        throw new Error('FORBIDDEN: cross-entity access denied')
      }
    }

    const isEmployee = user.role === 'EMPLOYEE'
    const rows = await db
      .select({
        id:               personDocuments.id,
        documentType:     personDocuments.documentType,
        documentCategory: personDocuments.documentCategory,
        documentTitle:    personDocuments.documentTitle,
        documentNumber:   personDocuments.documentNumber,
        fileName:         personDocuments.fileName,
        fileSizeBytes:    personDocuments.fileSizeBytes,
        mimeType:         personDocuments.mimeType,
        issueDate:        personDocuments.issueDate,
        expiryDate:       personDocuments.expiryDate,
        isMandatory:      personDocuments.isMandatory,
        documentStatus:   personDocuments.documentStatus,
        sourceType:       personDocuments.sourceType,
        employeeCanReplace: personDocuments.employeeCanReplace,
        hrOnlyVisibility: personDocuments.hrOnlyVisibility,
        downloadCount:    personDocuments.downloadCount,
        createdByName:    personDocuments.createdByName,
        createdDate:      personDocuments.createdDate,
        storageKey:       personDocuments.storageKey,
      })
      .from(personDocuments)
      .where(and(
        eq(personDocuments.tenantId, TENANT_ID),
        eq(personDocuments.personId, personId),
        // Employees cannot see HR-only documents
        ...(isEmployee ? [eq(personDocuments.hrOnlyVisibility, false)] : []),
      ))
      .orderBy(personDocuments.createdDate)

    return rows.map(r => ({
      ...r,
      fileSizeBytes:  Number(r.fileSizeBytes ?? 0),
      downloadCount:  Number(r.downloadCount ?? 0),
      issueDate:      r.issueDate ?? null,
      expiryDate:     r.expiryDate ?? null,
      createdDate:    r.createdDate?.toISOString() ?? null,
      hasFile:        !!r.storageKey,
    }))
  } catch (e) {
    // Return empty list on error — same safe-default pattern as BUG-NAV-001.
    // translateError re-throws as AppError which crashes the calling Server Component.
    console.error('[listPersonDocuments]', e instanceof Error ? e.message : e)
    return []
  }
}

// ── Employee self-service: edit document metadata ─────────────────────────────

const UpdateMyDocSchema = z.object({
  documentTitle:  z.string().min(1).max(200),
  documentNumber: z.string().max(100).optional().nullable(),
  issueDate:      hrDateString().optional().nullable(),
  expiryDate:     hrDateString().optional().nullable(),
  notes:          z.string().max(2000).optional().nullable(),
})

export type UpdateMyDocumentInput = z.infer<typeof UpdateMyDocSchema>

/**
 * Server Action — employee edits the metadata of one of their own self-uploaded
 * documents (title, document number, issue/start date, expiry/end date, notes).
 *
 * Guard: EMPLOYEE may only edit documents where personId == own personId AND
 * sourceType == 'EMPLOYEE' AND employeeCanReplace == true.  HR-uploaded docs
 * (contracts, warning letters, etc.) are never editable by the employee.
 *
 * Returns { success: true } or { error } — never throws (Next.js 15 sanitises
 * Server Action throws in production).
 */
export async function updateMyDocumentMeta(
  documentId: string,
  input:      UpdateMyDocumentInput,
): Promise<{ success: true } | { error: string }> {
  try {
    const user = await requireRole(['EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    let data: UpdateMyDocumentInput
    try {
      data = UpdateMyDocSchema.parse(input)
    } catch (e) {
      return { error: e instanceof z.ZodError ? (e.errors[0]?.message ?? 'Invalid input') : 'Invalid input' }
    }

    const [row] = await db
      .select({
        id:                 personDocuments.id,
        personId:           personDocuments.personId,
        legalEntityId:      personDocuments.legalEntityId,
        sourceType:         personDocuments.sourceType,
        employeeCanReplace: personDocuments.employeeCanReplace,
        documentStatus:     personDocuments.documentStatus,
      })
      .from(personDocuments)
      .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.id, documentId)))
      .limit(1)

    if (!row) return { error: 'Document not found.' }

    // Ownership + editability gate.
    if (user.role === 'EMPLOYEE') {
      if (user.personId !== row.personId) {
        return { error: 'You can only edit your own documents.' }
      }
      if (!(row.sourceType === 'EMPLOYEE' && row.employeeCanReplace)) {
        return { error: 'This document was added by HR and cannot be edited here. Please contact HR.' }
      }
    } else if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== row.legalEntityId) {
      return { error: 'You do not have permission to edit this document.' }
    }

    // Recompute the stored status from the (possibly changed) expiry date.
    const newStatus = computeDocumentStatus(row.documentStatus ?? 'VALID', data.expiryDate ?? null)

    await db.transaction(async tx => {
      await tx
        .update(personDocuments)
        .set({
          documentTitle:   data.documentTitle,
          documentNumber:  data.documentNumber ?? null,
          issueDate:       data.issueDate ?? null,
          expiryDate:      data.expiryDate ?? null,
          notes:           data.notes ?? null,
          documentStatus:  newStatus,
          updatedBy:       user.id,
          updatedByName:   user.name,
          lastUpdatedDate: new Date(),
          updatedDate:     new Date(),
        })
        .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.id, documentId)))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: row.legalEntityId,
        channel:       'WEB',
        eventType:     'DOCUMENT.METADATA_UPDATED',
        resourceType:  'person_documents',
        resourceId:    documentId,
        entityId:      row.legalEntityId,
        newValues: {
          documentTitle:  data.documentTitle,
          documentNumber: data.documentNumber ?? null,
          issueDate:      data.issueDate ?? null,
          expiryDate:     data.expiryDate ?? null,
          documentStatus: newStatus,
        },
      }, tx)
    })

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update document.'
    console.error('[updateMyDocumentMeta]', msg, e)
    return { error: msg }
  }
}

// ── Employee self-service: delete a self-uploaded document ────────────────────

/**
 * Server Action — employee deletes one of their own self-uploaded documents
 * (e.g. a wrong file uploaded by mistake), so they can re-upload the correct one.
 *
 * Guard: identical to updateMyDocumentMeta — EMPLOYEE self-only, sourceType
 * 'EMPLOYEE', employeeCanReplace true.  HR-uploaded docs are never deletable here.
 *
 * The person_documents row is removed inside a transaction with a
 * DOCUMENT.DELETED audit entry that captures the deleted metadata (permanent
 * record of the deletion).  The backing file bytes are removed best-effort after
 * commit via the active storage provider (PostgreSQL row / Azure blob / S3 / tmp).
 */
export async function deleteMyDocument(
  documentId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const user = await requireRole(['EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [row] = await db
      .select({
        id:                 personDocuments.id,
        personId:           personDocuments.personId,
        legalEntityId:      personDocuments.legalEntityId,
        sourceType:         personDocuments.sourceType,
        employeeCanReplace: personDocuments.employeeCanReplace,
        documentType:       personDocuments.documentType,
        documentTitle:      personDocuments.documentTitle,
        storageKey:         personDocuments.storageKey,
      })
      .from(personDocuments)
      .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.id, documentId)))
      .limit(1)

    if (!row) return { error: 'Document not found.' }

    if (user.role === 'EMPLOYEE') {
      if (user.personId !== row.personId) {
        return { error: 'You can only delete your own documents.' }
      }
      if (!(row.sourceType === 'EMPLOYEE' && row.employeeCanReplace)) {
        return { error: 'This document was added by HR and cannot be deleted here. Please contact HR.' }
      }
    } else if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== row.legalEntityId) {
      return { error: 'You do not have permission to delete this document.' }
    }

    await db.transaction(async tx => {
      await tx
        .delete(personDocuments)
        .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.id, documentId)))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: row.legalEntityId,
        channel:       'WEB',
        eventType:     'DOCUMENT.DELETED',
        resourceType:  'person_documents',
        resourceId:    documentId,
        entityId:      row.legalEntityId,
        // Permanent record of what was deleted (storageKey, not file content).
        newValues: {
          documentType:  row.documentType,
          documentTitle: row.documentTitle,
          storageKey:    row.storageKey,
          deletedBy:     user.role,
        },
      }, tx)
    })

    // Best-effort removal of the backing file bytes after the row is gone.
    if (row.storageKey) {
      try { await blobDelete(row.storageKey) } catch { /* orphaned bytes are harmless */ }
    }

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete document.'
    console.error('[deleteMyDocument]', msg, e)
    return { error: msg }
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/edit-person.ts
LINES: 211
================================================================================
'use server'

/**
 * edit-person — dedicated server action for the Edit Person form.
 *
 * Follows the four-step contract:
 *   1. requireRole(...)               — auth + RBAC
 *   2. EditPersonSchema.parse(input)  — Zod validation
 *   3. db.transaction(async tx => ...)
 *   4. writeAuditLog inside the same transaction (Hard Rule 1)
 *
 * PII: emiratesId and passportNumber are encrypted before storage (Hard Rule 4).
 * NEVER delete persons (Hard Rule 3 — not applicable here, but noted).
 */

import { translateError } from '@/lib/app-error'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { encryptNullable } from '@/lib/encryption'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { normalizeEmiratesId, EMIRATES_ID_REGEX } from './validations'

// ══════════════════════════════════════════════════════════════════════════
// Zod schema — field names match drizzle column camelCase exactly.
// All fields are optional; only supplied fields are written to DB.
// ══════════════════════════════════════════════════════════════════════════

const EditPersonSchema = z.object({
  // Identity — names
  firstNameEn:       z.string().min(1).max(100).optional(),
  lastNameEn:        z.string().min(1).max(100).optional(),
  fullNameEn:        z.string().min(1).max(200).optional(),
  fullNameAr:        z.string().max(200).optional(),
  preferredName:     z.string().max(100).optional(),

  // Personal details
  dateOfBirth:       z.string().optional(),   // ISO date string 'YYYY-MM-DD'
  gender:            z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  maritalStatus:     z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  nationalityCode:   z.string().length(3).optional(),  // ISO 3166-1 alpha-3 (e.g. ARE, GBR)

  // PII — encrypted before storage
  emiratesId:        z.string().regex(EMIRATES_ID_REGEX, 'BR-EID-001 format 784-XXXX-XXXXXXX-X').optional().nullable(),
  emiratesIdExpiry:  z.string().optional().nullable(),  // ISO date string
  passportNumber:    z.string().max(20).optional().nullable(),
  passportExpiry:    z.string().optional().nullable(),  // ISO date string

  // Visa / labour card
  visaNumber:           z.string().max(30).optional().nullable(),
  visaExpiry:           z.string().optional().nullable(),
  labourCardNumber:     z.string().max(30).optional().nullable(),
  labourCardExpiry:     z.string().optional().nullable(),

  // Assignment snapshot (denormalised on persons row)
  assignmentStatus:     z.string().optional(),
  currentDepartmentId:  z.string().uuid().optional().nullable(),
  currentPositionId:    z.string().uuid().optional().nullable(),
  currentGradeId:       z.string().uuid().optional().nullable(),
  currentLocationId:    z.string().uuid().optional().nullable(),
  lineManagerId:        z.string().uuid().optional().nullable(),
  // Task 2C — employment classification fields
  workerCategory:          z.enum(['FTE', 'CONTINGENT', 'CONTRACTOR']).optional().nullable(),
  employeeCode:            z.string().trim().max(50).optional().nullable(),
  currentJobId:            z.string().uuid().optional().nullable(),
  dottedLineManagerId:     z.string().uuid().optional().nullable(),
  noticePeriodDays:        z.number().int().min(0).max(180).optional(),
  probationMonthsGranted:  z.number().int().min(1).max(6).optional().nullable(),
})

export type EditPersonInput = z.infer<typeof EditPersonSchema>

// ══════════════════════════════════════════════════════════════════════════
// Result type
// ══════════════════════════════════════════════════════════════════════════

export type EditPersonResult =
  | { success: true;  personId: string }
  | { success: false; error: string }

// ══════════════════════════════════════════════════════════════════════════
// Server action
// ══════════════════════════════════════════════════════════════════════════

export async function updatePersonFromEdit(
  personId: string,
  rawInput: EditPersonInput,
): Promise<EditPersonResult> {
  try {
  // Step 1 — Auth + RBAC (must be first, before any DB op).
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'FORBIDDEN' }
  }

  // Step 2 — Zod validation.
  const parsed = EditPersonSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
    }
  }
  const data = parsed.data

  // Guard: nothing to update.
  if (Object.keys(data).length === 0) {
    return { success: false, error: 'No fields supplied for update' }
  }

  try {
    await db.transaction(async tx => {
      // Step 3 — Build update payload from only the supplied fields.
      // We never overwrite missing fields with undefined/null accidentally.
      const payload: Record<string, unknown> = {}

      if (data.firstNameEn      !== undefined) payload.firstNameEn      = data.firstNameEn
      if (data.lastNameEn       !== undefined) payload.lastNameEn       = data.lastNameEn
      if (data.fullNameEn       !== undefined) payload.fullNameEn       = data.fullNameEn
      if (data.fullNameAr       !== undefined) payload.fullNameAr       = data.fullNameAr
      if (data.preferredName    !== undefined) payload.preferredName    = data.preferredName
      if (data.dateOfBirth      !== undefined) payload.dateOfBirth      = data.dateOfBirth
      if (data.gender           !== undefined) payload.gender           = data.gender
      if (data.maritalStatus    !== undefined) payload.maritalStatus    = data.maritalStatus
      if (data.nationalityCode  !== undefined) payload.nationalityCode  = data.nationalityCode

      // PII — normalized then encrypted (Hard Rule 4).
      // QA-Audit-M7: normalize EID to canonical dashed form before encrypt.
      if (data.emiratesId !== undefined) {
        payload.emiratesId = encryptNullable(
          data.emiratesId ? normalizeEmiratesId(data.emiratesId) : data.emiratesId,
        )
      }
      if (data.emiratesIdExpiry !== undefined) payload.emiratesIdExpiry = data.emiratesIdExpiry
      if (data.passportNumber   !== undefined) payload.passportNumber   = encryptNullable(data.passportNumber)
      if (data.passportExpiry   !== undefined) payload.passportExpiry   = data.passportExpiry

      if (data.visaNumber         !== undefined) payload.visaNumber         = data.visaNumber
      if (data.visaExpiry         !== undefined) payload.visaExpiry         = data.visaExpiry
      if (data.labourCardNumber   !== undefined) payload.labourCardNumber   = data.labourCardNumber
      if (data.labourCardExpiry   !== undefined) payload.labourCardExpiry   = data.labourCardExpiry

      if (data.assignmentStatus    !== undefined) payload.assignmentStatus    = data.assignmentStatus
      if (data.currentDepartmentId !== undefined) payload.currentDepartmentId = data.currentDepartmentId
      if (data.currentPositionId   !== undefined) payload.currentPositionId   = data.currentPositionId
      if (data.currentGradeId      !== undefined) payload.currentGradeId      = data.currentGradeId
      if (data.currentLocationId   !== undefined) payload.currentLocationId   = data.currentLocationId
      if (data.lineManagerId       !== undefined) payload.lineManagerId       = data.lineManagerId
      // Task 2C — employment classification fields
      if (data.workerCategory         !== undefined) payload.workerCategory         = data.workerCategory
      if (data.employeeCode           !== undefined) payload.employeeCode           = data.employeeCode
      if (data.currentJobId           !== undefined) payload.currentJobId           = data.currentJobId
      if (data.dottedLineManagerId    !== undefined) payload.dottedLineManagerId    = data.dottedLineManagerId
      if (data.noticePeriodDays       !== undefined) payload.noticePeriodDays       = data.noticePeriodDays
      if (data.probationMonthsGranted !== undefined) payload.probationMonthsGranted = data.probationMonthsGranted

      // WHO columns — always touch on any write.
      payload.updatedBy     = user.id
      payload.updatedByName = user.name ?? user.id
      payload.updatedDate   = new Date()

      await tx
        .update(persons)
        .set(payload)
        .where(and(eq(persons.id, personId), eq(persons.tenantId, TENANT_ID)))

      // Step 4 — Audit row in the SAME transaction (Hard Rule 1).
      // NEVER write decrypted PII to audit_log — record only the field names touched.
      const touchedFields = Object.keys(data)
      const piiTouched = touchedFields.filter(f => ['emiratesId', 'passportNumber'].includes(f))
      const nonPiiChanged = touchedFields.filter(f => !['emiratesId', 'passportNumber'].includes(f))

      await writeAuditLog(
        {
          actorId:   user.id,
          actorName: user.name,
          actorRole: user.role,
          channel:   'WEB',
          eventType: 'PERSON.UPDATED',
          resourceType: 'persons',
          resourceId:   personId,
          changedFields: touchedFields,
          newValues: {
            // Safe non-PII fields only.
            ...Object.fromEntries(
              nonPiiChanged.map(f => [f, (data as Record<string, unknown>)[f]]),
            ),
            // Mark which PII fields were touched without storing their values.
            ...(piiTouched.length > 0 ? { piiFieldsTouched: piiTouched } : {}),
          },
          description: `Person record updated (${touchedFields.length} field(s) changed)`,
        },
        tx,
      )
    })

    return { success: true, personId }
  } catch (err) {
    console.error('[edit-person] updatePersonFromEdit error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error during person update',
    }
  }
  } catch (e) { translateError(e, 'updatePersonFromEdit') }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/employment-actions/actions.ts
LINES: 408
================================================================================
'use server'

/**
 * S3-06 — Employment-action Server Actions.
 *
 * Each public action records ONE row in `employment_actions` (immutable
 * before/after snapshot) AND closes-current+opens-new on
 * `worker_assignments` (effective-dated). Per QA-Audit-C3 every action runs
 * BOTH writes inside a SINGLE Drizzle transaction so the audit trail can
 * never desync from the assignment table.
 *
 * Per QA-Audit-H1 every public Server Action runs the corresponding Zod
 * schema's .parse() on its input — TypeScript types are not enforced at
 * the wire boundary.
 *
 * Public actions:
 *   • hire        — initial assignment + employment_action(HIRE)
 *   • transfer    — department / location change → TRANSFER
 *   • promotion   — grade / position upward change → PROMOTION
 *   • gradeChange — generic grade move (up or down) → PROMOTION/DEMOTION
 *
 * BR-NP-001 — when a TRANSFER results in service crossing 5/10 years,
 *             persons.notice_period_days is recomputed.
 */
import { translateError } from '@/lib/app-error'
import { and, eq } from 'drizzle-orm'
import {
  employmentActions, workerAssignments, persons, grades,
} from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole, type SessionUser } from '@/lib/auth'
import { isFutureDated, yearsOfService } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import {
  createAssignmentTx, changeAssignmentTx,
} from '../worker-assignments/services'
import { deriveNoticePeriodDays } from '../contracts/services'
import {
  HireSchema, TransferSchema, PromotionSchema, GradeChangeSchema,
  type HireInput, type TransferInput, type PromotionInput, type GradeChangeInput,
} from './validations'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function actorOf(user: SessionUser) {
  return {
    id:            user.id,
    name:          user.name,
    role:          user.role,
    personId:      user.personId,
    legalEntityId: user.legalEntityId,
  }
}

// ── Hire ───────────────────────────────────────────────────────────────────

export async function hire(input: HireInput): Promise<{ assignmentId: string; actionId: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = HireSchema.parse(input)

  return await db.transaction(async tx => {
    // QA-Audit-C2 — entity scope.
    const [person] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
      .limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity hire not allowed')
    }
    if (data.legalEntityId !== person.legalEntityId) {
      throw new Error('legalEntityId must match the person\'s entity')
    }

    // 1) Open the worker_assignment row (Hard Rule 3 — fails if one exists).
    const { id: assignmentId } = await createAssignmentTx(tx, actorOf(user), {
      personId:           data.personId,
      legalEntityId:      data.legalEntityId,
      effectiveStartDate: data.effectiveStartDate,
      positionId:         data.positionId,
      jobId:              data.jobId,
      departmentId:       data.departmentId,
      locationId:         data.locationId,
      gradeId:            data.gradeId,
      businessUnitId:     data.businessUnitId,
      lineManagerId:      data.lineManagerId,
      employmentType:     data.employmentType,
      contractedHoursPerWeek: data.contractedHoursPerWeek,
      actionType:         'HIRE',
      actionReason:       data.reasonText,
    })

    // 2) Record the employment_action (immutable before/after snapshot).
    const [actionRow] = await tx
      .insert(employmentActions)
      .values({
        tenantId:        TENANT_ID,
        personId:        data.personId,
        legalEntityId:   data.legalEntityId,
        assignmentId,
        actionType:      'HIRE',
        actionDate:      data.effectiveStartDate,
        effectiveDate:   data.effectiveStartDate,
        reasonCode:      'NEW_HIRE',
        reasonText:      data.reasonText,
        afterDepartmentId: data.departmentId,
        afterPositionId:   data.positionId,
        afterGradeId:      data.gradeId,
        afterLocationId:   data.locationId,
        afterEmploymentType: data.employmentType,
        afterStatus:       'ACTIVE',
        initiatedBy:       user.personId ?? user.id,
        approvedBy:        user.personId ?? user.id,
        approvalDate:      data.effectiveStartDate,
        status:            'APPROVED',
        createdBy:         user.id,
        createdByName:     user.name,
      })
      .returning({ id: employmentActions.id })

    // 3) Sync persons.* denormalised pointers.
    await tx
      .update(persons)
      .set({
        assignmentStatus:    'ACTIVE',
        currentDepartmentId: data.departmentId,
        currentPositionId:   data.positionId,
        currentJobId:        data.jobId,
        currentLocationId:   data.locationId,
        currentGradeId:      data.gradeId,
        lineManagerId:       data.lineManagerId,
        updatedBy:           user.id,
        updatedByName:       user.name,
        updatedDate:         new Date(),
        lastUpdatedDate:     new Date(),
      })
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))

    // 4) Audit row in same tx (Hard Rule 1).
    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: data.legalEntityId,
      channel:       'WEB',
      eventType:     'EMPLOYMENT_ACTION.HIRE',
      resourceType:  'employment_actions',
      resourceId:    actionRow.id,
      entityId:      data.legalEntityId,
      newValues: {
        actionType:    'HIRE',
        personId:      data.personId,
        departmentId:  data.departmentId,
        effectiveDate: data.effectiveStartDate,
      },
    }, tx)

    return { assignmentId, actionId: actionRow.id }
  })
  } catch (e) { translateError(e, 'hire') }
}

// ── Transfer ──────────────────────────────────────────────────────────────

export async function transfer(input: TransferInput): Promise<{ assignmentId: string; actionId: string }> {
  try {
  // QA-Audit-H1 — explicit Zod parse at the wire boundary.
  const data = TransferSchema.parse(input)
  return await runLifecycleChange('TRANSFER', data.personId, data.effectiveDate, data.reasonText, {
    departmentId:        data.newDepartmentId,
    locationId:          data.newLocationId,
    businessUnitId:      data.newBusinessUnitId,
    lineManagerId:       data.newLineManagerId,
    projectId:           data.newProjectId,
    projectAllocationPct: data.newProjectAllocationPct,
  })
  } catch (e) { translateError(e, 'transfer') }
}

// ── Promotion ─────────────────────────────────────────────────────────────

export async function promotion(input: PromotionInput): Promise<{ assignmentId: string; actionId: string }> {
  try {
  const data = PromotionSchema.parse(input)
  return await runGradeChange(data.personId, data.effectiveDate, data.reasonText, {
    newGradeId:    data.newGradeId,
    newPositionId: data.newPositionId,
    newJobId:      data.newJobId,
  })
  } catch (e) { translateError(e, 'promotion') }
}

// ── Generic grade change (auto PROMOTION vs DEMOTION) ────────────────────

export async function gradeChange(input: GradeChangeInput): Promise<{ assignmentId: string; actionId: string }> {
  try {
  const data = GradeChangeSchema.parse(input)
  return await runGradeChange(data.personId, data.effectiveDate, data.reasonText, {
    newGradeId: data.newGradeId,
  })
  } catch (e) { translateError(e, 'gradeChange') }
}

// ══════════════════════════════════════════════════════════════════════════
// Internal helpers — shared across transfer / promotion / grade-change.
// All DB work runs in ONE transaction (QA-Audit-C3).
// ══════════════════════════════════════════════════════════════════════════

interface AssignmentChange {
  positionId?:    string
  jobId?:         string
  departmentId?:  string
  locationId?:    string
  gradeId?:       string
  businessUnitId?: string
  lineManagerId?:  string
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'TEMPORARY' | 'TASK_BASED' | 'FLEXIBLE' | 'REMOTE' | 'SHARED'
  // BR-PRJ-001: project cost-centre assignment
  projectId?:              string
  projectAllocationPct?:   number
}

async function runLifecycleChange(
  actionType: 'TRANSFER' | 'PROMOTION' | 'DEMOTION',
  personId:   string,
  effectiveDate: string,
  reason:     string,
  delta:      AssignmentChange,
): Promise<{ assignmentId: string; actionId: string }> {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  return await db.transaction(async tx => {
    const [person] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
      .limit(1)
    if (!person) throw new Error('person not found')

    // QA-Audit-C2 — entity scope.
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity lifecycle action not allowed')
    }

    // BR-ED-001: future-effective lifecycle changes must stay pending until
    // their effective date; current/today-or-past changes apply immediately.
    const assignmentMode = isFutureDated(effectiveDate) ? 'FUTURE_DATED' : 'UPDATE'

    // changeAssignmentTx fetches the current row and applies the requested
    // effective-dating mode inside our tx.
    const assignmentResult = await changeAssignmentTx(
      tx, actorOf(user),
      {
        personId,
        effectiveDate,
        actionType,
        actionReason: reason,
        departmentId:   delta.departmentId,
        positionId:     delta.positionId,
        jobId:          delta.jobId,
        locationId:     delta.locationId,
        gradeId:        delta.gradeId,
        businessUnitId:       delta.businessUnitId,
        lineManagerId:        delta.lineManagerId,
        employmentType:       delta.employmentType,
        projectId:            delta.projectId,
        projectAllocationPct: delta.projectAllocationPct,
        mode: assignmentMode,
      },
    )
    if (assignmentResult.mode !== assignmentMode) throw new Error('unexpected assignment mode')
    const newAssignmentId = assignmentResult.mode === 'UPDATE'
      ? assignmentResult.newId
      : assignmentResult.futureId
    const { current: currentAssignment } = assignmentResult

    // BR-NP-001 — recompute notice period from total service.
    const newNotice = deriveNoticePeriodDays(
      yearsOfService(person.hireDate, effectiveDate),
    )

    // Insert the immutable employment_action row.
    const [actionRow] = await tx
      .insert(employmentActions)
      .values({
        tenantId:      TENANT_ID,
        personId,
        legalEntityId: person.legalEntityId,
        assignmentId:  newAssignmentId,
        actionType,
        actionDate:    effectiveDate,
        effectiveDate,
        reasonCode:    actionType,
        reasonText:    reason,
        beforeDepartmentId:  currentAssignment.departmentId,
        beforePositionId:    currentAssignment.positionId,
        beforeGradeId:       currentAssignment.gradeId,
        beforeLocationId:    currentAssignment.locationId,
        beforeManagerId:     currentAssignment.lineManagerId,
        beforeEmploymentType: currentAssignment.employmentType,
        beforeStatus:        currentAssignment.assignmentStatus,
        afterDepartmentId:   delta.departmentId  ?? currentAssignment.departmentId,
        afterPositionId:     delta.positionId    ?? currentAssignment.positionId,
        afterGradeId:        delta.gradeId       ?? currentAssignment.gradeId,
        afterLocationId:     delta.locationId    ?? currentAssignment.locationId,
        afterManagerId:      delta.lineManagerId ?? currentAssignment.lineManagerId,
        afterEmploymentType: delta.employmentType ?? currentAssignment.employmentType,
        afterStatus:         currentAssignment.assignmentStatus,
        initiatedBy:         user.personId ?? user.id,
        approvedBy:          user.personId ?? user.id,
        approvalDate:        effectiveDate,
        status:              'APPROVED',
        createdBy:           user.id,
        createdByName:       user.name,
      })
      .returning({ id: employmentActions.id })

    // BR-ED-002: denormalised current pointers are materialised-current state.
    // They must not move ahead of a future-effective assignment.
    if (assignmentMode === 'UPDATE') {
      await tx
        .update(persons)
        .set({
          currentDepartmentId: delta.departmentId  ?? person.currentDepartmentId,
          currentPositionId:   delta.positionId    ?? person.currentPositionId,
          currentJobId:        delta.jobId         ?? person.currentJobId,
          currentLocationId:   delta.locationId    ?? person.currentLocationId,
          currentGradeId:      delta.gradeId       ?? person.currentGradeId,
          lineManagerId:       delta.lineManagerId ?? person.lineManagerId,
          noticePeriodDays:    newNotice,
          updatedBy:           user.id,
          updatedByName:       user.name,
          updatedDate:         new Date(),
          lastUpdatedDate:     new Date(),
        })
        .where(eq(persons.id, personId))
    }

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: person.legalEntityId,
      channel:       'WEB',
      eventType:     `EMPLOYMENT_ACTION.${actionType}`,
      resourceType:  'employment_actions',
      resourceId:    actionRow.id,
      entityId:      person.legalEntityId,
      metadata: {
        personId,
        effectiveDate,
        reason,
        previousAssignmentId:    currentAssignment.id,
        newAssignmentId,
        assignmentMode,
        appliedNoticePeriodDays: newNotice,
        personPointersUpdated:   assignmentMode === 'UPDATE',
      },
    }, tx)

    return { assignmentId: newAssignmentId, actionId: actionRow.id }
  })
}

async function runGradeChange(
  personId:      string,
  effectiveDate: string,
  reason:        string,
  delta:         { newGradeId: string; newPositionId?: string; newJobId?: string },
): Promise<{ assignmentId: string; actionId: string }> {
  // Pre-flight: read both grade levels (outside tx — pure read, ok).
  const [currentAssignment] = await db
    .select({ gradeId: workerAssignments.gradeId })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      eq(workerAssignments.isCurrent, true),
    ))
    .limit(1)
  if (!currentAssignment) throw new Error('no current assignment for this person')

  let actionType: 'PROMOTION' | 'DEMOTION' = 'PROMOTION'
  if (currentAssignment.gradeId) {
    const [oldGrade] = await db
      .select({ level: grades.gradeLevel })
      .from(grades)
      .where(eq(grades.id, currentAssignment.gradeId))
      .limit(1)
    const [newGrade] = await db
      .select({ level: grades.gradeLevel })
      .from(grades)
      .where(eq(grades.id, delta.newGradeId))
      .limit(1)
    const oldLevel = oldGrade?.level ?? 0
    const newLevel = newGrade?.level ?? 0
    actionType = newLevel < oldLevel ? 'DEMOTION' : 'PROMOTION'
  }

  return runLifecycleChange(actionType, personId, effectiveDate, reason, {
    gradeId:    delta.newGradeId,
    positionId: delta.newPositionId,
    jobId:      delta.newJobId,
  })
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/employment-actions/transfer-request.ts
LINES: 159
================================================================================
'use server'
/**
 * Transfer / Promotion request orchestrator.
 *
 * Single governed entry point that BOTH (a) creates the transfer_requests row and
 * (b) starts the 2-step approval workflow. Previously createTransferRequest only
 * created the row and never triggered the workflow, so requests sat in
 * PENDING_APPROVAL forever with no approval steps. This pairs them.
 *
 * Governance: RBAC-gated (MANAGER → direct reports only; HR_ADMIN+ entity-wide).
 * Creates a REQUEST and starts a workflow; the actual assignment change happens
 * only on final human approval, in lib/workflow-engine → applyTransferOutcome.
 * The workflow engine remains the system of record.
 *
 * Hard Rule 8: returns { error } rather than translateError (which would re-throw
 * and crash a Server Component render).
 */
import { and, eq, inArray } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { persons, transferRequests, grades } from '@/drizzle/schema'
import { isManagerDirectReport } from '../manager-scope'
import { triggerTransferApproval, triggerPromotionApproval } from '@/modules/workflow'

export interface RequestTransferInput {
  personId:           string
  requestType:        'TRANSFER' | 'PROMOTION'
  targetDepartmentId?: string  // required for TRANSFER
  targetPositionId?:  string
  targetGradeId?:     string   // required for PROMOTION
  effectiveDate:      string   // YYYY-MM-DD
  reason:             string   // CAREER_GROWTH | ORG_NEED | PERFORMANCE | PERSONAL | OTHER
  notes?:             string
}

export interface RequestTransferResult {
  success:    boolean
  requestId?: string
  instanceId?: string
  error?:     string
}

export async function requestTransfer(input: RequestTransferInput): Promise<RequestTransferResult> {
  try {
    const user = await getCurrentUser()
    const allowed = ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
    if (!allowed.includes(user.role)) return { success: false, error: 'Insufficient permissions to request a transfer.' }

    const [person] = await db
      .select({
        id:                persons.id,
        personNumber:      persons.personNumber,
        fullNameEn:        persons.fullNameEn,
        legalEntityId:     persons.legalEntityId,
        currentPositionId: persons.currentPositionId,
        currentGradeId:    persons.currentGradeId,
      })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, input.personId)))
      .limit(1)
    if (!person) return { success: false, error: 'Employee not found.' }
    if (!person.currentPositionId) return { success: false, error: 'Employee has no current position.' }
    if (input.requestType === 'PROMOTION' && !input.targetGradeId) return { success: false, error: 'A target grade is required for a promotion.' }
    if (input.requestType === 'TRANSFER'  && !input.targetDepartmentId) return { success: false, error: 'A target department is required for a transfer.' }

    // MANAGER scope — only direct reports (backend-enforced).
    if (user.role === 'MANAGER') {
      if (!user.personId || !(await isManagerDirectReport(person.id, user.personId))) {
        return { success: false, error: 'You can only request transfers or promotions for your direct reports.' }
      }
    }

    // 1) Create the request row (+ audit) atomically.
    let requestId = ''
    await db.transaction(async tx => {
      const [req] = await tx
        .insert(transferRequests)
        .values({
          tenantId:           TENANT_ID,
          personId:           person.id,
          currentPositionId:  person.currentPositionId!,
          targetPositionId:   input.targetPositionId,
          targetDepartmentId: input.targetDepartmentId,
          targetGradeId:      input.targetGradeId,
          requestType:        input.requestType,
          effectiveDate:      input.effectiveDate,
          reason:             input.reason,
          notes:              input.notes,
          status:             'PENDING_APPROVAL',
          requestedById:      user.id,
          requestedByName:    user.name,
          createdBy:          user.id,
          createdByName:      user.name,
        })
        .returning({ id: transferRequests.id })
      requestId = req.id

      await writeAuditLog({
        actorId:      user.id,
        actorName:    user.name,
        actorRole:    user.role,
        channel:      'WEB',
        eventType:    'TRANSFER_REQUEST_CREATED',
        resourceType: 'transfer_requests',
        resourceId:   req.id,
        newValues:    {
          personId:           person.id,
          requestType:        input.requestType,
          targetDepartmentId: input.targetDepartmentId,
          effectiveDate:      input.effectiveDate,
        },
      }, tx)
    })

    // 2) Start the 2-step approval workflow (builds its own def; no seeded
    //    template needed). On approval the engine applies the change.
    let instanceId: string | undefined
    if (input.requestType === 'PROMOTION') {
      // Resolve current + target grade names for the approval notification.
      const gradeIds = [person.currentGradeId, input.targetGradeId].filter(Boolean) as string[]
      const gRows = gradeIds.length
        ? await db.select({ id: grades.id, name: grades.gradeNameEn }).from(grades)
            .where(and(eq(grades.tenantId, TENANT_ID), inArray(grades.id, gradeIds)))
        : []
      const nameOf = (id: string | null | undefined) => gRows.find(g => g.id === id)?.name ?? '—'
      const wf = await triggerPromotionApproval({
        personId:          person.id,
        personNumber:      person.personNumber,
        personFullName:    person.fullNameEn ?? person.personNumber,
        legalEntityId:     person.legalEntityId,
        fromGradeName:     nameOf(person.currentGradeId),
        toGradeName:       nameOf(input.targetGradeId),
        effectiveDate:     input.effectiveDate,
        reason:            input.reason,
        transferRequestId: requestId,
      })
      instanceId = wf?.instanceId
    } else {
      const wf = await triggerTransferApproval({
        personId:          person.id,
        personNumber:      person.personNumber,
        personFullName:    person.fullNameEn ?? person.personNumber,
        legalEntityId:     person.legalEntityId,
        toDepartmentId:    input.targetDepartmentId!,
        effectiveDate:     input.effectiveDate,
        reason:            input.reason,
        transferRequestId: requestId,
      })
      instanceId = wf?.instanceId
    }

    return { success: true, requestId, instanceId }
  } catch (e) {
    console.error('[core-hr] requestTransfer failed:', e instanceof Error ? e.message : e)
    return { success: false, error: e instanceof Error ? e.message : 'Failed to submit transfer request.' }
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/employment-actions/validations.ts
LINES: 51
================================================================================
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

export const HireSchema = z.object({
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  effectiveStartDate: hrDateString(),
  positionId:         z.string().uuid().optional(),
  jobId:              z.string().uuid().optional(),
  departmentId:       z.string().uuid(),
  locationId:         z.string().uuid().optional(),
  gradeId:            z.string().uuid().optional(),
  businessUnitId:     z.string().uuid().optional(),
  lineManagerId:      z.string().uuid().optional(),
  employmentType:     z.enum(['FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED']),
  contractedHoursPerWeek: z.number().min(1).max(48).default(48),
  reasonText:         z.string().max(500).optional(),
})
export type HireInput = z.infer<typeof HireSchema>

export const TransferSchema = z.object({
  personId:        z.string().uuid(),
  effectiveDate:   hrDateString(),
  reasonText:      z.string().min(1).max(500),
  newDepartmentId:       z.string().uuid().optional(),
  newLocationId:         z.string().uuid().optional(),
  newBusinessUnitId:     z.string().uuid().optional(),
  newLineManagerId:      z.string().uuid().optional(),
  // BR-PRJ-001: project cost-centre assignment (optional)
  newProjectId:          z.string().uuid().optional(),
  newProjectAllocationPct: z.number().min(0).max(100).optional(),
})
export type TransferInput = z.infer<typeof TransferSchema>

export const PromotionSchema = z.object({
  personId:      z.string().uuid(),
  effectiveDate: hrDateString(),
  reasonText:    z.string().min(1).max(500),
  newGradeId:    z.string().uuid(),
  newPositionId: z.string().uuid().optional(),
  newJobId:      z.string().uuid().optional(),
})
export type PromotionInput = z.infer<typeof PromotionSchema>

export const GradeChangeSchema = z.object({
  personId:      z.string().uuid(),
  effectiveDate: hrDateString(),
  reasonText:    z.string().min(1).max(500),
  newGradeId:    z.string().uuid(),
})
export type GradeChangeInput = z.infer<typeof GradeChangeSchema>


================================================================================
FILE [P3-01/03/04]: modules/core-hr/employment-actions/workflow-actions.ts
LINES: 169
================================================================================
/**
 * Workflow apply-back for approved Transfer / Promotion requests.
 *
 * Mirrors modules/core-hr/probation/workflow-actions.applyProbationOutcome: called
 * by lib/workflow-engine.dispatchResourceCompletion on FINAL approval, joining the
 * engine's post-claim transaction so the assignment change + audit are atomic with
 * the workflow completion.
 *
 * BACKGROUND: previously, an APPROVED transfer_request only flipped status + sent a
 * notification — the worker_assignment was never changed (the approval was
 * cosmetic). This applies the approved change via the proven tx-aware primitive
 * changeAssignmentTx (close current row + open new row), then records the immutable
 * employment_action and syncs persons.* pointers — exactly like runLifecycleChange,
 * but driven by the request row and the approver (no interactive auth).
 *
 * Hard Rule 1: every write joins the same transaction + writes an audit row.
 * The workflow engine remains the system of record — this only APPLIES an already
 * human-approved decision; it never initiates one.
 */
import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { isFutureDated, yearsOfService } from '@/lib/effective-date'
import { employmentActions, persons, transferRequests } from '@/drizzle/schema'
import { deriveNoticePeriodDays } from '../contracts/services'
import { changeAssignmentTx } from '../worker-assignments/services'

export async function applyTransferOutcome(params: {
  requestId:        string
  finalStatus:      'APPROVED' | 'REJECTED'
  actorPersonId:    string
  actorDisplayName: string
  legalEntityId:    string
  /** Engine post-claim transaction — all writes join it for atomicity. */
  tx:               DbOrTx
}): Promise<void> {
  const { requestId, finalStatus, actorPersonId, actorDisplayName, tx } = params

  // Only an approval applies a change. Rejection/cancellation: nothing to apply
  // (the engine has already set the request status + notified).
  if (finalStatus !== 'APPROVED') return

  const [request] = await tx
    .select()
    .from(transferRequests)
    .where(and(eq(transferRequests.tenantId, TENANT_ID), eq(transferRequests.id, requestId)))
    .limit(1)
  if (!request) throw new Error(`Transfer request not found: ${requestId}`)

  const [person] = await tx
    .select()
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, request.personId)))
    .limit(1)
  if (!person) throw new Error(`Person not found for transfer request: ${request.personId}`)

  const actionType: 'TRANSFER' | 'PROMOTION' = request.requestType === 'PROMOTION' ? 'PROMOTION' : 'TRANSFER'
  const effectiveDate = request.effectiveDate
  const reason = request.notes?.trim() || request.reason

  const assignmentMode = isFutureDated(effectiveDate) ? 'FUTURE_DATED' : 'UPDATE'

  // Post-approval system apply: role is irrelevant outside correction mode.
  const actor = {
    id:            actorPersonId,
    name:          actorDisplayName,
    role:          'SUPER_ADMIN',
    personId:      actorPersonId,
    legalEntityId: person.legalEntityId,
  }

  // Apply the approved assignment change in the correct effective-dating mode.
  const assignmentResult = await changeAssignmentTx(tx, actor, {
    personId:     request.personId,
    effectiveDate,
    actionType,
    actionReason: reason,
    departmentId: request.targetDepartmentId ?? undefined,
    positionId:   request.targetPositionId   ?? undefined,
    gradeId:      request.targetGradeId       ?? undefined,   // PROMOTION
    mode:         assignmentMode,
  })
  if (assignmentResult.mode !== assignmentMode) throw new Error('unexpected assignment mode')
  const newAssignmentId = assignmentResult.mode === 'UPDATE'
    ? assignmentResult.newId
    : assignmentResult.futureId
  const { current: currentAssignment } = assignmentResult

  // BR-NP-001 — recompute notice period from total service.
  const newNotice = deriveNoticePeriodDays(yearsOfService(person.hireDate, effectiveDate))

  // Immutable employment_action row (before/after snapshot).
  const [actionRow] = await tx
    .insert(employmentActions)
    .values({
      tenantId:             TENANT_ID,
      personId:             request.personId,
      legalEntityId:        person.legalEntityId,
      assignmentId:         newAssignmentId,
      actionType,
      actionDate:           effectiveDate,
      effectiveDate,
      reasonCode:           actionType,
      reasonText:           reason,
      beforeDepartmentId:   currentAssignment.departmentId,
      beforePositionId:     currentAssignment.positionId,
      beforeGradeId:        currentAssignment.gradeId,
      beforeLocationId:     currentAssignment.locationId,
      beforeManagerId:      currentAssignment.lineManagerId,
      beforeEmploymentType: currentAssignment.employmentType,
      beforeStatus:         currentAssignment.assignmentStatus,
      afterDepartmentId:    request.targetDepartmentId ?? currentAssignment.departmentId,
      afterPositionId:      request.targetPositionId   ?? currentAssignment.positionId,
      afterGradeId:         request.targetGradeId      ?? currentAssignment.gradeId,
      afterLocationId:      currentAssignment.locationId,
      afterManagerId:       currentAssignment.lineManagerId,
      afterEmploymentType:  currentAssignment.employmentType,
      afterStatus:          currentAssignment.assignmentStatus,
      initiatedBy:          request.requestedById,
      approvedBy:           actorPersonId,
      approvalDate:         effectiveDate,
      status:               'APPROVED',
      createdBy:            actorPersonId,
      createdByName:        actorDisplayName,
    })
    .returning({ id: employmentActions.id })

  // Denormalised current pointers move only for immediately effective changes.
  if (assignmentMode === 'UPDATE') {
    await tx
      .update(persons)
      .set({
        currentDepartmentId: request.targetDepartmentId ?? person.currentDepartmentId,
        currentPositionId:   request.targetPositionId   ?? person.currentPositionId,
        currentGradeId:      request.targetGradeId       ?? person.currentGradeId,
        noticePeriodDays:    newNotice,
        updatedBy:           actorPersonId,
        updatedByName:       actorDisplayName,
        updatedDate:         new Date(),
        lastUpdatedDate:     new Date(),
      })
      .where(eq(persons.id, request.personId))
  }

  await writeAuditLog({
    actorId:       actorPersonId,
    actorName:     actorDisplayName,
    actorRole:     'SUPER_ADMIN',
    actorEntityId: person.legalEntityId,
    channel:       'SYSTEM',
    eventType:     `EMPLOYMENT_ACTION.${actionType}`,
    resourceType:  'employment_actions',
    resourceId:    actionRow.id,
    entityId:      person.legalEntityId,
    metadata: {
      personId:                request.personId,
      transferRequestId:       requestId,
      effectiveDate,
      reason,
      previousAssignmentId:    currentAssignment.id,
      newAssignmentId,
      assignmentMode,
      appliedNoticePeriodDays: newNotice,
      personPointersUpdated:   assignmentMode === 'UPDATE',
      appliedViaWorkflow:      true,
    },
  }, tx)
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/exit-clearance/actions.ts
LINES: 170
================================================================================
'use server'

/**
 * P2-3 — Exit Clearance Server Actions.
 *
 * completeOffboardingItem — marks a checklist item as COMPLETED.
 * waiveOffboardingItem    — marks a checklist item as WAIVED (with mandatory reason).
 *
 * Both update the parent checklist completionPct.
 * Hard Rule 1: every DB write + audit in same transaction.
 * Hard Rule 3: no deletes — status transitions only.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { onboardingChecklistItems, onboardingChecklists } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { revalidatePath } from 'next/cache'

const CompleteItemSchema = z.object({
  itemId: z.string().uuid(),
  notes:  z.string().max(500).optional(),
})

const WaiveItemSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required').max(500),
})

export async function completeOffboardingItem(input: z.infer<typeof CompleteItemSchema>): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'PAYROLL_ADMIN', 'SUPER_ADMIN'])
    const data = CompleteItemSchema.parse(input)

    await db.transaction(async tx => {
      const [item] = await tx
        .select({
          id:          onboardingChecklistItems.id,
          checklistId: onboardingChecklistItems.checklistId,
          status:      onboardingChecklistItems.status,
        })
        .from(onboardingChecklistItems)
        .where(and(eq(onboardingChecklistItems.tenantId, TENANT_ID), eq(onboardingChecklistItems.id, data.itemId)))
        .limit(1)

      if (!item) throw new Error('checklist item not found')
      if (item.status === 'COMPLETED') throw new Error('item is already completed')

      const today = new Date().toISOString().split('T')[0]

      await tx
        .update(onboardingChecklistItems)
        .set({
          status:        'COMPLETED',
          completedBy:   user.id,
          completedDate: today,
          notes:         data.notes ?? null,
          updatedBy:     user.id,
          updatedByName: user.name,
          updatedDate:   new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(onboardingChecklistItems.id, item.id))

      await recalcChecklistPct(tx, item.checklistId, user)

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: '',
        channel:       'WEB',
        eventType:     'EXIT_CLEARANCE.ITEM_COMPLETED',
        resourceType:  'onboarding_checklist_items',
        resourceId:    item.id,
        entityId:      '',
        newValues:     { status: 'COMPLETED', notes: data.notes ?? null },
      }, tx)
    })

    revalidatePath('/admin/exit-clearance')
  } catch (e) { translateError(e, 'completeOffboardingItem') }
}

export async function waiveOffboardingItem(input: z.infer<typeof WaiveItemSchema>): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = WaiveItemSchema.parse(input)

    await db.transaction(async tx => {
      const [item] = await tx
        .select({
          id:          onboardingChecklistItems.id,
          checklistId: onboardingChecklistItems.checklistId,
          status:      onboardingChecklistItems.status,
          isMandatory: onboardingChecklistItems.isMandatory,
        })
        .from(onboardingChecklistItems)
        .where(and(eq(onboardingChecklistItems.tenantId, TENANT_ID), eq(onboardingChecklistItems.id, data.itemId)))
        .limit(1)

      if (!item) throw new Error('checklist item not found')
      if (item.status === 'COMPLETED') throw new Error('cannot waive a completed item')
      if (item.status === 'WAIVED') throw new Error('item is already waived')
      if (item.isMandatory) throw new Error('mandatory items cannot be waived')

      await tx
        .update(onboardingChecklistItems)
        .set({
          status:          'WAIVED',
          notes:           data.reason,
          updatedBy:       user.id,
          updatedByName:   user.name,
          updatedDate:     new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(onboardingChecklistItems.id, item.id))

      await recalcChecklistPct(tx, item.checklistId, user)

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: '',
        channel:       'WEB',
        eventType:     'EXIT_CLEARANCE.ITEM_WAIVED',
        resourceType:  'onboarding_checklist_items',
        resourceId:    item.id,
        entityId:      '',
        newValues:     { status: 'WAIVED', reason: data.reason },
      }, tx)
    })

    revalidatePath('/admin/exit-clearance')
  } catch (e) { translateError(e, 'waiveOffboardingItem') }
}

// Recalculates completion % and auto-marks checklist COMPLETED when all items done/waived.
async function recalcChecklistPct(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  checklistId: string,
  user: { id: string; name: string },
) {
  const items = await tx
    .select({ status: onboardingChecklistItems.status })
    .from(onboardingChecklistItems)
    .where(and(eq(onboardingChecklistItems.tenantId, TENANT_ID), eq(onboardingChecklistItems.checklistId, checklistId)))

  const total     = items.length
  const doneCount = items.filter(i => i.status === 'COMPLETED' || i.status === 'WAIVED').length
  const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const allDone   = pct === 100

  await tx
    .update(onboardingChecklists)
    .set({
      completionPct:  pct,
      status:         allDone ? 'COMPLETED' : 'IN_PROGRESS',
      completionDate: allDone ? new Date().toISOString().split('T')[0] : null,
      updatedBy:      user.id,
      updatedByName:  user.name,
      updatedDate:    new Date(),
      lastUpdatedDate: new Date(),
    })
    .where(and(eq(onboardingChecklists.tenantId, TENANT_ID), eq(onboardingChecklists.id, checklistId)))
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/index.ts
LINES: 201
================================================================================
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


================================================================================
FILE [P3-01/03/04]: modules/core-hr/manager-scope.ts
LINES: 105
================================================================================
import { and, eq, sql as drizzleSql } from 'drizzle-orm'
import { db, type DbOrTx } from '@/lib/db'
import { persons, workerAssignments } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

/**
 * Returns the full set of personIds in a manager's reporting chain
 * (direct + all indirect / recursive descendants) using a single
 * recursive CTE.
 *
 * Reporting edges are resolved from BOTH sources at every level — identical
 * to the single-level rule in {@link isManagerDirectReport}:
 *   1. persons.line_manager_id — the denormalised "current manager" pointer
 *      that drives My Team, manager reports, and the org chart visible tree; AND
 *   2. a current worker_assignments row with line_manager_id — the effective-
 *      dated assignment source.
 *
 * Using BOTH (OR) is required: employees with no worker_assignments row yet
 * (a known seed/data gap) are correctly included via persons.line_manager_id.
 * A worker_assignments-only walk under-counts the team (e.g. it returned 1 of
 * Fatima's 3 reports because Aisha and John have no current WA row).
 *
 * Safe defaults:
 *   • Returns [] immediately for empty/invalid managerId.
 *   • UNION (not UNION ALL) bounds the walk and prevents infinite loops on
 *     circular data.
 *   • Catches and returns [] on any DB error so callers never crash.
 *
 * Use this wherever the full manager hierarchy must be respected
 * (ARIA metrics, People Intelligence, Home KPIs, chat scope).
 */
export async function getManagerTeamIds(managerId: string): Promise<string[]> {
  if (!managerId) return []
  try {
    // Seed the walk with the manager themselves, then recursively pull in any
    // person managed by a team member via EITHER pointer. The manager node is
    // stripped from the final result.
    const rows = await db.execute<{ person_id: string }>(drizzleSql`
      WITH RECURSIVE team AS (
        SELECT ${managerId}::uuid AS person_id
        UNION
        SELECT p.id
        FROM   team t
        JOIN   persons p ON p.tenant_id = ${TENANT_ID}::uuid
        LEFT JOIN worker_assignments wa
               ON wa.person_id      = p.id
              AND wa.tenant_id      = ${TENANT_ID}::uuid
              AND wa.is_current     = true
        WHERE  p.line_manager_id = t.person_id
            OR wa.line_manager_id = t.person_id
      )
      SELECT person_id FROM team WHERE person_id <> ${managerId}::uuid
    `)
    return rows.map((r) => r.person_id)
  } catch {
    return []
  }
}

/**
 * Direct-report scope check for the MANAGER role.
 *
 * A person counts as a manager's direct report if EITHER:
 *   1. persons.line_manager_id = managerPersonId — the denormalised "current
 *      manager" pointer that drives My Team, manager reports, and the org chart
 *      visible tree; OR
 *   2. a current worker_assignments row has line_manager_id = managerPersonId —
 *      the effective-dated assignment source historically used by getPerson().
 *
 * Using BOTH sources (OR) is deliberate:
 *   • It is a strict SUPERSET of the previous worker_assignments-only check, so
 *     no manager who could previously act on a report is newly blocked
 *     (zero regression).
 *   • It also covers active employees that have no worker_assignments row yet
 *     (a known seed/data gap), which the WA-only check incorrectly excluded.
 *
 * This is the single source of truth for "is X a direct report of manager Y".
 */
export async function isManagerDirectReport(
  personId: string,
  managerPersonId: string,
  client: DbOrTx = db,
): Promise<boolean> {
  if (!personId || !managerPersonId) return false

  const [p] = await client
    .select({ lineManagerId: persons.lineManagerId })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  if (p?.lineManagerId === managerPersonId) return true

  const [wa] = await client
    .select({ id: workerAssignments.id })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      eq(workerAssignments.lineManagerId, managerPersonId),
      eq(workerAssignments.isCurrent, true),
    ))
    .limit(1)

  return Boolean(wa)
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/org-chart-actions.ts
LINES: 685
================================================================================
'use server'

/**
 * Org Chart Server Actions — Task A.3 / Task E / Task F
 *
 * Exported actions:
 *   fetchOrgTree                — full or scoped recursive tree
 *   fetchPersonAncestors        — upward chain to root (breadcrumb / navigate to CEO)
 *   getDirectReports            — one level down from a given manager
 *   createHiringRequest         — E.4
 *   createTransferRequest       — E.5
 *   assignActingManager         — E.6
 *   searchPersons               — E.6 (autocomplete)
 *   getVacantPositionsByDept    — E.5 (transfer target positions)
 *   togglePositionConfidential  — F.1
 *   togglePositionFrozen        — F.1
 *   getOrgChartPendingCounts    — F.6
 */
import { getCurrentUser }  from '@/lib/auth'
import { TENANT_ID }       from '@/lib/constants'
import { db }              from '@/lib/db'
import { writeAuditLog }   from '@/lib/audit'
import { translateError }  from '@/lib/app-error'
import { isManagerDirectReport } from './manager-scope'
import { eq, and, ilike, count } from 'drizzle-orm'
import {
  hiringRequests,
  transferRequests,
  workerAssignments,
  persons,
  positions,
  jobs,
} from '@/drizzle/schema'
import {
  getOrgTree,
  getPersonAncestorChain,
  getDirectReportNodes,
  getSystemUsers,
  type OrgTreeParams,
  type OrgTreeData,
  type OrgNode,
  type OrgViewerRole,
} from '@/lib/org-chart/build-tree'
import type { SystemUserRow } from '@/lib/org-chart/types'
import {
  resolveEngine,
  type HierarchyEngine,
  type HierarchyResult,
} from '@/lib/org-chart/engines/engine-registry'

// Maps JWT role strings to the OrgViewerRole union used by the data layer
function toViewerRole(role: string): OrgViewerRole {
  if (role === 'HR_ADMIN' || role === 'HR_DIRECTOR' || role === 'SUPER_ADMIN') return 'HR_ADMIN'
  if (role === 'MANAGER')                                                        return 'MANAGER'
  if (role === 'FINANCE' || role === 'PAYROLL_ADMIN')                           return 'HR_ADMIN'
  return 'EMPLOYEE'
}

// ─────────────────────────────────────────────────────────────────────────────
// Session 3 — Unified hierarchy engine entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchHierarchyParams {
  engine:          HierarchyEngine
  legalEntityId?:  string
  rootPersonId?:   string
  rootDeptId?:     string
  includeVacant?:  boolean
  maxDepth?:       number
  showPeers?:      boolean
}

export async function fetchHierarchy(
  params: FetchHierarchyParams,
): Promise<{ success: boolean; data?: HierarchyResult; error?: string }> {
  try {
    const user       = await getCurrentUser()
    const viewerRole = toViewerRole(user.role)

    // EMPLOYEE role is always locked to the my-team engine (server-enforced)
    const effectiveEngine: HierarchyEngine =
      viewerRole === 'EMPLOYEE' ? 'my-team' : params.engine

    const result = await resolveEngine(effectiveEngine, {
      tenantId:        TENANT_ID,
      viewerRole,
      legalEntityId:   params.legalEntityId,
      rootPersonId:    params.rootPersonId,
      rootDeptId:      params.rootDeptId,
      includeVacant:   params.includeVacant ?? true,
      maxDepth:        Math.min(params.maxDepth ?? 8, 10),
      currentPersonId: user.personId ?? undefined,
      showPeers:       params.showPeers ?? false,
    })

    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load hierarchy',
    }
  }
}

export async function fetchOrgTree(
  params: Omit<OrgTreeParams, 'tenantId' | 'viewerRole'> & { legalEntityId?: string },
): Promise<{ success: boolean; data?: OrgTreeData; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()
      const viewerRole = toViewerRole(user.role)

      // Global roles (HR Admin and above) see all entities; scoped roles see their entity only
      const isGlobalRole = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'FINANCE', 'PAYROLL_ADMIN'].includes(user.role)
      const legalEntityId = params.legalEntityId ?? (isGlobalRole ? undefined : user.legalEntityId)

      const result = await getOrgTree({
        ...params,
        tenantId: TENANT_ID,
        viewerRole,
        legalEntityId,
      })

      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load org tree' }
    }
  } catch (e) { translateError(e, 'fetchOrgTree') }
}

export async function fetchPersonAncestors(
  personId: string,
): Promise<{ success: boolean; data?: Array<{ positionId: string; personId: string; fullNameEn: string; positionTitleEn: string }>; error?: string }> {
  try {
    try {
      await getCurrentUser()
      const chain = await getPersonAncestorChain(personId, TENANT_ID)
      return { success: true, data: chain }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load ancestors' }
    }
  } catch (e) { translateError(e, 'fetchPersonAncestors') }
}

export async function getDirectReports(
  managerId: string,
): Promise<{ success: boolean; data?: OrgNode[]; error?: string }> {
  try {
    try {
      await getCurrentUser()
      const nodes = await getDirectReportNodes(managerId, TENANT_ID)
      return { success: true, data: nodes }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load direct reports' }
    }
  } catch (e) { translateError(e, 'getDirectReports') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.4 — Create Hiring Request
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateHiringRequestInput {
  positionId:     string
  departmentId:   string
  requestType:    string
  replacementFor?: string
  requiredByDate?: string
  budgetApproved?: boolean
  budgetAmount?:  string
  justification:  string
  urgency?:       string
}

export async function createHiringRequest(
  input: CreateHiringRequestInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      // Basic role gate — MANAGER or HR_ADMIN only
      const allowedRoles = ['MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']
      if (!allowedRoles.includes(user.role)) {
        return { success: false, error: 'Insufficient permissions' }
      }

      // Validate required fields
      if (!input.positionId)              return { success: false, error: 'positionId required' }
      if (!input.requestType)             return { success: false, error: 'requestType required' }
      if ((input.justification ?? '').trim().length < 30)
        return { success: false, error: 'Justification must be at least 30 characters' }

      let createdId = ''
      await db.transaction(async tx => {
        const [req] = await tx.insert(hiringRequests).values({
          tenantId:        TENANT_ID,
          positionId:      input.positionId,
          departmentId:    input.departmentId,
          requestType:     input.requestType,
          replacementFor:  input.replacementFor,
          requiredByDate:  input.requiredByDate,
          budgetApproved:  input.budgetApproved ?? false,
          budgetAmount:    input.budgetAmount,
          justification:   input.justification,
          urgency:         input.urgency ?? 'STANDARD',
          status:          'PENDING_APPROVAL',
          requestedById:   user.id,
          requestedByName: user.name,
          createdBy:       user.id,
          createdByName:   user.name,
        }).returning({ id: hiringRequests.id })

        createdId = req.id

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'HIRING_REQUEST_CREATED',
          resourceType: 'hiring_requests',
          resourceId:   req.id,
          newValues:    input as unknown as Record<string, unknown>,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      // COLLISION-004 (migration 0041): partial unique index on (tenant_id, position_id)
      // WHERE status = 'PENDING_APPROVAL' raises error code 23505 on duplicate attempt.
      // Surface a business-friendly message instead of a raw Postgres error string.
      const pgCode = (err as Record<string, unknown>)?.code
      if (pgCode === '23505') {
        return {
          success: false,
          error:   'A hiring request for this position is already pending approval. ' +
                   'Please wait for the existing request to be resolved before raising another.',
        }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Failed to create hiring request' }
    }
  } catch (e) { translateError(e, 'createHiringRequest') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.5 — Create Transfer Request
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTransferRequestInput {
  nodeId:               string   // position id (used to look up personId)
  requestType:          string   // TRANSFER | PROMOTION
  targetDepartmentId:   string
  targetPositionId?:    string
  effectiveDate:        string
  reason:               string
  notes?:               string
}

export async function createTransferRequest(
  input: CreateTransferRequestInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      const allowedRoles = ['MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']
      if (!allowedRoles.includes(user.role)) {
        return { success: false, error: 'Insufficient permissions' }
      }

      // Find personId from position
      const [pos] = await db
        .select({ personId: positions.occupiedByPersonId })
        .from(positions)
        .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, input.nodeId)))
        .limit(1)

      const personId = pos?.personId ?? null

      // MANAGER scope: may only raise transfer/promotion for a DIRECT REPORT.
      // Backend-enforced — blocks URL/query manipulation of the target position.
      // HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN bypass this (entity-wide authority).
      if (user.role === 'MANAGER') {
        if (!user.personId || !personId || !(await isManagerDirectReport(personId, user.personId))) {
          return { success: false, error: 'You can only request transfers or promotions for your direct reports.' }
        }
      }

      let createdId = ''
      await db.transaction(async tx => {
        const [req] = await tx.insert(transferRequests).values({
          tenantId:           TENANT_ID,
          personId:           personId ?? user.id, // fallback to actor
          currentPositionId:  input.nodeId,
          targetPositionId:   input.targetPositionId,
          targetDepartmentId: input.targetDepartmentId,
          requestType:        input.requestType,
          effectiveDate:      input.effectiveDate,
          reason:             input.reason,
          notes:              input.notes,
          status:             'PENDING_APPROVAL',
          requestedById:      user.id,
          requestedByName:    user.name,
          createdBy:          user.id,
          createdByName:      user.name,
        }).returning({ id: transferRequests.id })

        createdId = req.id

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'TRANSFER_REQUEST_CREATED',
          resourceType: 'transfer_requests',
          resourceId:   req.id,
          newValues:    input as unknown as Record<string, unknown>,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      // COLLISION-004B (migration 0042): partial unique index on (tenant_id, person_id)
      // WHERE status = 'PENDING_APPROVAL' raises error code 23505 on duplicate attempt.
      const pgCode = (err as unknown as Record<string, unknown>)?.code
      if (pgCode === '23505') {
        return {
          success: false,
          error:   'A transfer or promotion request for this person is already pending approval. ' +
                   'Please wait for the existing request to be resolved before raising another.',
        }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Failed to create transfer request' }
    }
  } catch (e) { translateError(e, 'createTransferRequest') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.6 — Assign Acting Manager
// ─────────────────────────────────────────────────────────────────────────────

export interface AssignActingManagerInput {
  positionId:     string
  actingPersonId: string
  startDate:      string
  endDate:        string
  reason:         string
}

export async function assignActingManager(
  input: AssignActingManagerInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      const allowedRoles = ['MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']
      if (!allowedRoles.includes(user.role)) {
        return { success: false, error: 'Insufficient permissions' }
      }

      // MANAGER scope: may only assign acting status for a DIRECT REPORT.
      // Backend-enforced — blocks URL/query manipulation of actingPersonId.
      // HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN bypass this (entity-wide authority).
      if (user.role === 'MANAGER') {
        if (!user.personId || !(await isManagerDirectReport(input.actingPersonId, user.personId))) {
          return { success: false, error: 'You can only assign acting status for your direct reports.' }
        }
      }

      // Find the worker_assignment row for the acting person that is current
      const [asgn] = await db
        .select({ id: workerAssignments.id })
        .from(workerAssignments)
        .where(and(
          eq(workerAssignments.tenantId,  TENANT_ID),
          eq(workerAssignments.personId,  input.actingPersonId),
          eq(workerAssignments.isCurrent, true),
        ))
        .limit(1)

      if (!asgn) {
        return { success: false, error: 'Active worker assignment not found for selected person' }
      }

      await db.transaction(async tx => {
        await tx
          .update(workerAssignments)
          .set({
            isActing:        true,
            actingEndDate:   input.endDate,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: new Date(),
          })
          .where(eq(workerAssignments.id, asgn.id))

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'ACTING_ASSIGNMENT_CREATED',
          resourceType: 'worker_assignments',
          resourceId:   asgn.id,
          newValues:    input as unknown as Record<string, unknown>,
          description:  input.reason,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to assign acting manager' }
    }
  } catch (e) { translateError(e, 'assignActingManager') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.6 — Search Persons (autocomplete)
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonSearchResult {
  id:         string
  nameEn:     string
  jobTitleEn?: string
}

export async function searchPersons(
  query: string,
): Promise<{ success: boolean; data?: PersonSearchResult[]; error?: string }> {
  try {
    try {
      await getCurrentUser()

      if (!query?.trim()) return { success: true, data: [] }

      const rows = await db
        .select({
          id:         persons.id,
          nameEn:     persons.fullNameEn,
          jobTitleEn: jobs.jobTitleEn,
        })
        .from(persons)
        .innerJoin(workerAssignments, and(
          eq(workerAssignments.personId,  persons.id),
          eq(workerAssignments.tenantId,  TENANT_ID),
          eq(workerAssignments.isCurrent, true),
        ))
        .leftJoin(jobs, eq(jobs.id, workerAssignments.jobId))
        .where(and(
          eq(persons.tenantId, TENANT_ID),
          eq(persons.isActive, true),
          ilike(persons.fullNameEn, `%${query}%`),
        ))
        .limit(8)

      return {
        success: true,
        data:    rows.map(r => ({ id: r.id, nameEn: r.nameEn ?? '', jobTitleEn: r.jobTitleEn ?? undefined })),
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Search failed' }
    }
  } catch (e) { translateError(e, 'searchPersons') }
}

// ─────────────────────────────────────────────────────────────────────────────
// E.5 — Get Vacant Positions by Department
// ─────────────────────────────────────────────────────────────────────────────

export async function getVacantPositionsByDept(
  deptId: string,
): Promise<{ success: boolean; data?: Array<{ id: string; titleEn: string }>; error?: string }> {
  try {
    try {
      await getCurrentUser()

      const rows = await db
        .select({
          id:         positions.id,
          titleEn:    positions.positionTitleEn,
          isOccupied: positions.isOccupied,
        })
        .from(positions)
        .where(and(
          eq(positions.tenantId,     TENANT_ID),
          eq(positions.departmentId, deptId),
          eq(positions.isActive,     true),
          eq(positions.isFrozen,     false),
        ))
        .limit(50)

      // Return only unoccupied positions
      const vacant = rows.filter(r => !r.isOccupied)

      return { success: true, data: vacant.map(r => ({ id: r.id, titleEn: r.titleEn ?? '' })) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load positions' }
    }
  } catch (e) { translateError(e, 'getVacantPositionsByDept') }
}

// ─────────────────────────────────────────────────────────────────────────────
// F.1 — Toggle Position Confidential
// ─────────────────────────────────────────────────────────────────────────────

export async function togglePositionConfidential(
  positionId: string,
  reason:     string,
): Promise<{ success: boolean; newValue: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(user.role)) {
        return { success: false, newValue: false, error: 'HR Admin access required' }
      }
      if (!reason || reason.trim().length < 10) {
        return { success: false, newValue: false, error: 'Reason must be at least 10 characters' }
      }

      let newValue = false
      await db.transaction(async tx => {
        const [pos] = await tx
          .select({ isConfidential: positions.isConfidential })
          .from(positions)
          .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, positionId)))
          .limit(1)

        if (!pos) throw new Error('Position not found')
        newValue = !pos.isConfidential

        await tx
          .update(positions)
          .set({
            isConfidential:  newValue,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: new Date(),
          })
          .where(eq(positions.id, positionId))

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'POSITION_CONFIDENTIAL_TOGGLED',
          resourceType: 'positions',
          resourceId:   positionId,
          oldValues:    { isConfidential: pos.isConfidential },
          newValues:    { isConfidential: newValue },
          metadata:     { changeReason: reason },
        }, tx)
      })

      return { success: true, newValue }
    } catch (err) {
      return { success: false, newValue: false, error: err instanceof Error ? err.message : 'Failed to toggle' }
    }
  } catch (e) { translateError(e, 'togglePositionConfidential') }
}

// ─────────────────────────────────────────────────────────────────────────────
// F.1 — Toggle Position Frozen
// ─────────────────────────────────────────────────────────────────────────────

export async function togglePositionFrozen(
  positionId: string,
  reason:     string,
): Promise<{ success: boolean; newValue: boolean; error?: string }> {
  try {
    try {
      const user = await getCurrentUser()

      if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(user.role)) {
        return { success: false, newValue: false, error: 'HR Admin access required' }
      }
      if (!reason || reason.trim().length < 1) {
        return { success: false, newValue: false, error: 'Reason is required' }
      }

      let newValue = false
      await db.transaction(async tx => {
        const [pos] = await tx
          .select({ isFrozen: positions.isFrozen })
          .from(positions)
          .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.id, positionId)))
          .limit(1)

        if (!pos) throw new Error('Position not found')
        newValue = !pos.isFrozen

        await tx
          .update(positions)
          .set({
            isFrozen:        newValue,
            updatedBy:       user.id,
            updatedByName:   user.name,
            lastUpdatedDate: new Date(),
          })
          .where(eq(positions.id, positionId))

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'POSITION_FROZEN_TOGGLED',
          resourceType: 'positions',
          resourceId:   positionId,
          oldValues:    { isFrozen: pos.isFrozen },
          newValues:    { isFrozen: newValue },
          metadata:     { changeReason: reason },
        }, tx)
      })

      return { success: true, newValue }
    } catch (err) {
      return { success: false, newValue: false, error: err instanceof Error ? err.message : 'Failed to toggle' }
    }
  } catch (e) { translateError(e, 'togglePositionFrozen') }
}

// ─────────────────────────────────────────────────────────────────────────────
// F.6 — Pending Counts for Analytics
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrgChartPendingCounts(): Promise<{
  hiringRequests:   number
  transferRequests: number
  error?: string
}> {
  try {
    try {
      const user = await getCurrentUser()

      const allowedRoles = ['MANAGER','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN','EXECUTIVE']
      if (!allowedRoles.includes(user.role)) {
        return { hiringRequests: 0, transferRequests: 0 }
      }

      const [hr] = await db
        .select({ count: count() })
        .from(hiringRequests)
        .where(and(
          eq(hiringRequests.tenantId, TENANT_ID),
          eq(hiringRequests.status,   'PENDING_APPROVAL'),
        ))

      const [tr] = await db
        .select({ count: count() })
        .from(transferRequests)
        .where(and(
          eq(transferRequests.tenantId, TENANT_ID),
          eq(transferRequests.status,   'PENDING_APPROVAL'),
        ))

      return {
        hiringRequests:   Number(hr?.count ?? 0),
        transferRequests: Number(tr?.count ?? 0),
      }
    } catch (err) {
      return { hiringRequests: 0, transferRequests: 0, error: err instanceof Error ? err.message : 'Failed' }
    }
  } catch (e) { translateError(e, 'getOrgChartPendingCounts') }
}

// ── System users ──────────────────────────────────────────────────────────────

export async function fetchSystemUsers(): Promise<{ success: true; data: SystemUserRow[] } | { success: false; error: string }> {
  try {
    const user = await getCurrentUser()
    const adminRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'MANAGER']
    if (!user || !adminRoles.includes(user.role)) {
      return { success: false, error: 'Insufficient permissions' }
    }
    const data = await getSystemUsers(TENANT_ID)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load system users' }
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/photo-upload.ts
LINES: 154
================================================================================
'use server'

/**
 * uploadProfilePhoto — Server Action.
 *
 * Accepts a multipart form containing a single image file and stores it as
 * the employee's profile photo.
 *
 * Storage strategy (dual-write for durability):
 *   1. profilePhotoData  — base64 data URL written to Neon TEXT column.
 *                          Always populated. Durable across Vercel container
 *                          restarts and container-to-container routing.
 *   2. profilePhotoUrl   — cloud storage signed URL (Azure/AWS, 7-day TTL).
 *                          Populated when DOCUMENT_STORAGE_PROVIDER=azure/aws.
 *                          Empty string when cloud is not configured.
 *
 * Display priority (callers): profilePhotoUrl || profilePhotoData
 *   - Cloud configured  → use profilePhotoUrl (fast CDN delivery)
 *   - No cloud (UAT)    → profilePhotoUrl='', falls back to profilePhotoData base64
 *
 * Roles allowed:
 *   - EMPLOYEE              — own photo only (personId must equal session.user.personId)
 *   - HR_ADMIN, HR_DIRECTOR — any employee in same legal entity
 *   - SUPER_ADMIN           — any employee across all entities
 *
 * Hard Rule 1: DB write + audit in same Drizzle transaction.
 * FIX-2G-002:  Only storageKey (not the live credential) goes into audit log.
 */
import { translateError }        from '@/lib/app-error'
import { eq, and }               from 'drizzle-orm'
import { persons }               from '@/drizzle/schema'
import { db }                    from '@/lib/db'
import { writeAuditLog }         from '@/lib/audit'
import { requireRole }           from '@/lib/auth'
import { TENANT_ID }             from '@/lib/constants'
import { revalidatePath }        from 'next/cache'
import { getStorageProvider }    from '@/lib/storage'
import { PHOTO_SAS_TTL_MINUTES } from '@/lib/blob-storage'
import { randomUUID }            from 'crypto'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const MAX_BYTES    = 2 * 1024 * 1024 // 2 MB

export async function uploadProfilePhoto(
  personId: string,
  formData:  FormData,
): Promise<{ photoUrl: string; photoData: string }> {
  try {
    // Allow employees to upload their own photo; HR roles can upload for anyone.
    const user = await requireRole([
      'EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
    ])

    // EMPLOYEE may only update their own photo.
    if (user.role === 'EMPLOYEE' && user.personId !== personId) {
      throw new Error('FORBIDDEN: employees can only update their own profile photo')
    }

    const file = formData.get('photo') as File | null
    if (!file || file.size === 0) throw new Error('No file provided')
    if (file.size > MAX_BYTES)    throw new Error('File exceeds 2 MB limit')
    if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
      throw new Error('Only JPEG, PNG, WebP, or GIF images are accepted')
    }

    // Verify person exists and is in scope.
    const [person] = await db
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
      .limit(1)
    if (!person) throw new Error('Person not found')

    // Non-SUPER_ADMIN HR roles are scoped to their own entity.
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'EMPLOYEE' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cannot update profiles in another legal entity')
    }

    const buf          = Buffer.from(await file.arrayBuffer())
    // ── Durable base64 fallback — always computed ─────────────────────────
    const base64DataUrl = `data:${file.type};base64,${buf.toString('base64')}`

    // ── Cloud storage attempt (best-effort) ───────────────────────────────
    const ext       = file.type.split('/')[1] ?? 'jpg'
    const key       = `persons/${personId}/photos/${randomUUID()}.${ext}`
    let   cloudUrl  = ''
    let   storageKey = key

    try {
      const storage = getStorageProvider()
      const result  = await storage.uploadFile({
        key,
        data:     buf,
        mimeType: file.type,
        metadata: { personid: personId, uploadedAt: new Date().toISOString() },
      })
      storageKey = result.storageKey
      cloudUrl   = await storage.getSignedUrl(result.storageKey, PHOTO_SAS_TTL_MINUTES)
      if (!cloudUrl) {
        console.info(
          `[photo-upload] Cloud storage returned empty URL for key ${result.storageKey}. ` +
          'Base64 fallback will be used. Set DOCUMENT_STORAGE_PROVIDER=azure or aws ' +
          'for CDN-delivered photos.',
        )
      }
    } catch (storageErr) {
      // Cloud storage not configured or unavailable — base64 is the canonical copy.
      console.info(
        `[photo-upload] Cloud storage unavailable (${(storageErr as Error).message}). ` +
        'Storing photo as base64 in Neon — durable but not CDN-delivered.',
      )
    }

    // ── Persist to DB in a transaction ────────────────────────────────────
    await db.transaction(async tx => {
      await tx
        .update(persons)
        .set({
          // Cloud URL when available; empty string otherwise.
          profilePhotoUrl:  cloudUrl,
          // Base64 data URL — always populated, always durable.
          profilePhotoData: base64DataUrl,
          lastUpdatedDate:  new Date(),
          updatedBy:        user.id,
          updatedByName:    user.name,
          updatedDate:      new Date(),
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: person.legalEntityId,
        channel:       'WEB',
        eventType:     'PERSON.PROFILE_PHOTO_UPDATED',
        resourceType:  'persons',
        resourceId:    personId,
        entityId:      person.legalEntityId,
        // FIX-2G-002: log storageKey, not live credential
        newValues:     { storageKey, hasBase64: true },
      }, tx)
    })

    revalidatePath(`/persons/${personId}`)
    revalidatePath(`/me/profile`)

    // Return the most-useful URL for the caller:
    // Cloud URL if available; base64 data URL otherwise.
    // The caller MUST receive a non-empty string to confirm persistence.
    const photoUrl = cloudUrl || base64DataUrl
    return { photoUrl, photoData: base64DataUrl }
  } catch (e) { translateError(e, 'uploadProfilePhoto') }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/picklists.ts
LINES: 152
================================================================================
'use server'

import { and, asc, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { positions, departments, grades, persons, locations, projects, workerAssignments } from '@/drizzle/schema'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'

export interface PicklistOption { id: string; label: string; legalEntityId?: string | null }

export interface PersonPicklists {
  positions:   PicklistOption[]
  departments: PicklistOption[]
  grades:      PicklistOption[]
  locations:   PicklistOption[]
  managers:    PicklistOption[]
  projects:    PicklistOption[]
}

/**
 * Returns active positions, departments, grades, and managers for a given
 * legal entity — used by PersonEditDrawer to populate select dropdowns.
 *
 * Anchor guarantee: if the person already has a currentPositionId or
 * lineManagerId saved, those records are ALWAYS included in the returned
 * options even if they are inactive or belong to a different entity. This
 * ensures edit forms hydrate correctly regardless of data drift.
 *
 * Manager labels include employee number and department so duplicate names
 * are always distinguishable:
 *   "Dorabababu Kethari — AVN-001-000123 — Technology & Digital Transformation"
 */
export async function getPersonPicklists(
  legalEntityId: string,
  excludePersonId?: string,
): Promise<PersonPicklists> {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  // ── Fetch current position, manager, and project for the edited person so
  //    we can anchor them in the option lists regardless of entity/active
  //    filters. This ensures the edit form always shows the saved value even
  //    if the record was deactivated or moved to another entity since last edit.
  let anchorPositionId: string | null = null
  let anchorManagerId:  string | null = null
  let anchorProjectId:  string | null = null

  if (excludePersonId) {
    const [personRow] = await db
      .select({ currentPositionId: persons.currentPositionId, lineManagerId: persons.lineManagerId })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, excludePersonId)))
      .limit(1)
    anchorPositionId = personRow?.currentPositionId ?? null
    anchorManagerId  = personRow?.lineManagerId     ?? null

    // Fetch project from the current worker_assignment (source of truth for project)
    const [waRow] = await db
      .select({ projectId: workerAssignments.projectId })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, excludePersonId),
        eq(workerAssignments.isCurrent, true),
      ))
      .limit(1)
    anchorProjectId = waRow?.projectId ?? null
  }

  // ── Build WHERE clauses with anchor OR conditions ──────────────────────────

  const positionWhere = anchorPositionId
    ? or(
        and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true), eq(positions.legalEntityId, legalEntityId)),
        and(eq(positions.tenantId, TENANT_ID), eq(positions.id, anchorPositionId)),
      )!
    : and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true), eq(positions.legalEntityId, legalEntityId))!

  const managerWhere = anchorManagerId
    ? or(
        and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.legalEntityId, legalEntityId)),
        and(eq(persons.tenantId, TENANT_ID), eq(persons.id, anchorManagerId)),
      )!
    : and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.legalEntityId, legalEntityId))!

  const [positionRows, departmentRows, gradeRows, locationRows, managerRows, projectRows] = await Promise.all([
    db.select({ id: positions.id, titleEn: positions.positionTitleEn, code: positions.positionCode })
      .from(positions)
      .where(positionWhere)
      .orderBy(asc(positions.positionTitleEn)),

    // Departments unfiltered by entity so cross-entity assignments always appear.
    db.select({ id: departments.id, nameEn: departments.nameEn, legalEntityId: departments.legalEntityId })
      .from(departments)
      .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)))
      .orderBy(asc(departments.nameEn)),

    db.select({ id: grades.id, gradeNameEn: grades.gradeNameEn, gradeCode: grades.gradeCode })
      .from(grades)
      .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
      .orderBy(asc(grades.gradeLevel)),

    db.select({ id: locations.id, code: locations.code, nameEn: locations.nameEn, nameAr: locations.nameAr })
      .from(locations)
      .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true), eq(locations.legalEntityId, legalEntityId)))
      .orderBy(asc(locations.nameEn)),

    // Join departments to show department name in manager label.
    db.select({
        id:              persons.id,
        fullNameEn:      persons.fullNameEn,
        personNumber:    persons.personNumber,
        departmentNameEn: departments.nameEn,
      })
      .from(persons)
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(managerWhere)
      .orderBy(asc(persons.fullNameEn)),

    // Include the person's currently-assigned project even if it becomes
    // inactive, so the dropdown never shows blank for a saved value.
    db.select({ id: projects.id, code: projects.code, nameEn: projects.nameEn })
      .from(projects)
      .where(
        anchorProjectId
          ? or(
              and(eq(projects.tenantId, TENANT_ID), eq(projects.isActive, true)),
              and(eq(projects.tenantId, TENANT_ID), eq(projects.id, anchorProjectId)),
            )!
          : and(eq(projects.tenantId, TENANT_ID), eq(projects.isActive, true))!,
      )
      .orderBy(asc(projects.code)),
  ])

  return {
    positions:   positionRows.map(p => ({ id: p.id, label: `${p.titleEn}${p.code ? ` (${p.code})` : ''}` })),
    departments: departmentRows.map(d => ({ id: d.id, label: d.nameEn ?? d.id, legalEntityId: d.legalEntityId })),
    grades:      gradeRows.map(g => ({ id: g.id, label: `${g.gradeCode} — ${g.gradeNameEn}` })),
    locations:   locationRows.map(l => ({ id: l.id, label: `${l.code} — ${l.nameEn}${l.nameAr ? ` · ${l.nameAr}` : ''}` })),
    managers:    managerRows
      .filter(m => m.id !== excludePersonId)
      .map(m => {
        const name = m.fullNameEn ?? m.personNumber ?? m.id
        const label = m.personNumber && m.departmentNameEn
          ? `${name} — ${m.personNumber} — ${m.departmentNameEn}`
          : m.personNumber
            ? `${name} — ${m.personNumber}`
            : name
        return { id: m.id, label }
      }),
    projects: projectRows.map(p => ({ id: p.id, label: `${p.code} — ${p.nameEn}` })),
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/probation/actions.ts
LINES: 96
================================================================================
'use server'

/**
 * P2-4 — Probation Confirmation Server Actions.
 *
 * confirmProbation — HR/Manager confirms employee passed, extends, or fails probation.
 * Updates persons.probation_status and optionally sets a new probation_end_date.
 *
 * Hard Rule 1: every DB write + audit in same transaction.
 * Hard Rule 3: no deletes — status transitions only.
 */
import { translateError } from '@/lib/app-error'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { revalidatePath } from 'next/cache'

const ConfirmProbationSchema = z.object({
  personId:   z.string().uuid(),
  decision:   z.enum(['CONFIRMED', 'EXTENDED', 'FAILED']),
  newEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // required if EXTENDED
  reason:     z.string().max(500).optional(),
})

export type ConfirmProbationInput = z.infer<typeof ConfirmProbationSchema>

export async function confirmProbation(
  input: ConfirmProbationInput,
): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'SUPER_ADMIN'])
    const data = ConfirmProbationSchema.parse(input)

    if (data.decision === 'EXTENDED' && !data.newEndDate) {
      throw new Error('newEndDate is required when decision is EXTENDED')
    }

    await db.transaction(async tx => {
      const [person] = await tx
        .select({
          id:              persons.id,
          legalEntityId:   persons.legalEntityId,
          probationStatus: persons.probationStatus,
          probationEndDate:persons.probationEndDate,
        })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
        .limit(1)

      if (!person) throw new Error('person not found')
      if (person.probationStatus !== 'ACTIVE') {
        throw new Error(`Probation already resolved: status is ${person.probationStatus}`)
      }
      if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
        throw new Error('FORBIDDEN: cross-entity probation update not allowed')
      }

      await tx
        .update(persons)
        .set({
          probationStatus:  data.decision,
          ...(data.decision === 'EXTENDED' && { probationEndDate: data.newEndDate! }),
          updatedBy:        user.id,
          updatedByName:    user.name,
          updatedDate:      new Date(),
          lastUpdatedDate:  new Date(),
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: person.legalEntityId ?? '',
        channel:       'WEB',
        eventType:     `PROBATION.${data.decision}`,
        resourceType:  'persons',
        resourceId:    data.personId,
        entityId:      person.legalEntityId ?? '',
        newValues: {
          decision:    data.decision,
          newEndDate:  data.newEndDate ?? null,
          reason:      data.reason ?? null,
          previousEndDate: person.probationEndDate,
        },
      }, tx)
    })

    revalidatePath('/admin/probation')
    revalidatePath(`/persons/${data.personId}`)
  } catch (e) { translateError(e, 'confirmProbation') }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/probation/index.ts
LINES: 15
================================================================================
/**
 * Probation module barrel.
 * New workflow-driven actions are the canonical path for all probation changes.
 * The legacy confirmProbation action is kept for SUPER_ADMIN edge cases only.
 */

export {
  initiateProbationReview,
  submitLmRecommendation,
  applyProbationOutcome,
  finalizeProbationAfterSigning,
} from './workflow-actions'

/** @deprecated Use initiateProbationReview + workflow instead. Legacy direct-update action. */
export { confirmProbation } from './actions'


================================================================================
FILE [P3-01/03/04]: modules/core-hr/probation/workflow-actions.ts
LINES: 745
================================================================================
'use server'

/**
 * Probation Workflow Server Actions
 *
 * initiateProbationReview   — creates probation_reviews row + triggers LM→HR workflow
 * submitLmRecommendation    — LM submits CONFIRM|EXTEND|FAIL recommendation
 * applyProbationOutcome     — called by dispatchResourceCompletion on HR final decision
 * finalizeProbationAfterSigning — called after employee signs PCL letter
 *
 * BR-37: total probation cannot exceed 6 months (182 days) from hire_date.
 * BR-PW-001: only one active review per person at a time.
 * BR-NO-DELETE: records never deleted; status transitions only.
 */

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'

import { db, type DbOrTx } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { translateError } from '@/lib/app-error'
import {
  persons,
  notificationLog,
  employeeLetters,
  letterTemplates,
  letterTemplateTypes,
  userAccounts,
} from '@/drizzle/schema'
import { probationReviews } from '@/drizzle/schema/probation'
import {
  getPersonWithDetails,
  getDefaultTemplate,
  nextLetterNumber,
} from '@/modules/employee-letters/queries'
import { resolveTemplateBilingual } from '@/modules/employee-letters/engine'
import { triggerProbationConfirmationWorkflow } from '@/modules/workflow/actions'
import { triggerTerminationApproval } from '@/modules/workflow/actions'

// ── helpers ───────────────────────────────────────────────────────────────────

function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ── initiateProbationReview ───────────────────────────────────────────────────

export async function initiateProbationReview(input: {
  personId:            string
  initiatedByChannel?: 'HR_ADMIN' | 'EMPLOYEE' | 'MANAGER'
}): Promise<{ reviewId: string; workflowInstanceId: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN'])

    const channel = input.initiatedByChannel ?? 'HR_ADMIN'

    // EMPLOYEE can only initiate for themselves
    if (channel === 'EMPLOYEE' && actor.personId !== input.personId) {
      throw new Error('FORBIDDEN: employees can only initiate probation review for themselves')
    }

    const person = await getPersonWithDetails(input.personId)
    if (!person) throw new Error('Person not found')
    if (!person.legalEntityId) throw new Error('Person has no legal entity')
    if (person.probationStatus !== 'ACTIVE') {
      throw new Error(`Cannot initiate review: probation status is ${person.probationStatus}`)
    }
    if (!person.hireDate) throw new Error('Person has no hire date')
    if (!person.probationEndDate) throw new Error('Person has no probation end date')

    const hireDate = person.hireDate
    // BR-37: max extension = hire_date + 182 days
    const maxAllowedExtensionDate = toDateStr(addDays(hireDate, 182))

    let reviewId = ''
    let workflowInstanceId = ''

    await db.transaction(async tx => {
      // BR-PW-001: check no active review already exists (partial unique index enforces this at DB level too)
      const existing = await tx
        .select({ id: probationReviews.id, reviewStatus: probationReviews.reviewStatus })
        .from(probationReviews)
        .where(
          and(
            eq(probationReviews.tenantId, TENANT_ID),
            eq(probationReviews.personId, input.personId),
          ),
        )
        .limit(1)

      if (existing.length > 0) {
        const s = existing[0].reviewStatus
        if (['PENDING_LM', 'PENDING_HR', 'PENDING_ACKNOWLEDGMENT'].includes(s)) {
          throw new Error(`An active probation review already exists (status: ${s})`)
        }
      }

      reviewId = randomUUID()
      const now = new Date()

      await tx.insert(probationReviews).values({
        id:                             reviewId,
        tenantId:                       TENANT_ID,
        personId:                       input.personId,
        legalEntityId:                  person.legalEntityId!,
        initiatedByPersonId:            actor.personId ?? actor.id,
        initiatedAt:                    now,
        initiatedByChannel:             channel,
        probationEndDateAtInitiation:   person.probationEndDate as string,
        hireDateAtInitiation:           hireDate as string,
        maxAllowedExtensionDate,
        reviewStatus:                   'PENDING_LM',
        createdBy:                      actor.id,
        createdByName:                  actor.name,
        createdDate:                    now,
      })

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: person.legalEntityId!,
        channel:       'WEB',
        eventType:     'PROBATION.REVIEW_INITIATED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      person.legalEntityId!,
        newValues:     { personId: input.personId, channel, hireDate, probationEndDate: person.probationEndDate, maxAllowedExtensionDate },
      }, tx)
    })

    // Trigger 2-step LM→HR workflow (outside transaction — it creates its own)
    const wfResult = await triggerProbationConfirmationWorkflow({
      reviewId,
      personId:       input.personId,
      personNumber:   person.personNumber ?? '',
      personFullName: person.fullNameEn ?? '',
      legalEntityId:  person.legalEntityId!,
      lineManagerId:  person.lineManagerId ?? null,
      probationEndDate: person.probationEndDate,
    })

    workflowInstanceId = wfResult.instanceId

    // Store workflow instance ID on review
    await db
      .update(probationReviews)
      .set({
        workflowInstanceId,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        updatedDate:     new Date(),
        lastUpdatedDate: new Date(),
      })
      .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

    revalidatePath('/admin/probation')
    revalidatePath(`/persons/${input.personId}`)

    return { reviewId, workflowInstanceId }
  } catch (e) {
    translateError(e, 'initiateProbationReview')
    throw e
  }
}

// ── submitLmRecommendation ───────────────────────────────────────────────────

export async function submitLmRecommendation(input: {
  reviewId:                  string
  recommendation:            'CONFIRM' | 'EXTEND' | 'FAIL'
  comments:                  string
  requestedExtensionEndDate?: string // required when recommendation = EXTEND
}): Promise<void> {
  try {
    const actor = await requireRole(['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    if (!input.comments?.trim()) {
      throw new Error('Comments are mandatory before submitting recommendation (BR-PW-002)')
    }

    const [review] = await db
      .select()
      .from(probationReviews)
      .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, input.reviewId)))
      .limit(1)

    if (!review) throw new Error('Probation review not found')
    if (review.reviewStatus !== 'PENDING_LM') {
      throw new Error(`Review is not awaiting LM input (status: ${review.reviewStatus})`)
    }

    if (input.recommendation === 'EXTEND') {
      if (!input.requestedExtensionEndDate) {
        throw new Error('requestedExtensionEndDate is required when recommending EXTEND')
      }
      // BR-37: extension cannot exceed max_allowed_extension_date
      if (input.requestedExtensionEndDate > review.maxAllowedExtensionDate) {
        throw new Error(
          `BR-37: requested extension end date (${input.requestedExtensionEndDate}) exceeds the maximum allowed (${review.maxAllowedExtensionDate}). Total probation cannot exceed 6 months from hire date.`,
        )
      }
    }

    const now = new Date()

    await db.transaction(async tx => {
      await tx
        .update(probationReviews)
        .set({
          lmRecommendation:          input.recommendation,
          lmComments:                input.comments,
          lmRecommendedAt:           now,
          lmPersonId:                actor.personId ?? actor.id,
          requestedExtensionEndDate: input.requestedExtensionEndDate ?? null,
          reviewStatus:              'PENDING_HR',
          updatedBy:                 actor.id,
          updatedByName:             actor.name,
          updatedDate:               now,
          lastUpdatedDate:           now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, input.reviewId)))

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: review.legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.LM_RECOMMENDATION_SUBMITTED',
        resourceType:  'probation_reviews',
        resourceId:    input.reviewId,
        entityId:      review.legalEntityId,
        newValues:     {
          recommendation: input.recommendation,
          comments:       input.comments,
          requestedExtensionEndDate: input.requestedExtensionEndDate ?? null,
        },
      }, tx)
    })

    revalidatePath('/admin/probation')
    revalidatePath('/admin/probation/my-team-probation')
    revalidatePath(`/admin/probation/my-team-probation/${input.reviewId}`)
  } catch (e) {
    translateError(e, 'submitLmRecommendation')
    throw e
  }
}

// ── applyProbationOutcome ─────────────────────────────────────────────────────
// Called by lib/workflow-engine.ts dispatchResourceCompletion when HR approves/rejects

export async function applyProbationOutcome(params: {
  reviewId:       string
  finalStatus:    'APPROVED' | 'REJECTED'
  actorPersonId:  string
  legalEntityId:  string
  decisionNote?:  string
  /**
   * Optional outer transaction from the workflow engine's post-claim transaction.
   * When provided, all writes join the caller's transaction (COLLISION-PROBATION fix,
   * Phase 3 P6E). When omitted, each branch opens its own db.transaction (backward-
   * compatible for any standalone callers).
   */
  tx?:            DbOrTx
}): Promise<void> {
  const { reviewId, finalStatus, actorPersonId, legalEntityId, decisionNote, tx: outerTx } = params

  const [review] = await db
    .select()
    .from(probationReviews)
    .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))
    .limit(1)

  if (!review) throw new Error(`Probation review not found: ${reviewId}`)
  if (review.reviewStatus !== 'PENDING_HR') {
    throw new Error(`Review not in PENDING_HR (status: ${review.reviewStatus})`)
  }

  const [person] = await db
    .select({
      id:             persons.id,
      fullNameEn:     persons.fullNameEn,
      personNumber:   persons.personNumber,
      hireDate:       persons.hireDate,
      lineManagerId:  persons.lineManagerId,
      probationEndDate: persons.probationEndDate,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, review.personId)))
    .limit(1)

  if (!person) throw new Error('Person not found for probation review')

  const now = new Date()

  if (finalStatus === 'REJECTED') {
    // HR rejects — send back to PENDING_LM or mark REJECTED.
    // COLLISION-PROBATION fix (Phase 3 P6E): when outerTx is provided, writes join
    // the caller's post-claim transaction; otherwise open an isolated db.transaction.
    const runReject = async (client: DbOrTx) => {
      await client
        .update(probationReviews)
        .set({
          hrDecision:      'REJECTED',
          hrComments:      decisionNote ?? null,
          hrDecidedAt:     now,
          hrPersonId:      actorPersonId,
          reviewStatus:    'REJECTED',
          updatedBy:       actorPersonId,
          updatedByName:   actorPersonId,
          updatedDate:     now,
          lastUpdatedDate: now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

      // Notify line manager
      if (review.lmPersonId) {
        await client.insert(notificationLog).values({
          tenantId:          TENANT_ID,
          legalEntityId,
          recipientPersonId: review.lmPersonId,
          notificationType:  'PROBATION_REVIEW_REJECTED',
          channel:           'IN_APP',
          subjectEn:         `Probation recommendation rejected — ${person.fullNameEn}`,
          bodyEn:            `HR has rejected the probation recommendation for ${person.fullNameEn} (${person.personNumber}).${decisionNote ? ` Reason: ${decisionNote}` : ''}`,
          referenceType:     'PROBATION_REVIEW',
          referenceId:       reviewId,
          status:            'PENDING',
          createdBy:         actorPersonId,
          createdByName:     actorPersonId,
        })
      }

      await writeAuditLog({
        actorId:       actorPersonId,
        actorName:     actorPersonId,
        actorRole:     'HR_ADMIN',
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.HR_REJECTED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      legalEntityId,
        newValues:     { hrDecision: 'REJECTED', decisionNote },
      }, client)
    }
    if (outerTx) {
      await runReject(outerTx)
    } else {
      await db.transaction(async _tx => runReject(_tx as unknown as DbOrTx))
    }
    return
  }

  // APPROVED — outcome depends on LM recommendation
  const recommendation = review.lmRecommendation as 'CONFIRM' | 'EXTEND' | 'FAIL' | null

  if (recommendation === 'CONFIRM') {
    // Generate PCL letter → status stays ACTIVE → PENDING_ACKNOWLEDGMENT until signing.
    // Note: generateProbationLetter uses a bare db.insert (outside any transaction).
    // If the outer tx rolls back, the letter row is orphaned but causes no referential
    // integrity issues — accepted low risk (COLLISION-PROBATION P6E).
    const letterId = await generateProbationLetter('PCL', review, person, actorPersonId, now)

    // COLLISION-PROBATION fix (Phase 3 P6E): when outerTx provided, writes join caller's tx.
    const runConfirm = async (client: DbOrTx) => {
      await client
        .update(probationReviews)
        .set({
          hrDecision:           'APPROVED',
          hrComments:           decisionNote ?? null,
          hrDecidedAt:          now,
          hrPersonId:           actorPersonId,
          outcome:              'CONFIRMED',
          reviewStatus:         'PENDING_ACKNOWLEDGMENT',
          confirmationLetterId: letterId ?? null,
          updatedBy:            actorPersonId,
          updatedByName:        actorPersonId,
          updatedDate:          now,
          lastUpdatedDate:      now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

      // Notify employee to sign letter
      await client.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        legalEntityId,
        recipientPersonId: review.personId,
        notificationType:  'PROBATION_LETTER_READY',
        channel:           'IN_APP',
        subjectEn:         'Your Probation Confirmation Letter is ready',
        subjectAr:         'خطاب تأكيد فترة التجربة جاهز للتوقيع',
        bodyEn:            'Your Probation Confirmation Letter has been issued. Please review and sign it from your profile.',
        bodyAr:            'تم إصدار خطاب تأكيد فترة التجربة الخاص بك. يرجى مراجعته والتوقيع عليه من ملفك الشخصي.',
        referenceType:     'EMPLOYEE_LETTER',
        referenceId:       letterId ?? reviewId,
        status:            'PENDING',
        createdBy:         actorPersonId,
        createdByName:     actorPersonId,
      })

      await writeAuditLog({
        actorId:       actorPersonId,
        actorName:     actorPersonId,
        actorRole:     'HR_ADMIN',
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.CONFIRM_APPROVED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      legalEntityId,
        newValues:     { outcome: 'CONFIRMED', letterId },
      }, client)
    }
    if (outerTx) {
      await runConfirm(outerTx)
    } else {
      await db.transaction(async _tx => runConfirm(_tx as unknown as DbOrTx))
    }
  } else if (recommendation === 'EXTEND') {
    // BR-37 validated at submitLmRecommendation; update probationEndDate + generate PEL.
    // Note: generateProbationLetter uses a bare db.insert (outside any transaction) —
    // same accepted-risk pattern as CONFIRM (orphaned letter if outer tx rolls back).
    const newEndDate = review.requestedExtensionEndDate!

    const letterId = await generateProbationLetter('PEL', review, person, actorPersonId, now)

    // COLLISION-PROBATION fix (Phase 3 P6E): when outerTx provided, writes join caller's tx.
    const runExtend = async (client: DbOrTx) => {
      // Update probation end date on person
      await client
        .update(persons)
        .set({
          probationEndDate: newEndDate,
          probationStatus:  'EXTENDED',
          updatedBy:        actorPersonId,
          updatedByName:    actorPersonId,
          updatedDate:      now,
          lastUpdatedDate:  now,
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, review.personId)))

      await client
        .update(probationReviews)
        .set({
          hrDecision:       'APPROVED',
          hrComments:       decisionNote ?? null,
          hrDecidedAt:      now,
          hrPersonId:       actorPersonId,
          outcome:          'EXTENDED',
          reviewStatus:     'PENDING_ACKNOWLEDGMENT',
          extensionLetterId: letterId ?? null,
          updatedBy:        actorPersonId,
          updatedByName:    actorPersonId,
          updatedDate:      now,
          lastUpdatedDate:  now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

      // Notify employee
      await client.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        legalEntityId,
        recipientPersonId: review.personId,
        notificationType:  'PROBATION_EXTENDED',
        channel:           'IN_APP',
        subjectEn:         'Your probation period has been extended',
        subjectAr:         'تم تمديد فترة تجربتك',
        bodyEn:            `Your probation period has been extended to ${newEndDate}. A Probation Extension Letter has been issued for your review.`,
        bodyAr:            `تم تمديد فترة تجربتك حتى ${newEndDate}. تم إصدار خطاب تمديد فترة التجربة للمراجعة.`,
        referenceType:     'EMPLOYEE_LETTER',
        referenceId:       letterId ?? reviewId,
        status:            'PENDING',
        createdBy:         actorPersonId,
        createdByName:     actorPersonId,
      })

      await writeAuditLog({
        actorId:       actorPersonId,
        actorName:     actorPersonId,
        actorRole:     'HR_ADMIN',
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.EXTEND_APPROVED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      legalEntityId,
        newValues:     { outcome: 'EXTENDED', newEndDate, letterId },
      }, client)
    }
    if (outerTx) {
      await runExtend(outerTx)
    } else {
      await db.transaction(async _tx => runExtend(_tx as unknown as DbOrTx))
    }
  } else if (recommendation === 'FAIL') {
    // Mark person as FAILED → trigger termination workflow.
    // COLLISION-PROBATION fix (Phase 3 P6E): when outerTx provided, writes join caller's tx.
    // triggerTerminationApproval and the terminationWorkflowInstanceId update remain
    // intentionally outside any transaction — termination trigger must not be rolled back
    // if the outer tx rolls back for an unrelated reason.
    const runFail = async (client: DbOrTx) => {
      await client
        .update(persons)
        .set({
          probationStatus: 'FAILED',
          updatedBy:       actorPersonId,
          updatedByName:   actorPersonId,
          updatedDate:     now,
          lastUpdatedDate: now,
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, review.personId)))

      await client
        .update(probationReviews)
        .set({
          hrDecision:      'APPROVED',
          hrComments:      decisionNote ?? null,
          hrDecidedAt:     now,
          hrPersonId:      actorPersonId,
          outcome:         'FAILED',
          reviewStatus:    'COMPLETED',
          completedAt:     now,
          updatedBy:       actorPersonId,
          updatedByName:   actorPersonId,
          updatedDate:     now,
          lastUpdatedDate: now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

      await writeAuditLog({
        actorId:       actorPersonId,
        actorName:     actorPersonId,
        actorRole:     'HR_ADMIN',
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.FAIL_APPROVED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      legalEntityId,
        newValues:     { outcome: 'FAILED', decisionNote },
      }, client)
    }
    if (outerTx) {
      await runFail(outerTx)
    } else {
      await db.transaction(async _tx => runFail(_tx as unknown as DbOrTx))
    }

    // Trigger termination workflow (outside transaction — intentional)
    try {
      const terminationResult = await triggerTerminationApproval({
        personId:          review.personId,
        personNumber:      person.personNumber ?? '',
        personFullName:    person.fullNameEn ?? '',
        legalEntityId,
        lineManagerId:     person.lineManagerId ?? null,
        terminationDate:   now.toISOString().split('T')[0],
        terminationReason: `Probation failed. HR decision: ${decisionNote ?? 'Probation period not passed.'}`,
        contractId:        '', // no active contract ID available at this point
      })

      await db
        .update(probationReviews)
        .set({ terminationWorkflowInstanceId: terminationResult.instanceId })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))
    } catch {
      // Termination trigger failure should not block the probation outcome record
    }
  }

  revalidatePath('/admin/probation')
  revalidatePath(`/persons/${review.personId}`)
}

// ── finalizeProbationAfterSigning ─────────────────────────────────────────────
// Called by completeLetterSigning when the signed letter is a PCL (Probation Confirmation Letter).

export async function finalizeProbationAfterSigning(
  letterId: string,
  personId: string,
): Promise<void> {
  const now = new Date()

  // Find the linked review via confirmation_letter_id
  const [review] = await db
    .select()
    .from(probationReviews)
    .where(
      and(
        eq(probationReviews.tenantId, TENANT_ID),
        eq(probationReviews.confirmationLetterId, letterId),
      ),
    )
    .limit(1)

  if (!review) {
    // No linked review — letter may have been manually issued; do nothing
    return
  }

  await db.transaction(async tx => {
    // Update person: probation confirmed (permanent)
    await tx
      .update(persons)
      .set({
        probationStatus: 'CONFIRMED',
        updatedBy:       personId,
        updatedByName:   personId,
        updatedDate:     now,
        lastUpdatedDate: now,
      })
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))

    // Close out the review
    await tx
      .update(probationReviews)
      .set({
        reviewStatus:    'COMPLETED',
        completedAt:     now,
        updatedBy:       personId,
        updatedByName:   personId,
        updatedDate:     now,
        lastUpdatedDate: now,
      })
      .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, review.id)))

    // Notify HR that employee has signed and is now confirmed
    const [hrAccount] = await tx
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(and(eq(userAccounts.tenantId, TENANT_ID), eq(userAccounts.avaniisRole, 'HR_ADMIN'), eq(userAccounts.isActive, true)))
      .limit(1)

    if (hrAccount?.personId) {
      const [emp] = await tx
        .select({ fullNameEn: persons.fullNameEn, personNumber: persons.personNumber })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
        .limit(1)

      await tx.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        legalEntityId:     review.legalEntityId,
        recipientPersonId: hrAccount.personId,
        notificationType:  'PROBATION_SIGNED',
        channel:           'IN_APP',
        subjectEn:         `Probation confirmed — ${emp?.fullNameEn ?? personId} signed`,
        bodyEn:            `${emp?.fullNameEn ?? personId} (${emp?.personNumber ?? ''}) has signed their Probation Confirmation Letter. Employee status updated to Confirmed.`,
        referenceType:     'PROBATION_REVIEW',
        referenceId:       review.id,
        status:            'PENDING',
        createdBy:         personId,
        createdByName:     personId,
      })
    }

    await writeAuditLog({
      actorId:       personId,
      actorName:     personId,
      actorRole:     'EMPLOYEE',
      actorEntityId: review.legalEntityId,
      channel:       'WEB',
      eventType:     'PROBATION.CONFIRMED_AFTER_SIGNING',
      resourceType:  'persons',
      resourceId:    personId,
      entityId:      review.legalEntityId,
      newValues:     { probationStatus: 'CONFIRMED', letterId, reviewId: review.id },
    }, tx)
  })

  revalidatePath('/admin/probation')
  revalidatePath(`/persons/${personId}`)
  revalidatePath('/me/requests/probation')
}

// ── internal: generate a probation letter (PCL or PEL) ───────────────────────

async function generateProbationLetter(
  typeCode:      'PCL' | 'PEL',
  review:        typeof probationReviews.$inferSelect,
  person:        { id: string; fullNameEn: string | null; personNumber: string | null; legalEntityId?: string | null },
  actorPersonId: string,
  now:           Date,
): Promise<string | null> {
  try {
    const legalEntityId = review.legalEntityId
    const template = await getDefaultTemplate(typeCode, legalEntityId)
    if (!template) return null

    const letterNumber = await nextLetterNumber(typeCode)

    const ctx = {
      personId:        review.personId,
      legalEntityId,
      letterId:        '',
      letterNumber,
      effectiveDate:   now,
      db:              db as any,
      // Probation-specific context fields
      confirmationDate:  review.hrDecidedAt,
      extensionEndDate:  review.requestedExtensionEndDate ? new Date(review.requestedExtensionEndDate) : null,
      hrApproverName:    actorPersonId,
    }

    const { resolvedEn, resolvedAr, snapshot } = await resolveTemplateBilingual(
      template.bodyEn,
      template.bodyAr ?? '',
      ctx as any,
    )

    const [letter] = await db.insert(employeeLetters).values({
      tenantId:       TENANT_ID,
      personId:       review.personId,
      legalEntityId,
      templateId:     template.id,
      typeCode,
      letterNumber,
      status:         'ISSUED',
      resolvedBodyEn: resolvedEn,
      resolvedBodyAr: resolvedAr,
      tokenSnapshot:  snapshot,
      generatedBy:    actorPersonId,
      generatedAt:    now,
      language:       'both',
      createdBy:      actorPersonId,
      createdByName:  actorPersonId,
    }).returning({ id: employeeLetters.id })

    return letter.id
  } catch {
    return null
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/schema.ts
LINES: 41
================================================================================
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


================================================================================
FILE [P3-01/03/04]: modules/core-hr/services.ts
LINES: 187
================================================================================
/**
 * core-hr pure services — full-name composition, person-number generation,
 * Emiratisation eligibility, and role-aware PII masking / decryption.
 *
 * No `'use server'` directive — these are server-only helpers callable from
 * actions.ts and from Server Components. Some helpers query the DB (via the
 * passed-in tx handle); none of them write.
 */
import { eq, and, sql } from 'drizzle-orm'
import { legalEntities, persons } from '@/drizzle/schema'
import type { Person } from '@/drizzle/schema'
import { decryptNullable } from '@/lib/encryption'
import { TENANT_ID } from '@/lib/constants'
import type { CoreHrRole, PersonView, PiiAccessContext } from './types'

// ── Full-name composition ──────────────────────────────────────────────────
// Schema marks persons.full_name_en as `text` (computed by application).
// Always run through this helper before insert/update to keep it consistent.

export function composeFullNameEn(parts: {
  firstNameEn:  string
  middleNameEn?: string | null
  lastNameEn:   string
}): string {
  return [parts.firstNameEn, parts.middleNameEn, parts.lastNameEn]
    .filter(Boolean)
    .map(s => s!.trim())
    .filter(s => s.length > 0)
    .join(' ')
}

// ── Person-number generation ───────────────────────────────────────────────
// Format: `{empNumberPrefix}{padded-number}` e.g. `AVN0001` (no hyphen).
// Configured per entity under Settings → Employee Numbers (SUPER_ADMIN).
// Falls back to entityCode with legacy hyphen format if prefix not yet set.
//
// Per FR-CH-12 the number must be unique per entity. Computed inside the
// same transaction as the person insert for consistency.

export async function nextPersonNumber(
  legalEntityId: string,
  tx: { select: typeof import('@/lib/db').db.select; query: typeof import('@/lib/db').db.query },
): Promise<string> {
  const [entity] = await tx
    .select({
      entityCode:      legalEntities.entityCode,
      empNumberPrefix: legalEntities.empNumberPrefix,
      empNumberDigits: legalEntities.empNumberDigits,
      empNumberSeed:   legalEntities.empNumberSeed,
    })
    .from(legalEntities)
    .where(eq(legalEntities.id, legalEntityId))
    .limit(1)

  // ── Determine prefix and format ─────────────────────────────────────────
  // If empNumberPrefix is configured → new format (no hyphen): AVN0001
  // If not yet configured → legacy format: entityCode-000001 (backward compat)
  const hasConfig      = !!entity?.empNumberPrefix?.trim()
  const digits         = Math.max(3, Math.min(8, entity?.empNumberDigits ?? 4))
  const seed           = entity?.empNumberSeed ?? 0

  let prefix: string
  let numberPattern: string  // regex to extract numeric suffix from existing records

  if (hasConfig) {
    // New format: prefix letters only, no separator — AVN0001
    prefix        = entity!.empNumberPrefix!.trim().toUpperCase()
    numberPattern = `^${prefix}[0-9]+$`
  } else {
    // Legacy format: entityCode-NNNNNN
    const rawCode = (entity?.entityCode ?? 'EMP').toUpperCase()
    if (!/^[A-Z0-9_-]{1,30}$/.test(rawCode)) {
      throw new Error('legalEntities.entityCode contains invalid characters')
    }
    prefix        = rawCode
    numberPattern = `^${prefix}-[0-9]+$`
  }

  // QA-Audit-C1: prefix/pattern bound as Drizzle parameters — injection-safe.
  // SELECT MAX(numeric suffix) from existing person_numbers matching the pattern.
  const replacePattern = hasConfig ? `^${prefix}` : `^${prefix}-`
  const result = await tx
    .select({
      maxN: sql<number>`COALESCE(MAX(
        CASE WHEN ${persons.personNumber} ~ ${numberPattern}
          THEN REGEXP_REPLACE(${persons.personNumber}, ${replacePattern}, '', 'g')::int
          ELSE NULL
        END
      ), 0)`,
    })
    .from(persons)
    .where(
      and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.legalEntityId, legalEntityId),
      ),
    )

  // next = MAX(seed, current_max) + 1 — seed lets SUPER_ADMIN set a floor
  const currentMax = result[0]?.maxN ?? 0
  const next       = Math.max(seed, currentMax) + 1

  if (hasConfig) {
    // New format: AVN0001
    return `${prefix}${String(next).padStart(digits, '0')}`
  } else {
    // Legacy format: AVN-001-000001 (unchanged for entities not yet configured)
    return `${prefix}-${String(next).padStart(6, '0')}`
  }
}

// ── Format guards (FR-CH-13, FR-CH-14, BR-WPS-004) ─────────────────────────

export function assertEmiratesIdFormat(value: string): void {
  if (!/^784-\d{4}-\d{7}-\d{1}$/.test(value)) {
    throw new Error('BR-EID-001: Emirates ID must match 784-XXXX-XXXXXXX-X')
  }
}

export function assertUaeIbanFormat(iban: string): void {
  // BR-WPS-004 — 23-char IBAN starting with AE
  if (!/^AE\d{21}$/.test(iban)) {
    throw new Error('BR-WPS-004: UAE IBAN must be 23 characters starting with AE')
  }
}

// ── PII masking ────────────────────────────────────────────────────────────
// Applied at the API layer (per Security spec §2.3). Direct DB rows are never
// returned to the UI without going through these helpers.

/** `784-****-*******-3` — keeps category prefix + last digit. */
export function maskEmiratesId(plaintext: string | null): string | null {
  if (!plaintext) return null
  if (!/^784-\d{4}-\d{7}-\d{1}$/.test(plaintext)) return '****'
  return `784-****-*******-${plaintext.slice(-1)}`
}

/** Last 4 chars visible, rest stars. Works for any PII string. */
export function maskTail(plaintext: string | null, visible = 4): string | null {
  if (!plaintext) return null
  if (plaintext.length <= visible) return '*'.repeat(plaintext.length)
  return '•'.repeat(plaintext.length - visible) + plaintext.slice(-visible)
}

// ── Role-aware PII reveal ──────────────────────────────────────────────────
// Security spec §2.3: full IBAN, full passport, full Emirates ID visible
// only to PAYROLL_ADMIN, HR_DIRECTOR, SUPER_ADMIN, and (for own data) self.
// HR_ADMIN sees full PII WITHOUT step-up MFA in Phase 1 (per Functional Spec
// FR-AUTH-07 — step-up is enforced for IBAN unmasking at the bank-details
// endpoint specifically, not here for EID/passport).

const ROLES_WITH_FULL_PII: CoreHrRole[] = [
  'HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
]

export function canSeeFullPii(person: Person, ctx: PiiAccessContext): boolean {
  if (ctx.viewerPersonId && ctx.viewerPersonId === person.id) return true
  return ROLES_WITH_FULL_PII.includes(ctx.role as CoreHrRole)
}

/**
 * Materialise a Person row into a PersonView with PII either decrypted
 * (privileged caller) or masked (everyone else). Caller is responsible for
 * passing a sane ctx — Server Actions read it from the JWT.
 */
export function projectPerson(person: Person, ctx: PiiAccessContext): PersonView {
  const full = canSeeFullPii(person, ctx)
  const eidPlain  = full ? decryptNullable(person.emiratesId)     : null
  const passPlain = full ? decryptNullable(person.passportNumber) : null

  return {
    ...person,
    emiratesId:     full ? eidPlain  : maskEmiratesId(decryptNullable(person.emiratesId)),
    passportNumber: full ? passPlain : maskTail(decryptNullable(person.passportNumber), 4),
    piiMasked:      !full,
  }
}

// ── Emiratisation eligibility (S3-12) ──────────────────────────────────────
// "Emiratisation-eligible" = UAE national whose current job carries the
// is_emiratisation_target flag. Used for Nafis quota counters.

export function isEmiratisationEligible(p: Pick<Person, 'nationalityCategory'> & {
  jobIsEmiratisationTarget?: boolean | null
}): boolean {
  return p.nationalityCategory === 'UAE_NATIONAL' && p.jobIsEmiratisationTarget === true
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/types.ts
LINES: 73
================================================================================
/**
 * core-hr DTOs and view models.
 * Drizzle row types (Person, Contract, etc.) live in schema.ts; this file
 * holds the shapes the UI / API consumes — including PII visibility variants.
 */
import type { Person } from '@/drizzle/schema'

/** Stable role names used for PII-masking decisions. Matches Auth.js JWT. */
export type CoreHrRole =
  | 'HR_ADMIN'
  | 'PAYROLL_ADMIN'
  | 'HR_DIRECTOR'
  | 'MANAGER'
  | 'EMPLOYEE'
  | 'FINANCE'
  | 'SUPER_ADMIN'

/** What we pass to the masking helpers — the caller's identity + their role. */
export interface PiiAccessContext {
  role:     CoreHrRole | string
  /** The viewer's own personId — used to grant self-access. */
  viewerPersonId?: string
  /** When true, the JWT carried a step-up-MFA claim (S3-10 hardening). */
  stepUpVerified?: boolean
}

/**
 * Person record after PII masking has been applied.
 * Shape mirrors the persons row but PII columns may hold either the
 * decrypted plaintext (HR_ADMIN), a masked string ('784-****-*******-X'),
 * or null (caller has no claim to see the value at all).
 */
export type PersonView = Omit<
  Person,
  'emiratesId' | 'passportNumber'
> & {
  emiratesId:     string | null
  passportNumber: string | null
  /** True if any PII column on this view was masked (UI shows "reveal" CTA). */
  piiMasked: boolean
}

/** Compact row used by the list / table views. No PII at all. */
export interface PersonListRow {
  id:                 string
  personNumber:       string
  fullNameEn:         string | null
  fullNameAr:         string
  workEmail:          string | null
  legalEntityId:      string
  legalEntityCode:    string | null
  departmentId:       string | null
  departmentNameEn:   string | null
  positionId:         string | null
  positionTitleEn:    string | null
  nationalityCategory: string
  nationalityCode:    string
  assignmentStatus:   string
  hireDate:           string
  /** ACTIVE | CONFIRMED | EXTENDED | FAILED — drives the "On probation" segment */
  probationStatus:    string | null
  probationEndDate:   string | null
  isEmiratisationEligible: boolean
  isActive:           boolean
}

export interface PaginatedPersons {
  rows:       PersonListRow[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/validations.ts
LINES: 244
================================================================================
/**
 * core-hr Zod validators.
 * Every Server Action input MUST be validated by a schema declared here
 * (Hard Rule 5: auth → Zod validate → BR rules → tx + audit).
 *
 * Bilingual fields enforce EN+AR per FR-CH-15 / Hard Rule 4.
 */
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

// ── Format validators (FR-CH-13, FR-CH-14, BR-WPS-004) ─────────────────────

// Emirates ID — accepts BOTH the dashed printed form and the raw 15-digit
// NFC-read form (QA-Audit-M7). Use `normalizeEmiratesId` before persistence
// so DB always sees the canonical dashed form.
export const EMIRATES_ID_REGEX = /^(?:784-\d{4}-\d{7}-\d{1}|784\d{12})$/
// UAE IBAN: AE + 21 digits = 23 chars total (BR-WPS-004)
export const UAE_IBAN_REGEX    = /^AE\d{21}$/
// ISO 3166-1 alpha-3 country code, e.g. ARE
export const ISO_COUNTRY_REGEX = /^[A-Z]{3}$/

/**
 * Normalize a UAE Emirates ID to the canonical dashed form
 * `784-XXXX-XXXXXXX-X`. Accepts dashed or raw 15-digit input. Throws on
 * invalid format.
 */
export function normalizeEmiratesId(value: string): string {
  const cleaned = value.trim()
  if (/^784-\d{4}-\d{7}-\d{1}$/.test(cleaned)) return cleaned
  if (/^784\d{12}$/.test(cleaned)) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 14)}-${cleaned.slice(14, 15)}`
  }
  throw new Error('BR-EID-001: Emirates ID must match 784-XXXX-XXXXXXX-X or 784XXXXXXXXXXXX')
}

// ── Enums (kept aligned with persons schema) ───────────────────────────────

export const Gender              = z.enum(['MALE', 'FEMALE', 'NOT_SPECIFIED'])
export const MaritalStatus       = z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'NOT_SPECIFIED'])
export const NationalityCategory = z.enum(['UAE_NATIONAL', 'GCC_NATIONAL', 'EXPAT'])
export const EmploymentType      = z.enum([
  'FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED',
])
export const AssignmentStatus = z.enum([
  'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'RETIRED', 'DECEASED',
  'PENDING_HIRE', 'PENDING_APPROVAL',
])
export const VisaStatus       = z.enum(['VALID', 'EXPIRING', 'EXPIRED', 'CANCELLED'])
// Blood type — 8 ABO+Rh values; stored as code, displayed with +/- suffix
export const BloodType        = z.enum(['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'])
// Worker classification — separate axis from employment_type (work arrangement)
export const WorkerCategory   = z.enum(['FTE', 'CONTINGENT', 'CONTRACTOR'])

// ── Composable sections ────────────────────────────────────────────────────

const PersonIdentity = z.object({
  firstNameEn:  z.string().trim().min(1).max(100),
  middleNameEn: z.string().trim().max(100).optional(),
  lastNameEn:   z.string().trim().min(1).max(100),
  // FR-CH-15: AR full name mandatory for UAE-based persons.
  // Auto-translation fills this when the user omits it; the server action
  // enforces the non-empty constraint after translation resolves.
  fullNameAr:    z.string().trim().max(300).default(''),
  preferredName: z.string().trim().max(100).optional(),
  salutation:    z.string().trim().max(20).optional(),
  dateOfBirth:   hrDateString().describe('date_of_birth must be YYYY-MM-DD'),
  gender:        Gender,
  maritalStatus:      MaritalStatus.optional(),
  numberOfDependents: z.number().int().min(0).max(20).default(0),
})

const PersonNationality = z.object({
  nationalityCode:      z.string().regex(ISO_COUNTRY_REGEX, 'ISO 3166-1 alpha-3'),
  nationalityCategory:  NationalityCategory,
  religion:             z.string().max(50).optional(),
  religionConsentGiven: z.boolean().default(false),
  // PDPL-sensitive — only store when sensitiveDataConsent=true (server-side gate)
  bloodType:            BloodType.optional().nullable(),
})

const PersonPii = z.object({
  // EID format checked here BEFORE encryption — the encrypted ciphertext
  // never round-trips through this validator (it lives in DB only).
  emiratesId:        z.string().regex(EMIRATES_ID_REGEX, 'BR-EID-001 format 784-XXXX-XXXXXXX-X').optional(),
  emiratesIdExpiry:  hrDateString().optional(),
  passportNumber:    z.string().trim().min(6).max(20).optional(),
  passportCountry:   z.string().regex(ISO_COUNTRY_REGEX).optional(),
  passportIssueDate: hrDateString().optional(),
  passportExpiry:    hrDateString().optional(),
  visaNumber:    z.string().trim().max(30).optional(),
  visaType:      z.string().trim().max(50).optional(),
  visaIssueDate: hrDateString().optional(),
  visaExpiry:    hrDateString().optional(),
  visaStatus:    VisaStatus.optional(),
  labourCardNumber:        z.string().trim().max(50).optional(),
  labourCardExpiry:        hrDateString().optional(),
  mohreLabourPermitNumber: z.string().trim().max(50).optional(),
  familyBookNumber:        z.string().trim().max(50).optional(),
  nafisRegistrationNumber: z.string().trim().max(50).optional(),
})

const PersonEmployment = z.object({
  legalEntityId:          z.string().uuid(),
  employmentType:         EmploymentType,
  contractedHoursPerWeek: z.number().min(1).max(48).default(48),
  assignmentStatus:       AssignmentStatus.default('PENDING_HIRE'),
  hireDate:         hrDateString(),
  seniorityDate:    hrDateString().optional(),
  originalHireDate: hrDateString().optional(),
  // BR-PR-001 — max 6 months from hire; cross-field check below
  probationEndDate:    hrDateString().optional(),
  noticePeriodDays:    z.number().int().min(0).max(180).default(30),
  // Initial pointers — when the contract + worker_assignment land (S3-04/05),
  // these are kept in sync. For createPerson, all are optional.
  currentDepartmentId: z.string().uuid().optional(),
  currentPositionId:   z.string().uuid().optional(),
  currentJobId:        z.string().uuid().optional(),
  currentLocationId:   z.string().uuid().optional(),
  currentGradeId:      z.string().uuid().optional(),
  lineManagerId:        z.string().uuid().optional(),
  dottedLineManagerId:  z.string().uuid().optional(),
  hrRepresentativeId:   z.string().uuid().optional(),
  projectId:            z.string().uuid().optional(),
  allocationPercentage: z.number().min(0).max(100).optional(),
  // Task 2C — new employment classification fields
  workerCategory:          WorkerCategory.optional().nullable(),
  employeeCode:            z.string().trim().max(50).optional().nullable(),
  probationMonthsGranted:  z.number().int().min(1).max(6).optional().nullable(),
})

const PersonPreferences = z.object({
  preferredLanguage:   z.enum(['en', 'ar']).default('en'),
  notificationChannel: z.enum(['EMAIL', 'PUSH', 'PUSH_AND_EMAIL', 'NONE']).default('PUSH_AND_EMAIL'),
})

// ── createPerson input ─────────────────────────────────────────────────────

export const CreatePersonSchema = PersonIdentity
  .merge(PersonNationality)
  .merge(PersonPii)
  .merge(PersonEmployment)
  .merge(PersonPreferences)
  .extend({
    // Custom-field bag (Configuration Framework §3) — validated separately
    // against custom_field_definitions in services.ts (Sprint 4 hardening).
    extraData: z.record(z.string(), z.unknown()).default({}),
    // GAP-C04: PDPL consent — required at point of data collection
    // UAE PDPL Article 11: employment contract = legal basis; explicit consent for sensitive data
    pdplConsentGiven:     z.boolean().default(false),
    sensitiveDataConsent: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // BR-PR-001 — probationEndDate must not exceed hireDate + 6 months
    if (data.probationEndDate) {
      const hire = new Date(data.hireDate)
      const probEnd = new Date(data.probationEndDate)
      const sixMonths = new Date(hire)
      sixMonths.setMonth(sixMonths.getMonth() + 6)
      if (probEnd > sixMonths) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['probationEndDate'],
          message: 'BR-PR-001: probation period exceeds 6 months · BR-PR-001: فترة الاختبار تتجاوز 6 أشهر',
        })
      }
      if (probEnd < hire) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['probationEndDate'],
          message: 'probationEndDate cannot precede hireDate · لا يمكن أن يسبق تاريخ انتهاء الاختبار تاريخ التعيين',
        })
      }
    }
    // FR-CH-16: nationalityCategory=UAE_NATIONAL implies nationalityCode=ARE.
    if (data.nationalityCategory === 'UAE_NATIONAL' && data.nationalityCode !== 'ARE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nationalityCategory'],
        message: 'UAE_NATIONAL requires nationalityCode=ARE',
      })
    }
    // BR-EOSB-004 routing flag: a person flagged UAE_NATIONAL without a
    // family_book_number is allowed but warned downstream — not a hard error.
  })

export type CreatePersonInput = z.infer<typeof CreatePersonSchema>

// ── updatePerson input ─────────────────────────────────────────────────────
export const UpdatePersonSchema = PersonIdentity.partial()
  .merge(PersonNationality.partial())
  .merge(PersonPii.partial())
  .merge(PersonPreferences.partial())
  .extend({
    extraData: z.record(z.string(), z.unknown()).optional(),
    // Insurance — purely admin-managed, kept here for HR_ADMIN updates.
    insuranceCardNumber:   z.string().max(100).optional(),
    insuranceMemberId:     z.string().max(100).optional(),
    insuranceProviderName: z.string().max(200).optional(),
    insuranceNetwork:      z.string().max(100).optional(),
    insuranceCategory:     z.string().max(50).optional(),
    insuranceEffectiveDate: hrDateString().optional(),
    insuranceExpiryDate:    hrDateString().optional(),
    insuranceStatus: z.enum([
      'ENROLLED', 'PENDING_ENROLMENT', 'RENEWAL_DUE', 'EXPIRED', 'CANCELLED', 'NOT_ENROLLED',
    ]).optional(),
    // Employment snapshot (denormalised on persons row — direct admin override).
    assignmentStatus:       z.string().optional(),
    currentDepartmentId:    z.string().uuid().optional().nullable(),
    currentPositionId:      z.string().uuid().optional().nullable(),
    currentGradeId:         z.string().uuid().optional().nullable(),
    currentLocationId:      z.string().uuid().optional().nullable(),
    lineManagerId:          z.string().uuid().optional().nullable(),
    // Task 2C — employment fields now editable via UpdatePersonSchema
    workerCategory:          WorkerCategory.optional().nullable(),
    employeeCode:            z.string().trim().max(50).optional().nullable(),
    currentJobId:            z.string().uuid().optional().nullable(),
    dottedLineManagerId:     z.string().uuid().optional().nullable(),
    noticePeriodDays:        z.number().int().min(0).max(180).optional(),
    probationMonthsGranted:  z.number().int().min(1).max(6).optional().nullable(),
  })

export type UpdatePersonInput = z.infer<typeof UpdatePersonSchema>

// ── listPersons filter ─────────────────────────────────────────────────────

export const ListPersonsFilterSchema = z.object({
  page:          z.number().int().min(1).default(1),
  pageSize:      z.number().int().min(1).max(200).default(25),
  search:        z.string().trim().max(200).optional(),
  legalEntityId: z.string().uuid().optional(),
  departmentId:  z.string().uuid().optional(),
  // Filter to employees whose current department is headed by this person
  // (employee → currentDepartmentId → departments.head_person_id == this).
  departmentHeadId: z.string().uuid().optional(),
  projectId:     z.string().uuid().optional(),
  status:        AssignmentStatus.optional(),
  isActive:      z.boolean().optional(),
  // S3-12: filter to UAE Nationals on Emiratisation-target jobs
  emiratisationEligibleOnly: z.boolean().optional(),
  sortColumn:    z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
})

export type ListPersonsFilter = z.infer<typeof ListPersonsFilterSchema>


================================================================================
FILE [P3-01/03/04]: modules/core-hr/work-schedule-assignment-actions.ts
LINES: 219
================================================================================
'use server'

import { db } from '@/lib/db'
import { workScheduleAssignments, workerAssignments } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { addDays, EFFECTIVE_END_OF_TIME } from '@/lib/effective-date'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/app-error'

// ── Schemas ───────────────────────────────────────────────────────────────────

const AssignSchema = z.object({
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  workScheduleId:     z.string().uuid(),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  assignmentReason:   z.string().max(200).optional().nullable(),
  notes:              z.string().max(2000).optional().nullable(),
})

export type AssignWorkScheduleInput = z.infer<typeof AssignSchema>

const CorrectAssignmentSchema = z.object({
  assignmentId:       z.string().uuid(),
  correctionNote:     z.string().min(1).max(1000),
  workScheduleId:     z.string().uuid().optional(),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assignmentReason:   z.string().max(200).optional().nullable(),
  notes:              z.string().max(2000).optional().nullable(),
})

export type CorrectWorkScheduleAssignmentInput = z.infer<typeof CorrectAssignmentSchema>

// ── assignWorkSchedule ────────────────────────────────────────────────────────
// Business event: close the current open row, open a new one.

export async function assignWorkSchedule(
  input: AssignWorkScheduleInput,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data  = AssignSchema.parse(input)

    await db.transaction(async tx => {
      // Close any current open assignment for this person
      const [existing] = await tx
        .select({ id: workScheduleAssignments.id })
        .from(workScheduleAssignments)
        .where(
          and(
            eq(workScheduleAssignments.tenantId, TENANT_ID),
            eq(workScheduleAssignments.personId, data.personId),
            eq(workScheduleAssignments.isCurrent, true),
          ),
        )
        .limit(1)

      if (existing) {
        await tx
          .update(workScheduleAssignments)
          .set({
            effectiveEndDate: addDays(data.effectiveStartDate, -1),
            isCurrent:        false,
            updatedBy:        actor.id,
            updatedByName:    actor.name,
            lastUpdatedDate:  new Date(),
          })
          .where(eq(workScheduleAssignments.id, existing.id))
      }

      // Open new assignment row
      const [inserted] = await tx
        .insert(workScheduleAssignments)
        .values({
          tenantId:           TENANT_ID,
          personId:           data.personId,
          legalEntityId:      data.legalEntityId,
          workScheduleId:     data.workScheduleId,
          assignmentReason:   data.assignmentReason ?? null,
          effectiveStartDate: data.effectiveStartDate,
          effectiveEndDate:   EFFECTIVE_END_OF_TIME,
          isCurrent:          true,
          actionMode:         'UPDATE',
          assignedBy:         actor.id,
          notes:              data.notes ?? null,
          createdBy:          actor.id,
          createdByName:      actor.name,
        })
        .returning({ id: workScheduleAssignments.id })

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          actorEntityId: data.legalEntityId,
          channel:       'WEB',
          eventType:     'WORK_SCHEDULE.ASSIGNMENT.CREATED',
          resourceType:  'work_schedule_assignments',
          resourceId:    inserted.id,
          entityId:      data.legalEntityId,
          newValues:     data as unknown as Record<string, unknown>,
          description:   `Work schedule assigned to person ${data.personId}`,
        },
        tx,
      )

      // Sync workerAssignments.workScheduleId so getPersonSchedule (timesheets)
      // immediately reflects the new schedule without needing a separate update.
      await tx
        .update(workerAssignments)
        .set({ workScheduleId: data.workScheduleId })
        .where(
          and(
            eq(workerAssignments.tenantId, TENANT_ID),
            eq(workerAssignments.personId, data.personId),
            eq(workerAssignments.isCurrent, true),
          ),
        )
    })

    revalidatePath('/employees')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'assignWorkSchedule') }
  }
}

// ── correctWorkScheduleAssignment ─────────────────────────────────────────────
// In-place correction: updates the current row without creating history.
// Requires HR_DIRECTOR or SUPER_ADMIN.

export async function correctWorkScheduleAssignment(
  input: CorrectWorkScheduleAssignmentInput,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    const data  = CorrectAssignmentSchema.parse(input)

    await db.transaction(async tx => {
      const [current] = await tx
        .select()
        .from(workScheduleAssignments)
        .where(eq(workScheduleAssignments.id, data.assignmentId))
        .limit(1)

      if (!current) throw new Error('Work schedule assignment not found.')

      const oldValues = { ...current } as unknown as Record<string, unknown>

      await tx
        .update(workScheduleAssignments)
        .set({
          workScheduleId:     data.workScheduleId     ?? current.workScheduleId,
          effectiveStartDate: data.effectiveStartDate ?? current.effectiveStartDate,
          assignmentReason:   data.assignmentReason   !== undefined ? data.assignmentReason : current.assignmentReason,
          notes:              data.notes              !== undefined ? data.notes              : current.notes,
          actionMode:         'CORRECTION',
          correctsRowId:      null,
          updatedBy:          actor.id,
          updatedByName:      actor.name,
          lastUpdatedDate:    new Date(),
        })
        .where(eq(workScheduleAssignments.id, data.assignmentId))

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          actorEntityId: current.legalEntityId,
          channel:       'WEB',
          eventType:     'WORK_SCHEDULE.ASSIGNMENT.CORRECTED',
          resourceType:  'work_schedule_assignments',
          resourceId:    data.assignmentId,
          entityId:      current.legalEntityId,
          oldValues,
          newValues:     data as unknown as Record<string, unknown>,
          metadata:      { correctionNote: data.correctionNote },
          description:   `Work schedule assignment corrected for person ${current.personId}`,
        },
        tx,
      )
    })

    revalidatePath('/employees')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'correctWorkScheduleAssignment') }
  }
}

// ── getWorkScheduleAssignmentHistory ─────────────────────────────────────────

export async function getWorkScheduleAssignmentHistory(personId: string) {
  return db
    .select({
      id:                 workScheduleAssignments.id,
      workScheduleId:     workScheduleAssignments.workScheduleId,
      effectiveStartDate: workScheduleAssignments.effectiveStartDate,
      effectiveEndDate:   workScheduleAssignments.effectiveEndDate,
      isCurrent:          workScheduleAssignments.isCurrent,
      actionMode:         workScheduleAssignments.actionMode,
      assignmentReason:   workScheduleAssignments.assignmentReason,
      createdDate:        workScheduleAssignments.createdDate,
    })
    .from(workScheduleAssignments)
    .where(
      and(
        eq(workScheduleAssignments.tenantId, TENANT_ID),
        eq(workScheduleAssignments.personId, personId),
      ),
    )
    .orderBy(workScheduleAssignments.effectiveStartDate)
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/worker-assignments/actions.ts
LINES: 93
================================================================================
'use server'

/**
 * S3-05 — Worker assignment Server Actions.
 *
 * Worker assignments are EFFECTIVE-DATED (Hard Rule 3). When any of
 * (department, position, job, grade, location, manager, employment_type,
 * work_schedule) changes, we close the current row (effective_end_date =
 * effectiveDate - 1; is_current=false) and insert a new one starting on
 * effectiveDate. The full history is preserved forever.
 *
 * QA-Audit-C3 — actual DB work lives in ./services.ts (tx-aware helpers)
 * so employment-actions can reuse them inside a single transaction.
 */
import { translateError } from '@/lib/app-error'
import { eq } from 'drizzle-orm'
import { persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import {
  CreateWorkerAssignmentSchema, ChangeWorkerAssignmentSchema,
  type CreateWorkerAssignmentInput, type ChangeWorkerAssignmentInput,
} from './validations'
import { createAssignmentTx, changeAssignmentTx } from './services'

// ══════════════════════════════════════════════════════════════════════════
// 1 — createWorkerAssignment (used at hire — no current row exists)
// ══════════════════════════════════════════════════════════════════════════

export async function createWorkerAssignment(
  input: CreateWorkerAssignmentInput,
): Promise<{ id: string; assignmentNumber: string }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = CreateWorkerAssignmentSchema.parse(input)

  return await db.transaction(async tx => {
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, data.personId)).limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity assignment not allowed')
    }

    return createAssignmentTx(tx, {
      id:            user.id,
      name:          user.name,
      role:          user.role,
      personId:      user.personId,
      legalEntityId: user.legalEntityId,
    }, data)
  })
  } catch (e) { translateError(e, 'createWorkerAssignment') }
}

// ══════════════════════════════════════════════════════════════════════════
// 2 — changeWorkerAssignment (close-current + open-new — effective-dated)
// ══════════════════════════════════════════════════════════════════════════

export async function changeWorkerAssignment(
  input: ChangeWorkerAssignmentInput,
): Promise<{ closedId: string | null; newId: string; newAssignmentNumber: string | null }> {
  try {
  const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  const data = ChangeWorkerAssignmentSchema.parse(input)

  return await db.transaction(async tx => {
    const [person] = await tx
      .select({ legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, data.personId)).limit(1)
    if (!person) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity change not allowed')
    }

    const result = await changeAssignmentTx(tx, {
      id:            user.id,
      name:          user.name,
      role:          user.role,
      personId:      user.personId,
      legalEntityId: user.legalEntityId,
    }, data)

    return {
      closedId:            result.mode === 'UPDATE' ? result.closedId : null,
      newId:               result.mode === 'UPDATE' ? result.newId : result.mode === 'FUTURE_DATED' ? result.futureId : result.correctedId,
      newAssignmentNumber: result.mode === 'UPDATE' ? result.newAssignmentNumber : result.mode === 'FUTURE_DATED' ? result.futureAssignmentNumber : null,
    }
  })
  } catch (e) { translateError(e, 'changeWorkerAssignment') }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/worker-assignments/services.ts
LINES: 1256
================================================================================
/**
 * Tx-aware helpers used internally by worker-assignments AND
 * employment-actions. Pure async functions — NOT Server Actions.
 *
 * QA-Audit-C3 fix — employment-actions.ts used to open a SECOND tx for
 * employment_action insert + persons sync, after worker-assignments had
 * already committed its own tx. If the second tx failed, worker_assignments
 * was orphaned. These helpers accept a caller-supplied tx so all writes
 * land atomically.
 *
 * Caller is expected to have ALREADY:
 *   • authenticated + role-checked (requireRole)
 *   • validated input (Schema.parse)
 *   • verified entity scope
 *
 * These helpers ONLY do DB work + audit log inside the supplied tx.
 */
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import {
  workerAssignments,
  persons,
  userAccounts,
  medicalInsurancePolicySettings,
  salaryElements,
  leavePlanEnrolments,
  payrollAssignments,
} from '@/drizzle/schema'
import type { WorkerAssignment } from '@/drizzle/schema'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { addDays, EFFECTIVE_END_OF_TIME, isFutureDated, todayUae, type DateParam } from '@/lib/effective-date'
import { TENANT_ID } from '@/lib/constants'
import { enrolEmployeeTx } from '@/modules/insurance/lifecycle'
import { requireCorrectionModePermission } from '@/modules/config/guards'
import type { ActionMode, ChangeAssignmentMode } from '@/lib/action-mode'
import { getAsOfRow, workerAssignmentAsOfAdapter } from '@/lib/as-of-query'

export type { ActionMode }

// Tx shape — only the methods we need.
type Tx = {
  select:  typeof import('@/lib/db').db.select
  insert:  typeof import('@/lib/db').db.insert
  update:  typeof import('@/lib/db').db.update
  execute: typeof import('@/lib/db').db.execute
}

interface ActorContext {
  id:            string
  name:          string
  role:          string
  personId?:     string
  legalEntityId: string
}

// ── Find current active worker_assignment ─────────────────────────────────

export async function findCurrentAssignmentTx(
  tx:       Tx,
  personId: string,
  asOfDate: DateParam = todayUae(),
): Promise<WorkerAssignment | null> {
  return getAsOfRow<WorkerAssignment>(
    tx,
    workerAssignmentAsOfAdapter,
    { tenantId: TENANT_ID, personId },
    asOfDate,
  )
}

export type AssignmentSliceResolution =
  | { status: 'ok'; slice: WorkerAssignment }
  | {
      status: 'no_match'
      reason: 'NO_ASSIGNMENT_SLICE_FOR_DATE'
      personId: string
      effectiveDate: DateParam
    }
  | {
      status: 'conflict'
      reason: 'MULTIPLE_ASSIGNMENT_SLICES_FOR_DATE'
      personId: string
      effectiveDate: DateParam
      matchingIds: string[]
    }

// Read-only resolver for retroactive planning: finds the single assignment
// slice effective on the requested date without changing the timeline.
export async function resolveAssignmentSliceForDateTx(
  tx:            Tx,
  personId:      string,
  effectiveDate: DateParam,
): Promise<AssignmentSliceResolution> {
  const rows = await tx
    .select()
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      sql`${workerAssignments.effectiveStartDate} <= ${effectiveDate}`,
      sql`${workerAssignments.effectiveEndDate} >= ${effectiveDate}`,
    ))
    .limit(2)

  if (rows.length === 0) {
    return {
      status: 'no_match',
      reason: 'NO_ASSIGNMENT_SLICE_FOR_DATE',
      personId,
      effectiveDate,
    }
  }

  if (rows.length > 1) {
    return {
      status: 'conflict',
      reason: 'MULTIPLE_ASSIGNMENT_SLICES_FOR_DATE',
      personId,
      effectiveDate,
      matchingIds: rows.map(row => row.id),
    }
  }

  return { status: 'ok', slice: rows[0] }
}

// ── Auto-promote manager role ─────────────────────────────────────────────
// When a worker is assigned a line manager, upgrade that manager's
// avaniisRole from EMPLOYEE → MANAGER if they only have ESS access.

async function promoteToManagerRoleTx(
  tx:         Tx,
  actor:      ActorContext,
  managerPersonId: string,
): Promise<void> {
  const [account] = await tx
    .select({ id: userAccounts.id, avaniisRole: userAccounts.avaniisRole })
    .from(userAccounts)
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      eq(userAccounts.personId, managerPersonId),
      eq(userAccounts.avaniisRole, 'EMPLOYEE'),
      eq(userAccounts.isActive, true),
    ))
    .limit(1)

  if (!account) return  // already a manager/admin or no account linked

  await tx
    .update(userAccounts)
    .set({
      avaniisRole:   'MANAGER',
      updatedBy:     actor.id,
      updatedByName: actor.name,
      updatedDate:   new Date(),
    })
    .where(eq(userAccounts.id, account.id))

  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: actor.legalEntityId,
    channel:       'SYSTEM',
    eventType:     'USER_ACCOUNT.ROLE_AUTO_PROMOTED',
    resourceType:  'user_accounts',
    resourceId:    account.id,
    entityId:      actor.legalEntityId,
    metadata:      { previousRole: 'EMPLOYEE', newRole: 'MANAGER', reason: 'auto-promotion: has direct reports' },
  }, tx)
}

// ── Generate next assignment number (per legal entity) ────────────────────

export async function nextAssignmentNumberTx(
  tx:            Tx,
  legalEntityId: string,
): Promise<string> {
  const result = await tx
    .select({ n: sql<number>`COALESCE(COUNT(*), 0)` })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.legalEntityId, legalEntityId),
    ))
  return `WA-${String((result[0]?.n ?? 0) + 1).padStart(7, '0')}`
}

export async function lockWorkerAssignmentTimelineTx(
  tx:       Tx,
  personId: string,
): Promise<void> {
  await tx.execute(sql`SET LOCAL lock_timeout = '8000ms'`)
  await tx.execute(sql`SET LOCAL statement_timeout = '25000ms'`)
  await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15000ms'`)
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('worker_assignment:' || ${personId}))`)
}

export async function recomputeCurrentWorkerAssignmentPointerTx(
  tx:       Tx,
  user:     ActorContext,
  personId: string,
): Promise<{ currentAssignmentId: string | null }> {
  const today = todayUae()
  const [currentRow] = await tx
    .select({ id: workerAssignments.id })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
      ne(workerAssignments.assignmentStatus, 'INACTIVE'),
      sql`${workerAssignments.effectiveStartDate} <= ${today}`,
      sql`${workerAssignments.effectiveEndDate} >= ${today}`,
    ))
    .orderBy(
      desc(workerAssignments.effectiveStartDate),
      desc(workerAssignments.effectiveSequence),
      desc(workerAssignments.createdDate),
    )
    .limit(1)

  await tx
    .update(workerAssignments)
    .set({
      isCurrent:       false,
      updatedBy:       user.id,
      updatedByName:   user.name,
      lastUpdatedDate: new Date(),
    })
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, personId),
    ))

  if (currentRow) {
    await tx
      .update(workerAssignments)
      .set({
        isCurrent:       true,
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(workerAssignments.id, currentRow.id))
  }

  return { currentAssignmentId: currentRow?.id ?? null }
}

type AssignmentDownstreamImpact = {
  periodStartDate: string
  periodEndDate: string
  salaryElementCount: number
  leavePlanEnrolmentCount: number
  payrollAssignmentCount: number
  hasIntersectingDownstreamRecords: boolean
  warning: string | null
}

async function countOverlappingPersonRowsTx(
  tx:        Tx,
  table:     typeof salaryElements | typeof leavePlanEnrolments | typeof payrollAssignments,
  personId:  string,
  startDate: string,
  endDate:   string,
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(table)
    .where(and(
      eq(table.tenantId, TENANT_ID),
      eq(table.personId, personId),
      sql`${table.effectiveStartDate} <= ${endDate}`,
      sql`${table.effectiveEndDate} >= ${startDate}`,
    ))

  return Number(row?.n ?? 0)
}

async function collectAssignmentDownstreamImpactTx(
  tx:        Tx,
  personId:  string,
  startDate: string,
  endDate:   string,
): Promise<AssignmentDownstreamImpact> {
  const salaryElementCount = await countOverlappingPersonRowsTx(tx, salaryElements, personId, startDate, endDate)
  const leavePlanEnrolmentCount = await countOverlappingPersonRowsTx(tx, leavePlanEnrolments, personId, startDate, endDate)
  const payrollAssignmentCount = await countOverlappingPersonRowsTx(tx, payrollAssignments, personId, startDate, endDate)

  const hasIntersectingDownstreamRecords =
    salaryElementCount > 0 ||
    leavePlanEnrolmentCount > 0 ||
    payrollAssignmentCount > 0

  return {
    periodStartDate: startDate,
    periodEndDate:   endDate,
    salaryElementCount,
    leavePlanEnrolmentCount,
    payrollAssignmentCount,
    hasIntersectingDownstreamRecords,
    warning: hasIntersectingDownstreamRecords
      ? 'Worker assignment retro split intersects downstream effective-dated records; payroll, leave, and salary recalculation are outside ED-2D-3 scope.'
      : null,
  }
}

// ── Create a fresh worker_assignment row (only when none current exists) ─

export interface CreateAssignmentTxInput {
  personId:           string
  legalEntityId:      string
  effectiveStartDate: string
  positionId?:        string
  jobId?:             string
  departmentId:       string
  locationId?:        string
  gradeId?:           string
  businessUnitId?:    string
  lineManagerId?:     string
  dottedLineManagerId?: string
  employmentType:     string
  contractedHoursPerWeek: number
  workScheduleId?:    string
  actionType:         string
  actionReason?:      string
  primaryCostCentreCode?:   string
  secondaryCostCentreCode?: string
  costSplitPercentage?:     number
  notes?:             string
}

export async function createAssignmentTx(
  tx:    Tx,
  user:  ActorContext,
  data:  CreateAssignmentTxInput,
): Promise<{ id: string; assignmentNumber: string }> {
  // Hard Rule 3 — never overwrite a current row.
  const existing = await findCurrentAssignmentTx(tx, data.personId)
  if (existing) {
    throw new Error('person already has a current assignment; use changeAssignmentTx')
  }

  const newNum = await nextAssignmentNumberTx(tx, data.legalEntityId)
  const [row] = await tx
    .insert(workerAssignments)
    .values({
      tenantId:           TENANT_ID,
      personId:           data.personId,
      legalEntityId:      data.legalEntityId,
      assignmentNumber:   newNum,
      effectiveStartDate: data.effectiveStartDate,
      effectiveEndDate:   EFFECTIVE_END_OF_TIME,
      assignmentStatus:   'ACTIVE',
      positionId:         data.positionId,
      jobId:              data.jobId,
      departmentId:       data.departmentId,
      locationId:         data.locationId,
      gradeId:            data.gradeId,
      businessUnitId:     data.businessUnitId,
      lineManagerId:      data.lineManagerId,
      dottedLineManagerId: data.dottedLineManagerId,
      employmentType:     data.employmentType,
      contractedHoursPerWeek: data.contractedHoursPerWeek.toString(),
      workScheduleId:     data.workScheduleId,
      actionType:         data.actionType,
      actionReason:       data.actionReason,
      actionInitiatedBy:  user.personId ?? user.id,
      actionApprovedBy:   user.personId ?? user.id,
      actionApprovalDate: data.effectiveStartDate,
      primaryCostCentreCode:   data.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode,
      costSplitPercentage:     data.costSplitPercentage?.toString(),
      isCurrent:               true,
      actionMode:              'UPDATE',
      effectiveSequence:       1,
      notes:                   data.notes,
      createdBy:               user.id,
      createdByName:           user.name,
    })
    .returning({ id: workerAssignments.id })

  await writeAuditLog({
    actorId:       user.id,
    actorName:     user.name,
    actorRole:     user.role,
    actorEntityId: data.legalEntityId,
    channel:       'WEB',
    eventType:     'WORKER_ASSIGNMENT.CREATED',
    resourceType:  'worker_assignments',
    resourceId:    row.id,
    entityId:      data.legalEntityId,
    newValues: {
      assignmentNumber: newNum,
      personId: data.personId,
      departmentId: data.departmentId,
      actionType: data.actionType,
      effectiveStartDate: data.effectiveStartDate,
    },
  }, tx)

  // Auto-promote line manager from EMPLOYEE → MANAGER when they gain a direct report
  if (data.lineManagerId) {
    await promoteToManagerRoleTx(tx, user, data.lineManagerId)
  }

  // BR-INS-001: auto-enrol on hire when policy setting is enabled
  if (data.actionType === 'HIRE') {
    try {
      const [policy] = await tx
        .select({ autoEnrolOnHire: medicalInsurancePolicySettings.autoEnrolOnHire })
        .from(medicalInsurancePolicySettings)
        .where(and(
          eq(medicalInsurancePolicySettings.tenantId, TENANT_ID),
          eq(medicalInsurancePolicySettings.legalEntityId, data.legalEntityId),
        ))
        .limit(1)

      if (policy?.autoEnrolOnHire !== false) {
        await enrolEmployeeTx(tx, user, {
          personId:      data.personId,
          legalEntityId: data.legalEntityId,
          effectiveDate: data.effectiveStartDate,
        })
      }
    } catch {
      // Insurance enrolment failure must not block the hire action.
      // The HR Admin can manually enrol from the insurance tab.
    }
  }

  return { id: row.id, assignmentNumber: newNum }
}

// ── Effective-date close current + insert new (or correct in-place) ─────────

export interface ChangeAssignmentTxInput {
  personId:        string
  effectiveDate:   string
  actionType:      string
  actionReason:    string
  // UPDATE (default): close current row and open a new one — records a real business event.
  // CORRECTION: update the existing row in-place — fixes a data-entry error, no new history row.
  // FUTURE_DATED: inserts a future row (isCurrent=false) — takes effect on effectiveDate.
  mode?:           ChangeAssignmentMode
  // Required when mode=CORRECTION; captured in audit trail.
  correctionNote?: string
  positionId?:     string
  jobId?:          string
  departmentId?:   string
  locationId?:     string
  gradeId?:        string
  businessUnitId?: string
  lineManagerId?:  string
  dottedLineManagerId?: string
  employmentType?: string
  contractedHoursPerWeek?: number
  workScheduleId?: string
  primaryCostCentreCode?:   string
  secondaryCostCentreCode?: string
  costSplitPercentage?:     number
  // BR-PRJ-001: project cost-centre assignment (optional)
  projectId?:              string
  projectAllocationPct?:   number
  notes?:          string
  // Optional FK back to the employment_actions or workflow_instances row.
  sourceTransactionId?: string
}

export interface RetroSplitAssignmentTxInput {
  personId:        string
  effectiveDate:   string
  actionType:      string
  actionReason:    string
  positionId?:     string
  jobId?:          string
  departmentId?:   string
  locationId?:     string
  gradeId?:        string
  businessUnitId?: string
  lineManagerId?:  string
  dottedLineManagerId?: string
  employmentType?: string
  contractedHoursPerWeek?: number
  workScheduleId?: string
  primaryCostCentreCode?:   string
  secondaryCostCentreCode?: string
  costSplitPercentage?:     number
  projectId?:              string
  projectAllocationPct?:   number
  notes?:          string
  sourceTransactionId?: string
}

export type ChangeAssignmentTxResult =
  | { mode: 'UPDATE';       closedId: string; newId: string; newAssignmentNumber: string; current: WorkerAssignment }
  | { mode: 'CORRECTION';   correctedId: string; current: WorkerAssignment }
  | { mode: 'FUTURE_DATED'; futureId: string;  futureAssignmentNumber: string; current: WorkerAssignment }

export async function retroSplitAssignmentTx(
  tx:    Tx,
  user:  ActorContext,
  data:  RetroSplitAssignmentTxInput,
): Promise<{
  mode: 'RETRO_SPLIT'
  originalId: string
  replacementId: string
  replacementAssignmentNumber: string
}> {
  await lockWorkerAssignmentTimelineTx(tx, data.personId)

  const resolution = await resolveAssignmentSliceForDateTx(tx, data.personId, data.effectiveDate)

  if (resolution.status === 'no_match') {
    throw new Error(
      `RETRO_SPLIT_NO_ASSIGNMENT_SLICE: no worker assignment slice exists for ${data.effectiveDate}`,
    )
  }

  if (resolution.status === 'conflict') {
    throw new Error(
      `RETRO_SPLIT_CONFLICT: multiple worker assignment slices match ${data.effectiveDate}`,
    )
  }

  const slice = resolution.slice
  const sliceEffectiveEndDate = slice.effectiveEndDate ?? EFFECTIVE_END_OF_TIME

  if (data.effectiveDate === slice.effectiveStartDate) {
    throw new Error('RETRO_SPLIT_SAME_DAY_SEQUENCE_UNSUPPORTED: effectiveDate equals slice start')
  }

  if (data.effectiveDate < slice.effectiveStartDate || data.effectiveDate > sliceEffectiveEndDate) {
    throw new Error('RETRO_SPLIT_INVALID_RANGE: effectiveDate must fall inside the resolved slice')
  }

  if (slice.isCurrent || data.effectiveDate >= todayUae()) {
    throw new Error('RETRO_SPLIT_CURRENT_SLICE_UNSUPPORTED: Phase 2D-2 supports historical slices only')
  }

  const futureRows = await tx
    .select({
      id:                 workerAssignments.id,
      effectiveStartDate: workerAssignments.effectiveStartDate,
    })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.personId, data.personId),
      sql`${workerAssignments.id} <> ${slice.id}`,
      sql`${workerAssignments.effectiveStartDate} > ${data.effectiveDate}`,
      sql`${workerAssignments.effectiveStartDate} <= ${sliceEffectiveEndDate}`,
    ))
    .orderBy(workerAssignments.effectiveStartDate)
    .limit(2)

  if (futureRows.length > 1) {
    throw new Error('RETRO_SPLIT_AMBIGUOUS_FUTURE_OVERLAP: multiple later slices bound this split')
  }

  const nextFuture = futureRows[0]
  const originalOldEffectiveEndDate = sliceEffectiveEndDate
  const originalNewEffectiveEndDate = addDays(data.effectiveDate, -1)
  const replacementEffectiveEndDate = nextFuture
    ? addDays(nextFuture.effectiveStartDate, -1)
    : originalOldEffectiveEndDate

  await tx
    .update(workerAssignments)
    .set({
      effectiveEndDate: originalNewEffectiveEndDate,
      isCurrent:        false,
      updatedBy:        user.id,
      updatedByName:    user.name,
      updatedDate:      new Date(),
      lastUpdatedDate:  new Date(),
    })
    .where(eq(workerAssignments.id, slice.id))

  const newNum = await nextAssignmentNumberTx(tx, slice.legalEntityId)
  const [row] = await tx
    .insert(workerAssignments)
    .values({
      tenantId:           TENANT_ID,
      personId:           slice.personId,
      legalEntityId:      slice.legalEntityId,
      assignmentNumber:   newNum,
      effectiveStartDate: data.effectiveDate,
      effectiveEndDate:   replacementEffectiveEndDate,
      assignmentStatus:   slice.assignmentStatus,
      positionId:         data.positionId        ?? slice.positionId,
      jobId:              data.jobId             ?? slice.jobId,
      departmentId:       data.departmentId      ?? slice.departmentId,
      locationId:         data.locationId        ?? slice.locationId,
      gradeId:            data.gradeId           ?? slice.gradeId,
      businessUnitId:     data.businessUnitId    ?? slice.businessUnitId,
      lineManagerId:      data.lineManagerId     ?? slice.lineManagerId,
      dottedLineManagerId: data.dottedLineManagerId ?? slice.dottedLineManagerId,
      employmentType:     data.employmentType    ?? slice.employmentType,
      contractedHoursPerWeek: data.contractedHoursPerWeek?.toString() ?? slice.contractedHoursPerWeek,
      workScheduleId:     data.workScheduleId    ?? slice.workScheduleId,
      actionType:         data.actionType,
      actionReason:       data.actionReason,
      actionInitiatedBy:  user.personId ?? user.id,
      actionApprovedBy:   user.personId ?? user.id,
      actionApprovalDate: data.effectiveDate,
      primaryCostCentreCode:   data.primaryCostCentreCode   ?? slice.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode ?? slice.secondaryCostCentreCode,
      costSplitPercentage:     data.costSplitPercentage?.toString() ?? slice.costSplitPercentage,
      projectId:               data.projectId               ?? slice.projectId,
      projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : slice.projectAllocationPct,
      isCurrent:               false,
      actionMode:              'RETRO_SPLIT',
      effectiveSequence:       1,
      sourceTransactionId:     data.sourceTransactionId,
      notes:                   data.notes ?? slice.notes,
      createdBy:               user.id,
      createdByName:           user.name,
    })
    .returning({ id: workerAssignments.id })

  const before: Record<string, unknown> = {
    positionId:              slice.positionId,
    jobId:                   slice.jobId,
    departmentId:            slice.departmentId,
    locationId:              slice.locationId,
    gradeId:                 slice.gradeId,
    businessUnitId:          slice.businessUnitId,
    lineManagerId:           slice.lineManagerId,
    dottedLineManagerId:     slice.dottedLineManagerId,
    employmentType:          slice.employmentType,
    contractedHoursPerWeek:  slice.contractedHoursPerWeek,
    workScheduleId:          slice.workScheduleId,
    actionType:              slice.actionType,
    actionReason:            slice.actionReason,
    primaryCostCentreCode:   slice.primaryCostCentreCode,
    secondaryCostCentreCode: slice.secondaryCostCentreCode,
    notes:                   slice.notes,
  }

  const after: Record<string, unknown> = {
    positionId:              data.positionId              ?? slice.positionId,
    jobId:                   data.jobId                   ?? slice.jobId,
    departmentId:            data.departmentId            ?? slice.departmentId,
    locationId:              data.locationId              ?? slice.locationId,
    gradeId:                 data.gradeId                 ?? slice.gradeId,
    businessUnitId:          data.businessUnitId          ?? slice.businessUnitId,
    lineManagerId:           data.lineManagerId           ?? slice.lineManagerId,
    dottedLineManagerId:     data.dottedLineManagerId     ?? slice.dottedLineManagerId,
    employmentType:          data.employmentType          ?? slice.employmentType,
    contractedHoursPerWeek:  data.contractedHoursPerWeek?.toString() ?? slice.contractedHoursPerWeek,
    workScheduleId:          data.workScheduleId          ?? slice.workScheduleId,
    actionType:              data.actionType,
    actionReason:            data.actionReason,
    primaryCostCentreCode:   data.primaryCostCentreCode   ?? slice.primaryCostCentreCode,
    secondaryCostCentreCode: data.secondaryCostCentreCode ?? slice.secondaryCostCentreCode,
    notes:                   data.notes                   ?? slice.notes,
  }

  const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)
  const downstreamImpact = await collectAssignmentDownstreamImpactTx(
    tx,
    data.personId,
    data.effectiveDate,
    replacementEffectiveEndDate,
  )

  await writeAuditLog({
    actorId:       user.id,
    actorName:     user.name,
    actorRole:     user.role,
    actorEntityId: slice.legalEntityId,
    channel:       'WEB',
    eventType:     'WORKER_ASSIGNMENT.RETRO_SPLIT',
    resourceType:  'worker_assignments',
    resourceId:    row.id,
    entityId:      slice.legalEntityId,
    oldValues:     before,
    newValues:     after,
    changedFields: diffFields(before, after),
    metadata: {
      actionType:                 data.actionType,
      actionMode:                 'RETRO_SPLIT',
      actionReason:               data.actionReason,
      effectiveDate:              data.effectiveDate,
      originalAssignmentId:       slice.id,
      originalOldEffectiveEndDate,
      originalNewEffectiveEndDate,
      replacementAssignmentId:    row.id,
      replacementEffectiveStartDate: data.effectiveDate,
      replacementEffectiveEndDate,
      nextFutureAssignmentId:     nextFuture?.id ?? null,
      nextFutureEffectiveStartDate: nextFuture?.effectiveStartDate ?? null,
      replacementIsCurrent:       false,
      existingCurrentPreserved:   true,
      currentPointerRecomputed:   true,
      recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
      downstreamImpact,
      sourceTransactionId:        data.sourceTransactionId,
    },
  }, tx)

  return {
    mode: 'RETRO_SPLIT',
    originalId: slice.id,
    replacementId: row.id,
    replacementAssignmentNumber: newNum,
  }
}

export async function changeAssignmentTx(
  tx:    Tx,
  user:  ActorContext,
  data:  ChangeAssignmentTxInput,
): Promise<ChangeAssignmentTxResult> {
  const mode: ChangeAssignmentMode = data.mode ?? 'UPDATE'

  // Role-gate: only HR_DIRECTOR and SUPER_ADMIN may use Correction Mode.
  if (mode === 'CORRECTION') requireCorrectionModePermission(user.role)

  await lockWorkerAssignmentTimelineTx(tx, data.personId)

  const current = await findCurrentAssignmentTx(tx, data.personId)
  if (!current) throw new Error('no current worker_assignment for this person')

  // ── CORRECTION MODE ───────────────────────────────────────────────────────
  // Edits the existing row in-place; does not create a new history row.
  // The old values are captured in the audit log before the write.
  if (mode === 'CORRECTION') {
    if (!data.correctionNote?.trim()) {
      throw new Error('CORRECTION mode requires a non-empty correctionNote')
    }

    const before: Record<string, unknown> = {
      positionId:              current.positionId,
      jobId:                   current.jobId,
      departmentId:            current.departmentId,
      locationId:              current.locationId,
      gradeId:                 current.gradeId,
      businessUnitId:          current.businessUnitId,
      lineManagerId:           current.lineManagerId,
      dottedLineManagerId:     current.dottedLineManagerId,
      employmentType:          current.employmentType,
      contractedHoursPerWeek:  current.contractedHoursPerWeek,
      workScheduleId:          current.workScheduleId,
      actionType:              current.actionType,
      actionReason:            current.actionReason,
      primaryCostCentreCode:   current.primaryCostCentreCode,
      secondaryCostCentreCode: current.secondaryCostCentreCode,
      notes:                   current.notes,
    }

    const after: Record<string, unknown> = {
      positionId:              data.positionId              ?? current.positionId,
      jobId:                   data.jobId                   ?? current.jobId,
      departmentId:            data.departmentId            ?? current.departmentId,
      locationId:              data.locationId              ?? current.locationId,
      gradeId:                 data.gradeId                 ?? current.gradeId,
      businessUnitId:          data.businessUnitId          ?? current.businessUnitId,
      lineManagerId:           data.lineManagerId           ?? current.lineManagerId,
      dottedLineManagerId:     data.dottedLineManagerId     ?? current.dottedLineManagerId,
      employmentType:          data.employmentType          ?? current.employmentType,
      contractedHoursPerWeek:  data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek,
      workScheduleId:          data.workScheduleId          ?? current.workScheduleId,
      actionType:              data.actionType,
      actionReason:            data.actionReason,
      primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
      notes:                   data.notes                   ?? current.notes,
    }

    await tx
      .update(workerAssignments)
      .set({
        positionId:              data.positionId              ?? current.positionId,
        jobId:                   data.jobId                   ?? current.jobId,
        departmentId:            data.departmentId            ?? current.departmentId,
        locationId:              data.locationId              ?? current.locationId,
        gradeId:                 data.gradeId                 ?? current.gradeId,
        businessUnitId:          data.businessUnitId          ?? current.businessUnitId,
        lineManagerId:           data.lineManagerId           ?? current.lineManagerId,
        dottedLineManagerId:     data.dottedLineManagerId     ?? current.dottedLineManagerId,
        employmentType:          data.employmentType          ?? current.employmentType,
        contractedHoursPerWeek:  data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek,
        workScheduleId:          data.workScheduleId          ?? current.workScheduleId,
        actionType:              data.actionType,
        actionReason:            data.actionReason,
        primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
        secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
        projectId:               data.projectId               ?? current.projectId,
        projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : current.projectAllocationPct,
        notes:                   data.notes                   ?? current.notes,
        actionMode:              'CORRECTION',
        // correctsRowId is intentionally null here — we ARE the row being
        // corrected (in-place update). The audit log holds the before/after diff.
        correctsRowId:           null,
        updatedBy:               user.id,
        updatedByName:           user.name,
        updatedDate:             new Date(),
        lastUpdatedDate:         new Date(),
      })
      .where(eq(workerAssignments.id, current.id))

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'WORKER_ASSIGNMENT.CORRECTED',
      resourceType:  'worker_assignments',
      resourceId:    current.id,
      entityId:      current.legalEntityId,
      actionMode:    'CORRECTION',
      oldValues:     before,
      newValues:     after,
      changedFields: diffFields(before, after),
      metadata: {
        correctionNote:  data.correctionNote,
        actionType:      data.actionType,
        effectiveDate:   data.effectiveDate,
      },
    }, tx)

    return { mode: 'CORRECTION', correctedId: current.id, current }
  }

  // ── FUTURE_DATED MODE ─────────────────────────────────────────────────────
  // Inserts a new row with isCurrent=false. The current row stays materialised
  // as isCurrent=true for legacy consumers, but its date range is closed to
  // effectiveDate - 1 so query-based as-of reads and exclusion constraints are
  // timeline-correct without needing a materialisation job in this phase.
  if (mode === 'FUTURE_DATED') {
    if (!isFutureDated(data.effectiveDate)) {
      throw new Error('FUTURE_DATED mode requires effectiveDate after today')
    }
    if (data.effectiveDate <= current.effectiveStartDate) {
      throw new Error('effectiveDate must be after the current row\'s start')
    }

    // Phase 2C-1: only one pending future assignment per person until
    // materialisation and cancellation repair exist. Exclude the predecessor
    // row below because this branch intentionally closes that range to D-1.
    const [existingFuture] = await tx
      .select({
        id:                 workerAssignments.id,
        assignmentNumber:   workerAssignments.assignmentNumber,
        effectiveStartDate: workerAssignments.effectiveStartDate,
      })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, data.personId),
        sql`${workerAssignments.id} <> ${current.id}`,
        sql`${workerAssignments.effectiveStartDate} > ${todayUae()}`,
        sql`${workerAssignments.effectiveEndDate} >= ${data.effectiveDate}`,
      ))
      .limit(1)
    if (existingFuture) {
      throw new Error(
        `DUPLICATE_FUTURE_CHANGE: a pending future change already exists for this person ` +
        `on ${existingFuture.effectiveStartDate} (${existingFuture.assignmentNumber}). ` +
        `Cancel it before creating a new one.`,
      )
    }

    const predecessorOldEffectiveEndDate = current.effectiveEndDate
    const predecessorNewEffectiveEndDate = addDays(data.effectiveDate, -1)

    await tx
      .update(workerAssignments)
      .set({
        effectiveEndDate: predecessorNewEffectiveEndDate,
        isCurrent:        true,
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(eq(workerAssignments.id, current.id))

    const newNum = await nextAssignmentNumberTx(tx, current.legalEntityId)
    const [row] = await tx
      .insert(workerAssignments)
      .values({
        tenantId:           TENANT_ID,
        personId:           current.personId,
        legalEntityId:      current.legalEntityId,
        assignmentNumber:   newNum,
        effectiveStartDate: data.effectiveDate,
        effectiveEndDate:   EFFECTIVE_END_OF_TIME,
        assignmentStatus:   current.assignmentStatus,
        positionId:         data.positionId        ?? current.positionId,
        jobId:              data.jobId             ?? current.jobId,
        departmentId:       data.departmentId      ?? current.departmentId,
        locationId:         data.locationId        ?? current.locationId,
        gradeId:            data.gradeId           ?? current.gradeId,
        businessUnitId:     data.businessUnitId    ?? current.businessUnitId,
        lineManagerId:      data.lineManagerId     ?? current.lineManagerId,
        dottedLineManagerId: data.dottedLineManagerId ?? current.dottedLineManagerId,
        employmentType:     data.employmentType    ?? current.employmentType,
        contractedHoursPerWeek: data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek,
        workScheduleId:     data.workScheduleId    ?? current.workScheduleId,
        actionType:         data.actionType,
        actionReason:       data.actionReason,
        actionInitiatedBy:  user.personId ?? user.id,
        primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
        secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
        costSplitPercentage:     data.costSplitPercentage?.toString() ?? current.costSplitPercentage,
        projectId:               data.projectId               ?? current.projectId,
        projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : current.projectAllocationPct,
        isCurrent:               false,  // not current until effectiveDate arrives
        actionMode:              'FUTURE_DATED',
        effectiveSequence:       1,
        sourceTransactionId:     data.sourceTransactionId,
        notes:                   data.notes ?? current.notes,
        createdBy:               user.id,
        createdByName:           user.name,
      })
      .returning({ id: workerAssignments.id })

    const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'WORKER_ASSIGNMENT.FUTURE_DATED',
      resourceType:  'worker_assignments',
      resourceId:    row.id,
      entityId:      current.legalEntityId,
      actionMode:    'FUTURE_DATED',
      metadata: {
        actionType:           data.actionType,
        actionReason:         data.actionReason,
        effectiveDate:        data.effectiveDate,
        predecessorAssignmentId: current.id,
        predecessorOldEffectiveEndDate,
        predecessorNewEffectiveEndDate,
        futureAssignmentId:   row.id,
        compatibilityIsCurrentPreserved: true,
        currentPointerRecomputed: true,
        recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
        sourceTransactionId:  data.sourceTransactionId,
      },
    }, tx)

    return { mode: 'FUTURE_DATED', futureId: row.id, futureAssignmentNumber: newNum, current }
  }

  // ── UPDATE MODE (default) ─────────────────────────────────────────────────
  // Closes the current row and opens a new one — the standard business event.
  if (data.effectiveDate <= current.effectiveStartDate) {
    throw new Error('effectiveDate must be after the current row\'s start')
  }

  const currentEffectiveEndDate = current.effectiveEndDate ?? EFFECTIVE_END_OF_TIME

  // ED-2D-3: a current row can already be date-bounded by an approved
  // future-dated assignment. A retro/current UPDATE inside that bounded slice
  // must preserve the future row and open the replacement only until F-1.
  if (currentEffectiveEndDate !== EFFECTIVE_END_OF_TIME) {
    if (data.effectiveDate > todayUae()) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_REQUIRES_RETRO_OR_CURRENT_DATE: effectiveDate must be today or earlier')
    }

    const futureBoundaryStartDate = addDays(currentEffectiveEndDate, 1)
    if (data.effectiveDate >= futureBoundaryStartDate) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_INVALID_RANGE: effectiveDate must be before the future boundary')
    }

    const futureBoundaries = await tx
      .select({
        id:                 workerAssignments.id,
        assignmentNumber:   workerAssignments.assignmentNumber,
        effectiveStartDate: workerAssignments.effectiveStartDate,
        assignmentStatus:   workerAssignments.assignmentStatus,
      })
      .from(workerAssignments)
      .where(and(
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.personId, data.personId),
        sql`${workerAssignments.id} <> ${current.id}`,
        eq(workerAssignments.actionMode, 'FUTURE_DATED'),
        sql`${workerAssignments.effectiveStartDate} > ${currentEffectiveEndDate}`,
      ))
      .orderBy(workerAssignments.effectiveStartDate)
      .limit(2)

    if (futureBoundaries.length === 0) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_MISSING_FUTURE_BOUNDARY: bounded current row has no future assignment boundary')
    }
    if (futureBoundaries.length > 1) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_MULTIPLE_FUTURE_BOUNDARIES: exactly one future assignment boundary is supported')
    }

    const futureBoundary = futureBoundaries[0]
    if (futureBoundary.assignmentStatus === 'INACTIVE') {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_INACTIVE_FUTURE_BOUNDARY: future assignment boundary is inactive')
    }
    if (futureBoundary.effectiveStartDate !== futureBoundaryStartDate) {
      throw new Error('FUTURE_BOUNDED_RETRO_SPLIT_MISSING_FUTURE_BOUNDARY: future assignment must start the day after the bounded current row')
    }

    const originalOldEffectiveEndDate = currentEffectiveEndDate
    const originalNewEffectiveEndDate = addDays(data.effectiveDate, -1)
    const replacementEffectiveEndDate = currentEffectiveEndDate

    await tx
      .update(workerAssignments)
      .set({
        effectiveEndDate: originalNewEffectiveEndDate,
        isCurrent:        false,
        updatedBy:        user.id,
        updatedByName:    user.name,
        updatedDate:      new Date(),
        lastUpdatedDate:  new Date(),
      })
      .where(eq(workerAssignments.id, current.id))

    const newNum = await nextAssignmentNumberTx(tx, current.legalEntityId)
    const [row] = await tx
      .insert(workerAssignments)
      .values({
        tenantId:           TENANT_ID,
        personId:           current.personId,
        legalEntityId:      current.legalEntityId,
        assignmentNumber:   newNum,
        effectiveStartDate: data.effectiveDate,
        effectiveEndDate:   replacementEffectiveEndDate,
        assignmentStatus:   current.assignmentStatus,
        positionId:         data.positionId        ?? current.positionId,
        jobId:              data.jobId             ?? current.jobId,
        departmentId:       data.departmentId      ?? current.departmentId,
        locationId:         data.locationId        ?? current.locationId,
        gradeId:            data.gradeId           ?? current.gradeId,
        businessUnitId:     data.businessUnitId    ?? current.businessUnitId,
        lineManagerId:      data.lineManagerId     ?? current.lineManagerId,
        dottedLineManagerId: data.dottedLineManagerId ?? current.dottedLineManagerId,
        employmentType:     data.employmentType    ?? current.employmentType,
        contractedHoursPerWeek: (data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek),
        workScheduleId:     data.workScheduleId    ?? current.workScheduleId,
        actionType:         data.actionType,
        actionReason:       data.actionReason,
        actionInitiatedBy:  user.personId ?? user.id,
        actionApprovedBy:   user.personId ?? user.id,
        actionApprovalDate: data.effectiveDate,
        primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
        secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
        costSplitPercentage:     data.costSplitPercentage?.toString() ?? current.costSplitPercentage,
        projectId:               data.projectId               ?? current.projectId,
        projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : current.projectAllocationPct,
        isCurrent:               true,
        actionMode:              'RETRO_SPLIT',
        effectiveSequence:       1,
        sourceTransactionId:     data.sourceTransactionId,
        notes:                   data.notes ?? current.notes,
        createdBy:               user.id,
        createdByName:           user.name,
      })
      .returning({ id: workerAssignments.id })

    const before: Record<string, unknown> = {
      positionId:              current.positionId,
      jobId:                   current.jobId,
      departmentId:            current.departmentId,
      locationId:              current.locationId,
      gradeId:                 current.gradeId,
      businessUnitId:          current.businessUnitId,
      lineManagerId:           current.lineManagerId,
      dottedLineManagerId:     current.dottedLineManagerId,
      employmentType:          current.employmentType,
      contractedHoursPerWeek:  current.contractedHoursPerWeek,
      workScheduleId:          current.workScheduleId,
      actionType:              current.actionType,
      actionReason:            current.actionReason,
      primaryCostCentreCode:   current.primaryCostCentreCode,
      secondaryCostCentreCode: current.secondaryCostCentreCode,
      notes:                   current.notes,
    }

    const after: Record<string, unknown> = {
      positionId:              data.positionId              ?? current.positionId,
      jobId:                   data.jobId                   ?? current.jobId,
      departmentId:            data.departmentId            ?? current.departmentId,
      locationId:              data.locationId              ?? current.locationId,
      gradeId:                 data.gradeId                 ?? current.gradeId,
      businessUnitId:          data.businessUnitId          ?? current.businessUnitId,
      lineManagerId:           data.lineManagerId           ?? current.lineManagerId,
      dottedLineManagerId:     data.dottedLineManagerId     ?? current.dottedLineManagerId,
      employmentType:          data.employmentType          ?? current.employmentType,
      contractedHoursPerWeek:  data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek,
      workScheduleId:          data.workScheduleId          ?? current.workScheduleId,
      actionType:              data.actionType,
      actionReason:            data.actionReason,
      primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
      notes:                   data.notes                   ?? current.notes,
    }

    const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)
    const downstreamImpact = await collectAssignmentDownstreamImpactTx(
      tx,
      data.personId,
      data.effectiveDate,
      replacementEffectiveEndDate,
    )

    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: current.legalEntityId,
      channel:       'WEB',
      eventType:     'WORKER_ASSIGNMENT.RETRO_SPLIT',
      resourceType:  'worker_assignments',
      resourceId:    row.id,
      entityId:      current.legalEntityId,
      oldValues:     before,
      newValues:     after,
      changedFields: diffFields(before, after),
      metadata: {
        actionType:                 data.actionType,
        actionMode:                 'RETRO_SPLIT',
        actionReason:               data.actionReason,
        effectiveDate:              data.effectiveDate,
        originalAssignmentId:       current.id,
        originalOldEffectiveEndDate,
        originalNewEffectiveEndDate,
        replacementAssignmentId:    row.id,
        replacementEffectiveStartDate: data.effectiveDate,
        replacementEffectiveEndDate,
        replacementIsCurrent:       true,
        currentPointerRecomputed:   true,
        recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
        futureBoundaryAssignmentId: futureBoundary.id,
        futureBoundaryAssignmentNumber: futureBoundary.assignmentNumber,
        futureBoundaryEffectiveStartDate: futureBoundary.effectiveStartDate,
        futureBoundaryPreserved:    true,
        futureBoundedRetroSplit:    true,
        assignmentModeCompatibility: 'UPDATE',
        downstreamImpact,
        sourceTransactionId:        data.sourceTransactionId,
      },
    }, tx)

    const effectiveManagerId = data.lineManagerId ?? current.lineManagerId
    if (effectiveManagerId) {
      await promoteToManagerRoleTx(tx, user, effectiveManagerId)
    }

    return {
      mode:                'UPDATE',
      closedId:            current.id,
      newId:               row.id,
      newAssignmentNumber: newNum,
      current,
    }
  }

  // 1) close current row.
  const closeDate = addDays(data.effectiveDate, -1)
  await tx
    .update(workerAssignments)
    .set({
      effectiveEndDate: closeDate,
      isCurrent:        false,
      updatedBy:        user.id,
      updatedByName:    user.name,
      updatedDate:      new Date(),
      lastUpdatedDate:  new Date(),
    })
    .where(eq(workerAssignments.id, current.id))

  // 2) open new row carrying forward unchanged columns.
  const newNum = await nextAssignmentNumberTx(tx, current.legalEntityId)
  const [row] = await tx
    .insert(workerAssignments)
    .values({
      tenantId:           TENANT_ID,
      personId:           current.personId,
      legalEntityId:      current.legalEntityId,
      assignmentNumber:   newNum,
      effectiveStartDate: data.effectiveDate,
      effectiveEndDate:   EFFECTIVE_END_OF_TIME,
      assignmentStatus:   current.assignmentStatus,
      positionId:         data.positionId        ?? current.positionId,
      jobId:              data.jobId             ?? current.jobId,
      departmentId:       data.departmentId      ?? current.departmentId,
      locationId:         data.locationId        ?? current.locationId,
      gradeId:            data.gradeId           ?? current.gradeId,
      businessUnitId:     data.businessUnitId    ?? current.businessUnitId,
      lineManagerId:      data.lineManagerId     ?? current.lineManagerId,
      dottedLineManagerId: data.dottedLineManagerId ?? current.dottedLineManagerId,
      employmentType:     data.employmentType    ?? current.employmentType,
      contractedHoursPerWeek: (data.contractedHoursPerWeek?.toString() ?? current.contractedHoursPerWeek),
      workScheduleId:     data.workScheduleId    ?? current.workScheduleId,
      actionType:         data.actionType,
      actionReason:       data.actionReason,
      actionInitiatedBy:  user.personId ?? user.id,
      actionApprovedBy:   user.personId ?? user.id,
      actionApprovalDate: data.effectiveDate,
      primaryCostCentreCode:   data.primaryCostCentreCode   ?? current.primaryCostCentreCode,
      secondaryCostCentreCode: data.secondaryCostCentreCode ?? current.secondaryCostCentreCode,
      costSplitPercentage:     data.costSplitPercentage?.toString() ?? current.costSplitPercentage,
      projectId:               data.projectId               ?? current.projectId,
      projectAllocationPct:    data.projectAllocationPct != null ? String(data.projectAllocationPct) : current.projectAllocationPct,
      isCurrent:               true,
      actionMode:              'UPDATE',
      sourceTransactionId:     data.sourceTransactionId,
      notes:                   data.notes ?? current.notes,
      createdBy:               user.id,
      createdByName:           user.name,
    })
    .returning({ id: workerAssignments.id })

  const currentPointer = await recomputeCurrentWorkerAssignmentPointerTx(tx, user, data.personId)

  await writeAuditLog({
    actorId:       user.id,
    actorName:     user.name,
    actorRole:     user.role,
    actorEntityId: current.legalEntityId,
    channel:       'WEB',
    eventType:     'WORKER_ASSIGNMENT.CHANGED',
    resourceType:  'worker_assignments',
    resourceId:    row.id,
    entityId:      current.legalEntityId,
    actionMode:    'UPDATE',
    metadata: {
      actionType:               data.actionType,
      actionReason:             data.actionReason,
      effectiveDate:            data.effectiveDate,
      previousAssignmentId:     current.id,
      previousAssignmentNumber: current.assignmentNumber,
      currentPointerRecomputed: true,
      recomputedCurrentAssignmentId: currentPointer.currentAssignmentId,
      sourceTransactionId:      data.sourceTransactionId,
    },
  }, tx)

  // Auto-promote new (or changed) line manager from EMPLOYEE → MANAGER
  const effectiveManagerId = data.lineManagerId ?? current.lineManagerId
  if (effectiveManagerId) {
    await promoteToManagerRoleTx(tx, user, effectiveManagerId)
  }

  return {
    mode:                'UPDATE',
    closedId:            current.id,
    newId:               row.id,
    newAssignmentNumber: newNum,
    current,
  }
}


================================================================================
FILE [P3-01/03/04]: modules/core-hr/worker-assignments/validations.ts
LINES: 58
================================================================================
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

const ActionTypeEnum = z.enum([
  'HIRE', 'TRANSFER', 'PROMOTION', 'DEMOTION', 'SALARY_REVISION',
  'CONTRACT_EXTEND', 'SUSPEND', 'REINSTATE', 'TERMINATE', 'RETIRE',
  'SECONDMENT', 'RETURN_FROM_SECONDMENT',
])
const EmploymentTypeEnum = z.enum([
  'FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED',
])

export const CreateWorkerAssignmentSchema = z.object({
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  effectiveStartDate: hrDateString(),
  positionId:         z.string().uuid().optional(),
  jobId:              z.string().uuid().optional(),
  departmentId:       z.string().uuid(),
  locationId:         z.string().uuid().optional(),
  gradeId:            z.string().uuid().optional(),
  businessUnitId:     z.string().uuid().optional(),
  lineManagerId:       z.string().uuid().optional(),
  dottedLineManagerId: z.string().uuid().optional(),
  employmentType:         EmploymentTypeEnum,
  contractedHoursPerWeek: z.number().min(1).max(48).default(48),
  workScheduleId:         z.string().uuid().optional(),
  actionType:             ActionTypeEnum.default('HIRE'),
  actionReason:           z.string().max(200).optional(),
  primaryCostCentreCode:   z.string().max(50).optional(),
  secondaryCostCentreCode: z.string().max(50).optional(),
  costSplitPercentage:     z.number().min(0).max(100).optional(),
  notes:                   z.string().max(2000).optional(),
})
export type CreateWorkerAssignmentInput = z.infer<typeof CreateWorkerAssignmentSchema>

export const ChangeWorkerAssignmentSchema = z.object({
  personId:        z.string().uuid(),
  effectiveDate:   hrDateString(),
  actionType:      ActionTypeEnum,
  actionReason:    z.string().min(1).max(200),
  positionId:          z.string().uuid().optional(),
  jobId:               z.string().uuid().optional(),
  departmentId:        z.string().uuid().optional(),
  locationId:          z.string().uuid().optional(),
  gradeId:             z.string().uuid().optional(),
  businessUnitId:      z.string().uuid().optional(),
  lineManagerId:       z.string().uuid().optional(),
  dottedLineManagerId: z.string().uuid().optional(),
  employmentType:      EmploymentTypeEnum.optional(),
  contractedHoursPerWeek: z.number().min(1).max(48).optional(),
  workScheduleId:      z.string().uuid().optional(),
  primaryCostCentreCode:   z.string().max(50).optional(),
  secondaryCostCentreCode: z.string().max(50).optional(),
  costSplitPercentage:     z.number().min(0).max(100).optional(),
  notes:                   z.string().max(2000).optional(),
})
export type ChangeWorkerAssignmentInput = z.infer<typeof ChangeWorkerAssignmentSchema>


### P3-02 SUBSTITUTE — modules/workflow (singular)

================================================================================
FILE [P3-02]: modules/workflow/actions.ts
LINES: 2055
================================================================================
'use server'

/**
 * Workflow Server Actions — Sprint 9 / BR-WF-010.
 *
 * triggerBackdatedHireApproval:
 *   Called immediately after createPerson() when hire_date > 30 days in the past.
 *   Upserts the BACKDATED_HIRE_APPROVAL workflow definition on first use,
 *   creates the workflow instance (LINE_MANAGER → HR_HOD sequential),
 *   and inserts notification_log rows for both approvers.
 *
 *   Hard Rule 1 — every DB write is inside a Drizzle tx with writeAuditLog.
 *   BR-WF-001 — approver roles from VALID_APPROVER_ROLES (guards.ts).
 *   BR-WF-010 — backdated hire > 30 days requires LINE_MANAGER + HR_HOD approval.
 */

import { randomUUID } from 'crypto'
import { translateError } from '@/lib/app-error'
import { eq, and, count, desc, asc, max, sql, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  notificationLog,
  userAccounts,
  persons,
} from '@/drizzle/schema'
import {
  workflowDefinitionsV2,
  workflowStepsV2,
  workflowInstancesV2,
  workflowStepInstances,
  approvalGroups,
  approvalGroupMembers,
  workflowDelegationRules,
  type WorkflowStepV2,
  type NewWorkflowStepV2,
  type ResolvedApprover,
  type HierarchySnapshot,
  type ContextSnapshot,
} from '@/drizzle/schema/workflow-engine'
import { previewWorkflow, submitWorkflow, type PreviewWorkflowResult } from '@/lib/workflow-engine'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { revalidatePath } from 'next/cache'

const BACKDATED_WF_CODE = 'BACKDATED_HIRE_APPROVAL'

export interface BackdatedHireWorkflowResult {
  instanceId:      string
  lineManagerName: string | null
  hrHodFound:      boolean
}

/**
 * Ensures the BACKDATED_HIRE_APPROVAL workflow definition + stages exist,
 * creates a workflow instance for the given person, and notifies approvers.
 */
export async function triggerBackdatedHireApproval(input: {
  personId:       string
  personNumber:   string
  personFullName: string
  hireDate:       string
  legalEntityId:  string
  lineManagerId:  string | null
  backdatingDays: number
  reason?:        string
}): Promise<BackdatedHireWorkflowResult> {
  try {
    const actor = await getCurrentUser()

  const {
    personId, personNumber, personFullName,
    hireDate, legalEntityId, lineManagerId,
    backdatingDays, reason,
  } = input

  let instanceId      = ''
  let lineManagerName: string | null = null
  let hrHodFound      = false

  await db.transaction(async tx => {
    // 1. Upsert v2 workflow definition (self-seeding on first use)
    let defId = ''
    let step1Id = ''
    let step2Id = ''

    const [existingDef] = await tx
      .select({ id: workflowDefinitionsV2.id })
      .from(workflowDefinitionsV2)
      .where(and(
        eq(workflowDefinitionsV2.tenantId, TENANT_ID),
        eq(workflowDefinitionsV2.workflowCode, BACKDATED_WF_CODE),
      ))
      .limit(1)

    if (existingDef) {
      defId = existingDef.id
      // Load step ids
      const steps = await tx
        .select({ id: workflowStepsV2.id, stepOrder: workflowStepsV2.stepOrder })
        .from(workflowStepsV2)
        .where(and(
          eq(workflowStepsV2.tenantId, TENANT_ID),
          eq(workflowStepsV2.workflowDefinitionId, defId),
        ))
        .orderBy(asc(workflowStepsV2.stepOrder))
      step1Id = steps.find(s => s.stepOrder === 1)?.id ?? ''
      step2Id = steps.find(s => s.stepOrder === 2)?.id ?? ''
    } else {
      const [created] = await tx
        .insert(workflowDefinitionsV2)
        .values({
          tenantId:               TENANT_ID,
          workflowCode:           BACKDATED_WF_CODE,
          workflowNameEn:         'Backdated Hire Approval',
          workflowNameAr:         'موافقة على التوظيف بأثر رجعي',
          triggerEvent:           'BACKDATED_HIRE',
          defaultHierarchyType:   'LINE_MANAGER',
          defaultSlaHours:        48,
          defaultEscalationHours: 72,
          isActive:               true,
          version:                1,
          createdBy:              actor.id,
          createdByName:          actor.name,
        })
        .returning({ id: workflowDefinitionsV2.id })
      defId = created.id

      const [s1] = await tx
        .insert(workflowStepsV2)
        .values({
          tenantId:            TENANT_ID,
          workflowDefinitionId: defId,
          stepOrder:           1,
          stepCode:            'LINE_MANAGER_APPROVAL',
          stepNameEn:          'Line Manager Approval',
          stepNameAr:          'موافقة المدير المباشر',
          hierarchyType:       'LINE_MANAGER',
          hierarchyLevel:      1,
          slaHours:            48,
          onSlaBreach:         'ESCALATE',
          canDelegate:         true,
          isOptional:          false,
          createdBy:           actor.id,
          createdByName:       actor.name,
        })
        .returning({ id: workflowStepsV2.id })
      step1Id = s1.id

      const [s2] = await tx
        .insert(workflowStepsV2)
        .values({
          tenantId:            TENANT_ID,
          workflowDefinitionId: defId,
          stepOrder:           2,
          stepCode:            'HR_HOD_APPROVAL',
          stepNameEn:          'HR Head of Department Approval',
          stepNameAr:          'موافقة رئيس قسم الموارد البشرية',
          hierarchyType:       'CUSTOM_GROUP',
          hierarchyRole:       'HR_HOD',
          slaHours:            48,
          onSlaBreach:         'ESCALATE',
          canDelegate:         false,
          isOptional:          false,
          createdBy:           actor.id,
          createdByName:       actor.name,
        })
        .returning({ id: workflowStepsV2.id })
      step2Id = s2.id
    }

    // 2. Resolve approvers
    // (person records resolved below — referenced in step instances)

    // 4. Resolve line manager person record
    let lineManagerPersonId: string | null = null
    if (lineManagerId) {
      const [mgr] = await tx
        .select({ id: persons.id, fullNameEn: persons.fullNameEn })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, lineManagerId)))
        .limit(1)
      if (mgr) {
        lineManagerPersonId = mgr.id
        lineManagerName     = mgr.fullNameEn ?? null
      }
    }

    // 5. Resolve HR_HOD person (fall back to HR_ADMIN)
    let hodPersonId: string | null = null

    const [hodAccount] = await tx
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(and(
        eq(userAccounts.tenantId, TENANT_ID),
        eq(userAccounts.avaniisRole, 'HR_HOD'),
        eq(userAccounts.isActive, true),
      ))
      .limit(1)

    if (hodAccount) {
      hodPersonId = hodAccount.personId
      hrHodFound  = true
    } else {
      const [adminAccount] = await tx
        .select({ personId: userAccounts.personId })
        .from(userAccounts)
        .where(and(
          eq(userAccounts.tenantId, TENANT_ID),
          eq(userAccounts.avaniisRole, 'HR_ADMIN'),
          eq(userAccounts.isActive, true),
        ))
        .limit(1)
      if (adminAccount) hodPersonId = adminAccount.personId
    }

    // 5b. Build v2 snapshots and create instance + step instances
    const slaDeadline = new Date()
    slaDeadline.setHours(slaDeadline.getHours() + 48)
    const now = new Date()

    const resolvedApprovers: ResolvedApprover[] = []
    if (lineManagerPersonId) {
      resolvedApprovers.push({
        personId:      lineManagerPersonId,
        personName:    lineManagerName ?? '',
        stepOrder:     1,
        stepCode:      'LINE_MANAGER_APPROVAL',
        hierarchyType: 'LINE_MANAGER',
        resolvedAt:    now.toISOString(),
      })
    }
    if (hodPersonId) {
      resolvedApprovers.push({
        personId:      hodPersonId,
        personName:    '',
        stepOrder:     2,
        stepCode:      'HR_HOD_APPROVAL',
        hierarchyType: 'CUSTOM_GROUP',
        resolvedAt:    now.toISOString(),
      })
    }

    const hierarchySnapshot: HierarchySnapshot = {
      encryptedAt:   now.toISOString(),
      resolvedSteps: resolvedApprovers,
      resolvedBy:    'avaniis-workflow-engine-v2',
    }
    const contextSnapshot: ContextSnapshot = {
      encryptedAt:  now.toISOString(),
      resourceType: 'persons',
      resourceId:   personId,
      fields:       { personId, personNumber, hireDate, backdatingDays, reason: reason ?? null },
    }

    instanceId = randomUUID()
    await tx.insert(workflowInstancesV2).values({
      id:                    instanceId,
      tenantId:              TENANT_ID,
      workflowDefinitionId:  defId,
      legalEntityId,
      resourceType:          'persons',
      resourceId:            personId,
      initiatedByPersonId:   actor.personId ?? personId,
      status:                'IN_PROGRESS',
      currentStepOrder:      1,
      hierarchySnapshot:     hierarchySnapshot as never,
      contextSnapshot:       contextSnapshot as never,
      resolvedSteps:         resolvedApprovers as never,
      slaDeadline,
      startedAt:             now,
      createdBy:             actor.id,
      createdByName:         actor.name,
      createdDate:           now,
    })

    // Create step instances
    if (step1Id && lineManagerPersonId) {
      await tx.insert(workflowStepInstances).values({
        id:                  randomUUID(),
        tenantId:            TENANT_ID,
        instanceId,
        stepId:              step1Id,
        stepOrder:           1,
        status:              'PENDING',
        assignedToPersonId:  lineManagerPersonId,
        slaDeadline,
        createdBy:           actor.id,
        createdByName:       actor.name,
        createdDate:         now,
      })
    }
    if (step2Id && hodPersonId) {
      await tx.insert(workflowStepInstances).values({
        id:                  randomUUID(),
        tenantId:            TENANT_ID,
        instanceId,
        stepId:              step2Id,
        stepOrder:           2,
        status:              'WAITING',
        assignedToPersonId:  hodPersonId,
        createdBy:           actor.id,
        createdByName:       actor.name,
        createdDate:         now,
      })
    }

    // 6. Notification log entries
    type NotifRow = typeof notificationLog.$inferInsert
    const notifs: NotifRow[] = []

    if (lineManagerPersonId) {
      notifs.push({
        tenantId:          TENANT_ID,
        legalEntityId,
        recipientPersonId: lineManagerPersonId,
        notificationType:  'APPROVAL_REQUIRED',
        channel:           'IN_APP',
        subjectEn:         `Backdated hire approval required — ${personFullName}`,
        bodyEn:            `${actor.name} has requested approval to add ${personFullName} (${personNumber}) ` +
                           `with a hire date of ${hireDate} (${backdatingDays} days ago).` +
                           (reason ? ` Reason: ${reason}` : ''),
        referenceType:     'WORKFLOW_INSTANCE',
        referenceId:       instanceId,
        status:            'PENDING',
        createdBy:         actor.id,
        createdByName:     actor.name,
      })
    }

    if (hodPersonId) {
      notifs.push({
        tenantId:          TENANT_ID,
        legalEntityId,
        recipientPersonId: hodPersonId,
        notificationType:  'APPROVAL_REQUIRED',
        channel:           'IN_APP',
        subjectEn:         `Backdated hire pending your review — ${personFullName}`,
        bodyEn:            `A backdated hire for ${personFullName} (${personNumber}, hire date ${hireDate}) ` +
                           `is pending Line Manager approval. You will be notified when your review is required.`,
        referenceType:     'WORKFLOW_INSTANCE',
        referenceId:       instanceId,
        status:            'PENDING',
        createdBy:         actor.id,
        createdByName:     actor.name,
      })
    }

    if (notifs.length > 0) {
      await tx.insert(notificationLog).values(notifs)
    }

    // 7. Audit row
    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: legalEntityId,
      channel:       'WEB',
      eventType:     'WORKFLOW.BACKDATED_HIRE_INITIATED',
      resourceType:  'workflow_instances_v2',
      resourceId:    instanceId,
      entityId:      legalEntityId,
      newValues: { personId, personNumber, hireDate, backdatingDays },
    }, tx)
  })

    return { instanceId, lineManagerName, hrHodFound }
  } catch (e) { translateError(e, 'triggerBackdatedHireApproval') }
}

// ══════════════════════════════════════════════════════════════════════════════
// Workflow Definitions CRUD — Unit 4 (Admin Builder)
// ══════════════════════════════════════════════════════════════════════════════

export type TriggerEvent =
  | 'LEAVE_REQUEST'
  | 'HIRE'
  | 'TRANSFER'
  | 'SALARY_REVISION'
  | 'TERMINATION'
  | 'OVERTIME_REQUEST'
  | 'EXIT_CLEARANCE'
  | 'PROBATION_CONFIRM'
  | 'VISA_RENEWAL'

export type HierarchyType = 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'

export type OnApproverNotFound =
  | 'ESCALATE_UP'
  | 'USE_FALLBACK'
  | 'ASSIGN_HR_ADMIN'
  | 'BLOCK_WITH_ERROR'

export interface WorkflowDefinitionRow {
  id:                   string
  workflowCode:         string
  workflowNameEn:       string
  workflowNameAr:       string | null
  triggerEvent:         string
  defaultHierarchyType: string | null
  defaultSlaHours:      number
  isActive:             boolean
  version:              number
  stepCount:            number
  createdDate:          Date | null
}

export interface WorkflowDefinitionInput {
  workflowCode:          string
  workflowNameEn:        string
  workflowNameAr?:       string
  description?:          string
  triggerEvent:          TriggerEvent
  defaultHierarchyType?: HierarchyType
  onApproverNotFound?:   OnApproverNotFound
  defaultSlaHours?:      number
  defaultEscalationHours?: number
  requiresMedicalCert?:  boolean
  requiresManagerComment?: boolean
}

// ── listWorkflowDefinitions ─────────────────────────────────────────────────

export async function listWorkflowDefinitions(): Promise<WorkflowDefinitionRow[]> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const defs = await db
    .select({
      id:                   workflowDefinitionsV2.id,
      workflowCode:         workflowDefinitionsV2.workflowCode,
      workflowNameEn:       workflowDefinitionsV2.workflowNameEn,
      workflowNameAr:       workflowDefinitionsV2.workflowNameAr,
      triggerEvent:         workflowDefinitionsV2.triggerEvent,
      defaultHierarchyType: workflowDefinitionsV2.defaultHierarchyType,
      defaultSlaHours:      workflowDefinitionsV2.defaultSlaHours,
      isActive:             workflowDefinitionsV2.isActive,
      version:              workflowDefinitionsV2.version,
      createdDate:          workflowDefinitionsV2.createdDate,
    })
    .from(workflowDefinitionsV2)
    .where(eq(workflowDefinitionsV2.tenantId, TENANT_ID))
    .orderBy(desc(workflowDefinitionsV2.createdDate))

  // Fetch step counts for each v2 definition
  const stepCounts = await db
    .select({
      workflowDefinitionId: workflowStepsV2.workflowDefinitionId,
      cnt:                  count(workflowStepsV2.id),
    })
    .from(workflowStepsV2)
    .where(eq(workflowStepsV2.tenantId, TENANT_ID))
    .groupBy(workflowStepsV2.workflowDefinitionId)

  const countMap = new Map<string, number>()
  for (const row of stepCounts) {
    countMap.set(row.workflowDefinitionId, Number(row.cnt))
  }

    return defs.map(d => ({
      id:                   d.id,
      workflowCode:         d.workflowCode,
      workflowNameEn:       d.workflowNameEn,
      workflowNameAr:       d.workflowNameAr ?? null,
      triggerEvent:         d.triggerEvent,
      defaultHierarchyType: d.defaultHierarchyType ?? null,
      defaultSlaHours:      d.defaultSlaHours,
      isActive:             d.isActive,
      version:              d.version,
      stepCount:            countMap.get(d.id) ?? 0,
      createdDate:          d.createdDate ?? null,
    }))
  } catch (e) { translateError(e, 'listWorkflowDefinitions') }
}

// ── createWorkflowDefinition ────────────────────────────────────────────────

export async function createWorkflowDefinition(
  input: WorkflowDefinitionInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    // Validation
    if (!input.workflowCode)    return { success: false, error: 'Workflow code is required.' }
    if (!/^[A-Z0-9_]+$/.test(input.workflowCode)) {
      return { success: false, error: 'Workflow code must be uppercase letters, digits, and underscores only.' }
    }
    if (!input.workflowNameEn) return { success: false, error: 'Workflow name (EN) is required.' }
    if (!input.triggerEvent)   return { success: false, error: 'Trigger event is required.' }
    const slaHours = input.defaultSlaHours ?? 48
    if (slaHours < 1 || slaHours > 720) {
      return { success: false, error: 'SLA hours must be between 1 and 720.' }
    }

    let newId = ''

    await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(workflowDefinitionsV2)
        .values({
          tenantId:               TENANT_ID,
          workflowCode:           input.workflowCode,
          workflowNameEn:         input.workflowNameEn,
          workflowNameAr:         input.workflowNameAr ?? null,
          description:            input.description ?? null,
          triggerEvent:           input.triggerEvent,
          defaultHierarchyType:   (input.defaultHierarchyType as 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP') ?? 'LINE_MANAGER',
          onApproverNotFound:     (input.onApproverNotFound as 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR') ?? 'ESCALATE_UP',
          defaultSlaHours:        slaHours,
          defaultEscalationHours: input.defaultEscalationHours ?? 72,
          requiresMedicalCert:    input.requiresMedicalCert ?? false,
          requiresManagerComment: input.requiresManagerComment ?? false,
          isActive:               true,
          version:                1,
          createdBy:              actor.id,
          createdByName:          actor.name ?? actor.email,
        })
        .returning({ id: workflowDefinitionsV2.id })

      newId = inserted.id

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name ?? actor.email,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'WORKFLOW_DEFINITION.CREATED',
        resourceType: 'workflow_definitions_v2',
        resourceId:   newId,
        newValues:    input as unknown as Record<string, unknown>,
        description:  `Created workflow definition ${input.workflowCode} — ${input.workflowNameEn}`,
      }, tx)
    })

      revalidatePath('/configuration/workflows')
      return { success: true, id: newId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return { success: false, error: 'A workflow with this code already exists for this tenant.' }
      }
      return { success: false, error: `Failed to create workflow: ${msg}` }
    }
  } catch (e) { translateError(e, 'createWorkflowDefinition') }
}

// ── updateWorkflowDefinition ────────────────────────────────────────────────

export async function updateWorkflowDefinition(
  id: string,
  patch: Partial<WorkflowDefinitionInput>,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      const [existing] = await db
        .select()
        .from(workflowDefinitionsV2)
        .where(and(eq(workflowDefinitionsV2.id, id), eq(workflowDefinitionsV2.tenantId, TENANT_ID)))
        .limit(1)

    if (!existing) return { success: false, error: 'Workflow definition not found.' }

    if (patch.workflowCode && !/^[A-Z0-9_]+$/.test(patch.workflowCode)) {
      return { success: false, error: 'Workflow code must be uppercase letters, digits, and underscores only.' }
    }
    if (patch.defaultSlaHours !== undefined) {
      if (patch.defaultSlaHours < 1 || patch.defaultSlaHours > 720) {
        return { success: false, error: 'SLA hours must be between 1 and 720.' }
      }
    }

    const now = new Date()

    await db.transaction(async tx => {
      await tx
        .update(workflowDefinitionsV2)
        .set({
          ...(patch.workflowNameEn         !== undefined && { workflowNameEn:         patch.workflowNameEn }),
          ...(patch.workflowNameAr         !== undefined && { workflowNameAr:         patch.workflowNameAr }),
          ...(patch.triggerEvent           !== undefined && { triggerEvent:           patch.triggerEvent }),
          ...(patch.defaultSlaHours        !== undefined && { defaultSlaHours:        patch.defaultSlaHours }),
          ...(patch.defaultEscalationHours !== undefined && { defaultEscalationHours: patch.defaultEscalationHours }),
          ...(patch.defaultHierarchyType   !== undefined && { defaultHierarchyType:   patch.defaultHierarchyType as 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP' }),
          ...(patch.onApproverNotFound     !== undefined && { onApproverNotFound:     patch.onApproverNotFound as 'ESCALATE_UP' | 'USE_FALLBACK' | 'ASSIGN_HR_ADMIN' | 'BLOCK_WITH_ERROR' }),
          ...(patch.requiresMedicalCert    !== undefined && { requiresMedicalCert:    patch.requiresMedicalCert }),
          ...(patch.requiresManagerComment !== undefined && { requiresManagerComment: patch.requiresManagerComment }),
          ...(patch.description            !== undefined && { description:            patch.description }),
          version:         existing.version + 1,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(workflowDefinitionsV2.id, id))

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name ?? actor.email,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'WORKFLOW_DEFINITION.UPDATED',
        resourceType: 'workflow_definitions_v2',
        resourceId:   id,
        oldValues:    { workflowCode: existing.workflowCode, workflowNameEn: existing.workflowNameEn },
        newValues:    patch as unknown as Record<string, unknown>,
        description:  `Updated workflow definition ${existing.workflowCode}`,
      }, tx)
    })

      revalidatePath('/configuration/workflows')
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: `Failed to update workflow: ${msg}` }
    }
  } catch (e) { translateError(e, 'updateWorkflowDefinition') }
}

// ── toggleWorkflowActive ───────────────────────────────────────────────────

export async function toggleWorkflowActive(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      const [existing] = await db
        .select({ id: workflowDefinitionsV2.id, workflowCode: workflowDefinitionsV2.workflowCode, workflowNameEn: workflowDefinitionsV2.workflowNameEn })
        .from(workflowDefinitionsV2)
        .where(and(eq(workflowDefinitionsV2.id, id), eq(workflowDefinitionsV2.tenantId, TENANT_ID)))
        .limit(1)

      if (!existing) return { success: false, error: 'Workflow definition not found.' }

      const now = new Date()

      await db.transaction(async tx => {
        await tx
          .update(workflowDefinitionsV2)
          .set({
            isActive,
            updatedBy:       actor.id,
            updatedByName:   actor.name ?? actor.email,
            lastUpdatedDate: now,
            updatedDate:     now,
          })
          .where(eq(workflowDefinitionsV2.id, id))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    isActive ? 'WORKFLOW_DEFINITION.ENABLED' : 'WORKFLOW_DEFINITION.DISABLED',
          resourceType: 'workflow_definitions_v2',
          resourceId:   id,
          description:  `${isActive ? 'Enabled' : 'Disabled'} workflow definition ${existing.workflowCode}`,
        }, tx)
      })

      revalidatePath('/configuration/workflows')
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: `Failed to toggle workflow: ${msg}` }
    }
  } catch (e) { translateError(e, 'toggleWorkflowActive') }
}


// ══════════════════════════════════════════════════════════════════════════════
// Workflow Steps v2 CRUD Actions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * List all steps for a workflow definition, ordered by stepOrder.
 */
export async function listWorkflowSteps(workflowId: string): Promise<WorkflowStepV2[]> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    return db
      .select()
      .from(workflowStepsV2)
      .where(and(
        eq(workflowStepsV2.tenantId, TENANT_ID),
        eq(workflowStepsV2.workflowDefinitionId, workflowId),
      ))
      .orderBy(asc(workflowStepsV2.stepOrder))
  } catch (e) { translateError(e, 'listWorkflowSteps') }
}

/**
 * Create a new workflow step.
 */
export async function createWorkflowStep(
  workflowId: string,
  input: NewWorkflowStepV2,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    let newId = ''

    await db.transaction(async tx => {
      // Always compute stepOrder server-side as MAX + 1 to avoid TOCTOU races.
      // The UI sends stepOrder=0 as a sentinel meaning "append at end"; we
      // never trust the client value because ?? does not fall back on 0.
      const resolvedOrder: number = await tx
        .select({ m: max(workflowStepsV2.stepOrder) })
        .from(workflowStepsV2)
        .where(and(
          eq(workflowStepsV2.tenantId, TENANT_ID),
          eq(workflowStepsV2.workflowDefinitionId, workflowId),
        ))
        .then(([row]) => (Number(row?.m ?? 0)) + 1)

      const [created] = await tx
        .insert(workflowStepsV2)
        .values({
          tenantId:              TENANT_ID,
          workflowDefinitionId:  workflowId,
          stepOrder:             resolvedOrder,
          stepCode:              input.stepCode ?? null,
          stepNameEn:            input.stepNameEn,
          stepNameAr:            input.stepNameAr ?? null,
          hierarchyType:         input.hierarchyType,
          hierarchyLevel:        input.hierarchyLevel ?? null,
          hierarchyGroupId:      input.hierarchyGroupId ?? null,
          slaHours:              input.slaHours,
          onSlaBreach:           input.onSlaBreach ?? 'ESCALATE',
          stepEffect:            input.stepEffect ?? 'NORMAL',
          activationConditionId: input.activationConditionId ?? null,
          isFyiOnly:             input.isFyiOnly ?? false,
          canDelegate:           input.canDelegate ?? true,
          isOptional:            input.isOptional ?? false,
          skipIfAlreadyApproved: input.skipIfAlreadyApproved ?? false,
          createdBy:             actor.id as unknown as string,
          createdByName:         actor.name,
        })
        .returning({ id: workflowStepsV2.id })
      newId = created.id

      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'WORKFLOW.STEP.CREATED',
        resourceType: 'workflow_steps_v2',
        resourceId:   newId,
        newValues:    { workflowId, stepOrder: resolvedOrder, stepNameEn: input.stepNameEn },
      }, tx)
    })

      return { success: true, id: newId }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'createWorkflowStep') }
}

/**
 * Update an existing workflow step.
 */
export async function updateWorkflowStep(
  stepId: string,
  patch: Partial<NewWorkflowStepV2>,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      await db.transaction(async tx => {
        await tx
          .update(workflowStepsV2)
          .set({
            ...(patch.stepCode        !== undefined && { stepCode:        patch.stepCode }),
            ...(patch.stepNameEn      !== undefined && { stepNameEn:      patch.stepNameEn }),
            ...(patch.stepNameAr      !== undefined && { stepNameAr:      patch.stepNameAr }),
            ...(patch.hierarchyType   !== undefined && { hierarchyType:   patch.hierarchyType }),
            ...(patch.hierarchyLevel       !== undefined && { hierarchyLevel:        patch.hierarchyLevel }),
            ...(patch.hierarchyGroupId     !== undefined && { hierarchyGroupId:      patch.hierarchyGroupId }),
            ...(patch.slaHours             !== undefined && { slaHours:              patch.slaHours }),
            ...(patch.onSlaBreach          !== undefined && { onSlaBreach:           patch.onSlaBreach }),
            ...(patch.stepEffect           !== undefined && { stepEffect:            patch.stepEffect }),
            ...(patch.activationConditionId !== undefined && { activationConditionId: patch.activationConditionId }),
            ...(patch.isFyiOnly             !== undefined && { isFyiOnly:             patch.isFyiOnly }),
            ...(patch.canDelegate           !== undefined && { canDelegate:           patch.canDelegate }),
            ...(patch.isOptional            !== undefined && { isOptional:            patch.isOptional }),
            ...(patch.skipIfAlreadyApproved !== undefined && { skipIfAlreadyApproved: patch.skipIfAlreadyApproved }),
            updatedBy:       actor.id as unknown as string,
            updatedByName:   actor.name,
            lastUpdatedDate: new Date(),
          })
          .where(and(
            eq(workflowStepsV2.id, stepId),
            eq(workflowStepsV2.tenantId, TENANT_ID),
          ))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'WORKFLOW.STEP.UPDATED',
          resourceType: 'workflow_steps_v2',
          resourceId:   stepId,
          newValues:    patch as Record<string, unknown>,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'updateWorkflowStep') }
}

/**
 * Delete a workflow step by id.
 */
export async function deleteWorkflowStep(
  stepId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      await db.transaction(async tx => {
        await tx
          .delete(workflowStepsV2)
          .where(and(
            eq(workflowStepsV2.id, stepId),
            eq(workflowStepsV2.tenantId, TENANT_ID),
          ))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'WORKFLOW.STEP.DELETED',
          resourceType: 'workflow_steps_v2',
          resourceId:   stepId,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'deleteWorkflowStep') }
}

/**
 * Reorder steps: accepts the full ordered list of step ids and updates
 * each row's stepOrder accordingly.
 */
export async function reorderWorkflowSteps(
  workflowId: string,
  orderedIds: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

      await db.transaction(async tx => {
        // Single UPDATE with CASE to avoid N+1 round trips
        const orderCase = sql`CASE ${sql.join(
          orderedIds.map((id, i) => sql`WHEN ${workflowStepsV2.id} = ${id} THEN ${i + 1}`),
          sql` `,
        )} END`
        await tx
          .update(workflowStepsV2)
          .set({
            stepOrder:       sql`(${orderCase})`,
            updatedBy:       actor.id as unknown as string,
            updatedByName:   actor.name,
            lastUpdatedDate: new Date(),
          })
          .where(and(
            eq(workflowStepsV2.tenantId, TENANT_ID),
            eq(workflowStepsV2.workflowDefinitionId, workflowId),
            inArray(workflowStepsV2.id, orderedIds),
          ))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'WORKFLOW.STEP.REORDERED',
          resourceType: 'workflow_steps_v2',
          newValues:    { workflowId, orderedIds },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  } catch (e) { translateError(e, 'reorderWorkflowSteps') }
}


// ══════════════════════════════════════════════════════════════════════════════
// APPROVAL GROUPS CRUD — Unit 6
// ══════════════════════════════════════════════════════════════════════════════

const GROUP_ADMIN_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const

export interface ApprovalGroupRow {
  id:           string
  groupCode:    string
  groupNameEn:  string
  groupNameAr:  string | null
  memberType:   string
  votingMethod: string
  minApprovals: number
  isActive:     boolean
  memberCount:  number
}

export interface GroupMemberRow {
  id:            string
  groupId:       string
  personId:      string
  personName:    string
  effectiveFrom: string
  effectiveTo:   string | null
  isPrimary:     boolean
  voteWeight:    number
}

// ── List all approval groups with member count ─────────────────────────────

export async function listApprovalGroups(): Promise<ApprovalGroupRow[]> {
  try {
    await requireRole([...GROUP_ADMIN_ROLES])

    const rows = await db
      .select({
        id:           approvalGroups.id,
        groupCode:    approvalGroups.groupCode,
        groupNameEn:  approvalGroups.groupNameEn,
        groupNameAr:  approvalGroups.groupNameAr,
        memberType:   approvalGroups.memberType,
        votingMethod: approvalGroups.votingMethod,
        minApprovals: approvalGroups.minApprovals,
        isActive:     approvalGroups.isActive,
        memberCount:  sql<number>`cast(count(${approvalGroupMembers.id}) as int)`,
      })
      .from(approvalGroups)
      .leftJoin(
        approvalGroupMembers,
        and(
          eq(approvalGroupMembers.groupId, approvalGroups.id),
          eq(approvalGroupMembers.tenantId, TENANT_ID),
        ),
      )
      .where(eq(approvalGroups.tenantId, TENANT_ID))
      .groupBy(approvalGroups.id)

    return rows.map(r => ({
      ...r,
      memberCount: r.memberCount ?? 0,
    }))
  } catch (e) { translateError(e, 'listApprovalGroups') }
}

// ── Create approval group ──────────────────────────────────────────────────

export async function createApprovalGroup(input: {
  groupCode:    string
  groupNameEn:  string
  groupNameAr?: string
  memberType:   string
  votingMethod: string
  minApprovals: number
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      let newId = ''
      await db.transaction(async tx => {
        const [created] = await tx
          .insert(approvalGroups)
          .values({
            tenantId:     TENANT_ID,
            groupCode:    input.groupCode.toUpperCase(),
            groupNameEn:  input.groupNameEn,
            groupNameAr:  input.groupNameAr ?? null,
            memberType:   input.memberType as 'STATIC' | 'DYNAMIC' | 'HYBRID',
            votingMethod: input.votingMethod as 'ANY_ONE' | 'MAJORITY' | 'ALL' | 'WEIGHTED',
            minApprovals: input.minApprovals,
            isActive:     true,
            createdBy:    actor.id,
            createdByName: actor.name,
          })
          .returning({ id: approvalGroups.id })
        newId = created.id

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'APPROVAL_GROUP.CREATED',
          resourceType: 'approval_groups',
          resourceId:   newId,
          newValues:    { ...input },
        }, tx)
      })

      return { success: true, id: newId }
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === '23505') {
        return { success: false, error: `A group with code "${input.groupCode.toUpperCase()}" already exists. Choose a different code, or edit the existing group to add members.` }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'createApprovalGroup') }
}

// ── Update approval group ──────────────────────────────────────────────────

export async function updateApprovalGroup(
  id: string,
  patch: {
    groupNameEn?:  string
    groupNameAr?:  string
    memberType?:   string
    votingMethod?: string
    minApprovals?: number
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      await db.transaction(async tx => {
        await tx
          .update(approvalGroups)
          .set({
            ...(patch.groupNameEn  !== undefined && { groupNameEn:  patch.groupNameEn }),
            ...(patch.groupNameAr  !== undefined && { groupNameAr:  patch.groupNameAr }),
            ...(patch.memberType   !== undefined && { memberType:   patch.memberType as 'STATIC' | 'DYNAMIC' | 'HYBRID' }),
            ...(patch.votingMethod !== undefined && { votingMethod: patch.votingMethod as 'ANY_ONE' | 'MAJORITY' | 'ALL' | 'WEIGHTED' }),
            ...(patch.minApprovals !== undefined && { minApprovals: patch.minApprovals }),
            updatedBy:       actor.id,
            updatedByName:   actor.name,
            lastUpdatedDate: new Date(),
          })
          .where(and(eq(approvalGroups.id, id), eq(approvalGroups.tenantId, TENANT_ID)))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'APPROVAL_GROUP.UPDATED',
          resourceType: 'approval_groups',
          resourceId:   id,
          newValues:    patch,
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'updateApprovalGroup') }
}

// ── Toggle group active state ──────────────────────────────────────────────

export async function toggleGroupActive(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      await db.transaction(async tx => {
        await tx
          .update(approvalGroups)
          .set({
            isActive,
            updatedBy:       actor.id,
            updatedByName:   actor.name,
            lastUpdatedDate: new Date(),
          })
          .where(and(eq(approvalGroups.id, id), eq(approvalGroups.tenantId, TENANT_ID)))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    isActive ? 'APPROVAL_GROUP.ENABLED' : 'APPROVAL_GROUP.DISABLED',
          resourceType: 'approval_groups',
          resourceId:   id,
          newValues:    { isActive },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'toggleGroupActive') }
}

// ── Add group member ───────────────────────────────────────────────────────

export async function addGroupMember(
  groupId: string,
  input: {
    personId:      string
    effectiveFrom: string
    effectiveTo?:  string
    isPrimary?:    boolean
    voteWeight?:   number
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      await db.transaction(async tx => {
        await tx
          .insert(approvalGroupMembers)
          .values({
            tenantId:      TENANT_ID,
            groupId,
            personId:      input.personId,
            effectiveFrom: input.effectiveFrom,
            effectiveTo:   input.effectiveTo ?? null,
            isPrimary:     input.isPrimary ?? false,
            voteWeight:    input.voteWeight ?? 1,
            createdBy:     actor.id,
            createdByName: actor.name,
          })

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'APPROVAL_GROUP.MEMBER_ADDED',
          resourceType: 'approval_group_members',
          resourceId:   groupId,
          newValues:    { groupId, ...input },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'addGroupMember') }
}

// ── Remove group member ────────────────────────────────────────────────────

export async function removeGroupMember(
  memberId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    try {
      const actor = await requireRole([...GROUP_ADMIN_ROLES])

      await db.transaction(async tx => {
        await tx
          .delete(approvalGroupMembers)
          .where(and(
            eq(approvalGroupMembers.id, memberId),
            eq(approvalGroupMembers.tenantId, TENANT_ID),
          ))

        await writeAuditLog({
          actorId:      actor.id,
          actorName:    actor.name,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'APPROVAL_GROUP.MEMBER_REMOVED',
          resourceType: 'approval_group_members',
          resourceId:   memberId,
          newValues:    { memberId },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'removeGroupMember') }
}

// ── List group members (with person full name) ─────────────────────────────

export async function listGroupMembers(
  groupId: string,
): Promise<GroupMemberRow[]> {
  try {
    await requireRole([...GROUP_ADMIN_ROLES])

    const rows = await db
      .select({
        id:            approvalGroupMembers.id,
        groupId:       approvalGroupMembers.groupId,
        personId:      approvalGroupMembers.personId,
        personName:    persons.fullNameEn,
        effectiveFrom: approvalGroupMembers.effectiveFrom,
        effectiveTo:   approvalGroupMembers.effectiveTo,
        isPrimary:     approvalGroupMembers.isPrimary,
        voteWeight:    approvalGroupMembers.voteWeight,
      })
      .from(approvalGroupMembers)
      .innerJoin(persons, eq(persons.id, approvalGroupMembers.personId))
      .where(and(
        eq(approvalGroupMembers.groupId, groupId),
        eq(approvalGroupMembers.tenantId, TENANT_ID),
      ))

    return rows.map(r => ({
      id:            r.id,
      groupId:       r.groupId,
      personId:      r.personId,
      personName:    r.personName ?? 'Unknown',
      effectiveFrom: r.effectiveFrom,
      effectiveTo:   r.effectiveTo ?? null,
      isPrimary:     r.isPrimary,
      voteWeight:    r.voteWeight ?? 1,
    }))
  } catch (e) { translateError(e, 'listGroupMembers') }
}


// ══════════════════════════════════════════════════════════════════════════════
// DELEGATION MANAGER — Unit 7 (Workflow Engine v2)
// ══════════════════════════════════════════════════════════════════════════════

export interface DelegationRuleRow {
  id:               string
  delegatorId:      string
  delegatorName:    string | null
  delegateId:       string
  delegateName:     string | null
  delegationFrom:   string
  delegationTo:     string
  workflowCodes:    string[] | null
  status:           string
  delegationReason: string | null
}

/**
 * List all delegation rules (admin view) with delegator + delegate names.
 */
export async function listDelegationRules(): Promise<DelegationRuleRow[]> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const rows = await db
      .select({
        id:               workflowDelegationRules.id,
        delegatorId:      workflowDelegationRules.delegatorId,
        delegateId:       workflowDelegationRules.delegateId,
        delegationFrom:   workflowDelegationRules.delegationFrom,
        delegationTo:     workflowDelegationRules.delegationTo,
        workflowCodes:    workflowDelegationRules.workflowCodes,
        status:           workflowDelegationRules.status,
        delegationReason: workflowDelegationRules.delegationReason,
      })
      .from(workflowDelegationRules)
      .where(eq(workflowDelegationRules.tenantId, TENANT_ID))
      .orderBy(workflowDelegationRules.createdDate)

    if (rows.length === 0) return []

    // Collect unique person IDs to batch-fetch names
    const personIds = [...new Set([
      ...rows.map(r => r.delegatorId),
      ...rows.map(r => r.delegateId),
    ])]

    const personRows = await db
      .select({ id: persons.id, fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(inArray(persons.id, personIds))

    const nameMap = new Map(personRows.map(p => [p.id, p.fullNameEn ?? null]))

    return rows.map(r => ({
      id:               r.id,
      delegatorId:      r.delegatorId,
      delegatorName:    nameMap.get(r.delegatorId) ?? null,
      delegateId:       r.delegateId,
      delegateName:     nameMap.get(r.delegateId) ?? null,
      delegationFrom:   r.delegationFrom,
      delegationTo:     r.delegationTo,
      workflowCodes:    r.workflowCodes ?? null,
      status:           r.status,
      delegationReason: r.delegationReason ?? null,
    }))
  } catch (e) { translateError(e, 'listDelegationRules') }
}

/**
 * Create a new delegation rule.
 * Validates against circular chains: if A→B is requested but B already delegates to A, reject.
 */
export async function createDelegationRule(input: {
  delegatorId:       string
  delegateId:        string
  legalEntityId?:    string
  delegationFrom:    string
  delegationTo:      string
  workflowCodes?:    string[]
  delegationReason?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const { delegatorId, delegateId, delegationFrom, delegationTo, workflowCodes, delegationReason } = input
  const legalEntityId = input.legalEntityId ?? actor.legalEntityId

  // Circular chain check: if delegateId already delegates TO delegatorId, reject
  const existingConflict = await db
    .select({ id: workflowDelegationRules.id, delegateName: persons.fullNameEn })
    .from(workflowDelegationRules)
    .leftJoin(persons, eq(persons.id, workflowDelegationRules.delegateId))
    .where(
      and(
        eq(workflowDelegationRules.tenantId, TENANT_ID),
        eq(workflowDelegationRules.delegatorId, delegateId),
        eq(workflowDelegationRules.delegateId, delegatorId),
        eq(workflowDelegationRules.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (existingConflict.length > 0) {
    const [nameRows] = await Promise.all([
      db
        .select({ id: persons.id, fullNameEn: persons.fullNameEn })
        .from(persons)
        .where(inArray(persons.id, [delegateId, delegatorId])),
    ])
    const nm = new Map(nameRows.map(p => [p.id, p.fullNameEn ?? null]))
    const bName = nm.get(delegateId) ?? delegateId
    const aName = nm.get(delegatorId) ?? delegatorId
    return {
      success: false,
      error: `CIRCULAR_CHAIN: ${bName} already delegates to ${aName} — circular delegation is not allowed.`,
    }
  }

  let newId = ''

  try {
    await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(workflowDelegationRules)
        .values({
          tenantId:         TENANT_ID,
          legalEntityId,
          delegatorId,
          delegateId,
          delegationFrom,
          delegationTo,
          workflowCodes:    workflowCodes && workflowCodes.length > 0 ? workflowCodes : null,
          status:           'ACTIVE',
          delegationReason: delegationReason ?? null,
          createdBy:        actor.id,
          createdByName:    actor.name,
        })
        .returning({ id: workflowDelegationRules.id })

      newId = inserted.id

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        channel:       'WEB',
        eventType:     'WORKFLOW.DELEGATION.CREATED',
        resourceType:  'workflow_delegation_rules',
        resourceId:    newId,
        newValues: { delegatorId, delegateId, delegationFrom, delegationTo, workflowCodes },
      }, tx)
    })

      return { success: true, id: newId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'createDelegationRule') }
}

/**
 * Revoke an ACTIVE delegation rule.
 */
export async function revokeDelegationRule(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    try {
      await db.transaction(async tx => {
        await tx
          .update(workflowDelegationRules)
          .set({
            status:           'REVOKED',
            delegationReason: reason ?? null,
            updatedBy:        actor.id,
            updatedByName:    actor.name,
            lastUpdatedDate:  new Date(),
          })
          .where(
            and(
              eq(workflowDelegationRules.id, id),
              eq(workflowDelegationRules.tenantId, TENANT_ID),
              eq(workflowDelegationRules.status, 'ACTIVE'),
            ),
          )

        await writeAuditLog({
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          channel:       'WEB',
          eventType:     'WORKFLOW.DELEGATION.REVOKED',
          resourceType:  'workflow_delegation_rules',
          resourceId:    id,
          newValues: { status: 'REVOKED', reason },
        }, tx)
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  } catch (e) { translateError(e, 'revokeDelegationRule') }
}


// ─── Unit 8 — Preview Chain (read-only, no DB writes) ─────────────────────

export type { PreviewWorkflowResult }

/**
 * Thin server-action wrapper around previewWorkflow() so client components
 * can call it via useTransition without importing server-only DB code.
 */
export async function previewWorkflowChain(params: {
  workflowCode: string
  submitterPersonId: string
  legalEntityId: string
  contextOverrides?: Record<string, unknown>
}): Promise<PreviewWorkflowResult | null> {
  try {
    return previewWorkflow(params)
  } catch (e) { translateError(e, 'previewWorkflowChain') }
}

// ══════════════════════════════════════════════════════════════════════════════
// Unit 9 — Employment-action workflow triggers (ME-1)
//
// triggerTransferApproval   — BR-WF-020: LINE_MANAGER → HR_ADMIN  2-step
// triggerPromotionApproval  — BR-WF-021: LINE_MANAGER → HR_DIRECTOR 2-step
// triggerTerminationApproval— BR-WF-022: LINE_MANAGER → HR_DIRECTOR 2-step (BQ-2)
//
// Each function self-seeds its workflow definition on first use and queues
// IN_APP notifications for every resolved approver.
// ══════════════════════════════════════════════════════════════════════════════

const TRANSFER_WF_CODE    = 'TRANSFER_APPROVAL'
const PROMOTION_WF_CODE   = 'PROMOTION_APPROVAL'
const TERMINATION_WF_CODE = 'TERMINATION_APPROVAL'

// ── Shared internal helper — upsert a 1-or-2-step workflow definition ────────

async function upsertTwoStepDef(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor: { id: string; name: string },
  params: {
    code:       string
    nameEn:     string
    nameAr:     string
    trigger:    string
    step1Code:  string; step1NameEn: string; step1NameAr: string; step1HType: 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'
    step2Code?: string; step2NameEn?: string; step2NameAr?: string; step2HType?: 'LINE_MANAGER' | 'POSITION' | 'CUSTOM_GROUP'; step2HRole?: string
  },
): Promise<{ defId: string; step1Id: string; step2Id: string }> {
  const [existingDef] = await tx
    .select({ id: workflowDefinitionsV2.id })
    .from(workflowDefinitionsV2)
    .where(and(
      eq(workflowDefinitionsV2.tenantId, TENANT_ID),
      eq(workflowDefinitionsV2.workflowCode, params.code),
    ))
    .limit(1)

  let defId   = ''
  let step1Id = ''
  let step2Id = ''

  if (existingDef) {
    defId = existingDef.id
    const steps = await tx
      .select({ id: workflowStepsV2.id, stepOrder: workflowStepsV2.stepOrder })
      .from(workflowStepsV2)
      .where(and(
        eq(workflowStepsV2.tenantId, TENANT_ID),
        eq(workflowStepsV2.workflowDefinitionId, defId),
      ))
      .orderBy(asc(workflowStepsV2.stepOrder))
    step1Id = steps.find(s => s.stepOrder === 1)?.id ?? ''
    step2Id = steps.find(s => s.stepOrder === 2)?.id ?? ''
  } else {
    const [created] = await tx
      .insert(workflowDefinitionsV2)
      .values({
        tenantId: TENANT_ID, workflowCode: params.code,
        workflowNameEn: params.nameEn, workflowNameAr: params.nameAr,
        triggerEvent: params.trigger, defaultHierarchyType: params.step1HType,
        defaultSlaHours: 48, defaultEscalationHours: 72,
        isActive: true, version: 1,
        createdBy: actor.id, createdByName: actor.name,
      })
      .returning({ id: workflowDefinitionsV2.id })
    defId = created.id

    const [s1] = await tx
      .insert(workflowStepsV2)
      .values({
        tenantId: TENANT_ID, workflowDefinitionId: defId,
        stepOrder: 1, stepCode: params.step1Code,
        stepNameEn: params.step1NameEn, stepNameAr: params.step1NameAr,
        hierarchyType: params.step1HType, hierarchyLevel: 1,
        slaHours: 48, onSlaBreach: 'ESCALATE', canDelegate: true, isOptional: false,
        createdBy: actor.id, createdByName: actor.name,
      })
      .returning({ id: workflowStepsV2.id })
    step1Id = s1.id

    if (params.step2Code) {
      const [s2] = await tx
        .insert(workflowStepsV2)
        .values({
          tenantId: TENANT_ID, workflowDefinitionId: defId,
          stepOrder: 2, stepCode: params.step2Code,
          stepNameEn: params.step2NameEn!, stepNameAr: params.step2NameAr!,
          hierarchyType: params.step2HType!, hierarchyRole: params.step2HRole,
          hierarchyLevel: 1,
          slaHours: 48, onSlaBreach: 'ESCALATE', canDelegate: false, isOptional: false,
          createdBy: actor.id, createdByName: actor.name,
        })
        .returning({ id: workflowStepsV2.id })
      step2Id = s2.id
    }
  }

  return { defId, step1Id, step2Id }
}

// ── Resolve a person by user role ────────────────────────────────────────────

async function resolvePersonByRole(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ...roles: string[]
): Promise<string | null> {
  for (const role of roles) {
    const [row] = await tx
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(and(
        eq(userAccounts.tenantId, TENANT_ID),
        eq(userAccounts.avaniisRole, role),
        eq(userAccounts.isActive, true),
      ))
      .limit(1)
    if (row?.personId) return row.personId
  }
  return null
}

async function readWorkflowStepSummary(instanceId: string): Promise<{
  firstApproverName: string | null
  hasSecondStep: boolean
}> {
  const rows = await db
    .select({
      stepOrder:  workflowStepInstances.stepOrder,
      fullNameEn: persons.fullNameEn,
    })
    .from(workflowStepInstances)
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(eq(workflowStepInstances.instanceId, instanceId))
    .orderBy(asc(workflowStepInstances.stepOrder))

  return {
    firstApproverName: rows[0]?.fullNameEn ?? null,
    hasSecondStep:    rows.some(row => row.stepOrder === 2),
  }
}

// ── triggerTransferApproval ───────────────────────────────────────────────────

export interface TransferWorkflowResult {
  instanceId:    string
  approverName:  string | null
  hrAdminFound:  boolean
}

/**
 * BR-WF-020 — Transfer requests require LINE_MANAGER then HR_ADMIN approval.
 * Called immediately after a transfer_requests row is created.
 */
export async function triggerTransferApproval(input: {
  personId:         string
  personNumber:     string
  personFullName:   string
  legalEntityId:    string
  lineManagerId?:   string | null // Deprecated: canonical routing ignores current-state manager handoff.
  toDepartmentId:   string
  effectiveDate:    string
  reason:           string
  transferRequestId: string
}): Promise<TransferWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const {
      personId, personNumber, personFullName,
      legalEntityId, effectiveDate, reason, transferRequestId,
    } = input

    await db.transaction(async tx => {
      await upsertTwoStepDef(tx, actor, {
        code: TRANSFER_WF_CODE,
        nameEn: 'Transfer Approval', nameAr: 'موافقة النقل',
        trigger: 'TRANSFER',
        step1Code: 'LINE_MANAGER_APPROVAL', step1NameEn: 'Line Manager Approval', step1NameAr: 'موافقة المدير المباشر', step1HType: 'LINE_MANAGER',
        step2Code: 'HR_ADMIN_APPROVAL',     step2NameEn: 'HR Admin Approval',     step2NameAr: 'موافقة مدير الموارد البشرية', step2HType: 'CUSTOM_GROUP', step2HRole: 'HR_ADMIN',
      })
    })

    const wf = await submitWorkflow({
      workflowCode:        TRANSFER_WF_CODE,
      resourceType:        'transfer_requests',
      resourceId:          transferRequestId,
      initiatedByPersonId: personId,
      legalEntityId,
      contextOverrides: {
        'workflow.as_of_date':   effectiveDate,
        'resource.effective_date': effectiveDate,
        'assignment.effective_date': effectiveDate,
        'transfer.person_number': personNumber,
        'transfer.person_name':   personFullName,
        'transfer.reason':        reason,
      },
    })
    if (!wf.success || !wf.instanceId) throw new Error(wf.error ?? 'Failed to submit transfer workflow')

    const summary = await readWorkflowStepSummary(wf.instanceId)
    await db.transaction(async tx => {
      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: legalEntityId,
        channel:      'WEB',
        eventType:    'WORKFLOW.TRANSFER_INITIATED',
        resourceType: 'workflow_instances_v2',
        resourceId:   wf.instanceId!,
        entityId:     legalEntityId,
        newValues:    { personId, personNumber, effectiveDate, reason, routingMode: 'CANONICAL_EFFECTIVE_DATED' },
      }, tx)
    })

    return { instanceId: wf.instanceId, approverName: summary.firstApproverName, hrAdminFound: summary.hasSecondStep }
  } catch (e) { translateError(e, 'triggerTransferApproval') }
}

// ── triggerPromotionApproval ──────────────────────────────────────────────────

export interface PromotionWorkflowResult {
  instanceId:      string
  approverName:    string | null
  hrDirectorFound: boolean
}

/**
 * BR-WF-021 — Promotions require LINE_MANAGER then HR_DIRECTOR approval.
 * Called immediately after a transfer_requests row (requestType=PROMOTION) is created.
 */
export async function triggerPromotionApproval(input: {
  personId:          string
  personNumber:      string
  personFullName:    string
  legalEntityId:     string
  lineManagerId?:    string | null // Deprecated: canonical routing ignores current-state manager handoff.
  fromGradeName:     string
  toGradeName:       string
  effectiveDate:     string
  reason:            string
  transferRequestId: string
}): Promise<PromotionWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const {
      personId, personNumber, personFullName,
      legalEntityId, fromGradeName, toGradeName, effectiveDate, reason, transferRequestId,
    } = input

    await db.transaction(async tx => {
      await upsertTwoStepDef(tx, actor, {
        code: PROMOTION_WF_CODE,
        nameEn: 'Promotion Approval', nameAr: 'موافقة الترقية',
        trigger: 'PROMOTION',
        step1Code: 'LINE_MANAGER_APPROVAL', step1NameEn: 'Line Manager Approval',  step1NameAr: 'موافقة المدير المباشر',  step1HType: 'LINE_MANAGER',
        step2Code: 'HR_DIRECTOR_APPROVAL',  step2NameEn: 'HR Director Approval',   step2NameAr: 'موافقة مدير الموارد البشرية', step2HType: 'CUSTOM_GROUP', step2HRole: 'HR_DIRECTOR',
      })
    })

    const wf = await submitWorkflow({
      workflowCode:        PROMOTION_WF_CODE,
      resourceType:        'transfer_requests',
      resourceId:          transferRequestId,
      initiatedByPersonId: personId,
      legalEntityId,
      contextOverrides: {
        'workflow.as_of_date':   effectiveDate,
        'resource.effective_date': effectiveDate,
        'assignment.effective_date': effectiveDate,
        'promotion.person_number': personNumber,
        'promotion.person_name':   personFullName,
        'promotion.from_grade':    fromGradeName,
        'promotion.to_grade':      toGradeName,
        'promotion.reason':        reason,
      },
    })
    if (!wf.success || !wf.instanceId) throw new Error(wf.error ?? 'Failed to submit promotion workflow')

    const summary = await readWorkflowStepSummary(wf.instanceId)
    await db.transaction(async tx => {
      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        actorEntityId: legalEntityId,
        channel:      'WEB',
        eventType:    'WORKFLOW.PROMOTION_INITIATED',
        resourceType: 'workflow_instances_v2',
        resourceId:   wf.instanceId!,
        entityId:     legalEntityId,
        newValues:    { personId, personNumber, effectiveDate, fromGradeName, toGradeName, routingMode: 'CANONICAL_EFFECTIVE_DATED' },
      }, tx)
    })

    return { instanceId: wf.instanceId, approverName: summary.firstApproverName, hrDirectorFound: summary.hasSecondStep }
  } catch (e) { translateError(e, 'triggerPromotionApproval') }
}

// ── triggerTerminationApproval ────────────────────────────────────────────────

export interface TerminationWorkflowResult {
  instanceId:       string
  lineManagerName:  string | null
  hrDirectorFound:  boolean
}

/**
 * BR-WF-022 — Contract termination requires LINE_MANAGER then HR_DIRECTOR
 * approval (2-step sequential). BQ-2 confirmed: both must sign off.
 */
export async function triggerTerminationApproval(input: {
  personId:          string
  personNumber:      string
  personFullName:    string
  legalEntityId:     string
  lineManagerId:     string | null
  terminationDate:   string
  terminationReason: string
  contractId:        string
}): Promise<TerminationWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const {
      personId, personNumber, personFullName,
      legalEntityId, lineManagerId, terminationDate, terminationReason, contractId,
    } = input

    let instanceId       = ''
    let lineManagerName: string | null = null
    let hrDirectorFound  = false

    await db.transaction(async tx => {
      const { defId, step1Id, step2Id } = await upsertTwoStepDef(tx, actor, {
        code: TERMINATION_WF_CODE,
        nameEn: 'Termination Approval', nameAr: 'موافقة إنهاء الخدمة',
        trigger: 'TERMINATION',
        step1Code: 'LINE_MANAGER_APPROVAL', step1NameEn: 'Line Manager Approval',  step1NameAr: 'موافقة المدير المباشر',       step1HType: 'LINE_MANAGER',
        step2Code: 'HR_DIRECTOR_APPROVAL',  step2NameEn: 'HR Director Approval',   step2NameAr: 'موافقة مدير الموارد البشرية', step2HType: 'CUSTOM_GROUP', step2HRole: 'HR_DIRECTOR',
      })

      // Resolve line manager
      let lmPersonId: string | null = null
      if (lineManagerId) {
        const [mgr] = await tx
          .select({ id: persons.id, fullNameEn: persons.fullNameEn })
          .from(persons)
          .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, lineManagerId)))
          .limit(1)
        if (mgr) { lmPersonId = mgr.id; lineManagerName = mgr.fullNameEn ?? null }
      }

      const hrPersonId = await resolvePersonByRole(tx, 'HR_DIRECTOR', 'HR_ADMIN')
      if (hrPersonId) hrDirectorFound = true

      const now = new Date()
      const slaDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const resolvedApprovers: ResolvedApprover[] = []

      if (lmPersonId) resolvedApprovers.push({ personId: lmPersonId, personName: lineManagerName ?? '', stepOrder: 1, stepCode: 'LINE_MANAGER_APPROVAL', hierarchyType: 'LINE_MANAGER', resolvedAt: now.toISOString() })
      if (hrPersonId) resolvedApprovers.push({ personId: hrPersonId, personName: '', stepOrder: 2, stepCode: 'HR_DIRECTOR_APPROVAL', hierarchyType: 'CUSTOM_GROUP', resolvedAt: now.toISOString() })

      const hierarchySnapshot: HierarchySnapshot = { encryptedAt: now.toISOString(), resolvedSteps: resolvedApprovers, resolvedBy: 'avaniis-workflow-engine-v2' }
      const contextSnapshot: ContextSnapshot = { encryptedAt: now.toISOString(), resourceType: 'contracts', resourceId: contractId, fields: { personId, personNumber, terminationDate, terminationReason } }

      instanceId = randomUUID()
      await tx.insert(workflowInstancesV2).values({
        id: instanceId, tenantId: TENANT_ID, workflowDefinitionId: defId, legalEntityId,
        resourceType: 'contracts', resourceId: contractId,
        initiatedByPersonId: actor.personId ?? personId,
        status: 'IN_PROGRESS', currentStepOrder: 1,
        hierarchySnapshot: hierarchySnapshot as never, contextSnapshot: contextSnapshot as never, resolvedSteps: resolvedApprovers as never,
        slaDeadline, startedAt: now, createdBy: actor.id, createdByName: actor.name, createdDate: now,
      })

      if (step1Id && lmPersonId) {
        await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step1Id, stepOrder: 1, status: 'PENDING', assignedToPersonId: lmPersonId, slaDeadline, createdBy: actor.id, createdByName: actor.name, createdDate: now })
      }
      if (step2Id && hrPersonId) {
        await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step2Id, stepOrder: 2, status: 'WAITING', assignedToPersonId: hrPersonId, createdBy: actor.id, createdByName: actor.name, createdDate: now })
      }

      type NotifRow = typeof notificationLog.$inferInsert
      const notifs: NotifRow[] = []
      if (lmPersonId) {
        notifs.push({ tenantId: TENANT_ID, legalEntityId, recipientPersonId: lmPersonId, notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP', subjectEn: `Termination approval required — ${personFullName}`, bodyEn: `${actor.name} has initiated termination for ${personFullName} (${personNumber}) effective ${terminationDate}. Reason: ${terminationReason}. Your approval is required as line manager before HR Director review.`, referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId, status: 'PENDING', createdBy: actor.id, createdByName: actor.name })
      }
      if (hrPersonId) {
        notifs.push({ tenantId: TENANT_ID, legalEntityId, recipientPersonId: hrPersonId, notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP', subjectEn: `Termination pending HR Director review — ${personFullName}`, bodyEn: `Termination of ${personFullName} (${personNumber}) effective ${terminationDate} is awaiting Line Manager approval before reaching you.`, referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId, status: 'PENDING', createdBy: actor.id, createdByName: actor.name })
      }
      if (notifs.length) await tx.insert(notificationLog).values(notifs)

      await writeAuditLog({ actorId: actor.id, actorName: actor.name, actorRole: actor.role, actorEntityId: legalEntityId, channel: 'WEB', eventType: 'WORKFLOW.TERMINATION_INITIATED', resourceType: 'workflow_instances_v2', resourceId: instanceId, entityId: legalEntityId, newValues: { personId, personNumber, terminationDate, terminationReason } }, tx)
    })

    return { instanceId, lineManagerName, hrDirectorFound }
  } catch (e) { translateError(e, 'triggerTerminationApproval') }
}

// ══════════════════════════════════════════════════════════════════════════════
// Unit 10 — Probation & Exit Clearance workflow triggers (P2-3 / P2-4)
// ══════════════════════════════════════════════════════════════════════════════

const PROBATION_WF_CODE    = 'PROBATION_CONFIRMATION'
const EXIT_CLEARANCE_WF_CODE = 'EXIT_CLEARANCE'

// ── triggerProbationConfirmationWorkflow ──────────────────────────────────────

export interface ProbationWorkflowResult {
  instanceId:      string
  lineManagerName: string | null
  hrAdminFound:    boolean
}

/**
 * P2-4 — Probation completion triggers LINE_MANAGER → HR_ADMIN 2-step review.
 * HR admin initiates; line manager confirms pass/extend/fail; HR Admin approves.
 */
export async function triggerProbationConfirmationWorkflow(input: {
  reviewId:       string
  personId:       string
  personNumber:   string
  personFullName: string
  legalEntityId:  string
  lineManagerId:  string | null
  probationEndDate: string
}): Promise<ProbationWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const { reviewId, personId, personNumber, personFullName, legalEntityId, lineManagerId, probationEndDate } = input

    let instanceId    = ''
    let lineManagerName: string | null = null
    let hrAdminFound  = false

    await db.transaction(async tx => {
      const { defId, step1Id, step2Id } = await upsertTwoStepDef(tx, actor, {
        code:       PROBATION_WF_CODE,
        nameEn:     'Probation Confirmation',       nameAr: 'تأكيد فترة التجربة',
        trigger:    'PROBATION_CONFIRM',
        step1Code:  'LINE_MANAGER_REVIEW',   step1NameEn: 'Line Manager Review',    step1NameAr: 'مراجعة المدير المباشر',       step1HType: 'LINE_MANAGER',
        step2Code:  'HR_ADMIN_CONFIRMATION', step2NameEn: 'HR Admin Confirmation',  step2NameAr: 'تأكيد مدير الموارد البشرية',   step2HType: 'CUSTOM_GROUP', step2HRole: 'HR_ADMIN',
      })

      let lmPersonId: string | null = null
      if (lineManagerId) {
        const [mgr] = await tx.select({ id: persons.id, fullNameEn: persons.fullNameEn })
          .from(persons).where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, lineManagerId))).limit(1)
        if (mgr) { lmPersonId = mgr.id; lineManagerName = mgr.fullNameEn ?? null }
      }

      const hrPersonId = await resolvePersonByRole(tx, 'HR_ADMIN', 'HR_DIRECTOR')
      if (hrPersonId) hrAdminFound = true

      const now = new Date()
      const slaDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const resolvedApprovers: ResolvedApprover[] = []

      if (lmPersonId) resolvedApprovers.push({ personId: lmPersonId, personName: lineManagerName ?? '', stepOrder: 1, stepCode: 'LINE_MANAGER_REVIEW',   hierarchyType: 'LINE_MANAGER',  resolvedAt: now.toISOString() })
      if (hrPersonId) resolvedApprovers.push({ personId: hrPersonId, personName: '',                  stepOrder: 2, stepCode: 'HR_ADMIN_CONFIRMATION', hierarchyType: 'CUSTOM_GROUP', resolvedAt: now.toISOString() })

      const hierarchySnapshot: HierarchySnapshot = { encryptedAt: now.toISOString(), resolvedSteps: resolvedApprovers, resolvedBy: 'avaniis-workflow-engine-v2' }
      // resourceType: 'probation_review' so dispatchResourceCompletion routes to applyProbationOutcome
      const contextSnapshot: ContextSnapshot = { encryptedAt: now.toISOString(), resourceType: 'probation_review', resourceId: reviewId, fields: { reviewId, personId, personNumber, probationEndDate } }

      instanceId = randomUUID()
      await tx.insert(workflowInstancesV2).values({ id: instanceId, tenantId: TENANT_ID, workflowDefinitionId: defId, legalEntityId, resourceType: 'probation_review', resourceId: reviewId, initiatedByPersonId: actor.personId ?? personId, status: 'IN_PROGRESS', currentStepOrder: 1, hierarchySnapshot: hierarchySnapshot as never, contextSnapshot: contextSnapshot as never, resolvedSteps: resolvedApprovers as never, slaDeadline, startedAt: now, createdBy: actor.id, createdByName: actor.name, createdDate: now })

      if (step1Id && lmPersonId) await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step1Id, stepOrder: 1, status: 'PENDING',  assignedToPersonId: lmPersonId, slaDeadline, createdBy: actor.id, createdByName: actor.name, createdDate: now })
      if (step2Id && hrPersonId) await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step2Id, stepOrder: 2, status: 'WAITING', assignedToPersonId: hrPersonId,              createdBy: actor.id, createdByName: actor.name, createdDate: now })

      type N = typeof notificationLog.$inferInsert
      const notifs: N[] = []
      if (lmPersonId) notifs.push({ tenantId: TENANT_ID, legalEntityId, recipientPersonId: lmPersonId, notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP', subjectEn: `Probation review required — ${personFullName}`, bodyEn: `${personFullName} (${personNumber}) probation ends ${probationEndDate}. Please review performance and recommend: Confirm / Extend / Fail.`, referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId, status: 'PENDING', createdBy: actor.id, createdByName: actor.name })
      if (hrPersonId) notifs.push({ tenantId: TENANT_ID, legalEntityId, recipientPersonId: hrPersonId, notificationType: 'APPROVAL_REQUIRED', channel: 'IN_APP', subjectEn: `Probation confirmation pending — ${personFullName}`,  bodyEn: `Probation of ${personFullName} (${personNumber}, end date ${probationEndDate}) is awaiting Line Manager review before HR confirmation.`, referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId, status: 'PENDING', createdBy: actor.id, createdByName: actor.name })
      if (notifs.length) await tx.insert(notificationLog).values(notifs)

      await writeAuditLog({ actorId: actor.id, actorName: actor.name, actorRole: actor.role, actorEntityId: legalEntityId, channel: 'WEB', eventType: 'WORKFLOW.PROBATION_INITIATED', resourceType: 'workflow_instances_v2', resourceId: instanceId, entityId: legalEntityId, newValues: { personId, personNumber, probationEndDate } }, tx)
    })

    return { instanceId, lineManagerName, hrAdminFound }
  } catch (e) { translateError(e, 'triggerProbationConfirmationWorkflow') }
}

// ── triggerExitClearanceWorkflow ──────────────────────────────────────────────

export interface ExitClearanceWorkflowResult {
  instanceId:   string
  notifiedRoles: string[]
}

/**
 * P2-3 — Exit clearance notification workflow (FYI broadcast, not blocking).
 * Notifies IT, Payroll Admin, Line Manager, and HR Admin simultaneously
 * so each department can complete their offboarding checklist items.
 */
export async function triggerExitClearanceWorkflow(input: {
  personId:          string
  personNumber:      string
  personFullName:    string
  legalEntityId:     string
  lineManagerId:     string | null
  terminationDate:   string
  checklistId:       string
}): Promise<ExitClearanceWorkflowResult> {
  try {
    const actor = await getCurrentUser()
    const { personId, personNumber, personFullName, legalEntityId, lineManagerId, terminationDate, checklistId } = input

    let instanceId    = ''
    const notifiedRoles: string[] = []

    await db.transaction(async tx => {
      // Single-step FYI workflow — all notified parties see it in /workflows
      const { defId, step1Id } = await upsertTwoStepDef(tx, actor, {
        code:      EXIT_CLEARANCE_WF_CODE,
        nameEn:    'Exit Clearance',         nameAr: 'إجراءات المغادرة',
        trigger:   'EXIT_CLEARANCE',
        step1Code: 'HR_ADMIN_COORDINATION',  step1NameEn: 'HR Admin Coordination', step1NameAr: 'تنسيق الموارد البشرية', step1HType: 'CUSTOM_GROUP',
      })

      const hrPersonId = await resolvePersonByRole(tx, 'HR_ADMIN', 'HR_DIRECTOR')
      if (hrPersonId) notifiedRoles.push('HR_ADMIN')

      // Resolve line manager
      let lmPersonId: string | null = null
      if (lineManagerId) {
        const [mgr] = await tx.select({ id: persons.id }).from(persons).where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, lineManagerId))).limit(1)
        if (mgr) { lmPersonId = mgr.id; notifiedRoles.push('MANAGER') }
      }

      // Resolve IT and Payroll notificants
      const [itAccount]      = await tx.select({ personId: userAccounts.personId }).from(userAccounts).where(and(eq(userAccounts.tenantId, TENANT_ID), eq(userAccounts.avaniisRole, 'IT_ADMIN'),    eq(userAccounts.isActive, true))).limit(1)
      const [payrollAccount] = await tx.select({ personId: userAccounts.personId }).from(userAccounts).where(and(eq(userAccounts.tenantId, TENANT_ID), eq(userAccounts.avaniisRole, 'PAYROLL_ADMIN'), eq(userAccounts.isActive, true))).limit(1)

      const itPersonId      = itAccount?.personId      ?? null
      const payrollPersonId = payrollAccount?.personId ?? null
      if (itPersonId)      notifiedRoles.push('IT_ADMIN')
      if (payrollPersonId) notifiedRoles.push('PAYROLL_ADMIN')

      const resolvedApprovers: ResolvedApprover[] = []
      if (hrPersonId) resolvedApprovers.push({ personId: hrPersonId, personName: '', stepOrder: 1, stepCode: 'HR_ADMIN_COORDINATION', hierarchyType: 'CUSTOM_GROUP', resolvedAt: new Date().toISOString() })

      const now = new Date()
      const slaDeadline = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) // 5 days
      const hierarchySnapshot: HierarchySnapshot = { encryptedAt: now.toISOString(), resolvedSteps: resolvedApprovers, resolvedBy: 'avaniis-workflow-engine-v2' }
      const contextSnapshot: ContextSnapshot = { encryptedAt: now.toISOString(), resourceType: 'onboarding_checklists', resourceId: checklistId, fields: { personId, personNumber, terminationDate, checklistId } }

      instanceId = randomUUID()
      await tx.insert(workflowInstancesV2).values({ id: instanceId, tenantId: TENANT_ID, workflowDefinitionId: defId, legalEntityId, resourceType: 'onboarding_checklists', resourceId: checklistId, initiatedByPersonId: actor.personId ?? personId, status: 'IN_PROGRESS', currentStepOrder: 1, hierarchySnapshot: hierarchySnapshot as never, contextSnapshot: contextSnapshot as never, resolvedSteps: resolvedApprovers as never, slaDeadline, startedAt: now, createdBy: actor.id, createdByName: actor.name, createdDate: now })

      if (step1Id && hrPersonId) await tx.insert(workflowStepInstances).values({ id: randomUUID(), tenantId: TENANT_ID, instanceId, stepId: step1Id, stepOrder: 1, status: 'PENDING', assignedToPersonId: hrPersonId, slaDeadline, createdBy: actor.id, createdByName: actor.name, createdDate: now })

      // Broadcast IN_APP notifications to all relevant parties
      type N = typeof notificationLog.$inferInsert
      const notifs: N[] = []
      const baseNotif = (recipientPersonId: string, roleLabel: string): N => ({
        tenantId: TENANT_ID, legalEntityId, recipientPersonId,
        notificationType: 'ACTION_REQUIRED', channel: 'IN_APP',
        subjectEn: `Exit clearance initiated — ${personFullName}`,
        bodyEn: `${personFullName} (${personNumber}) is leaving on ${terminationDate}. Complete your assigned offboarding items before this date. View the checklist in Exit Clearance.`,
        referenceType: 'WORKFLOW_INSTANCE', referenceId: instanceId,
        status: 'PENDING', createdBy: actor.id, createdByName: actor.name,
      })
      if (hrPersonId)      notifs.push(baseNotif(hrPersonId,      'HR Admin'))
      if (lmPersonId)      notifs.push(baseNotif(lmPersonId,      'Line Manager'))
      if (itPersonId)      notifs.push(baseNotif(itPersonId,      'IT Admin'))
      if (payrollPersonId) notifs.push(baseNotif(payrollPersonId, 'Payroll Admin'))
      if (notifs.length) await tx.insert(notificationLog).values(notifs)

      await writeAuditLog({ actorId: actor.id, actorName: actor.name, actorRole: actor.role, actorEntityId: legalEntityId, channel: 'WEB', eventType: 'WORKFLOW.EXIT_CLEARANCE_INITIATED', resourceType: 'workflow_instances_v2', resourceId: instanceId, entityId: legalEntityId, newValues: { personId, personNumber, terminationDate, checklistId } }, tx)
    })

    return { instanceId, notifiedRoles }
  } catch (e) { translateError(e, 'triggerExitClearanceWorkflow') }
}


================================================================================
FILE [P3-02]: modules/workflow/index.ts
LINES: 33
================================================================================
/**
 * workflow public API barrel.
 * Cross-module imports MUST come through this file (Hard Rule 6).
 */
export * from './schema'
export * from './types'

// v2 engine
export { submitWorkflow, takeWorkflowAction, previewWorkflow, processSLABreaches } from '@/lib/workflow-engine'
export { getPendingApprovalsV2, getWorkflowInstanceDetailV2, getMyWorkflowRequests, getWorkflowStatusForRequest, resolvePendingApprover, getApprovalHistoryForUser } from './queries'
export type { PendingApprovalV2, WorkflowInstanceDetailV2, MyRequestRow, WorkflowStatusDetail, PendingApproverInfo, ApprovalHistoryRow } from './queries'

// ME-1 — Employment-action workflow triggers (BR-WF-020/021/022)
export {
  triggerTransferApproval,
  triggerPromotionApproval,
  triggerTerminationApproval,
} from './actions'
export type {
  TransferWorkflowResult,
  PromotionWorkflowResult,
  TerminationWorkflowResult,
} from './actions'

// P2-4 / P2-3 — Probation confirmation + Exit clearance workflow triggers
export {
  triggerProbationConfirmationWorkflow,
  triggerExitClearanceWorkflow,
} from './actions'
export type {
  ProbationWorkflowResult,
  ExitClearanceWorkflowResult,
} from './actions'


================================================================================
FILE [P3-02]: modules/workflow/queries.ts
LINES: 701
================================================================================
'use server'

/**
 * Workflow Engine v2 — Query Actions
 * Fetches pending approvals, instance details, and step history from v2 tables.
 */
import { db } from '@/lib/db'
import { eq, and, inArray, desc, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  workflowStepInstances,
  workflowInstancesV2,
  workflowDefinitionsV2,
  workflowStepsV2,
  workflowAuditLog,
  approvalGroups,
} from '@/drizzle/schema/workflow-engine'
import { persons, absenceEntries, absenceTypes } from '@/drizzle/schema'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingApprovalV2 {
  stepInstanceId: string
  instanceId: string
  workflowCode: string
  workflowNameEn: string
  resourceType: string
  resourceId: string
  initiatorName: string
  initiatorPersonId: string
  stepOrder: number
  stepName: string
  slaDeadline: Date | null
  isBreached: boolean
  hoursUntilBreach: number | null
  startedAt: Date
  isFyiOnly: boolean
  canDelegate: boolean
}

export interface WorkflowInstanceDetailV2 {
  instanceId: string
  workflowCode: string
  workflowNameEn: string
  status: string
  resourceType: string
  resourceId: string
  legalEntityId: string
  initiatorName: string
  initiatedByPersonId: string
  startedAt: Date
  completedAt: Date | null
  slaDeadline: Date | null
  steps: Array<{
    stepInstanceId: string
    stepOrder: number
    stepName: string
    status: string
    assigneeName: string | null
    assigneePersonId: string | null
    decision: string | null
    decisionNote: string | null
    decidedAt: Date | null
    slaDeadline: Date | null
    isFyiOnly: boolean
    canDelegate: boolean
  }>
  auditEvents: Array<{
    action: string
    actorName: string | null
    loggedAt: Date
    eventData: Record<string, unknown> | null
  }>
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Returns all pending step instances assigned to the current user (v2 engine).
 */
export async function getPendingApprovalsV2(): Promise<PendingApprovalV2[]> {
  const user = await requireRole([
    'EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
  ])

  if (!user.personId) return []

  const stepRows = await db
    .select({
      stepInstance:  workflowStepInstances,
      instance:      workflowInstancesV2,
      definition:    workflowDefinitionsV2,
      step:          workflowStepsV2,
      initiatorName: persons.fullNameEn,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowInstancesV2, eq(workflowStepInstances.instanceId, workflowInstancesV2.id))
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .innerJoin(persons, eq(workflowInstancesV2.initiatedByPersonId, persons.id))
    .where(
      and(
        eq(workflowStepInstances.tenantId, TENANT_ID),
        eq(workflowStepInstances.status, 'PENDING'),
        eq(workflowStepInstances.assignedToPersonId, user.personId),
      ),
    )
    .orderBy(workflowStepInstances.slaDeadline)
    .limit(100)

  const now = new Date()

  return stepRows.map(r => {
    const deadline = r.stepInstance.slaDeadline
    const isBreached = deadline ? now > deadline : false
    const hoursUntilBreach = deadline
      ? Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60))
      : null

    return {
      stepInstanceId: r.stepInstance.id,
      instanceId:     r.instance.id,
      workflowCode:   r.definition.workflowCode,
      workflowNameEn: r.definition.workflowNameEn,
      resourceType:   r.instance.resourceType,
      resourceId:     r.instance.resourceId,
      initiatorName:     r.initiatorName ?? '—',
      initiatorPersonId: r.instance.initiatedByPersonId,
      stepOrder:         r.stepInstance.stepOrder,
      stepName:       r.step.stepNameEn,
      slaDeadline:    deadline,
      isBreached,
      hoursUntilBreach,
      startedAt:      r.instance.startedAt,
      isFyiOnly:      r.step.isFyiOnly,
      canDelegate:    r.step.canDelegate,
    }
  })
}

/**
 * Returns full detail for a single workflow instance (for the detail/action page).
 */
export async function getWorkflowInstanceDetailV2(instanceId: string): Promise<WorkflowInstanceDetailV2 | null> {
  await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const instanceRows = await db
    .select({
      instance:      workflowInstancesV2,
      definition:    workflowDefinitionsV2,
      initiatorName: persons.fullNameEn,
    })
    .from(workflowInstancesV2)
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .innerJoin(persons, eq(workflowInstancesV2.initiatedByPersonId, persons.id))
    .where(
      and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.id, instanceId),
      ),
    )
    .limit(1)

  if (!instanceRows.length) return null

  const { instance, definition, initiatorName } = instanceRows[0]

  // Load step instances with assignee names
  const stepRows = await db
    .select({
      stepInstance:     workflowStepInstances,
      step:             workflowStepsV2,
      assigneeName:     persons.fullNameEn,
      assigneePersonId: workflowStepInstances.assignedToPersonId,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(eq(workflowStepInstances.instanceId, instanceId))
    .orderBy(workflowStepInstances.stepOrder)

  // Load audit log
  const auditRows = await db
    .select()
    .from(workflowAuditLog)
    .where(eq(workflowAuditLog.instanceId, instanceId))
    .orderBy(desc(workflowAuditLog.loggedAt))
    .limit(50)

  return {
    instanceId:          instance.id,
    workflowCode:        definition.workflowCode,
    workflowNameEn:      definition.workflowNameEn,
    status:              instance.status,
    resourceType:        instance.resourceType,
    resourceId:          instance.resourceId,
    legalEntityId:       instance.legalEntityId,
    initiatorName:       initiatorName ?? '—',
    initiatedByPersonId: instance.initiatedByPersonId,
    startedAt:           instance.startedAt,
    completedAt:         instance.completedAt,
    slaDeadline:         instance.slaDeadline,
    steps: stepRows.map(r => ({
      stepInstanceId: r.stepInstance.id,
      stepOrder:      r.stepInstance.stepOrder,
      stepName:       r.step.stepNameEn,
      status:         r.stepInstance.status,
      assigneeName:     r.assigneeName ?? null,
      assigneePersonId: r.assigneePersonId ?? null,
      decision:         r.stepInstance.decision,
      decisionNote:   r.stepInstance.decisionNote,
      decidedAt:      r.stepInstance.decidedAt,
      slaDeadline:    r.stepInstance.slaDeadline,
      isFyiOnly:      r.step.isFyiOnly,
      canDelegate:    r.step.canDelegate,
    })),
    auditEvents: auditRows.map(r => ({
      action:    r.action,
      actorName: r.actorName,
      loggedAt:  r.loggedAt,
      eventData: r.eventData as Record<string, unknown> | null,
    })),
  }
}

// ─── Employee Request Queries (Unit 9) ───────────────────────────────────────

export interface MyRequestRow {
  instanceId:       string
  workflowCode:     string
  workflowNameEn:   string
  resourceType:     string
  resourceId:       string
  status:           string
  startedAt:        Date
  completedAt:      Date | null
  slaDeadline:      Date | null
  currentStepOrder: number
}

export interface WorkflowStatusDetail {
  instanceId:          string
  workflowCode:        string
  workflowNameEn:      string
  status:              string
  startedAt:           Date
  completedAt:         Date | null
  initiatedByPersonId: string
  slaDeadline:         Date | null
  slaHours:            number
  steps: Array<{
    stepInstanceId:   string
    stepOrder:        number
    stepName:         string
    status:           string
    assigneeName:     string | null
    assigneePersonId: string | null
    decidedAt:        Date | null
  }>
}

/**
 * Returns all workflow instances initiated by the current user (employee self-service).
 */
export async function getMyWorkflowRequests(): Promise<MyRequestRow[]> {
  const user = await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  if (!user.personId) return []

  return db
    .select({
      instanceId:       workflowInstancesV2.id,
      workflowCode:     workflowDefinitionsV2.workflowCode,
      workflowNameEn:   workflowDefinitionsV2.workflowNameEn,
      resourceType:     workflowInstancesV2.resourceType,
      resourceId:       workflowInstancesV2.resourceId,
      status:           workflowInstancesV2.status,
      startedAt:        workflowInstancesV2.startedAt,
      completedAt:      workflowInstancesV2.completedAt,
      slaDeadline:      workflowInstancesV2.slaDeadline,
      currentStepOrder: workflowInstancesV2.currentStepOrder,
    })
    .from(workflowInstancesV2)
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .where(
      and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.initiatedByPersonId, user.personId),
      ),
    )
    .orderBy(desc(workflowInstancesV2.startedAt))
    .limit(50)
}

/**
 * Returns full status detail for a workflow instance looked up by resourceId.
 */
export async function getWorkflowStatusForRequest(
  resourceId: string,
): Promise<WorkflowStatusDetail | null> {
  await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const rows = await db
    .select({
      instanceId:          workflowInstancesV2.id,
      workflowCode:        workflowDefinitionsV2.workflowCode,
      workflowNameEn:      workflowDefinitionsV2.workflowNameEn,
      status:              workflowInstancesV2.status,
      startedAt:           workflowInstancesV2.startedAt,
      completedAt:         workflowInstancesV2.completedAt,
      initiatedByPersonId: workflowInstancesV2.initiatedByPersonId,
      slaDeadline:         workflowInstancesV2.slaDeadline,
      slaHours:            workflowDefinitionsV2.defaultSlaHours,
    })
    .from(workflowInstancesV2)
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .where(
      and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.resourceId, resourceId),
      ),
    )
    .limit(1)

  if (!rows.length) return null
  const instance = rows[0]

  const stepRows = await db
    .select({
      stepInstanceId:   workflowStepInstances.id,
      stepOrder:        workflowStepInstances.stepOrder,
      stepName:         workflowStepsV2.stepNameEn,
      status:           workflowStepInstances.status,
      assigneeName:     persons.fullNameEn,
      assigneePersonId: workflowStepInstances.assignedToPersonId,
      decidedAt:        workflowStepInstances.decidedAt,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(eq(workflowStepInstances.instanceId, instance.instanceId))
    .orderBy(workflowStepInstances.stepOrder)

  return {
    ...instance,
    steps: stepRows.map(r => ({
      stepInstanceId:   r.stepInstanceId,
      stepOrder:        r.stepOrder,
      stepName:         r.stepName,
      status:           r.status,
      assigneeName:     r.assigneeName ?? null,
      assigneePersonId: r.assigneePersonId ?? null,
      decidedAt:        r.decidedAt,
    })),
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// getApprovalHistoryForUser — steps the current user already actioned
// ══════════════════════════════════════════════════════════════════════════════

export interface ApprovalHistoryRow {
  instanceId:          string
  workflowCode:        string
  workflowNameEn:      string
  resourceType:        string
  resourceId:          string
  requesterName:       string
  myStepName:          string
  myDecision:          string | null   // 'APPROVE' | 'REJECT' | 'DELEGATE'
  decidedAt:           Date | null
  instanceStatus:      string
  currentStepName:     string | null   // current pending step (next/active approver)
  currentApproverName: string | null
  leaveStartDate:      string | null
  leaveEndDate:        string | null
  leaveTypeName:       string | null
}

/**
 * Returns workflow steps the current user has personally decided
 * (approved / rejected / delegated) — i.e. their approval history.
 *
 * Approved/rejected items no longer "vanish": the Pending inbox loses them,
 * but they appear here with the user's decision, when they decided, the request
 * context, and where the request stands now (current/next approver).
 */
export async function getApprovalHistoryForUser(): Promise<ApprovalHistoryRow[]> {
  const user = await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  if (!user.personId) return []

  const rows = await db
    .select({
      instanceId:     workflowInstancesV2.id,
      workflowCode:   workflowDefinitionsV2.workflowCode,
      workflowNameEn: workflowDefinitionsV2.workflowNameEn,
      resourceType:   workflowInstancesV2.resourceType,
      resourceId:     workflowInstancesV2.resourceId,
      requesterName:  persons.fullNameEn,
      myStepName:     workflowStepsV2.stepNameEn,
      myDecision:     workflowStepInstances.decision,
      decidedAt:      workflowStepInstances.decidedAt,
      instanceStatus: workflowInstancesV2.status,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowInstancesV2, eq(workflowStepInstances.instanceId, workflowInstancesV2.id))
    .innerJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowInstancesV2.initiatedByPersonId, persons.id))
    .where(and(
      eq(workflowStepInstances.tenantId, TENANT_ID),
      eq(workflowStepInstances.decidedByPersonId, user.personId),
    ))
    .orderBy(desc(workflowStepInstances.decidedAt))
    .limit(100)

  if (rows.length === 0) return []

  const instanceIds = [...new Set(rows.map(r => r.instanceId))]

  // Current pending step (the active/next approver) per instance — batch.
  const pendingRows = await db
    .select({
      instanceId:   workflowStepInstances.instanceId,
      stepName:     workflowStepsV2.stepNameEn,
      approverName: persons.fullNameEn,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(and(
      eq(workflowStepInstances.tenantId, TENANT_ID),
      inArray(workflowStepInstances.instanceId, instanceIds),
      eq(workflowStepInstances.status, 'PENDING'),
    ))
  const pendingMap = new Map<string, { stepName: string; approverName: string | null }>()
  for (const p of pendingRows) {
    if (!pendingMap.has(p.instanceId)) {
      pendingMap.set(p.instanceId, { stepName: p.stepName, approverName: p.approverName ?? null })
    }
  }

  // Leave enrichment (dates + type) for leave requests — batch.
  const leaveIds = [...new Set(rows.filter(r => r.resourceType === 'absence_entries').map(r => r.resourceId))]
  const leaveMap = new Map<string, { start: string | null; end: string | null; type: string | null }>()
  if (leaveIds.length > 0) {
    const lr = await db
      .select({
        id:    absenceEntries.id,
        start: absenceEntries.startDate,
        end:   absenceEntries.endDate,
        type:  absenceTypes.typeNameEn,
      })
      .from(absenceEntries)
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceEntries.tenantId, TENANT_ID),
        inArray(absenceEntries.id, leaveIds),
      ))
    for (const l of lr) leaveMap.set(l.id, { start: l.start, end: l.end, type: l.type })
  }

  return rows.map(r => {
    const pend = pendingMap.get(r.instanceId)
    const lv   = leaveMap.get(r.resourceId)
    return {
      instanceId:          r.instanceId,
      workflowCode:        r.workflowCode,
      workflowNameEn:      r.workflowNameEn,
      resourceType:        r.resourceType,
      resourceId:          r.resourceId,
      requesterName:       r.requesterName ?? '—',
      myStepName:          r.myStepName,
      myDecision:          r.myDecision,
      decidedAt:           r.decidedAt,
      instanceStatus:      r.instanceStatus,
      currentStepName:     pend?.stepName ?? null,
      currentApproverName: pend?.approverName ?? null,
      leaveStartDate:      lv?.start ?? null,
      leaveEndDate:        lv?.end ?? null,
      leaveTypeName:       lv?.type ?? null,
    }
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// resolvePendingApprover — used by ARIA to surface pending-approver info
// ══════════════════════════════════════════════════════════════════════════════

export interface PendingApproverInfo {
  stepName:     string
  approverLabel: string
  /** Describes how the approver was resolved. */
  approverType: 'PERSON' | 'DELEGATED' | 'GROUP' | 'ROLE' | 'CONFIG_WARNING'
}

/**
 * Returns the current pending approver for a workflow instance.
 *
 * Resolution priority (highest first):
 *   1. delegatedToPersonId  — someone it was delegated to
 *   2. assignedToPersonId   — the directly assigned person
 *   3. assignedToGroupId    — an approval group
 *   4. hierarchyRole        — a named role (e.g. HR_ADMIN, LINE_MANAGER)
 *   5. CONFIG_WARNING       — no approver resolvable; workflow mis-configured
 *
 * Does NOT call requireRole — callers are responsible for scope enforcement
 * (e.g. ARIA's handleLeaveRequestStatus which already gates on listLeaveRequests).
 */
export async function resolvePendingApprover(
  instanceId: string,
): Promise<PendingApproverInfo | null> {
  const [row] = await db
    .select({
      stepName:            workflowStepsV2.stepNameEn,
      hierarchyRole:       workflowStepsV2.hierarchyRole,
      assignedToPersonId:  workflowStepInstances.assignedToPersonId,
      assignedToGroupId:   workflowStepInstances.assignedToGroupId,
      delegatedToPersonId: workflowStepInstances.delegatedToPersonId,
      assigneeName:        persons.fullNameEn,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .where(and(
      eq(workflowStepInstances.instanceId, instanceId),
      eq(workflowStepInstances.status, 'PENDING'),
    ))
    .orderBy(workflowStepInstances.stepOrder)
    .limit(1)

  if (!row) return null

  // 1. Delegated approver
  if (row.delegatedToPersonId) {
    const [delegate] = await db
      .select({ fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, row.delegatedToPersonId)))
      .limit(1)
    return {
      stepName:      row.stepName,
      approverLabel: delegate?.fullNameEn
        ? `${delegate.fullNameEn} (delegated)`
        : 'Delegated approver (name unavailable)',
      approverType:  'DELEGATED',
    }
  }

  // 2. Directly assigned person
  if (row.assigneeName) {
    return {
      stepName:      row.stepName,
      approverLabel: row.assigneeName,
      approverType:  'PERSON',
    }
  }

  // 3. Approval group
  if (row.assignedToGroupId) {
    const [group] = await db
      .select({ groupNameEn: approvalGroups.groupNameEn })
      .from(approvalGroups)
      .where(and(
        eq(approvalGroups.tenantId, TENANT_ID),
        eq(approvalGroups.id, row.assignedToGroupId),
      ))
      .limit(1)
    return {
      stepName:      row.stepName,
      approverLabel: group?.groupNameEn
        ? `${group.groupNameEn} (approval group)`
        : 'Approval group (name unavailable)',
      approverType:  'GROUP',
    }
  }

  // 4. Role-based routing (hierarchyRole stored on the step definition)
  if (row.hierarchyRole) {
    const label = row.hierarchyRole
      .split('_')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
    return {
      stepName:      row.stepName,
      approverLabel: label,
      approverType:  'ROLE',
    }
  }

  // 5. Configuration warning — step exists but has no approver assignment
  return {
    stepName:      row.stepName,
    approverLabel: 'This request is pending, but the workflow step does not currently have an assigned approver. HR should review the workflow configuration.',
    approverType:  'CONFIG_WARNING',
  }
}

/** Bilingual pending-approver label, used by list/report views. */
export interface PendingApproverLabel {
  approverType:    PendingApproverInfo['approverType']
  /** Concrete display label, EN. Empty for CONFIG_WARNING. */
  approverLabelEn: string
  /** Concrete display label, AR (falls back to EN where no AR exists). */
  approverLabelAr: string
}

/**
 * Batched variant of {@link resolvePendingApprover}: resolves the current
 * pending approver for many workflow instances in a single query (avoids N+1
 * in report/list views). Returns a record keyed by instanceId; instances with
 * no PENDING step are simply absent from the result.
 *
 * Same resolution priority as resolvePendingApprover (delegated → person →
 * group → role → config-warning). CONFIG_WARNING entries carry empty labels so
 * callers render "Pending" only, never an error string.
 */
export async function resolvePendingApprovers(
  instanceIds: string[],
): Promise<Record<string, PendingApproverLabel>> {
  const ids = Array.from(new Set(instanceIds.filter(Boolean)))
  if (ids.length === 0) return {}

  const delegatePersons = alias(persons, 'delegate_persons')

  const rows = await db
    .select({
      instanceId:          workflowStepInstances.instanceId,
      hierarchyRole:       workflowStepsV2.hierarchyRole,
      assignedPersonEn:    persons.fullNameEn,
      assignedPersonAr:    persons.fullNameAr,
      assignedToGroupId:   workflowStepInstances.assignedToGroupId,
      groupNameEn:         approvalGroups.groupNameEn,
      groupNameAr:         approvalGroups.groupNameAr,
      delegatedToPersonId: workflowStepInstances.delegatedToPersonId,
      delegatedPersonEn:   delegatePersons.fullNameEn,
      delegatedPersonAr:   delegatePersons.fullNameAr,
    })
    .from(workflowStepInstances)
    .innerJoin(workflowStepsV2, eq(workflowStepInstances.stepId, workflowStepsV2.id))
    .leftJoin(persons, eq(workflowStepInstances.assignedToPersonId, persons.id))
    .leftJoin(delegatePersons, eq(workflowStepInstances.delegatedToPersonId, delegatePersons.id))
    .leftJoin(approvalGroups, eq(workflowStepInstances.assignedToGroupId, approvalGroups.id))
    .where(and(
      inArray(workflowStepInstances.instanceId, ids),
      eq(workflowStepInstances.status, 'PENDING'),
    ))
    .orderBy(workflowStepInstances.stepOrder)

  const out: Record<string, PendingApproverLabel> = {}
  for (const row of rows) {
    // Rows arrive ordered by stepOrder asc; first seen per instance is the
    // earliest PENDING step (the one currently awaiting a decision).
    if (out[row.instanceId]) continue

    // 1. Delegated approver
    if (row.delegatedToPersonId) {
      out[row.instanceId] = {
        approverType:    'DELEGATED',
        approverLabelEn: row.delegatedPersonEn ? `${row.delegatedPersonEn} (delegated)` : 'Delegated approver',
        approverLabelAr: row.delegatedPersonAr
          ? `${row.delegatedPersonAr} (مفوّض)`
          : (row.delegatedPersonEn ? `${row.delegatedPersonEn} (delegated)` : 'مفوّض'),
      }
      continue
    }
    // 2. Directly assigned person
    if (row.assignedPersonEn) {
      out[row.instanceId] = {
        approverType:    'PERSON',
        approverLabelEn: row.assignedPersonEn,
        approverLabelAr: row.assignedPersonAr ?? row.assignedPersonEn,
      }
      continue
    }
    // 3. Approval group
    if (row.assignedToGroupId) {
      out[row.instanceId] = {
        approverType:    'GROUP',
        approverLabelEn: row.groupNameEn ? `${row.groupNameEn} (approval group)` : 'Approval group',
        approverLabelAr: row.groupNameAr
          ? `${row.groupNameAr} (مجموعة موافقة)`
          : (row.groupNameEn ? `${row.groupNameEn} (approval group)` : 'مجموعة موافقة'),
      }
      continue
    }
    // 4. Role-based routing
    if (row.hierarchyRole) {
      const label = row.hierarchyRole
        .split('_')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
      out[row.instanceId] = { approverType: 'ROLE', approverLabelEn: label, approverLabelAr: label }
      continue
    }
    // 5. Config warning — empty labels so caller shows "Pending" only.
    out[row.instanceId] = { approverType: 'CONFIG_WARNING', approverLabelEn: '', approverLabelAr: '' }
  }
  return out
}


================================================================================
FILE [P3-02]: modules/workflow/schema.ts
LINES: 21
================================================================================
/**
 * workflow schema re-exports — Sprint 2 skeleton.
 * Definitions/stages/routing rules drive the engine; instances + delegations
 * are the operational state of in-flight approvals.
 */
export {
  workflowDefinitions,
  workflowStages,
  workflowRoutingRules,
  workflowInstances,
  approvalDelegations,
} from '@/drizzle/schema'

export type {
  WorkflowDefinition,
  WorkflowStage,
  WorkflowRoutingRule,
  WorkflowInstance,
  ApprovalDelegation,
  NewWorkflowInstance,
} from '@/drizzle/schema'


================================================================================
FILE [P3-02]: modules/workflow/services.ts
LINES: 6
================================================================================
/**
 * workflow pure services — Sprint 2 skeleton.
 * Routing-rule evaluator, SLA-breach detector, escalation-role resolver.
 */

export {}


================================================================================
FILE [P3-02]: modules/workflow/types.ts
LINES: 6
================================================================================
/**
 * workflow TypeScript interfaces — Sprint 2 skeleton.
 * Engine DTOs (StageDecision, ApprovalChainNode, RoutingContext).
 */

export {}


================================================================================
FILE [P3-02]: modules/workflow/validations.ts
LINES: 6
================================================================================
/**
 * workflow Zod validators — Sprint 2 skeleton.
 * Schemas for stage decisions, delegation create, template upsert.
 */

export {}


### P3-03 SUPPLEMENT — modules/profile (employee self-service)

================================================================================
FILE [P3-03]: modules/profile/actions.ts
LINES: 970
================================================================================
'use server'

import { translateError } from '@/lib/app-error'
import { and, asc, desc, eq, ne, or } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import {
  absenceBalances, absenceEntries, absenceTypes,
  auditLog, businessUnits, contracts, departments, grades, jobs, legalEntities,
  locations, personAddresses, personBankDetails, personContacts,
  personDocuments, personEducation, personEmergencyContacts, persons,
  positions, projects, workerAssignments, workScheduleAssignments, workSchedules,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { writeAuditLog } from '@/lib/audit'
import { decryptNullable } from '@/lib/encryption'

export async function getMyProfile(personId: string) {
  try {
    const session = await auth()
    if (!session?.user) return null
    // EMPLOYEE role may only read their own profile; admin roles may read any.
    if (session.user.role === 'EMPLOYEE' && session.user.personId !== personId) return null

  const balanceYear = new Date().getUTCFullYear()

  const [
    personRows, contactRows, emergencyRows,
    homeAddressRows, educationRows,
    assignmentRows, balanceRows, leaveHistoryRows,
    docRows, bankRows, activityRows, contractRows,
  ] = await Promise.all([
    db.select({
      id:                    persons.id,
      personNumber:          persons.personNumber,
      firstNameEn:           persons.firstNameEn,
      middleNameEn:          persons.middleNameEn,
      lastNameEn:            persons.lastNameEn,
      fullNameEn:            persons.fullNameEn,
      fullNameAr:            persons.fullNameAr,
      dateOfBirth:           persons.dateOfBirth,
      gender:                persons.gender,
      maritalStatus:         persons.maritalStatus,
      nationalityCode:       persons.nationalityCode,
      religion:              persons.religion,
      religionConsentGiven:  persons.religionConsentGiven,
      bloodType:             persons.bloodType,
      sensitiveDataConsent:  persons.sensitiveDataConsent,
      hireDate:              persons.hireDate,
      probationEndDate:      persons.probationEndDate,
      probationMonthsGranted: persons.probationMonthsGranted,
      assignmentStatus:      persons.assignmentStatus,
      employmentType:        persons.employmentType,
      workerCategory:        persons.workerCategory,
      employeeCode:          persons.employeeCode,
      noticePeriodDays:      persons.noticePeriodDays,
      currentDepartmentId:   persons.currentDepartmentId,
      currentJobId:          persons.currentJobId,
      currentPositionId:     persons.currentPositionId,
      currentGradeId:        persons.currentGradeId,
      currentLocationId:     persons.currentLocationId,
      lineManagerId:         persons.lineManagerId,
      dottedLineManagerId:   persons.dottedLineManagerId,
      legalEntityId:         persons.legalEntityId,
      profilePhotoUrl:       persons.profilePhotoUrl,
      profilePhotoData:      persons.profilePhotoData,
    })
      .from(persons)
      .where(and(eq(persons.id, personId), eq(persons.tenantId, TENANT_ID)))
      .limit(1),

    db.select({
      id:           personContacts.id,
      contactType:  personContacts.contactType,
      contactValue: personContacts.contactValue,
      isPrimary:    personContacts.isPrimary,
    })
      .from(personContacts)
      .where(and(
        eq(personContacts.personId, personId),
        eq(personContacts.tenantId, TENANT_ID),
        eq(personContacts.isActive, true),
      )),

    db.select({
      id:            personEmergencyContacts.id,
      contactNameEn: personEmergencyContacts.contactNameEn,
      relationship:  personEmergencyContacts.relationship,
      phonePrimary:  personEmergencyContacts.phonePrimary,
      priorityOrder: personEmergencyContacts.priorityOrder,
    })
      .from(personEmergencyContacts)
      .where(and(
        eq(personEmergencyContacts.personId, personId),
        eq(personEmergencyContacts.tenantId, TENANT_ID),
      ))
      .orderBy(asc(personEmergencyContacts.priorityOrder))
      .limit(1),

    db.select({
      addressLine1:  personAddresses.addressLine1,
      addressLine2:  personAddresses.addressLine2,
      city:          personAddresses.city,
      stateEmirate:  personAddresses.stateEmirate,
      country:       personAddresses.country,
      postalCode:    personAddresses.postalCode,
      poBox:         personAddresses.poBox,
    })
      .from(personAddresses)
      .where(and(
        eq(personAddresses.personId, personId),
        eq(personAddresses.tenantId, TENANT_ID),
        eq(personAddresses.addressType, 'HOME_COUNTRY'),
      ))
      .limit(1),

    db.select({
      institutionName: personEducation.institutionName,
      degreeType:      personEducation.degreeType,
      fieldOfStudy:    personEducation.fieldOfStudy,
      country:         personEducation.country,
      startYear:       personEducation.startYear,
      graduationYear:  personEducation.graduationYear,
    })
      .from(personEducation)
      .where(and(
        eq(personEducation.personId, personId),
        eq(personEducation.tenantId, TENANT_ID),
        eq(personEducation.isHighestDegree, true),
      ))
      .limit(1),

    db.select({
      id:                      workerAssignments.id,
      effectiveStartDate:      workerAssignments.effectiveStartDate,
      effectiveEndDate:        workerAssignments.effectiveEndDate,
      assignmentStatus:        workerAssignments.assignmentStatus,
      employmentType:          workerAssignments.employmentType,
      lineManagerId:           workerAssignments.lineManagerId,
      primaryCostCentreCode:   workerAssignments.primaryCostCentreCode,
      positionTitleEn:         positions.positionTitleEn,
      positionTitleAr:         positions.positionTitleAr,
      departmentNameEn:        departments.nameEn,
      departmentNameAr:        departments.nameAr,
      gradeCode:               grades.gradeCode,
      gradeNameEn:             grades.gradeNameEn,
      gradeNameAr:             grades.gradeNameAr,
      gradeLevel:              grades.gradeLevel,
      locationNameEn:          locations.nameEn,
      entityNameEn:            legalEntities.nameEn,
      entityNameAr:            legalEntities.nameAr,
      businessUnitNameEn:      businessUnits.nameEn,
      businessUnitNameAr:      businessUnits.nameAr,
      jobTitleEn:              jobs.jobTitleEn,
      jobTitleAr:              jobs.jobTitleAr,
      projectNameEn:           projects.nameEn,
      projectNameAr:           projects.nameAr,
    })
      .from(workerAssignments)
      .leftJoin(positions,     eq(workerAssignments.positionId,    positions.id))
      .leftJoin(departments,   eq(workerAssignments.departmentId,  departments.id))
      .leftJoin(grades,        eq(workerAssignments.gradeId,       grades.id))
      .leftJoin(locations,     eq(workerAssignments.locationId,    locations.id))
      .leftJoin(legalEntities, eq(workerAssignments.legalEntityId, legalEntities.id))
      .leftJoin(businessUnits, eq(workerAssignments.businessUnitId, businessUnits.id))
      .leftJoin(jobs,          eq(workerAssignments.jobId,         jobs.id))
      .leftJoin(projects,      eq(workerAssignments.projectId,     projects.id))
      .where(and(
        eq(workerAssignments.personId, personId),
        eq(workerAssignments.tenantId, TENANT_ID),
        eq(workerAssignments.isCurrent, true),
      ))
      .limit(1),

    db.select({
      typeCode:          absenceTypes.typeCode,
      typeNameEn:        absenceTypes.typeNameEn,
      accruedDays:       absenceBalances.accruedDays,
      takenDays:         absenceBalances.takenDays,
      pendingDays:       absenceBalances.pendingDays,
      closingBalanceDays: absenceBalances.closingBalanceDays,
    })
      .from(absenceBalances)
      .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceBalances.personId, personId),
        eq(absenceBalances.tenantId, TENANT_ID),
        eq(absenceBalances.balanceYear, balanceYear),
      ))
      .orderBy(asc(absenceTypes.typeCode)),

    db.select({
      id:           absenceEntries.id,
      typeCode:     absenceTypes.typeCode,
      typeNameEn:   absenceTypes.typeNameEn,
      startDate:    absenceEntries.startDate,
      endDate:      absenceEntries.endDate,
      durationDays: absenceEntries.durationDays,
      status:       absenceEntries.status,
    })
      .from(absenceEntries)
      .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceEntries.personId, personId),
        eq(absenceEntries.tenantId, TENANT_ID),
      ))
      .orderBy(desc(absenceEntries.createdDate))
      .limit(5),

    db.select({
      id:             personDocuments.id,
      documentType:   personDocuments.documentType,
      documentTitle:  personDocuments.documentTitle,
      documentNumber: personDocuments.documentNumber,
      issueDate:      personDocuments.issueDate,
      expiryDate:     personDocuments.expiryDate,
      documentStatus: personDocuments.documentStatus,
      storageKey:     personDocuments.storageKey,
      fileName:       personDocuments.fileName,
      mimeType:       personDocuments.mimeType,
      createdDate:    personDocuments.createdDate,
      createdByName:  personDocuments.createdByName,
    })
      .from(personDocuments)
      .where(and(
        eq(personDocuments.personId, personId),
        eq(personDocuments.tenantId, TENANT_ID),
        eq(personDocuments.scopeType, 'EMPLOYEE'),
        ne(personDocuments.documentStatus, 'CANCELLED'),
      ))
      .orderBy(asc(personDocuments.documentType)),

    db.select({
      id:          personBankDetails.id,
      bankName:    personBankDetails.bankName,
      bankCode:    personBankDetails.bankCode,
      iban:        personBankDetails.iban,
      accountName: personBankDetails.accountName,
      isPrimary:   personBankDetails.isPrimary,
    })
      .from(personBankDetails)
      .where(and(
        eq(personBankDetails.personId, personId),
        eq(personBankDetails.tenantId, TENANT_ID),
        eq(personBankDetails.isPrimary, true),
      ))
      .limit(1),

    db.select({
      id:          auditLog.id,
      eventTime:   auditLog.eventTime,
      eventType:   auditLog.eventType,
      actorName:   auditLog.actorName,
      description: auditLog.description,
    })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenantId, TENANT_ID),
        or(
          eq(auditLog.resourceId, personId),
          eq(auditLog.entityId,   personId),
        ),
      ))
      .orderBy(desc(auditLog.eventTime))
      .limit(10),

    db.select({
      id:           contracts.id,
      contractType: contracts.contractType,
      startDate:    contracts.startDate,
      endDate:      contracts.endDate,
      status:       contracts.status,
      workLocation: contracts.workLocation,
    })
      .from(contracts)
      .where(and(
        eq(contracts.personId,  personId),
        eq(contracts.tenantId,  TENANT_ID),
        eq(contracts.status,    'ACTIVE'),
      ))
      .orderBy(desc(contracts.startDate))
      .limit(1),
  ])

  const person = personRows[0] ?? null
  if (!person) return null

  // Fetch line manager and functional manager names in parallel
  const managerId          = assignmentRows[0]?.lineManagerId ?? person.lineManagerId
  const functionalManagerId = person.dottedLineManagerId
  const [managerRow, functionalManagerRow] = await Promise.all([
    managerId
      ? db.select({ id: persons.id, fullNameEn: persons.fullNameEn })
          .from(persons)
          .where(and(eq(persons.id, managerId), eq(persons.tenantId, TENANT_ID)))
          .limit(1)
          .then(r => r[0] ?? null)
      : Promise.resolve(null),
    functionalManagerId
      ? db.select({ id: persons.id, fullNameEn: persons.fullNameEn })
          .from(persons)
          .where(and(eq(persons.id, functionalManagerId), eq(persons.tenantId, TENANT_ID)))
          .limit(1)
          .then(r => r[0] ?? null)
      : Promise.resolve(null),
  ])

  // ── FALLBACK employment source (read-only) ────────────────────────────────
  // Some active employees (e.g. legacy/seed records) have employment details on
  // the denormalized persons.current_* columns but NO worker_assignments row.
  // For those, the worker_assignments query above returns zero rows and the
  // Employment tab would otherwise show "No employment record found.".
  //
  // When (and only when) there is no current worker_assignments row, we build an
  // employment object of the SAME shape from persons.current_* fields, resolving
  // display names from the SAME master tables used for the assignment display.
  // This is display-only: it does NOT create or modify any worker_assignments
  // row, and the existing assignment path is left completely unchanged.
  let fallbackAssignment: (typeof assignmentRows)[number] | null = null
  if (!assignmentRows[0]) {
    const [posRow, deptRow, gradeRow, locRow, entityRow, jobRow] = await Promise.all([
      person.currentPositionId
        ? db.select({ positionTitleEn: positions.positionTitleEn, positionTitleAr: positions.positionTitleAr })
            .from(positions).where(and(eq(positions.id, person.currentPositionId), eq(positions.tenantId, TENANT_ID)))
            .limit(1).then(r => r[0] ?? null)
        : Promise.resolve(null),
      person.currentDepartmentId
        ? db.select({ nameEn: departments.nameEn, nameAr: departments.nameAr })
            .from(departments).where(and(eq(departments.id, person.currentDepartmentId), eq(departments.tenantId, TENANT_ID)))
            .limit(1).then(r => r[0] ?? null)
        : Promise.resolve(null),
      person.currentGradeId
        ? db.select({ gradeCode: grades.gradeCode, gradeNameEn: grades.gradeNameEn, gradeNameAr: grades.gradeNameAr, gradeLevel: grades.gradeLevel })
            .from(grades).where(and(eq(grades.id, person.currentGradeId), eq(grades.tenantId, TENANT_ID)))
            .limit(1).then(r => r[0] ?? null)
        : Promise.resolve(null),
      person.currentLocationId
        ? db.select({ nameEn: locations.nameEn })
            .from(locations).where(and(eq(locations.id, person.currentLocationId), eq(locations.tenantId, TENANT_ID)))
            .limit(1).then(r => r[0] ?? null)
        : Promise.resolve(null),
      person.legalEntityId
        ? db.select({ nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
            .from(legalEntities).where(and(eq(legalEntities.id, person.legalEntityId), eq(legalEntities.tenantId, TENANT_ID)))
            .limit(1).then(r => r[0] ?? null)
        : Promise.resolve(null),
      person.currentJobId
        ? db.select({ jobTitleEn: jobs.jobTitleEn, jobTitleAr: jobs.jobTitleAr })
            .from(jobs).where(and(eq(jobs.id, person.currentJobId), eq(jobs.tenantId, TENANT_ID)))
            .limit(1).then(r => r[0] ?? null)
        : Promise.resolve(null),
    ])

    // Only synthesise an employment object if the person actually has some
    // employment data on persons.current_* — otherwise leave it null so the
    // "No employment record found." empty state still shows for genuinely empty
    // records.
    const hasAnyEmploymentData = Boolean(
      person.currentPositionId || person.currentDepartmentId || person.currentGradeId ||
      person.currentLocationId || person.currentJobId || person.employmentType,
    )
    if (hasAnyEmploymentData) {
      fallbackAssignment = {
        id:                    null,
        effectiveStartDate:    person.hireDate ?? null,
        effectiveEndDate:      null,
        assignmentStatus:      person.assignmentStatus ?? null,
        employmentType:        person.employmentType ?? null,
        lineManagerId:         person.lineManagerId ?? null,
        primaryCostCentreCode: null,
        positionTitleEn:       posRow?.positionTitleEn ?? null,
        positionTitleAr:       posRow?.positionTitleAr ?? null,
        departmentNameEn:      deptRow?.nameEn ?? null,
        departmentNameAr:      deptRow?.nameAr ?? null,
        gradeCode:             gradeRow?.gradeCode ?? null,
        gradeNameEn:           gradeRow?.gradeNameEn ?? null,
        gradeNameAr:           gradeRow?.gradeNameAr ?? null,
        gradeLevel:            gradeRow?.gradeLevel ?? null,
        locationNameEn:        locRow?.nameEn ?? null,
        entityNameEn:          entityRow?.nameEn ?? null,
        entityNameAr:          entityRow?.nameAr ?? null,
        businessUnitNameEn:    null,
        businessUnitNameAr:    null,
        jobTitleEn:            jobRow?.jobTitleEn ?? null,
        jobTitleAr:            jobRow?.jobTitleAr ?? null,
        projectNameEn:         null,
        projectNameAr:         null,
      } as unknown as (typeof assignmentRows)[number]
    }
  }

  // Working schedule with inheritance: employee override → entity default.
  const scheduleFields = {
    scheduleNameEn:    workSchedules.scheduleNameEn,
    scheduleNameAr:    workSchedules.scheduleNameAr,
    mondayStart:       workSchedules.mondayStart,
    mondayEnd:         workSchedules.mondayEnd,
    totalHoursPerWeek: workSchedules.totalHoursPerWeek,
    weekendDays:       workSchedules.weekendDays,
  } as const

  const scheduleAssignment = await db
    .select({ ...scheduleFields, assignmentReason: workScheduleAssignments.assignmentReason })
    .from(workScheduleAssignments)
    .innerJoin(workSchedules, eq(workScheduleAssignments.workScheduleId, workSchedules.id))
    .where(
      and(
        eq(workScheduleAssignments.tenantId, TENANT_ID),
        eq(workScheduleAssignments.personId, personId),
        eq(workScheduleAssignments.isCurrent, true),
      ),
    )
    .limit(1)
    .then(r => r[0] ?? null)

  let scheduleNameEn:    string | null = null
  let scheduleNameAr:    string | null = null
  let scheduleSource:    'ENTITY_DEFAULT' | 'EMPLOYEE_OVERRIDE' | null = null
  let scheduleStartTime: string | null = null
  let scheduleEndTime:   string | null = null
  let scheduleHoursPerDay: number | null = null

  function _deriveScheduleExtras(
    totalHoursPerWeek: string | null,
    weekendDays: number[] | null,
    mondayStart: string | null,
    mondayEnd:   string | null,
  ) {
    const wknd = weekendDays ?? [5, 6]
    const workingDays = 7 - wknd.length
    const hpd = totalHoursPerWeek && workingDays > 0
      ? parseFloat(totalHoursPerWeek) / workingDays
      : null
    return { hpd: hpd ?? null, start: mondayStart ?? null, end: mondayEnd ?? null }
  }

  if (scheduleAssignment) {
    scheduleNameEn = scheduleAssignment.scheduleNameEn
    scheduleNameAr = scheduleAssignment.scheduleNameAr ?? null
    scheduleSource = scheduleAssignment.assignmentReason === 'AUTO_HIRED'
      ? 'ENTITY_DEFAULT'
      : 'EMPLOYEE_OVERRIDE'
    const ext = _deriveScheduleExtras(
      scheduleAssignment.totalHoursPerWeek,
      scheduleAssignment.weekendDays,
      scheduleAssignment.mondayStart,
      scheduleAssignment.mondayEnd,
    )
    scheduleHoursPerDay = ext.hpd
    scheduleStartTime   = ext.start
    scheduleEndTime     = ext.end
  } else if (person.legalEntityId) {
    // Fallback: entity default when no assignment row exists yet
    const defaultSched = await db
      .select(scheduleFields)
      .from(workSchedules)
      .where(
        and(
          eq(workSchedules.tenantId,    TENANT_ID),
          eq(workSchedules.legalEntityId, person.legalEntityId),
          eq(workSchedules.isDefault,   true),
          eq(workSchedules.isActive,    true),
        ),
      )
      .limit(1)
      .then(r => r[0] ?? null)
    scheduleNameEn = defaultSched?.scheduleNameEn ?? null
    scheduleNameAr = defaultSched?.scheduleNameAr ?? null
    scheduleSource = defaultSched ? 'ENTITY_DEFAULT' : null
    if (defaultSched) {
      const ext = _deriveScheduleExtras(
        defaultSched.totalHoursPerWeek,
        defaultSched.weekendDays,
        defaultSched.mondayStart,
        defaultSched.mondayEnd,
      )
      scheduleHoursPerDay = ext.hpd
      scheduleStartTime   = ext.start
      scheduleEndTime     = ext.end
    }
  }

  // Extract contact fields
  const mobileRow      = contactRows.find(c => c.contactType === 'MOBILE_PRIMARY')
  const emailRow       = contactRows.find(c => c.contactType === 'PERSONAL_EMAIL')
  const workEmailRow   = contactRows.find(c => c.contactType === 'WORK_EMAIL')
  const emergencyRow   = emergencyRows[0] ?? null
  const homeAddressRow = homeAddressRows[0] ?? null
  const educationRow   = educationRows[0] ?? null

  // Decrypt IBAN — show last 4 only
  const bankRow = bankRows[0] ?? null
  let ibanMasked: string | null = null
  if (bankRow?.iban) {
    try {
      const plain = decryptNullable(bankRow.iban)
      ibanMasked = plain ? `•••• •••• ${plain.slice(-4)}` : null
    } catch {
      ibanMasked = null
    }
  }

  // Leave balances with color coding
  const today = new Date()
  const balancesWithColor = balanceRows.map(b => {
    const accrued    = Number(b.accruedDays) || 0
    const taken      = Number(b.takenDays)   || 0
    const available  = b.closingBalanceDays != null
      ? Math.floor(Number(b.closingBalanceDays))
      : Math.max(0, accrued - taken)
    const pct = accrued > 0 ? available / accrued : 1
    return {
      typeCode:   b.typeCode   ?? '',
      typeNameEn: b.typeNameEn ?? '',
      available,
      total: accrued,
      taken,
      colorCode: pct > 0.5 ? 'green' : pct >= 0.2 ? 'amber' : 'red',
    }
  })

  // Documents with expiry severity; mask EID + passport numbers
  const docsWithSeverity = docRows.map(d => {
    const daysUntil = d.expiryDate
      ? Math.ceil((new Date(d.expiryDate).getTime() - today.getTime()) / 86400000)
      : null
    const isSensitive = d.documentType === 'EMIRATES_ID' || d.documentType === 'PASSPORT'
    return {
      ...d,
      documentNumber: isSensitive && d.documentNumber ? '•••• ••••' : d.documentNumber,
      daysUntil,
      severity: daysUntil === null ? null
        : daysUntil < 0  ? 'expired'
        : daysUntil < 30 ? 'critical'
        : daysUntil < 60 ? 'warning'
        : daysUntil < 90 ? 'info'
        : null,
    }
  })

    return {
      personal: {
        ...person,
        workEmail:             workEmailRow?.contactValue ?? null,
        mobileNumber:          mobileRow?.contactValue   ?? null,
        mobileContactId:       mobileRow?.id             ?? null,
        personalEmail:         emailRow?.contactValue    ?? null,
        emailContactId:        emailRow?.id              ?? null,
        emergencyContactId:           emergencyRow?.id             ?? null,
        emergencyContactName:         emergencyRow?.contactNameEn  ?? null,
        emergencyContactRelationship: emergencyRow?.relationship   ?? null,
        emergencyContactPhone:        emergencyRow?.phonePrimary   ?? null,
      },
      homeAddress: homeAddressRow,
      education:   educationRow,
      // Prefer the real worker_assignments row; fall back to the persons.current_*
      // derived object (read-only) when no current assignment exists.
      employment: (assignmentRows[0] ?? fallbackAssignment)
        ? {
            ...(assignmentRows[0] ?? fallbackAssignment),
            managerName:            managerRow?.fullNameEn           ?? null,
            functionalManagerName:  functionalManagerRow?.fullNameEn ?? null,
            contractType:           contractRows[0]?.contractType    ?? null,
            contractEnd:            contractRows[0]?.endDate         ?? null,
            workLocation:           contractRows[0]?.workLocation    ?? null,
            hireDate:               person.hireDate,
            probationEndDate:       person.probationEndDate,
            probationMonthsGranted: person.probationMonthsGranted,
            noticePeriodDays:       person.noticePeriodDays,
            workerCategory:         person.workerCategory,
            employeeCode:           person.employeeCode,
            personNumber:           person.personNumber,
            // Working schedule
            scheduleNameEn,
            scheduleNameAr,
            scheduleSource,
            scheduleHoursPerDay,
            scheduleStartTime,
            scheduleEndTime,
          }
        : null,
      balances:     balancesWithColor,
      leaveHistory: leaveHistoryRows,
      documents:    docsWithSeverity,
      bank:         bankRow ? { bankName: bankRow.bankName, ibanMasked } : null,
      activity:     activityRows,
    }
  } catch (e) {
    // BUG-NAV-001: translateError always re-throws, crashing Server Components.
    // getMyProfile is called from a Server Component — return null gracefully so
    // the profile page shows "Profile not found" instead of a render error.
    console.error('[getMyProfile] unexpected error:', e instanceof Error ? e.message : String(e))
    return null
  }
}

export type MyProfile = NonNullable<Awaited<ReturnType<typeof getMyProfile>>>

import { ALLOWED_RELATIONSHIPS, type EmergencyRelationship } from './constants'

export async function updateMyProfile(
  personId: string,
  data: {
    mobileNumber?:                string
    personalEmail?:               string
    emergencyContactName?:        string
    emergencyContactRelationship?: string
    emergencyContactPhone?:       string
    // Home address (HOME_COUNTRY) — employee self-service editable
    homeAddressLine1?:            string
    homeAddressLine2?:            string
    homeCity?:                    string
    homeStateEmirate?:            string
    homeCountry?:                 string
    homePostalCode?:              string
    homePoBox?:                   string
    // Highest qualification — employee self-service editable
    eduInstitutionName?:          string
    eduDegreeType?:               string
    eduFieldOfStudy?:             string
    eduCountry?:                  string
    eduStartYear?:                string
    eduGraduationYear?:           string
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth()
    if (!session?.user)
      return { success: false, error: 'Not authenticated' }
    // Ownership: an employee may only edit their OWN record. This guard is the
    // sole authorisation gate for ESS self-service writes — it intentionally
    // does not widen permissions for any other role or person.
    if (session.user.personId !== personId)
      return { success: false, error: 'Permission denied' }

    if (data.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.personalEmail))
      return { success: false, error: 'Invalid email format' }

    if (
      data.emergencyContactRelationship !== undefined &&
      !ALLOWED_RELATIONSHIPS.includes(data.emergencyContactRelationship as EmergencyRelationship)
    ) {
      return { success: false, error: 'Invalid relationship value.' }
    }

    // country columns are char(3) (ISO-3166 alpha-3). Validate before persist so
    // a stray value can never overflow the column or corrupt the field.
    const normCountry = (v: string | undefined): string | null | undefined => {
      if (v === undefined) return undefined
      const t = v.trim().toUpperCase()
      if (t === '') return null
      if (t.length !== 3) return 'INVALID'
      return t
    }
    const homeCountryNorm = normCountry(data.homeCountry)
    const eduCountryNorm  = normCountry(data.eduCountry)
    if (homeCountryNorm === 'INVALID' || eduCountryNorm === 'INVALID')
      return { success: false, error: 'Country must be a 3-letter ISO code (e.g. ARE).' }

    // Parse optional year fields ('' → null, must be a 4-digit year otherwise).
    const parseYear = (v: string | undefined): number | null | undefined => {
      if (v === undefined) return undefined
      const t = v.trim()
      if (t === '') return null
      const n = Number(t)
      if (!Number.isInteger(n) || n < 1900 || n > 2100) return NaN
      return n
    }
    const eduStartYearNorm = parseYear(data.eduStartYear)
    const eduGradYearNorm   = parseYear(data.eduGraduationYear)
    if (Number.isNaN(eduStartYearNorm as number) || Number.isNaN(eduGradYearNorm as number))
      return { success: false, error: 'Year must be a valid 4-digit year.' }

    const hasHomeAddressEdit =
      data.homeAddressLine1 !== undefined || data.homeAddressLine2 !== undefined ||
      data.homeCity !== undefined || data.homeStateEmirate !== undefined ||
      homeCountryNorm !== undefined || data.homePostalCode !== undefined ||
      data.homePoBox !== undefined
    const hasEducationEdit =
      data.eduInstitutionName !== undefined || data.eduDegreeType !== undefined ||
      data.eduFieldOfStudy !== undefined || eduCountryNorm !== undefined ||
      eduStartYearNorm !== undefined || eduGradYearNorm !== undefined

    const now      = new Date()
    const actorId  = session.user.id
    const actorName = session.user.name ?? session.user.email ?? ''

    try {
      await db.transaction(async tx => {
      // Upsert mobile contact
      if (data.mobileNumber !== undefined) {
        const [existing] = await tx
          .select({ id: personContacts.id })
          .from(personContacts)
          .where(and(
            eq(personContacts.personId,    personId),
            eq(personContacts.tenantId,    TENANT_ID),
            eq(personContacts.contactType, 'MOBILE_PRIMARY'),
          ))
          .limit(1)
        if (existing) {
          await tx.update(personContacts)
            .set({ contactValue: data.mobileNumber, updatedBy: actorId, updatedByName: actorName, lastUpdatedDate: now })
            .where(eq(personContacts.id, existing.id))
        } else {
          await tx.insert(personContacts).values({
            tenantId:      TENANT_ID,
            personId,
            contactType:   'MOBILE_PRIMARY',
            contactValue:  data.mobileNumber,
            isPrimary:     true,
            isVerified:    false,
            isActive:      true,
            createdBy:     actorId,
            createdByName: actorName,
            createdDate:   now,
          })
        }
      }

      // Upsert personal email contact
      if (data.personalEmail !== undefined) {
        const [existing] = await tx
          .select({ id: personContacts.id })
          .from(personContacts)
          .where(and(
            eq(personContacts.personId,    personId),
            eq(personContacts.tenantId,    TENANT_ID),
            eq(personContacts.contactType, 'PERSONAL_EMAIL'),
          ))
          .limit(1)
        if (existing) {
          await tx.update(personContacts)
            .set({ contactValue: data.personalEmail, updatedBy: actorId, updatedByName: actorName, lastUpdatedDate: now })
            .where(eq(personContacts.id, existing.id))
        } else {
          await tx.insert(personContacts).values({
            tenantId:      TENANT_ID,
            personId,
            contactType:   'PERSONAL_EMAIL',
            contactValue:  data.personalEmail,
            isPrimary:     false,
            isVerified:    false,
            isActive:      true,
            createdBy:     actorId,
            createdByName: actorName,
            createdDate:   now,
          })
        }
      }

      // Upsert emergency contact (priority order 1)
      if (data.emergencyContactName !== undefined || data.emergencyContactPhone !== undefined || data.emergencyContactRelationship !== undefined) {
        const [existing] = await tx
          .select({ id: personEmergencyContacts.id, contactNameEn: personEmergencyContacts.contactNameEn, phonePrimary: personEmergencyContacts.phonePrimary })
          .from(personEmergencyContacts)
          .where(and(
            eq(personEmergencyContacts.personId,      personId),
            eq(personEmergencyContacts.tenantId,      TENANT_ID),
            eq(personEmergencyContacts.priorityOrder, 1),
          ))
          .limit(1)
        if (existing) {
          await tx.update(personEmergencyContacts)
            .set({
              ...(data.emergencyContactName         !== undefined && { contactNameEn: data.emergencyContactName }),
              ...(data.emergencyContactRelationship !== undefined && { relationship:  data.emergencyContactRelationship }),
              ...(data.emergencyContactPhone        !== undefined && { phonePrimary:  data.emergencyContactPhone }),
              updatedBy:       actorId,
              updatedByName:   actorName,
              lastUpdatedDate: now,
            })
            .where(eq(personEmergencyContacts.id, existing.id))
        } else if (data.emergencyContactName) {
          // Insert with whatever fields are provided; name alone is sufficient.
          // Phone/relationship default to empty/OTHER and can be filled later.
          await tx.insert(personEmergencyContacts).values({
            tenantId:      TENANT_ID,
            personId,
            contactNameEn: data.emergencyContactName,
            contactNameAr: '',
            relationship:  data.emergencyContactRelationship ?? 'OTHER',
            phonePrimary:  data.emergencyContactPhone ?? '',
            priorityOrder: 1,
            createdBy:     actorId,
            createdByName: actorName,
            createdDate:   now,
          })
        }
      }

      // Upsert home country address (employee self-service)
      if (hasHomeAddressEdit) {
        const [existing] = await tx
          .select({ id: personAddresses.id })
          .from(personAddresses)
          .where(and(
            eq(personAddresses.personId,    personId),
            eq(personAddresses.tenantId,    TENANT_ID),
            eq(personAddresses.addressType, 'HOME_COUNTRY'),
          ))
          .limit(1)
        if (existing) {
          await tx.update(personAddresses)
            .set({
              ...(data.homeAddressLine1 !== undefined && { addressLine1: data.homeAddressLine1 }),
              ...(data.homeAddressLine2 !== undefined && { addressLine2: data.homeAddressLine2 || null }),
              ...(data.homeCity         !== undefined && { city:         data.homeCity }),
              ...(data.homeStateEmirate !== undefined && { stateEmirate: data.homeStateEmirate || null }),
              // country is NOT NULL — only update when a valid 3-letter code is given
              ...(typeof homeCountryNorm === 'string' && { country:      homeCountryNorm }),
              ...(data.homePostalCode   !== undefined && { postalCode:   data.homePostalCode || null }),
              ...(data.homePoBox        !== undefined && { poBox:        data.homePoBox || null }),
              updatedBy:       actorId,
              updatedByName:   actorName,
              lastUpdatedDate: now,
            })
            .where(eq(personAddresses.id, existing.id))
        } else {
          // No existing row — create one. NOT NULL columns default to '' when the
          // employee edits a single optional field first (mirrors emergency-contact insert).
          await tx.insert(personAddresses).values({
            tenantId:      TENANT_ID,
            personId,
            addressType:   'HOME_COUNTRY',
            addressLine1:  data.homeAddressLine1 ?? '',
            addressLine2:  data.homeAddressLine2 || null,
            city:          data.homeCity ?? '',
            stateEmirate:  data.homeStateEmirate || null,
            country:       (homeCountryNorm ?? '') as string,
            postalCode:    data.homePostalCode || null,
            poBox:         data.homePoBox || null,
            isPrimary:     false,
            effectiveFrom: now.toISOString().slice(0, 10),
            createdBy:     actorId,
            createdByName: actorName,
            createdDate:   now,
          })
        }
      }

      // Upsert highest-qualification education record (employee self-service)
      if (hasEducationEdit) {
        const [existing] = await tx
          .select({ id: personEducation.id })
          .from(personEducation)
          .where(and(
            eq(personEducation.personId,        personId),
            eq(personEducation.tenantId,        TENANT_ID),
            eq(personEducation.isHighestDegree, true),
          ))
          .limit(1)
        if (existing) {
          await tx.update(personEducation)
            .set({
              ...(data.eduInstitutionName !== undefined && { institutionName: data.eduInstitutionName }),
              ...(data.eduDegreeType      !== undefined && { degreeType:   data.eduDegreeType || null }),
              ...(data.eduFieldOfStudy    !== undefined && { fieldOfStudy: data.eduFieldOfStudy || null }),
              ...(eduCountryNorm          !== undefined && { country:      eduCountryNorm }),
              ...(eduStartYearNorm        !== undefined && { startYear:    eduStartYearNorm as number | null }),
              ...(eduGradYearNorm         !== undefined && { graduationYear: eduGradYearNorm as number | null }),
              updatedBy:       actorId,
              updatedByName:   actorName,
              lastUpdatedDate: now,
            })
            .where(eq(personEducation.id, existing.id))
        } else {
          await tx.insert(personEducation).values({
            tenantId:        TENANT_ID,
            personId,
            institutionName: data.eduInstitutionName ?? '',
            degreeType:      data.eduDegreeType || null,
            fieldOfStudy:    data.eduFieldOfStudy || null,
            country:         (eduCountryNorm ?? null) as string | null,
            startYear:       (eduStartYearNorm ?? null) as number | null,
            graduationYear:  (eduGradYearNorm ?? null) as number | null,
            isHighestDegree: true,
            createdBy:       actorId,
            createdByName:   actorName,
            createdDate:     now,
          })
        }
      }

      await writeAuditLog({
        actorId,
        actorName,
        actorRole:   session.user.role,
        channel:     'WEB',
        eventType:   'PERSON.SELF_UPDATED',
        resourceType: 'persons',
        resourceId:  personId,
        entityId:    personId,
        description: 'Employee updated own profile',
      }, tx)
    })

    revalidatePath('/me')
      return { success: true }
    } catch (err) {
      console.error('[updateMyProfile]', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Update failed',
      }
    }
  } catch (e) { translateError(e, 'updateMyProfile') }
}

/**
 * Generate a short-lived SAS URL so an employee can preview/download one of
 * their own EMPLOYEE-scoped documents. The document ownership is verified
 * before the URL is issued.
 */
export async function getDocumentDownloadUrl(
  documentId: string,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const session = await auth()
    if (!session?.user?.personId) return { success: false, error: 'Authentication required.' }

    const [doc] = await db
      .select({
        personId:         personDocuments.personId,
        storageKey:       personDocuments.storageKey,
        hrOnlyVisibility: personDocuments.hrOnlyVisibility,
      })
      .from(personDocuments)
      .where(and(
        eq(personDocuments.id, documentId),
        eq(personDocuments.tenantId, TENANT_ID),
      ))
      .limit(1)

    if (!doc) return { success: false, error: 'Document not found.' }

    // EMPLOYEE may only download their own document; admin roles may cross-read.
    if (session.user.role === 'EMPLOYEE' && doc.personId !== session.user.personId) {
      return { success: false, error: 'You do not have permission to access this document.' }
    }
    // EMPLOYEE cannot see HR-only documents
    if (session.user.role === 'EMPLOYEE' && doc.hrOnlyVisibility) {
      return { success: false, error: 'You do not have permission to access this document.' }
    }

    if (!doc.storageKey) return { success: false, error: 'No file attached to this document.' }

    // Pre-flight existence check for local/UAT provider
    const { isLocalStorageActive, getStorageProvider } = await import('@/lib/storage')
    if (isLocalStorageActive()) {
      const exists = await getStorageProvider().fileExists(doc.storageKey).catch(() => true)
      if (!exists) {
        return {
          success: false,
          error: 'This file was stored in temporary UAT storage and is no longer available after redeployment. Please upload again.',
        }
      }
    }

    // Return the authenticated API route URL — handles all providers uniformly
    return { success: true, url: `/api/documents/${documentId}?mode=view&src=PROFILE_DOCUMENTS` }
  } catch (err) {
    // Do NOT use translateError here — it has return type `never` and always re-throws,
    // which in production Next.js 15 gets sanitized to a generic "Server Components" error.
    const msg = err instanceof Error ? err.message : 'Failed to generate download link.'
    console.error('[getDocumentDownloadUrl]', msg)
    return { success: false, error: msg }
  }
}


================================================================================
FILE [P3-03]: modules/profile/constants.ts
LINES: 13
================================================================================
/**
 * Shared constants for the profile module.
 * Kept in a separate file (not 'use server') so they can be imported by
 * both server actions and client components without violating the Next.js
 * "use server files may only export async functions" constraint.
 */

export const ALLOWED_RELATIONSHIPS = [
  'SPOUSE', 'PARENT', 'FATHER', 'MOTHER', 'CHILD', 'SON', 'DAUGHTER',
  'SIBLING', 'BROTHER', 'SISTER', 'RELATIVE', 'GUARDIAN', 'FRIEND', 'OTHER',
] as const

export type EmergencyRelationship = typeof ALLOWED_RELATIONSHIPS[number]


### P3-05 — modules/reports (exact match)

================================================================================
FILE [P3-05]: modules/reports/employee-history.ts
LINES: 244
================================================================================
/**
 * Employee Assignment History report — data layer.
 *
 * HISTORY-ONLY report (read-only). It deliberately reads the FULL effective-dated
 * timeline (every worker_assignments slice, not just isCurrent) plus the immutable
 * employment_actions narrative — so it answers: what happened to the employee over
 * time, what changed and when, who the current manager is, and how many promotions /
 * grade changes / transfers / manager changes occurred.
 *
 * It does NOT touch any operational read path: aggregate reports and workflows
 * continue to read the current/active record. This module is additive.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  workerAssignments, employmentActions, persons, positions, grades, departments,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import type { SessionUser } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'

const HR_ROLES = new Set(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

// ── Pure summary computation (unit-testable, no DB) ─────────────────────────

export interface ActionForSummary {
  actionType:        string
  beforeGradeId:     string | null
  afterGradeId:      string | null
  beforeManagerId:   string | null
  afterManagerId:    string | null
  beforeDepartmentId:string | null
  afterDepartmentId: string | null
  beforePositionId:  string | null
  afterPositionId:   string | null
}

export interface HistorySummary {
  totalActions:    number
  promotions:      number
  demotions:       number
  gradeChanges:    number
  transfers:       number
  managerChanges:  number
  positionChanges: number
}

/**
 * Counts lifecycle events from the employment_actions narrative.
 * Promotions/demotions key off actionType; grade/manager/dept/position changes
 * key off an actual before≠after value difference (a TRANSFER that didn't move
 * department, for example, won't be counted as a department change).
 */
export function summariseEmploymentActions(actions: ActionForSummary[]): HistorySummary {
  const changed = (a: string | null, b: string | null) => (a ?? null) !== (b ?? null)
  return {
    totalActions:    actions.length,
    promotions:      actions.filter(a => a.actionType === 'PROMOTION').length,
    demotions:       actions.filter(a => a.actionType === 'DEMOTION').length,
    gradeChanges:    actions.filter(a => changed(a.beforeGradeId, a.afterGradeId)).length,
    transfers:       actions.filter(a => changed(a.beforeDepartmentId, a.afterDepartmentId)).length,
    managerChanges:  actions.filter(a => changed(a.beforeManagerId, a.afterManagerId)).length,
    positionChanges: actions.filter(a => changed(a.beforePositionId, a.afterPositionId)).length,
  }
}

// ── Types returned to the page ──────────────────────────────────────────────

export interface HistoryTimelineRow {
  assignmentId:       string
  assignmentNumber:   string
  effectiveStartDate: string
  effectiveEndDate:   string
  isCurrent:          boolean
  actionType:         string
  actionMode:         string
  assignmentStatus:   string
  positionTitle:      string | null
  gradeName:          string | null
  departmentName:     string | null
  managerName:        string | null
}

export interface HistoryActionRow {
  actionType:    string
  actionMode?:   string
  effectiveDate: string
  reasonText:    string | null
  fromGrade:     string | null
  toGrade:       string | null
  fromManager:   string | null
  toManager:     string | null
  fromDept:      string | null
  toDept:        string | null
  fromPosition:  string | null
  toPosition:    string | null
}

export interface EmployeeHistory {
  person: {
    id: string; personNumber: string; fullNameEn: string | null; fullNameAr: string
    hireDate: string; assignmentStatus: string; legalEntityId: string
  }
  current: {
    positionTitle: string | null; gradeName: string | null
    departmentName: string | null; managerName: string | null; since: string | null
  }
  summary:  HistorySummary
  timeline: HistoryTimelineRow[]
  actions:  HistoryActionRow[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function buildNameMaps(ids: {
  positionIds: string[]; gradeIds: string[]; deptIds: string[]; personIds: string[]
}) {
  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))] as string[]
  const [pos, grd, dep, ppl] = await Promise.all([
    uniq(ids.positionIds).length
      ? db.select({ id: positions.id, t: positions.positionTitleEn }).from(positions).where(inArray(positions.id, uniq(ids.positionIds)))
      : Promise.resolve([] as { id: string; t: string }[]),
    uniq(ids.gradeIds).length
      ? db.select({ id: grades.id, t: grades.gradeNameEn }).from(grades).where(inArray(grades.id, uniq(ids.gradeIds)))
      : Promise.resolve([] as { id: string; t: string }[]),
    uniq(ids.deptIds).length
      ? db.select({ id: departments.id, t: departments.nameEn }).from(departments).where(inArray(departments.id, uniq(ids.deptIds)))
      : Promise.resolve([] as { id: string; t: string }[]),
    uniq(ids.personIds).length
      ? db.select({ id: persons.id, t: persons.fullNameEn }).from(persons).where(inArray(persons.id, uniq(ids.personIds)))
      : Promise.resolve([] as { id: string; t: string | null }[]),
  ])
  const m = (rows: { id: string; t: string | null }[]) => new Map(rows.map(r => [r.id, r.t]))
  return { pos: m(pos), grd: m(grd), dep: m(dep), ppl: m(ppl) }
}

// ── Employee picker (entity-scoped) ─────────────────────────────────────────

export async function listHistoryEmployees(user: SessionUser, search = ''): Promise<
  { id: string; personNumber: string; fullNameEn: string | null; fullNameAr: string }[]
> {
  // P3-D2: feature-permission layer (legacy-allow if no REPORTS row configured)
  await requirePermission(user, 'REPORTS', 'view')
  const conds = [eq(persons.tenantId, TENANT_ID)]
  if (user.role !== 'SUPER_ADMIN') conds.push(eq(persons.legalEntityId, user.legalEntityId))
  const rows = await db
    .select({ id: persons.id, personNumber: persons.personNumber, fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr })
    .from(persons)
    .where(and(...conds))
    .orderBy(asc(persons.personNumber))
    .limit(1000)
  const q = search.trim().toLowerCase()
  return q
    ? rows.filter(r =>
        r.personNumber.toLowerCase().includes(q) ||
        (r.fullNameEn ?? '').toLowerCase().includes(q) ||
        r.fullNameAr.includes(search.trim()))
    : rows.slice(0, 50)
}

// ── Main: full assignment history for one employee ──────────────────────────

export async function getEmployeeAssignmentHistory(
  user: SessionUser, personId: string,
): Promise<EmployeeHistory | null> {
  const [person] = await db
    .select({
      id: persons.id, personNumber: persons.personNumber, fullNameEn: persons.fullNameEn,
      fullNameAr: persons.fullNameAr, hireDate: persons.hireDate,
      assignmentStatus: persons.assignmentStatus, legalEntityId: persons.legalEntityId,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  if (!person) return null

  // Entity scope — HR sees only their own entity (SUPER_ADMIN sees all).
  if (!HR_ROLES.has(user.role)) return null
  if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) return null

  // Full effective-dated timeline (ALL slices, oldest first).
  const slices = await db
    .select()
    .from(workerAssignments)
    .where(and(eq(workerAssignments.tenantId, TENANT_ID), eq(workerAssignments.personId, personId)))
    .orderBy(asc(workerAssignments.effectiveStartDate), asc(workerAssignments.effectiveSequence))

  // Immutable change narrative (oldest first).
  const actions = await db
    .select()
    .from(employmentActions)
    .where(and(eq(employmentActions.tenantId, TENANT_ID), eq(employmentActions.personId, personId)))
    .orderBy(asc(employmentActions.effectiveDate), asc(employmentActions.actionDate))

  // Resolve names in one batched pass.
  const names = await buildNameMaps({
    positionIds: [...slices.map(s => s.positionId), ...actions.flatMap(a => [a.beforePositionId, a.afterPositionId])].filter(Boolean) as string[],
    gradeIds:    [...slices.map(s => s.gradeId), ...actions.flatMap(a => [a.beforeGradeId, a.afterGradeId])].filter(Boolean) as string[],
    deptIds:     [...slices.map(s => s.departmentId), ...actions.flatMap(a => [a.beforeDepartmentId, a.afterDepartmentId])].filter(Boolean) as string[],
    personIds:   [...slices.map(s => s.lineManagerId), ...actions.flatMap(a => [a.beforeManagerId, a.afterManagerId])].filter(Boolean) as string[],
  })

  const timeline: HistoryTimelineRow[] = slices.map(s => ({
    assignmentId:       s.id,
    assignmentNumber:   s.assignmentNumber,
    effectiveStartDate: String(s.effectiveStartDate),
    effectiveEndDate:   String(s.effectiveEndDate),
    isCurrent:          s.isCurrent,
    actionType:         s.actionType,
    actionMode:         s.actionMode,
    assignmentStatus:   s.assignmentStatus,
    positionTitle:      s.positionId ? names.pos.get(s.positionId) ?? null : null,
    gradeName:          s.gradeId ? names.grd.get(s.gradeId) ?? null : null,
    departmentName:     s.departmentId ? names.dep.get(s.departmentId) ?? null : null,
    managerName:        s.lineManagerId ? names.ppl.get(s.lineManagerId) ?? null : null,
  }))

  const actionRows: HistoryActionRow[] = actions.map(a => ({
    actionType:    a.actionType,
    effectiveDate: String(a.effectiveDate),
    reasonText:    a.reasonText ?? null,
    fromGrade:     a.beforeGradeId ? names.grd.get(a.beforeGradeId) ?? null : null,
    toGrade:       a.afterGradeId ? names.grd.get(a.afterGradeId) ?? null : null,
    fromManager:   a.beforeManagerId ? names.ppl.get(a.beforeManagerId) ?? null : null,
    toManager:     a.afterManagerId ? names.ppl.get(a.afterManagerId) ?? null : null,
    fromDept:      a.beforeDepartmentId ? names.dep.get(a.beforeDepartmentId) ?? null : null,
    toDept:        a.afterDepartmentId ? names.dep.get(a.afterDepartmentId) ?? null : null,
    fromPosition:  a.beforePositionId ? names.pos.get(a.beforePositionId) ?? null : null,
    toPosition:    a.afterPositionId ? names.pos.get(a.afterPositionId) ?? null : null,
  }))

  const summary = summariseEmploymentActions(actions as ActionForSummary[])

  const cur = slices.find(s => s.isCurrent) ?? slices[slices.length - 1]
  const current = {
    positionTitle:  cur?.positionId ? names.pos.get(cur.positionId) ?? null : null,
    gradeName:      cur?.gradeId ? names.grd.get(cur.gradeId) ?? null : null,
    departmentName: cur?.departmentId ? names.dep.get(cur.departmentId) ?? null : null,
    managerName:    cur?.lineManagerId ? names.ppl.get(cur.lineManagerId) ?? null : null,
    since:          cur ? String(cur.effectiveStartDate) : null,
  }

  return { person: { ...person, hireDate: String(person.hireDate) }, current, summary, timeline, actions: actionRows }
}


================================================================================
FILE [P3-05]: modules/reports/index.ts
LINES: 14
================================================================================
export type {
  HRAdminDashboardData,
  ManagerDashboardData,
  HRDirectorDashboardData,
  FinanceDashboardData,
  EmployeeDashboardData,
} from './queries'
export {
  getHRAdminDashboardData,
  getManagerDashboardData,
  getHRDirectorDashboardData,
  getFinanceDashboardData,
  getEmployeeDashboardData,
} from './queries'


================================================================================
FILE [P3-05]: modules/reports/queries.ts
LINES: 757
================================================================================
'use server'

import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import {
  persons,
  departments,
  absenceEntries,
  absenceTypes,
  absenceBalances,
  contracts,
  personDocuments,
  payrollRuns,
  payrollResults,
  workerAssignments,
} from '@/drizzle/schema'
import { eq, and, gte, lte, count, sql, desc, asc, inArray, ne, or } from 'drizzle-orm'

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface HRAdminDashboardData {
  headcount: number
  onLeaveToday: number
  pendingApprovals: number
  expiringDocsCount: number
  byDepartment: Array<{ dept: string; count: number }>
  absenceToday: Array<{ typeName: string; count: number }>
  expiringContracts: number
  expiringDocs: Array<{ docType: string; count: number }>
  sickOver14Days: number
}

export interface ManagerDashboardData {
  teamSize: number
  onLeaveToday: number
  pendingApprovals: Array<{
    id: string
    personName: string | null
    typeName: string
    startDate: string
    endDate: string
    durationDays: string
    balanceAfterDays: string | null
  }>
  teamOnLeaveToday: Array<{
    personName: string | null
    typeName: string
    endDate: string
  }>
}

export interface HRDirectorDashboardData {
  headcount: number
  newHiresYtd: number
  terminationsYtd: number
  pendingApprovals: number
  expiringContracts: number
  byDepartment: Array<{ dept: string; count: number }>
  byNationality: Array<{ category: string; count: number }>
  expiringDocs: Array<{ docType: string; count: number }>
  onLeaveToday: number
}

export interface FinanceDashboardData {
  latestRun: {
    employeeCount: number
    totalNetPay: string
    totalEmployerCost: string
    totalGrossPay: string
    status: string
    payPeriodEnd: string
  } | null
  costBreakdown: {
    basicSalary: number
    housingAllowance: number
    transportAllowance: number
    otherAllowances: number
    gpssaEmployer: number
    eosbProvision: number
    totalNetPay: number
    totalEmployerCost: number
  }
}

export interface EmployeeDashboardData {
  personName: string | null
  leaveBalances: Array<{
    typeName: string
    takenDays: string
    accruedDays: string
    pendingDays: string
    closingBalanceDays: string | null
    openingBalanceDays: string
  }>
  expiringDocs: Array<{
    documentType: string
    documentTitle: string
    expiryDate: string | null
  }>
  pendingLeave: Array<{
    id: string
    typeName: string
    startDate: string
    endDate: string
    durationDays: string
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateStrings() {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const thirtyDays = new Date()
  thirtyDays.setDate(thirtyDays.getDate() + 30)
  const thirtyDaysStr = thirtyDays.toISOString().split('T')[0]

  const ninetyDays = new Date()
  ninetyDays.setDate(ninetyDays.getDate() + 90)
  const ninetyDaysStr = ninetyDays.toISOString().split('T')[0]

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]

  const currentYear = today.getFullYear()

  return {
    todayStr,
    thirtyDaysStr,
    ninetyDaysStr,
    thirtyDaysAgoStr,
    startOfYear,
    currentYear,
  }
}

// ── HR Admin Dashboard ────────────────────────────────────────────────────────

export async function getHRAdminDashboardData(): Promise<HRAdminDashboardData> {
  const empty: HRAdminDashboardData = {
    headcount: 0,
    onLeaveToday: 0,
    pendingApprovals: 0,
    expiringDocsCount: 0,
    byDepartment: [],
    absenceToday: [],
    expiringContracts: 0,
    expiringDocs: [],
    sickOver14Days: 0,
  }

  try {
    const { todayStr, thirtyDaysStr, thirtyDaysAgoStr } = getDateStrings()

    // 1. Headcount
    const [headcountRow] = await db
      .select({ value: count() })
      .from(persons)
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )

    // 2. On leave today
    const [onLeaveTodayRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    // 3. Pending approvals
    const [pendingApprovalsRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'PENDING'),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    // 4. Expiring docs count
    const [expiringDocsCountRow] = await db
      .select({ value: count() })
      .from(personDocuments)
      .where(
        and(
          gte(personDocuments.expiryDate, todayStr),
          lte(personDocuments.expiryDate, thirtyDaysStr),
          ne(personDocuments.documentStatus, 'CANCELLED'),
          eq(personDocuments.tenantId, TENANT_ID),
        ),
      )

    // 5. By department
    const byDepartmentRows = await db
      .select({
        dept: departments.nameEn,
        count: count(persons.id),
      })
      .from(persons)
      .innerJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )
      .groupBy(departments.nameEn)
      .orderBy(desc(count(persons.id)))
      .limit(8)

    // 6. Absence breakdown today
    const absenceTodayRows = await db
      .select({
        typeName: absenceTypes.typeNameEn,
        count: count(absenceEntries.id),
      })
      .from(absenceEntries)
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(
        and(
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )
      .groupBy(absenceTypes.typeNameEn)

    // 7. Expiring contracts
    const [expiringContractsRow] = await db
      .select({ value: count() })
      .from(contracts)
      .where(
        and(
          gte(contracts.endDate, todayStr),
          lte(contracts.endDate, thirtyDaysStr),
          eq(contracts.status, 'ACTIVE'),
          eq(contracts.tenantId, TENANT_ID),
        ),
      )

    // 8. Expiring docs by type
    const expiringDocsRows = await db
      .select({
        docType: personDocuments.documentType,
        count: count(personDocuments.id),
      })
      .from(personDocuments)
      .where(
        and(
          gte(personDocuments.expiryDate, todayStr),
          lte(personDocuments.expiryDate, thirtyDaysStr),
          ne(personDocuments.documentStatus, 'CANCELLED'),
          eq(personDocuments.tenantId, TENANT_ID),
        ),
      )
      .groupBy(personDocuments.documentType)

    // 9. Sick over 14 days (in last 30 days)
    const [sickOver14Row] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'APPROVED'),
          gte(absenceEntries.durationDays, '14'),
          gte(absenceEntries.startDate, thirtyDaysAgoStr),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    return {
      headcount: headcountRow?.value ?? 0,
      onLeaveToday: onLeaveTodayRow?.value ?? 0,
      pendingApprovals: pendingApprovalsRow?.value ?? 0,
      expiringDocsCount: expiringDocsCountRow?.value ?? 0,
      byDepartment: byDepartmentRows.map((r) => ({
        dept: r.dept ?? '',
        count: Number(r.count),
      })),
      absenceToday: absenceTodayRows.map((r) => ({
        typeName: r.typeName ?? '',
        count: Number(r.count),
      })),
      expiringContracts: expiringContractsRow?.value ?? 0,
      expiringDocs: expiringDocsRows.map((r) => ({
        docType: r.docType ?? '',
        count: Number(r.count),
      })),
      sickOver14Days: sickOver14Row?.value ?? 0,
    }
  } catch (err) {
    console.error('[getHRAdminDashboardData]', err)
    return empty
  }
}

// ── Manager Dashboard ─────────────────────────────────────────────────────────

export async function getManagerDashboardData(managerId: string): Promise<ManagerDashboardData> {
  const empty: ManagerDashboardData = {
    teamSize: 0,
    onLeaveToday: 0,
    pendingApprovals: [],
    teamOnLeaveToday: [],
  }

  try {
    const { todayStr } = getDateStrings()

    // 1. Direct reports
    const directReports = await db
      .select({ id: persons.id, fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(
        and(
          eq(persons.lineManagerId, managerId),
          eq(persons.tenantId, TENANT_ID),
          eq(persons.assignmentStatus, 'ACTIVE'),
        ),
      )

    const teamSize = directReports.length
    const reportIds = directReports.map((p) => p.id)

    if (reportIds.length === 0) {
      return { ...empty, teamSize: 0 }
    }

    // 3. Pending approvals
    const pendingRows = await db
      .select({
        id: absenceEntries.id,
        personName: persons.fullNameEn,
        typeName: absenceTypes.typeNameEn,
        startDate: absenceEntries.startDate,
        endDate: absenceEntries.endDate,
        durationDays: absenceEntries.durationDays,
        balanceAfterDays: sql<string | null>`null`,
      })
      .from(absenceEntries)
      .innerJoin(persons, eq(absenceEntries.personId, persons.id))
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(
        and(
          inArray(absenceEntries.personId, reportIds),
          eq(absenceEntries.status, 'PENDING'),
        ),
      )
      .orderBy(asc(absenceEntries.createdDate))

    // 4. On leave today
    const [onLeaveTodayRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          inArray(absenceEntries.personId, reportIds),
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
        ),
      )

    const teamOnLeaveTodayRows = await db
      .select({
        personName: persons.fullNameEn,
        typeName: absenceTypes.typeNameEn,
        endDate: absenceEntries.endDate,
      })
      .from(absenceEntries)
      .innerJoin(persons, eq(absenceEntries.personId, persons.id))
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(
        and(
          inArray(absenceEntries.personId, reportIds),
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
        ),
      )

    return {
      teamSize,
      onLeaveToday: onLeaveTodayRow?.value ?? 0,
      pendingApprovals: pendingRows.map((r) => ({
        id: r.id,
        personName: r.personName,
        typeName: r.typeName ?? '',
        startDate: r.startDate ?? '',
        endDate: r.endDate ?? '',
        durationDays: r.durationDays ?? '',
        balanceAfterDays: r.balanceAfterDays,
      })),
      teamOnLeaveToday: teamOnLeaveTodayRows.map((r) => ({
        personName: r.personName,
        typeName: r.typeName ?? '',
        endDate: r.endDate ?? '',
      })),
    }
  } catch (err) {
    console.error('[getManagerDashboardData]', err)
    return empty
  }
}

// ── HR Director Dashboard ─────────────────────────────────────────────────────

export async function getHRDirectorDashboardData(): Promise<HRDirectorDashboardData> {
  const empty: HRDirectorDashboardData = {
    headcount: 0,
    newHiresYtd: 0,
    terminationsYtd: 0,
    pendingApprovals: 0,
    expiringContracts: 0,
    byDepartment: [],
    byNationality: [],
    expiringDocs: [],
    onLeaveToday: 0,
  }

  try {
    const { todayStr, thirtyDaysStr, startOfYear } = getDateStrings()

    // 1. Headcount
    const [headcountRow] = await db
      .select({ value: count() })
      .from(persons)
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )

    // 2. New hires YTD
    const [newHiresRow] = await db
      .select({ value: count() })
      .from(persons)
      .where(
        and(
          gte(persons.hireDate, startOfYear),
          eq(persons.tenantId, TENANT_ID),
        ),
      )

    // 3. Terminations YTD
    const [terminationsRow] = await db
      .select({ value: count() })
      .from(persons)
      .where(
        and(
          eq(persons.assignmentStatus, 'TERMINATED'),
          gte(persons.separationDate, startOfYear),
          eq(persons.tenantId, TENANT_ID),
        ),
      )

    // 4. Pending approvals
    const [pendingApprovalsRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'PENDING'),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    // 5. Expiring contracts
    const [expiringContractsRow] = await db
      .select({ value: count() })
      .from(contracts)
      .where(
        and(
          gte(contracts.endDate, todayStr),
          lte(contracts.endDate, thirtyDaysStr),
          eq(contracts.status, 'ACTIVE'),
          eq(contracts.tenantId, TENANT_ID),
        ),
      )

    // 6. By department
    const byDepartmentRows = await db
      .select({
        dept: departments.nameEn,
        count: count(persons.id),
      })
      .from(persons)
      .innerJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )
      .groupBy(departments.nameEn)
      .orderBy(desc(count(persons.id)))
      .limit(8)

    // 7. By nationality category
    const byNationalityRows = await db
      .select({
        category: persons.nationalityCategory,
        count: count(persons.id),
      })
      .from(persons)
      .where(
        and(
          eq(persons.assignmentStatus, 'ACTIVE'),
          eq(persons.tenantId, TENANT_ID),
        ),
      )
      .groupBy(persons.nationalityCategory)
      .orderBy(desc(count(persons.id)))

    // 8. Expiring docs by type
    const expiringDocsRows = await db
      .select({
        docType: personDocuments.documentType,
        count: count(personDocuments.id),
      })
      .from(personDocuments)
      .where(
        and(
          gte(personDocuments.expiryDate, todayStr),
          lte(personDocuments.expiryDate, thirtyDaysStr),
          ne(personDocuments.documentStatus, 'CANCELLED'),
          eq(personDocuments.tenantId, TENANT_ID),
        ),
      )
      .groupBy(personDocuments.documentType)

    // 9. On leave today
    const [onLeaveTodayRow] = await db
      .select({ value: count() })
      .from(absenceEntries)
      .where(
        and(
          eq(absenceEntries.status, 'APPROVED'),
          lte(absenceEntries.startDate, todayStr),
          gte(absenceEntries.endDate, todayStr),
          eq(absenceEntries.tenantId, TENANT_ID),
        ),
      )

    return {
      headcount: headcountRow?.value ?? 0,
      newHiresYtd: newHiresRow?.value ?? 0,
      terminationsYtd: terminationsRow?.value ?? 0,
      pendingApprovals: pendingApprovalsRow?.value ?? 0,
      expiringContracts: expiringContractsRow?.value ?? 0,
      byDepartment: byDepartmentRows.map((r) => ({
        dept: r.dept ?? '',
        count: Number(r.count),
      })),
      byNationality: byNationalityRows.map((r) => ({
        category: r.category ?? 'Unknown',
        count: Number(r.count),
      })),
      expiringDocs: expiringDocsRows.map((r) => ({
        docType: r.docType ?? '',
        count: Number(r.count),
      })),
      onLeaveToday: onLeaveTodayRow?.value ?? 0,
    }
  } catch (err) {
    console.error('[getHRDirectorDashboardData]', err)
    return empty
  }
}

// ── Finance Dashboard ─────────────────────────────────────────────────────────

export async function getFinanceDashboardData(): Promise<FinanceDashboardData> {
  const emptyBreakdown = {
    basicSalary: 0,
    housingAllowance: 0,
    transportAllowance: 0,
    otherAllowances: 0,
    gpssaEmployer: 0,
    eosbProvision: 0,
    totalNetPay: 0,
    totalEmployerCost: 0,
  }

  try {
    // 1. Latest payroll run
    const [latestRun] = await db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.tenantId, TENANT_ID))
      .orderBy(desc(payrollRuns.payPeriodEnd))
      .limit(1)

    if (!latestRun) {
      return { latestRun: null, costBreakdown: emptyBreakdown }
    }

    // 2. Sum payrollResults for that run
    const [sums] = await db
      .select({
        basicSalary:         sql<number>`COALESCE(SUM(${payrollResults.basicSalary}), 0)`,
        housingAllowance:    sql<number>`COALESCE(SUM(${payrollResults.housingAllowance}), 0)`,
        transportAllowance:  sql<number>`COALESCE(SUM(${payrollResults.transportAllowance}), 0)`,
        otherAllowances:     sql<number>`COALESCE(SUM(${payrollResults.otherAllowances}), 0)`,
        gpssaEmployer:       sql<number>`COALESCE(SUM(${payrollResults.gpssaEmployerContrib}), 0)`,
        eosbProvision:       sql<number>`COALESCE(SUM(${payrollResults.eosbProvision}), 0)`,
        totalNetPay:         sql<number>`COALESCE(SUM(${payrollResults.netPay}), 0)`,
        totalEmployerCost:   sql<number>`COALESCE(SUM(${payrollResults.totalEmployerCost}), 0)`,
        totalGrossPay:       sql<number>`COALESCE(SUM(${payrollResults.totalGrossPay}), 0)`,
      })
      .from(payrollResults)
      .where(eq(payrollResults.payrollRunId, latestRun.id))

    return {
      latestRun: {
        employeeCount:    latestRun.employeeCount ?? 0,
        totalNetPay:      String(latestRun.totalNetPay ?? 0),
        totalEmployerCost: String(latestRun.totalEmployerCost ?? 0),
        totalGrossPay:    String(sums?.totalGrossPay ?? 0),
        status:           latestRun.status ?? '',
        payPeriodEnd:     latestRun.payPeriodEnd ?? '',
      },
      costBreakdown: {
        basicSalary:       Number(sums?.basicSalary ?? 0),
        housingAllowance:  Number(sums?.housingAllowance ?? 0),
        transportAllowance: Number(sums?.transportAllowance ?? 0),
        otherAllowances:   Number(sums?.otherAllowances ?? 0),
        gpssaEmployer:     Number(sums?.gpssaEmployer ?? 0),
        eosbProvision:     Number(sums?.eosbProvision ?? 0),
        totalNetPay:       Number(sums?.totalNetPay ?? 0),
        totalEmployerCost: Number(sums?.totalEmployerCost ?? 0),
      },
    }
  } catch (err) {
    console.error('[getFinanceDashboardData]', err)
    return { latestRun: null, costBreakdown: emptyBreakdown }
  }
}

// ── Employee Self-Service Dashboard ──────────────────────────────────────────

export async function getEmployeeDashboardData(personId: string): Promise<EmployeeDashboardData> {
  const empty: EmployeeDashboardData = {
    personName: null,
    leaveBalances: [],
    expiringDocs: [],
    pendingLeave: [],
  }

  try {
    const { todayStr, ninetyDaysStr, currentYear } = getDateStrings()

    // 1. Person name
    const [person] = await db
      .select({ fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(eq(persons.id, personId))

    // 2. Leave balances for current year
    const balanceRows = await db
      .select({
        typeName:           absenceTypes.typeNameEn,
        takenDays:          absenceBalances.takenDays,
        accruedDays:        absenceBalances.accruedDays,
        pendingDays:        absenceBalances.pendingDays,
        closingBalanceDays: absenceBalances.closingBalanceDays,
        openingBalanceDays: absenceBalances.openingBalanceDays,
      })
      .from(absenceBalances)
      .innerJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
      .where(
        and(
          eq(absenceBalances.personId, personId),
          eq(absenceBalances.balanceYear, currentYear),
        ),
      )

    // 3. Expiring docs within 90 days
    const expiringDocRows = await db
      .select({
        documentType:  personDocuments.documentType,
        documentTitle: personDocuments.documentTitle,
        expiryDate:    personDocuments.expiryDate,
      })
      .from(personDocuments)
      .where(
        and(
          eq(personDocuments.personId, personId),
          lte(personDocuments.expiryDate, ninetyDaysStr),
          ne(personDocuments.documentStatus, 'CANCELLED'),
        ),
      )
      .orderBy(asc(personDocuments.expiryDate))
      .limit(5)

    // 4. Pending leave requests
    const pendingLeaveRows = await db
      .select({
        id:          absenceEntries.id,
        typeName:    absenceTypes.typeNameEn,
        startDate:   absenceEntries.startDate,
        endDate:     absenceEntries.endDate,
        durationDays: absenceEntries.durationDays,
      })
      .from(absenceEntries)
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(
        and(
          eq(absenceEntries.personId, personId),
          eq(absenceEntries.status, 'PENDING'),
        ),
      )

    return {
      personName: person?.fullNameEn ?? null,
      leaveBalances: balanceRows.map((r) => ({
        typeName:           r.typeName ?? '',
        takenDays:          String(r.takenDays ?? 0),
        accruedDays:        String(r.accruedDays ?? 0),
        pendingDays:        String(r.pendingDays ?? 0),
        closingBalanceDays: r.closingBalanceDays != null ? String(r.closingBalanceDays) : null,
        openingBalanceDays: String(r.openingBalanceDays ?? 0),
      })),
      expiringDocs: expiringDocRows.map((r) => ({
        documentType:  r.documentType ?? '',
        documentTitle: r.documentTitle ?? '',
        expiryDate:    r.expiryDate ?? null,
      })),
      pendingLeave: pendingLeaveRows.map((r) => ({
        id:          r.id,
        typeName:    r.typeName ?? '',
        startDate:   r.startDate ?? '',
        endDate:     r.endDate ?? '',
        durationDays: String(r.durationDays ?? 0),
      })),
    }
  } catch (err) {
    console.error('[getEmployeeDashboardData]', err)
    return empty
  }
}

