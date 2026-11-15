-- ============================================================================
-- Migration 0029 — ARIA pre-sign-in chat configuration
--
-- Seeds policy_settings rows for the AUTH module so the AriaLoginWidget
-- shows live-configurable contact info and lockout policy instead of
-- hardcoded strings.  HR admins can update these rows via the Settings UI.
-- ============================================================================

INSERT INTO policy_settings (
  id, tenant_id, legal_entity_id,
  setting_key, setting_name_en, setting_name_ar,
  value_type, setting_value, module_code,
  is_overridable, effective_from,
  created_by, created_by_name,
  created_at, updated_at
) VALUES
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'AUTH.hr_contact_en',
    'HR Contact (English)',
    'جهة اتصال الموارد البشرية (إنجليزي)',
    'STRING', 'Layla in HR — ext. 4421',
    'AUTH', false, CURRENT_DATE,
    '00000000-0000-0000-0000-000000000001', 'system',
    NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'AUTH.hr_contact_ar',
    'HR Contact (Arabic)',
    'جهة اتصال الموارد البشرية (عربي)',
    'STRING', 'ليلى في الموارد البشرية — داخلي 4421',
    'AUTH', false, CURRENT_DATE,
    '00000000-0000-0000-0000-000000000001', 'system',
    NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'AUTH.lockout_attempts',
    'Lockout Attempt Threshold',
    'عدد المحاولات قبل القفل',
    'NUMBER', '5',
    'AUTH', false, CURRENT_DATE,
    '00000000-0000-0000-0000-000000000001', 'system',
    NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'AUTH.lockout_window_minutes',
    'Lockout Window (minutes)',
    'نافذة القفل (دقائق)',
    'NUMBER', '15',
    'AUTH', false, CURRENT_DATE,
    '00000000-0000-0000-0000-000000000001', 'system',
    NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'AUTH.reset_method_en',
    'Password Reset Method (English)',
    'طريقة إعادة تعيين كلمة المرور (إنجليزي)',
    'STRING', 'Email + SMS OTP',
    'AUTH', false, CURRENT_DATE,
    '00000000-0000-0000-0000-000000000001', 'system',
    NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'AUTH.reset_method_ar',
    'Password Reset Method (Arabic)',
    'طريقة إعادة تعيين كلمة المرور (عربي)',
    'STRING', 'البريد + رمز SMS',
    'AUTH', false, CURRENT_DATE,
    '00000000-0000-0000-0000-000000000001', 'system',
    NOW(), NOW()
  )
ON CONFLICT DO NOTHING;
