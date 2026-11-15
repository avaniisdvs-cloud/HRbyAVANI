-- Migration 0014: Fix company legal name
-- Incorrect: Avaniis
-- Correct:   Avaniis

BEGIN;

UPDATE legal_entities
SET
  name_en      = 'Avaniis',
  name_ar      = 'أفانيس',
  updated_date = NOW()
WHERE
  name_en ILIKE '%real estate%'
  OR entity_code = 'AVN-001';

UPDATE aria_agent_config
SET
  agent_role   = REPLACE(agent_role, 'Real Estate', 'Property Development'),
  updated_date = NOW()
WHERE agent_role ILIKE '%real estate%';

INSERT INTO audit_log (
  id, tenant_id, event_type, entity_type, entity_id,
  event_description, channel,
  created_by, created_by_name, created_date
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'SYSTEM.COMPANY_NAME_UPDATE',
  'legal_entities',
  '11111111-1111-1111-1111-111111111111',
  'Company name updated: Avaniis → Avaniis',
  'SYSTEM',
  '00000000-0000-0000-0000-000000000000',
  'System Migration 0014',
  NOW()
);

COMMIT;
