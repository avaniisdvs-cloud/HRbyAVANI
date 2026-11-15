-- Migration 0014: Employee number configuration per legal entity.
-- Adds configurable prefix, digit padding, and seed (override counter).
-- Settings → Employee Numbers lets SUPER_ADMIN configure these per entity.
-- Format produced: {prefix}{padded-number}  e.g. AVN0001, MAG000123

ALTER TABLE legal_entities
  ADD COLUMN IF NOT EXISTS emp_number_prefix VARCHAR(10),
  ADD COLUMN IF NOT EXISTS emp_number_digits  INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS emp_number_seed    INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN legal_entities.emp_number_prefix
  IS 'Short prefix for employee numbers, e.g. AVN, Avaniis. NULL = not yet configured (falls back to entity_code).';
COMMENT ON COLUMN legal_entities.emp_number_digits
  IS 'Digit padding for the numeric part (3–8). 4 = AVN0001, 6 = AVN000001.';
COMMENT ON COLUMN legal_entities.emp_number_seed
  IS 'SUPER_ADMIN override: next number = MAX(seed, current_max) + 1. Default 0 = no override.';
