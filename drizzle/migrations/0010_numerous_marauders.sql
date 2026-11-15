CREATE TABLE IF NOT EXISTS "accommodation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"person_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"request_type" varchar(30) NOT NULL,
	"description_en" text NOT NULL,
	"description_ar" text NOT NULL,
	"requested_adjustments" text,
	"effective_date" date NOT NULL,
	"end_date" date,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"workflow_instance_id" uuid,
	"supporting_document_id" uuid,
	"resolution_notes" text,
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
 ALTER TABLE "accommodation_requests" ADD CONSTRAINT "accommodation_requests_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accommodation_requests" ADD CONSTRAINT "accommodation_requests_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accommodation_requests" ADD CONSTRAINT "accommodation_requests_supporting_document_id_person_documents_id_fk" FOREIGN KEY ("supporting_document_id") REFERENCES "public"."person_documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- GAP-C07: Seed workflow definition for ACCOMMODATION_REQUEST trigger event.
-- Idempotent: only inserts if the workflow code does not already exist.
DO $$
DECLARE
  v_wfd_id  uuid := 'e0000000-0000-0000-0000-000000000004';
  v_wfs1_id uuid := 'f0000000-0000-0000-0000-000000000008';
  v_wfs2_id uuid := 'f0000000-0000-0000-0000-000000000009';
  v_tenant  uuid := '00000000-0000-0000-0000-000000000001';
  v_entity  uuid := '11111111-1111-1111-1111-111111111111';
  v_sys     uuid := '00000000-0000-0000-0000-000000000002';
BEGIN
  -- Ensure the default legal entity exists before inserting workflow definitions
  INSERT INTO legal_entities (
    id, tenant_id, entity_code, name_en, name_ar,
    trade_licence_number, trade_licence_expiry, registration_number,
    entity_type, jurisdiction, eosb_scheme, wps_employer_code,
    mohre_establishment_id, default_currency, default_language, is_active,
    created_by, created_by_name, created_date
  ) VALUES (
    v_entity, v_tenant, 'AVN-001', 'Avaniis', 'أفانيس',
    'DED-123456', '2027-01-31', 'MOE-789012',
    'MAINLAND', 'Dubai', 'TRADITIONAL', 'AVANIIS001',
    'MOHRE-AVN-001', 'AED', 'en', true,
    v_sys, 'Migration Bootstrap', now()
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM workflow_definitions
    WHERE workflow_code = 'WF-ACCOMMODATION' AND tenant_id = v_tenant
  ) THEN
    INSERT INTO workflow_definitions (
      id, tenant_id, legal_entity_id,
      workflow_code, workflow_name_en, workflow_name_ar,
      trigger_event, approval_mode, sla_hours, escalation_hours, is_active, version,
      created_by, created_by_name, created_date
    ) VALUES (
      v_wfd_id, v_tenant, v_entity,
      'WF-ACCOMMODATION',
      'Disability / Parental Accommodation — HR Approval',
      'طلب تسهيلات الإعاقة / الوالدية — موافقة الموارد البشرية',
      'ACCOMMODATION_REQUEST', 'SEQUENTIAL', 72, 96, true, 1,
      v_sys, 'Seed Script', now()
    );

    INSERT INTO workflow_stages (
      id, tenant_id, workflow_definition_id,
      stage_order, stage_name_en, stage_name_ar,
      approver_type, approver_role_code,
      can_delegate, is_optional, stage_sla_hours, action_type,
      created_by, created_by_name, created_date
    ) VALUES
    (
      v_wfs1_id, v_tenant, v_wfd_id,
      1, 'Line Manager Review', 'مراجعة المدير المباشر',
      'DYNAMIC', NULL,
      true, false, 48, 'APPROVE_REJECT',
      v_sys, 'Seed Script', now()
    ),
    (
      v_wfs2_id, v_tenant, v_wfd_id,
      2, 'HR Director Approval', 'موافقة مدير الموارد البشرية',
      'ROLE', 'HR_MANAGER',
      false, false, 24, 'APPROVE_REJECT',
      v_sys, 'Seed Script', now()
    );
  END IF;
END $$;
