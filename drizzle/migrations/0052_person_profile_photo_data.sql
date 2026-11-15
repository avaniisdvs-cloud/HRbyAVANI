-- Migration 0052: Add profile_photo_data column to persons table
--
-- Context: persons.profile_photo_url (varchar 500) stores a cloud storage signed
-- URL (Azure/AWS). When DOCUMENT_STORAGE_PROVIDER=local the storage provider
-- writes files to /tmp on Vercel which is (a) ephemeral and (b) returns an empty
-- string from getSignedUrl() — so the DB ends up with profile_photo_url = ''.
--
-- Fix: add profile_photo_data TEXT to hold a base64 data URL (data:image/...;base64,...)
-- which is written by uploadProfilePhoto alongside the cloud URL. Since the value
-- lives in Neon (not in /tmp or blob storage), it survives all Vercel container
-- restarts and scaling events. This is the durable fallback for UAT environments
-- and local development without cloud storage.
--
-- Display priority (application layer): profile_photo_url || profile_photo_data
-- - Cloud configured: profile_photo_url has a real URL → used (fast CDN delivery)
-- - No cloud (UAT):   profile_photo_url = '' (falsy) → profile_photo_data base64 → works

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS profile_photo_data TEXT;

COMMENT ON COLUMN persons.profile_photo_data IS
  'Base64 data URL (data:image/jpeg;base64,...) — durable fallback when '
  'cloud storage is not configured. Populated by uploadProfilePhoto alongside '
  'profile_photo_url. Display priority: profile_photo_url || profile_photo_data.';
