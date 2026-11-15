/**
 * Employee Letters — query helpers (Option B Dynamic Template Engine)
 */
import { and, asc, desc, eq, ilike, isNotNull, isNull, ne, notInArray, notLike, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import {
  persons,
  legalEntities,
  departments,
  jobs,
  employeeLetters,
  letterTemplates,
  letterTemplateTypes,
  letterFieldRegistry,
  personContacts,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

// ── Employee list for letter generation ──────────────────────────────────────

export async function getEligibleEmployees(opts: {
  typeCode:      string
  entityId?:     string
  search?:       string
  departmentId?: string
}) {
  const manager    = alias(persons,        'manager')
  const signedPcl  = alias(employeeLetters, 'signed_pcl')

  // PCL-specific: only active employees currently under probation, not yet confirmed.
  // Excludes contingent workers (TEMPORARY/TASK_BASED), system accounts (AVN- prefix),
  // PENDING_HIRE entries, employees with no probation end date, and employees who
  // already have a SIGNED PCL letter (probation confirmed).
  const isPcl = opts.typeCode === 'PCL'

  const rows = await db
    .select({
      id:               persons.id,
      personNumber:     persons.personNumber,
      fullNameEn:       persons.fullNameEn,
      fullNameAr:       persons.fullNameAr,
      profilePhotoUrl:  persons.profilePhotoUrl,
      jobTitleEn:       jobs.jobTitleEn,
      jobTitleAr:       jobs.jobTitleAr,
      departmentNameEn: departments.nameEn,
      departmentNameAr: departments.nameAr,
      hireDate:         persons.hireDate,
      probationEndDate: persons.probationEndDate,
      probationStatus:  persons.probationStatus,
      assignmentStatus: persons.assignmentStatus,
      employmentType:   persons.employmentType,
      legalEntityId:    persons.legalEntityId,
      legalEntityName:  legalEntities.nameEn,
      managerNameEn:    manager.fullNameEn,
      managerNumber:    manager.personNumber,
    })
    .from(persons)
    .leftJoin(departments,   eq(departments.id,   persons.currentDepartmentId))
    .leftJoin(jobs,          eq(jobs.id,          persons.currentJobId))
    .leftJoin(legalEntities, eq(legalEntities.id, persons.legalEntityId))
    .leftJoin(manager,       eq(manager.id,       persons.lineManagerId))
    // LEFT JOIN to detect an existing signed PCL — employee is excluded if one exists
    .leftJoin(signedPcl, and(
      eq(signedPcl.personId,  persons.id),
      eq(signedPcl.typeCode,  'PCL'),
      eq(signedPcl.tenantId,  TENANT_ID),
      eq(signedPcl.status,    'SIGNED'),
    ))
    .where(
      and(
        eq(persons.tenantId,         TENANT_ID),
        eq(persons.isActive,         true),
        eq(persons.assignmentStatus, 'ACTIVE'),
        // PCL: only under-probation employees, exclude contingent/system accounts
        isPcl ? eq(persons.probationStatus, 'active')                          : undefined,
        isPcl ? isNotNull(persons.probationEndDate)                             : undefined,
        isPcl ? notInArray(persons.employmentType, ['TEMPORARY', 'TASK_BASED']) : undefined,
        isPcl ? notLike(persons.personNumber, 'AVN-%')                         : undefined,
        // Exclude employees who already have a signed PCL (probation confirmed)
        isPcl ? isNull(signedPcl.id)                                            : undefined,
        opts.entityId     ? eq(persons.legalEntityId,       opts.entityId)      : undefined,
        opts.departmentId ? eq(persons.currentDepartmentId, opts.departmentId)  : undefined,
        opts.search       ? ilike(persons.fullNameEn,        `%${opts.search}%`) : undefined,
      ),
    )
    // PCL: sort by nearest probation end date first (most urgent on top)
    .orderBy(isPcl ? asc(persons.probationEndDate) : asc(persons.fullNameEn))

  return rows
}

// ── Default template for a type + entity ─────────────────────────────────────

export async function getDefaultTemplate(typeCode: string, legalEntityId?: string) {
  const type = await db
    .select()
    .from(letterTemplateTypes)
    .where(eq(letterTemplateTypes.typeCode, typeCode))
    .limit(1)
  if (!type[0]) return null

  // Try entity-specific default first, then fall back to global default
  const templates = await db
    .select()
    .from(letterTemplates)
    .where(
      and(
        eq(letterTemplates.typeId, type[0].id),
        eq(letterTemplates.isDefault, true),
        eq(letterTemplates.isActive, true),
      ),
    )
    .orderBy(desc(letterTemplates.createdDate))

  if (legalEntityId) {
    const entityTpl = templates.find(t => t.legalEntityId === legalEntityId)
    if (entityTpl) return entityTpl
  }
  const globalTpl = templates.find(t => !t.legalEntityId)
  return globalTpl ?? templates[0] ?? null
}

// ── All templates for a type ──────────────────────────────────────────────────

export async function getTemplatesForType(typeCode: string) {
  const type = await db
    .select()
    .from(letterTemplateTypes)
    .where(eq(letterTemplateTypes.typeCode, typeCode))
    .limit(1)
  if (!type[0]) return []

  return db
    .select()
    .from(letterTemplates)
    .where(
      and(
        eq(letterTemplates.typeId, type[0].id),
        eq(letterTemplates.isActive, true),
      ),
    )
    .orderBy(asc(letterTemplates.nameEn))
}

// ── All letter types ──────────────────────────────────────────────────────────

export async function getAllLetterTypes() {
  return db
    .select()
    .from(letterTemplateTypes)
    .where(eq(letterTemplateTypes.isActive, true))
    .orderBy(asc(letterTemplateTypes.nameEn))
}

// ── All token definitions ─────────────────────────────────────────────────────

export async function getAllTokens() {
  return db
    .select()
    .from(letterFieldRegistry)
    .where(eq(letterFieldRegistry.tenantId, TENANT_ID))
    .orderBy(asc(letterFieldRegistry.category), asc(letterFieldRegistry.tokenKey))
}

// ── Letters list for HR (by type) ────────────────────────────────────────────

export async function getLettersByType(typeCode: string, entityId?: string) {
  return db
    .select()
    .from(employeeLetters)
    .where(
      and(
        eq(employeeLetters.tenantId, TENANT_ID),
        eq(employeeLetters.typeCode, typeCode),
        entityId ? eq(employeeLetters.legalEntityId, entityId) : undefined,
      ),
    )
    .orderBy(desc(employeeLetters.createdDate))
}

// ── Single letter ─────────────────────────────────────────────────────────────

export async function getLetterById(id: string) {
  const rows = await db
    .select()
    .from(employeeLetters)
    .where(and(eq(employeeLetters.tenantId, TENANT_ID), eq(employeeLetters.id, id)))
    .limit(1)
  return rows[0] ?? null
}

// ── Letter by signing token (public — no auth check) ─────────────────────────

export async function getLetterByToken(token: string) {
  const rows = await db
    .select()
    .from(employeeLetters)
    .where(
      and(
        eq(employeeLetters.tenantId, TENANT_ID),
        eq(employeeLetters.signingToken, token),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

// ── Letters for ESS (my own letters) ─────────────────────────────────────────

export async function getLettersForPerson(personId: string) {
  return db
    .select()
    .from(employeeLetters)
    .where(
      and(
        eq(employeeLetters.tenantId, TENANT_ID),
        eq(employeeLetters.personId, personId),
      ),
    )
    .orderBy(desc(employeeLetters.createdDate))
}

// ── Employee email address ────────────────────────────────────────────────────

export async function getPersonEmail(personId: string): Promise<string | null> {
  const rows = await db
    .select({ contactValue: personContacts.contactValue })
    .from(personContacts)
    .where(
      and(
        eq(personContacts.personId, personId),
        eq(personContacts.contactType, 'WORK_EMAIL'),
      ),
    )
    .limit(1)
  return rows[0]?.contactValue ?? null
}

// ── Next letter number for a type ─────────────────────────────────────────────

export async function nextLetterNumber(typeCode: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `${typeCode}-${year}-`
  const [row] = await db.execute(
    sql`SELECT COUNT(*) AS cnt
        FROM employee_letters
        WHERE tenant_id = ${TENANT_ID}
          AND type_code  = ${typeCode}
          AND letter_number LIKE ${`${prefix}%`}`,
  )
  const count = Number((row as { cnt: string }).cnt ?? 0)
  return `${prefix}${String(count + 1).padStart(4, '0')}`
}

// ── Person detail (for letter data) ──────────────────────────────────────────

export async function getPersonWithDetails(personId: string) {
  const [person] = await db
    .select()
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1)
  if (!person) return null

  const [dept] = person.currentDepartmentId
    ? await db.select({ nameEn: departments.nameEn, nameAr: departments.nameAr })
        .from(departments).where(eq(departments.id, person.currentDepartmentId)).limit(1)
    : [null]

  const [job] = person.currentJobId
    ? await db.select({ jobTitleEn: jobs.jobTitleEn, jobTitleAr: jobs.jobTitleAr })
        .from(jobs).where(eq(jobs.id, person.currentJobId)).limit(1)
    : [null]

  const email = await getPersonEmail(personId)

  return {
    ...person,
    departmentNameEn: dept?.nameEn ?? null,
    departmentNameAr: dept?.nameAr ?? null,
    jobTitleEn:       job?.jobTitleEn ?? null,
    jobTitleAr:       job?.jobTitleAr ?? null,
    email,
  }
}
