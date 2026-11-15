CREATE TABLE IF NOT EXISTS "form_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_entity_id" uuid,
	"entity_type" varchar(50) NOT NULL,
	"role" varchar(50) DEFAULT 'ALL' NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" varchar(200) NOT NULL,
	"created_date" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_by_name" varchar(200),
	"last_updated_date" timestamp with time zone,
	"updated_date" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "form_configurations" ADD CONSTRAINT "form_configurations_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "form_configurations_scope_uniq" ON "form_configurations" ("tenant_id","entity_type","role");--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- Re-run the trigger attach loop from 0001 so any newly-created table that
-- carries `last_updated_date` (form_configurations here) picks up the
-- BR-AUDIT-001 trigger. The block is idempotent — DROP TRIGGER IF EXISTS
-- guards against duplicate triggers on tables already wired in 0001.
-- ───────────────────────────────────────────────────────────────────────────
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
$$;