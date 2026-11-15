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
