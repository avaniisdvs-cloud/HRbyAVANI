-- 0049_letter_types_ess_expansion.sql
-- Adds 3 new ESS self-service letter types: LRL, NDL, NTV
-- Adds default templates for all 6 ESS self-request types: EML, SC, STL, LRL, NDL, NTV
--
-- Applied manually via Neon SQL Editor.
-- NOT tracked in drizzle/meta/_journal.json (same pattern as 0040–0048).

-- ── 1. New letter types ───────────────────────────────────────────────────────

INSERT INTO letter_template_types (
  id, tenant_id, type_code, name_en, name_ar, number_prefix, number_seed,
  requires_approval, allow_ess_self_request, is_active,
  created_by, created_by_name, created_date
) VALUES
  (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
    'LRL', 'Loan Request Letter', 'خطاب طلب قرض', 'LRL', 0,
    false, true, true,
    '00000000-0000-0000-0000-000000000001', 'System', NOW()
  ),
  (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
    'NDL', 'NOC for Driving License', 'شهادة عدم ممانعة - رخصة القيادة', 'NDL', 0,
    false, true, true,
    '00000000-0000-0000-0000-000000000001', 'System', NOW()
  ),
  (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
    'NTV', 'NOC for Travel / Visa', 'شهادة عدم ممانعة - سفر/تأشيرة', 'NTV', 0,
    false, true, true,
    '00000000-0000-0000-0000-000000000001', 'System', NOW()
  )
ON CONFLICT (type_code) DO NOTHING;

-- ── 2. Default template: EML (Employment Letter) ──────────────────────────────

INSERT INTO letter_templates (
  id, tenant_id, type_id, name_en, name_ar, body_en, body_ar,
  is_default, is_active, version, created_by, created_by_name, created_date
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  ltt.id,
  'Default Employment Letter',
  'نموذج افتراضي - خطاب توظيف',
  '<p>Date: {{letter_date}}</p>
<p>Ref: {{letter_number}}</p>

<p>To Whom It May Concern,</p>

<p>This is to certify that <strong>{{employee_name}}</strong> (Employee No: {{employee_number}}) is employed with <strong>{{company_name}}</strong> as <strong>{{job_title}}</strong> in the {{department}} department.</p>

<p>{{employee_name}} has been employed with us since {{hire_date}}.</p>

<p>This letter is issued at the request of the employee for whatever legal purpose it may serve.</p>

<p>Yours sincerely,</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name}}</p>',
  '<p>التاريخ: {{letter_date}}</p>
<p>المرجع: {{letter_number}}</p>

<p>إلى من يهمه الأمر،</p>

<p>نشهد بأن <strong>{{employee_name_ar}}</strong> (رقم الموظف: {{employee_number}}) يعمل لدى <strong>{{company_name_ar}}</strong> بمسمى وظيفي <strong>{{job_title_ar}}</strong> في قسم {{department_ar}}.</p>

<p>يعمل الموظف المذكور لدينا منذ {{hire_date}}.</p>

<p>يُصدر هذا الخطاب بناءً على طلب الموظف لأي غرض قانوني يقتضيه.</p>

<p>مع خالص التحية،</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name_ar}}</p>',
  true, true, 1,
  '00000000-0000-0000-0000-000000000001', 'System', NOW()
FROM letter_template_types ltt
WHERE ltt.type_code = 'EML'
  AND NOT EXISTS (
    SELECT 1 FROM letter_templates lt
    WHERE lt.type_id = ltt.id AND lt.is_default = true AND lt.is_active = true
  );

-- ── 3. Default template: SC (Salary Certificate) ─────────────────────────────

INSERT INTO letter_templates (
  id, tenant_id, type_id, name_en, name_ar, body_en, body_ar,
  is_default, is_active, version, created_by, created_by_name, created_date
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  ltt.id,
  'Default Salary Certificate',
  'نموذج افتراضي - شهادة راتب',
  '<p>Date: {{letter_date}}</p>
<p>Ref: {{letter_number}}</p>

<p>To Whom It May Concern,</p>

<p>This is to certify that <strong>{{employee_name}}</strong> (Employee No: {{employee_number}}) is employed with <strong>{{company_name}}</strong> as <strong>{{job_title}}</strong>.</p>

<p>The employee''s monthly basic salary is <strong>{{basic_salary}}</strong>.</p>

<p>This certificate is issued at the request of the employee for banking and financial purposes.</p>

<p>Yours sincerely,</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name}}</p>',
  '<p>التاريخ: {{letter_date}}</p>
<p>المرجع: {{letter_number}}</p>

<p>إلى من يهمه الأمر،</p>

<p>نشهد بأن <strong>{{employee_name_ar}}</strong> (رقم الموظف: {{employee_number}}) يعمل لدى <strong>{{company_name_ar}}</strong> بمسمى وظيفي <strong>{{job_title_ar}}</strong>.</p>

<p>يبلغ الراتب الأساسي الشهري للموظف <strong>{{basic_salary}}</strong>.</p>

<p>تُصدر هذه الشهادة بناءً على طلب الموظف للأغراض المصرفية والمالية.</p>

<p>مع خالص التحية،</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name_ar}}</p>',
  true, true, 1,
  '00000000-0000-0000-0000-000000000001', 'System', NOW()
FROM letter_template_types ltt
WHERE ltt.type_code = 'SC'
  AND NOT EXISTS (
    SELECT 1 FROM letter_templates lt
    WHERE lt.type_id = ltt.id AND lt.is_default = true AND lt.is_active = true
  );

-- ── 4. Default template: STL (Salary Transfer Letter) ────────────────────────

INSERT INTO letter_templates (
  id, tenant_id, type_id, name_en, name_ar, body_en, body_ar,
  is_default, is_active, version, created_by, created_by_name, created_date
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  ltt.id,
  'Default Salary Transfer Letter',
  'نموذج افتراضي - خطاب تحويل راتب',
  '<p>Date: {{letter_date}}</p>
<p>Ref: {{letter_number}}</p>

<p>To: The Branch Manager<br/>
Re: Salary Transfer — {{employee_name}}</p>

<p>Dear Sir / Madam,</p>

<p>This letter is to confirm that the monthly salary of <strong>{{employee_name}}</strong> (Employee No: {{employee_number}}), <strong>{{job_title}}</strong>, is to be transferred to their designated bank account as per the UAE WPS requirements.</p>

<p>Monthly Basic Salary: <strong>{{basic_salary}}</strong></p>

<p>Please arrange for the salary transfer accordingly. For any queries, please contact our HR department.</p>

<p>Yours sincerely,</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name}}</p>',
  '<p>التاريخ: {{letter_date}}</p>
<p>المرجع: {{letter_number}}</p>

<p>إلى: مدير الفرع<br/>
الموضوع: تحويل الراتب — {{employee_name_ar}}</p>

<p>السيد/السيدة المحترم/ة،</p>

<p>نؤكد لكم أن الراتب الشهري للموظف <strong>{{employee_name_ar}}</strong> (رقم الموظف: {{employee_number}})، <strong>{{job_title_ar}}</strong>، يُحوَّل إلى حسابه المصرفي المخصص وفق متطلبات نظام حماية الأجور الإماراتي.</p>

<p>الراتب الأساسي الشهري: <strong>{{basic_salary}}</strong></p>

<p>يُرجى اتخاذ الإجراءات اللازمة لتحويل الراتب. لأي استفسار، يرجى التواصل مع قسم الموارد البشرية.</p>

<p>مع خالص التحية،</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name_ar}}</p>',
  true, true, 1,
  '00000000-0000-0000-0000-000000000001', 'System', NOW()
FROM letter_template_types ltt
WHERE ltt.type_code = 'STL'
  AND NOT EXISTS (
    SELECT 1 FROM letter_templates lt
    WHERE lt.type_id = ltt.id AND lt.is_default = true AND lt.is_active = true
  );

-- ── 5. Default template: LRL (Loan Request Letter) ───────────────────────────

INSERT INTO letter_templates (
  id, tenant_id, type_id, name_en, name_ar, body_en, body_ar,
  is_default, is_active, version, created_by, created_by_name, created_date
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  ltt.id,
  'Default Loan Request Letter',
  'نموذج افتراضي - خطاب طلب قرض',
  '<p>Date: {{letter_date}}</p>
<p>Ref: {{letter_number}}</p>

<p>To: The Branch Manager</p>

<p>Dear Sir / Madam,</p>

<p>This letter is to introduce <strong>{{employee_name}}</strong> (Employee No: {{employee_number}}), who is employed with <strong>{{company_name}}</strong> as <strong>{{job_title}}</strong> in the {{department}} department since {{hire_date}}.</p>

<p>Monthly Basic Salary: <strong>{{basic_salary}}</strong></p>

<p>We confirm that the above-named employee is in good standing with our organisation. We have no objection to {{employee_name}} obtaining a personal loan from your institution.</p>

<p>This letter is issued at the request of the employee for loan purposes only.</p>

<p>Yours sincerely,</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name}}</p>',
  '<p>التاريخ: {{letter_date}}</p>
<p>المرجع: {{letter_number}}</p>

<p>إلى: مدير الفرع</p>

<p>السيد/السيدة المحترم/ة،</p>

<p>يسعدنا تقديم الموظف <strong>{{employee_name_ar}}</strong> (رقم الموظف: {{employee_number}})، الذي يعمل لدى <strong>{{company_name_ar}}</strong> بمسمى وظيفي <strong>{{job_title_ar}}</strong> في قسم {{department_ar}} منذ {{hire_date}}.</p>

<p>الراتب الأساسي الشهري: <strong>{{basic_salary}}</strong></p>

<p>نؤكد أن الموظف المذكور أعلاه يتمتع بسمعة طيبة في مؤسستنا، ولا مانع لدينا من حصوله على قرض شخصي من مؤسستكم.</p>

<p>يُصدر هذا الخطاب بناءً على طلب الموظف لأغراض الاقتراض فقط.</p>

<p>مع خالص التحية،</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name_ar}}</p>',
  true, true, 1,
  '00000000-0000-0000-0000-000000000001', 'System', NOW()
FROM letter_template_types ltt
WHERE ltt.type_code = 'LRL'
  AND NOT EXISTS (
    SELECT 1 FROM letter_templates lt
    WHERE lt.type_id = ltt.id AND lt.is_default = true AND lt.is_active = true
  );

-- ── 6. Default template: NDL (NOC for Driving License) ───────────────────────

INSERT INTO letter_templates (
  id, tenant_id, type_id, name_en, name_ar, body_en, body_ar,
  is_default, is_active, version, created_by, created_by_name, created_date
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  ltt.id,
  'Default NOC for Driving License',
  'نموذج افتراضي - شهادة عدم ممانعة رخصة القيادة',
  '<p>Date: {{letter_date}}</p>
<p>Ref: {{letter_number}}</p>

<p>To: The Relevant Authority<br/>
Re: No Objection Certificate — Driving License</p>

<p>Dear Sir / Madam,</p>

<p>This is to certify that <strong>{{employee_name}}</strong> (Employee No: {{employee_number}}, Nationality: {{nationality}}) is employed with <strong>{{company_name}}</strong> as <strong>{{job_title}}</strong>.</p>

<p>We have no objection to the above-named employee obtaining a driving license from the relevant UAE authority. We confirm that this employee is in good standing with our organisation.</p>

<p>This letter is issued upon the request of the employee.</p>

<p>Yours sincerely,</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name}}</p>',
  '<p>التاريخ: {{letter_date}}</p>
<p>المرجع: {{letter_number}}</p>

<p>إلى: الجهة المعنية<br/>
الموضوع: شهادة عدم ممانعة - رخصة القيادة</p>

<p>السيد/السيدة المحترم/ة،</p>

<p>نشهد بأن <strong>{{employee_name_ar}}</strong> (رقم الموظف: {{employee_number}}، الجنسية: {{nationality}}) يعمل لدى <strong>{{company_name_ar}}</strong> بمسمى وظيفي <strong>{{job_title_ar}}</strong>.</p>

<p>لا مانع لدينا من حصول الموظف المذكور أعلاه على رخصة قيادة من الجهة الإماراتية المختصة، ونؤكد أنه يتمتع بسمعة طيبة في مؤسستنا.</p>

<p>يُصدر هذا الخطاب بناءً على طلب الموظف.</p>

<p>مع خالص التحية،</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name_ar}}</p>',
  true, true, 1,
  '00000000-0000-0000-0000-000000000001', 'System', NOW()
FROM letter_template_types ltt
WHERE ltt.type_code = 'NDL'
  AND NOT EXISTS (
    SELECT 1 FROM letter_templates lt
    WHERE lt.type_id = ltt.id AND lt.is_default = true AND lt.is_active = true
  );

-- ── 7. Default template: NTV (NOC for Travel / Visa) ─────────────────────────

INSERT INTO letter_templates (
  id, tenant_id, type_id, name_en, name_ar, body_en, body_ar,
  is_default, is_active, version, created_by, created_by_name, created_date
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  ltt.id,
  'Default NOC for Travel / Visa',
  'نموذج افتراضي - شهادة عدم ممانعة سفر/تأشيرة',
  '<p>Date: {{letter_date}}</p>
<p>Ref: {{letter_number}}</p>

<p>To: The Embassy / Consulate<br/>
Re: No Objection Certificate — Travel / Visa</p>

<p>Dear Sir / Madam,</p>

<p>This is to certify that <strong>{{employee_name}}</strong> (Employee No: {{employee_number}}, Nationality: {{nationality}}) is employed with <strong>{{company_name}}</strong> as <strong>{{job_title}}</strong> since {{hire_date}}.</p>

<p>We have no objection to the above-named employee travelling abroad for personal purposes. We confirm that the employee will resume their duties upon return and their employment with us remains unaffected.</p>

<p>This letter is issued at the request of the employee for visa and travel purposes.</p>

<p>Yours sincerely,</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name}}</p>',
  '<p>التاريخ: {{letter_date}}</p>
<p>المرجع: {{letter_number}}</p>

<p>إلى: السفارة / القنصلية<br/>
الموضوع: شهادة عدم ممانعة - سفر/تأشيرة</p>

<p>السيد/السيدة المحترم/ة،</p>

<p>نشهد بأن <strong>{{employee_name_ar}}</strong> (رقم الموظف: {{employee_number}}، الجنسية: {{nationality}}) يعمل لدى <strong>{{company_name_ar}}</strong> بمسمى وظيفي <strong>{{job_title_ar}}</strong> منذ {{hire_date}}.</p>

<p>لا مانع لدينا من سفر الموظف المذكور أعلاه خارج الدولة لأغراض شخصية، ونؤكد أنه سيستأنف مهام عمله فور عودته وأن وضعه الوظيفي لدينا لم يتأثر.</p>

<p>يُصدر هذا الخطاب بناءً على طلب الموظف لأغراض التأشيرة والسفر.</p>

<p>مع خالص التحية،</p>

<p><strong>{{signatory_name}}</strong><br/>
{{signatory_title}}<br/>
{{company_name_ar}}</p>',
  true, true, 1,
  '00000000-0000-0000-0000-000000000001', 'System', NOW()
FROM letter_template_types ltt
WHERE ltt.type_code = 'NTV'
  AND NOT EXISTS (
    SELECT 1 FROM letter_templates lt
    WHERE lt.type_id = ltt.id AND lt.is_default = true AND lt.is_active = true
  );

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT type_code, name_en, allow_ess_self_request, is_active
-- FROM letter_template_types
-- WHERE allow_ess_self_request = true
-- ORDER BY type_code;
