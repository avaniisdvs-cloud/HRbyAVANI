'use client'

import { useBranding } from '@/components/providers/BrandingProvider'
import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react'
import { useRouter }         from 'next/navigation'
import { Search, X, Building2, Users, LayoutGrid, SlidersHorizontal, BarChart2, Download, Monitor } from 'lucide-react'
import { useToast }         from '@/hooks/use-toast'
import { useLocale }        from '@/components/providers/LocaleProvider'
import { OrgChartCanvas }    from './OrgChartCanvas'
import { OrgChartBreadcrumb }from './OrgChartBreadcrumb'
import { OrgChartStatsBar }  from './OrgChartStatsBar'
import { OrgChartFilters, DEFAULT_FILTERS, countActiveFilters } from './OrgChartFilters'
import { OrgChartActionPanel }   from './OrgChartActionPanel'
import { OrgChartAnalytics }     from './OrgChartAnalytics'
import { HiringRequestDrawer }   from './drawers/HiringRequestDrawer'
import { TransferRequestDrawer } from './drawers/TransferRequestDrawer'
import { ActingManagerDrawer }   from './drawers/ActingManagerDrawer'
import { exportOrgChartPng, exportOrgChartPdf } from '@/lib/org-chart/export'
import { OrgChartAriaPanel }     from './OrgChartAriaPanel'
import { SystemUsersPanel }      from './SystemUsersPanel'
import { ViewBySelector }        from './ViewBySelector'
import { onChartEvent }          from '@/lib/org-chart/chart-events'
import type { ActiveFilters }from './OrgChartFilters'
import { fetchOrgTree, fetchHierarchy } from '@/modules/core-hr/org-chart-actions'
import type { OrgFlowNode, OrgFlowEdge, OrgTreeMeta, OrgViewerRole, SystemUserRow } from '@/lib/org-chart/types'
import type { HierarchyEngine, HierarchyMeta } from '@/lib/org-chart/engines/engine-types'
import type { OrgChartControls } from './OrgChartController'

// ─────────────────────────────────────────────────────────────────────────────

interface OrgChartShellProps {
  initialNodes:     OrgFlowNode[]
  initialEdges:     OrgFlowEdge[]
  meta:             HierarchyMeta
  departments:      Array<{ id: string; nameEn: string; nameAr: string }>
  viewerRole:       OrgViewerRole
  currentPersonId?: string
  tenantId:         string
  systemUsers?:     SystemUserRow[]
}

// ─── Collapse helpers ─────────────────────────────────────────────────────────

function getAllDescendants(nodeId: string, edges: OrgFlowEdge[]): string[] {
  const children = edges.filter(e => e.source === nodeId).map(e => e.target)
  return children.flatMap(c => [c, ...getAllDescendants(c, edges)])
}

// ─── Search helper ────────────────────────────────────────────────────────────

function matchesQuery(node: OrgFlowNode, q: string): boolean {
  const lq = q.toLowerCase()
  const d   = node.data
  return [
    d.fullNameEn, d.fullNameAr, d.personNumber,
    d.jobTitleEn, d.deptNameEn, d.positionTitleEn,
  ].some(v => v?.toLowerCase().includes(lq))
}

// ─── Filter logic ─────────────────────────────────────────────────────────────

function applyFilters(nodes: OrgFlowNode[], f: ActiveFilters): OrgFlowNode[] {
  let result = nodes
  if (!f.showActive)       result = result.filter(n => !(n.type === 'employee' && !n.data.isActing))
  if (!f.showVacant)       result = result.filter(n => !(n.type === 'vacant'   && !n.data.isFrozen))
  if (!f.showActing)       result = result.filter(n => !n.data.isActing)
  if (!f.showFrozen)       result = result.filter(n => !n.data.isFrozen)
  if (f.showContractors)   result = result.filter(n => n.data.employmentType === 'CONTRACTOR')
  if (f.showOnLeave)       result = result.filter(n => n.data.assignmentStatus === 'ON_LEAVE')
  if (f.showNewJoiners)    result = result.filter(n => (n.data.hireDateDaysAgo ?? Infinity) <= 90)
  if (f.showEmiratisation) result = result.filter(n => n.data.isEmiratisationTarget === true)
  if (f.deptIds.length > 0)result = result.filter(n => f.deptIds.includes(n.data.deptId ?? ''))
  return result
}

// ─── Chip bar helpers ─────────────────────────────────────────────────────────

interface ChipDef {
  label: string
  clear: (f: ActiveFilters) => ActiveFilters
}

function buildChips(f: ActiveFilters, departments: Array<{ id: string; nameEn: string }>, isAr: boolean): ChipDef[] {
  const chips: ChipDef[] = []
  if (!f.showActive)       chips.push({ label: isAr ? 'بدون نشطين'        : 'No active',       clear: p => ({ ...p, showActive:        true  }) })
  if (!f.showVacant)       chips.push({ label: isAr ? 'بدون شاغرة'         : 'No vacant',        clear: p => ({ ...p, showVacant:        true  }) })
  if (!f.showActing)       chips.push({ label: isAr ? 'بدون إنابة'         : 'No acting',        clear: p => ({ ...p, showActing:        true  }) })
  if (!f.showFrozen)       chips.push({ label: isAr ? 'بدون مجمَّدة'       : 'No frozen',        clear: p => ({ ...p, showFrozen:        true  }) })
  if (f.showContractors)   chips.push({ label: isAr ? 'المتعاقدون فقط'     : 'Contractors only', clear: p => ({ ...p, showContractors:   false }) })
  if (f.showOnLeave)       chips.push({ label: isAr ? 'في إجازة'           : 'On leave',         clear: p => ({ ...p, showOnLeave:       false }) })
  if (f.showNewJoiners)    chips.push({ label: isAr ? 'الملتحقون الجدد'    : 'New joiners',      clear: p => ({ ...p, showNewJoiners:    false }) })
  if (f.showEmiratisation) chips.push({ label: isAr ? 'التوطين'            : 'Emiratisation',    clear: p => ({ ...p, showEmiratisation: false }) })
  if (f.flagOverloaded)    chips.push({ label: isAr ? 'مؤشر الزائد عن الحد' : 'Overloaded flag',  clear: p => ({ ...p, flagOverloaded:    false }) })
  if (f.flagUnderSupervised) chips.push({ label: isAr ? 'مؤشر قليل الإشراف' : 'Under-supervised flag', clear: p => ({ ...p, flagUnderSupervised: false }) })
  if (f.deptIds.length > 0) {
    const names = f.deptIds
      .map(id => departments.find(d => d.id === id)?.nameEn ?? id)
      .join(', ')
    chips.push({ label: `${isAr ? 'القسم' : 'Dept'}: ${names}`, clear: p => ({ ...p, deptIds: [] }) })
  }
  return chips
}

// ─────────────────────────────────────────────────────────────────────────────

export function OrgChartShell({
  initialNodes,
  initialEdges,
  meta,
  departments,
  viewerRole,
  currentPersonId,
  tenantId: _tenantId,
  systemUsers = [],
}: OrgChartShellProps) {
  const branding = useBranding()
  const router    = useRouter()
  const { toast } = useToast()
  const locale    = useLocale()
  const isAr      = locale === 'ar'

  const [rfNodes,       setRfNodes]       = useState<OrgFlowNode[]>(initialNodes)
  const [rfEdges,       setRfEdges]       = useState<OrgFlowEdge[]>(initialEdges)
  const [hiddenIds,     setHiddenIds]     = useState<Set<string>>(new Set())
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchResults, setSearchResults] = useState<OrgFlowNode[]>([])
  const [activeView,    setActiveView]    = useState<'full' | 'my-team' | 'department'>('full')
  const [activeDeptId,  setActiveDeptId]  = useState<string | null>(null)
  const [deptDropOpen,  setDeptDropOpen]  = useState(false)
  const [filtersOpen,   setFiltersOpen]   = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(DEFAULT_FILTERS)
  const [loading,           setLoading]           = useState(false)
  const [bannerMsg,         setBannerMsg]         = useState<string | null>(null)
  const [searchFocused,     setSearchFocused]     = useState(false)
  const [systemUsersOpen,   setSystemUsersOpen]   = useState(false)

  // ── Session 3 — Multi-engine state ────────────────────────────────────────
  // activeEngine controls which hierarchy model is rendered.
  // currentMeta is updated whenever the engine reloads.
  // Default view = Reporting Manager. SSR provides position-engine data for fast
  // first paint; the mount effect below swaps in the reporting hierarchy.
  const [activeEngine,  setActiveEngine]  = useState<HierarchyEngine>('reporting')
  const [currentMeta,   setCurrentMeta]   = useState<HierarchyMeta>(meta)

  // ── Task E — Action panel + drawer state ──────────────────────────────────
  const [actionPanel,    setActionPanel]    = useState<{ nodeId: string; anchorPos: { x: number; y: number } } | null>(null)
  const [hiringDrawer,   setHiringDrawer]   = useState<{ positionId: string } | null>(null)
  const [transferDrawer, setTransferDrawer] = useState<{ nodeId: string; type: 'TRANSFER' | 'PROMOTION' } | null>(null)
  const [actingDrawer,   setActingDrawer]   = useState<{ nodeId: string } | null>(null)
  const [analyticsOpen,  setAnalyticsOpen]  = useState(false)
  const [exportOpen,     setExportOpen]     = useState(false)
  const [exporting,      setExporting]      = useState(false)
  const [ariaOpen,       setAriaOpen]       = useState(false)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())

  const exportDropRef = useRef<HTMLDivElement>(null)
  const exportBtnRef  = useRef<HTMLButtonElement>(null)

  const chartControlsRef = useRef<OrgChartControls | null>(null)
  const deptBtnRef       = useRef<HTMLButtonElement>(null)
  const deptDropRef      = useRef<HTMLDivElement>(null)
  const searchRef        = useRef<HTMLInputElement>(null)
  const debounceTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Banner auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!bannerMsg) return
    const t = setTimeout(() => setBannerMsg(null), 3000)
    return () => clearTimeout(t)
  }, [bannerMsg])

  // ── Close dept dropdown on outside click / Escape ─────────────────────────
  useEffect(() => {
    if (!deptDropOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeptDropOpen(false) }
    const onClickOutside = (e: MouseEvent) => {
      if (
        deptDropRef.current && !deptDropRef.current.contains(e.target as Node) &&
        deptBtnRef.current  && !deptBtnRef.current.contains(e.target as Node)
      ) setDeptDropOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [deptDropOpen])

  // ── Close search on Escape ────────────────────────────────────────────────
  useEffect(() => {
    if (!searchOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchOpen])

  // ── Close export dropdown on outside click ────────────────────────────────
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent) => {
      if (
        exportDropRef.current && !exportDropRef.current.contains(e.target as Node) &&
        exportBtnRef.current  && !exportBtnRef.current.contains(e.target as Node)
      ) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  // ── Export handlers ───────────────────────────────────────────────────────
  const handleExportPng = async () => {
    setExportOpen(false)
    setExporting(true)
    try {
      await exportOrgChartPng('#org-chart-canvas .react-flow__viewport', branding.companyName)
    } catch {
      toast({ title: locale === 'ar' ? 'فشل التصدير' : 'Export failed', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const handleExportPdf = async () => {
    setExportOpen(false)
    setExporting(true)
    try {
      await exportOrgChartPdf('#org-chart-canvas .react-flow__viewport', branding.companyName)
    } catch {
      toast({ title: locale === 'ar' ? 'فشل التصدير' : 'Export failed', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  // ── Search debounce ───────────────────────────────────────────────────────
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!value.trim()) { setSearchResults([]); setSearchOpen(false); return }
    debounceTimer.current = setTimeout(() => {
      const results = rfNodes.filter(n => matchesQuery(n, value)).slice(0, 8)
      setSearchResults(results)
      setSearchOpen(true)
    }, 300)
  }, [rfNodes])

  const handleSearchResultClick = useCallback((node: OrgFlowNode) => {
    setSearchOpen(false); setSearchQuery(''); setSearchResults([])
    setSelectedId(node.id)
    setTimeout(() => chartControlsRef.current?.fitToNode(node.id), 50)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery(''); setSearchResults([]); setSearchOpen(false); setSelectedId(null)
  }, [])

  // ── Collapse / expand ─────────────────────────────────────────────────────
  const handleToggleCollapse = useCallback((nodeId: string) => {
    setHiddenIds(prev => {
      const next        = new Set(prev)
      const descendants = getAllDescendants(nodeId, rfEdges)
      const isCollapsed = descendants.length > 0 && descendants.every(id => prev.has(id))
      if (isCollapsed) {
        rfEdges.filter(e => e.source === nodeId).forEach(e => next.delete(e.target))
      } else {
        descendants.forEach(id => next.add(id))
      }
      return next
    })
  }, [rfEdges])

  // ── Breadcrumb click ──────────────────────────────────────────────────────
  const handleBreadcrumbNodeClick = useCallback((nodeId: string) => {
    setSelectedId(nodeId)
    setTimeout(() => chartControlsRef.current?.fitToNode(nodeId), 50)
  }, [])

  // ── Reload tree ───────────────────────────────────────────────────────────
  const reloadTree = useCallback(async (params: Parameters<typeof fetchOrgTree>[0]) => {
    setLoading(true)
    try {
      const result = await fetchOrgTree(params)
      if (result.success && result.data) {
        setRfNodes(result.data.nodes as OrgFlowNode[])
        setRfEdges(result.data.edges as OrgFlowEdge[])
        setHiddenIds(new Set()); setSelectedId(null)
        setTimeout(() => chartControlsRef.current?.fitToNode(''), 100)
      } else { setBannerMsg(result.error ?? (locale === 'ar' ? 'تعذر تحميل الشجرة' : 'Failed to load tree')) }
    } finally { setLoading(false) }
  }, [locale])

  const handleFullOrg = useCallback(() => {
    setActiveView('full'); setActiveDeptId(null)
    void reloadTree({ includeVacant: true, maxDepth: 8 })
  }, [reloadTree])

  const handleMyTeam = useCallback(() => {
    if (!currentPersonId) { setBannerMsg(locale === 'ar' ? 'لم يتم ربط ملف الموظف' : 'Employee profile not linked'); return }
    setActiveView('my-team'); setActiveDeptId(null)
    void reloadTree({ rootPersonId: currentPersonId, includeVacant: true, maxDepth: 3 })
  }, [currentPersonId, reloadTree, locale])

  const handleByDept = useCallback((deptId: string) => {
    setActiveView('department'); setActiveDeptId(deptId); setDeptDropOpen(false)
    void reloadTree({ rootDeptId: deptId, includeVacant: true })
  }, [reloadTree])

  // ── Session 3 — Engine switch handler ────────────────────────────────────
  const handleEngineChange = useCallback(async (engine: HierarchyEngine) => {
    if (engine === activeEngine) return

    setActiveEngine(engine)
    setLoading(true)
    setAriaOpen(false)
    setActionPanel(null)
    setHiringDrawer(null)
    setTransferDrawer(null)
    setActingDrawer(null)
    setAnalyticsOpen(false)
    setHiddenIds(new Set())
    setSelectedId(null)
    setSearchQuery('')
    setSearchResults([])
    setSearchOpen(false)

    try {
      const result = await fetchHierarchy({
        engine,
        includeVacant: activeFilters.showVacant,
        maxDepth: 8,
        // Keep MANAGER's reporting view rooted at themselves — matches the SSR
        // default so switching engines stays consistent and scoped.
        rootPersonId: (engine === 'reporting' && viewerRole === 'MANAGER')
          ? (currentPersonId ?? undefined)
          : undefined,
      })

      if (result.success && result.data) {
        setRfNodes(result.data.nodes as OrgFlowNode[])
        setRfEdges(result.data.edges as OrgFlowEdge[])
        setCurrentMeta(result.data.meta)
        // Reset view state — engine scope replaces view shortcuts
        setActiveView('full')
        setActiveDeptId(null)
        setTimeout(() => chartControlsRef.current?.fitToNode(''), 100)
      } else {
        setBannerMsg(result.error ?? (locale === 'ar' ? 'تعذر تبديل محرك التسلسل الهرمي' : 'Failed to switch hierarchy engine'))
        // Roll back the engine selector on failure
        setActiveEngine(activeEngine)
      }
    } catch {
      setBannerMsg(locale === 'ar' ? 'تعذر تبديل محرك التسلسل الهرمي' : 'Failed to switch hierarchy engine')
      setActiveEngine(activeEngine)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEngine, activeFilters.showVacant])

  // ── Chart event bus listeners (ARIA → canvas) ────────────────────────────
  useEffect(() => {
    const unsubs = [
      onChartEvent('PAN_TO_NODE', ({ nodeId }) => {
        setHighlightedIds(new Set([nodeId]))
        setTimeout(() => chartControlsRef.current?.fitToNode(nodeId), 100)
      }),
      onChartEvent('HIGHLIGHT_NODES', ({ nodeIds }) => {
        setHighlightedIds(new Set(nodeIds))
      }),
      onChartEvent('FILTER_VACANT', () => {
        setActiveFilters(prev => ({
          ...prev,
          showVacant: true,
          showFrozen: true,
          showActive: false,
          showActing: false,
        }))
      }),
      onChartEvent('FILTER_DEPT', ({ deptId }) => {
        handleByDept(deptId)
      }),
      onChartEvent('RELOAD_FULL', () => {
        handleFullOrg()
        setHighlightedIds(new Set())
      }),
      onChartEvent('RELOAD_MY_TEAM', () => {
        handleMyTeam()
        setHighlightedIds(new Set())
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [handleByDept, handleFullOrg, handleMyTeam])

  // ── Build visible nodes (collapse state + viewerRole + span-of-control flags) ─
  const visibleNodes = useMemo(() => rfNodes.map(n => ({
    ...n,
    hidden:   hiddenIds.has(n.id),
    selected: n.id === selectedId,
    data: {
      ...n.data,
      viewerRole,
      onToggleCollapse:   handleToggleCollapse,
      flagOverloaded:     activeFilters.flagOverloaded,
      flagUnderSupervised:activeFilters.flagUnderSupervised,
      isCollapsed: (() => {
        const desc = getAllDescendants(n.id, rfEdges)
        return desc.length > 0 && desc.every(id => hiddenIds.has(id))
      })(),
      // Task G — ARIA highlight ring
      isHighlighted: highlightedIds.has(n.id),
      // Task E — action panel + hire callbacks
      onActionClick: (_positionId: string, event: React.MouseEvent) => {
        // Use the UNIQUE React Flow node id (n.id), NOT data.positionId.
        // positionId is NOT unique across nodes — in the reporting engine several
        // people can share one current_position_id (and unassigned people fall back
        // to person_id), so a positionId-keyed lookup returns the wrong node
        // (e.g. View Profile opening the root manager instead of the clicked report).
        const rect = (event.target as HTMLElement).getBoundingClientRect()
        setActionPanel({ nodeId: n.id, anchorPos: { x: rect.right + 10, y: rect.top } })
      },
      onHireClick: (positionId: string) => {
        setAriaOpen(false)
        setHiringDrawer({ positionId })
      },
    },
  })), [rfNodes, rfEdges, hiddenIds, selectedId, viewerRole, handleToggleCollapse, activeFilters, highlightedIds])

  // ── Apply client-side filters ─────────────────────────────────────────────
  const filteredNodes = useMemo(
    () => applyFilters(visibleNodes, activeFilters),
    [visibleNodes, activeFilters],
  )

  // ── Chip bar ──────────────────────────────────────────────────────────────
  const chips         = useMemo(() => buildChips(activeFilters, departments, locale === 'ar'), [activeFilters, departments, locale])
  const showChips     = chips.length > 0
  const filterCount   = countActiveFilters(activeFilters)
  const showStats     = viewerRole !== 'EMPLOYEE'

  // ── Button style helper ───────────────────────────────────────────────────
  const viewBtnStyle = (active: boolean): React.CSSProperties => ({
    height:       32,
    padding:      '0 12px',
    borderRadius: 6,
    fontSize:     'var(--text-caption)',
    fontFamily:   'var(--font-sans)',
    fontWeight:   500,
    border:       active ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
    color:        active ? 'var(--brand-active)'              : 'var(--ink-2)',
    background:   active ? 'var(--accent-100)'          : 'transparent',
    cursor:       loading ? 'not-allowed' : 'pointer',
    display:      'flex',
    alignItems:   'center',
    gap:          6,
    opacity:      loading ? 0.6 : 1,
    whiteSpace:   'nowrap' as const,
    transition:   'border-color 0.12s, color 0.12s, background 0.12s',
  })

  const activeDept = departments.find(d => d.id === activeDeptId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Interactive top bar ─────────────────────────────────────────── */}
      <div style={{
        height:       56,
        minHeight:    56,
        display:      'flex',
        alignItems:   'center',
        padding:      '0 16px',
        gap:          16,
        background:   'var(--card)',
        borderBottom: '1px solid var(--border)',
        zIndex:       50,
        position:     'relative',
        flexShrink:   0,
      }}>

        {/* Left: breadcrumb */}
        <div style={{ flex: '0 0 auto', minWidth: 0, maxWidth: 340 }}>
          <OrgChartBreadcrumb
            selectedNodeId={selectedId}
            allNodes={rfNodes}
            allEdges={rfEdges}
            onNodeClick={handleBreadcrumbNodeClick}
          />
        </div>

        {/* Centre: search */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: searchFocused ? 280 : 200, transition: 'width 0.2s' }}>
            <div style={{
              display:      'flex',
              alignItems:   'center',
              height:       32,
              border:       searchFocused ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
              borderRadius: 8,
              background:   'var(--bg)',
              padding:      '0 8px',
              gap:          6,
              transition:   'border-color 0.15s',
            }}>
              <Search size={13} strokeWidth={2} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={locale === 'ar' ? 'البحث عن أشخاص…' : 'Search people…'}
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  background: 'transparent', fontSize: 'var(--text-caption)',
                  fontFamily: 'var(--font-sans)', color: 'var(--ink-1)', minWidth: 0,
                }}
              />
              {searchQuery && (
                <button onClick={clearSearch} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', flexShrink: 0 }} aria-label={isAr ? 'مسح البحث' : 'Clear search'}>
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>

            {/* Search results dropdown */}
            {searchOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0,
              marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden' }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                    {isAr ? `لا توجد نتائج لـ “${searchQuery}”` : `No match for “${searchQuery}”`}
                  </div>
                ) : searchResults.map(node => (
                  <button
                    key={node.id}
                    onClick={() => handleSearchResultClick(node)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'none',
                    borderTopWidth: "0px",
                    borderTopStyle: "none",
                    borderTopColor: "currentColor",
                    borderRightWidth: "0px",
                    borderRightStyle: "none",
                    borderRightColor: "currentColor",
                    borderLeftWidth: "0px",
                    borderLeftStyle: "none",
                    borderLeftColor: "currentColor",
                    borderBottomWidth: "1px",
                    borderBottomStyle: "solid",
                    borderBottomColor: "var(--border)", cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--brand-active)', flexShrink: 0, overflow: 'hidden' }}>
                      {node.data.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={node.data.photoUrl} alt="" width={28} height={28} style={{ objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        (node.data.fullNameEn ?? node.data.positionTitleEn).split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.data.fullNameEn ?? node.data.positionTitleEn}
                      </div>
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.data.jobTitleEn ?? node.data.positionTitleEn}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: engine selector + view shortcuts + filter button */}
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Session 3 — Hierarchy engine selector */}
          <ViewBySelector
            active={activeEngine}
            viewerRole={viewerRole}
            onChange={handleEngineChange}
            disabled={loading}
            locale={locale}
          />

          {/* Divider — only when engine selector is visible */}
          {viewerRole !== 'EMPLOYEE' && (
            <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          )}

          {/* Position-engine scoping shortcuts (hidden in reporting mode) */}
          {activeEngine === 'position' && (
            <>
              <button onClick={handleFullOrg} disabled={loading} style={viewBtnStyle(activeView === 'full')}>
            <Building2 size={13} strokeWidth={2} />
            {isAr ? 'كامل المؤسسة' : 'Full Org'}
          </button>

          <button onClick={handleMyTeam} disabled={loading} style={viewBtnStyle(activeView === 'my-team')}>
            <Users size={13} strokeWidth={2} />
            {isAr ? 'فريقي' : 'My Team'}
          </button>

          {/* By Dept */}
          <div style={{ position: 'relative' }}>
            <button
              ref={deptBtnRef}
              onClick={() => setDeptDropOpen(v => !v)}
              disabled={loading}
              style={viewBtnStyle(activeView === 'department')}
            >
              <LayoutGrid size={13} strokeWidth={2} />
              {activeView === 'department' && activeDept ? activeDept.nameEn : (isAr ? 'حسب القسم' : 'By Dept')}
              <span style={{ fontSize: 'var(--text-caption)',
              marginLeft: 2 }}>▾</span>
            </button>

            {deptDropOpen && (
              <div ref={deptDropRef} style={{ position: 'absolute', top: '100%', right: 0,
              marginTop: 4, width: 220, maxHeight: 320, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100 }}>
                {departments.map(dept => (
                  <button
                    key={dept.id}
                    onClick={() => handleByDept(dept.id)}
                    style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px', background: activeDeptId === dept.id ? 'var(--accent-050)' : 'none',
                    borderTopWidth: "0px",
                    borderTopStyle: "none",
                    borderTopColor: "currentColor",
                    borderRightWidth: "0px",
                    borderRightStyle: "none",
                    borderRightColor: "currentColor",
                    borderLeftWidth: "0px",
                    borderLeftStyle: "none",
                    borderLeftColor: "currentColor",
                    borderBottomWidth: "1px",
                    borderBottomStyle: "solid",
                    borderBottomColor: "var(--border)", cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => { if (activeDeptId !== dept.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = activeDeptId === dept.id ? 'var(--accent-050)' : 'none' }}
                  >
                    <span style={{ fontSize: 'var(--text-caption)', fontWeight: 500, color: activeDeptId === dept.id ? 'var(--brand-active)' : 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>{dept.nameEn}</span>
                    <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>{dept.nameAr}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

              {/* Analytics button — HR_ADMIN + EXECUTIVE, position engine only */}
              {(viewerRole === 'HR_ADMIN' || viewerRole === 'EXECUTIVE') && (
                <button
                  onClick={() => { setAnalyticsOpen(v => !v); if (!analyticsOpen) setFiltersOpen(false) }}
                  style={viewBtnStyle(analyticsOpen)}
                  aria-label={isAr ? 'التحليلات' : 'Analytics'}
                >
                  <BarChart2 size={13} strokeWidth={2} />
                  {isAr ? 'التحليلات' : 'Analytics'}
                </button>
              )}
            </>
          )}

          {/* Export dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              ref={exportBtnRef}
              onClick={() => setExportOpen(v => !v)}
              disabled={exporting}
              style={{ ...viewBtnStyle(exportOpen), opacity: exporting ? 0.6 : 1 }}
              aria-label={isAr ? 'تصدير' : 'Export'}
            >
              <Download size={13} strokeWidth={2} />
              {exporting ? (isAr ? 'جارٍ التصدير…' : 'Exporting…') : (isAr ? 'تصدير' : 'Export')}
              <span style={{ fontSize: 'var(--text-caption)',
              marginLeft: 2 }}>▾</span>
            </button>

            {exportOpen && (
              <div
                ref={exportDropRef}
                style={{
                  position:   'absolute',
                  top:        '100%',
                  right:      0,
                  marginTop:  4,
                  width:      190,
                  background: 'var(--card)',
                  border:     '1px solid var(--border)',
                  borderRadius:8,
                  boxShadow:  '0 4px 16px rgba(0,0,0,0.12)',
                  zIndex:     100,
                  overflow:   'hidden',
                }}
              >
                {[
                  { label: isAr ? '🖼  تنزيل بصيغة PNG' : '🖼  Download as PNG', action: handleExportPng },
                  { label: isAr ? '📄  تنزيل بصيغة PDF' : '📄  Download as PDF', action: handleExportPdf },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '9px 14px', background: 'none',
                    borderTopWidth: "0px",
                    borderTopStyle: "none",
                    borderTopColor: "currentColor",
                    borderRightWidth: "0px",
                    borderRightStyle: "none",
                    borderRightColor: "currentColor",
                    borderLeftWidth: "0px",
                    borderLeftStyle: "none",
                    borderLeftColor: "currentColor",
                    borderBottomWidth: "1px",
                    borderBottomStyle: "solid",
                    borderBottomColor: "var(--border)", cursor: 'pointer', fontSize: 'var(--text-caption)', fontFamily: 'var(--font-sans)', color: 'var(--ink-1)', textAlign: 'left' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* System Users button — HR_ADMIN / MANAGER only */}
          {(viewerRole === 'HR_ADMIN' || viewerRole === 'MANAGER') && systemUsers.length > 0 && (
            <button
              onClick={() => setSystemUsersOpen(v => !v)}
              style={viewBtnStyle(systemUsersOpen)}
              aria-label={isAr ? 'مستخدمو النظام' : 'System Users'}
            >
              <Monitor size={13} strokeWidth={2} />
              {isAr ? 'النظام' : 'System'}
              <span style={{
                marginLeft:   2,
                fontSize:     'var(--text-caption)',
                fontWeight:   700,
                background:   systemUsersOpen ? 'var(--accent-700)' : 'var(--border)',
                color:        systemUsersOpen ? 'white' : 'var(--ink-3)',
                padding:      '1px 5px',
                borderRadius: 8,
              }}>
                {systemUsers.length}
              </span>
            </button>
          )}

          {/* Filter button */}
          <button
            onClick={() => { setFiltersOpen(v => !v); if (!filtersOpen) setAnalyticsOpen(false) }}
            style={{
              ...viewBtnStyle(filtersOpen || filterCount > 0),
              position: 'relative',
            }}
            aria-label={isAr ? 'عوامل التصفية' : 'Filters'}
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
            {filterCount > 0 && (
              <span style={{
                position:     'absolute',
                top:          -4,
                right:        -4,
                width:        16,
                height:       16,
                borderRadius: '50%',
                background:   'var(--accent)',
                color:        'white',
                fontSize:     'var(--text-caption)',
                fontWeight:   700,
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
              }}>
                {filterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      {showStats && <OrgChartStatsBar meta={currentMeta} viewerRole={viewerRole} />}

      {/* ── Active filter chips ──────────────────────────────────────────── */}
      {showChips && (
        <div style={{
          height:       36,
          minHeight:    36,
          display:      'flex',
          alignItems:   'center',
          padding:      '0 12px',
          gap:          6,
          background:   'var(--surface)',
          borderBottom: '1px solid var(--border)',
          overflowX:    'auto',
          flexShrink:   0,
        }}>
          {chips.map(chip => (
            <div
              key={chip.label}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          4,
                height:       24,
                padding:      '0 10px',
                borderRadius: 20,
                background:   'var(--accent-100)',
                color:        'var(--brand-active)',
                fontSize:     'var(--text-caption)',
                fontFamily:   'var(--font-sans)',
                fontWeight:   500,
                whiteSpace:   'nowrap',
                flexShrink:   0,
              }}
            >
              {chip.label}
              <button
                onClick={() => setActiveFilters(chip.clear(activeFilters))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--brand-active)', display: 'flex', alignItems: 'center' }}
                aria-label={isAr ? `إزالة عامل التصفية ${chip.label}` : `Remove ${chip.label} filter`}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          ))}
          {chips.length > 1 && (
            <button
              onClick={() => setActiveFilters(DEFAULT_FILTERS)}
              style={{
                height:       24,
                padding:      '0 10px',
                borderRadius: 20,
                background:   'var(--surface)',
                border:       '1px solid var(--border)',
                color:        'var(--ink-2)',
                fontSize:     'var(--text-caption)',
                fontFamily:   'var(--font-sans)',
                cursor:       'pointer',
                whiteSpace:   'nowrap',
                flexShrink:   0,
              }}
            >
              {isAr ? 'مسح الكل' : 'Clear all'}
            </button>
          )}
        </div>
      )}

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--bg-rgb, 255,255,255), 0.6)', zIndex: 20, fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            {isAr ? 'جارٍ التحميل…' : 'Loading…'}
          </div>
        )}
        {!loading && filteredNodes.length === 0 && (
          <div style={{
            position:       'absolute',
            inset:          0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            12,
            zIndex:         10,
            pointerEvents:  'none',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="3" width="6" height="5" rx="1"/>
              <rect x="2" y="16" width="6" height="5" rx="1"/>
              <rect x="9" y="16" width="6" height="5" rx="1"/>
              <rect x="16" y="16" width="6" height="5" rx="1"/>
              <path d="M12 8v3M5 16v-2h14v2M12 11v5"/>
            </svg>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', margin: 0 }}>
              {isAr ? 'لا توجد وظائف مطابقة لعوامل التصفية الحالية.' : 'No positions match the current filters.'}
            </p>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-sans)', margin: 0 }}>
              {isAr ? 'جرّب مسح عوامل التصفية أو التبديل إلى عرض كامل المؤسسة.' : 'Try clearing filters or switching to the full organisation view.'}
            </p>
          </div>
        )}
        <OrgChartCanvas
          nodes={filteredNodes}
          edges={rfEdges}
          meta={meta}
          onNodeClick={nodeId => setSelectedId(nodeId)}
          controlsRef={chartControlsRef}
          viewerRole={viewerRole}
          onAriaToggle={() => setAriaOpen(v => !v)}
          ariaOpen={ariaOpen}
        />
      </div>

      {/* ── Filter panel ────────────────────────────────────────────────── */}
      {filtersOpen && (
        <OrgChartFilters
          filters={activeFilters}
          onChange={setActiveFilters}
          onClose={() => setFiltersOpen(false)}
          departments={departments}
          viewerRole={viewerRole}
        />
      )}

      {/* ── Analytics panel (position engine only) ─────────────────────── */}
      {analyticsOpen && activeEngine === 'position' && (
        <OrgChartAnalytics
          meta={{
            totalPositions: currentMeta.totalPositions ?? currentMeta.totalNodes,
            occupiedCount:  currentMeta.occupiedCount  ?? 0,
            vacantCount:    currentMeta.vacantCount    ?? 0,
            frozenCount:    currentMeta.frozenCount    ?? 0,
            actingCount:    currentMeta.actingCount    ?? 0,
            maxDepth:       currentMeta.maxDepth,
          }}
          nodes={filteredNodes}
          onClose={() => setAnalyticsOpen(false)}
        />
      )}

      {/* ── Banner notification ─────────────────────────────────────────── */}
      {bannerMsg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink-1)', color: 'var(--bg)', padding: '8px 16px', borderRadius: 8, fontSize: 'var(--text-caption)', fontFamily: 'var(--font-sans)', zIndex: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', pointerEvents: 'none' }}>
          {bannerMsg}
        </div>
      )}

      {/* ── Task E: Action Panel ────────────────────────────────────────── */}
      {actionPanel && (() => {
        // Resolve by UNIQUE node id — positionId is not unique (see onActionClick).
        const node = rfNodes.find(n => n.id === actionPanel.nodeId)
        if (!node) return null
        return (
          <OrgChartActionPanel
            nodeId={actionPanel.nodeId}
            nodeData={node.data}
            nodeType={node.type as 'employee' | 'vacant' | 'acting' | 'frozen'}
            anchorPos={actionPanel.anchorPos}
            viewerRole={viewerRole}
            onClose={() => setActionPanel(null)}
            // Carry the unique node id into the drawers so they resolve the SAME node.
            onHireClick={()  => { setActionPanel(null); setAriaOpen(false); setHiringDrawer({ positionId: node.data.positionId }) }}
            onTransfer={(_id, type) => { setActionPanel(null); setAriaOpen(false); setTransferDrawer({ nodeId: actionPanel.nodeId, type }) }}
            onActing={()     => { setActionPanel(null); setAriaOpen(false); setActingDrawer({ nodeId: actionPanel.nodeId }) }}
            // Use the clicked node's OWN personId; tag the origin so the profile
            // page's Back returns to the org chart. EMPLOYEE has no access to the
            // /persons admin route (middleware-gated) and may only view themselves,
            // so route them to their own ESS profile instead of a blocked /persons URL.
            onViewProfile={(pid) => {
              setActionPanel(null)
              if (viewerRole === 'EMPLOYEE') {
                // Employees can't open the full /persons HR profile. Own node →
                // their ESS profile; a colleague → read-only directory card.
                router.push(pid === currentPersonId ? '/me/profile' : `/me/directory/${pid}?from=org-chart`)
              } else {
                router.push(`/persons/${pid}?from=org-chart`)
              }
            }}
          />
        )
      })()}

      {/* ── Task E: Hiring Request Drawer ───────────────────────────────── */}
      {hiringDrawer && (
        <HiringRequestDrawer
          positionId={hiringDrawer.positionId}
          nodes={rfNodes}
          onClose={() => setHiringDrawer(null)}
        />
      )}

      {/* ── Task E: Transfer Request Drawer ─────────────────────────────── */}
      {transferDrawer && (() => {
        // Resolve by unique node id; pass the resolved node's positionId to the action.
        const node = rfNodes.find(n => n.id === transferDrawer.nodeId)
        if (!node) return null
        return (
          <TransferRequestDrawer
            nodeId={node.data.positionId}
            nodeData={node.data}
            departments={departments}
            initialRequestType={transferDrawer.type}
            onClose={() => setTransferDrawer(null)}
          />
        )
      })()}

      {/* ── Task E: Acting Manager Drawer ───────────────────────────────── */}
      {actingDrawer && (() => {
        // Resolve by unique node id (ActingManagerDrawer uses nodeData.positionId).
        const node = rfNodes.find(n => n.id === actingDrawer.nodeId)
        if (!node) return null
        return (
          <ActingManagerDrawer
            nodeId={node.id}
            nodeData={node.data}
            onClose={() => setActingDrawer(null)}
          />
        )
      })()}

      {/* ── System Users Panel ──────────────────────────────────────────── */}
      {systemUsersOpen && systemUsers.length > 0 && (
        <SystemUsersPanel
          users={systemUsers}
          onClose={() => setSystemUsersOpen(false)}
        />
      )}

      {/* ── Task G: ARIA Panel ──────────────────────────────────────────── */}
      {viewerRole !== 'EMPLOYEE' && (
        <OrgChartAriaPanel
          isOpen={ariaOpen}
          onClose={() => setAriaOpen(false)}
          viewerRole={viewerRole}
          orgContext={{
            totalPositions: meta.totalPositions ?? meta.totalNodes ?? 0,
            vacantCount:    meta.vacantCount ?? 0,
            occupiedCount:  meta.occupiedCount ?? meta.totalNodes ?? 0,
            deptNames:      departments.map(d => d.nameEn),
            currentPersonId,
          }}
          nodes={rfNodes}
          departments={departments}
        />
      )}
    </div>
  )
}
