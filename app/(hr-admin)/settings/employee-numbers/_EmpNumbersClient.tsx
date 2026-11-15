'use client'

import { useState, useTransition, useRef } from 'react'
import { Hash, Save, RefreshCw, Eye, Building2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { saveEmpNumberConfig } from './actions'
import type { EmpNumberEntityRow } from './actions'

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  rows:         EmpNumberEntityRow[]
  isSuperAdmin: boolean
}

interface EntityState {
  prefix:  string
  digits:  number
  seed:    number
  dirty:   boolean
  saving:  boolean
  error:   string | null
  success: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildPreview(prefix: string, digits: number, seed: number, currentMax: number): string {
  const p = prefix.trim().toUpperCase()
  if (!p) return '—'
  const d    = Math.max(3, Math.min(8, digits))
  const next = Math.max(seed, currentMax) + 1
  return `${p}${String(next).padStart(d, '0')}`
}

const DIGIT_OPTIONS = [3, 4, 5, 6, 7, 8] as const

// ── Styles ─────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize:      'var(--text-caption)',
  fontWeight:    700,
  textTransform: 'uppercase',
  color:         'var(--ink-3)',
  letterSpacing: '0.6px',
  display:       'block',
  marginBottom:  5,
}

const inputStyle: React.CSSProperties = {
  border:      '1.5px solid var(--border)',
  borderRadius: 8,
  padding:     '9px 12px',
  fontSize:    14,
  background:  'var(--card)',
  color:       'var(--ink-1)',
  outline:     'none',
  width:       '100%',
  boxSizing:   'border-box',
}

const readOnlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--surface)',
  color:      'var(--ink-3)',
  cursor:     'not-allowed',
}

// ── EntityCard ─────────────────────────────────────────────────────────────

function EntityCard({
  row,
  isSuperAdmin,
}: {
  row:          EmpNumberEntityRow
  isSuperAdmin: boolean
}) {
  const locale = useLocale()
  const [state, setState] = useState<EntityState>({
    prefix:  row.empNumberPrefix ?? '',
    digits:  row.empNumberDigits,
    seed:    row.empNumberSeed,
    dirty:   false,
    saving:  false,
    error:   null,
    success: false,
  })

  const [isPending, startTransition] = useTransition()
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setField<K extends keyof Pick<EntityState, 'prefix' | 'digits' | 'seed'>>(
    key: K,
    val: EntityState[K],
  ) {
    setState(s => ({ ...s, [key]: val, dirty: true, error: null, success: false }))
  }

  function handleSave() {
    startTransition(async () => {
      setState(s => ({ ...s, saving: true, error: null, success: false }))
      const res = await saveEmpNumberConfig(row.id, {
        empNumberPrefix: state.prefix,
        empNumberDigits: state.digits,
        empNumberSeed:   state.seed,
      })
      if (res.success) {
        setState(s => ({ ...s, saving: false, dirty: false, success: true, error: null }))
        // Auto-clear success banner after 3s
        if (successTimer.current) clearTimeout(successTimer.current)
        successTimer.current = setTimeout(() => setState(s => ({ ...s, success: false })), 3000)
      } else {
        setState(s => ({ ...s, saving: false, error: res.error ?? (locale === 'ar' ? 'فشل الحفظ.' : 'Failed to save.') }))
      }
    })
  }

  const preview       = buildPreview(state.prefix, state.digits, state.seed, row.currentMax)
  const isBusy        = isPending || state.saving
  const notConfigured = !row.empNumberPrefix

  return (
    <div style={{
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: "var(--border)",
      borderRightWidth: "1px",
      borderRightStyle: "solid",
      borderRightColor: "var(--border)",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      borderBottomColor: "var(--border)",
      borderLeftWidth: "4px",
      borderLeftStyle: "solid",
      borderLeftColor: `${notConfigured ? 'var(--warning, #f59e0b)' : 'var(--accent)'}`,
      borderRadius: 12,
      background:   'var(--card)',
      overflow:     'hidden',
      marginBottom: 16,
    }}>
      {/* Card header */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        padding:      '16px 20px',
        borderBottom: '1px solid var(--border)',
        background:   'var(--surface)',
      }}>
        <Building2 size={16} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{row.nameEn}</span>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
          marginLeft: 8 }}>{row.entityCode}</span>
        </div>
        {notConfigured && (
          <span style={{
            fontSize:    'var(--text-caption)',
            fontWeight:  600,
            color:       'var(--warning, #d97706)',
            background:  'color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent)',
            padding:     '3px 8px',
            borderRadius: 20,
          }}>
            {locale === 'ar' ? 'غير مُهيّأ' : 'Not configured'}
          </span>
        )}
        {!notConfigured && (
          <span style={{
            fontSize:    'var(--text-caption)',
            fontWeight:  600,
            color:       'var(--brand-active)',
            background:  'color-mix(in srgb, var(--accent) 10%, transparent)',
            padding:     '3px 8px',
            borderRadius: 20,
          }}>
            {locale === 'ar' ? 'نشط' : 'Active'}
          </span>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Row 1: Prefix + Digits + Seed */}
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

          {/* Prefix code */}
          <div>
            <label style={labelStyle}>{locale === 'ar' ? 'رمز البادئة' : 'Prefix Code'}</label>
            {isSuperAdmin ? (
              <input
                type="text"
                value={state.prefix}
                onChange={e => setField('prefix', e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10))}
                placeholder="e.g. AVN"
                maxLength={10}
                style={{
                  ...inputStyle,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight:    600,
                  fontSize:      15,
                }}
              />
            ) : (
              <input
                type="text"
                value={state.prefix || '—'}
                readOnly
                style={readOnlyInputStyle}
              />
            )}
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
            marginTop: 4, display: 'block' }}>
              {locale === 'ar' ? 'حروف وأرقام فقط، بحد أقصى 10' : 'Letters & digits only, max 10'}
            </span>
          </div>

          {/* Number of digits */}
          <div>
            <label style={labelStyle}>{locale === 'ar' ? 'طول الرقم (خانات)' : 'Number Length (digits)'}</label>
            {isSuperAdmin ? (
              <select
                value={state.digits}
                onChange={e => setField('digits', Number(e.target.value))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {DIGIT_OPTIONS.map(d => (
                  <option key={d} value={d}>
                    {locale === 'ar' ? `${d} خانات — ` : `${d} digits — `}{state.prefix.trim() || 'PREFIX'}{'0'.repeat(d - 1)}1
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={locale === 'ar' ? `${state.digits} خانات` : `${state.digits} digits`}
                readOnly
                style={readOnlyInputStyle}
              />
            )}
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
            marginTop: 4, display: 'block' }}>
              {locale === 'ar' ? 'عدد الخانات في الجزء الرقمي' : 'How many digits in the number part'}
            </span>
          </div>

          {/* Starting number (seed) */}
          <div>
            <label style={labelStyle}>
              {locale === 'ar' ? 'رقم البداية' : 'Starting Number'}
              {isSuperAdmin && (
                <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--ink-4)', textTransform: 'none', letterSpacing: 0 }}>
                  (SUPER_ADMIN)
                </span>
              )}
            </label>
            {isSuperAdmin ? (
              <input
                type="number"
                min={0}
                value={state.seed}
                onChange={e => setField('seed', Math.max(0, parseInt(e.target.value) || 0))}
                style={inputStyle}
              />
            ) : (
              <input
                type="text"
                value={state.seed === 0 ? (locale === 'ar' ? '0 (تلقائي)' : '0 (auto)') : String(state.seed)}
                readOnly
                style={readOnlyInputStyle}
              />
            )}
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
            marginTop: 4, display: 'block' }}>
              {locale === 'ar' ? 'الرقم التالي ≥ هذه القيمة + 1' : 'Next number ≥ this value + 1'}
            </span>
          </div>
        </div>

        {/* Row 2: Stats + Preview */}
        <div style={{
          display:      'flex',
          gap:          12,
          alignItems:   'stretch',
          background:   'var(--surface)',
          borderRadius: 8,
          padding:      '14px 16px',
        }}>
          {/* Current max */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ ...labelStyle, marginBottom: 2 }}>
              <RefreshCw size={11} style={{ display: 'inline',
              marginRight: 4 }} />
              {locale === 'ar' ? 'آخر رقم مُستخدَم' : 'Last number used'}
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-1)', fontVariantNumeric: 'tabular-nums' }}>
              {row.currentMax === 0 ? '—' : String(row.currentMax).padStart(state.digits, '0')}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
              {row.currentMax === 0 ? (locale === 'ar' ? 'لا يوجد موظفون بعد' : 'No employees yet') : (locale === 'ar' ? `أعلى رقم صادر: ${row.currentMax}` : `Highest issued: ${row.currentMax}`)}
            </span>
          </div>

          <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />

          {/* Preview of next number */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ ...labelStyle, marginBottom: 2 }}>
              <Eye size={11} style={{ display: 'inline',
              marginRight: 4 }} />
              {locale === 'ar' ? 'رقم الموظف التالي' : 'Next employee number'}
            </span>
            <span style={{
              fontSize:        20,
              fontWeight:      700,
              color:           state.prefix.trim() ? 'var(--brand-active)' : 'var(--ink-4)',
              fontFamily:      'var(--font-mono)',
              letterSpacing:   '0.05em',
            }}>
              {preview}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
              {locale === 'ar' ? 'معاينة بناءً على الإعدادات الحالية' : 'Preview based on current settings'}
            </span>
          </div>
        </div>

        {/* Error / Success banners */}
        {state.error && (
          <div style={{
            display:      'flex',
            gap:          8,
            alignItems:   'center',
            background:   'color-mix(in srgb, var(--destructive, #ef4444) 10%, transparent)',
            border:       '1px solid color-mix(in srgb, var(--destructive, #ef4444) 25%, transparent)',
            borderRadius: 8,
            padding:      '10px 14px',
            fontSize:     'var(--text-body)',
            color:        'var(--destructive, #dc2626)',
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            {state.error}
          </div>
        )}

        {state.success && (
          <div style={{
            display:      'flex',
            gap:          8,
            alignItems:   'center',
            background:   'color-mix(in srgb, #22c55e 10%, transparent)',
            border:       '1px solid color-mix(in srgb, #22c55e 25%, transparent)',
            borderRadius: 8,
            padding:      '10px 14px',
            fontSize:     'var(--text-body)',
            color:        '#16a34a',
          }}>
            <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
            {locale === 'ar' ? 'تم حفظ التهيئة بنجاح.' : 'Configuration saved successfully.'}
          </div>
        )}

        {/* Footer: Save button (SUPER_ADMIN only) */}
        {isSuperAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={isBusy || !state.dirty}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          7,
                padding:      '9px 20px',
                borderRadius: 8,
                border:       'none',
                background:   (isBusy || !state.dirty) ? 'var(--surface)' : 'var(--accent)',
                color:        (isBusy || !state.dirty) ? 'var(--ink-4)' : 'white',
                fontSize:     'var(--text-body)',
                fontWeight:   600,
                cursor:       (isBusy || !state.dirty) ? 'not-allowed' : 'pointer',
                transition:   'background 0.15s, color 0.15s',
              }}
            >
              <Save size={14} strokeWidth={2} />
              {isBusy ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ التغييرات' : 'Save changes')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main client export ──────────────────────────────────────────────────────

export function EmpNumbersClient({ rows, isSuperAdmin }: Props) {
  const locale = useLocale()
  if (rows.length === 0) {
    return (
      <div style={{
        textAlign:    'center',
        padding:      '48px 24px',
        color:        'var(--ink-4)',
        border:       '1px dashed var(--border)',
        borderRadius: 12,
      }}>
        <Hash size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
        <p style={{ margin: 0, fontSize: 14 }}>{locale === 'ar' ? 'لا توجد كيانات قانونية نشطة.' : 'No active legal entities found.'}</p>
      </div>
    )
  }

  return (
    <div>
      {/* Info callout */}
      <div style={{
        display:      'flex',
        gap:          10,
        alignItems:   'flex-start',
        background:   'color-mix(in srgb, var(--accent) 6%, transparent)',
        border:       '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
        borderRadius: 10,
        padding:      '12px 16px',
        marginBottom: 24,
        fontSize:     'var(--text-body)',
        color:        'var(--ink-2)',
      }}>
        <Hash size={15} style={{ color: 'var(--brand-active)',
        marginTop: 1, flexShrink: 0 }} />
        <div>
          <strong style={{ color: 'var(--ink-1)' }}>{locale === 'ar' ? 'كيف يعمل: ' : 'How it works: '}</strong>
          {locale === 'ar' ? <>عيّن <strong>رمز بادئة</strong> (مثال: <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 4px', borderRadius: 4 }}>AVN</code>)، واختر عدد <strong>الخانات</strong> للتعبئة (4 = <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 4px', borderRadius: 4 }}>0001</code>)، واختيارياً عيّن <strong>رقم بداية</strong> للتقدّم. يحصل أول موظف على <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 4px', borderRadius: 4 }}>AVN0001</code> — بدون شرطة. لا تتأثر أرقام الموظفين الحالية.</> : <>Set a <strong>Prefix Code</strong> (e.g. <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 4px', borderRadius: 4 }}>AVN</code>),
          choose how many <strong>digits</strong> to pad (4 = <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 4px', borderRadius: 4 }}>0001</code>),
          and optionally set a <strong>starting number</strong> to skip ahead.
          The first employee gets <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 4px', borderRadius: 4 }}>AVN0001</code> — no hyphen.
          Existing employee numbers are not affected.</>}
        </div>
      </div>

      {rows.map(row => (
        <EntityCard key={row.id} row={row} isSuperAdmin={isSuperAdmin} />
      ))}
    </div>
  )
}
