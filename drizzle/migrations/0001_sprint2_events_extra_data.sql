CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_text" text
);
--> statement-breakpoint
ALTER TABLE "absence_entries" ADD COLUMN "extra_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "extra_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "extra_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- Outbox worker indexes (TD-09 — node-cron poller queries unprocessed by age)
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_events_unprocessed"
  ON "events" ("created_at")
  WHERE "processed_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_event_type" ON "events" ("event_type");--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- BR-AUDIT-001 — auto-stamp last_updated_date on every UPDATE
-- Applied to every table that carries a last_updated_date column.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_last_updated_date() RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_date = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'last_updated_date'
      AND table_schema = 'public'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_last_updated ON %2$I.%1$I; ' ||
      'CREATE TRIGGER trg_%1$s_last_updated ' ||
      'BEFORE UPDATE ON %2$I.%1$I ' ||
      'FOR EACH ROW EXECUTE FUNCTION update_last_updated_date();',
      r.table_name, r.table_schema
    );
  END LOOP;
END;
$$;--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- BR-AUDIT-002 / Hard Rule 2 — audit_log is INSERT-ONLY at the database layer
-- Application enforcement lives in lib/audit.ts; this is the belt-and-braces.
-- ───────────────────────────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON TABLE "audit_log" FROM PUBLIC;