'use server'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { userAccounts, persons, departments, legalEntities } from '@/drizzle/schema'
import { eq, and, ilike, or, asc, desc, sql, isNull, inArray, notInArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { TENANT_ID } from '@/lib/constants'
import { buildOrderBy } from '@/lib/table-sort'
import { writeAuditLog } from '@/lib/audit'
import { nextPersonNumber, composeFullNameEn } from '@/modules/core-hr/services'
import { ISO_DATE_RE, HR_MIN_YEAR, HR_MAX_YEAR } from '@/lib/validation/date-validators'

// ── Types & constants (re-exported from config for server-action callers) ─────

export type { KRole, UserRow, PersonOption, EntityOption, DepartmentOption } from './config'
import { ALL_ROLES, type UserRow, type PersonOption, type EntityOption, type DepartmentOption } from './config'

// ── Auth guard ────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const

async function guardAdmin() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!(ADMIN_ROLES as readonly string[]).includes(session.user.role)) redirect('/me')
  return session.user
}

// ── listUsers ─────────────────────────────────────────────────────────────────

// Employment types that identify non-employees (Contractor / Contingent / Service Account)
const NON_EMPLOYEE_TYPES = ['TASK_BASED', 'TEMPORARY', 'PART_TIME'] as const

export async function listUsers(opts: {
  search?:        string
  role?:          string
  userType?:      'employee' | 'system' | 'non-employee'
  page?:          number
  pageSize?:      number
  sortColumn?:    string
  sortDirection?: 'asc' | 'desc'
}): Promise<{
  rows:       UserRow[]
  total:      number
  page:       number
  totalPages: number
  pageSize:   number
}> {
  await guardAdmin()

  const page     = Math.max(1, opts.page     ?? 1)
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25))
  const offset   = (page - 1) * pageSize

  const conditions = [eq(userAccounts.tenantId, TENANT_ID)]
  if (opts.role) conditions.push(eq(userAccounts.avaniisRole, opts.role))
  if (opts.userType === 'system') {
    conditions.push(eq(persons.isSystemUser, true))
  } else if (opts.userType === 'non-employee') {
    conditions.push(eq(persons.isSystemUser, false))
    conditions.push(inArray(persons.employmentType, [...NON_EMPLOYEE_TYPES]))
  } else if (opts.userType === 'employee') {
    conditions.push(eq(persons.isSystemUser, false))
    conditions.push(notInArray(persons.employmentType, [...NON_EMPLOYEE_TYPES]))
  }
  if (opts.search) {
    const q = `%${opts.search}%`
    conditions.push(
      or(
        ilike(persons.personNumber,        q),
        ilike(persons.fullNameEn,          q),
        ilike(userAccounts.primaryEmail,   q),
        ilike(userAccounts.avaniisRole,    q),
        ilike(departments.nameEn,          q),
      )!,
    )
  }

  const where = and(...conditions)

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        accountId:        userAccounts.id,
        personId:         userAccounts.personId,
        personNumber:     persons.personNumber,
        fullNameEn:       persons.fullNameEn,
        primaryEmail:     userAccounts.primaryEmail,
        avaniisRole:      userAccounts.avaniisRole,
        isActive:         userAccounts.isActive,
        lastLoginAt:      userAccounts.lastLoginAt,
        loginCount:       userAccounts.loginCount,
        mfaEnrolled:      userAccounts.mfaEnrolled,
        departmentId:     persons.currentDepartmentId,
        departmentNameEn: departments.nameEn,
        isSystemUser:     persons.isSystemUser,
        employmentType:   persons.employmentType,
        createdByName:    userAccounts.createdByName,
        createdDate:      userAccounts.createdDate,
        updatedByName:    userAccounts.updatedByName,
        updatedDate:      userAccounts.updatedDate,
      })
      .from(userAccounts)
      .innerJoin(persons, eq(userAccounts.personId, persons.id))
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(where)
      .orderBy(...(() => {
        // user_type is a computed label (System / Non-Employee / Employee) so we
        // sort by a CASE expression instead of a plain column reference.
        if (opts.sortColumn === 'user_type') {
          const expr = sql`CASE
            WHEN ${persons.isSystemUser} = true THEN 1
            WHEN ${persons.employmentType} IN ('TASK_BASED','TEMPORARY','PART_TIME') THEN 2
            ELSE 3
          END`
          return [opts.sortDirection === 'desc' ? desc(expr) : asc(expr)]
        }
        return buildOrderBy(
          { column: opts.sortColumn ?? null, direction: opts.sortDirection ?? null },
          {
            person_number: persons.personNumber,
            name:          persons.fullNameEn,
            email:         userAccounts.primaryEmail,
            role:          userAccounts.avaniisRole,
            department:    departments.nameEn,
            status:        userAccounts.isActive,
            last_login:    userAccounts.lastLoginAt,
          },
          persons.fullNameEn,
        )
      })())
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userAccounts)
      .innerJoin(persons, eq(userAccounts.personId, persons.id))
      .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
      .where(where),
  ])

  const total = countRow?.count ?? 0
  return {
    rows: rows.map(r => ({
      accountId:        r.accountId,
      personId:         r.personId,
      personNumber:     r.personNumber ?? null,
      fullNameEn:       r.fullNameEn ?? null,
      primaryEmail:     r.primaryEmail,
      avaniisRole:      r.avaniisRole,
      departmentId:     r.departmentId ?? null,
      departmentNameEn: r.departmentNameEn ?? null,
      isActive:         r.isActive,
      lastLoginAt:      r.lastLoginAt?.toISOString() ?? null,
      loginCount:       r.loginCount,
      mfaEnrolled:      r.mfaEnrolled,
      isSystemUser:     r.isSystemUser,
      employmentType:   r.employmentType,
      createdByName:    r.createdByName ?? null,
      createdDate:      r.createdDate?.toISOString() ?? null,
      updatedByName:    r.updatedByName ?? null,
      updatedDate:      r.updatedDate?.toISOString() ?? null,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  }
}

// ── listPersonsWithoutAccounts ────────────────────────────────────────────────

export async function listPersonsWithoutAccounts(): Promise<PersonOption[]> {
  await guardAdmin()
  const rows = await db
    .select({
      id:               persons.id,
      fullNameEn:       persons.fullNameEn,
      departmentNameEn: departments.nameEn,
      legalEntityId:    persons.legalEntityId,
    })
    .from(persons)
    .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
    .where(
      and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.isActive, true),
        isNull(persons.userAccountId),
      ),
    )
    .orderBy(asc(persons.fullNameEn))
    .limit(300)

  return rows.map(r => ({
    id:               r.id,
    fullNameEn:       r.fullNameEn ?? null,
    departmentNameEn: r.departmentNameEn ?? null,
    legalEntityId:    r.legalEntityId,
  }))
}

// ── listEntities ──────────────────────────────────────────────────────────────

export async function listEntities(): Promise<EntityOption[]> {
  await guardAdmin()
  const rows = await db
    .select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
    .from(legalEntities)
    .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
    .orderBy(asc(legalEntities.nameEn))
  return rows
}

// ── listDepartmentsForUsers ───────────────────────────────────────────────────

export async function listDepartmentsForUsers(
  currentDepartmentId?: string | null,
): Promise<DepartmentOption[]> {
  await guardAdmin()

  // Active departments from active entities only
  const rows = await db
    .select({
      id:           departments.id,
      nameEn:       departments.nameEn,
      entityNameEn: legalEntities.nameEn,
      isActive:     departments.isActive,
      entityActive: legalEntities.isActive,
    })
    .from(departments)
    .leftJoin(legalEntities, eq(departments.legalEntityId, legalEntities.id))
    .where(
      and(
        eq(departments.tenantId, TENANT_ID),
        eq(departments.isActive, true),
        eq(legalEntities.isActive, true),
      ),
    )
    .orderBy(asc(legalEntities.nameEn), asc(departments.nameEn))

  const result: DepartmentOption[] = rows.map(r => ({
    id:           r.id,
    nameEn:       r.nameEn ?? null,
    entityNameEn: r.entityNameEn ?? null,
    isInactive:   false,
  }))

  // If the user's current department is inactive or belongs to an inactive entity,
  // still include it so the picker can display what they currently have assigned.
  if (currentDepartmentId && !result.find(r => r.id === currentDepartmentId)) {
    const [stale] = await db
      .select({
        id:           departments.id,
        nameEn:       departments.nameEn,
        entityNameEn: legalEntities.nameEn,
      })
      .from(departments)
      .leftJoin(legalEntities, eq(departments.legalEntityId, legalEntities.id))
      .where(and(eq(departments.id, currentDepartmentId), eq(departments.tenantId, TENANT_ID)))
      .limit(1)
    if (stale) {
      result.unshift({
        id:           stale.id,
        nameEn:       stale.nameEn ?? null,
        entityNameEn: stale.entityNameEn ?? null,
        isInactive:   true,
      })
    }
  }

  return result
}

// ── updateUserRole ────────────────────────────────────────────────────────────

export async function updateUserRole(
  accountId: string,
  newRole: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await guardAdmin()

  const valid = ALL_ROLES.map(r => r.value) as string[]
  if (!valid.includes(newRole)) return { success: false, error: 'Invalid role' }
  if (newRole === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return { success: false, error: 'Only SUPER_ADMIN can assign that role' }
  }

  await db.transaction(async tx => {
    // Fetch old role for audit diff
    const [before] = await tx
      .select({ avaniisRole: userAccounts.avaniisRole })
      .from(userAccounts)
      .where(and(eq(userAccounts.id, accountId), eq(userAccounts.tenantId, TENANT_ID)))
      .limit(1)

    await tx
      .update(userAccounts)
      .set({
        avaniisRole:   newRole,
        updatedBy:     user.id,
        updatedByName: user.name ?? '',
        updatedDate:   new Date(),
      })
      .where(and(eq(userAccounts.id, accountId), eq(userAccounts.tenantId, TENANT_ID)))

    await writeAuditLog(
      {
        actorId:       user.id,
        actorName:     user.name ?? user.id,
        actorRole:     user.role,
        channel:       'WEB',
        eventType:     'USER.ROLE_CHANGED',
        resourceType:  'user_accounts',
        resourceId:    accountId,
        changedFields: ['avaniisRole'],
        oldValues:     { avaniisRole: before?.avaniisRole },
        newValues:     { avaniisRole: newRole },
        description:   `Role changed from ${before?.avaniisRole ?? '?'} to ${newRole}`,
      },
      tx,
    )
  })

  revalidatePath('/users')
  return { success: true }
}

// ── toggleUserStatus ──────────────────────────────────────────────────────────

export async function toggleUserStatus(
  accountId: string,
  activate: boolean,
): Promise<{ success: boolean; error?: string }> {
  const user = await guardAdmin()

  await db.transaction(async tx => {
    await tx
      .update(userAccounts)
      .set({
        isActive:          activate,
        deactivatedAt:     activate ? null : new Date(),
        deactivatedReason: activate ? null : 'Deactivated by administrator',
        updatedBy:         user.id,
        updatedByName:     user.name ?? '',
        updatedDate:       new Date(),
      })
      .where(and(eq(userAccounts.id, accountId), eq(userAccounts.tenantId, TENANT_ID)))

    await writeAuditLog(
      {
        actorId:       user.id,
        actorName:     user.name ?? user.id,
        actorRole:     user.role,
        channel:       'WEB',
        eventType:     activate ? 'USER.ACTIVATED' : 'USER.DEACTIVATED',
        resourceType:  'user_accounts',
        resourceId:    accountId,
        changedFields: ['isActive'],
        newValues:     { isActive: activate },
        description:   activate ? 'Account reactivated by administrator' : 'Account deactivated by administrator',
      },
      tx,
    )
  })

  revalidatePath('/users')
  return { success: true }
}

// ── updateUserAccount ─────────────────────────────────────────────────────────

export async function updateUserAccount(
  accountId: string,
  data: {
    primaryEmail:  string
    avaniisRole:   string
    isActive:      boolean
    departmentId?: string | null   // null = clear department, undefined = leave unchanged
  },
): Promise<{ success: boolean; error?: string }> {
  const user = await guardAdmin()

  const valid = ALL_ROLES.map(r => r.value) as string[]
  if (!valid.includes(data.avaniisRole)) return { success: false, error: 'Invalid role' }
  if (data.avaniisRole === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return { success: false, error: 'Only SUPER_ADMIN can assign that role' }
  }

  const email = data.primaryEmail.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Invalid email address' }
  }

  try {
    await db.transaction(async tx => {
      // 1 — Update user account row
      await tx
        .update(userAccounts)
        .set({
          primaryEmail:      email,
          avaniisRole:       data.avaniisRole,
          isActive:          data.isActive,
          deactivatedAt:     data.isActive ? null : new Date(),
          deactivatedReason: data.isActive ? null : 'Deactivated via Edit User',
          updatedBy:         user.id,
          updatedByName:     user.name ?? '',
          updatedDate:       new Date(),
        })
        .where(and(eq(userAccounts.id, accountId), eq(userAccounts.tenantId, TENANT_ID)))

      // 2 — If departmentId was supplied, update person's current department
      if (data.departmentId !== undefined) {
        // Resolve personId for this account
        const [acct] = await tx
          .select({ personId: userAccounts.personId })
          .from(userAccounts)
          .where(eq(userAccounts.id, accountId))
          .limit(1)
        if (acct) {
          await tx
            .update(persons)
            .set({
              currentDepartmentId: data.departmentId ?? null,
              updatedBy:           user.id,
              updatedByName:       user.name ?? '',
              updatedDate:         new Date(),
            })
            .where(and(eq(persons.id, acct.personId), eq(persons.tenantId, TENANT_ID)))
        }
      }

      // 3 — Audit log (Hard Rule 1 — same transaction)
      await writeAuditLog(
        {
          actorId:      user.id,
          actorName:    user.name ?? user.id,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'USER.UPDATED',
          resourceType: 'user_accounts',
          resourceId:   accountId,
          changedFields: ['primaryEmail', 'avaniisRole', 'isActive', ...(data.departmentId !== undefined ? ['currentDepartmentId'] : [])],
          newValues: {
            primaryEmail: email,
            avaniisRole:  data.avaniisRole,
            isActive:     data.isActive,
            ...(data.departmentId !== undefined ? { currentDepartmentId: data.departmentId } : {}),
          },
          description: 'User account updated via Edit User modal',
        },
        tx,
      )
    })

    revalidatePath('/users')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { success: false, error: 'That email is already in use.' }
    }
    return { success: false, error: 'Failed to update account. Please try again.' }
  }
}

// ── createUserAccount ─────────────────────────────────────────────────────────

export async function createUserAccount(data: {
  personId:        string
  primaryEmail:    string
  avaniisRole:     string
  primaryEntityId: string
  initialPassword?: string   // optional — set by SUPER_ADMIN at creation
}): Promise<{ success: boolean; error?: string }> {
  const user = await guardAdmin()

  const valid = ALL_ROLES.map(r => r.value) as string[]
  if (!valid.includes(data.avaniisRole)) return { success: false, error: 'Invalid role' }
  if (data.avaniisRole === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return { success: false, error: 'Only SUPER_ADMIN can assign that role' }
  }

  const passwordHash = data.initialPassword?.trim()
    ? await bcrypt.hash(data.initialPassword.trim(), 12)
    : null

  try {
    const [account] = await db
      .insert(userAccounts)
      .values({
        tenantId:           TENANT_ID,
        personId:           data.personId,
        primaryEmail:       data.primaryEmail.trim().toLowerCase(),
        passwordHash:       passwordHash ?? undefined,
        avaniisRole:        data.avaniisRole,
        primaryEntityId:    data.primaryEntityId,
        primarySsoProvider: passwordHash ? 'LOCAL' : 'MICROSOFT_AD',
        allowedEntityIds:   [data.primaryEntityId],
        isActive:           true,
        createdBy:          user.id,
        createdByName:      user.name ?? '',
        updatedBy:          user.id,
        updatedByName:      user.name ?? '',
        updatedDate:        new Date(),
      })
      .returning({ id: userAccounts.id })

    // Back-link the person record to this account
    await db
      .update(persons)
      .set({
        userAccountId: account!.id,
        updatedBy:     user.id,
        updatedByName: user.name ?? '',
        updatedDate:   new Date(),
      })
      .where(and(eq(persons.id, data.personId), eq(persons.tenantId, TENANT_ID)))

    revalidatePath('/users')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { success: false, error: 'That email already has a user account.' }
    }
    return { success: false, error: 'Failed to create account. Please try again.' }
  }
}

// ── createNonEmployeeUserAccount ──────────────────────────────────────────────
// Creates a minimal persons stub + user account in a single transaction.
// Used for contractors, contingent workers, and system/service accounts
// that are not part of the HR employees database.

export async function createNonEmployeeUserAccount(data: {
  // Person stub fields
  firstNameEn:         string
  lastNameEn:          string
  fullNameAr:          string   // defaults to EN name if not provided
  dateOfBirth:         string   // YYYY-MM-DD
  gender:              string   // MALE | FEMALE | OTHER
  nationalityCode:     string   // 3-char ISO e.g. GBR, IND, UAE
  nationalityCategory: string   // UAE_NATIONAL | GCC_NATIONAL | EXPAT
  userType:            string   // CONTRACTOR | CONTINGENT | SERVICE_ACCOUNT
  // User account fields
  primaryEmail:        string
  avaniisRole:         string
  primaryEntityId:     string
  initialPassword?:    string   // optional — set by SUPER_ADMIN at creation
}): Promise<{ success: boolean; error?: string }> {
  const user = await guardAdmin()

  const valid = ALL_ROLES.map(r => r.value) as string[]
  if (!valid.includes(data.avaniisRole)) return { success: false, error: 'Invalid role' }
  if (data.avaniisRole === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return { success: false, error: 'Only SUPER_ADMIN can assign that role' }
  }

  const email = data.primaryEmail.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Invalid email address' }
  }
  if (!data.firstNameEn.trim() || !data.lastNameEn.trim()) {
    return { success: false, error: 'First name and last name are required.' }
  }
  if (!data.dateOfBirth || !ISO_DATE_RE.test(data.dateOfBirth)) {
    return { success: false, error: 'Valid date of birth is required (YYYY-MM-DD).' }
  }
  const dobYear = parseInt(data.dateOfBirth.slice(0, 4), 10)
  if (dobYear < HR_MIN_YEAR || dobYear > HR_MAX_YEAR) {
    return { success: false, error: `Date of birth year must be between ${HR_MIN_YEAR} and ${HR_MAX_YEAR}.` }
  }

  // Map userType → employmentType on persons table
  // Valid DB values: FULL_TIME | PART_TIME | TEMPORARY | TASK_BASED | FLEXIBLE | REMOTE | SHARED
  const employmentTypeMap: Record<string, string> = {
    CONTRACTOR:      'TASK_BASED',
    CONTINGENT:      'TEMPORARY',
    SERVICE_ACCOUNT: 'PART_TIME',
  }
  const employmentType = employmentTypeMap[data.userType] ?? 'TASK_BASED'

  const passwordHash = data.initialPassword?.trim()
    ? await bcrypt.hash(data.initialPassword.trim(), 12)
    : null

  try {
    await db.transaction(async tx => {
      // 1 — Generate person number in the target entity
      const personNumber = await nextPersonNumber(data.primaryEntityId, tx)
      const fullNameEn   = composeFullNameEn({ firstNameEn: data.firstNameEn, lastNameEn: data.lastNameEn })
      const fullNameAr   = data.fullNameAr?.trim() || fullNameEn

      // 2 — Insert person stub
      const [newPerson] = await tx
        .insert(persons)
        .values({
          tenantId:            TENANT_ID,
          personNumber,
          legalEntityId:       data.primaryEntityId,
          firstNameEn:         data.firstNameEn.trim(),
          lastNameEn:          data.lastNameEn.trim(),
          fullNameEn,
          fullNameAr,
          dateOfBirth:         data.dateOfBirth,
          gender:              data.gender,
          nationalityCode:     data.nationalityCode.toUpperCase(),
          nationalityCategory: data.nationalityCategory,
          employmentType,
          hireDate:            new Date().toISOString().split('T')[0]!, // today
          assignmentStatus:    'ACTIVE',
          isActive:            true,
          createdBy:           user.id,
          createdByName:       user.name ?? '',
          updatedBy:           user.id,
          updatedByName:       user.name ?? '',
          updatedDate:         new Date(),
        })
        .returning({ id: persons.id })

      const personId = newPerson!.id

      // 3 — Insert user account
      const [account] = await tx
        .insert(userAccounts)
        .values({
          tenantId:           TENANT_ID,
          personId,
          primaryEmail:       email,
          passwordHash:       passwordHash ?? undefined,
          avaniisRole:        data.avaniisRole,
          primaryEntityId:    data.primaryEntityId,
          primarySsoProvider: passwordHash ? 'LOCAL' : 'MICROSOFT_AD',
          allowedEntityIds:   [data.primaryEntityId],
          isActive:           true,
          createdBy:          user.id,
          createdByName:      user.name ?? '',
          updatedBy:          user.id,
          updatedByName:      user.name ?? '',
          updatedDate:        new Date(),
        })
        .returning({ id: userAccounts.id })

      // 4 — Back-link person → account
      await tx
        .update(persons)
        .set({ userAccountId: account!.id })
        .where(eq(persons.id, personId))

      // 5 — Audit log (Hard Rule 1)
      await writeAuditLog(
        {
          actorId:      user.id,
          actorName:    user.name ?? user.id,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'USER.CREATED',
          resourceType: 'user_accounts',
          resourceId:   account!.id,
          changedFields: ['personId', 'primaryEmail', 'avaniisRole', 'isActive'],
          newValues: {
            primaryEmail:  email,
            avaniisRole:   data.avaniisRole,
            personNumber,
            userType:      data.userType,
          },
          description: `Non-employee user account created (${data.userType})`,
        },
        tx,
      )
    })

    revalidatePath('/users')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { success: false, error: 'That email already has a user account.' }
    }
    console.error('[createNonEmployeeUserAccount]', e)
    return { success: false, error: e instanceof Error ? e.message : 'Failed to create account. Please try again.' }
  }
}

// ── setUserPassword ───────────────────────────────────────────────────────────
// SUPER_ADMIN only. Sets (or clears) the LOCAL password for any account.
// Clearing (empty string) removes password-based login — account becomes SSO-only.

export async function setUserPassword(
  accountId: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await guardAdmin()

  if (user.role !== 'SUPER_ADMIN') {
    return { success: false, error: 'Only SUPER_ADMIN can change passwords.' }
  }
  if (!newPassword.trim()) {
    return { success: false, error: 'Password cannot be empty.' }
  }
  if (newPassword.trim().length < 8) {
    return { success: false, error: 'Password must be at least 8 characters.' }
  }

  const hash = await bcrypt.hash(newPassword.trim(), 12)

  try {
    await db.transaction(async tx => {
      await tx
        .update(userAccounts)
        .set({
          passwordHash:       hash,
          primarySsoProvider: 'LOCAL',
          updatedBy:          user.id,
          updatedByName:      user.name ?? user.id,
          updatedDate:        new Date(),
        })
        .where(and(eq(userAccounts.id, accountId), eq(userAccounts.tenantId, TENANT_ID)))

      await writeAuditLog(
        {
          actorId:      user.id,
          actorName:    user.name ?? user.id,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'USER.PASSWORD_CHANGED',
          resourceType: 'user_accounts',
          resourceId:   accountId,
          changedFields: ['passwordHash', 'primarySsoProvider'],
          description:  'Password set by SUPER_ADMIN',
        },
        tx,
      )
    })

    revalidatePath('/users')
    return { success: true }
  } catch (e: unknown) {
    console.error('[setUserPassword]', e)
    return { success: false, error: 'Failed to update password.' }
  }
}
