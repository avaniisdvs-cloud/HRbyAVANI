/**
 * AVANIIS HR — Communication / Email Platform Schema
 *
 * Enterprise, multi-tenant, provider-agnostic email communication platform.
 * Administrators choose the active provider (Microsoft Graph API or SMTP) from
 * Administration → Settings → Communication Settings; all modules send through
 * the admin-selected provider via the EmailService abstraction.
 *
 * BR-COMM-001: Provider secrets (Graph client secret, SMTP password) are stored
 *   AES-256-GCM encrypted (lib/encryption.ts) and NEVER returned in plaintext.
 * BR-COMM-002: Only ONE provider row may be active per (tenant, legal entity).
 * BR-AUDIT-001 / BR-TENANT-001: every table carries audit columns + tenant_id.
 *
 * Approval-action tokens are intentionally NOT defined here — the existing,
 * fully-wired workflow_email_tokens table (drizzle/schema/workflow-engine.ts)
 * + app/api/workflow/action route are reused for secure email approve/reject.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { TENANT_ID } from '../../lib/constants'

// ─── Shared helpers (mirror foundation.ts) ──────────────────────────────────

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ─── Enums ───────────────────────────────────────────────────────────────────

export const emailProviderTypeEnum = pgEnum('email_provider_type', [
  'GRAPH_API',
  'SMTP',
])

export const smtpEncryptionEnum = pgEnum('smtp_encryption_type', [
  'NONE',
  'SSL',
  'TLS',
  'STARTTLS',
])

export const emailTestStatusEnum = pgEnum('email_test_status', [
  'UNTESTED',
  'PASSED',
  'FAILED',
])

export const emailMessageStatusEnum = pgEnum('email_message_status', [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
])

export const emailDeliveryEventEnum = pgEnum('email_delivery_event_type', [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'RETRY',
  'BOUNCED',
  'OPENED',
])

// ══════════════════════════════════════════════════════════════════════════════
// email_provider_settings — one active row per (tenant, legal entity)
// ══════════════════════════════════════════════════════════════════════════════

export const emailProviderSettings = pgTable('email_provider_settings', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  // Nullable now (single global config). Future: per-legal-entity override.
  legalEntityId: uuid('legal_entity_id'),

  providerType:  emailProviderTypeEnum('provider_type').notNull(),
  isActive:      boolean('is_active').notNull().default(false),

  // ── Microsoft Graph API fields ──
  graphTenantId:        varchar('graph_tenant_id', { length: 200 }),
  graphClientId:        varchar('graph_client_id', { length: 200 }),
  graphClientSecretEnc: varchar('graph_client_secret_enc', { length: 500 }), // encrypted
  graphSenderMailbox:   varchar('graph_sender_mailbox', { length: 320 }),
  graphSenderName:      varchar('graph_sender_name', { length: 200 }),
  graphAuthorityUrl:    varchar('graph_authority_url', { length: 500 }),
  graphBaseUrl:         varchar('graph_base_url', { length: 500 }),
  graphMailSendEndpoint: varchar('graph_mail_send_endpoint', { length: 500 }),
  graphScope:           varchar('graph_scope', { length: 500 }),
  graphUseSharedMailbox: boolean('graph_use_shared_mailbox').notNull().default(false),

  // ── SMTP fields ──
  smtpHost:        varchar('smtp_host', { length: 255 }),
  smtpPort:        integer('smtp_port'),
  smtpUsername:    varchar('smtp_username', { length: 320 }),
  smtpPasswordEnc: varchar('smtp_password_enc', { length: 500 }), // encrypted
  smtpEncryption:  smtpEncryptionEnum('smtp_encryption'),
  smtpSenderEmail: varchar('smtp_sender_email', { length: 320 }),
  smtpSenderName:  varchar('smtp_sender_name', { length: 200 }),
  smtpAuthRequired: boolean('smtp_auth_required').notNull().default(true),

  // ── Shared behaviour flags ──
  replyToEmail:         varchar('reply_to_email', { length: 320 }),
  enableTracking:       boolean('enable_tracking').notNull().default(false),
  enableWorkflowActions: boolean('enable_workflow_actions').notNull().default(true),
  tokenExpiryMinutes:   integer('token_expiry_minutes').notNull().default(2880), // 48h
  retryCount:           integer('retry_count').notNull().default(3),
  retryIntervalSec:     integer('retry_interval_sec').notNull().default(300),

  // ── Test / activation governance ──
  lastTestedAt:   timestamp('last_tested_at', { withTimezone: true }),
  lastTestStatus: emailTestStatusEnum('last_test_status').notNull().default('UNTESTED'),
  lastTestError:  text('last_test_error'),
  activationOverrideReason: text('activation_override_reason'),

  ...audit(),
}, (t) => ({
  byTenant: index('idx_email_provider_tenant').on(t.tenantId),
  byActive: index('idx_email_provider_active').on(t.tenantId, t.isActive),
}))

// ══════════════════════════════════════════════════════════════════════════════
// email_sender_defaults — per-tenant sender identities (module overrides)
// ══════════════════════════════════════════════════════════════════════════════

export const emailSenderDefaults = pgTable('email_sender_defaults', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  legalEntityId: uuid('legal_entity_id'),

  defaultFromName:  varchar('default_from_name', { length: 200 }),
  defaultFromEmail: varchar('default_from_email', { length: 320 }),
  defaultReplyTo:   varchar('default_reply_to', { length: 320 }),

  hrSender:           varchar('hr_sender', { length: 320 }),
  payrollSender:      varchar('payroll_sender', { length: 320 }),
  workflowSender:     varchar('workflow_sender', { length: 320 }),
  systemSender:       varchar('system_sender', { length: 320 }),
  announcementSender: varchar('announcement_sender', { length: 320 }),
  fallbackSender:     varchar('fallback_sender', { length: 320 }),

  ...audit(),
}, (t) => ({
  byTenant: index('idx_email_sender_defaults_tenant').on(t.tenantId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// email_templates — reusable, bilingual, branded templates with placeholders
// ══════════════════════════════════════════════════════════════════════════════

export const emailTemplates = pgTable('email_templates', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),

  templateCode:    varchar('template_code', { length: 80 }).notNull(),
  templateName:    varchar('template_name', { length: 200 }).notNull(),
  subjectTemplate: text('subject_template').notNull(),
  bodyHtmlTemplate: text('body_html_template').notNull(),
  bodyTextTemplate: text('body_text_template'),
  module:          varchar('module', { length: 60 }).notNull().default('system'),
  languageCode:    varchar('language_code', { length: 5 }).notNull().default('en'),
  isActive:        boolean('is_active').notNull().default(true),

  ...audit(),
}, (t) => ({
  byCode: index('idx_email_templates_code').on(t.tenantId, t.templateCode, t.languageCode),
}))

// ══════════════════════════════════════════════════════════════════════════════
// email_messages — one row per outbound email (queue + delivery log)
// ══════════════════════════════════════════════════════════════════════════════

export const emailMessages = pgTable('email_messages', {
  id:            uuid('id').primaryKey().defaultRandom(),
  ...tenant(),

  providerType:      emailProviderTypeEnum('provider_type'),
  templateCode:      varchar('template_code', { length: 80 }),
  module:            varchar('module', { length: 60 }),
  recipientEmail:    varchar('recipient_email', { length: 320 }).notNull(),
  recipientPersonId: uuid('recipient_person_id'),
  senderEmail:       varchar('sender_email', { length: 320 }),
  subject:           text('subject'),

  status:        emailMessageStatusEnum('status').notNull().default('QUEUED'),

  businessObjectType: varchar('business_object_type', { length: 80 }),
  businessObjectId:   uuid('business_object_id'),
  workflowRequestId:  uuid('workflow_request_id'),
  workflowStepId:     uuid('workflow_step_id'),

  providerMessageId: varchar('provider_message_id', { length: 255 }),
  correlationId:     uuid('correlation_id').notNull().defaultRandom(),
  retryCount:        integer('retry_count').notNull().default(0),
  lastError:         text('last_error'),
  // Rendered placeholder values + rendered html, kept for retry/audit/inspection.
  payloadJson:       jsonb('payload_json').$type<Record<string, unknown>>(),

  sendAfter:     timestamp('send_after', { withTimezone: true }).defaultNow().notNull(),
  sentAt:        timestamp('sent_at', { withTimezone: true }),

  ...audit(),
}, (t) => ({
  byStatus:   index('idx_email_messages_status').on(t.tenantId, t.status, t.sendAfter),
  byObject:   index('idx_email_messages_object').on(t.businessObjectType, t.businessObjectId),
  byWorkflow: index('idx_email_messages_workflow').on(t.workflowRequestId),
  byCorrelation: index('idx_email_messages_correlation').on(t.correlationId),
}))

// ══════════════════════════════════════════════════════════════════════════════
// email_delivery_events — append-only delivery lifecycle events per message
// ══════════════════════════════════════════════════════════════════════════════

export const emailDeliveryEvents = pgTable('email_delivery_events', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  emailMessageId: uuid('email_message_id').notNull(),
  eventType:      emailDeliveryEventEnum('event_type').notNull(),
  eventPayload:   jsonb('event_payload').$type<Record<string, unknown>>(),
  occurredAt:     timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byMessage: index('idx_email_delivery_events_message').on(t.emailMessageId),
}))
