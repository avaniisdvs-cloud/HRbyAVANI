'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import type { Locale } from '@/lib/i18n'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Holiday = {
  id:            string
  holidayCode:   string
  holidayNameEn: string
  holidayNameAr: string
  holidayDate:   string        // YYYY-MM-DD
  endDate?:      string | null
  durationDays:  number
  isFloating:    boolean
  isConfirmed:   boolean
  appliesTo:     string
  legalEntityId: string | null
  holidayYear:   number
}

interface HolidayCalendarGridProps {
  holidays:         Holiday[]
  year:             number
  onYearChange:     (y: number) => void
  onAddHoliday:     (date?: string) => void
  onEditHoliday:    (holiday: Holiday) => void
  onDeleteHoliday:  (id: string) => void
  onHistoryHoliday?: (holiday: Holiday) => void
}

// ── Holiday type colour heuristic (by code prefix) ───────────────────────────

function getHolidayColor(code: string): string {
  const upper = code.toUpperCase()
  if (upper.includes('EID') || upper.includes('ARAFAT') || upper.includes('ISLAMIC') || upper.includes('PROPHET') || upper.includes('RAMADAN')) {
    return '#D4A017'   // gold — religious
  }
  if (upper.includes('NATIONAL') || upper.includes('COMMEMORATION') || upper.includes('FOUNDING') || upper.includes('SPIRIT')) {
    return '#2E5FA8'   // blue — national
  }
  if (upper.includes('OPTIONAL') || upper.includes('OPT_')) {
    return '#6B7280'   // gray — optional
  }
  return 'var(--accent)'   // accent — public/general
}

// ── Mini calendar for one month ───────────────────────────────────────────────

interface MiniMonthProps {
  year:         number
  month:        number   // 0-based
  holidays:     Holiday[]
  onDateClick:  (dateStr: string) => void
  locale:       Locale
}

const WEEKDAY_ABBR = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_ABBR_AR = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']
const MONTH_NAMES  = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

// Build a map of YYYY-MM-DD → holiday[] for fast lookup
function buildDateMap(holidays: Holiday[]): Map<string, Holiday[]> {
  const map = new Map<string, Holiday[]>()
  for (const h of holidays) {
    const existing = map.get(h.holidayDate) ?? []
    existing.push(h)
    map.set(h.holidayDate, existing)
    // Also mark multi-day spans
    if (h.durationDays > 1) {
      const start = new Date(h.holidayDate)
      for (let i = 1; i < h.durationDays; i++) {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        const ds = d.toISOString().slice(0, 10)
        const ex2 = map.get(ds) ?? []
        ex2.push(h)
        map.set(ds, ex2)
      }
    }
  }
  return map
}

function MiniMonth({ year, month, holidays, onDateClick, locale }: MiniMonthProps) {
  const dateMap = buildDateMap(holidays)
  const monthNames = locale === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES
  const weekdayAbbr = locale === 'ar' ? WEEKDAY_ABBR_AR : WEEKDAY_ABBR

  // First day of month (0=Sun)
  const firstDay  = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today     = new Date().toISOString().slice(0, 10)

  // Build grid rows
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) cells.push(null)

  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7))
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--card)',
    }}>
      {/* Month header */}
      <div style={{
        background: 'var(--surface)',
        padding: '7px 10px',
        fontSize: 'var(--text-caption)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--ink-2)',
        borderBottom: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        {monthNames[month]}
      </div>

      <div style={{ padding: '6px 6px 8px' }}>
        {/* Weekday headers */}
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
          {weekdayAbbr.map((d, i) => (
            <div key={i} style={{
              fontSize: 'var(--text-caption)',
              textAlign: 'center',
              fontWeight: 700,
              color: 'var(--ink-4)',
              padding: '2px 0',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Date rows */}
        {rows.map((row, ri) => (
          <div data-responsive-grid="true" key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {row.map((day, ci) => {
              if (day === null) {
                return <div key={ci} />
              }
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayHolidays = dateMap.get(dateStr) ?? []
              const isToday = dateStr === today
              const hasHoliday = dayHolidays.length > 0

              return (
                <div
                  key={ci}
                  onClick={() => onDateClick(dateStr)}
                  title={dayHolidays.map(h => h.holidayNameEn).join(', ')}
                  style={{
                    padding: '2px 1px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderRadius: 4,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  <div style={{
                    fontSize: 'var(--text-caption)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--brand-active)' : 'var(--ink-2)',
                    lineHeight: 1.4,
                  }}>
                    {day}
                  </div>
                  {/* Holiday dot(s) */}
                  {hasHoliday && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 1, marginTop: 1 }}>
                      {dayHolidays.slice(0, 2).map((h, idx) => (
                        <div key={idx} style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: getHolidayColor(h.holidayCode),
                          flexShrink: 0,
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function CalendarLegend({ locale }: { locale: Locale }) {
  const items = [
    { color: 'var(--brand-active)', label: locale === 'ar' ? 'عام' : 'Public' },
    { color: '#D4A017',       label: locale === 'ar' ? 'ديني' : 'Religious' },
    { color: '#2E5FA8',       label: locale === 'ar' ? 'وطني' : 'National' },
    { color: '#6B7280',       label: locale === 'ar' ? 'اختياري' : 'Optional' },
  ]
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function HolidayCalendarGrid({
  holidays,
  year,
  onYearChange,
  onAddHoliday,
  onEditHoliday,
  onDeleteHoliday,
  onHistoryHoliday,
}: HolidayCalendarGridProps) {
  const locale = useLocale()
  const yearHolidays = holidays.filter(h => h.holidayYear === year)

  return (
    <div>
      {/* Year navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '10px 14px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => onYearChange(year - 1)}
            disabled={year <= 2024}
            style={{
              width: 30, height: 30,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              cursor: year <= 2024 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: year <= 2024 ? 'var(--ink-4)' : 'var(--ink-2)',
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ink-1)',
            minWidth: 60,
            textAlign: 'center',
          }}>
            {year}
          </span>
          <button
            onClick={() => onYearChange(year + 1)}
            disabled={year >= 2030}
            style={{
              width: 30, height: 30,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              cursor: year >= 2030 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: year >= 2030 ? 'var(--ink-4)' : 'var(--ink-2)',
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <CalendarLegend locale={locale} />
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
            {locale === 'ar'
              ? `${yearHolidays.length} ${yearHolidays.length === 1 ? 'عطلة' : 'عطلات'}`
              : `${yearHolidays.length} holiday${yearHolidays.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* 12-month grid (4 × 3) */}
      <div data-responsive-grid="true" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
        marginBottom: 24,
      }}>
        {Array.from({ length: 12 }, (_, i) => (
          <MiniMonth
            key={i}
            year={year}
            month={i}
            holidays={yearHolidays}
            onDateClick={(dateStr) => onAddHoliday(dateStr)}
            locale={locale}
          />
        ))}
      </div>

      {/* Holiday list table */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--card)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)' }}>
            {locale === 'ar' ? `عطلات ${year} (${yearHolidays.length})` : `${year} Holidays (${yearHolidays.length})`}
          </span>
          <button
            onClick={() => onAddHoliday()}
            style={{
              height: 30,
              padding: '0 12px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 7,
              fontSize: 'var(--text-caption)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {locale === 'ar' ? '+ إضافة عطلة' : '+ Add Holiday'}
          </button>
        </div>

        {yearHolidays.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 24px',
            color: 'var(--ink-4)',
            fontSize: 'var(--text-body)',
          }}>
            {locale === 'ar'
              ? `لا توجد عطلات لعام ${year}. انقر على «إضافة عطلة» لإنشاء واحدة.`
              : `No holidays for ${year}. Click "Add Holiday" to create one.`}
          </div>
        ) : (
          <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                {[
                  { label: locale === 'ar' ? 'التاريخ' : 'Date',          width: 120 },
                  { label: locale === 'ar' ? 'الرمز' : 'Code',            width: 160 },
                  { label: locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (EN)', width: undefined },
                  { label: locale === 'ar' ? 'الاسم (عربي)' : 'Name (AR)',   width: 180 },
                  { label: locale === 'ar' ? 'المدة' : 'Duration',        width: 80 },
                  { label: locale === 'ar' ? 'ينطبق على' : 'Applies to',  width: 130 },
                  { label: locale === 'ar' ? 'مؤكدة' : 'Confirmed',       width: 90 },
                  { label: '',                                            width: 80 },
                ].map((col, i) => (
                  <th key={i} style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: 'var(--text-caption)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--ink-3)',
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                    width: col.width,
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearHolidays
                .slice()
                .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate))
                .map((h, idx) => (
                  <tr
                    key={h.id}
                    style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}
                  >
                    {/* Date */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: getHolidayColor(h.holidayCode),
                          flexShrink: 0,
                        }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                          {h.holidayDate}
                        </span>
                      </div>
                    </td>

                    {/* Code */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)' }}>
                        {h.holidayCode}
                      </span>
                    </td>

                    {/* Name EN */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--ink-1)' }}>{h.holidayNameEn}</div>
                      {h.isFloating && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <span style={{
                            fontSize: 'var(--text-caption)',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            padding: '1px 5px',
                            background: '#FFF3E0',
                            color: '#E65100',
                            borderRadius: 4,
                          }}>
                            {locale === 'ar' ? 'متغيّرة' : 'Floating'}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Name AR */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', direction: 'rtl', display: 'block', textAlign: 'right' }}>
                        {h.holidayNameAr}
                      </span>
                    </td>

                    {/* Duration */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                        {h.durationDays}d
                      </span>
                    </td>

                    {/* Applies To */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                        {h.appliesTo === 'ALL' ? (locale === 'ar' ? 'جميع الموظفين' : 'All employees')
                          : h.appliesTo === 'MUSLIMS_ONLY' ? (locale === 'ar' ? 'المسلمون فقط' : 'Muslims only')
                          : (locale === 'ar' ? 'القطاع العام فقط' : 'Public sector only')}
                      </span>
                    </td>

                    {/* Confirmed */}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {h.isConfirmed ? (
                        <span style={{
                          fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                          padding: '2px 6px', background: 'var(--accent-100)', color: 'var(--brand-active)', borderRadius: 5,
                        }}>
                          {locale === 'ar' ? 'مؤكدة' : 'Confirmed'}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                          padding: '2px 6px', background: '#FFF3E0', color: '#E65100', borderRadius: 5,
                        }}>
                          {locale === 'ar' ? 'مبدئية' : 'Tentative'}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => onEditHoliday(h)}
                          title={tk(locale, 'common.edit')}
                          style={{
                            height: 26, padding: '0 8px',
                            border: '1px solid var(--border)',
                            borderRadius: 5,
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: 'var(--text-caption)',
                            color: 'var(--ink-3)',
                          }}
                        >
                          {tk(locale, 'common.edit')}
                        </button>
                        {onHistoryHoliday && (
                          <button
                            onClick={() => onHistoryHoliday(h)}
                            title={locale === 'ar' ? 'السجل' : 'History'}
                            style={{
                              height: 26, padding: '0 8px',
                              border: '1px solid var(--border)',
                              borderRadius: 5,
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: 'var(--text-caption)',
                              color: 'var(--ink-3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Clock size={11} /> {locale === 'ar' ? 'السجل' : 'History'}
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteHoliday(h.id)}
                          title={locale === 'ar' ? 'إزالة' : 'Remove'}
                          style={{
                            height: 26, padding: '0 8px',
                            border: '1px solid #E57373',
                            borderRadius: 5,
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: 'var(--text-caption)',
                            color: '#C62828',
                          }}
                        >
                          {locale === 'ar' ? 'إزالة' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table></TableScrollRegion>
        )}
      </div>
    </div>
  )
}
