-- Migration 0045: backfill is_active on persons table
--
-- Root cause: production Neon instances initialised from an older schema snapshot
-- that predates the is_active column on persons.  The Drizzle schema and the
-- initial migration (0000) both define the column, but some environments were
-- seeded before it was added, leaving the column absent and crashing every query
-- that references persons.is_active (dashboard headcount, directory, org chart,
-- ARIA people queries, etc.).
--
-- This migration is fully idempotent: IF NOT EXISTS means it is a no-op on any
-- database that already has the column (e.g. databases initialised from the
-- current 0000 migration).  Backfill sets every existing row to TRUE so the
-- column matches the Drizzle-level default and no active-employee queries change
-- their result set.

ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;

-- Backfill rows inserted before this migration ran (safe no-op when column already existed).
UPDATE "persons" SET "is_active" = true WHERE "is_active" IS NULL;
