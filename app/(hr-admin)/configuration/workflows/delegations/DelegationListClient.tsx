'use client'

import { PageTitle } from '@/components/ui/typography'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GitBranch, MoreHorizontal, Plus, Eye, XCircle } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { DelegationRuleRow } from '@/modules/workflow/actions'
import { revokeDelegationRule } from '@/modules/workflow/actions'
import { DelegationDrawer } from './DelegationDrawer'

type StatusFilter = 'ALL' | 'ACTIVE' | 'EXPIRED' | 'REVOKED'

interface Props {
  initialRules: DelegationRuleRow[]
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { background: string; color: string }> = {
    ACTIVE:  { background: 'var(--success-050, #ecfdf5)', color: 'var(--success-700, #15803d)' },
    EXPIRED: { background: 'var(--surface, #f4f4f5)',     color: 'var(--ink-3, #71717a)'       },
    REVOKED: { background: 'var(--danger-050, #fef2f2)',  color: 'var(--danger-700, #b91c1c)'  },
  }
  const s = styles[status] ?? styles.EXPIRED
  return (
    <span style={{
      ...s,
      fontSize: 'var(--text-caption)',
      fontWeight: 600,
      borderRadius: 4,
      padding: '2px 8px',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {status}
    </span>
  )
}

function WorkflowCodePills({ codes }: { codes: string[] | null }) {
  const locale = useLocale()
  if (!codes || codes.length === 0) {
    return <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'الكل' : 'All'}</span>
  }
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {codes.map(c => (
        <span
          key={c}
          style={{
            fontSize: 'var(--text-caption)',
            fontWeight: 500,
            background: 'var(--accent-050, #eff6ff)',
            color: 'var(--accent-700, #1d4ed8)',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          {c}
        </span>
      ))}
    </span>
  )
}

export function DelegationListClient({ initialRules }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = filter === 'ALL' ? initialRules : initialRules.filter(r => r.status === filter)

  function handleRevoke(id: string) {
    setMenuOpenId(null)
    startTransition(async () => {
      const result = await revokeDelegationRule(id)
      if (result.success) {
        router.refresh()
      } else {
        setRevokeError(result.error ?? 'Failed to revoke delegation rule.')
      }
    })
  }

  function handleCreated() {
    setDrawerOpen(false)
    router.refresh()
  }

  const filterBtns: StatusFilter[] = ['ALL', 'ACTIVE', 'EXPIRED', 'REVOKED']
  const filterLabelAr: Record<StatusFilter, string> = {
    ALL:     'الكل',
    ACTIVE:  'نشطة',
    EXPIRED: 'منتهية',
    REVOKED: 'مُلغاة',
  }

  return (
    <>
      {revokeError && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)',
          fontSize: 'var(--text-body)', fontWeight: 500, display: 'flex', justifyContent: 'space-between',
        }}>
          {revokeError}
          <button onClick={() => setRevokeError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 'var(--text-lead)', lineHeight: 1 }}>×</button>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitBranch size={20} color="var(--accent)" />
          <div>
            <PageTitle style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'قواعد التفويض' : 'Delegation Rules'}
            </PageTitle>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)',
            marginRight: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginTop: 2 }}>
              {locale === 'ar' ? 'إدارة قواعد تفويض سير العمل — من يعتمد نيابةً عن من.' : 'Manage workflow delegation rules — who approves on behalf of whom.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: "var(--on-accent)",
            border: 'none', borderRadius: 'var(--radius)', padding: '8px 14px',
            fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          {locale === 'ar' ? 'تفويض جديد' : 'New Delegation'}
        </button>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6,
      marginBottom: 16, flexWrap: 'wrap' }}>
        {filterBtns.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 'var(--text-caption)', fontWeight: 500,
              padding: '5px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: filter === f ? 'var(--accent)' : 'var(--card)',
              color: filter === f ? '#fff' : 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            {locale === 'ar' ? filterLabelAr[f] : f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
            {locale === 'ar' ? 'لا توجد قواعد تفويض.' : 'No delegation rules found.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                  {[
                    { key: 'delegator', label: locale === 'ar' ? 'المُفوِّض' : 'Delegator' },
                    { key: 'delegate',  label: locale === 'ar' ? 'المُفوَّض إليه' : 'Delegate' },
                    { key: 'range',     label: locale === 'ar' ? 'النطاق الزمني' : 'Date Range' },
                    { key: 'workflows', label: locale === 'ar' ? 'مسارات العمل' : 'Workflows' },
                    { key: 'status',    label: locale === 'ar' ? 'الحالة' : 'Status' },
                    { key: 'actions',   label: locale === 'ar' ? 'إجراءات' : 'Actions' },
                  ].map(h => (
                    <th key={h.key} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-2)', fontSize: 'var(--text-caption)', whiteSpace: 'nowrap' }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                      background: 'var(--card)',
                    }}
                  >
                    <td style={{ padding: '10px 14px', color: 'var(--ink-1)', fontWeight: 500 }}>
                      {row.delegatorName ?? <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{row.delegatorId.slice(0, 8)}…</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-1)' }}>
                      {row.delegateName ?? <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>{row.delegateId.slice(0, 8)}…</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', whiteSpace: 'nowrap' }}>
                      {row.delegationFrom} → {row.delegationTo}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <WorkflowCodePills codes={row.workflowCodes} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <StatusPill status={row.status} />
                    </td>
                    <td style={{ padding: '10px 14px', position: 'relative' }}>
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === row.id ? null : row.id)}
                        style={{
                          background: 'none', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)', padding: '4px 6px',
                          cursor: 'pointer', color: 'var(--ink-2)', display: 'flex', alignItems: 'center',
                        }}
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {menuOpenId === row.id && (
                        <div style={{
                          position: 'absolute', right: 8, top: 36, zIndex: 50,
                          background: 'var(--card)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)', minWidth: 140,
                          overflow: 'hidden',
                        }}>
                          <button
                            onClick={() => setMenuOpenId(null)}
                            style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-body)', color: 'var(--ink-1)', display: 'flex', alignItems: 'center', gap: 8 }}
                          >
                            <Eye size={13} /> {locale === 'ar' ? 'عرض' : 'View'}
                          </button>
                          {row.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleRevoke(row.id)}
                              disabled={isPending}
                              style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-body)', color: 'var(--danger, #dc2626)', display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                              <XCircle size={13} /> {locale === 'ar' ? 'إلغاء' : 'Revoke'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dismiss menu on outside click */}
      {menuOpenId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          onClick={() => setMenuOpenId(null)}
        />
      )}

      {drawerOpen && (
        <DelegationDrawer
          onClose={() => setDrawerOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  )
}
