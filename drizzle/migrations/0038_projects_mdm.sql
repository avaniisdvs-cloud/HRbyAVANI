-- Migration 0038: Projects MDM
-- Adds projects master data table and project assignment columns to worker_assignments.
-- BR-PROJ-001: project_code is unique per legal_entity_id.
-- BR-NO-DELETE: projects use is_active soft-delete, never hard-delete.

-- ── 1. Projects master data table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "projects" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  "legal_entity_id" uuid REFERENCES "legal_entities"("id"),
  "code"            varchar(30) NOT NULL,
  "name_en"         varchar(200) NOT NULL,
  "name_ar"         varchar(200),
  "project_type"    varchar(50),
  "gl_mapping_code" varchar(50),
  "description"     text,
  "start_date"      date,
  "end_date"        date,
  "is_active"       boolean NOT NULL DEFAULT true,
  "action_mode"     varchar(15) NOT NULL DEFAULT 'UPDATE',
  "corrects_row_id" uuid REFERENCES "projects"("id"),
  -- 7 mandatory audit columns (BR-AUDIT-001)
  "created_by"           uuid NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz DEFAULT now() NOT NULL,
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz
);

-- BR-PROJ-001: unique code per legal entity (scoped to tenant)
CREATE UNIQUE INDEX IF NOT EXISTS "projects_code_entity_unique"
  ON "projects" ("tenant_id", "legal_entity_id", "code");

-- Global unique index when no legal entity is set (cross-entity projects)
CREATE UNIQUE INDEX IF NOT EXISTS "projects_code_global_unique"
  ON "projects" ("tenant_id", "code")
  WHERE "legal_entity_id" IS NULL;

-- ── 2. Extend worker_assignments with project fields ──────────────────────────

ALTER TABLE "worker_assignments"
  ADD COLUMN IF NOT EXISTS "project_id"             uuid REFERENCES "projects"("id"),
  ADD COLUMN IF NOT EXISTS "project_allocation_pct" numeric(5, 2);

-- Index for fast project-scoped employee lookups
CREATE INDEX IF NOT EXISTS "wa_project_id_idx"
  ON "worker_assignments" ("project_id")
  WHERE "project_id" IS NOT NULL AND "is_current" = true;
