'use client'

import { useLocale } from '@/components/providers/LocaleProvider'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayConfig {
  start: string   // HH:MM or ''
  end:   string   // HH:MM or ''
  on:    boolean
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type DayHoursValue = Record<DayKey, DayConfig>

interface DayHoursGridProps {
  value:    DayHoursValue
  onChange: (v: DayHoursValue) => void
  disabled?: boolean
}

// ── Default value (Standard UAE Sun–Thu) ─────────────────────────────────────

export const DEFAULT_UAE_SCHEDULE: DayHoursValue = {
  sun: { on: true,  start: '09:00', end: '18:00' },
  mon: { on: true,  start: '09:00', end: '18:00' },
  tue: { on: true,  start: '09:00', end: '18:00' },
  wed: { on: true,  start: '09:00', end: '18:00' },
  thu: { on: true,  start: '09:00', end: '18:00' },
  fri: { on: false, start: '',      end: ''      },
  sat: { on: false, start: '',      end: ''      },
}

// ── Helper ────────────────────────────────────────────────────────────────────

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const total = (eh * 60 + em) - (sh * 60 + sm)
  if (total <= 0) return 0
  return total > 300 ? (total - 60) / 60 : total / 60
}

function fmtHours(h: number): string {
  if (h === 0) return '—'
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}h`
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABEL: Record<DayKey, string> = {
  mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN',
}
const DAY_LABEL_AR: Record<DayKey, string> = {
  mon: 'إثن', tue: 'ثلا', wed: 'أرب', thu: 'خمي', fri: 'جمع', sat: 'سبت', sun: 'أحد',
}

// ── Sub-styles ────────────────────────────────────────────────────────────────

const cellBase: React.CSSProperties = {
  paddingTop: "6px",
  paddingRight: "4px",
  paddingBottom: "6px",
  paddingLeft: "4px",
  textAlign: 'center',
  verticalAlign: 'middle',
  borderRight: '1px solid var(--border)',
}

const labelCell: React.CSSProperties = {
  ...cellBase,
  textAlign: 'right',
  paddingRight: 10,
  paddingLeft: 4,
  width: 56,
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--ink-3)',
  borderRight: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const timeInputStyle: React.CSSProperties = {
  width: 72,
  border: '1.5px solid var(--border)',
  borderRadius: 6,
  padding: '5px 6px',
  fontSize: 'var(--text-caption)',
  fontFamily: 'var(--font-mono)',
  color: 'var(--ink-1)',
  background: 'var(--card)',
  outline: 'none',
  textAlign: 'center',
  boxSizing: 'border-box',
}

const disabledTimeStyle: React.CSSProperties = {
  ...timeInputStyle,
  background: 'var(--surface)',
  color: 'var(--ink-4)',
  cursor: 'not-allowed',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DayHoursGrid({ value, onChange, disabled = false }: DayHoursGridProps) {
  const locale = useLocale()

  function updateDay(day: DayKey, patch: Partial<DayConfig>) {
    if (disabled) return
    const current = value[day]
    const updated: DayConfig = { ...current, ...patch }
    // If toggled off, clear times
    if (patch.on === false) {
      updated.start = ''
      updated.end = ''
    }
    onChange({ ...value, [day]: updated })
  }

  const totalHours = DAY_ORDER.reduce((sum, day) => {
    const d = value[day]
    return sum + (d.on ? calcHours(d.start, d.end) : 0)
  }, 0)

  const hasFriday  = value.fri.on
  const hasSaturday = value.sat.on
  const showNonStandardWarning = hasFriday || hasSaturday
  const showOverLimitWarning = totalHours > 48

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          fontSize: 'var(--text-body)',
        }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              {/* row label column */}
              <th style={{ ...labelCell, borderBottom: '1px solid var(--border)', background: 'var(--surface)' }} />
              {DAY_ORDER.map(day => (
                <th key={day} style={{
                  ...cellBase,
                  borderBottom: '1px solid var(--border)',
                  fontSize: 'var(--text-caption)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: value[day].on ? 'var(--brand-active)' : 'var(--ink-4)',
                  background: 'var(--surface)',
                  width: 82,
                }}>
                  {locale === 'ar' ? DAY_LABEL_AR[day] : DAY_LABEL[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Row: Active */}
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={labelCell}>{locale === 'ar' ? 'نشط' : 'Active'}</td>
              {DAY_ORDER.map(day => (
                <td key={day} style={cellBase}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={value[day].on}
                      onChange={e => updateDay(day, { on: e.target.checked })}
                      disabled={disabled}
                      style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: disabled ? 'not-allowed' : 'pointer' }}
                    />
                  </label>
                </td>
              ))}
            </tr>

            {/* Row: Start */}
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={labelCell}>{locale === 'ar' ? 'البداية' : 'Start'}</td>
              {DAY_ORDER.map(day => (
                <td key={day} style={cellBase}>
                  <input
                    type="time"
                    value={value[day].start}
                    onChange={e => updateDay(day, { start: e.target.value })}
                    disabled={disabled || !value[day].on}
                    style={disabled || !value[day].on ? disabledTimeStyle : timeInputStyle}
                  />
                </td>
              ))}
            </tr>

            {/* Row: End */}
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={labelCell}>{locale === 'ar' ? 'النهاية' : 'End'}</td>
              {DAY_ORDER.map(day => (
                <td key={day} style={cellBase}>
                  <input
                    type="time"
                    value={value[day].end}
                    onChange={e => updateDay(day, { end: e.target.value })}
                    disabled={disabled || !value[day].on}
                    style={disabled || !value[day].on ? disabledTimeStyle : timeInputStyle}
                  />
                </td>
              ))}
            </tr>

            {/* Row: Hours */}
            <tr>
              <td style={labelCell}>{locale === 'ar' ? 'الساعات' : 'Hours'}</td>
              {DAY_ORDER.map(day => {
                const hours = value[day].on ? calcHours(value[day].start, value[day].end) : 0
                return (
                  <td key={day} style={{
                    ...cellBase,
                    fontSize: 'var(--text-caption)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: value[day].on ? (hours === 0 ? '#C62828' : 'var(--ink-2)') : 'var(--ink-4)',
                  }}>
                    {value[day].on ? fmtHours(hours) : '—'}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Total */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginTop: 10,
        padding: '8px 12px',
        background: showOverLimitWarning ? '#FFF3E0' : 'var(--surface)',
        border: `1px solid ${showOverLimitWarning ? '#FFCC80' : 'var(--border)'}`,
        borderRadius: 8,
      }}>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'الإجمالي:' : 'Total:'}</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-body)',
          fontWeight: 700,
          color: showOverLimitWarning ? '#E65100' : 'var(--ink-1)',
        }}>
          {totalHours % 1 === 0 ? totalHours.toFixed(0) : totalHours.toFixed(1)} {locale === 'ar' ? 'ساعة/أسبوع' : 'h/week'}
        </span>
        {showOverLimitWarning && (
          <span style={{ fontSize: 'var(--text-caption)', color: '#E65100', fontWeight: 500 }}>
            {locale === 'ar' ? 'يتجاوز حد 48 ساعة/أسبوع (BR-WH-001)' : 'Exceeds 48h/week limit (BR-WH-001)'}
          </span>
        )}
      </div>

      {/* BR-WH-003: Non-standard working days warning */}
      {showNonStandardWarning && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          background: '#FFF3E0',
          border: '1px solid #FFCC80',
          borderRadius: 8,
          fontSize: 'var(--text-caption)',
          color: '#E65100',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
        }}>
          <span style={{ fontSize: 'var(--text-body)', flexShrink: 0 }}>⚠️</span>
          <span>{locale === 'ar' ? 'أيام عمل غير قياسية — تحقق مع الشؤون القانونية (BR-WH-003)' : 'Non-standard working days — verify with Legal (BR-WH-003)'}</span>
        </div>
      )}
    </div>
  )
}
