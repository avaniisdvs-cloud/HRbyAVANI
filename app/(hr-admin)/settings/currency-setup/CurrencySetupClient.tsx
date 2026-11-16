'use client'

import { PageTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toUserMessage } from '@/lib/app-error'
import {
  createCompanyCurrencySetting,
  updateCompanyCurrencySetting,
  deactivateCompanyCurrencySetting,
} from '@/modules/config'
import type { CurrencySettingRow, CreateCurrencySettingInput } from '@/modules/config'
import { Coins, Plus, Pencil, PowerOff, Search } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { CurrencySetupDrawer } from './CurrencySetupDrawer'

interface LegalEntityOption {
  id:     string
  nameEn: string
  nameAr: string
}

interface Props {
  settings:      CurrencySettingRow[]
  legalEntities: LegalEntityOption[]
  role:          string
}

const ROUNDING_LABELS: Record<string, string> = {
  HALF_UP:   'Half Up',
  HALF_EVEN: "Half Even (Banker's)",
  FLOOR:     'Floor',
  CEIL:      'Ceiling',
  TRUNCATE:  'Truncate',
}

const ROUNDING_LABELS_AR: Record<string, string> = {
  HALF_UP:   'تقريب لأعلى',
  HALF_EVEN: 'تقريب مصرفي',
  FLOOR:     'تقريب لأسفل',
  CEIL:      'تقريب للأعلى',
  TRUNCATE:  'اقتطاع',
}

export function CurrencySetupClient({ settings: initial, legalEntities, role }: Props) {
  const locale = useLocale()
  const [settings, setSettings]         = useState<CurrencySettingRow[]>(initial)
  const [search, setSearch]             = useState('')
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [editing, setEditing]           = useState<CurrencySettingRow | null>(null)
  const [pageError, setPageError]       = useState('')
  const [pageSuccess, setPageSuccess]   = useState('')
  const [drawerError, setDrawerError]   = useState('')
  // Separate pending states so deactivating one row doesn't freeze the drawer
  const [isPendingDeactivate, startDeactivate] = useTransition()

  const canEdit = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(role)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return settings
    return settings.filter(s =>
      s.legalEntityName.toLowerCase().includes(q) ||
      s.currencyCode.toLowerCase().includes(q) ||
      s.currencyNameEn.toLowerCase().includes(q),
    )
  }, [settings, search])

  function openCreate() {
    setEditing(null)
    setDrawerError('')
    setPageError('')
    setPageSuccess('')
    setDrawerOpen(true)
  }

  function openEdit(row: CurrencySettingRow) {
    setEditing(row)
    setDrawerError('')
    setPageError('')
    setPageSuccess('')
    setDrawerOpen(true)
  }

  function handleClose() {
    setDrawerOpen(false)
    setDrawerError('')
  }

  function handleDeactivate(row: CurrencySettingRow) {
    // Warn if this is the last active config for the entity
    const activeForEntity = settings.filter(
      s => s.legalEntityId === row.legalEntityId && s.isActive,
    )
    const isLast = activeForEntity.length === 1

    const msg = isLast
      ? (locale === 'ar'
          ? `هذه هي العملة النشطة الوحيدة لـ "${row.legalEntityName}". إلغاء تفعيلها يعني عدم وجود أي تهيئة عملة نشطة وستعود الرواتب إلى الافتراضي (درهم إماراتي). هل تريد المتابعة؟`
          : `This is the only active currency for "${row.legalEntityName}". Deactivating it means no active currency config will exist and payroll will fall back to the AED default. Proceed?`)
      : (locale === 'ar' ? 'إلغاء تفعيل تهيئة العملة هذه؟' : 'Deactivate this currency configuration?')

    if (!confirm(msg)) return

    setPageError('')
    setPageSuccess('')
    startDeactivate(async () => {
      try {
        await deactivateCompanyCurrencySetting(row.id)
        setSettings(prev =>
          prev.map(s => s.id === row.id ? { ...s, isActive: false } : s),
        )
        setPageSuccess(locale === 'ar' ? 'تم إلغاء تفعيل تهيئة العملة.' : 'Currency configuration deactivated.')
      } catch (e) {
        setPageError(toUserMessage(e))
      }
    })
  }

  async function handleSave(input: CreateCurrencySettingInput) {
    setDrawerError('')
    setPageSuccess('')
    try {
      if (editing) {
        await updateCompanyCurrencySetting({ id: editing.id, ...input })
        setSettings(prev =>
          prev.map(s =>
            s.id === editing.id
              ? {
                  ...s,
                  ...input,
                  effectiveTo:     input.effectiveTo ?? null,
                  legalEntityName: legalEntities.find(e => e.id === input.legalEntityId)?.nameEn ?? s.legalEntityName,
                }
              : s,
          ),
        )
        setPageSuccess(locale === 'ar' ? 'تم تحديث تهيئة العملة.' : 'Currency configuration updated.')
      } else {
        const { id } = await createCompanyCurrencySetting(input)
        const entityName = legalEntities.find(e => e.id === input.legalEntityId)?.nameEn ?? input.legalEntityId
        const newRow: CurrencySettingRow = {
          id,
          ...input,
          effectiveTo:     input.effectiveTo ?? null,
          legalEntityName: entityName,
          isActive:        true,
          createdByName:   '',
          createdDate:     new Date().toISOString(),
          updatedByName:   null,
          lastUpdatedDate: null,
        }
        // Insert in order matching server sort: active first, then by effectiveFrom desc
        setSettings(prev => {
          const updated = [newRow, ...prev]
          return updated.sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
            return b.effectiveFrom.localeCompare(a.effectiveFrom)
          })
        })
        setPageSuccess(locale === 'ar' ? 'تم إنشاء تهيئة العملة.' : 'Currency configuration created.')
      }
      setDrawerOpen(false)
    } catch (e) {
      // Error stays in drawer only — don't set pageError here
      setDrawerError(toUserMessage(e))
    }
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Coins size={20} style={{ color: 'var(--brand-active)' }} />
          </div>
          <div>
            <PageTitle style={{
              fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700,
              color: 'var(--ink-1)', margin: 0, lineHeight: 1.2,
            }}>
              {locale === 'ar' ? 'إعداد عملة الشركة' : 'Company Currency Setup'}
            </PageTitle>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '4px 0 0', fontFamily: 'var(--font-sans)' }}>
              {locale === 'ar' ? 'تهيئة دقة العملة لكل كيان قانوني' : 'Configure currency precision per legal entity'}
            </p>
          </div>
        </div>

        {canEdit && (
          <Button onClick={openCreate} size="sm" style={{ gap: 6 }}>
            <Plus size={14} />
            {locale === 'ar' ? 'إضافة إعداد عملة' : 'Add Currency Setup'}
          </Button>
        )}
      </div>

      {/* ── Feedback banners ────────────────────────────────────────────── */}
      {pageError && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: 'color-mix(in srgb, #EF4444 10%, transparent)',
          border: '1px solid color-mix(in srgb, #EF4444 30%, transparent)',
          color: '#B91C1C', fontSize: 'var(--text-body)',
        }}>
          {pageError}
        </div>
      )}
      {pageSuccess && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: 'color-mix(in srgb, #10B981 10%, transparent)',
          border: '1px solid color-mix(in srgb, #10B981 30%, transparent)',
          color: '#065F46', fontSize: 'var(--text-body)',
        }}>
          {pageSuccess}
        </div>
      )}

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 340 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
        <Input
          placeholder={locale === 'ar' ? 'البحث بالشركة أو العملة…' : 'Search by company or currency…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: 32, height: 34, fontSize: 'var(--text-body)' }}
        />
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 10,
        background: 'var(--card)', overflow: 'hidden',
      }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
          <thead>
            <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              {(locale === 'ar'
                ? ['الشركة', 'العملة', 'الرمز', 'المنازل العشرية', 'التقريب', 'ساري من', 'ساري حتى', 'الحالة', 'الإجراءات']
                : ['Company', 'Currency', 'Symbol', 'Decimals', 'Rounding', 'Effective From', 'Effective To', 'Status', 'Actions']
              ).map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left',
                  fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--ink-3)',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
                  {search
                    ? (locale === 'ar' ? 'لا توجد نتائج تطابق بحثك.' : 'No results match your search.')
                    : (locale === 'ar' ? 'لا توجد تهيئات عملة بعد. انقر على "إضافة إعداد عملة" لإنشاء واحدة.' : 'No currency configurations yet. Click "Add Currency Setup" to create one.')}
                </td>
              </tr>
            )}
            {filtered.map((row, idx) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  background: row.isActive ? 'transparent' : 'color-mix(in srgb, var(--surface) 60%, transparent)',
                  opacity: row.isActive ? 1 : 0.7,
                }}
              >
                <td style={{ padding: '12px 14px', color: 'var(--ink-1)', fontWeight: 500 }}>
                  {row.legalEntityName}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', fontWeight: 600, fontSize: 'var(--text-caption)' }}>
                    {row.currencyCode}
                  </span>
                  <span style={{ color: 'var(--ink-3)', marginLeft: 6, fontSize: 'var(--text-caption)' }}>
                    {row.currencyNameEn}
                  </span>
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                  {row.currencySymbol}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', fontWeight: 600 }}>
                  {row.decimalPlaces}
                </td>
                <td style={{ padding: '12px 14px', color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                  {(locale === 'ar' ? ROUNDING_LABELS_AR[row.roundingMethod] : ROUNDING_LABELS[row.roundingMethod]) ?? row.roundingMethod}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                  {row.effectiveFrom}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                  {row.effectiveTo ?? <span style={{ color: 'var(--ink-4)' }}>{locale === 'ar' ? 'مفتوح' : 'Open'}</span>}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <Badge
                    variant={row.isActive ? 'default' : 'secondary'}
                    style={{
                      fontSize: 'var(--text-caption)', fontWeight: 600,
                      background: row.isActive
                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                        : 'var(--surface)',
                      color: row.isActive ? 'var(--brand-active)' : 'var(--ink-3)',
                      border: row.isActive
                        ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
                        : '1px solid var(--border)',
                    }}
                  >
                    {row.isActive ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'غير نشط' : 'Inactive')}
                  </Badge>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  {canEdit && row.isActive && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(row)}
                        title={locale === 'ar' ? 'تعديل' : 'Edit'}
                        style={{ height: 28, width: 28, padding: 0 }}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivate(row)}
                        disabled={isPendingDeactivate}
                        title={locale === 'ar' ? 'إلغاء التفعيل' : 'Deactivate'}
                        style={{ height: 28, width: 28, padding: 0, color: 'var(--ink-3)' }}
                      >
                        <PowerOff size={13} />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {/* ── Summary footer ──────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <p style={{ marginTop: 12, fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-sans)' }}>
          {locale === 'ar' ? (
            <>
              {filtered.length} تهيئة
              {search ? ` مطابقة لـ "${search}"` : ''}
              {' · '}
              {settings.filter(s => s.isActive).length} نشطة
            </>
          ) : (
            <>
              {filtered.length} configuration{filtered.length !== 1 ? 's' : ''}
              {search ? ` matching "${search}"` : ''}
              {' · '}
              {settings.filter(s => s.isActive).length} active
            </>
          )}
        </p>
      )}

      {/* ── Drawer ─────────────────────────────────────────────────────── */}
      <CurrencySetupDrawer
        open={drawerOpen}
        onClose={handleClose}
        onSave={handleSave}
        editing={editing}
        legalEntities={legalEntities}
        error={drawerError}
      />
    </div>
  )
}
