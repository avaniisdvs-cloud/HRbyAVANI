-- Migration 0035: Priority D — New enrollment tracking tables
-- Leave plan enrollment history, work schedule assignment history,
-- payroll assignment history (when employee moves between payroll groups).

-- ── leave_plan_enrolments ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leave_plan_enrolments (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  person_id            UUID         NOT NULL REFERENCES persons(id),
  legal_entity_id      UUID         NOT NULL REFERENCES legal_entities(id),
  absence_plan_id      UUID         NOT NULL REFERENCES absence_plans(id),
  enrollment_reason    VARCHAR(200),
  effective_start_date DATE         NOT NULL,
  effective_end_date   DATE,
  is_current           BOOLEAN      NOT NULL DEFAULT TRUE,
  action_mode          VARCHAR(15)  NOT NULL DEFAULT 'UPDATE',
  effective_sequence   INTEGER      NOT NULL DEFAULT 1,
  corrects_row_id      UUID         REFERENCES leave_plan_enrolments(id),
  source_transaction_id UUID,
  enrolled_by          UUID         REFERENCES persons(id),
  notes                TEXT,
  -- audit columns
  created_date         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by           UUID,
  created_by_name      VARCHAR(200),
  last_updated_date    TIMESTAMPTZ,
  updated_by           UUID,
  updated_by_name      VARCHAR(200),
  updated_date         TIMESTAMPTZ,
  action_mode_audit    VARCHAR(15)
);

-- ── work_schedule_assignments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_schedule_assignments (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  person_id            UUID         NOT NULL REFERENCES persons(id),
  legal_entity_id      UUID         NOT NULL REFERENCES legal_entities(id),
  work_schedule_id     UUID         NOT NULL REFERENCES work_schedules(id),
  assignment_reason    VARCHAR(200),
  effective_start_date DATE         NOT NULL,
  effective_end_date   DATE,
  is_current           BOOLEAN      NOT NULL DEFAULT TRUE,
  action_mode          VARCHAR(15)  NOT NULL DEFAULT 'UPDATE',
  effective_sequence   INTEGER      NOT NULL DEFAULT 1,
  corrects_row_id      UUID         REFERENCES work_schedule_assignments(id),
  source_transaction_id UUID,
  assigned_by          UUID         REFERENCES persons(id),
  notes                TEXT,
  -- audit columns
  created_date         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by           UUID,
  created_by_name      VARCHAR(200),
  last_updated_date    TIMESTAMPTZ,
  updated_by           UUID,
  updated_by_name      VARCHAR(200),
  updated_date         TIMESTAMPTZ,
  action_mode_audit    VARCHAR(15)
);

-- ── payroll_assignments ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_assignments (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  person_id            UUID         NOT NULL REFERENCES persons(id),
  legal_entity_id      UUID         NOT NULL REFERENCES legal_entities(id),
  payroll_id           UUID         NOT NULL REFERENCES payroll_definitions(id),
  payroll_group        VARCHAR(50)  NOT NULL DEFAULT 'STANDARD',
  change_reason        VARCHAR(200),
  effective_start_date DATE         NOT NULL,
  effective_end_date   DATE,
  is_current           BOOLEAN      NOT NULL DEFAULT TRUE,
  action_mode          VARCHAR(15)  NOT NULL DEFAULT 'UPDATE',
  effective_sequence   INTEGER      NOT NULL DEFAULT 1,
  corrects_row_id      UUID         REFERENCES payroll_assignments(id),
  source_transaction_id UUID,
  changed_by           UUID         REFERENCES persons(id),
  notes                TEXT,
  -- audit columns
  created_date         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by           UUID,
  created_by_name      VARCHAR(200),
  last_updated_date    TIMESTAMPTZ,
  updated_by           UUID,
  updated_by_name      VARCHAR(200),
  updated_date         TIMESTAMPTZ,
  action_mode_audit    VARCHAR(15)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Current-row fast lookup (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_leave_plan_enrolments_current
  ON leave_plan_enrolments(tenant_id, person_id, is_current)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_work_schedule_assignments_current
  ON work_schedule_assignments(tenant_id, person_id, is_current)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_payroll_assignments_current
  ON payroll_assignments(tenant_id, person_id, is_current)
  WHERE is_current = TRUE;

-- Full history by person
CREATE INDEX IF NOT EXISTS idx_leave_plan_enrolments_person
  ON leave_plan_enrolments(tenant_id, person_id, effective_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_work_schedule_assignments_person
  ON work_schedule_assignments(tenant_id, person_id, effective_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_assignments_person
  ON payroll_assignments(tenant_id, person_id, effective_start_date DESC);

-- Sparse FK indexes for correction chains
CREATE INDEX IF NOT EXISTS idx_leave_plan_enrolments_corrects
  ON leave_plan_enrolments(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_schedule_assignments_corrects
  ON work_schedule_assignments(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_assignments_corrects
  ON payroll_assignments(corrects_row_id)
  WHERE corrects_row_id IS NOT NULL;
