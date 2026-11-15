/**
 * AVANIIS HR — Durable in-database document storage (PostgreSQL bytea)
 * Mirrors: drizzle/migrations/0052_document_file_data.sql
 *
 * Active when DOCUMENT_STORAGE_PROVIDER=postgres|db, or unset with DATABASE_URL
 * present (durable fallback). File bytes live in `file_data` (bytea); the
 * `storage_key` is the join key to person_documents.storage_key (and any other
 * table that stores a storage key, e.g. profile photos).
 *
 * BR-TENANT-001: carries tenant_id (Phase 1 single-tenant default).
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  customType,
} from 'drizzle-orm/pg-core'
import { TENANT_ID } from '../../lib/constants'

/**
 * PostgreSQL bytea column type.  postgres-js maps a JS Buffer parameter to bytea
 * on write and returns a Buffer on read, so no manual hex encoding is needed.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const documentFiles = pgTable(
  'document_files',
  {
    storageKey:     text('storage_key').primaryKey(),
    tenantId:       uuid('tenant_id').notNull().default(TENANT_ID),
    fileData:       bytea('file_data').notNull(),
    mimeType:       text('mime_type').notNull(),
    fileSizeBytes:  integer('file_size_bytes').notNull(),
    checksumSha256: text('checksum_sha256'),
    metadata:       jsonb('metadata').$type<Record<string, string>>(),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('idx_document_files_tenant').on(t.tenantId),
  }),
)
