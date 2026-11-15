-- Migration 0039: Probation Workflow
-- Adds probation_reviews table to support the full enterprise probation workflow:
-- Line Manager recommendation → HR Admin approval → letter generation → employee signing.
-- BR-37: total probation cannot exceed 6 months (182 days) from hire_date.
-- BR-PW-001: only one active review per person at a time (partial unique index).
-- BR-PW-002: LM comments are mandatory before recommendation is persisted (enforced in app).
-- BR-NO-DELETE: review records are never deleted; status transitions only.
-- Also adds PEL (Probation Extension Letter) type + default template + 4 new token registry entries.

-- ── 1. probation_reviews ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "probation_reviews" (
  "id"                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"                          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  "person_id"                          uuid NOT NULL REFERENCES "persons"("id"),
  "legal_entity_id"                    uuid NOT NULL REFERENCES "legal_entities"("id"),
  "initiated_by_person_id"             uuid NOT NULL REFERENCES "persons"("id"),
  "initiated_at"                       timestamptz NOT NULL DEFAULT now(),
  -- HR_ADMIN | EMPLOYEE | MANAGER
  "initiated_by_channel"               varchar(20) NOT NULL DEFAULT 'HR_ADMIN',
  -- Probation state snapshot at initiation time (immutable after insert)
  "probation_end_date_at_initiation"   date NOT NULL,
  "hire_date_at_initiation"            date NOT NULL,
  -- BR-37: max extension = hire_date + 182 days, computed and stored on insert
  "max_allowed_extension_date"         date NOT NULL,
  -- Line Manager step
  -- CONFIRM | EXTEND | FAIL (null until LM submits)
  "lm_recommendation"                  varchar(10),
  -- mandatory when recommendation submitted (BR-PW-001)
  "lm_comments"                        text,
  "lm_recommended_at"                  timestamptz,
  "lm_person_id"                       uuid REFERENCES "persons"("id"),
  -- only when lm_recommendation = 'EXTEND'; must be <= max_allowed_extension_date (BR-37)
  "requested_extension_end_date"       date,
  -- HR Admin step
  -- APPROVED | REJECTED (null until HR decides)
  "hr_decision"                        varchar(10),
  "hr_comments"                        text,
  "hr_decided_at"                      timestamptz,
  "hr_person_id"                       uuid REFERENCES "persons"("id"),
  -- Overall review status
  -- PENDING_LM | PENDING_HR | PENDING_ACKNOWLEDGMENT | COMPLETED | REJECTED | CANCELLED
  "review_status"                      varchar(30) NOT NULL DEFAULT 'PENDING_LM',
  -- Final outcome — set only when review_status = COMPLETED
  -- CONFIRMED | EXTENDED | FAILED
  "outcome"                            varchar(10),
  -- Links to other records
  "workflow_instance_id"               uuid,
  "confirmation_letter_id"             uuid REFERENCES "employee_letters"("id"),
  "extension_letter_id"                uuid REFERENCES "employee_letters"("id"),
  -- FK to a chained termination workflow instance when outcome = FAILED
  "termination_workflow_instance_id"   uuid,
  "completed_at"                       timestamptz,
  -- 7 mandatory audit columns (BR-AUDIT-001)
  "created_by"           uuid NOT NULL,
  "created_by_name"      varchar(200) NOT NULL,
  "created_date"         timestamptz DEFAULT now() NOT NULL,
  "updated_by"           uuid,
  "updated_by_name"      varchar(200),
  "last_updated_date"    timestamptz,
  "updated_date"         timestamptz,
  -- BR-37 DB constraint: extension date cannot exceed max_allowed_extension_date
  CONSTRAINT "chk_ext_date_br37" CHECK (
    "requested_extension_end_date" IS NULL OR
    "requested_extension_end_date" <= "max_allowed_extension_date"
  ),
  CONSTRAINT "chk_lm_recommendation" CHECK (
    "lm_recommendation" IS NULL OR "lm_recommendation" IN ('CONFIRM', 'EXTEND', 'FAIL')
  ),
  CONSTRAINT "chk_hr_decision" CHECK (
    "hr_decision" IS NULL OR "hr_decision" IN ('APPROVED', 'REJECTED')
  ),
  CONSTRAINT "chk_outcome" CHECK (
    "outcome" IS NULL OR "outcome" IN ('CONFIRMED', 'EXTENDED', 'FAILED')
  )
);

-- BR-PW-001: only one active review per person at a time
CREATE UNIQUE INDEX IF NOT EXISTS "probation_reviews_active_unique"
  ON "probation_reviews" ("tenant_id", "person_id")
  WHERE "review_status" IN ('PENDING_LM', 'PENDING_HR', 'PENDING_ACKNOWLEDGMENT');

CREATE INDEX IF NOT EXISTS "probation_reviews_person_idx"
  ON "probation_reviews" ("tenant_id", "person_id");

CREATE INDEX IF NOT EXISTS "probation_reviews_workflow_idx"
  ON "probation_reviews" ("workflow_instance_id")
  WHERE "workflow_instance_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "probation_reviews_status_idx"
  ON "probation_reviews" ("tenant_id", "review_status")
  WHERE "review_status" NOT IN ('COMPLETED', 'REJECTED', 'CANCELLED');

-- ── 2. PEL — Probation Extension Letter type ───────────────────────────────────

INSERT INTO "letter_template_types" (
  "id", "tenant_id",
  "type_code", "name_en", "name_ar",
  "number_prefix", "number_seed",
  "requires_approval", "allow_ess_self_request", "is_active",
  "created_by", "created_by_name", "created_date"
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'PEL',
  'Probation Extension Letter',
  'خطاب تمديد فترة التجربة',
  'PEL', 0,
  false, false, true,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'System',
  now()
) ON CONFLICT ("type_code") DO NOTHING;

-- ── 3. Default PEL template ────────────────────────────────────────────────────

INSERT INTO "letter_templates" (
  "id", "tenant_id",
  "type_id",
  "name_en", "name_ar",
  "body_en", "body_ar",
  "is_default", "is_active", "version",
  "created_by", "created_by_name", "created_date"
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001'::uuid,
  ltt."id",
  'Default Probation Extension Letter',
  'نموذج افتراضي - خطاب تمديد فترة التجربة',
  '{{letter_date}}

{{employee_name}}
{{job_title}}
{{department}}
{{company_name}}

Dear {{employee_name}},

RE: Extension of Probation Period

We refer to your employment with {{company_name}} and write to confirm that your probation period, which was scheduled to end on {{probation_end_date}}, has been extended to {{extension_end_date}}.

This extension has been approved in accordance with Article 9 of Federal Decree-Law No. 33 of 2021 on the Regulation of Labour Relations. The total probation period shall not exceed six (6) months from your date of joining, which was {{hire_date}}.

Please continue to perform your duties with the same dedication and commitment. Your performance will be reviewed again prior to the new probation end date.

Kindly sign and return a copy of this letter as acknowledgment of receipt.

Yours sincerely,

{{signatory_name}}
{{signatory_title}}
{{company_name}}

Letter No: {{letter_number}}
Date: {{letter_date}}',
  '{{letter_date}}

{{employee_name_ar}}
{{job_title_ar}}
{{department_ar}}
{{company_name_ar}}

عزيزي/عزيزتي {{employee_name_ar}}،

الموضوع: تمديد فترة التجربة

نشير إلى عقد عملك مع {{company_name_ar}} ونودّ إحاطتك علماً بأن فترة تجربتك، والتي كان من المقرر انتهاؤها في {{probation_end_date}}، قد تم تمديدها حتى {{extension_end_date}}.

تم اعتماد هذا التمديد وفقاً للمادة التاسعة من المرسوم بقانون اتحادي رقم 33 لسنة 2021 بشأن تنظيم علاقات العمل. ولا تتجاوز فترة التجربة الإجمالية ستة (6) أشهر من تاريخ التحاقك بالعمل في {{hire_date}}.

يرجى الاستمرار في أداء واجباتك بنفس التفاني والالتزام، وسيتم مراجعة أدائك مجدداً قبل تاريخ انتهاء فترة التجربة الجديدة.

أرجو التفضل بالتوقيع على نسخة من هذا الخطاب وإعادتها إلينا إقراراً بالاستلام.

مع التحية،

{{signatory_name}}
{{signatory_title}}
{{company_name_ar}}

رقم الخطاب: {{letter_number}}
التاريخ: {{letter_date}}',
  true, true, 1,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'System',
  now()
FROM "letter_template_types" ltt
WHERE ltt."type_code" = 'PEL'
  AND ltt."tenant_id" = '00000000-0000-0000-0000-000000000001'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM "letter_templates" lt
    WHERE lt."type_id" = ltt."id"
      AND lt."is_default" = true
      AND lt."tenant_id" = '00000000-0000-0000-0000-000000000001'::uuid
  );

-- ── 4. New token registry entries ─────────────────────────────────────────────

INSERT INTO "letter_field_registry" (
  "id", "tenant_id",
  "token_key", "label_en", "label_ar",
  "category", "data_type", "is_system_token",
  "source_table", "source_column", "resolver_key",
  "is_required",
  "created_by", "created_by_name", "created_date"
) VALUES
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001'::uuid,
    'confirmation_date',
    'Confirmation Date', 'تاريخ التأكيد',
    'PROBATION', 'date', true,
    'probation_reviews', 'hr_decided_at', 'confirmation_date',
    false,
    '00000000-0000-0000-0000-000000000002'::uuid, 'System', now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001'::uuid,
    'extension_end_date',
    'Extension End Date', 'تاريخ نهاية التمديد',
    'PROBATION', 'date', true,
    'probation_reviews', 'requested_extension_end_date', 'extension_end_date',
    false,
    '00000000-0000-0000-0000-000000000002'::uuid, 'System', now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001'::uuid,
    'line_manager_name',
    'Line Manager Name', 'اسم المدير المباشر',
    'PERSON', 'string', true,
    'persons', 'line_manager_id', 'line_manager_name',
    false,
    '00000000-0000-0000-0000-000000000002'::uuid, 'System', now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001'::uuid,
    'hr_approver_name',
    'HR Approver Name', 'اسم موافق الموارد البشرية',
    'PERSON', 'string', true,
    'probation_reviews', 'hr_person_id', 'hr_approver_name',
    false,
    '00000000-0000-0000-0000-000000000002'::uuid, 'System', now()
  )
ON CONFLICT ("token_key") DO NOTHING;
