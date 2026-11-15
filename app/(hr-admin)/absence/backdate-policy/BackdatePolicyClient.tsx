'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { upsertBackdatePolicy } from '@/modules/absence'
import type { BackdatePolicyRow } from '@/modules/absence'
import { type Locale } from '@/lib/i18n'

interface EntityRow { id: string; nameEn: string; nameAr: string | null }
interface TypeRow   { id: string; typeCode: string; typeNameEn: string; typeNameAr: string | null }

interface Props {
  entities:             EntityRow[]
  absenceTypes:         TypeRow[]
  existingPolicies:     BackdatePolicyRow[]
  selectedEntityId:     string
  isSuperAdmin:         boolean
  currentLegalEntityId: string
  locale?:              Locale
}

type RowState = {
  backdatingEnabled: boolean
  backdateLimitDays: string   // controlled input string; '' = null
  saving:            boolean
  saved:             boolean
  error:             string | null
}

export function BackdatePolicyClient({
  entities, absenceTypes, existingPolicies,
  selectedEntityId, isSuperAdmin, locale = 'en',
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Build initial row state from existingPolicies
  const initState = (): Record<string, RowState> => {
    const map: Record<string, RowState> = {}
    for (const t of absenceTypes) {
      const existing = existingPolicies.find(p => p.absenceTypeId === t.id)
      map[t.id] = {
        backdatingEnabled: existing?.backdatingEnabled ?? true,
        backdateLimitDays: existing
          ? (existing.backdateLimitDays !== null && existing.backdateLimitDays !== undefined
              ? String(existing.backdateLimitDays)
              : '')
          : '',
        saving: false,
        saved:  false,
        error:  null,
      }
    }
    return map
  }

  const [rows, setRows] = useState<Record<string, RowState>>(initState)

  function updateRow(typeId: string, patch: Partial<RowState>) {
    setRows(prev => ({ ...prev, [typeId]: { ...prev[typeId], ...patch, saved: false } }))
  }

  function handleSave(typeId: string) {
    const row = rows[typeId]
    if (!row || !selectedEntityId) return

    const limitStr = row.backdateLimitDays.trim()
    const limitDays = limitStr === '' ? null : parseInt(limitStr, 10)

    if (limitStr !== '' && (isNaN(limitDays!) || limitDays! < 0)) {
      updateRow(typeId, { error: locale === 'ar' ? 'يجب أن يكون الحد الأقصى للأيام رقماً صحيحاً غير سالب.' : 'Max days must be a non-negative whole number.' })
      return
    }

    updateRow(typeId, { saving: true, error: null })
    startTransition(async () => {
      try {
        await upsertBackdatePolicy({
          legalEntityId:     selectedEntityId,
          absenceTypeId:     typeId,
          backdatingEnabled: row.backdatingEnabled,
          backdateLimitDays: limitDays,
        })
        setRows(prev => ({
          ...prev,
          [typeId]: { ...prev[typeId], saving: false, saved: true, error: null },
        }))
      } catch (e) {
        setRows(prev => ({
          ...prev,
          [typeId]: {
            ...prev[typeId],
            saving: false,
            error: e instanceof Error ? e.message : (locale === 'ar' ? 'فشل الحفظ. يرجى المحاولة مرة أخرى.' : 'Failed to save. Please try again.'),
          },
        }))
      }
    })
  }

  const selectedEntity = entities.find(e => e.id === selectedEntityId)

  return (
    <div>
      {/* ── Industry defaults info banner ── */}
      <div style={{
        padding: '12px 16px', background: 'rgba(46,97,112,0.06)',
        border: '1px solid var(--accent-200)', borderRadius: 8, marginBottom: 20,
        fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.6,
      }}>
        {locale === 'ar' ? (
          <>
            <strong style={{ color: 'var(--ink-1)' }}>كيف يعمل هذا:</strong>{' '}
            <strong style={{ color: 'var(--brand-active)' }}>في حال عدم حفظ سياسة لنوع إجازة، يُمنع الإدخال بأثر رجعي افتراضياً.</strong>{' '}
            يجب حفظ صف بحالة <strong>الإدخال بأثر رجعي = مفعّل</strong> للسماح بأي إدخالات بتاريخ سابق.
            تعيين <strong>الحد الأقصى للأيام = 0</strong> يعني السماح بتاريخ اليوم أو التواريخ المستقبلية فقط.
            تعيين <strong>الإدخال بأثر رجعي = معطّل</strong> يمنع جميع الطلبات بأثر رجعي لهذا النوع.
            اترك <strong>الحد الأقصى للأيام</strong> فارغاً للسماح بتواريخ سابقة غير محدودة (عند تفعيل الإدخال بأثر رجعي).
            <br />
            <span style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>
              الإعدادات الافتراضية للقطاع: الإجازة السنوية = 30 يوماً · الإجازة المرضية = 10 أيام · إجازة الدراسة = 7 أيام · إجازة الأمومة/الأبوة = بلا حد
            </span>
          </>
        ) : (
          <>
            <strong style={{ color: 'var(--ink-1)' }}>How this works:</strong>{' '}
            <strong style={{ color: 'var(--brand-active)' }}>If no policy is saved for a leave type, backdating is BLOCKED by default.</strong>{' '}
            You must save a row with <strong>Backdating = On</strong> to permit any past-date entries.
            Setting <strong>Max Days = 0</strong> means only today or future dates are allowed.
            Setting <strong>Backdating = Off</strong> blocks all backdated requests for that type.
            Leave <strong>Max Days</strong> blank to allow unlimited past dates (when backdating is enabled).
            <br />
            <span style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>
              Industry defaults: Annual Leave = 30 days · Sick Leave = 10 days · Study Leave = 7 days · Maternity/Paternity = No limit
            </span>
          </>
        )}
      </div>

      {/* ── Entity selector (SUPER_ADMIN only) ── */}
      {isSuperAdmin && entities.length > 1 && (
        <div style={{ marginBottom: 20, maxWidth: 360 }}>
          <Label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'}
          </Label>
          <Select
            value={selectedEntityId}
            onValueChange={(v: string) => router.replace(`/absence/backdate-policy?entity=${v}`)}
          >
            <SelectTrigger aria-label={locale === 'ar' ? 'الكيان القانوني' : 'Legal entity'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entities.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nameEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Entity name (non-super-admin) ── */}
      {!isSuperAdmin && selectedEntity && (
        <div style={{
          fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
          marginBottom: 16, padding: '8px 12px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, display: 'inline-block',
        }}>
          {selectedEntity.nameEn}
          {selectedEntity.nameAr && (
            <span style={{ marginLeft: 8, color: 'var(--ink-3)', fontWeight: 400 }}>
              {selectedEntity.nameAr}
            </span>
          )}
        </div>
      )}

      {/* ── Policy table ── */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 10, overflow: 'hidden',
      }}>
        {/* Table header */}
        <div data-responsive-grid="true" style={{
          display: 'grid',
          gridTemplateColumns: '2fr 140px 160px 120px 110px',
          gap: 12, padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          <span>{locale === 'ar' ? 'نوع الإجازة' : 'Leave Type'}</span>
          <span>{locale === 'ar' ? 'الإدخال بأثر رجعي' : 'Backdating'}</span>
          <span>{locale === 'ar' ? 'الحد الأقصى' : 'Max Days'}</span>
          <span>{locale === 'ar' ? 'الحالة' : 'Status'}</span>
          <span></span>
        </div>

        {absenceTypes.length === 0 && (
          <div style={{ padding: 24, color: 'var(--ink-3)', fontSize: 'var(--text-body)', textAlign: 'center' }}>
            {locale === 'ar' ? 'لا توجد أنواع إجازات نشطة لهذا الكيان.' : 'No active leave types found for this entity.'}
          </div>
        )}

        {absenceTypes.map((t, idx) => {
          const row       = rows[t.id]
          const hasPolicy = existingPolicies.some(p => p.absenceTypeId === t.id)
          if (!row) return null

          const statusLabel = !hasPolicy
            ? (locale === 'ar' ? 'غير مهيأة' : 'Not configured')
            : row.backdatingEnabled ? (locale === 'ar' ? 'نشطة' : 'Active') : (locale === 'ar' ? 'معطّلة' : 'Disabled')
          const statusColor = !hasPolicy
            ? 'var(--ink-4)'
            : row.backdatingEnabled ? '#16a34a' : '#dc2626'
          const statusBg = !hasPolicy
            ? 'var(--surface)'
            : row.backdatingEnabled ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)'

          return (
            <div
              data-responsive-grid="true" key={t.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 140px 160px 120px 110px',
                gap: 12, padding: '12px 16px', alignItems: 'center',
                borderBottom: idx < absenceTypes.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              {/* Leave type name */}
              <div>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-1)' }}>
                  {t.typeNameEn}
                </span>
                {t.typeNameAr && (
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginLeft: 6 }} dir="rtl" lang="ar">
                    {t.typeNameAr}
                  </span>
                )}
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
                  {t.typeCode}
                </span>
              </div>

              {/* Backdating toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.backdatingEnabled}
                  aria-label={locale === 'ar' ? `تفعيل الإدخال بأثر رجعي لـ ${t.typeNameEn}` : `Enable backdating for ${t.typeNameEn}`}
                  onClick={() => updateRow(t.id, { backdatingEnabled: !row.backdatingEnabled })}
                  style={{
                    display: 'inline-flex', alignItems: 'center', cursor: 'pointer',
                    width: 36, height: 20, borderRadius: 999, border: 'none', padding: '2px',
                    background: row.backdatingEnabled ? 'var(--accent)' : 'var(--border)',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{
                    display: 'block', width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transform: row.backdatingEnabled ? 'translateX(16px)' : 'translateX(0)',
                    transition: 'transform 0.15s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
                <span style={{ fontSize: 'var(--text-caption)', color: row.backdatingEnabled ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                  {row.backdatingEnabled ? (locale === 'ar' ? 'مسموح' : 'Allowed') : (locale === 'ar' ? 'محظور' : 'Blocked')}
                </span>
              </div>

              {/* Max days input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={row.backdateLimitDays}
                  onChange={e => updateRow(t.id, { backdateLimitDays: e.target.value })}
                  placeholder={locale === 'ar' ? 'بلا حد' : 'No limit'}
                  disabled={!row.backdatingEnabled}
                  style={{ width: 90, fontSize: 'var(--text-body)' }}
                  aria-label={locale === 'ar' ? `الحد الأقصى لأيام الأثر الرجعي لـ ${t.typeNameEn}` : `Max backdate days for ${t.typeNameEn}`}
                />
                {row.backdatingEnabled && (
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>{locale === 'ar' ? 'يوم' : 'days'}</span>
                )}
              </div>

              {/* Status badge */}
              <div>
                <span style={{
                  fontSize: 'var(--text-caption)', fontWeight: 600, padding: '3px 8px',
                  borderRadius: 20, color: statusColor, background: statusBg,
                  whiteSpace: 'nowrap',
                }}>
                  {statusLabel}
                </span>
              </div>

              {/* Save button + feedback */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSave(t.id)}
                  disabled={row.saving}
                  style={{ fontSize: 'var(--text-caption)', height: 30, padding: '0 12px' }}
                >
                  {row.saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ' : 'Save')}
                </Button>
                {row.saved && (
                  <span style={{ fontSize: 'var(--text-caption)', color: '#16a34a' }}>{locale === 'ar' ? 'تم الحفظ ✓' : 'Saved ✓'}</span>
                )}
                {row.error && (
                  <span style={{ fontSize: 'var(--text-caption)', color: '#dc2626', maxWidth: 120, textAlign: 'right' }}>
                    {row.error}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Arabic note */}
      <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 12 }} dir="rtl" lang="ar">
        ملاحظة: في حال عدم وجود سياسة محددة لنوع الإجازة، يُسمح بأي تاريخ سابق بدون قيود.
      </p>
    </div>
  )
}
