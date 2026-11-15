-- 0062 — Enterprise Email Communication Platform foundation
--
-- Creates the provider-agnostic email platform tables so administrators can
-- configure Microsoft Graph API OR SMTP from Administration → Settings →
-- Communication Settings, and all modules send through the admin-selected
-- provider via the EmailService abstraction.
--
-- Tables:
--   email_provider_settings  — one active provider config per (tenant, entity)
--   email_sender_defaults    — per-tenant sender identities (module overrides)
--   email_templates          — reusable bilingual branded templates
--   email_messages           — outbound queue + delivery log (one row / email)
--   email_delivery_events    — append-only delivery lifecycle events
--
-- Secrets (Graph client secret, SMTP password) are stored AES-256-GCM encrypted
-- by the application (lib/encryption.ts) in the *_enc varchar(500) columns.
--
-- Approval-action tokens reuse the EXISTING workflow_email_tokens table — no new
-- token table is created here.
--
-- The audit_log.channel column is varchar(30) with NO check constraint, so the
-- new EMAIL_GRAPH / EMAIL_SMTP channel values need no DB change (TS-side only).
--
-- ⚠ Manual migration: drizzle/meta/_journal.json tracks only 0000–0039.
-- `pnpm drizzle-kit migrate` will NOT apply this file. Apply via the Neon
-- Console SQL Editor (see CLAUDE.md "Neon Migration Deployment Notes").
-- Idempotent: safe to re-run.

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE email_provider_type AS ENUM ('GRAPH_API', 'SMTP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE smtp_encryption_type AS ENUM ('NONE', 'SSL', 'TLS', 'STARTTLS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_test_status AS ENUM ('UNTESTED', 'PASSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_message_status AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_delivery_event_type AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'RETRY', 'BOUNCED', 'OPENED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── email_provider_settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_provider_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  legal_entity_id          uuid,
  provider_type            email_provider_type NOT NULL,
  is_active                boolean NOT NULL DEFAULT false,

  graph_tenant_id          varchar(200),
  graph_client_id          varchar(200),
  graph_client_secret_enc  varchar(500),
  graph_sender_mailbox     varchar(320),
  graph_sender_name        varchar(200),
  graph_authority_url      varchar(500),
  graph_base_url           varchar(500),
  graph_mail_send_endpoint varchar(500),
  graph_scope              varchar(500),
  graph_use_shared_mailbox boolean NOT NULL DEFAULT false,

  smtp_host                varchar(255),
  smtp_port                integer,
  smtp_username            varchar(320),
  smtp_password_enc        varchar(500),
  smtp_encryption          smtp_encryption_type,
  smtp_sender_email        varchar(320),
  smtp_sender_name         varchar(200),
  smtp_auth_required       boolean NOT NULL DEFAULT true,

  reply_to_email           varchar(320),
  enable_tracking          boolean NOT NULL DEFAULT false,
  enable_workflow_actions  boolean NOT NULL DEFAULT true,
  token_expiry_minutes     integer NOT NULL DEFAULT 2880,
  retry_count              integer NOT NULL DEFAULT 3,
  retry_interval_sec       integer NOT NULL DEFAULT 300,

  last_tested_at           timestamptz,
  last_test_status         email_test_status NOT NULL DEFAULT 'UNTESTED',
  last_test_error          text,
  activation_override_reason text,

  created_by               uuid NOT NULL,
  created_by_name          varchar(200) NOT NULL,
  created_date             timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid,
  updated_by_name          varchar(200),
  last_updated_date        timestamptz,
  updated_date             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_provider_tenant ON email_provider_settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_provider_active ON email_provider_settings (tenant_id, is_active);

-- ─── email_sender_defaults ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sender_defaults (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  legal_entity_id     uuid,
  default_from_name   varchar(200),
  default_from_email  varchar(320),
  default_reply_to    varchar(320),
  hr_sender           varchar(320),
  payroll_sender      varchar(320),
  workflow_sender     varchar(320),
  system_sender       varchar(320),
  announcement_sender varchar(320),
  fallback_sender     varchar(320),
  created_by          uuid NOT NULL,
  created_by_name     varchar(200) NOT NULL,
  created_date        timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid,
  updated_by_name     varchar(200),
  last_updated_date   timestamptz,
  updated_date        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_sender_defaults_tenant ON email_sender_defaults (tenant_id);

-- ─── email_templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  template_code      varchar(80) NOT NULL,
  template_name      varchar(200) NOT NULL,
  subject_template   text NOT NULL,
  body_html_template text NOT NULL,
  body_text_template text,
  module             varchar(60) NOT NULL DEFAULT 'system',
  language_code      varchar(5) NOT NULL DEFAULT 'en',
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid NOT NULL,
  created_by_name    varchar(200) NOT NULL,
  created_date       timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid,
  updated_by_name    varchar(200),
  last_updated_date  timestamptz,
  updated_date       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_templates_code ON email_templates (tenant_id, template_code, language_code);

-- ─── email_messages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  provider_type        email_provider_type,
  template_code        varchar(80),
  module               varchar(60),
  recipient_email      varchar(320) NOT NULL,
  recipient_person_id  uuid,
  sender_email         varchar(320),
  subject              text,
  status               email_message_status NOT NULL DEFAULT 'QUEUED',
  business_object_type varchar(80),
  business_object_id   uuid,
  workflow_request_id  uuid,
  workflow_step_id     uuid,
  provider_message_id  varchar(255),
  correlation_id       uuid NOT NULL DEFAULT gen_random_uuid(),
  retry_count          integer NOT NULL DEFAULT 0,
  last_error           text,
  payload_json         jsonb,
  send_after           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  created_by           uuid NOT NULL,
  created_by_name      varchar(200) NOT NULL,
  created_date         timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid,
  updated_by_name      varchar(200),
  last_updated_date    timestamptz,
  updated_date         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages (tenant_id, status, send_after);
CREATE INDEX IF NOT EXISTS idx_email_messages_object ON email_messages (business_object_type, business_object_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_workflow ON email_messages (workflow_request_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_correlation ON email_messages (correlation_id);

-- ─── email_delivery_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_delivery_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  email_message_id uuid NOT NULL,
  event_type       email_delivery_event_type NOT NULL,
  event_payload    jsonb,
  occurred_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_message ON email_delivery_events (email_message_id);
