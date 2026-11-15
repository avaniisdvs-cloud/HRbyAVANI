'use client'

import { useState, useEffect, useId } from 'react'
import {
  parseDate,
  CalendarDate,
  GregorianCalendar,
  IslamicUmalquraCalendar,
  toCalendar,
} from '@internationalized/date'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DateInput } from '@/components/forms/DateInput'

/**
 * TD-05 — Hijri ↔ Gregorian date picker.
 *
 * Backed by `@internationalized/date`. Internally always stores the value
 * as a YYYY-MM-DD Gregorian string (so the wire format never changes).
 * The display calendar toggles between Gregorian and Hijri (Umm al-Qura)
 * — when the active locale is Arabic, Hijri is the default.
 *
 * The hidden input emits the Gregorian value so server actions and
 * existing form payloads keep working unchanged.
 */
export interface HijriDatePickerProps {
  name?:        string                 // hidden input name (Gregorian YYYY-MM-DD)
  label?:       string
  value?:       string                 // Gregorian YYYY-MM-DD
  defaultValue?: string
  required?:    boolean
  disabled?:    boolean
  locale?:      'en' | 'ar'
  onChange?:    (gregorian: string) => void
  helpText?:    string
  /** When false, hides the calendar-type toggle and always shows the Gregorian input.
   *  Hijri equivalent is shown as a compact read-only hint below the field.
   *  Defaults to true (full toggle visible). */
  showToggle?:  boolean
}

type CalendarKind = 'gregorian' | 'hijri'

// S5-Q1 — TD-23 fix.
// Bug history: an earlier version called `toCalendar(h, h.calendar)` (no-op
// because h.calendar IS Umm-al-Qura) and then constructed a Gregorian
// CalendarDate from those numbers — storing Hijri 1447-10-15 as Gregorian
// 1447-10-15 instead of 2026-04-03. The fix is to convert via an explicit
// `new GregorianCalendar()` instance.

function formatHijri(g: CalendarDate): string {
  const h = toCalendar(g, new IslamicUmalquraCalendar())
  const yy = String(h.year).padStart(4, '0')
  const mm = String(h.month).padStart(2, '0')
  const dd = String(h.day).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function parseHijri(input: string): CalendarDate | null {
  // Require exactly 4-digit Hijri year (current range ~1300-1600 AH).
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input.trim())
  if (!m) return null
  const [, y, mo, d] = m
  try {
    return new CalendarDate(new IslamicUmalquraCalendar(), Number(y), Number(mo), Number(d))
  } catch {
    return null
  }
}

/** S5-Q1 — convert a Hijri CalendarDate to ISO Gregorian YYYY-MM-DD. */
function hijriToGregorianIso(h: CalendarDate): string {
  const g = toCalendar(h, new GregorianCalendar())
  return `${pad(g.year, 4)}-${pad(g.month)}-${pad(g.day)}`
}

export function HijriDatePicker({
  name, label, value, defaultValue, required, disabled,
  locale = 'en', onChange, helpText, showToggle = true,
}: HijriDatePickerProps) {
  const inputId = useId()
  const [calendarKind, setCalendarKind] =
    useState<CalendarKind>(locale === 'ar' ? 'hijri' : 'gregorian')
  const initial = value ?? defaultValue ?? ''
  const [gregorian, setGregorian] = useState(initial)
  const [hijri, setHijri] = useState(() => initial ? safeFormatHijri(initial) : '')

  // Sync if controlled.
  useEffect(() => {
    if (value !== undefined && value !== gregorian) {
      setGregorian(value)
      setHijri(value ? safeFormatHijri(value) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const onGregorianChange = (raw: string) => {
    setGregorian(raw)
    setHijri(raw ? safeFormatHijri(raw) : '')
    onChange?.(raw)
  }

  const onHijriChange = (raw: string) => {
    setHijri(raw)
    const h = parseHijri(raw)
    if (h) {
      // S5-Q1 — round-trip through GregorianCalendar so the wire value is
      // the actual Gregorian equivalent of the Hijri date the user typed.
      const iso = hijriToGregorianIso(h)
      setGregorian(iso)
      onChange?.(iso)
    }
  }

  // Simple mode: no calendar toggle, always Gregorian input with Hijri hint below.
  if (!showToggle) {
    return (
      <div className="space-y-1.5">
        {label && <Label htmlFor={inputId} className="text-xs font-semibold text-ink-1">{label}{required ? <span className="ms-0.5 text-destructive">*</span> : ''}</Label>}
        <DateInput
          id={inputId}
          shadcn
          disabled={disabled}
          required={required}
          value={gregorian}
          onChange={e => onGregorianChange(e.target.value)}
          className="font-mono"
        />
        {gregorian && hijri && (
          <p className="text-xs text-ink-3">
            Hijri equivalent: <span className="font-mono">{hijri}</span>
          </p>
        )}
        {helpText && <p className="text-xs text-ink-3">{helpText}</p>}
        {name && <input type="hidden" name={name} value={gregorian} />}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={inputId} className="text-xs font-medium text-ink-2">{label}{required ? ' *' : ''}</Label>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Select value={calendarKind} onValueChange={(v: string) => setCalendarKind(v as CalendarKind)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gregorian">Gregorian</SelectItem>
              <SelectItem value="hijri">Hijri (Umm al-Qura)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {calendarKind === 'gregorian' ? (
          <DateInput
          id={inputId}
            shadcn
            disabled={disabled}
            required={required}
            value={gregorian}
            onChange={e => onGregorianChange(e.target.value)}
            className="font-mono"
          />
        ) : (
          <Input
            id={inputId}
            type="text"
            placeholder="YYYY-MM-DD (Hijri)"
            disabled={disabled}
            value={hijri}
            onChange={e => onHijriChange(e.target.value)}
            dir="ltr"
            className="font-mono"
          />
        )}

        {/* Side-by-side: always show the other calendar value as a read-only hint. */}
        {gregorian && (
          <span className="text-xs text-ink-3">
            {calendarKind === 'gregorian'
              ? <>Hijri: <span className="font-mono">{hijri || '—'}</span></>
              : <>Gregorian: <span className="font-mono">{gregorian}</span></>}
          </span>
        )}
      </div>
      {helpText && <p className="text-xs text-ink-3">{helpText}</p>}
      {/* Hidden input keeps existing FormData payloads unchanged — the server
          always sees ISO Gregorian YYYY-MM-DD. */}
      {name && <input type="hidden" name={name} value={gregorian} />}
    </div>
  )
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

function safeFormatHijri(iso: string): string {
  try {
    return formatHijri(parseDate(iso))
  } catch {
    return ''
  }
}
