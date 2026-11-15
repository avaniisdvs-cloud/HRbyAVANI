-- Migration: 0012_feature_permissions
-- Adds the feature_permissions table for role-based feature access control.
-- Managed via the Feature Permissions admin page (/access/feature-permissions).

CREATE TABLE IF NOT EXISTS "feature_permissions" (
  "id"                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "feature_key"       varchar(80) NOT NULL,
  "feature_label"     varchar(200) NOT NULL,
  "feature_group"     varchar(80) NOT NULL,

  -- Per-role permission objects: { view, create, edit, delete, approve, export }
  "employee_perms"    jsonb       NOT NULL DEFAULT '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}'::jsonb,
  "manager_perms"     jsonb       NOT NULL DEFAULT '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}'::jsonb,
  "hr_admin_perms"    jsonb       NOT NULL DEFAULT '{"view":true,"create":true,"edit":true,"delete":false,"approve":true,"export":true}'::jsonb,

  -- System-locked rows cannot be changed via the UI (e.g. core admin features)
  "is_system_locked"  boolean     NOT NULL DEFAULT false,

  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_permissions_key_unique"
  ON "feature_permissions" ("feature_key");

-- Seed default permission rows
INSERT INTO "feature_permissions"
  ("feature_key", "feature_label", "feature_group", "employee_perms", "manager_perms", "hr_admin_perms", "is_system_locked")
VALUES
  -- People & Workforce
  ('EMPLOYEE_PROFILE', 'Employee Profiles', 'People & Workforce',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":true,"edit":true,"delete":false,"approve":true,"export":true}',
    false),
  ('EMPLOYEE_CREATE', 'Create Employees', 'People & Workforce',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":true,"edit":true,"delete":false,"approve":true,"export":false}',
    false),
  ('ASSIGNMENTS', 'Assignments & Org Chart', 'People & Workforce',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":true,"edit":true,"delete":true,"approve":true,"export":true}',
    false),

  -- Leave & Time
  ('LEAVE_REQUEST', 'Leave Requests', 'Leave & Time',
    '{"view":true,"create":true,"edit":true,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":true,"edit":false,"delete":false,"approve":true,"export":true}',
    '{"view":true,"create":true,"edit":true,"delete":true,"approve":true,"export":true}',
    false),
  ('LEAVE_CALENDAR', 'Leave Calendar', 'Leave & Time',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":true}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":true}',
    false),
  ('LEAVE_BALANCES', 'Leave Balances', 'Leave & Time',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":true}',
    '{"view":true,"create":false,"edit":true,"delete":false,"approve":true,"export":true}',
    false),

  -- Workflows
  ('WORKFLOWS', 'Approval Workflows', 'Workflows',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":true,"export":false}',
    '{"view":true,"create":true,"edit":true,"delete":true,"approve":true,"export":true}',
    false),

  -- Reports
  ('REPORTS', 'Reports & Analytics', 'Reports',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":true}',
    '{"view":true,"create":true,"edit":false,"delete":false,"approve":false,"export":true}',
    false),

  -- Admin & Access (system-locked)
  ('USER_MANAGEMENT', 'User Management', 'Admin & Access',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":true,"edit":true,"delete":true,"approve":false,"export":true}',
    true),
  ('SETTINGS', 'System Settings', 'Admin & Access',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":true,"delete":false,"approve":false,"export":false}',
    true),
  ('FEATURE_PERMISSIONS', 'Feature Permissions', 'Admin & Access',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":true,"delete":false,"approve":false,"export":false}',
    true),
  ('ARIA_ASSISTANT', 'ARIA Assistant', 'Admin & Access',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    false),

  -- Master Data (system-locked)
  ('MASTER_DATA', 'Master Data', 'Admin & Access',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":false,"create":false,"edit":false,"delete":false,"approve":false,"export":false}',
    '{"view":true,"create":true,"edit":true,"delete":false,"approve":false,"export":true}',
    true)

ON CONFLICT ("feature_key") DO NOTHING;
