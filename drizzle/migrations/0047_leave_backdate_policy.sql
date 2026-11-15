-- Migration 0047: Leave Backdate Policy
-- Per-entity, per-leave-type backdating configuration.
-- backdating_enabled = false → no backdated requests allowed for this type/entity
-- backdate_limit_days = NULL (when enabled) → no day limit (any past date allowed)
-- backdate_limit_days = N (when enabled) → max N calendar days in the past

CREATE TABLE IF NOT EXISTS leave_backdate_policies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  legal_entity_id      UUID NOT NULL REFERENCES legal_entities(id),
  absence_type_id      UUID NOT NULL REFERENCES absence_types(id),
  backdating_enabled   BOOLEAN NOT NULL DEFAULT true,
  backdate_limit_days  INTEGER,
  created_by           UUID,
  created_by_name      VARCHAR(200),
  created_date         TIMESTAMPTZ DEFAULT NOW(),
  updated_by           UUID,
  updated_by_name      VARCHAR(200),
  last_updated_date    TIMESTAMPTZ,
  updated_date         TIMESTAMPTZ,
  CONSTRAINT uq_leave_backdate_policy UNIQUE (tenant_id, legal_entity_id, absence_type_id),
  CONSTRAINT chk_backdate_limit_days CHECK (backdate_limit_days IS NULL OR backdate_limit_days >= 0)
);

COMMENT ON TABLE leave_backdate_policies IS 'Per-entity per-leave-type backdating rules. No row = no restriction.';
COMMENT ON COLUMN leave_backdate_policies.backdate_limit_days IS 'Max calendar days in the past. NULL = unlimited (when backdating_enabled). 0 = same-day only.';
