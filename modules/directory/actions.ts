'use server'

import { translateError } from '@/lib/app-error'
import { and, eq, ilike, or, count, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { auth } from '@/lib/auth'
import {
  persons,
  departments,
  positions,
  legalEntities,
  personContacts,
} from '@/drizzle/schema'

export interface DirectoryPerson {
  id:               string
  personNumber:     string
  fullNameEn:       string | null
  fullNameAr:       string
  workEmail:        string | null
  mobileNumber:     string | null
  legalEntityId:    string
  legalEntityCode:  string | null
  legalEntityNameEn: string | null
  departmentId:     string | null
  departmentNameEn: string | null
  positionId:       string | null
  positionTitleEn:  string | null
  assignmentStatus: string
  /** Cloud URL (Azure/AWS) or empty string */
  profilePhotoUrl:  string | null
  /** Base64 data URL — durable fallback when cloud is not configured */
  profilePhotoData: string | null
  /** Resolved photo source: profilePhotoUrl || profilePhotoData */
  photoSrc:         string | null
}

export interface DirectoryResult {
  rows:       DirectoryPerson[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

export async function searchDirectory(params: {
  query:        string
  page?:        number
  pageSize?:    number
  departmentId?: string
  locationId?:  string
  entityId?:    string
}): Promise<DirectoryResult> {
  try {
    const session = await auth()
    if (!session?.user) return { rows: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }

  const { role, legalEntityId: viewerEntityId } = session.user
  const page     = Math.max(1, params.page     ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const term     = params.query.trim()
  const like     = term ? `%${term}%` : '%'

  const conditions = [
    eq(persons.tenantId, TENANT_ID),
    eq(persons.isActive, true),
  ]

  // EMPLOYEE → own legal entity only (Security spec §2.4)
  if (role === 'EMPLOYEE') {
    conditions.push(eq(persons.legalEntityId, viewerEntityId ?? ''))
  } else if (params.entityId) {
    conditions.push(eq(persons.legalEntityId, params.entityId))
  }

  if (params.departmentId) {
    conditions.push(eq(persons.currentDepartmentId, params.departmentId))
  }

  if (term) {
    conditions.push(
      or(
        ilike(persons.fullNameEn,    like),
        ilike(persons.fullNameAr,    like),
        ilike(persons.personNumber,  like),
        ilike(departments.nameEn,    like),
        ilike(positions.positionTitleEn, like),
        ilike(legalEntities.nameEn,  like),
      )!,
    )
  }

  const where = and(...conditions)!

  const [{ total }] = await db
    .select({ total: count() })
    .from(persons)
    .leftJoin(departments,   eq(persons.currentDepartmentId, departments.id))
    .leftJoin(positions,     eq(persons.currentPositionId,   positions.id))
    .leftJoin(legalEntities, eq(persons.legalEntityId,       legalEntities.id))
    .where(where)

  const rows = await db
    .select({
      id:               persons.id,
      personNumber:     persons.personNumber,
      fullNameEn:       persons.fullNameEn,
      fullNameAr:       persons.fullNameAr,
      legalEntityId:    persons.legalEntityId,
      legalEntityCode:  legalEntities.entityCode,
      legalEntityNameEn: legalEntities.nameEn,
      departmentId:     persons.currentDepartmentId,
      departmentNameEn: departments.nameEn,
      positionId:       persons.currentPositionId,
      positionTitleEn:  positions.positionTitleEn,
      assignmentStatus: persons.assignmentStatus,
      profilePhotoUrl:  persons.profilePhotoUrl,
      profilePhotoData: persons.profilePhotoData,
    })
    .from(persons)
    .leftJoin(departments,   eq(persons.currentDepartmentId, departments.id))
    .leftJoin(positions,     eq(persons.currentPositionId,   positions.id))
    .leftJoin(legalEntities, eq(persons.legalEntityId,       legalEntities.id))
    .where(where)
    .orderBy(persons.fullNameEn)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  if (rows.length === 0) {
    return { rows: [], total: Number(total), page, pageSize, totalPages: Math.ceil(Number(total) / pageSize) || 1 }
  }

  // Batch-fetch work email + mobile for the returned page
  const personIds = rows.map(r => r.id)
  const contacts = await db
    .select({
      personId:     personContacts.personId,
      contactType:  personContacts.contactType,
      contactValue: personContacts.contactValue,
    })
    .from(personContacts)
    .where(
      and(
        eq(personContacts.tenantId, TENANT_ID),
        eq(personContacts.isActive, true),
        inArray(personContacts.personId, personIds),
        or(
          eq(personContacts.contactType, 'WORK_EMAIL'),
          eq(personContacts.contactType, 'MOBILE_PRIMARY'),
        )!,
      )!,
    )

  const emailMap  = new Map<string, string>()
  const mobileMap = new Map<string, string>()
  for (const c of contacts) {
    if (c.contactType === 'WORK_EMAIL'     && !emailMap.has(c.personId))  emailMap.set(c.personId,  c.contactValue)
    if (c.contactType === 'MOBILE_PRIMARY' && !mobileMap.has(c.personId)) mobileMap.set(c.personId, c.contactValue)
  }

  const list: DirectoryPerson[] = rows.map(r => {
    const photoUrl  = r.profilePhotoUrl  || null
    const photoData = r.profilePhotoData || null
    return {
      id:               r.id,
      personNumber:     r.personNumber,
      fullNameEn:       r.fullNameEn,
      fullNameAr:       r.fullNameAr,
      workEmail:        emailMap.get(r.id)  ?? null,
      mobileNumber:     mobileMap.get(r.id) ?? null,
      legalEntityId:    r.legalEntityId,
      legalEntityCode:  r.legalEntityCode  ?? null,
      legalEntityNameEn: r.legalEntityNameEn ?? null,
      departmentId:     r.departmentId     ?? null,
      departmentNameEn: r.departmentNameEn ?? null,
      positionId:       r.positionId       ?? null,
      positionTitleEn:  r.positionTitleEn  ?? null,
      assignmentStatus: r.assignmentStatus,
      profilePhotoUrl:  photoUrl,
      profilePhotoData: photoData,
      photoSrc:         photoUrl || photoData,
    }
  })

    return {
      rows:       list,
      total:      Number(total),
      page,
      pageSize,
      totalPages: Math.ceil(Number(total) / pageSize) || 1,
    }
  } catch (e) { translateError(e, 'searchDirectory') }
}

// ── Single colleague card (read-only, directory-level fields only) ───────────
// Returns ONLY name, job title, department, entity and work contact for ONE
// person — the same non-sensitive fields the directory list exposes. Used by
// employees viewing a colleague from the org chart (they cannot open the full
// /persons HR profile). Same-tenant scope; no salary/PII/documents.
export async function getColleagueProfile(personId: string): Promise<DirectoryPerson | null> {
  try {
    const session = await auth()
    if (!session?.user) return null
    if (!personId) return null

    const [row] = await db
      .select({
        id:                persons.id,
        personNumber:      persons.personNumber,
        fullNameEn:        persons.fullNameEn,
        fullNameAr:        persons.fullNameAr,
        legalEntityId:     persons.legalEntityId,
        legalEntityCode:   legalEntities.entityCode,
        legalEntityNameEn: legalEntities.nameEn,
        departmentId:      persons.currentDepartmentId,
        departmentNameEn:  departments.nameEn,
        positionId:        persons.currentPositionId,
        positionTitleEn:   positions.positionTitleEn,
        assignmentStatus:  persons.assignmentStatus,
        profilePhotoUrl:   persons.profilePhotoUrl,
        profilePhotoData:  persons.profilePhotoData,
      })
      .from(persons)
      .leftJoin(legalEntities, eq(persons.legalEntityId, legalEntities.id))
      .leftJoin(departments,   eq(persons.currentDepartmentId, departments.id))
      .leftJoin(positions,     eq(persons.currentPositionId, positions.id))
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
      .limit(1)

    if (!row) return null

    // Work contact (directory-level, non-sensitive)
    const contactRows = await db
      .select({ contactType: personContacts.contactType, contactValue: personContacts.contactValue })
      .from(personContacts)
      .where(and(
        eq(personContacts.tenantId, TENANT_ID),
        eq(personContacts.personId, personId),
        eq(personContacts.isActive, true),
      ))
    const workEmail   = contactRows.find(c => c.contactType === 'WORK_EMAIL')?.contactValue   ?? null
    const mobileNumber = contactRows.find(c => c.contactType === 'MOBILE_PRIMARY')?.contactValue ?? null

    const photoUrl  = row.profilePhotoUrl  ?? null
    const photoData = row.profilePhotoData ?? null

    return {
      id:                row.id,
      personNumber:      row.personNumber,
      fullNameEn:        row.fullNameEn,
      fullNameAr:        row.fullNameAr ?? '',
      workEmail,
      mobileNumber,
      legalEntityId:     row.legalEntityId,
      legalEntityCode:   row.legalEntityCode   ?? null,
      legalEntityNameEn: row.legalEntityNameEn ?? null,
      departmentId:      row.departmentId      ?? null,
      departmentNameEn:  row.departmentNameEn  ?? null,
      positionId:        row.positionId        ?? null,
      positionTitleEn:   row.positionTitleEn   ?? null,
      assignmentStatus:  row.assignmentStatus,
      profilePhotoUrl:   photoUrl,
      profilePhotoData:  photoData,
      photoSrc:          photoUrl || photoData,
    }
  } catch {
    return null
  }
}
