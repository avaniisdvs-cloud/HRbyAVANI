'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { MdmPageHeader } from '@/components/mdm/MdmPageHeader'
import { MdmFilterBar } from '@/components/mdm/MdmFilterBar'
import { MdmChangeHistory } from '@/components/mdm/MdmChangeHistory'
import { StatusBadge } from '@/components/mdm/StatusBadge'
import { DisableConfirmDialog } from '@/components/mdm/DisableConfirmDialog'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import { MdmRowMenu } from '@/components/mdm/MdmRowMenu'
import { DepartmentDrawer, type DepartmentRow } from './DepartmentDrawer'
import { disableDepartment, enableDepartment } from './DepartmentActions'

// ── Types ────────────────────────────────────────────────────────────────────

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface BusinessUnitOption {
  id:            string
  legalEntityId: string
  nameEn:        string
}

interface DepartmentOption {
  id:            string
  legalEntityId: string
  nameEn:        string
  code:          string
}

interface PersonOption {
  id:            string
  label:         string
  sublabel?:     string
  legalEntityId?: string | null
}

interface ScheduleOption {
  id:            string
  scheduleNameEn: string
  scheduleCode:  string
  isDefault:     boolean
  legalEntityId: string | null
}

interface DepartmentClientProps {
  initialData:    DepartmentRow[]
  auditHistory:   AuditHistoryEntry[]
  legalEntities:  LegalEntityOption[]
  businessUnits:  BusinessUnitOption[]
  personOptions:  PersonOption[]
  scheduleOptions: ScheduleOption[]
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

// ── Helpers ──────────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding:      '12px 14px',
  fontSize:     'var(--text-body)',
  color:        'var(--ink-1)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
}

// ── Component ────────────────────────────────────────────────────────────────

export function DepartmentClient({
  initialData,
  auditHistory,
  legalEntities,
  businessUnits,
  personOptions,
  scheduleOptions,
}: DepartmentClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const [records,       setRecords]       = useState<DepartmentRow[]>(initialData)
  useEffect(() => { setRecords(initialData) }, [initialData])
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('ALL')
  const [entityFilter,  setEntityFilter]  = useState('')
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [editRecord,    setEditRecord]    = useState<DepartmentRow | null>(null)
  const [disableTarget, setDisableTarget] = useState<DepartmentRow | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [historyRecord, setHistoryRecord] = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)

  const { sort, handleSort } = useTableSort('code', 'asc')

  // Derive all department options from current records for parent selector
  const departmentOptions: DepartmentOption[] = useMemo(
    () => records.map(r => ({ id: r.id, legalEntityId: r.legalEntityId, nameEn: r.nameEn, code: r.code })),
    [records],
  )

  // ── Filtered records
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      if (statusFilter === 'ACTIVE'   && !r.isActive) return false
      if (statusFilter === 'INACTIVE' && r.isActive)  return false
      if (entityFilter && r.legalEntityId !== entityFilter) return false
      if (q) {
        return (
          r.code.toLowerCase().includes(q)   ||
          r.nameEn.toLowerCase().includes(q) ||
          r.nameAr.toLowerCase().includes(q) ||
          (r.entityName?.toLowerCase().includes(q) ?? false)
        )
      }
      return true
    })
  }, [records, search, statusFilter, entityFilter])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = String((a as unknown as Record<string, unknown>)[sort.column!] ?? '')
      const bVal = String((b as unknown as Record<string, unknown>)[sort.column!] ?? '')
      const cmp = aVal.localeCompare(bVal, 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  // ── Stats
  const totalCount    = records.length
  const activeCount   = records.filter(r => r.isActive).length
  const inactiveCount = totalCount - activeCount

  // ── Actions
  function openNew() {
    setEditRecord(null)
    setActionError(null)
    setDrawerOpen(true)
  }

  function openEdit(r: DepartmentRow) {
    setEditRecord(r)
    setActionError(null)
    setDrawerOpen(true)
  }

  function handleSaved() {
    router.refresh()
  }

  function handleDisableConfirm(reason: string) {
    if (!disableTarget) return
    const id = disableTarget.id
    setDisableTarget(null)
    startTransition(async () => {
      const result = await disableDepartment(id, reason)
      if (result.error) {
        setActionError(result.error)
      } else {
        setRecords(prev => prev.map(r => r.id === id ? { ...r, isActive: false } : r))
      }
    })
  }

  function handleEnable(r: DepartmentRow) {
    startTransition(async () => {
      const result = await enableDepartment(r.id)
      if (result.error) {
        setActionError(result.error)
      } else {
        setRecords(prev => prev.map(d => d.id === r.id ? { ...d, isActive: true } : d))
      }
    })
  }

  return (
    <div>
      <MdmPageHeader
        titleEn="Departments"
        titleAr="الأقسام"
        icon={Building}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={openNew}
        newLabel={locale === 'ar' ? 'قسم جديد' : 'New Department'}
      />

      <MdmFilterBar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        entityId={entityFilter}
        entities={legalEntities}
        onEntityChange={setEntityFilter}
      />

      {actionError && (
        <div style={{
          marginBottom: 14,
          padding: '10px 14px',
          background: 'var(--status-rejected-bg)',
          border: '1px solid var(--status-rejected-dot)',
          borderRadius: 8,
          fontSize: 'var(--text-body)',
          color: 'var(--status-rejected-fg)',
        }}>
          {actionError}
        </div>
      )}

      {/* ── Table ── */}
      <div style={{
        border:       '1px solid var(--border)',
        borderRadius: 10,
        background:   'var(--card)',
        overflow:     'hidden',
      }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}      column="code"              activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name EN'}   column="nameEn"            activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم (عربي)' : 'Name AR'}   column="nameAr"            activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الكيان' : 'Entity'}    column="entityName"        activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'رئيس القسم' : 'Head'}      column="headPersonName"    activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'النوع' : 'Type'}      column="departmentType"    activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'العدد المعتمد' : 'Headcount'} column="approvedHeadcount" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}    column="isActive"          activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-4)', padding: '32px 0' }}>
                  {locale === 'ar' ? 'لم يتم العثور على أقسام' : 'No departments found'}
                </td>
              </tr>
            ) : sorted.map(r => (
              <tr
                key={r.id}
                style={{ opacity: r.isActive ? 1 : 0.6 }}
              >
                {/* Code */}
                <td style={tdStyle}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize:   'var(--text-caption)',
                    background: 'var(--surface)',
                    border:     '1px solid var(--border)',
                    borderRadius: 4,
                    padding:    '2px 6px',
                    color:      'var(--ink-2)',
                  }}>
                    {r.code}
                  </span>
                </td>

                {/* Name EN */}
                <td style={{ ...tdStyle, fontWeight: 500 }}>{r.nameEn}</td>

                {/* Name AR */}
                <td style={{ ...tdStyle, direction: 'rtl', textAlign: 'right', fontFamily: 'var(--font-sans)' }}>
                  {r.nameAr}
                </td>

                {/* Entity */}
                <td style={{ ...tdStyle, color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                  {r.entityName ?? r.legalEntityId}
                </td>

                {/* Head */}
                <td style={{ ...tdStyle, color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                  {r.headPersonName ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>

                {/* Type */}
                <td style={{ ...tdStyle, color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>
                  {r.departmentType ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>

                {/* Headcount — BR-DEPT-003: orange warning badge */}
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <span style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          4,
                    fontFamily:   'var(--font-mono)',
                    fontSize:     'var(--text-body)',
                    fontWeight:   600,
                    color:        'var(--ink-1)',
                  }}>
                    {r.approvedHeadcount === 0 && (
                      <span
                        title="BR-DEPT-003: Approved headcount is zero — review required"
                        style={{
                          display:      'inline-flex',
                          alignItems:   'center',
                          justifyContent: 'center',
                          width:        16,
                          height:       16,
                          borderRadius: '50%',
                          background:   'var(--status-warning)',
                          color:        "var(--on-accent)",
                          fontSize:     'var(--text-caption)',
                          fontWeight:   700,
                          flexShrink:   0,
                        }}
                      >
                        !
                      </span>
                    )}
                    {r.approvedHeadcount}
                  </span>
                </td>

                {/* Status */}
                <td style={tdStyle}>
                  <StatusBadge active={r.isActive} />
                </td>

                {/* Actions */}
                <td style={{ ...tdStyle, textAlign: 'center', padding: '8px 10px' }}>
                  <MdmRowMenu
                    isActive={r.isActive}
                    onEdit={() => openEdit(r)}
                    onHistory={() => setHistoryRecord({ id: r.id, nameEn: r.nameEn, nameAr: r.nameAr })}
                    onDisable={() => setDisableTarget(r)}
                    onEnable={() => handleEnable(r)}
                    isPending={isPending}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {/* ── Change History ── */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="departments"
        initialCollapsed
      />

      {/* ── Drawer ── */}
      <DepartmentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editRecord={editRecord}
        legalEntities={legalEntities}
        businessUnits={businessUnits}
        departments={departmentOptions}
        personOptions={personOptions}
        scheduleOptions={scheduleOptions}
        onSaved={handleSaved}
      />

      {/* ── History Drawer ── */}
      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="departments"
      />

      {/* ── Disable Dialog ── */}
      <DisableConfirmDialog
        open={disableTarget !== null}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleDisableConfirm}
        entityName={disableTarget ? `${disableTarget.code} — ${disableTarget.nameEn}` : ''}
        warningMessage={locale === 'ar' ? 'ستظل أي مناصب نشطة في هذا القسم معيّنة حتى يتم تحديثها يدويًا.' : 'Any active positions in this department will remain assigned until manually updated.'}
        isPending={isPending}
      />
    </div>
  )
}
