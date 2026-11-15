-- Session 6: Snapshot cache for org hierarchy
-- Stores pre-computed node/edge JSON per engine+scope so SSR skips the CTE
-- and serves from this table instead (~50ms vs ~800ms cold CTE).

CREATE TABLE IF NOT EXISTS org_hierarchy_snapshots (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID         NOT NULL    DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  engine                VARCHAR(50)  NOT NULL,
  scope_key             VARCHAR(200) NOT NULL    DEFAULT 'full',
  nodes                 JSONB        NOT NULL    DEFAULT '[]',
  edges                 JSONB        NOT NULL    DEFAULT '[]',
  meta                  JSONB        NOT NULL    DEFAULT '{}',
  node_count            INTEGER      NOT NULL    DEFAULT 0,
  is_stale              BOOLEAN      NOT NULL    DEFAULT FALSE,
  computed_at           TIMESTAMPTZ  NOT NULL    DEFAULT NOW(),
  recompute_started_at  TIMESTAMPTZ,
  CONSTRAINT uq_snapshot_per_engine_scope UNIQUE (tenant_id, engine, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_stale
  ON org_hierarchy_snapshots (tenant_id, is_stale)
  WHERE is_stale = TRUE;
