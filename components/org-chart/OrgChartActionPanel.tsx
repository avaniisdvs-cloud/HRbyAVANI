'use client'

import { useEffect, useRef } from 'react'
import { useRouter }          from 'next/navigation'
import {
  User, ArrowLeftRight, TrendingUp, UserCheck,
  Pencil, Lock, Snowflake, Plus,
} from 'lucide-react'
import { useToast }             from '@/hooks/use-toast'
import { useLocale }            from '@/components/providers/LocaleProvider'
import {
  togglePositionConfidential,
  togglePositionFrozen,
} from '@/modules/core-hr/org-chart-actions'
import type { OrgNodeData, OrgNodeType, OrgViewerRole } from '@/lib/org-chart/types'

interface ActionPanelProps {
  nodeId:        string
  nodeData:      OrgNodeData
  nodeType:      OrgNodeType
  anchorPos:     { x: number; y: number }
  viewerRole:    OrgViewerRole
  onClose:       () => void
  onHireClick:   (nodeId: string) => void
  onTransfer:    (nodeId: string, type: 'TRANSFER' | 'PROMOTION') => void
  onActing:      (nodeId: string) => void
  onViewProfile: (personId: string) => void
}

const ROW: React.CSSProperties = {
  height:      36,
  display:     'flex',
  alignItems:  'center',
  gap:         10,
  paddingLeft: 12,
  paddingRight:12,
  cursor:      'pointer',
  fontSize:    'var(--text-body)',
  fontFamily:  'var(--font-sans)',
  color:       'var(--ink-1)',
  background:  'transparent',
  border:      'none',
  width:       '100%',
  textAlign:   'left',
}

const SEP: React.CSSProperties = {
  height:    1,
  background:'var(--border)',
  margin:    '4px 0',
}

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon:    React.ReactNode
  label:   string
  onClick: () => void
}) {
  return (
    <button
      style={ROW}
      onClick={onClick}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      <span style={{ color: 'var(--ink-3)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      {label}
    </button>
  )
}

export function OrgChartActionPanel({
  nodeId,
  nodeData,
  nodeType,
  anchorPos,
  viewerRole,
  onClose,
  onHireClick,
  onTransfer,
  onActing,
  onViewProfile,
}: ActionPanelProps) {
  const router   = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const locale    = useLocale()

  const isAr       = locale === 'ar'
  const isOccupied = nodeType === 'employee' || nodeType === 'acting'
  const isVacant   = nodeType === 'vacant' || nodeType === 'frozen'
  const isManager  = viewerRole === 'MANAGER'  || viewerRole === 'HR_ADMIN'
  const isAdmin    = viewerRole === 'HR_ADMIN'

  // Edge detection: flip left if panel would overflow right edge
  const panelWidth = 210
  const flipLeft   = typeof window !== 'undefined' && (anchorPos.x + panelWidth > window.innerWidth - 16)
  const left       = flipLeft ? anchorPos.x - panelWidth - 10 : anchorPos.x

  // Close on outside click or Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onMouse = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouse)
    }
  }, [onClose])

  // Section builders
  const generalActions: React.ReactNode[] = []
  const managerActions: React.ReactNode[] = []
  const adminActions:   React.ReactNode[] = []

  // ALL ROLES — occupied node: View Profile
  if (isOccupied && nodeData.personId) {
    generalActions.push(
      <ActionRow
        key="view-profile"
        icon={<User size={15} strokeWidth={2} />}
        label={isAr ? 'عرض الملف الشخصي' : 'View Profile'}
        onClick={() => { onClose(); onViewProfile(nodeData.personId!) }}
      />
    )
  }

  // MANAGER + HR_ADMIN — occupied node
  if (isOccupied && isManager) {
    managerActions.push(
      <ActionRow
        key="transfer"
        icon={<ArrowLeftRight size={15} strokeWidth={2} />}
        label={isAr ? 'طلب نقل' : 'Request Transfer'}
        onClick={() => { onClose(); onTransfer(nodeId, 'TRANSFER') }}
      />,
      <ActionRow
        key="promotion"
        icon={<TrendingUp size={15} strokeWidth={2} />}
        label={isAr ? 'طلب ترقية' : 'Request Promotion'}
        onClick={() => { onClose(); onTransfer(nodeId, 'PROMOTION') }}
      />,
      <ActionRow
        key="acting"
        icon={<UserCheck size={15} strokeWidth={2} />}
        label={isAr ? 'تعيين مدير بالإنابة' : 'Assign Acting Manager'}
        onClick={() => { onClose(); onActing(nodeId) }}
      />
    )
  }

  // HR_ADMIN — any node: Edit Position, Mark Confidential, Freeze Position
  if (isAdmin) {
    adminActions.push(
      <ActionRow
        key="edit-pos"
        icon={<Pencil size={15} strokeWidth={2} />}
        label={isAr ? 'تعديل المنصب' : 'Edit Position'}
        onClick={() => {
          onClose()
          router.push(`/master-data/positions?edit=${nodeData.positionId}`)
        }}
      />,
      <ActionRow
        key="confidential"
        icon={<Lock size={15} strokeWidth={2} />}
        label={nodeData.isConfidential
          ? (isAr ? 'إلغاء التمييز كسري' : 'Unmark Confidential')
          : (isAr ? 'تمييز كسري' : 'Mark Confidential')}
        onClick={() => {
          const reason = window.prompt(
            nodeData.isConfidential
              ? (isAr ? 'سبب إلغاء التمييز كسري (١٠ أحرف على الأقل):' : 'Reason for unmarking confidential (min 10 chars):')
              : (isAr ? 'سبب التمييز كسري (١٠ أحرف على الأقل):' : 'Reason for marking confidential (min 10 chars):')
          )
          if (!reason || reason.trim().length < 10) return
          onClose()
          void togglePositionConfidential(nodeData.positionId, reason).then(result => {
            if (result.success) {
              toast({ title: result.newValue
                ? (locale === 'ar' ? 'تم تمييز المنصب كسري' : 'Position marked confidential')
                : (locale === 'ar' ? 'تم إلغاء تمييز المنصب كسري' : 'Position unmarked confidential') })
            } else {
              toast({ title: locale === 'ar' ? 'خطأ' : 'Error', description: result.error, variant: 'destructive' })
            }
          })
        }}
      />,
      <ActionRow
        key="freeze"
        icon={<Snowflake size={15} strokeWidth={2} />}
        label={nodeData.isFrozen
          ? (isAr ? 'إلغاء تجميد المنصب' : 'Unfreeze Position')
          : (isAr ? 'تجميد المنصب' : 'Freeze Position')}
        onClick={() => {
          const reason = window.prompt(
            nodeData.isFrozen
              ? (isAr ? 'سبب إلغاء تجميد هذا المنصب:' : 'Reason for unfreezing this position:')
              : (isAr ? 'سبب تجميد هذا المنصب:' : 'Reason for freezing this position:')
          )
          if (reason === null) return
          if (!nodeData.isFrozen && !reason.trim()) return
          onClose()
          void togglePositionFrozen(nodeData.positionId, reason || (isAr ? 'إجراء إداري' : 'Admin action')).then(result => {
            if (result.success) {
              toast({ title: result.newValue
                ? (locale === 'ar' ? 'تم تجميد المنصب' : 'Position frozen')
                : (locale === 'ar' ? 'تم إلغاء تجميد المنصب' : 'Position unfrozen') })
            } else {
              toast({ title: locale === 'ar' ? 'خطأ' : 'Error', description: result.error, variant: 'destructive' })
            }
          })
        }}
      />
    )
  }

  // MANAGER + HR_ADMIN — vacant node: Create Hiring Request
  if (isVacant && isManager) {
    managerActions.push(
      <ActionRow
        key="hire"
        icon={<Plus size={15} strokeWidth={2} />}
        label={isAr ? 'إنشاء طلب توظيف' : 'Create Hiring Request'}
        onClick={() => { onClose(); onHireClick(nodeId) }}
      />
    )
  }

  // Determine sections with content
  const sections: React.ReactNode[][] = [
    generalActions,
    managerActions,
    adminActions,
  ].filter(s => s.length > 0)

  return (
    <div
      ref={panelRef}
      style={{
        position:     'fixed',
        left:         left,
        top:          anchorPos.y,
        width:        panelWidth,
        background:   'var(--card)',
        border:       '1px solid var(--border)',
        borderRadius: 10,
        boxShadow:    '0 8px 24px rgba(0,0,0,0.12)',
        zIndex:       50,
        overflow:     'hidden',
        paddingTop:   4,
        paddingBottom:4,
      }}
      // Stop click propagation so React Flow doesn't swallow events
      onMouseDown={e => e.stopPropagation()}
    >
      {sections.map((section, i) => (
        <div key={i}>
          {i > 0 && <div style={SEP} />}
          {section}
        </div>
      ))}
    </div>
  )
}
