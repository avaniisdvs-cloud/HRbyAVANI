/**
 * Pure date helpers operating on ISO YYYY-MM-DD strings.
 *
 * S6-Q7 (audit-fix sweep) — extracted from inline copies that lived
 * in `dashboard/page.tsx`, `me/page.tsx`, and `document-expiry-checker.ts`.
 * UTC-anchored arithmetic so the result is independent of the host's
 * local timezone — the same input always yields the same output.
 *
 * Wire format throughout the system is ISO Gregorian YYYY-MM-DD; these
 * helpers never accept or emit anything else. Hijri values are
 * round-tripped through `@internationalized/date` in `HijriDatePicker`
 * and converted to Gregorian ISO before reaching server code.
 */

/** Adds N days to an ISO YYYY-MM-DD without timezone surprises. */
export function isoDateAddDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole-day diff (b − a) on ISO YYYY-MM-DD inputs. Returns 0 when equal. */
export function isoDateDiff(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((db - da) / 86_400_000)
}

/** Returns today's date in UAE timezone (UTC+4, no DST) as ISO YYYY-MM-DD. */
export function todayUae(): string {
  const now = new Date()
  const uae = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  return uae.toISOString().slice(0, 10)
}
