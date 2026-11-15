/**
 * Employee Letters — Option B Dynamic Template Engine
 *
 * 4 tables:
 *   letter_field_registry    — 19 token definitions (one-time seed)
 *   letter_template_types    — 6 letter type definitions (PCL/SC/STL/NOC/EXP/WL)
 *   letter_templates         — DB-stored templates with {{token}} placeholders
 *   employee_letters         — generated letter instances
 *   letter_email_jobs        — bulk email delivery tracking
 */
import {
  pgTable, uuid, varchar, text, boolean, timestamp, integer,
  jsonb, date, char,
} from 'drizzle-orm/pg-core'
import { legalEntities, persons } from './foundation'
import { TENANT_ID } from '../../lib/constants'

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   text('created_by_name').notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   text('updated_by_name'),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ── 1. Token registry ─────────────────────────────────────────────────────────

export const letterFieldRegistry = pgTable('letter_field_registry', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  tokenKey:      varchar('token_key', { length: 100 }).notNull().unique(),
  labelEn:       varchar('label_en', { length: 200 }).notNull(),
  labelAr:       varchar('label_ar', { length: 200 }).notNull(),
  category:      varchar('category', { length: 50 }).notNull(),
  dataType:      varchar('data_type', { length: 20 }).notNull().default('string'),
  isSystemToken: boolean('is_system_token').notNull().default(true),
  sourceTable:   varchar('source_table', { length: 100 }),
  sourceColumn:  varchar('source_column', { length: 100 }),
  isRequired:    boolean('is_required').notNull().default(false),
  resolverKey:   varchar('resolver_key', { length: 100 }),
  ...audit(),
})

// ── 2. Letter template types ──────────────────────────────────────────────────

export const letterTemplateTypes = pgTable('letter_template_types', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  typeCode:            varchar('type_code', { length: 10 }).notNull().unique(),
  nameEn:              varchar('name_en', { length: 200 }).notNull(),
  nameAr:              varchar('name_ar', { length: 200 }).notNull(),
  numberPrefix:        varchar('number_prefix', { length: 10 }).notNull(),
  numberSeed:          integer('number_seed').notNull().default(0),
  requiresApproval:    boolean('requires_approval').notNull().default(false),
  allowEssSelfRequest: boolean('allow_ess_self_request').notNull().default(false),
  isActive:            boolean('is_active').notNull().default(true),
  ...audit(),
})

// ── 3. Letter templates (DB-stored, editable in settings UI) ──────────────────

export const letterTemplates = pgTable('letter_templates', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  typeId:        uuid('type_id').notNull().references(() => letterTemplateTypes.id),
  legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id),
  nameEn:        varchar('name_en', { length: 200 }).notNull(),
  nameAr:        varchar('name_ar', { length: 200 }),
  bodyEn:        text('body_en').notNull(),
  bodyAr:        text('body_ar'),
  isDefault:     boolean('is_default').notNull().default(false),
  isActive:      boolean('is_active').notNull().default(true),
  version:       integer('version').notNull().default(1),
  ...audit(),
})

// ── 4. Employee letter instances ──────────────────────────────────────────────

export const employeeLetters = pgTable('employee_letters', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:         uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:    uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  templateId:       uuid('template_id').references(() => letterTemplates.id),
  typeCode:         varchar('type_code', { length: 10 }).notNull(),
  letterNumber:     varchar('letter_number', { length: 50 }).notNull().unique(),

  // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | SIGNED | SENT | CANCELLED
  status:           varchar('status', { length: 30 }).notNull().default('DRAFT'),

  resolvedBodyEn:   text('resolved_body_en'),
  resolvedBodyAr:   text('resolved_body_ar'),
  tokenSnapshot:    jsonb('token_snapshot'),

  pdfUrl:                  varchar('pdf_url', { length: 500 }),
  // Base64 data URL fallback — durable in Neon when cloud storage is not
  // configured. Download priority: signedPdfUrl || pdfUrl || pdfData.
  pdfData:                 text('pdf_data'),
  // Real error message when PDF generation fails (surfaced to employee/HR).
  failureReason:           text('failure_reason'),
  signedPdfUrl:            varchar('signed_pdf_url', { length: 500 }),
  signingToken:            varchar('signing_token', { length: 200 }),
  signingTokenExpiresAt:   timestamp('signing_token_expires_at', { withTimezone: true }),
  signedAt:                timestamp('signed_at', { withTimezone: true }),
  signedByName:            varchar('signed_by_name', { length: 200 }),
  signedIp:                varchar('signed_ip', { length: 45 }),
  signedDevice:            varchar('signed_device', { length: 500 }),

  emailSentAt:      timestamp('email_sent_at', { withTimezone: true }),
  emailRecipient:   varchar('email_recipient', { length: 500 }),
  emailStatus:      varchar('email_status', { length: 30 }),

  // workflow_instances_v2: resourceType='letter_'+typeCode, resourceId=this.id
  workflowInstanceId:    uuid('workflow_instance_id'),
  requestedByEmployee:   boolean('requested_by_employee').notNull().default(false),
  requestedAt:           timestamp('requested_at', { withTimezone: true }),

  generatedBy:      uuid('generated_by'),
  generatedAt:      timestamp('generated_at', { withTimezone: true }),
  effectiveDate:    date('effective_date'),
  // 'en' | 'ar' | 'both'
  language:         varchar('language', { length: 4 }).notNull().default('en'),

  ...audit(),
})

// ── 5. Bulk email job tracking ────────────────────────────────────────────────

export const letterEmailJobs = pgTable('letter_email_jobs', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  jobRef:         varchar('job_ref', { length: 100 }).notNull(),
  letterId:       uuid('letter_id').notNull().references(() => employeeLetters.id),
  recipientEmail: varchar('recipient_email', { length: 500 }).notNull(),
  status:         varchar('status', { length: 20 }).notNull().default('PENDING'),
  errorMessage:   text('error_message'),
  attemptedAt:    timestamp('attempted_at', { withTimezone: true }),
  ...audit(),
})

// ── Types ─────────────────────────────────────────────────────────────────────

export type LetterFieldRegistry     = typeof letterFieldRegistry.$inferSelect
export type LetterTemplateType      = typeof letterTemplateTypes.$inferSelect
export type LetterTemplate          = typeof letterTemplates.$inferSelect
export type EmployeeLetter          = typeof employeeLetters.$inferSelect
export type EmployeeLetterNew       = typeof employeeLetters.$inferInsert
export type LetterEmailJob          = typeof letterEmailJobs.$inferSelect
