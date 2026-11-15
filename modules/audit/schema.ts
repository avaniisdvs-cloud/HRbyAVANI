/**
 * audit schema re-exports — Sprint 2 skeleton.
 * `audit_log` is INSERT-ONLY at both the application layer (lib/audit.ts)
 * and the database layer (REVOKE UPDATE, DELETE FROM PUBLIC — Sprint 2 migration).
 */
export { auditLog } from '@/drizzle/schema'

export type {
  AuditLogEntry,
  NewAuditLogEntry,
} from '@/drizzle/schema'
