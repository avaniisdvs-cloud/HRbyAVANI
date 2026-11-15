'use client'

/**
 * HierarchyPreviewModal — Unit 8 / Hierarchy Preview What-If Tool
 *
 * Admin-only read-only modal. Simulates who would approve a workflow for a
 * given employee + context without creating any DB records.
 *
 * Hard Rule 7: var(--*) tokens only — no raw hex colours.
 * Hard Rule 5: bilingual labels EN + AR.
 * Styling: inline styles only, no boxShadow on cards.
 * Icons: lucide-react only.
 * Animation: modalIn 180ms ease.
 */

import { useState, useTransition } from 'react'
import { X, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { previewWorkflowChain, type PreviewWorkflowResult } from '@/modules/workflow/actions'
import { type Locale } from '@/lib/i18n'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface HierarchyPreviewModalProps {
  workflowCode: string
  defaultPersonId?: string
  defaultLegalEntityId?: string
  locale?: Locale
  onClose: () => void
}

// ─── Badge helpers ─────────────────────────────────────────────────────────

const HIERARCHY_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  LINE_MANAGER: { bg: 'var(--accent-blue-subtle, #dbeafe)', text: 'var(--accent-blue, #2563eb)' },
  POSITION:     { bg: 'var(--accent-purple-subtle, #ede9fe)', text: 'var(--accent-purple, #7c3aed)' },
  CUSTOM_GROUP: { bg: 'var(--accent-orange-subtle, #ffedd5)', text: 'var(--accent-orange, #ea580c)' },
}

function HierarchyBadge({ type }: { type: string }) {
  const color = HIERARCHY_BADGE_COLORS[type] ?? HIERARCHY_BADGE_COLORS.CUSTOM_GROUP
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 999,
      fontSize: 'var(--text-caption)',
      fontWeight: 600,
      background: color.bg,
      color: color.text,
      letterSpacing: '0.02em',
    }}>
      {type}
    </span>
  )
}

// ─── Step card ─────────────────────────────────────────────────────────────

function StepCard({ step, index }: {
  step: PreviewWorkflowResult['resolvedChain'][number]
  index: number
}) {
  return (
    <div style={{
      display: 'flex',
      gap: 12,
      padding: '10px 12px',
      background: 'var(--canvas, var(--background))',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius, 6px)',
    }}>
      {/* Step number circle */}
      <div style={{
        flexShrink: 0,
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: 'var(--accent-foreground, #fff)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'var(--text-caption)',
        fontWeight: 700,
      }}>
        {index + 1}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-body)', color: 'var(--ink-1)' }}>
            {step.stepName}
          </span>
          {step.isFyiOnly && (
            <span style={{
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: 'var(--text-caption)',
              fontWeight: 700,
              background: 'var(--muted)',
              color: 'var(--ink-3)',
              letterSpacing: '0.05em',
            }}>
              FYI
            </span>
          )}
        </div>

        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', marginTop: 2 }}>
          {step.approverName}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <HierarchyBadge type={step.hierarchyType} />
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
            L{step.stepOrder}
          </span>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginInlineStart: 'auto' }}>
            {step.slaHours}h SLA
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function HierarchyPreviewModal({
  workflowCode,
  defaultPersonId = '',
  defaultLegalEntityId = '',
  locale = 'en',
  onClose,
}: HierarchyPreviewModalProps) {
  const [isPending, startTransition] = useTransition()

  // Inputs
  const [personId, setPersonId] = useState(defaultPersonId)
  const [legalEntityId, setLegalEntityId] = useState(defaultLegalEntityId)

  // Context overrides
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [leaveDays, setLeaveDays] = useState<number | ''>('')
  const [leaveType, setLeaveType] = useState<string>('')
  const [gradeLevel, setGradeLevel] = useState<number | ''>('')
  const [isBackdated, setIsBackdated] = useState(false)

  // Result state — null = not yet run, 'NOT_FOUND' = ran but no definition found
  const [result, setResult] = useState<PreviewWorkflowResult | null | 'NOT_FOUND'>(null)
  const [error, setError] = useState<string | null>(null)
  const ran = result !== null

  const onPreview = () => {
    setError(null)
    if (!personId.trim())      return setError(locale === 'ar' ? 'معرّف الموظف مطلوب.' : 'Employee Person ID is required.')
    if (!legalEntityId.trim()) return setError(locale === 'ar' ? 'معرّف الكيان القانوني مطلوب.' : 'Legal Entity ID is required.')

    const overrides: Record<string, unknown> = {}
    if (leaveDays !== '')    overrides['leave.days']        = leaveDays
    if (leaveType)           overrides['leave.type_code']   = leaveType
    if (gradeLevel !== '')   overrides['employee.grade_level'] = gradeLevel
    if (isBackdated)         overrides['leave.is_backdated'] = true

    startTransition(async () => {
      try {
        const res = await previewWorkflowChain({
          workflowCode,
          submitterPersonId: personId.trim(),
          legalEntityId: legalEntityId.trim(),
          contextOverrides: overrides,
        })
        setResult(res ?? 'NOT_FOUND')
      } catch (e) {
        setError(e instanceof Error ? e.message : (locale === 'ar' ? 'فشلت المعاينة.' : 'Preview failed.'))
      }
    })
  }

  return (
    <>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.97) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,24,36,0.45)',
          zIndex: 100,
        }}
        aria-hidden="true"
      />

      {/* Panel wrapper */}
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 101,
        padding: '16px',
      }}>
        {/* Modal panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
          style={{
            width: '100%',
            maxWidth: 640,
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg, 10px)',
            animation: 'modalIn 180ms ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <h2
                id="preview-modal-title"
                style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}
              >
                {locale === 'ar' ? 'معاينة سلسلة الموافقة' : 'Preview Approval Chain'}
              </h2>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                {workflowCode} · {locale === 'ar' ? 'محاكاة للقراءة فقط' : 'read-only simulation'}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label={locale === 'ar' ? 'إغلاق النافذة' : 'Close modal'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink-3)',
                padding: 4,
                borderRadius: 4,
                display: 'flex',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body — two-panel layout */}
          <div style={{
            flex: 1,
            display: 'flex',
            minHeight: 0,
            overflow: 'hidden',
          }}>
            {/* Left — inputs */}
            <div style={{
              width: 240,
              flexShrink: 0,
              borderInlineEnd: '1px solid var(--border)',
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              {/* Person ID */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                  {locale === 'ar' ? 'معرّف الموظف' : 'Employee Person ID'}
                </label>
                <input
                  type="text"
                  value={personId}
                  onChange={e => setPersonId(e.target.value)}
                  placeholder="UUID"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 'var(--text-caption)',
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--input, var(--background))',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius, 6px)',
                    color: 'var(--ink-1)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Legal Entity ID */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                  {locale === 'ar' ? 'معرّف الكيان القانوني' : 'Legal Entity ID'}
                </label>
                <input
                  type="text"
                  value={legalEntityId}
                  onChange={e => setLegalEntityId(e.target.value)}
                  placeholder="UUID"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 'var(--text-caption)',
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--input, var(--background))',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius, 6px)',
                    color: 'var(--ink-1)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Context overrides — collapsible */}
              <div>
                <button
                  type="button"
                  onClick={() => setOverridesOpen(v => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 'var(--text-caption)',
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                  }}
                >
                  {overridesOpen
                    ? <ChevronDown size={13} />
                    : <ChevronRight size={13} />}
                  {locale === 'ar' ? 'تجاوز قيم السياق' : 'Override context values'}
                </button>

                {overridesOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {/* Leave days */}
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginBottom: 3 }}>
                        {locale === 'ar' ? 'أيام الإجازة' : 'Leave days'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={leaveDays}
                        onChange={e => setLeaveDays(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="—"
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          fontSize: 'var(--text-caption)',
                          background: 'var(--input, var(--background))',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius, 6px)',
                          color: 'var(--ink-1)',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Leave type */}
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginBottom: 3 }}>
                        {locale === 'ar' ? 'نوع الإجازة' : 'Leave type'}
                      </label>
                      <select
                        value={leaveType}
                        onChange={e => setLeaveType(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          fontSize: 'var(--text-caption)',
                          background: 'var(--input, var(--background))',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius, 6px)',
                          color: 'var(--ink-1)',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="">{locale === 'ar' ? '— أي —' : '— Any —'}</option>
                        <option value="ANNUAL">ANNUAL</option>
                        <option value="SICK">SICK</option>
                        <option value="MATERNITY">MATERNITY</option>
                        <option value="HAJJ">HAJJ</option>
                        <option value="EMERGENCY">EMERGENCY</option>
                      </select>
                    </div>

                    {/* Grade level */}
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginBottom: 3 }}>
                        {locale === 'ar' ? 'تجاوز مستوى الدرجة' : 'Grade level override'}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={gradeLevel}
                        onChange={e => setGradeLevel(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="—"
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          fontSize: 'var(--text-caption)',
                          background: 'var(--input, var(--background))',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius, 6px)',
                          color: 'var(--ink-1)',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Is backdated */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isBackdated}
                        onChange={e => setIsBackdated(e.target.checked)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      {locale === 'ar' ? 'بأثر رجعي' : 'Is backdated'}
                    </label>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'flex-start',
                  padding: '6px 8px',
                  background: 'var(--destructive-subtle, #fee2e2)',
                  border: '1px solid var(--destructive-border, #fca5a5)',
                  borderRadius: 'var(--radius, 6px)',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--destructive, #dc2626)',
                }}>
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}

              {/* Preview button */}
              <button
                type="button"
                onClick={onPreview}
                disabled={isPending}
                style={{
                  padding: '8px 16px',
                  background: isPending ? 'var(--muted)' : 'var(--accent)',
                  color: isPending ? 'var(--ink-3)' : 'var(--accent-foreground, #fff)',
                  border: 'none',
                  borderRadius: 'var(--radius, 6px)',
                  fontSize: 'var(--text-caption)',
                  fontWeight: 600,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {isPending && <Loader2 size={13} style={{ animation: 'spin 0.75s linear infinite' }} />}
                {isPending ? (locale === 'ar' ? 'جارٍ الحل…' : 'Resolving…') : (locale === 'ar' ? 'معاينة' : 'Preview')}
              </button>
            </div>

            {/* Right — results */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minWidth: 0,
            }}>
              {isPending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-3)', fontSize: 'var(--text-body)', marginTop: 24, justifyContent: 'center' }}>
                  <Loader2 size={18} style={{ animation: 'spin 0.75s linear infinite' }} />
                  {locale === 'ar' ? 'جارٍ حل السلسلة…' : 'Resolving chain…'}
                </div>
              )}

              {!isPending && !ran && (
                <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textAlign: 'center', marginTop: 32 }}>
                  {locale === 'ar'
                    ? 'أدخل معرّف الموظف والكيان القانوني، ثم انقر على معاينة.'
                    : 'Enter an employee ID and legal entity, then click Preview.'}
                </p>
              )}

              {!isPending && ran && result === 'NOT_FOUND' && (
                <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', textAlign: 'center', marginTop: 24 }}>
                  {locale === 'ar'
                    ? 'لم يتم العثور على تعريف سير عمل لهذا الرمز.'
                    : 'No workflow definition found for this code.'}
                </p>
              )}

              {!isPending && ran && result && result !== 'NOT_FOUND' && (
                <>
                  {/* Chain header */}
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 15, fontWeight: 600, color: 'var(--ink-1)' }}>
                      {result.workflowName}
                    </div>
                    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                      {locale === 'ar'
                        ? `${result.totalSteps} ${result.totalSteps === 1 ? 'خطوة' : 'خطوات'}`
                        : `${result.totalSteps} ${result.totalSteps === 1 ? 'step' : 'steps'}`}
                    </div>
                  </div>

                  {/* Step cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.resolvedChain.map((step, i) => (
                      <StepCard key={step.stepOrder} step={step} index={i} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

    </>
  )
}
