-- ════════════════════════════════════════════════════════════════════════════
-- QA-Audit-M1 — Hot-path indexes for tables that lacked them.
--
-- The original 0000 migration declared 169 constraints but zero
-- non-PK indexes. At hundreds of employees this doesn't show; at 10K+ it
-- does. These cover the hottest query paths in Sprint 3 actions.
--
-- Applied: Sprint 4 (post QA/QC audit 2026-04-28).
-- ════════════════════════════════════════════════════════════════════════════

-- persons — list page filters + scope
CREATE INDEX IF NOT EXISTS "idx_persons_legal_entity_active"
  ON "persons" ("legal_entity_id", "is_active") WHERE "is_active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_persons_current_department"
  ON "persons" ("current_department_id") WHERE "current_department_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_persons_assignment_status"
  ON "persons" ("assignment_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_persons_nationality_category"
  ON "persons" ("nationality_category");--> statement-breakpoint

-- worker_assignments — current row lookup + person history
CREATE INDEX IF NOT EXISTS "idx_worker_assignments_person_current"
  ON "worker_assignments" ("person_id", "is_current") WHERE "is_current" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_worker_assignments_person_history"
  ON "worker_assignments" ("person_id", "effective_start_date" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_worker_assignments_department"
  ON "worker_assignments" ("department_id");--> statement-breakpoint

-- contracts — person history + status
CREATE INDEX IF NOT EXISTS "idx_contracts_person_status"
  ON "contracts" ("person_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contracts_end_date_active"
  ON "contracts" ("end_date") WHERE "status" = 'ACTIVE';--> statement-breakpoint

-- employment_actions — person history
CREATE INDEX IF NOT EXISTS "idx_employment_actions_person_effective"
  ON "employment_actions" ("person_id", "effective_date" DESC);--> statement-breakpoint

-- person_documents — expiry-alert scheduler (Sprint 10)
CREATE INDEX IF NOT EXISTS "idx_person_documents_expiry"
  ON "person_documents" ("expiry_date") WHERE "expiry_date" IS NOT NULL AND "document_status" IN ('VALID', 'EXPIRING');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_person_documents_person_type"
  ON "person_documents" ("person_id", "document_type");--> statement-breakpoint

-- person_dependents — per-person lookup
CREATE INDEX IF NOT EXISTS "idx_person_dependents_person"
  ON "person_dependents" ("person_id");--> statement-breakpoint

-- person_bank_details — primary account lookup
CREATE INDEX IF NOT EXISTS "idx_person_bank_details_primary"
  ON "person_bank_details" ("person_id") WHERE "is_primary" = TRUE;--> statement-breakpoint

-- person_contacts / person_addresses — per-person scoped
CREATE INDEX IF NOT EXISTS "idx_person_contacts_person"
  ON "person_contacts" ("person_id") WHERE "is_active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_person_addresses_person"
  ON "person_addresses" ("person_id");--> statement-breakpoint

-- audit_log — query patterns: by actor, by event type, by resource
-- CF-01: audit_log uses event_time (not created_date) — fixed from original
CREATE INDEX IF NOT EXISTS "idx_audit_log_actor_date"
  ON "audit_log" ("actor_id", "event_time" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_event_type_date"
  ON "audit_log" ("event_type", "event_time" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_resource"
  ON "audit_log" ("resource_type", "resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_entity_date"
  ON "audit_log" ("entity_id", "event_time" DESC) WHERE "entity_id" IS NOT NULL;--> statement-breakpoint

-- legal_entities + departments + business_units — picklist sort
CREATE INDEX IF NOT EXISTS "idx_legal_entities_active"
  ON "legal_entities" ("entity_code") WHERE "is_active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_departments_legal_entity_active"
  ON "departments" ("legal_entity_id") WHERE "is_active" = TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_positions_department_active"
  ON "positions" ("department_id") WHERE "is_active" = TRUE;--> statement-breakpoint

-- jobs.is_emiratisation_target — supports S3-12 toggle
CREATE INDEX IF NOT EXISTS "idx_jobs_emiratisation_target"
  ON "jobs" ("is_emiratisation_target") WHERE "is_emiratisation_target" = TRUE;
