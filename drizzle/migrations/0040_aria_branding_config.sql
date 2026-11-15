-- Migration 0040: ARIA Branding Configuration
-- Extends aria_agent_config with branding fields:
--   Arabic name, welcome text (bilingual), footer label (bilingual), accent colour.
-- These persist via the updateAriaBranding server action and are displayed
-- in the Branding tab of AriaSettingsClient.

ALTER TABLE aria_agent_config
  ADD COLUMN IF NOT EXISTS agent_name_ar   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS welcome_text    TEXT,
  ADD COLUMN IF NOT EXISTS welcome_text_ar TEXT,
  ADD COLUMN IF NOT EXISTS footer_label    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS footer_label_ar VARCHAR(200),
  ADD COLUMN IF NOT EXISTS accent_color    VARCHAR(20);
