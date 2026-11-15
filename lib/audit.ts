/**
 * Immutable audit-log writer — BR-AUDIT-001.
 * Writes to audit_log (INSERT only; no UPDATE or DELETE ever).
 *
 * Hard Rule 1 — every business write is paired with an audit row in the SAME
 * Drizzle transaction. Pass the tx handle from db.transaction(async tx => ...)
 * as the second argument; without it, the call uses the global pool (legacy).
 */
import { db } from './db'
import { auditLog } from '@/drizzle/schema'
import { TENANT_ID } from './constants'
import type { ActionMode } from '@/lib/action-mode'

// Anything with `.insert(table).values(...)` — db itself or a tx handle.
type DbExecutor = Pick<typeof db, 'insert'>

export interface AuditEvent {
  actorId:       string
  actorName:     string
  actorRole:     string
  actorEntityId?: string
  channel:       'WEB' | 'MOBILE' | 'ARIA_TEXT' | 'ARIA_VOICE' | 'API' | 'SYSTEM' | 'BATCH' | 'EMAIL_GRAPH' | 'EMAIL_SMTP'
  ipAddress?:    string
  deviceInfo?:   string
  sessionId?:    string
  eventType:     string   // e.g. 'EMPLOYEE.SALARY.VIEW'
  resourceType:  string   // e.g. 'persons'
  resourceId?:   string
  entityId?:     string
  oldValues?:    Record<string, unknown>
  newValues?:    Record<string, unknown>
  changedFields?: string[]
  metadata?:     Record<string, unknown>
  description?:  string
  // Distinguishes business events from in-place data corrections in the audit trail.
  actionMode?:   ActionMode
}

export async function writeAuditLog(
  event: AuditEvent,
  executor: DbExecutor = db,
): Promise<void> {
  await executor.insert(auditLog).values({
    tenantId:      TENANT_ID,
    actorId:       event.actorId,
    actorName:     event.actorName,
    actorRole:     event.actorRole,
    actorEntityId: event.actorEntityId,
    channel:       event.channel,
    ipAddress:     event.ipAddress,
    deviceInfo:    event.deviceInfo,
    sessionId:     event.sessionId ? event.sessionId as unknown as string : undefined,
    eventType:     event.eventType,
    resourceType:  event.resourceType,
    resourceId:    event.resourceId ? event.resourceId as unknown as string : undefined,
    entityId:      event.entityId ? event.entityId as unknown as string : undefined,
    oldValues:     event.oldValues,
    newValues:     event.newValues,
    changedFields: event.changedFields,
    metadata:      event.actionMode
      ? { ...event.metadata, actionMode: event.actionMode }
      : event.metadata,
    description:   event.description,
  })
}

/** Computes changed field names by comparing before/after plain objects. */
export function diffFields(
  before: Record<string, unknown>,
  after:  Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed: string[] = []
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      changed.push(k)
    }
  }
  return changed
}
