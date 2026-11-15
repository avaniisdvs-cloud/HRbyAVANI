'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench } from 'lucide-react'
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
import { JobDrawer, type JobRow } from './JobDrawer'
import { disableJob, enableJob } from './JobActions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GradeOption {
  id:         string
  gradeCode:  string
  gradeLevel: number
}

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface JobClientProps {
  initialData:   JobRow[]
  auditHistory:  AuditHistoryEntry[]
  grades:        GradeOption[]
  legalEntities: LegalEntityOption[]
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

// ── Helpers ───────────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding:       '12px 14px',
  fontSize:      'var(--text-body)',
  color:         'var(--ink-1)',
  borderBottom:  '1px solid var(--border)',
  verticalAlign: 'middle',
}

function gradeRangeLabel(row: JobRow, gradeMap: Map<string, GradeOption>): string {
  const minGrade = row.minGradeId ? gradeMap.get(row.minGradeId) : undefined
  const maxGrade = row.maxGradeId ? gradeMap.get(row.maxGradeId) : undefined

  if (minGrade && maxGrade) return `${minGrade.gradeCode} – ${maxGrade.gradeCode}`
  if (minGrade) return minGrade.gradeCode
  if (maxGrade) return maxGrade.gradeCode
  return '—'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function JobClient({
  initialData,
  auditHistory,
  grades,
  legalEntities,
}: JobClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const [records,       setRecords]       = useState<JobRow[]>(initialData)
  useEffect(() => { setRecords(initialData) }, [initialData])
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('ALL')
  const [entityFilter,  setEntityFilter]  = useState('')
  const [familyFilter,  setFamilyFilter]  = useState('')
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [editRecord,    setEditRecord]    = useState<JobRow | null>(null)
  const [disableTarget, setDisableTarget] = useState<JobRow | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [historyRecord, setHistoryRecord] = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)

  const { sort, handleSort } = useTableSort('jobCode', 'asc')

  // Grade lookup map
  const gradeMap = useMemo(() => new Map(grades.map(g => [g.id, g])), [grades])

  // Unique job families for filter dropdown
  const jobFamilies = useMemo(() => {
    const families = new Set(records.map(r => r.jobFamily).filter(Boolean) as string[])
    return Array.from(families).sort()
  }, [records])

  // ── Filtered records
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      if (statusFilter === 'ACTIVE'   && !r.isActive) return false
      if (statusFilter === 'INACTIVE' && r.isActive)  return false
      if (entityFilter && r.legalEntityId !== entityFilter) return false
      if (familyFilter && r.jobFamily !== familyFilter) return false
      if (q) {
        return (
          r.jobCode.toLowerCase().includes(q)      ||
          r.jobTitleEn.toLowerCase().includes(q)   ||
          (r.jobTitleAr?.toLowerCase().includes(q) ?? false) ||
          (r.jobFamily?.toLowerCase().includes(q)  ?? false)
        )
      }
      return true
    })
  }, [records, search, statusFilter, entityFilter, familyFilter])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = String((a as unknown as Record<string, unknown>)[sort.column!] ?? '')
      const bVal = String((b as unknown as Record<string, unknown>)[sort.column!] ?? '')
      const cmp = aVal.localeCompare(bVal, 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  const totalCount    = records.length
  const activeCount   = records.filter(r => r.isActive).length
  const inactiveCount = totalCount - activeCount

  // ── Actions
  function openNew() {
    setEditRecord(null)
    setActionError(null)
    setDrawerOpen(true)
  }

  function openEdit(r: JobRow) {
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
      const result = await disableJob(id, reason)
      if (result.error) {
        setActionError(result.error)
      } else {
        setRecords(prev => prev.map(r => r.id === id ? { ...r, isActive: false } : r))
      }
    })
  }

  function handleEnable(r: JobRow) {
    startTransition(async () => {
      const result = await enableJob(r.id)
      if (result.error) {
        setActionError(result.error)
      } else {
        setRecords(prev => prev.map(j => j.id === r.id ? { ...j, isActive: true } : j))
      }
    })
  }

  return (
    <div>
      <MdmPageHeader
        titleEn="Jobs"
        titleAr="الأدوار الوظيفية"
        icon={Wrench}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={openNew}
        newLabel={locale === 'ar' ? 'دور وظيفي جديد' : 'New Job'}
      />

      {/* ── Filter bar ── */}
      <MdmFilterBar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        entityId={entityFilter}
        entities={legalEntities}
        onEntityChange={setEntityFilter}
        extra={jobFamilies.length > 0 ? (
          <select
            value={familyFilter}
            onChange={e => setFamilyFilter(e.target.value)}
            style={{
              height:       36,
              padding:      '0 10px',
              border:       '1.5px solid var(--border)',
              borderRadius: 8,
              fontSize:     'var(--text-body)',
              fontFamily:   'var(--font-sans)',
              color:        'var(--ink-1)',
              background:   'var(--card)',
              cursor:       'pointer',
              outline:      'none',
            }}
          >
            <option value="">{locale === 'ar' ? 'جميع المجموعات' : 'All families'}</option>
            {jobFamilies.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        ) : undefined}
      />

      {actionError && (
        <div style={{
          marginBottom: 14,
          padding: '10px 14px',
          background: '#FBE9E9',
          border: '1px solid #FFCDD2',
          borderRadius: 8,
          fontSize: 'var(--text-body)',
          color: '#C62828',
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
              <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}          column="jobCode"               activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'المسمى (إنجليزي)' : 'Title EN'}      column="jobTitleEn"            activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'المسمى (عربي)' : 'Title AR'}      column="jobTitleAr"            activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'المجموعة الوظيفية' : 'Family'}        column="jobFamily"             activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'نطاق الدرجات' : 'Grade Range'}</th>
              <SortableHeader label={locale === 'ar' ? 'التوطين' : 'Emiratisation'} column="isEmiratisationTarget" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}        column="isActive"              activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-4)', padding: '32px 0' }}>
                  {locale === 'ar' ? 'لم يتم العثور على وظائف' : 'No jobs found'}
                </td>
              </tr>
            ) : sorted.map(r => (
              <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.6 }}>
                {/* Code */}
                <td style={tdStyle}>
                  <span style={{
                    fontFamily:   'var(--font-mono)',
                    fontSize:     'var(--text-caption)',
                    background:   'var(--surface)',
                    border:       '1px solid var(--border)',
                    borderRadius: 4,
                    padding:      '2px 6px',
                    color:        'var(--ink-2)',
                  }}>
                    {r.jobCode}
                  </span>
                </td>

                {/* Title EN */}
                <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{r.jobTitleEn}</span>
                    {r.isManagementRole && (
                      <span style={{
                        fontSize: 'var(--text-caption)', fontWeight: 700, padding: '1px 4px',
                        background: 'var(--surface)', color: 'var(--ink-3)',
                        border: '1px solid var(--border)', borderRadius: 3,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        flexShrink: 0,
                      }}>
                        {locale === 'ar' ? 'إداري' : 'Mgmt'}
                      </span>
                    )}
                  </div>
                </td>

                {/* Title AR */}
                <td style={{ ...tdStyle, direction: 'rtl', textAlign: 'right', fontFamily: 'var(--font-sans)' }}>
                  {r.jobTitleAr ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>

                {/* Family */}
                <td style={{ ...tdStyle, color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                  {r.jobFamily ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>

                {/* Grade Range */}
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                  {gradeRangeLabel(r, gradeMap)}
                </td>

                {/* Emiratisation */}
                <td style={tdStyle}>
                  {r.isEmiratisationTarget ? (
                    <span style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          4,
                      padding:      '2px 8px',
                      borderRadius: 6,
                      fontSize:     'var(--text-caption)',
                      fontWeight:   700,
                      background:   'var(--accent-100)',
                      color:        'var(--brand-active)',
                    }}>
                      🇦🇪 Nafis
                    </span>
                  ) : (
                    <span style={{ color: 'var(--ink-4)' }}>—</span>
                  )}
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
                    onHistory={() => setHistoryRecord({ id: r.id, nameEn: r.jobTitleEn, nameAr: r.jobTitleAr ?? undefined })}
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
        resourceType="jobs"
        initialCollapsed
      />

      {/* ── Drawer ── */}
      <JobDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editRecord={editRecord}
        grades={grades}
        legalEntities={legalEntities}
        onSaved={handleSaved}
      />

      {/* ── History Drawer ── */}
      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="jobs"
      />

      {/* ── Disable Dialog ── */}
      <DisableConfirmDialog
        open={disableTarget !== null}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleDisableConfirm}
        entityName={disableTarget ? `${disableTarget.jobCode} — ${disableTarget.jobTitleEn}` : ''}
        warningMessage={locale === 'ar' ? 'ستظل أي مناصب نشطة معيّنة على هذا الدور الوظيفي دون تغيير حتى يتم تحديثها يدويًا.' : 'Any active positions assigned to this job will remain unchanged until manually updated.'}
        isPending={isPending}
      />
    </div>
  )
}
