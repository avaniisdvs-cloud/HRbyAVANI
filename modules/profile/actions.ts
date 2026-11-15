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
