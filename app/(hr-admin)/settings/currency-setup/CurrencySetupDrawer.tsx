'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CurrencySettingRow, CreateCurrencySettingInput } from '@/modules/config'
import { applyRounding } from '@/lib/utils/currency-format'
import { useLocale } from '@/components/providers/LocaleProvider'
import { X, Loader2 } from 'lucide-react'

interface LegalEntityOption {
  id:     string
  nameEn: string
  nameAr: string
}

interface Props {
  open:          boolean
  onClose:       () => void
  onSave:        (input: CreateCurrencySettingInput) => Promise<void>
  editing:       CurrencySettingRow | null
  legalEntities: LegalEntityOption[]
  error:         string
}

const ROUNDING_OPTIONS = [
  { value: 'HALF_UP',   label: 'Half Up (standard)' },
  { value: 'HALF_EVEN', label: 'Half Even — Banker\'s rounding' },
  { value: 'FLOOR',     label: 'Floor — always round down' },
  { value: 'CEIL',      label: 'Ceiling — always round up' },
  { value: 'TRUNCATE',  label: 'Truncate — drop extra digits' },
]

const COMMON_CURRENCIES = [
  { code: 'AED', nameEn: 'UAE Dirham',        nameAr: 'درهم إماراتي',     symbol: 'AED', dp: 2 },
  { code: 'USD', nameEn: 'US Dollar',          nameAr: 'دولار أمريكي',     symbol: '$',   dp: 2 },
  { code: 'EUR', nameEn: 'Euro',               nameAr: 'يورو',             symbol: '€',   dp: 2 },
  { code: 'GBP', nameEn: 'British Pound',      nameAr: 'جنيه إسترليني',   symbol: '£',   dp: 2 },
  { code: 'SAR', nameEn: 'Saudi Riyal',        nameAr: 'ريال سعودي',       symbol: 'SAR', dp: 2 },
  { code: 'KWD', nameEn: 'Kuwaiti Dinar',      nameAr: 'دينار كويتي',     symbol: 'KD',  dp: 3 },
  { code: 'BHD', nameEn: 'Bahraini Dinar',     nameAr: 'دينار بحريني',    symbol: 'BD',  dp: 3 },
  { code: 'OMR', nameEn: 'Omani Rial',         nameAr: 'ريال عماني',      symbol: 'OMR', dp: 3 },
  { code: 'QAR', nameEn: 'Qatari Riyal',       nameAr: 'ريال قطري',       symbol: 'QAR', dp: 2 },
  { code: 'JPY', nameEn: 'Japanese Yen',       nameAr: 'ين ياباني',       symbol: '¥',   dp: 0 },
  { code: 'INR', nameEn: 'Indian Rupee',       nameAr: 'روبية هندية',     symbol: '₹',   dp: 2 },
  { code: 'PKR', nameEn: 'Pakistani Rupee',    nameAr: 'روبية باكستانية', symbol: '₨',   dp: 2 },
  { code: 'EGP', nameEn: 'Egyptian Pound',     nameAr: 'جنيه مصري',      symbol: 'EGP', dp: 2 },
]

const empty = (): CreateCurrencySettingInput => ({
  legalEntityId:  '',
  currencyCode:   'AED',
  currencyNameEn: 'UAE Dirham',
  currencyNameAr: 'درهم إماراتي',
  currencySymbol: 'AED',
  decimalPlaces:  2,
  roundingMethod: 'HALF_UP',
  effectiveFrom:  new Date().toISOString().slice(0, 10),
  effectiveTo:    null,
})

export function CurrencySetupDrawer({ open, onClose, onSave, editing, legalEntities, error }: Props) {
  const locale = useLocale()
  const [form, setForm]       = useState<CreateCurrencySettingInput>(empty())
  const [localError, setLocalError] = useState('')
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          legalEntityId:  editing.legalEntityId,
          currencyCode:   editing.currencyCode,
          currencyNameEn: editing.currencyNameEn,
          currencyNameAr: editing.currencyNameAr,
          currencySymbol: editing.currencySymbol,
          decimalPlaces:  editing.decimalPlaces,
          roundingMethod: editing.roundingMethod as CreateCurrencySettingInput['roundingMethod'],
          effectiveFrom:  editing.effectiveFrom,
          effectiveTo:    editing.effectiveTo ?? null,
        })
      } else {
        setForm(empty())
      }
      setLocalError('')
    }
  }, [open, editing])

  function applyCurrencyPreset(code: string) {
    const preset = COMMON_CURRENCIES.find(c => c.code === code)
    if (!preset) return
    setForm(prev => ({
      ...prev,
      currencyCode:   preset.code,
      currencyNameEn: preset.nameEn,
      currencyNameAr: preset.nameAr,
      currencySymbol: preset.symbol,
      decimalPlaces:  preset.dp,
    }))
  }

  function field<K extends keyof CreateCurrencySettingInput>(
    key: K,
    value: CreateCurrencySettingInput[K],
  ) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError('')

    // Client-side validation
    const VALID_ROUNDING = ['HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEIL', 'TRUNCATE']
    if (!form.legalEntityId) { setLocalError('Please select a legal entity.'); return }
    if (!VALID_ROUNDING.includes(form.roundingMethod)) { setLocalError('Please select a valid rounding method.'); return }
    if (!/^[A-Z]{3}$/.test(form.currencyCode)) { setLocalError('Currency code must be 3 uppercase letters.'); return }
    if (!form.currencyNameEn.trim()) { setLocalError('Currency name (English) is required.'); return }
    if (!form.currencyNameAr.trim()) { setLocalError('Currency name (Arabic) is required.'); return }
    if (!form.currencySymbol.trim()) { setLocalError('Currency symbol is required.'); return }
    if (form.decimalPlaces < 0 || form.decimalPlaces > 6) { setLocalError('Decimal places must be between 0 and 6.'); return }
    if (!form.effectiveFrom) { setLocalError('Effective from date is required.'); return }
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
      setLocalError('Effective to must be on or after effective from.'); return
    }

    startTransition(async () => {
      try {
        await onSave(form)
      } catch {
        // error is set by the parent — do nothing here
      }
    })
  }

  if (!open) return null

  const displayError = localError || error

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <aside style={{
        position: 'fixed', insetBlock: 0, insetInlineEnd: 0,
        zIndex: 50, width: 480, maxWidth: '95vw',
        background: 'var(--card)',
        borderInlineStart: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
              {editing ? 'Edit Currency Setup' : 'Add Currency Setup'}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
              {editing ? 'تعديل إعداد العملة' : 'إضافة إعداد عملة'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} style={{ padding: 0, width: 28, height: 28 }}>
            <X size={14} />
          </Button>
        </div>

        {/* Form */}
        <form ref={formRef} id="currency-setup-form" onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {displayError && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 'var(--text-body)',
              background: 'color-mix(in srgb, #EF4444 10%, transparent)',
              border: '1px solid color-mix(in srgb, #EF4444 30%, transparent)',
              color: '#B91C1C',
            }}>
              {displayError}
            </div>
          )}

          {/* Legal Entity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
              Legal Entity / Company <span style={{ color: '#EF4444' }}>*</span>
            </Label>
            {legalEntities.length === 0 ? (
              <p style={{
                fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                padding: '9px 12px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                margin: 0,
              }}>
                No legal entities found. Go to <strong>Master Data → Legal Entities</strong> and create one first.
              </p>
            ) : (
              <Select
                value={form.legalEntityId}
                onValueChange={v => field('legalEntityId', v)}
                disabled={!!editing}
              >
                <SelectTrigger style={{ height: 36, fontSize: 'var(--text-body)' }}>
                  <SelectValue placeholder={locale === 'ar' ? 'اختر الشركة…' : 'Select company…'} />
                </SelectTrigger>
                <SelectContent>
                  {legalEntities.map(e => (
                    <SelectItem key={e.id} value={e.id} style={{ fontSize: 'var(--text-body)' }}>
                      {e.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Quick presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
              Quick Preset
            </Label>
            <Select onValueChange={applyCurrencyPreset} value="">
              <SelectTrigger style={{ height: 36, fontSize: 'var(--text-body)' }}>
                <SelectValue placeholder={locale === 'ar' ? 'اختر عملة للتعبئة التلقائية…' : 'Pick a currency to auto-fill…'} />
              </SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map(c => (
                  <SelectItem key={c.code} value={c.code} style={{ fontSize: 'var(--text-body)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.code}</span>
                    {' — '}{c.nameEn} ({c.dp} dp)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <hr style={{ borderRightWidth: "0px",
          borderRightStyle: "none",
          borderRightColor: "currentColor",
          borderBottomWidth: "0px",
          borderBottomStyle: "none",
          borderBottomColor: "currentColor",
          borderLeftWidth: "0px",
          borderLeftStyle: "none",
          borderLeftColor: "currentColor",
          borderTopWidth: "1px",
          borderTopStyle: "solid",
          borderTopColor: "var(--border)", margin: '2px 0' }} />

          {/* Currency Code */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
              Currency Code <span style={{ color: '#EF4444' }}>*</span>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400,
              marginLeft: 6 }}>ISO 4217 — 3 uppercase letters</span>
            </Label>
            <Input
              value={form.currencyCode}
              onChange={e => field('currencyCode', e.target.value.toUpperCase().slice(0, 3))}
              placeholder="AED"
              style={{ height: 36, fontSize: 'var(--text-body)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}
              maxLength={3}
            />
          </div>

          {/* Names */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
                Name EN <span style={{ color: '#EF4444' }}>*</span>
              </Label>
              <Input
                value={form.currencyNameEn}
                onChange={e => field('currencyNameEn', e.target.value)}
                placeholder="UAE Dirham"
                style={{ height: 36, fontSize: 'var(--text-body)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
                Name AR <span style={{ color: '#EF4444' }}>*</span>
              </Label>
              <Input
                value={form.currencyNameAr}
                onChange={e => field('currencyNameAr', e.target.value)}
                placeholder="درهم إماراتي"
                dir="rtl"
                style={{ height: 36, fontSize: 'var(--text-body)' }}
              />
            </div>
          </div>

          {/* Symbol */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
              Currency Symbol <span style={{ color: '#EF4444' }}>*</span>
            </Label>
            <Input
              value={form.currencySymbol}
              onChange={e => field('currencySymbol', e.target.value.slice(0, 10))}
              placeholder="AED"
              style={{ height: 36, fontSize: 'var(--text-body)', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          {/* Decimal Places */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
              Decimal Places <span style={{ color: '#EF4444' }}>*</span>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400,
              marginLeft: 6 }}>0 to 6</span>
            </Label>
            <Select
              value={String(form.decimalPlaces)}
              onValueChange={v => field('decimalPlaces', Number(v))}
            >
              <SelectTrigger style={{ height: 36, fontSize: 'var(--text-body)' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4, 5, 6].map(n => (
                  <SelectItem key={n} value={String(n)} style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-mono)' }}>
                    {n} {n === 0 ? '— no decimals (e.g. JPY)' : n === 2 ? '— standard (e.g. AED, USD)' : n === 3 ? '— high precision (e.g. KWD, BHD)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rounding Method */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
              Rounding Method <span style={{ color: '#EF4444' }}>*</span>
            </Label>
            <Select
              value={form.roundingMethod}
              onValueChange={v => field('roundingMethod', v as CreateCurrencySettingInput['roundingMethod'])}
            >
              <SelectTrigger style={{ height: 36, fontSize: 'var(--text-body)' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUNDING_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} style={{ fontSize: 'var(--text-body)' }}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Effective dates */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
                Effective From <span style={{ color: '#EF4444' }}>*</span>
              </Label>
              <Input
                type="date"
                value={form.effectiveFrom}
                onChange={e => field('effectiveFrom', e.target.value)}
                style={{ height: 36, fontSize: 'var(--text-body)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)' }}>
                Effective To
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 400,
                marginLeft: 4 }}>(leave blank = open-ended)</span>
              </Label>
              <Input
                type="date"
                value={form.effectiveTo ?? ''}
                onChange={e => field('effectiveTo', e.target.value || null)}
                style={{ height: 36, fontSize: 'var(--text-body)' }}
              />
            </div>
          </div>

          {/* Preview */}
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            <p style={{ marginTop: 0,
            marginRight: 0,
            marginLeft: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 6 }}>
              Preview
            </p>
            {(() => {
              const rounded = applyRounding(15000.5678, form.decimalPlaces, form.roundingMethod)
              const fixed   = rounded.toFixed(form.decimalPlaces)
              const [int, dec] = fixed.split('.')
              const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec !== undefined ? '.' + dec : '')
              return (
                <>
                  <p style={{ margin: 0, fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>
                    {form.currencyCode} {formatted}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                    {form.currencySymbol} {formatted}
                  </p>
                </>
              )
            })()}
          </div>
        </form>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending} style={{ height: 36, fontSize: 'var(--text-body)' }}>
            Cancel
          </Button>
          <Button type="submit" form="currency-setup-form" disabled={isPending} style={{ height: 36, fontSize: 'var(--text-body)', gap: 6 }}>
            {isPending && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            {editing ? 'Save Changes' : 'Create Setup'}
          </Button>
        </div>
      </aside>
    </>
  )
}
