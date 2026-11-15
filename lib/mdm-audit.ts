'use server'

import { db } from './db'
import { auditLog } from '@/drizzle/schema'
import { eq, desc, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'

export interface AuditHistoryEntry {
  id:            string
  eventType:     string
  actorName:     string
  actorRole:     string
  resourceId:    string | null
  oldValues:     Record<string, unknown> | null
  newValues:     Record<string, unknown> | null
  changedFields: string[] | null
  metadata:      Record<string, unknown> | null
  createdDate:   Date
}

export async function getMdmChangeHistory(
  resourceType: string,
  limit = 20,
): Promise<AuditHistoryEntry[]> {
  try {
    const rows = await db
      .select({
        id:            auditLog.id,
        eventType:     auditLog.eventType,
        actorName:     auditLog.actorName,
        actorRole:     auditLog.actorRole,
        resourceId:    auditLog.resourceId,
        oldValues:     auditLog.oldValues,
        newValues:     auditLog.newValues,
        changedFields: auditLog.changedFields,
        metadata:      auditLog.metadata,
        createdDate:   auditLog.eventTime,
      })
      .from(auditLog)
      .where(eq(auditLog.resourceType, resourceType))
      .orderBy(desc(auditLog.eventTime))
      .limit(limit)

    return rows.map(r => ({
      id:            r.id,
      eventType:     r.eventType,
      actorName:     r.actorName,
      actorRole:     r.actorRole,
      resourceId:    r.resourceId ?? null,
      oldValues:     (r.oldValues     as Record<string, unknown> | null) ?? null,
      newValues:     (r.newValues     as Record<string, unknown> | null) ?? null,
      changedFields: (r.changedFields as string[] | null) ?? null,
      metadata:      (r.metadata      as Record<string, unknown> | null) ?? null,
      createdDate:   r.createdDate,
    }))
  } catch {
    return []
  }
}

export async function getRecordHistory(
  resourceType: string,
  resourceId:   string,
  limit = 50,
): Promise<AuditHistoryEntry[]> {
  const session = await auth()
  if (!session?.user) return []

  const role = session.user.role
  if (!['HR_ADMIN', 'HR_MANAGER', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(role)) return []

  try {
    const rows = await db
      .select({
        id:            auditLog.id,
        eventType:     auditLog.eventType,
        actorName:     auditLog.actorName,
        actorRole:     auditLog.actorRole,
        resourceId:    auditLog.resourceId,
        oldValues:     auditLog.oldValues,
        newValues:     auditLog.newValues,
        changedFields: auditLog.changedFields,
        metadata:      auditLog.metadata,
        createdDate:   auditLog.eventTime,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.resourceType, resourceType),
          eq(auditLog.resourceId,   resourceId),
        ),
      )
      .orderBy(desc(auditLog.eventTime))
      .limit(limit)

    return rows.map(r => ({
      id:            r.id,
      eventType:     r.eventType,
      actorName:     r.actorName,
      actorRole:     r.actorRole,
      resourceId:    r.resourceId ?? null,
      oldValues:     (r.oldValues     as Record<string, unknown> | null) ?? null,
      newValues:     (r.newValues     as Record<string, unknown> | null) ?? null,
      changedFields: (r.changedFields as string[] | null) ?? null,
      metadata:      (r.metadata      as Record<string, unknown> | null) ?? null,
      createdDate:   r.createdDate,
    }))
  } catch {
    return []
  }
}
