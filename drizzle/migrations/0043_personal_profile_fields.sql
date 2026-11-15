-- Migration 0043: Personal Profile Fields (Task 2B)
-- Adds blood_type to persons table. Nullable — no backfill required.
-- Blood type is sensitive personal data (PDPL) — gated behind sensitiveDataConsent.

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS blood_type varchar(10);
