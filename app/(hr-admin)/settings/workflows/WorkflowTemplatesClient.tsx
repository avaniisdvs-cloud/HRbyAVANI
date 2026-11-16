'use client'

import { PageTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition } from 'react'
import { useRouter }               from 'next/navigation'
import { GitBranch, Plus }         from 'lucide-react'
import { useLocale }               from '@/components/providers/LocaleProvider'
import { MdmRowMenu }              from '@/components/mdm/MdmRowMenu'
import { StatusBadge }             from '@/components/mdm/StatusBadge'
import { disableWorkflowTemplate, enableWorkflowTemplate } from '@/modules/config'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkflowTemplateRow {
  id:              string
  workflowCode:    string
  workflowNameEn:  string
  workflowNameAr:  string | null
  triggerEvent:    string
  approvalMode:    string
  slaHours:        number
  escalationHours: number
  isActive:        boolean
  version:         number
  stageCount:      number
}

interface Props {
  templates: WorkflowTemplateRow[]
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding:       '10px 14px',
  textAlign:     'left',
  fontSize:      'var(--text-caption)',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color:         'var(--ink-3)',
  borderBottom:  '1px solid var(--border)',
  whiteSpace:    'nowrap',
  background:    'var(--surface)',
}

const tdStyle: React.CSSProperties = {
  padding:       '12px 14px',
  fontSize:      'var(--text-body)',
  color:         'var(--ink-1)',
  borderBottom:  '1px solid var(--border)',
  verticalAlign: 'middle',
}

// ── Trigger event friendly labels ──────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  HIRE:            'New Hire',
  BACKDATED_HIRE:  'Backdated Hire',
  TRANSFER:        'Transfer',
  LEAVE_REQUEST:   'Leave Request',
  LEAVE:           'Leave',
  SALARY_REVISION: 'Salary Revision',
  TERMINATION:     'Termination',
  DEPENDENT_ADD:   'Add Dependent',
  DOCUMENT_VERIFY: 'Document Verify',
  OVERTIME:        'Overtime',
  EXIT_CLEARANCE:  'Exit Clearance',
}

const TRIGGER_LABELS_AR: Record<string, string> = {
  HIRE:            'تعيين جديد',
  BACKDATED_HIRE:  'تعيين بأثر رجعي',
  TRANSFER:        'نقل',
  LEAVE_REQUEST:   'طلب إجازة',
  LEAVE:           'إجازة',
  SALARY_REVISION: 'مراجعة الراتب',
  TERMINATION:     'إنهاء الخدمة',
  DEPENDENT_ADD:   'إضافة معال',
  DOCUMENT_VERIFY: 'التحقق من مستند',
  OVERTIME:        'عمل إضافي',
  EXIT_CLEARANCE:  'إخلاء الطرف',
}

// ── Component ──────────────────────────────────────────────────────────────────

export function WorkflowTemplatesClient({ templates: initial }: Props) {
  const router                       = useRouter()
  const locale                       = useLocale()
  const [templates, setTemplates]    = useState<WorkflowTemplateRow[]>(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)

  const totalCount    = templates.length
  const activeCount   = templates.filter(t => t.isActive).length
  const inactiveCount = totalCount - activeCount

  function handleDisable(t: WorkflowTemplateRow) {
    startTransition(async () => {
      const res = await disableWorkflowTemplate(t.id)
      if (res.success) {
        setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, isActive: false } : x))
      } else {
        setError(res.error ?? (locale === 'ar' ? 'تعذّر تعطيل القالب' : 'Failed to disable template'))
      }
    })
  }

  function handleEnable(t: WorkflowTemplateRow) {
    startTransition(async () => {
      const res = await enableWorkflowTemplate(t.id)
      if (res.success) {
        setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, isActive: true } : x))
      } else {
        setError(res.error ?? (locale === 'ar' ? 'تعذّر تفعيل القالب' : 'Failed to enable template'))
      }
    })
  }

  return (
    <div>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'flex-end',
        justifyContent: 'space-between',
        marginBottom:   24,
        gap:            16,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width:          42,
            height:         42,
            borderRadius:   10,
            background:     'color-mix(in srgb, var(--accent) 10%, transparent)',
            border:         '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            <GitBranch size={20} style={{ color: 'var(--brand-active)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 500, color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.3px' }}>
                {locale === 'ar' ? 'قوالب سير العمل' : 'Workflow Templates'}
              </PageTitle>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontWeight: 400 }}>
                {locale === 'ar' ? 'Workflow Templates' : 'قوالب سير العمل'}
              </span>
              {/* Counts */}
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{
                  fontSize: 'var(--text-caption)', fontWeight: 600,
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  color: 'var(--brand-active)',
                  padding: '2px 8px', borderRadius: 20,
                }}>
                  {activeCount} {locale === 'ar' ? 'نشط' : 'active'}
                </span>
                {inactiveCount > 0 && (
                  <span style={{
                    fontSize: 'var(--text-caption)', fontWeight: 600,
                    background: 'var(--surface)',
                    color: 'var(--ink-4)',
                    padding: '2px 8px', borderRadius: 20,
                    border: '1px solid var(--border)',
                  }}>
                    {inactiveCount} {locale === 'ar' ? 'غير نشط' : 'inactive'}
                  </span>
                )}
              </div>
            </div>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '4px 0 0' }}>
              {locale === 'ar' ? 'سلاسل اعتماد متعددة الخطوات للإجازات والتعيين والرواتب وغيرها من المعاملات' : 'Multi-step approval chains for leave, hire, salary, and other transactions'}
            </p>
          </div>
        </div>

        {/* New button */}
        <button
          type="button"
          onClick={() => router.push('/settings/workflows/new')}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          7,
            background:   'var(--accent)',
            color:        "var(--on-accent)",
            border:       'none',
            borderRadius: 8,
            padding:      '9px 18px',
            fontSize:     'var(--text-body)',
            fontWeight:   600,
            cursor:       'pointer',
            whiteSpace:   'nowrap',
            flexShrink:   0,
          }}
        >
          <Plus size={15} strokeWidth={2} />
          {locale === 'ar' ? 'قالب جديد' : 'New Template'}
        </button>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          marginBottom: 14,
          padding:      '10px 14px',
          background:   '#FBE9E9',
          border:       '1px solid #FFCDD2',
          borderRadius: 8,
          fontSize:     'var(--text-body)',
          color:        '#C62828',
        }}>
          {error}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>{locale === 'ar' ? 'الرمز' : 'Code'}</th>
              <th style={thStyle}>{locale === 'ar' ? 'الاسم' : 'Name'}</th>
              <th style={thStyle}>{locale === 'ar' ? 'المُشغِّل' : 'Trigger'}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>{locale === 'ar' ? 'الوضع' : 'Mode'}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>{locale === 'ar' ? 'المراحل' : 'Stages'}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>{locale === 'ar' ? 'مستوى الخدمة' : 'SLA'}</th>
              <th style={thStyle}>{locale === 'ar' ? 'الحالة' : 'Status'}</th>
              <th style={{ ...thStyle, width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-4)', padding: '48px 0' }}>
                  {locale === 'ar' ? <>لا توجد قوالب سير عمل بعد. انقر <strong>قالب جديد</strong> لإنشاء أول قالب.</> : <>No workflow templates yet. Click <strong>New Template</strong> to create the first one.</>}
                </td>
              </tr>
            ) : (
              templates.map(t => (
                <tr
                  key={t.id}
                  style={{ opacity: t.isActive ? 1 : 0.55 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 3%, transparent)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Code + version */}
                  <td style={tdStyle}>
                    <span style={{
                      fontFamily:   'var(--font-mono)',
                      fontSize:     'var(--text-caption)',
                      fontWeight:   700,
                      background:   'var(--surface)',
                      border:       '1px solid var(--border)',
                      borderRadius: 4,
                      padding:      '2px 6px',
                      color:        'var(--ink-2)',
                    }}>
                      {t.workflowCode}
                    </span>
                    <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>v{t.version}</span>
                  </td>

                  {/* Name bilingual */}
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, color: 'var(--ink-1)' }}>{t.workflowNameEn}</div>
                    {t.workflowNameAr && (
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', marginTop: 2 }}>
                        {t.workflowNameAr}
                      </div>
                    )}
                  </td>

                  {/* Trigger */}
                  <td style={{ ...tdStyle, color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                    {(locale === 'ar' ? TRIGGER_LABELS_AR[t.triggerEvent] : TRIGGER_LABELS[t.triggerEvent]) ?? t.triggerEvent}
                  </td>

                  {/* Approval mode */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      fontSize:     'var(--text-caption)',
                      fontWeight:   600,
                      padding:      '2px 8px',
                      borderRadius: 20,
                      background:   t.approvalMode === 'SEQUENTIAL'
                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                        : '#FFF3E0',
                      color: t.approvalMode === 'SEQUENTIAL' ? 'var(--brand-active)' : '#E65100',
                    }}>
                      {t.approvalMode === 'SEQUENTIAL'
                        ? (locale === 'ar' ? 'تسلسلي' : 'Sequential')
                        : (locale === 'ar' ? 'متوازٍ' : 'Parallel')}
                    </span>
                  </td>

                  {/* Stage count */}
                  <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {t.stageCount}
                  </td>

                  {/* SLA */}
                  <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                    {t.slaHours}h
                    <span style={{ color: 'var(--ink-4)', marginLeft: 4 }}>/ {locale === 'ar' ? 'تصعيد' : 'esc'} {t.escalationHours}h</span>
                  </td>

                  {/* Status */}
                  <td style={tdStyle}>
                    <StatusBadge active={t.isActive} />
                  </td>

                  {/* ··· menu */}
                  <td style={{ ...tdStyle, textAlign: 'center', padding: '8px 10px' }}>
                    <MdmRowMenu
                      isActive={t.isActive}
                      onEdit={() => router.push(`/settings/workflows/${t.id}`)}
                      onHistory={() => {/* audit drawer — future sprint */}}
                      onDisable={() => handleDisable(t)}
                      onEnable={() => handleEnable(t)}
                      isPending={isPending}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {/* Row count */}
      {templates.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
          {locale === 'ar'
            ? `${totalCount} قالب · ${activeCount} نشط`
            : `${totalCount} template${totalCount !== 1 ? 's' : ''} · ${activeCount} active`}
        </div>
      )}
    </div>
  )
}
