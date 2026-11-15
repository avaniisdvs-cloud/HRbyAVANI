'use client'

import { useState, useMemo, useTransition, useCallback, useRef } from 'react'
import { Building2, Clock } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { MdmPageHeader } from '@/components/mdm/MdmPageHeader'
import { MdmFilterBar } from '@/components/mdm/MdmFilterBar'
import { MdmChangeHistory } from '@/components/mdm/MdmChangeHistory'
import { StatusBadge } from '@/components/mdm/StatusBadge'
import { DisableConfirmDialog } from '@/components/mdm/DisableConfirmDialog'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import { LegalEntityDrawer } from './LegalEntityDrawer'
import { disableLegalEntity, enableLegalEntity } from './LegalEntityActions'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'

// ── Types ──────────────────────────────────────────────────────────────────

type LegalEntity = {
  id: string
  entityCode: string
  nameEn: string
  nameAr: string
  tradeLicenceNumber: string | null
  tradeLicenceExpiry: string | null
  registrationNumber: string | null
  entityType: string
  jurisdiction: string
  eosbScheme: string
  wpsEmployerCode: string | null
  mohreEstablishmentId: string | null
  defaultCurrency: string
  defaultLanguage: string
  isActive: boolean
  createdByName: string
  createdDate: Date
  updatedByName: string | null
  lastUpdatedDate: Date | null
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

interface LegalEntityClientProps {
  initialData:  LegalEntity[]
  auditHistory: AuditHistoryEntry[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeDate(date: Date | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  const diffMs  = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)    return 'just now'
  if (diffMin < 60)   return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)     return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30)     return `${diffD}d ago`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  expiry.setHours(0, 0, 0, 0)
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  MAINLAND: 'Mainland',
  DIFC:     'DIFC',
  ADGM:     'ADGM',
  FREEZONE: 'Free Zone',
}

const ENTITY_TYPE_LABELS_AR: Record<string, string> = {
  MAINLAND: 'البر الرئيسي',
  DIFC:     'مركز دبي المالي العالمي',
  ADGM:     'سوق أبوظبي العالمي',
  FREEZONE: 'منطقة حرة',
}

const ENTITY_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  MAINLAND: { bg: 'var(--accent-100)', color: 'var(--brand-active)' },
  DIFC:     { bg: '#E8F5E9',           color: '#2E7D32' },
  ADGM:     { bg: '#E3F2FD',           color: '#1565C0' },
  FREEZONE: { bg: '#FFF3E0',           color: '#E65100' },
}

// ── Component ──────────────────────────────────────────────────────────────

export function LegalEntityClient({ initialData, auditHistory }: LegalEntityClientProps) {
  const locale = useLocale()
  const [records, setRecords]           = useState<LegalEntity[]>(initialData)
  const [search, setSearch]             = useState('')
  const [status, setStatus]             = useState<StatusFilter>('ALL')
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [editEntity, setEditEntity]     = useState<LegalEntity | null>(null)
  const [disableTarget, setDisableTarget] = useState<LegalEntity | null>(null)
  const [enableTarget, setEnableTarget]   = useState<LegalEntity | null>(null)
  const [actionError, setActionError]   = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()
  const [historyRecord, setHistoryRecord] = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)

  const { sort, handleSort } = useTableSort('entityCode', 'asc')

  // ── Column resize ────────────────────────────────────────────────────────

  type ColKey = 'code' | 'nameEn' | 'nameAr' | 'type' | 'jurisdiction' | 'eosb' | 'active' | 'lastUpdated' | 'actions'
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>({
    code: 110, nameEn: 200, nameAr: 200, type: 100,
    jurisdiction: 120, eosb: 90, active: 80, lastUpdated: 120, actions: 252,
  })
  const resizingCol = useRef<ColKey | null>(null)

  const startResize = useCallback((col: ColKey, e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = colWidths[col]
    resizingCol.current = col

    function onMouseMove(ev: MouseEvent) {
      const newW = Math.max(60, startW + ev.clientX - startX)
      setColWidths(prev => ({ ...prev, [col]: newW }))
    }
    function onMouseUp() {
      resizingCol.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [colWidths])

  // ── Filtering ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      const matchesSearch = !q || (
        r.entityCode.toLowerCase().includes(q) ||
        r.nameEn.toLowerCase().includes(q) ||
        r.nameAr.toLowerCase().includes(q) ||
        r.jurisdiction.toLowerCase().includes(q)
      )
      const matchesStatus =
        status === 'ALL' ||
        (status === 'ACTIVE'   &&  r.isActive) ||
        (status === 'INACTIVE' && !r.isActive)
      return matchesSearch && matchesStatus
    })
  }, [records, search, status])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = String((a as Record<string, unknown>)[sort.column!] ?? '')
      const bVal = String((b as Record<string, unknown>)[sort.column!] ?? '')
      const cmp = aVal.localeCompare(bVal, 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  // ── Stats ────────────────────────────────────────────────────────────────

  const totalCount    = records.length
  const activeCount   = records.filter(r =>  r.isActive).length
  const inactiveCount = records.filter(r => !r.isActive).length

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleSaved = useCallback(() => {
    // Trigger a soft-refresh by re-fetching via router or just closing.
    // In a real app, router.refresh() would re-run the server component.
    // For now we patch local state after server revalidation and close.
    setRecords(initialData) // will be refreshed on next server render
  }, [initialData])

  function openCreate() {
    setEditEntity(null)
    setDrawerOpen(true)
  }

  function openEdit(entity: LegalEntity) {
    setEditEntity(entity)
    setDrawerOpen(true)
  }

  function handleDisableConfirm(reason: string) {
    if (!disableTarget) return
    const id = disableTarget.id
    startTransition(async () => {
      const result = await disableLegalEntity(id, reason)
      if (result.success) {
        setRecords(prev => prev.map(r => r.id === id ? { ...r, isActive: false } : r))
        setDisableTarget(null)
      } else {
        setActionError(result.error)
        setDisableTarget(null)
      }
    })
  }

  function handleEnableConfirm() {
    if (!enableTarget) return
    const id = enableTarget.id
    startTransition(async () => {
      const result = await enableLegalEntity(id)
      if (result.success) {
        setRecords(prev => prev.map(r => r.id === id ? { ...r, isActive: true } : r))
        setEnableTarget(null)
      } else {
        setActionError(result.error)
        setEnableTarget(null)
      }
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Action-level error banner */}
      {actionError && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px',
          background: 'var(--status-rejected-bg)',
          borderRadius: 8,
          border: '1px solid var(--status-rejected-dot)',
          fontSize: 'var(--text-body)',
          color: 'var(--status-rejected-fg)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-rejected-fg)', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* 1. Page Header */}
      <MdmPageHeader
        titleEn="Legal Entities"
        titleAr="الكيانات القانونية"
        icon={Building2}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={openCreate}
        newLabel={locale === 'ar' ? 'كيان قانوني جديد' : 'New Legal Entity'}
      />

      {/* 2. Filter Bar */}
      <MdmFilterBar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
      />

      {/* 3. Table */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--card)',
        overflow: 'hidden',
        marginBottom: 0,
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: 'max-content',
            minWidth: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
          }}>
            <colgroup>
              <col style={{ width: colWidths.code }} />
              <col style={{ width: colWidths.nameEn }} />
              <col style={{ width: colWidths.nameAr }} />
              <col style={{ width: colWidths.type }} />
              <col style={{ width: colWidths.jurisdiction }} />
              <col style={{ width: colWidths.eosb }} />
              <col style={{ width: colWidths.active }} />
              <col style={{ width: colWidths.lastUpdated }} />
              <col style={{ width: colWidths.actions }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}         column="entityCode"      activeColumn={sort.column} direction={sort.direction} onSort={handleSort} onResizeStart={e => startResize('code', e)} />
                <SortableHeader label={locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name EN'}      column="nameEn"          activeColumn={sort.column} direction={sort.direction} onSort={handleSort} onResizeStart={e => startResize('nameEn', e)} />
                <SortableHeader label={locale === 'ar' ? 'الاسم (عربي)' : 'Name AR'}      column="nameAr"          activeColumn={sort.column} direction={sort.direction} onSort={handleSort} onResizeStart={e => startResize('nameAr', e)} />
                <SortableHeader label={locale === 'ar' ? 'النوع' : 'Type'}         column="entityType"      activeColumn={sort.column} direction={sort.direction} onSort={handleSort} onResizeStart={e => startResize('type', e)} />
                <SortableHeader label={locale === 'ar' ? 'الاختصاص' : 'Jurisdiction'} column="jurisdiction"    activeColumn={sort.column} direction={sort.direction} onSort={handleSort} onResizeStart={e => startResize('jurisdiction', e)} />
                <SortableHeader label={locale === 'ar' ? 'مكافأة نهاية الخدمة' : 'EOSB'}         column="eosbScheme"      activeColumn={sort.column} direction={sort.direction} onSort={handleSort} onResizeStart={e => startResize('eosb', e)} />
                <SortableHeader label={locale === 'ar' ? 'نشط' : 'Active'}       column="isActive"        activeColumn={sort.column} direction={sort.direction} onSort={handleSort} onResizeStart={e => startResize('active', e)} />
                <SortableHeader label={locale === 'ar' ? 'آخر تحديث' : 'Last Updated'} column="lastUpdatedDate" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} onResizeStart={e => startResize('lastUpdated', e)} />
                <th style={{ position: 'relative', padding: '10px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                  {locale === 'ar' ? 'الإجراءات' : 'Actions'}
                  <div
                    onMouseDown={e => startResize('actions', e)}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 1 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-200)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      textAlign: 'center',
                      padding: '48px 24px',
                      fontSize: 14,
                      color: 'var(--ink-3)',
                    }}
                  >
                    {locale === 'ar' ? 'لم يتم تكوين أي كيانات قانونية بعد' : 'No legal entities configured yet'}
                  </td>
                </tr>
              ) : (
                sorted.map(entity => {
                  const expiryDays    = daysUntilExpiry(entity.tradeLicenceExpiry)
                  const nearExpiry    = expiryDays !== null && expiryDays < 60
                  const typeColors    = ENTITY_TYPE_COLORS[entity.entityType] ?? { bg: 'var(--surface)', color: 'var(--ink-3)' }
                  const displayDate   = entity.lastUpdatedDate ?? entity.createdDate
                  const tooltipText   = [
                    `Created by ${entity.createdByName} on ${formatDate(entity.createdDate)}`,
                    entity.updatedByName
                      ? `Last updated by ${entity.updatedByName} on ${formatDate(entity.lastUpdatedDate)}`
                      : null,
                  ].filter(Boolean).join('\n')

                  return (
                    <tr
                      key={entity.id}
                      title={tooltipText}
                      style={{
                        height: 48,
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                    >
                      {/* CODE */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {nearExpiry && (
                            <span
                              title={`Trade licence expires in ${expiryDays} days`}
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: 'var(--status-warning)',
                                flexShrink: 0,
                                display: 'inline-block',
                              }}
                            />
                          )}
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            fontSize: 'var(--text-body)',
                            color: 'var(--ink-1)',
                          }}>
                            {entity.entityCode}
                          </span>
                        </div>
                      </td>

                      {/* NAME EN */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }}>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 500,
                          fontSize: 'var(--text-body)',
                          color: 'var(--ink-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                          maxWidth: '100%',
                        }}>
                          {entity.nameEn}
                        </span>
                      </td>

                      {/* NAME AR */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }} dir="rtl">
                        <span style={{
                          fontSize: 'var(--text-body)',
                          color: 'var(--ink-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                          maxWidth: '100%',
                        }}>
                          {entity.nameAr}
                        </span>
                      </td>

                      {/* TYPE */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 'var(--text-caption)',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                          background: typeColors.bg,
                          color: typeColors.color,
                          whiteSpace: 'nowrap',
                        }}>
                          {(locale === 'ar' ? ENTITY_TYPE_LABELS_AR[entity.entityType] : ENTITY_TYPE_LABELS[entity.entityType]) ?? entity.entityType}
                        </span>
                      </td>

                      {/* JURISDICTION */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                          {entity.jurisdiction}
                        </span>
                      </td>

                      {/* EOSB */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                          {entity.eosbScheme}
                        </span>
                      </td>

                      {/* ACTIVE */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }}>
                        <StatusBadge active={entity.isActive} />
                      </td>

                      {/* LAST UPDATED */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                          {formatRelativeDate(displayDate)}
                        </span>
                      </td>

                      {/* ACTIONS */}
                      <td style={{ padding: '0 12px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            onClick={() => openEdit(entity)}
                            style={{
                              height: 30,
                              padding: '0 10px',
                              border: '1.5px solid var(--border)',
                              borderRadius: 6,
                              background: 'transparent',
                              color: 'var(--ink-2)',
                              fontSize: 'var(--text-caption)',
                              fontWeight: 500,
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            {tk(locale, 'common.edit')}
                          </button>
                          <button
                            onClick={() => setHistoryRecord({ id: entity.id, nameEn: entity.nameEn, nameAr: entity.nameAr })}
                            style={{
                              height: 30,
                              padding: '0 10px',
                              border: '1.5px solid var(--border)',
                              borderRadius: 6,
                              background: 'transparent',
                              color: 'var(--ink-2)',
                              fontSize: 'var(--text-caption)',
                              fontWeight: 500,
                              cursor: 'pointer',
                              flexShrink: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Clock size={12} /> {locale === 'ar' ? 'السجل' : 'History'}
                          </button>

                          {entity.isActive ? (
                            <button
                              onClick={() => setDisableTarget(entity)}
                              disabled={isPending}
                              style={{
                                height: 30,
                                padding: '0 10px',
                                border: '1.5px solid #E57373',
                                borderRadius: 6,
                                background: 'transparent',
                                color: '#C62828',
                                fontSize: 'var(--text-caption)',
                                fontWeight: 500,
                                cursor: isPending ? 'not-allowed' : 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              {locale === 'ar' ? 'تعطيل' : 'Disable'}
                            </button>
                          ) : (
                            <button
                              onClick={() => setEnableTarget(entity)}
                              disabled={isPending}
                              style={{
                                height: 30,
                                padding: '0 10px',
                                border: '1.5px solid var(--accent)',
                                borderRadius: 6,
                                background: 'transparent',
                                color: 'var(--brand-active)',
                                fontSize: 'var(--text-caption)',
                                fontWeight: 500,
                                cursor: isPending ? 'not-allowed' : 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              {locale === 'ar' ? 'تفعيل' : 'Enable'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Drawer */}
      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="legal_entities"
      />

      {/* 4. Change History */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="legal_entities"
        initialCollapsed
      />

      {/* 5. Drawer */}
      <LegalEntityDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entity={editEntity}
        onSaved={handleSaved}
      />

      {/* 6. Disable dialog */}
      <DisableConfirmDialog
        open={Boolean(disableTarget)}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleDisableConfirm}
        entityName={disableTarget ? `${disableTarget.entityCode} — ${disableTarget.nameEn}` : ''}
        warningMessage={locale === 'ar' ? 'لن يتأثر الموظفون النشطون والإعدادات المعيّنة على هذا الكيان، ولكن لا يمكن إنشاء تعيينات جديدة.' : 'Active employees and configurations assigned to this entity will be unaffected, but no new assignments may be created.'}
        isPending={isPending}
      />

      {/* 7. Enable confirmation */}
      {enableTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            onClick={() => setEnableTarget(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
          />
          <div style={{
            position: 'relative',
            width: 400,
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--card)',
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            padding: '24px',
            border: '1px solid var(--border)',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 17,
              fontWeight: 500,
              color: 'var(--ink-1)',
              margin: '0 0 8px',
            }}>
              {locale === 'ar' ? 'إعادة تفعيل الكيان القانوني' : 'Re-enable Legal Entity'}
            </h3>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '0 0 20px' }}>
              {locale === 'ar' ? 'سيؤدي هذا إلى إعادة تفعيل ' : 'This will reactivate '}
              <strong style={{ color: 'var(--ink-2)' }}>
                {enableTarget.entityCode} — {enableTarget.nameEn}
              </strong>.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEnableTarget(null)}
                disabled={isPending}
                style={{
                  height: 36, padding: '0 16px',
                  border: '1.5px solid var(--border)',
                  borderRadius: 10,
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  fontSize: 'var(--text-body)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {tk(locale, 'common.cancel')}
              </button>
              <button
                onClick={handleEnableConfirm}
                disabled={isPending}
                style={{
                  height: 36, padding: '0 16px',
                  border: 'none',
                  borderRadius: 10,
                  background: isPending ? 'var(--border)' : 'var(--accent)',
                  color: isPending ? 'var(--ink-4)' : '#fff',
                  fontSize: 'var(--text-body)',
                  fontWeight: 600,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? (locale === 'ar' ? 'جارٍ التفعيل…' : 'Enabling…') : (locale === 'ar' ? 'تفعيل' : 'Enable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
