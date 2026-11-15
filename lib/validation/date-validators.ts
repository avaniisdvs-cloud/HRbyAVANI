/**
 * Centralised date validation helpers — applied globally across all HR modules.
 *
 * Rules:
 *  • All dates must be YYYY-MM-DD (ISO 8601 calendar date).
 *  • Year must be 4 digits in the range [HR_MIN_YEAR, HR_MAX_YEAR].
 *  • Hijri years follow the same 4-digit constraint when stored as Gregorian.
 *
 * Backend: every Server Action date field must use hrDateString() instead of
 * the raw /^\d{4}-\d{2}-\d{2}$/ regex so the year-range guard is always enforced.
 *
 * Frontend: all <input type="date"> elements must be rendered as <DateInput>
 * (components/forms/DateInput.tsx), which clamps the year to 4 digits on change.
 */
import { z } from 'zod'

/** Inclusive lower bound for any HR date year. */
export const HR_MIN_YEAR = 1900
/** Inclusive upper bound for any HR date year. */
export const HR_MAX_YEAR = 2099

/** ISO date string format guard (format only — no year-range check). */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Clamp a YYYY-MM-DD string's year component to at most 4 digits.
 * If the input doesn't match the expected format it is returned unchanged.
 *
 * Example: "20256-05-01" → "2025-05-01"
 */
export function clampDateYear(raw: string): string {
  if (!raw) return raw
  const idx = raw.indexOf('-', 1)
  if (idx < 0) return raw
  const yearPart = raw.slice(0, idx)
  if (yearPart.length <= 4) return raw
  return yearPart.slice(0, 4) + raw.slice(idx)
}

/**
 * Zod schema for an HR date string.
 *
 * Validates:
 *  1. Format: exactly YYYY-MM-DD
 *  2. Year: between HR_MIN_YEAR (1900) and HR_MAX_YEAR (2099) inclusive
 *
 * Usage (mirrors the old inline regex pattern — just swap the call):
 *   // before:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
 *   // after:   hrDateString()
 *
 * Chain .optional() / .nullable() as normal:
 *   hrDateString().optional()
 *   hrDateString().nullable().optional()
 */
export function hrDateString(opts?: { min?: number; max?: number }) {
  const minYear = opts?.min ?? HR_MIN_YEAR
  const maxYear = opts?.max ?? HR_MAX_YEAR
  return z
    .string()
    .regex(ISO_DATE_RE, 'Date must be in YYYY-MM-DD format')
    .superRefine((val, ctx) => {
      const year = parseInt(val.slice(0, 4), 10)
      if (isNaN(year) || year < minYear || year > maxYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Year must be between ${minYear} and ${maxYear}`,
        })
      }
    })
}

/**
 * Convenience: hrDateString that also accepts an empty string from an HTML
 * form (transforms '' → undefined so optional fields don't fail format checks).
 */
export function hrDateStringOrEmpty(opts?: { min?: number; max?: number }) {
  return z.preprocess(
    (v) => (v === '' ? undefined : v),
    hrDateString(opts).optional(),
  )
}
