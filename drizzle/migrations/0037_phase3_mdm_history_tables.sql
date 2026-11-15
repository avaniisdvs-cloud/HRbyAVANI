-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0037 — Phase 3: MDM History Snapshot Tables
--
-- Creates 5 append-only history tables for point-in-time org structure queries:
--   grade_history       — grade attribute changes
--   department_history  — department attribute changes
--   location_history    — location attribute changes
--   job_history         — job attribute changes
--   position_history    — position attribute changes
--
-- FKs remain on the main tables. These tables only record what attributes
-- looked like during a validity window (validFrom → validTo).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── grade_history ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grade_history (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  grade_id          UUID        NOT NULL REFERENCES grades(id),
  grade_code        VARCHAR(20) NOT NULL,
  grade_name_en     VARCHAR(100) NOT NULL,
  grade_name_ar     VARCHAR(100),
  grade_level       INTEGER,
  min_salary        NUMERIC(12,2),
  max_salary        NUMERIC(12,2),
  mid_salary        NUMERIC(12,2),
  notice_period_days INTEGER,
  valid_from        DATE        NOT NULL,
  valid_to          DATE,
  is_current        BOOLEAN     NOT NULL DEFAULT TRUE,
  change_reason     VARCHAR(300),
  changed_by        UUID        REFERENCES persons(id),
  changed_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grade_history_grade_id
  ON grade_history(tenant_id, grade_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_grade_history_current
  ON grade_history(tenant_id, grade_id)
  WHERE is_current = TRUE;

-- ── department_history ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS department_history (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  department_id        UUID        NOT NULL REFERENCES departments(id),
  code                 VARCHAR(20) NOT NULL,
  name_en              VARCHAR(150) NOT NULL,
  name_ar              VARCHAR(150),
  department_type      VARCHAR(50),
  approved_headcount   INTEGER,
  cost_centre_code     VARCHAR(30),
  gl_account_code      VARCHAR(30),
  parent_department_id UUID,
  valid_from           DATE        NOT NULL,
  valid_to             DATE,
  is_current           BOOLEAN     NOT NULL DEFAULT TRUE,
  change_reason        VARCHAR(300),
  changed_by           UUID        REFERENCES persons(id),
  changed_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dept_history_dept_id
  ON department_history(tenant_id, department_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_dept_history_current
  ON department_history(tenant_id, department_id)
  WHERE is_current = TRUE;

-- ── location_history ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS location_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  location_id  UUID        NOT NULL REFERENCES locations(id),
  code         VARCHAR(20) NOT NULL,
  name_en      VARCHAR(150) NOT NULL,
  name_ar      VARCHAR(150),
  address_line1 VARCHAR(200),
  city         VARCHAR(100),
  emirate      VARCHAR(100),
  country      VARCHAR(3),
  timezone     VARCHAR(60),
  valid_from   DATE        NOT NULL,
  valid_to     DATE,
  is_current   BOOLEAN     NOT NULL DEFAULT TRUE,
  change_reason VARCHAR(300),
  changed_by   UUID        REFERENCES persons(id),
  changed_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_history_loc_id
  ON location_history(tenant_id, location_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_location_history_current
  ON location_history(tenant_id, location_id)
  WHERE is_current = TRUE;

-- ── job_history ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_history (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  job_id                 UUID        NOT NULL REFERENCES jobs(id),
  job_code               VARCHAR(30) NOT NULL,
  job_title_en           VARCHAR(200) NOT NULL,
  job_title_ar           VARCHAR(200),
  job_family             VARCHAR(100),
  job_function           VARCHAR(100),
  is_emiratisation_target BOOLEAN,
  is_management_role     BOOLEAN,
  min_grade_id           UUID,
  max_grade_id           UUID,
  valid_from             DATE        NOT NULL,
  valid_to               DATE,
  is_current             BOOLEAN     NOT NULL DEFAULT TRUE,
  change_reason          VARCHAR(300),
  changed_by             UUID        REFERENCES persons(id),
  changed_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_history_job_id
  ON job_history(tenant_id, job_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_job_history_current
  ON job_history(tenant_id, job_id)
  WHERE is_current = TRUE;

-- ── position_history ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS position_history (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  position_id           UUID        NOT NULL REFERENCES positions(id),
  position_code         VARCHAR(30) NOT NULL,
  position_title_en     VARCHAR(200) NOT NULL,
  position_title_ar     VARCHAR(200),
  department_id         UUID,
  job_id                UUID,
  grade_id              UUID,
  location_id           UUID,
  fte_count             NUMERIC(5,2),
  reports_to_position_id UUID,
  budget_amount         NUMERIC(14,2),
  valid_from            DATE        NOT NULL,
  valid_to              DATE,
  is_current            BOOLEAN     NOT NULL DEFAULT TRUE,
  change_reason         VARCHAR(300),
  changed_by            UUID        REFERENCES persons(id),
  changed_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_position_history_pos_id
  ON position_history(tenant_id, position_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_position_history_current
  ON position_history(tenant_id, position_id)
  WHERE is_current = TRUE;

-- ── Backfill: seed one "current" snapshot from each main table ────────────────
-- WHERE NOT EXISTS guards make this idempotent without requiring a unique constraint.

INSERT INTO grade_history (tenant_id, grade_id, grade_code, grade_name_en, grade_name_ar, grade_level, min_salary, max_salary, mid_salary, notice_period_days, valid_from, valid_to, is_current, changed_at)
SELECT g.tenant_id, g.id, g.grade_code, g.grade_name_en, g.grade_name_ar, g.grade_level, g.min_salary, g.max_salary, g.mid_salary, g.notice_period_days, CURRENT_DATE, NULL, TRUE, now()
FROM grades g
WHERE g.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM grade_history gh WHERE gh.grade_id = g.id AND gh.is_current = TRUE
  );

INSERT INTO department_history (tenant_id, department_id, code, name_en, name_ar, department_type, approved_headcount, cost_centre_code, gl_account_code, parent_department_id, valid_from, valid_to, is_current, changed_at)
SELECT d.tenant_id, d.id, d.code, d.name_en, d.name_ar, d.department_type, d.approved_headcount, d.cost_centre_code, d.gl_account_code, d.parent_department_id, CURRENT_DATE, NULL, TRUE, now()
FROM departments d
WHERE d.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM department_history dh WHERE dh.department_id = d.id AND dh.is_current = TRUE
  );

INSERT INTO location_history (tenant_id, location_id, code, name_en, name_ar, address_line1, city, emirate, country, timezone, valid_from, valid_to, is_current, changed_at)
SELECT l.tenant_id, l.id, l.code, l.name_en, l.name_ar, l.address_line1, l.city, l.emirate, l.country, l.timezone, CURRENT_DATE, NULL, TRUE, now()
FROM locations l
WHERE l.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM location_history lh WHERE lh.location_id = l.id AND lh.is_current = TRUE
  );

INSERT INTO job_history (tenant_id, job_id, job_code, job_title_en, job_title_ar, job_family, job_function, is_emiratisation_target, is_management_role, min_grade_id, max_grade_id, valid_from, valid_to, is_current, changed_at)
SELECT j.tenant_id, j.id, j.job_code, j.job_title_en, j.job_title_ar, j.job_family, j.job_function, j.is_emiratisation_target, j.is_management_role, j.min_grade_id, j.max_grade_id, CURRENT_DATE, NULL, TRUE, now()
FROM jobs j
WHERE j.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM job_history jh WHERE jh.job_id = j.id AND jh.is_current = TRUE
  );

INSERT INTO position_history (tenant_id, position_id, position_code, position_title_en, position_title_ar, department_id, job_id, grade_id, location_id, fte_count, reports_to_position_id, budget_amount, valid_from, valid_to, is_current, changed_at)
SELECT p.tenant_id, p.id, p.position_code, p.position_title_en, p.position_title_ar, p.department_id, p.job_id, p.grade_id, p.location_id, p.fte_count, p.reports_to_position_id, p.budget_amount, CURRENT_DATE, NULL, TRUE, now()
FROM positions p
WHERE p.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM position_history ph WHERE ph.position_id = p.id AND ph.is_current = TRUE
  );
