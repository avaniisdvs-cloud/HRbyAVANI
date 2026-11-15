'use client'

/**
 * StepsPageClient — client component for the workflow steps list.
 *
 * Features:
 *   - Vertical list of step cards
 *   - Add Step button → StepEditorDrawer
 *   - Three-dot menu: Edit / Delete / Move Up / Move Down
 *   - Refreshes via router.refresh() after mutations
 */

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, MoreVertical, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { StepEditorDrawer } from './StepEditorDrawer'
import { PreviewChainButton } from '@/components/workflow/PreviewChainButton'
import { deleteWorkflowStep, reorderWorkflowSteps } from '@/modules/workflow/actions'
import type { WorkflowStepV2 } from '@/drizzle/schema/workflow-engine'
import type { PersonOption } from '@/components/forms/PersonSelect'

// ── Effect pill colours ───────────────────────────────────────────────────

// Keys must match `step_effect_enum` values exactly (NORMAL renders nothing via EffectBadge guard).
const EFFECT_COLORS: Record<string, { bg: string; color: string }> = {
  ADD_IF_MATCHES: { bg: '#eff6ff', color: '#2563eb' },
  REPLACE:        { bg: '#fef9c3', color: '#854d0e' },
  SKIP_PREVIOUS:  { bg: '#f0fdf4', color: '#15803d' },
  INJECT_BEFORE:  { bg: '#fdf4ff', color: '#7e22ce' },
  INJECT_AFTER:   { bg: '#fdf4ff', color: '#7e22ce' },
  PARALLEL_ADD:   { bg: '#fefce8', color: '#ca8a04' },
}

function EffectBadge({ effect }: { effect: string }) {
  if (effect === 'NORMAL' || !effect) return null
  const style = EFFECT_COLORS[effect] ?? { bg: 'var(--surface-2, #f4f4f5)', color: 'var(--ink-2)' }
  return (
    <span style={{
      ...style,
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 'var(--text-caption)',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {effect.replace(/_/g, ' ')}
    </span>
  )
}

// ── Three-dot menu ────────────────────────────────────────────────────────

function StepMenu({ onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  onEdit:    () => void
  onDelete:  () => void
  onMoveUp:  () => void
  onMoveDown: () => void
  isFirst:   boolean
  isLast:    boolean
}) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6,
          background: 'transparent', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)',
        }}
        aria-label={locale === 'ar' ? 'خيارات الخطوة' : 'Step options'}
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', right: 0, top: 36, zIndex: 20,
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, minWidth: 140, overflow: 'hidden',
          }}>
            {[
              { key: 'edit', label: locale === 'ar' ? 'تعديل' : 'Edit', icon: <Pencil size={13} />, action: onEdit, disabled: false },
              { key: 'move-up', label: locale === 'ar' ? 'تحريك لأعلى' : 'Move up', icon: <ChevronUp size={13} />, action: onMoveUp, disabled: isFirst },
              { key: 'move-down', label: locale === 'ar' ? 'تحريك لأسفل' : 'Move down', icon: <ChevronDown size={13} />, action: onMoveDown, disabled: isLast },
              { key: 'delete', label: locale === 'ar' ? 'حذف' : 'Delete', icon: <Trash2 size={13} />, action: onDelete, disabled: false, danger: true },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onClick={() => { setOpen(false); if (!item.disabled) item.action() }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', border: 'none', background: 'transparent',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  fontSize: 'var(--text-body)', textAlign: 'left',
                  color: item.danger ? 'var(--error, #dc2626)' : item.disabled ? 'var(--ink-4, #c4c4c4)' : 'var(--ink-1)',
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Step card ─────────────────────────────────────────────────────────────

function StepCard({ step, index, total, onEdit, onDelete, onMoveUp, onMoveDown }: {
  step:      WorkflowStepV2
  index:     number
  total:     number
  onEdit:    () => void
  onDelete:  () => void
  onMoveUp:  () => void
  onMoveDown: () => void
}) {
  const locale = useLocale()
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px',
      background: 'var(--card)', display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      {/* Step number */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--text-body)', fontWeight: 700, flexShrink: 0,
      }}>
        {step.stepOrder}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
            {step.stepNameEn}
          </span>
          {step.stepNameAr && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl' }}>
              {step.stepNameAr}
            </span>
          )}
          <EffectBadge effect={step.stepEffect ?? 'NORMAL'} />
        </div>

        <div style={{ marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 10,
            background: 'var(--surface-2, #f4f4f5)', color: 'var(--ink-2)',
            fontSize: 'var(--text-caption)', fontWeight: 500,
          }}>
            {step.hierarchyType.replace(/_/g, ' ')}
          </span>
          <span>{locale === 'ar' ? 'مستوى الخدمة' : 'SLA'} {step.slaHours}h</span>
          {step.activationConditionId && (
            <span style={{ color: 'var(--brand-active)' }}>{locale === 'ar' ? 'مشروط' : 'Conditional'}</span>
          )}
        </div>
      </div>

      {/* Menu */}
      <StepMenu
        onEdit={onEdit}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        isFirst={index === 0}
        isLast={index === total - 1}
      />
    </div>
  )
}

// ── Page client ───────────────────────────────────────────────────────────

interface StepsPageClientProps {
  workflowId:    string
  workflowCode?: string
  initialSteps:  WorkflowStepV2[]
  groupOptions:  PersonOption[]
}

export function StepsPageClient({ workflowId, workflowCode, initialSteps, groupOptions }: StepsPageClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const [steps, setSteps] = useState<WorkflowStepV2[]>(initialSteps)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingStep, setEditingStep] = useState<WorkflowStepV2 | null>(null)
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  // Sync local list with server data after router.refresh() (e.g. after adding a
  // step). Without this, `steps` keeps its mount-time value and a newly-added step
  // only appears after the component remounts (navigating away and back).
  useEffect(() => {
    setSteps(initialSteps)
  }, [initialSteps])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function openCreate() {
    setEditingStep(null)
    setDrawerOpen(true)
  }

  function openEdit(step: WorkflowStepV2) {
    setEditingStep(step)
    setDrawerOpen(true)
  }

  function handleSaved() {
    showToast(locale === 'ar' ? 'تم حفظ الخطوة.' : 'Step saved.')
    startTransition(() => {
      router.refresh()
    })
  }

  function handleDelete(stepId: string) {
    if (!confirm(locale === 'ar' ? 'حذف هذه الخطوة؟ لا يمكن التراجع عن هذا الإجراء.' : 'Delete this step? This cannot be undone.')) return
    startTransition(async () => {
      const result = await deleteWorkflowStep(stepId)
      if (result.success) {
        setSteps(prev => prev.filter(s => s.id !== stepId))
        showToast(locale === 'ar' ? 'تم حذف الخطوة.' : 'Step deleted.')
        router.refresh()
      } else {
        showToast(result.error ?? (locale === 'ar' ? 'فشل الحذف.' : 'Delete failed.'))
      }
    })
  }

  function handleMove(index: number, direction: 'up' | 'down') {
    const newSteps = [...steps]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newSteps.length) return
    ;[newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]]
    setSteps(newSteps)

    startTransition(async () => {
      await reorderWorkflowSteps(workflowId, newSteps.map(s => s.id))
      router.refresh()
    })
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button
          type="button"
          onClick={openCreate}
          disabled={isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: 'var(--accent)', color: '#fff', cursor: 'pointer',
            fontSize: 'var(--text-body)', fontWeight: 500,
          }}
        >
          <Plus size={15} />
          {locale === 'ar' ? 'إضافة خطوة' : 'Add Step'}
        </button>
        {workflowCode && <PreviewChainButton workflowCode={workflowCode} />}
      </div>

      {/* Steps list */}
      {steps.length === 0 ? (
        <div style={{
          padding: '32px 24px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--ink-3)', fontSize: 'var(--text-body)',
        }}>
          {locale === 'ar' ? <>لا توجد خطوات بعد. انقر <strong>إضافة خطوة</strong> لبناء سلسلة الاعتماد.</> : <>No steps yet. Click <strong>Add Step</strong> to build the approval chain.</>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              index={i}
              total={steps.length}
              onEdit={() => openEdit(step)}
              onDelete={() => handleDelete(step.id)}
              onMoveUp={() => handleMove(i, 'up')}
              onMoveDown={() => handleMove(i, 'down')}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      <StepEditorDrawer
        workflowId={workflowId}
        step={editingStep}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
        groupOptions={groupOptions}
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 'var(--text-body)', zIndex: 100, pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
