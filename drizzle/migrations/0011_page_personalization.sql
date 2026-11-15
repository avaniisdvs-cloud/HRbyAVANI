-- Migration: 0011_page_personalization
-- Adds the page_personalization table for controlling sign-in page content per entity.

CREATE TABLE IF NOT EXISTS "page_personalization" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_id"           uuid REFERENCES "legal_entities"("id") ON DELETE CASCADE,

  -- Top banner
  "top_banner_text"     text NOT NULL DEFAULT 'AI Driven HR System',
  "top_banner_visible"  boolean NOT NULL DEFAULT true,

  -- Scrolling ticker
  "ticker_text"         text NOT NULL DEFAULT 'AVANIIS Stock Price 100$ · Founder — Visionary Leader — Mr. Talal Al Gaddah',
  "ticker_visible"      boolean NOT NULL DEFAULT true,
  "ticker_speed"        integer NOT NULL DEFAULT 30,

  -- Carousel images (JSONB array: [{ id, url, alt, order, uploadedAt, fileSize? }])
  "carousel_images"     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Custom logo override (null = use default logo)
  "logo_url"            text,

  -- Carousel area height as % of left column (40–85)
  "carousel_height_pct" integer NOT NULL DEFAULT 70,

  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_by"          uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS "page_personalization_entity_unique"
  ON "page_personalization" ("entity_id");

-- Seed one row for the default AVANIIS entity
-- Uses the deterministic ENTITY_ID from seed.ts: 11111111-1111-1111-1111-111111111111
INSERT INTO "page_personalization" (
  "id",
  "entity_id",
  "top_banner_text",
  "top_banner_visible",
  "ticker_text",
  "ticker_visible",
  "ticker_speed",
  "carousel_images",
  "logo_url",
  "carousel_height_pct"
)
SELECT
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  'AI Driven HR System',
  true,
  'AVANIIS Stock Price 100$ · Founder — Visionary Leader — Mr. Talal Al Gaddah',
  true,
  30,
  '[]'::jsonb,
  null,
  70
WHERE EXISTS (
  SELECT 1 FROM "legal_entities" WHERE "id" = '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT DO NOTHING;
