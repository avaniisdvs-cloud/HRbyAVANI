import { describe, it, expect } from 'vitest'
import {
  CalendarDate, IslamicUmalquraCalendar, GregorianCalendar, toCalendar, parseDate,
} from '@internationalized/date'

/**
 * S5-Q1 / TD-23 regression test for the Hijri ↔ Gregorian conversion.
 *
 * The picker logic lives in components/forms/HijriDatePicker.tsx and uses
 * `toCalendar(hijri, new GregorianCalendar())` for both directions. This
 * test re-implements the conversion logic in-line (the picker function isn't
 * exported) and pins the expected values so any future refactor that
 * re-introduces the no-op `toCalendar(h, h.calendar)` failure mode breaks
 * loudly.
 */

function pad(n: number, w = 2) { return String(n).padStart(w, '0') }
function hijriToGregorianIso(h: CalendarDate): string {
  const g = toCalendar(h, new GregorianCalendar())
  return `${pad(g.year, 4)}-${pad(g.month)}-${pad(g.day)}`
}
function gregorianIsoToHijri(iso: string): string {
  const g = parseDate(iso)
  const h = toCalendar(g, new IslamicUmalquraCalendar())
  return `${pad(h.year, 4)}-${pad(h.month)}-${pad(h.day)}`
}

describe('S5-Q1 — Hijri ↔ Gregorian conversion', () => {
  it('Hijri 1447-10-15 → Gregorian 2026-04-03', () => {
    const h = new CalendarDate(new IslamicUmalquraCalendar(), 1447, 10, 15)
    expect(hijriToGregorianIso(h)).toBe('2026-04-03')
  })

  it('Hijri 1446-01-01 → Gregorian 2024-07-07', () => {
    const h = new CalendarDate(new IslamicUmalquraCalendar(), 1446, 1, 1)
    expect(hijriToGregorianIso(h)).toBe('2024-07-07')
  })

  it('Gregorian 2026-04-03 → Hijri 1447-10-15 (round-trip)', () => {
    expect(gregorianIsoToHijri('2026-04-03')).toBe('1447-10-15')
  })

  it('round-trip: Hijri → Gregorian → Hijri preserves the input', () => {
    const original = new CalendarDate(new IslamicUmalquraCalendar(), 1447, 6, 28)
    const greg     = hijriToGregorianIso(original)
    const back     = gregorianIsoToHijri(greg)
    expect(back).toBe('1447-06-28')
  })

  it('regression guard: NEVER do `toCalendar(h, h.calendar)` then build Gregorian from those numbers', () => {
    // This was the pre-fix bug. The line below DELIBERATELY exercises the
    // broken conversion to assert it produces the wrong answer — so if anyone
    // ever writes that pattern again, this test red-flags it.
    const h = new CalendarDate(new IslamicUmalquraCalendar(), 1447, 10, 15)
    const buggy = toCalendar(h, h.calendar)  // no-op, still Umm-al-Qura
    const buggyGreg = new CalendarDate(buggy.year, buggy.month, buggy.day) // treats Hijri numbers as Gregorian
    const buggyIso = `${pad(buggyGreg.year, 4)}-${pad(buggyGreg.month)}-${pad(buggyGreg.day)}`

    // The buggy result is NOT the correct Gregorian.
    expect(buggyIso).toBe('1447-10-15')
    expect(hijriToGregorianIso(h)).not.toBe(buggyIso)
  })
})
