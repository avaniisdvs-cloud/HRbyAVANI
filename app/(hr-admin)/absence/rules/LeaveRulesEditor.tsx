'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { saveLeaveRuleSet } from '@/modules/absence'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'

interface Props {
  entities: Array<{ id: string; code: string | null; nameEn: string; nameAr: string | null }>
}

const ABSENCE_TYPES = [
  { code: 'ANNUAL',     label: 'Annual leave (BR-AL-001)' },
  { code: 'SICK',       label: 'Sick leave (BR-SL-001)' },
  { code: 'MATERNITY',  label: 'Maternity (BR-ML-001)' },
  { code: 'PATERNITY',  label: 'Paternity (BR-PL-001)' },
  { code: 'STUDY',      label: 'Study (BR-STL-001)' },
  { code: 'HAJJ',       label: 'Hajj (BR-HJ-001)' },
  { code: 'BEREAVEMENT', label: 'Bereavement (BR-BL-001)' },
] as const

const ANY = '__any__'
const NONE_ENTITY = '__none__'

interface DraftLine {
  absenceTypeCode:          (typeof ABSENCE_TYPES)[number]['code']
  tiersText:                string  // "0-12:0 ; 12-:30"
  maxCarryForwardDays:      number
  carryForwardExpiryMonths: number
  isProRated:               boolean
  accrualFrequency:         'MONTHLY' | 'DAILY' | 'ANNUALLY'
  minServiceMonths:         number
  maxDaysPerYear?:          number
  encashmentAllowed:        boolean
  encashmentMaxDays?:       number
}

const STARTER_LINES: DraftLine[] = [
  // BR-AL-001 — meets the 22-day minimum (30 days at ≥1y service).
  {
    absenceTypeCode:          'ANNUAL',
    tiersText:                '0-6:0 ; 6-12:24 ; 12-:30',
    maxCarryForwardDays:      22,
    carryForwardExpiryMonths: 24,
    isProRated:               true,
    accrualFrequency:         'MONTHLY',
    minServiceMonths:         0,
    maxDaysPerYear:           30,
    encashmentAllowed:        true,
    encashmentMaxDays:        30,
  },
  {
    absenceTypeCode:          'SICK',
    tiersText:                '6-:90',
    maxCarryForwardDays:      0,
    carryForwardExpiryMonths: 0,
    isProRated:               false,
    accrualFrequency:         'ANNUALLY',
    minServiceMonths:         6,
    maxDaysPerYear:           90,
    encashmentAllowed:        false,
  },
]

type ParsedTier = { minServiceMonths: number; maxServiceMonths: number | null; daysEntitled: number }
type ParseResult =
  | { ok: true; tiers: ParsedTier[] }
  | { ok: false; error: string }

/**
 * S5-Q10 — strict, friendly tier-string parser.
 * Format: `minMonths-maxMonths:days ; …` (blank max = open-ended).
 * Surfaces precise per-segment errors so the user doesn't see a generic
 * Zod 400 from the server.
 */
function parseTiers(text: string): ParseResult {
  const segments = text.split(';').map(s => s.trim()).filter(Boolean)
  if (segments.length === 0) return { ok: false, error: 'at least one tier is required' }
  const tiers: ParsedTier[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const colon = seg.indexOf(':')
    if (colon === -1) return { ok: false, error: `tier ${i + 1}: missing ":days" — got "${seg}"` }
    const span = seg.slice(0, colon).trim()
    const daysRaw = seg.slice(colon + 1).trim()
    const [minRaw, maxRaw] = span.split('-')
    if (minRaw === undefined || maxRaw === undefined) {
      return { ok: false, error: `tier ${i + 1}: span must look like "min-max" (got "${span}")` }
    }
    const min  = Number(minRaw)
    const max  = maxRaw === '' ? null : Number(maxRaw)
    const days = Number(daysRaw)
    if (!Number.isFinite(min) || min < 0)         return { ok: false, error: `tier ${i + 1}: minMonths must be a non-negative number (got "${minRaw}")` }
    if (max !== null && (!Number.isFinite(max) || max < min)) {
      return { ok: false, error: `tier ${i + 1}: maxMonths must be ≥ minMonths or blank (got "${maxRaw}")` }
    }
    if (!Number.isFinite(days) || days < 0 || days > 365) {
      return { ok: false, error: `tier ${i + 1}: daysEntitled must be 0–365 (got "${daysRaw}")` }
    }
    tiers.push({ minServiceMonths: min, maxServiceMonths: max, daysEntitled: days })
  }
  return { ok: true, tiers }
}

export function LeaveRulesEditor({ entities }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [code, setCode] = useState('UAE-STANDARD')
  const [nameEn, setNameEn] = useState('UAE Standard Leave Rules')
  const [nameAr, setNameAr] = useState('قواعد الإجازات الإماراتية القياسية')
  const [legalEntityId, setLegalEntityId] = useState<string>(NONE_ENTITY)
  const [entityTypeScope, setEntityTypeScope] = useState<string>(ANY)
  const [nationalityScope, setNationalityScope] = useState<'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT' | 'ALL'>('ALL')
  const [employmentTypeScope, setEmploymentTypeScope] = useState<'FULL_TIME' | 'PART_TIME' | 'ALL'>('ALL')
  const [effectiveFrom, setEffectiveFrom] = useState('2026-01-01')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [isDefault, setIsDefault] = useState(true)
  const [lines, setLines] = useState<DraftLine[]>(STARTER_LINES)

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }
  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }
  const addLine = () => {
    setLines(prev => [...prev, {
      absenceTypeCode:          'STUDY',
      tiersText:                '12-:10',
      maxCarryForwardDays:      0,
      carryForwardExpiryMonths: 0,
      isProRated:               false,
      accrualFrequency:         'ANNUALLY',
      minServiceMonths:         12,
      maxDaysPerYear:           10,
      encashmentAllowed:        false,
    }])
  }

  const onSave = () => {
    setError(null); setSuccess(null)
    // S5-Q10 — client-side validate every tiers string before round-trip.
    const parsedLines: Array<ReturnType<typeof parseTiers> & { idx: number; line: DraftLine }> = []
    for (let i = 0; i < lines.length; i++) {
      const r = parseTiers(lines[i].tiersText)
      parsedLines.push({ ...r, idx: i, line: lines[i] })
    }
    const firstBad = parsedLines.find(p => !p.ok)
    if (firstBad && !firstBad.ok) {
      setError(`${locale === 'ar' ? 'السطر' : 'Line'} ${firstBad.idx + 1} (${firstBad.line.absenceTypeCode}) — ${firstBad.error}`)
      return
    }
    startTransition(async () => {
      try {
        const payload = {
          ruleSetCode:         code,
          ruleSetNameEn:       nameEn,
          ruleSetNameAr:       nameAr || undefined,
          legalEntityId:       legalEntityId === NONE_ENTITY ? null : legalEntityId,
          entityTypeScope:     (entityTypeScope === ANY ? undefined : entityTypeScope) as Parameters<typeof saveLeaveRuleSet>[0]['entityTypeScope'],
          nationalityScope,
          employmentTypeScope,
          effectiveFrom,
          effectiveTo:         effectiveTo || undefined,
          isDefault,
          lines: parsedLines.map(p => ({
            absenceTypeCode:          p.line.absenceTypeCode,
            entitlementTiersJson:     p.ok ? p.tiers : [],   // unreachable after firstBad guard
            maxCarryForwardDays:      p.line.maxCarryForwardDays,
            carryForwardExpiryMonths: p.line.carryForwardExpiryMonths,
            isProRated:               p.line.isProRated,
            accrualFrequency:         p.line.accrualFrequency,
            minServiceMonths:         p.line.minServiceMonths,
            maxDaysPerYear:           p.line.maxDaysPerYear,
            encashmentAllowed:        p.line.encashmentAllowed,
            encashmentMaxDays:        p.line.encashmentMaxDays,
          })),
        }
        // Server Action call — Hard Rule 11 enforced inside.
        const res = await saveLeaveRuleSet(payload)
        setSuccess(`Saved rule set ${res.ruleSetId} with ${res.lineCount} lines.`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : (locale === 'ar' ? 'تعذّر حفظ مجموعة قواعد الإجازات. يرجى المحاولة مرة أخرى.' : 'Unable to save the leave rule set. Please try again.'))
      }
    })
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'إنشاء / حفظ مجموعة القواعد' : 'Create / save rule set'}</h3>
      </div>
      <div style={{ padding: '16px 20px' }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'الرمز' : 'Code'}</Label>
            <Input value={code} onChange={e => setCode(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (EN)'}</Label>
            <Input value={nameEn} onChange={e => setNameEn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'الاسم (عربي)' : 'Name (AR)'}</Label>
            <Input value={nameAr} dir="rtl" onChange={e => setNameAr(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'الجهة القانونية' : 'Legal entity'}</Label>
            <Select value={legalEntityId} onValueChange={v => setLegalEntityId(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_ENTITY}>{locale === 'ar' ? '(عام — ينطبق على جميع الجهات)' : '(global — applies to all entities)'}</SelectItem>
                {entities.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.code} — {e.nameEn}{e.nameAr ? ` · ${e.nameAr}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'نطاق نوع الجهة' : 'Entity-type scope'}</Label>
            <Select value={entityTypeScope} onValueChange={v => setEntityTypeScope(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{locale === 'ar' ? '(أي)' : '(any)'}</SelectItem>
                <SelectItem value="MAINLAND">MAINLAND</SelectItem>
                <SelectItem value="DIFC">DIFC</SelectItem>
                <SelectItem value="ADGM">ADGM</SelectItem>
                <SelectItem value="FREEZONE">FREEZONE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'نطاق الجنسية' : 'Nationality scope'}</Label>
            <Select value={nationalityScope} onValueChange={v => setNationalityScope(v as 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT' | 'ALL')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">ALL</SelectItem>
                <SelectItem value="UAE_NATIONAL">UAE_NATIONAL</SelectItem>
                <SelectItem value="GCC_NATIONAL">GCC_NATIONAL</SelectItem>
                <SelectItem value="EXPAT">EXPAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === 'ar' ? 'نطاق نوع التوظيف' : 'Employment-type scope'}</Label>
            <Select value={employmentTypeScope} onValueChange={v => setEmploymentTypeScope(v as 'FULL_TIME' | 'PART_TIME' | 'ALL')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">ALL</SelectItem>
                <SelectItem value="FULL_TIME">FULL_TIME</SelectItem>
                <SelectItem value="PART_TIME">PART_TIME</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <HijriDatePicker
            label={locale === 'ar' ? 'ساري من' : 'Effective from'}
            value={effectiveFrom}
            onChange={setEffectiveFrom}
          />
          <HijriDatePicker
            label={locale === 'ar' ? 'ساري حتى (فارغ = مفتوح)' : 'Effective to (blank = open-ended)'}
            value={effectiveTo}
            onChange={setEffectiveTo}
          />
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-accent"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
            />
            {locale === 'ar' ? 'تعيين كافتراضي' : 'Mark as default'}
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{locale === 'ar' ? `بنود القواعد (${lines.length})` : `Rule lines (${lines.length})`}</Label>
            <Button variant="outline" type="button" onClick={addLine}>{locale === 'ar' ? '+ إضافة بند' : '+ Add line'}</Button>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-3 rounded-md border border-border bg-card p-3 lg:grid-cols-6">
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs">{locale === 'ar' ? 'نوع الإجازة' : 'Absence type'}</Label>
                <Select value={l.absenceTypeCode} onValueChange={v => updateLine(i, { absenceTypeCode: v as DraftLine['absenceTypeCode'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ABSENCE_TYPES.map(t => (
                      <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 lg:col-span-4">
                <Label className="text-xs">{locale === 'ar' ? 'الشرائح (الصيغة: ' : 'Tiers (format: '}`minMonths-maxMonths:days; …`{locale === 'ar' ? ' — الحد الأقصى الفارغ = مفتوح)' : ' — blank max = open)'}</Label>
                <Textarea
                  rows={1}
                  value={l.tiersText}
                  onChange={e => updateLine(i, { tiersText: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{locale === 'ar' ? 'الحد الأقصى للترحيل' : 'Carry-fwd max'}</Label>
                <Input type="number" value={l.maxCarryForwardDays}
                  onChange={e => updateLine(i, { maxCarryForwardDays: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{locale === 'ar' ? 'انتهاء الترحيل (شهر)' : 'Carry-fwd expiry (m)'}</Label>
                <Input type="number" value={l.carryForwardExpiryMonths}
                  onChange={e => updateLine(i, { carryForwardExpiryMonths: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{locale === 'ar' ? 'أدنى مدة خدمة (شهر)' : 'Min service (m)'}</Label>
                <Input type="number" value={l.minServiceMonths}
                  onChange={e => updateLine(i, { minServiceMonths: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{locale === 'ar' ? 'أقصى أيام / سنة' : 'Max days / yr'}</Label>
                <Input type="number" value={l.maxDaysPerYear ?? ''}
                  onChange={e => updateLine(i, { maxDaysPerYear: e.target.value ? Number(e.target.value) : undefined })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{locale === 'ar' ? 'الاستحقاق' : 'Accrual'}</Label>
                <Select value={l.accrualFrequency} onValueChange={v => updateLine(i, { accrualFrequency: v as DraftLine['accrualFrequency'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">MONTHLY</SelectItem>
                    <SelectItem value="DAILY">DAILY</SelectItem>
                    <SelectItem value="ANNUALLY">ANNUALLY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-3 lg:col-span-6">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-accent"
                    checked={l.isProRated}
                    onChange={e => updateLine(i, { isProRated: e.target.checked })}
                  /> {locale === 'ar' ? 'تناسبي' : 'Pro-rated'}
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-accent"
                    checked={l.encashmentAllowed}
                    onChange={e => updateLine(i, { encashmentAllowed: e.target.checked })}
                  /> {locale === 'ar' ? 'قابل للصرف نقداً' : 'Encashable'}
                </label>
                {l.encashmentAllowed && (
                  <div className="space-y-1">
                    <Label className="text-xs">{locale === 'ar' ? 'أقصى أيام للصرف' : 'Encash max days'}</Label>
                    <Input type="number" value={l.encashmentMaxDays ?? ''}
                      onChange={e => updateLine(i, { encashmentMaxDays: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                )}
                <Button variant="outline" type="button" className="ms-auto" onClick={() => removeLine(i)}>
                  {locale === 'ar' ? 'حذف البند' : 'Remove line'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded border border-accent/30 bg-accent-100 px-3 py-2 text-sm text-accent-700">
            {success}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={pending}>
            {pending ? tk(locale, 'common.saving') : (locale === 'ar' ? 'حفظ مجموعة القواعد' : 'Save rule set')}
          </Button>
        </div>
      </div>
    </div>
  )
}
