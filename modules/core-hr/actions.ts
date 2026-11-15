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
  normalizeEmiratesId, getAssignmentSensitiveUpdateFields,
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
  const assignmentFields = getAssignmentSensitiveUpdateFields(patch as Record<string, unknown>)
  if (assignmentFields.length > 0) {
    throw new Error(
      `ASSIGNMENT_CHANGE_REQUIRES_LIFECYCLE: ${assignmentFields.join(', ')} must be changed through an effective-dated employment action.`,
    )
  }

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
