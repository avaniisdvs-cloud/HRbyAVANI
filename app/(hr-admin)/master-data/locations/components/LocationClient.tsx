'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { MdmPageHeader } from '@/components/mdm/MdmPageHeader'
import { MdmFilterBar } from '@/components/mdm/MdmFilterBar'
import { MdmChangeHistory } from '@/components/mdm/MdmChangeHistory'
import { StatusBadge } from '@/components/mdm/StatusBadge'
import { DisableConfirmDialog } from '@/components/mdm/DisableConfirmDialog'
import { MdmRowMenu } from '@/components/mdm/MdmRowMenu'
import { LocationDrawer } from './LocationDrawer'
import { disableLocation, enableLocation } from './LocationActions'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import type { Location } from '@/drizzle/schema'

// ── Types ──────────────────────────────────────────────────────────────────

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface LocationClientProps {
  initialData:   Location[]
  auditHistory:  AuditHistoryEntry[]
  legalEntities: LegalEntityOption[]
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

// ── LocationClient ─────────────────────────────────────────────────────────

export function LocationClient({ initialData, auditHistory, legalEntities }: LocationClientProps) {
  const locale = useLocale()
  const [data,        setData]        = useState<Location[]>(initialData)
  const [search,      setSearch]      = useState('')
  const [status,      setStatus]      = useState<StatusFilter>('ALL')
  const [entityId,    setEntityId]    = useState('')
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [editRow,     setEditRow]     = useState<Location | null>(null)
  const [disableRow,    setDisableRow]    = useState<Location | null>(null)
  const [historyRecord, setHistoryRecord] = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [toastMsg,      setToastMsg]      = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const router = useRouter()

  const { sort, handleSort } = useTableSort('code', 'asc')

  // Sync server-fetched data into local state after router.refresh()
  useEffect(() => { setData(initialData) }, [initialData])

  // ── Entity name lookup map ─────────────────────────────────────────────
  const entityMap = useMemo(() => {
    const m = new Map<string, string>()
    legalEntities.forEach(le => m.set(le.id, le.nameEn))
    return m
  }, [legalEntities])

  // ── Filtered rows ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(row => {
      if (status === 'ACTIVE'   && !row.isActive) return false
      if (status === 'INACTIVE' &&  row.isActive) return false
      if (entityId && row.legalEntityId !== entityId) return false
      if (q && ![
        row.code,
        row.nameEn,
        row.nameAr ?? '',
        row.city ?? '',
        row.emirate ?? '',
        row.country,
      ].some(v => v.toLowerCase().includes(q))) return false
      return true
    })
  }, [data, search, status, entityId])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      let aVal: string
      let bVal: string
      if (sort.column === 'entityName') {
        aVal = entityMap.get(a.legalEntityId) ?? ''
        bVal = entityMap.get(b.legalEntityId) ?? ''
      } else {
        aVal = String((a as Record<string, unknown>)[sort.column!] ?? '')
        bVal = String((b as Record<string, unknown>)[sort.column!] ?? '')
      }
      const cmp = aVal.localeCompare(bVal, 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort, entityMap])

  // ── Counts ─────────────────────────────────────────────────────────────
  const totalCount    = data.length
  const activeCount   = data.filter(r => r.isActive).length
  const inactiveCount = data.filter(r => !r.isActive).length

  // ── Toast helper ───────────────────────────────────────────────────────
  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastMsg(msg)
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
  }

  // ── Handlers ───────────────────────────────────────────────────────────
  function handleNew() {
    setEditRow(null)
    setDrawerOpen(true)
  }

  function handleEdit(row: Location) {
    setEditRow(row)
    setDrawerOpen(true)
  }

  function handleDisableRequest(row: Location) {
    setDisableRow(row)
  }

  function handleEnable(row: Location) {
    startTransition(async () => {
      const result = await enableLocation(row.id)
      if (result.success) {
        setData(prev => prev.map(r => r.id === row.id ? { ...r, isActive: true } : r))
        showToast(locale === 'ar' ? `تم تفعيل الموقع ${row.code}.` : `Location ${row.code} re-enabled.`)
      }
    })
  }

  function handleConfirmDisable(reason: string) {
    if (!disableRow) return
    startTransition(async () => {
      const result = await disableLocation(disableRow.id, reason)
      if (result.success) {
        setData(prev => prev.map(r => r.id === disableRow.id ? { ...r, isActive: false } : r))
        showToast(locale === 'ar' ? `تم تعطيل الموقع ${disableRow.code}.` : `Location ${disableRow.code} disabled.`)
      }
      setDisableRow(null)
    })
  }

  function handleDrawerSuccess() {
    showToast(editRow ? (locale === 'ar' ? 'تم تحديث الموقع.' : 'Location updated.') : (locale === 'ar' ? 'تم إنشاء الموقع.' : 'Location created.'))
    router.refresh()
  }

  return (
    <div>
      {/* Header */}
      <MdmPageHeader
        titleEn="Locations"
        titleAr="المواقع"
        icon={MapPin}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={handleNew}
        newLabel={locale === 'ar' ? 'موقع جديد' : 'New Location'}
      />

      {/* Filter bar */}
      <MdmFilterBar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        entityId={entityId}
        entities={legalEntities}
        onEntityChange={setEntityId}
      />

      {/* Table */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--card)',
      }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 150 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 215 }} />
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}     column="code"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name EN'}  column="nameEn"     activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الإمارة' : 'Emirate'}  column="emirate"    activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'المدينة' : 'City'}     column="city"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الكيان' : 'Entity'}   column="entityName" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'المنطقة الزمنية' : 'Timezone'} column="timezone"   activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}   column="isActive"   activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 14 }}>
                  {data.length === 0
                    ? (locale === 'ar' ? 'لا توجد مواقع بعد. أنشئ الموقع الأول.' : 'No locations yet. Create the first one.')
                    : (locale === 'ar' ? 'لا توجد مواقع تطابق عوامل التصفية الحالية.' : 'No locations match the current filters.')}
                </td>
              </tr>
            ) : (
              sorted.map(row => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    opacity: row.isActive ? 1 : 0.6,
                  }}
                >
                  {/* Code */}
                  <td style={{ padding: '14px 8px', verticalAlign: 'middle' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-caption)',
                      fontWeight: 700,
                      color: 'var(--brand-active)',
                      background: 'var(--accent-100)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}>
                      {row.code}
                    </span>
                  </td>

                  {/* Name EN */}
                  <td style={{ padding: '14px 8px', verticalAlign: 'middle' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-1)' }}>
                      {row.nameEn}
                    </div>
                    {row.nameAr && (
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', marginTop: 2 }}>
                        {row.nameAr}
                      </div>
                    )}
                    {row.country !== 'ARE' && (
                      <span style={{
                        fontSize: 'var(--text-caption)', fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.04em', color: '#795548',
                        background: '#FFF8E1', border: '1px solid #FFE082',
                        padding: '1px 5px', borderRadius: 3, marginTop: 3, display: 'inline-block',
                      }}>
                        {locale === 'ar' ? 'خارج الدولة' : 'Overseas'}
                      </span>
                    )}
                  </td>

                  {/* Emirate */}
                  <td style={{ padding: '14px 8px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                    {row.emirate || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                  </td>

                  {/* City */}
                  <td style={{ padding: '14px 8px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                    {row.city || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                  </td>

                  {/* Entity */}
                  <td style={{ padding: '14px 8px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', verticalAlign: 'middle' }}>
                    {entityMap.get(row.legalEntityId) ?? '—'}
                  </td>

                  {/* Timezone */}
                  <td style={{ padding: '14px 8px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', verticalAlign: 'middle' }}>
                    {row.timezone}
                  </td>

                  {/* Status */}
                  <td style={{ padding: '14px 8px', verticalAlign: 'middle' }}>
                    <StatusBadge active={row.isActive} />
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                    <MdmRowMenu
                      isActive={row.isActive}
                      onEdit={() => handleEdit(row)}
                      onHistory={() => setHistoryRecord({ id: row.id, nameEn: row.nameEn, nameAr: row.nameAr ?? undefined })}
                      onDisable={() => handleDisableRequest(row)}
                      onEnable={() => handleEnable(row)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {/* Row count */}
      {sorted.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
          {locale === 'ar' ? `عرض ${sorted.length} من ${totalCount} موقع` : `Showing ${sorted.length} of ${totalCount} locations`}
        </div>
      )}

      {/* Audit history */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="locations"
        initialCollapsed
      />

      {/* Drawers & dialogs */}
      <LocationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={handleDrawerSuccess}
        editRow={editRow}
        legalEntities={legalEntities}
      />

      <DisableConfirmDialog
        open={!!disableRow}
        onClose={() => setDisableRow(null)}
        onConfirm={handleConfirmDisable}
        entityName={disableRow ? `${disableRow.code} — ${disableRow.nameEn}` : ''}
        warningMessage={locale === 'ar' ? 'لن يتأثر الموظفون المعيّنون حاليًا على هذا الموقع.' : 'Employees currently assigned to this location are unaffected.'}
        isPending={isPending}
      />

      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="locations"
      />

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: 'var(--ink-1)', color: '#fff',
          padding: '10px 18px', borderRadius: 8,
          fontSize: 'var(--text-body)', fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          animation: 'fadeIn 200ms ease',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
