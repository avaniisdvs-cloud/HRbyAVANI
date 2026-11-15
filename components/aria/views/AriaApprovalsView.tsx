'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  Loader2, ClipboardCheck, User, Calendar, RefreshCw,
} from 'lucide-react'
import {
  getPendingApprovalsForUser,
  approveRequest,
  rejectRequest,
} from '@/modules/aria'
import type { PendingApproval } from '@/modules/aria'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { Locale } from '@/lib/i18n'

interface Props {
  onAskAria: (prompt: string) => void
}

// ── ApprovalCard ──────────────────────────────────────────────────────────────

function ApprovalCard({
  item,
  onDone,
  locale,
}: {
  item:   PendingApproval
  onDone: (id: string) => void
  locale: Locale
}) {
  const [expanded,     setExpanded]     = useState(false)
  const [showReject,   setShowReject]   = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [actionDone,   setActionDone]   = useState<'approved' | 'rejected' | null>(null)
  const [isPending,    setIsPending]    = useState(false)
  const [error,        setError]        = useState('')

  const handleApprove = async () => {
    setError('')
    setIsPending(true)
    try {
      const result = await approveRequest(item.instanceId, '', '')
      if (result.success) {
        setActionDone('approved')
        setTimeout(() => onDone(item.instanceId), 1800)
      } else {
        setError(result.error ?? (locale === 'ar' ? 'فشلت الموافقة' : 'Approval failed'))
      }
    } finally {
      setIsPending(false)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError(locale === 'ar' ? 'يرجى إدخال سبب الرفض' : 'Please enter a rejection reason')
      return
    }
    setError('')
    setIsPending(true)
    try {
      const result = await rejectRequest(item.instanceId, rejectReason, '')
      if (result.success) {
        setActionDone('rejected')
        setTimeout(() => onDone(item.instanceId), 1800)
      } else {
        setError(result.error ?? (locale === 'ar' ? 'فشل الرفض' : 'Rejection failed'))
      }
    } finally {
      setIsPending(false)
    }
  }

  if (actionDone) {
    const isApproved = actionDone === 'approved'
    return (
      <div style={{
        background: isApproved ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)',
        border:     `1px solid ${isApproved ? 'var(--status-approved-fg)' : 'var(--status-rejected-fg)'}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {isApproved
          ? <CheckCircle size={16} style={{ color: 'var(--status-approved-fg)', flexShrink: 0 }} />
          : <XCircle    size={16} style={{ color: 'var(--status-rejected-fg)', flexShrink: 0 }} />
        }
        <span style={{
          fontSize: 'var(--text-body)', fontWeight: 600,
          color: isApproved ? 'var(--status-approved-fg)' : 'var(--status-rejected-fg)',
        }}>
          {locale === 'ar'
            ? `${isApproved ? '✓ تمت الموافقة' : '✗ تم الرفض'} — طلب ${item.initiatorName}`
            : `${isApproved ? '✓ Approved' : '✗ Rejected'} — ${item.initiatorName}'s request`}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--card)',
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: "var(--border)",
      borderRightWidth: "1px",
      borderRightStyle: "solid",
      borderRightColor: "var(--border)",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      borderBottomColor: "var(--border)",
      borderLeftWidth: "4px",
      borderLeftStyle: "solid",
      borderLeftColor: (item.daysPending >= 2 || item.isBreached) ? "var(--status-pending-fg)" : "var(--border)",
      borderRadius: '0 10px 10px 0',
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--accent)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--text-body)', fontWeight: 700, flexShrink: 0,
        }}>
          {item.initiatorName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
          marginBottom: 2 }}>
            {item.initiatorName}
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={10} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.department}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 999,
            fontSize: 'var(--text-caption)', fontWeight: 700,
            background: item.daysPending >= 2 || item.isBreached
              ? 'var(--status-pending-bg)' : 'var(--surface)',
            color: item.daysPending >= 2 || item.isBreached
              ? 'var(--status-pending-fg)' : 'var(--ink-4)',
          }}>
            <Clock size={9} />
            {item.daysPending === 0 ? (locale === 'ar' ? 'اليوم' : 'Today') : (locale === 'ar' ? `${item.daysPending} يوم` : `${item.daysPending}d`)}
          </span>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 2 }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Leave summary pill — always visible */}
      {item.leaveType && (
        <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            padding: '3px 10px', borderRadius: 999,
            fontSize: 'var(--text-caption)', fontWeight: 600,
            background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)',
          }}>
            {item.leaveType}
          </span>
          {item.leaveFrom && item.leaveTo && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={10} />
              {item.leaveFrom} → {item.leaveTo}
              {item.leaveDays && (
                <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>· {locale === 'ar' ? `${item.leaveDays} يوم` : `${item.leaveDays}d`}</span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', background: 'var(--surface)' }}>
          {([
            item.balanceBefore !== undefined && { label: locale === 'ar' ? 'الرصيد الحالي' : 'Current Balance', value: locale === 'ar' ? `${item.balanceBefore} يوم` : `${item.balanceBefore} days` },
            item.leaveReason                 && { label: locale === 'ar' ? 'السبب' : 'Reason',          value: item.leaveReason },
            { label: locale === 'ar' ? 'سير العمل' : 'Workflow',   value: item.workflowType },
            { label: locale === 'ar' ? 'تاريخ التقديم' : 'Submitted',  value: item.submittedAt },
          ] as (false | { label: string; value: string })[]).filter(Boolean).map((row) => {
            const { label, value } = row as { label: string; value: string }
            return (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-caption)',
              }}>
                <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{label}</span>
                <span style={{ color: 'var(--ink-1)', fontWeight: 500, textAlign: 'right',
                marginLeft: 12 }}>
                  {value}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '6px 14px', fontSize: 'var(--text-caption)',
          color: 'var(--status-rejected-fg)', background: 'var(--status-rejected-bg)',
        }}>
          {error}
        </div>
      )}

      {/* Reject textarea */}
      {showReject && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder={locale === 'ar' ? 'سبب الرفض (مطلوب)' : 'Reason for rejection (required)'}
            rows={2}
            style={{
              width: '100%', padding: '8px 10px',
              border: '1px solid var(--status-rejected-fg)', borderRadius: 7,
              fontSize: 'var(--text-caption)', color: 'var(--ink-1)', background: 'var(--card)',
              resize: 'none', outline: 'none',
              fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        {!showReject ? (
          <>
            <button
              onClick={handleApprove}
              disabled={isPending}
              style={{
                flex: 1, padding: '8px 10px',
                background: 'var(--status-approved-bg)', color: 'var(--status-approved-fg)',
                border: '1px solid var(--status-approved-fg)', borderRadius: 7,
                fontSize: 'var(--text-caption)', fontWeight: 700,
                cursor: isPending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {isPending
                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                : <CheckCircle size={12} />
              }
              {locale === 'ar' ? 'موافقة' : 'Approve'}
            </button>

            <button
              onClick={() => { setShowReject(true); setError('') }}
              disabled={isPending}
              style={{
                flex: 1, padding: '8px 10px',
                background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)',
                border: '1px solid var(--status-rejected-fg)', borderRadius: 7,
                fontSize: 'var(--text-caption)', fontWeight: 700,
                cursor: isPending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <XCircle size={12} />
              {locale === 'ar' ? 'رفض' : 'Reject'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={isPending || !rejectReason.trim()}
              style={{
                flex: 1, padding: '8px 10px',
                background: 'var(--status-rejected-fg)', color: 'white',
                border: 'none', borderRadius: 7,
                fontSize: 'var(--text-caption)', fontWeight: 700,
                cursor: isPending || !rejectReason.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontFamily: 'var(--font-sans)',
                opacity: !rejectReason.trim() ? 0.5 : 1,
              }}
            >
              {isPending
                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                : <XCircle size={12} />
              }
              {locale === 'ar' ? 'تأكيد الرفض' : 'Confirm Reject'}
            </button>
            <button
              onClick={() => { setShowReject(false); setRejectReason(''); setError('') }}
              disabled={isPending}
              style={{
                padding: '8px 14px', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 7,
                fontSize: 'var(--text-caption)', color: 'var(--ink-2)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AriaApprovalsView({ onAskAria }: Props) {
  const locale = useLocale()
  const [items,   setItems]   = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    ;(async () => {
      try {
        const data = await getPendingApprovalsForUser()
        setItems(data)
      } catch (err) {
        console.error('[AriaApprovalsView]', err)
        setItems([])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => { load() }, [load])

  const removeItem = (id: string) =>
    setItems(prev => prev.filter(i => i.instanceId !== id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600,
            color: 'var(--ink-1)', margin: '0 0 2px',
          }}>
            {locale === 'ar' ? 'الموافقات المعلّقة' : 'Pending Approvals'}
          </h2>
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: 0 }}>
            {loading
              ? (locale === 'ar' ? 'جارٍ التحميل...' : 'Loading...')
              : items.length === 0
                ? (locale === 'ar' ? 'كل شيء على ما يرام — لا توجد موافقات معلّقة' : 'All caught up — no pending approvals')
                : (locale === 'ar'
                    ? `${items.length} عنصر بانتظار قرارك`
                    : `${items.length} item${items.length !== 1 ? 's' : ''} awaiting your decision`)
            }
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {items.length > 0 && (
            <button
              onClick={() => onAskAria(
                `I have ${items.length} pending approval${items.length !== 1 ? 's' : ''}. ` +
                `Summarise them and recommend which to approve based on leave balances and team coverage.`
              )}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7,
                fontSize: 'var(--text-caption)', color: 'var(--brand-active)', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {locale === 'ar' ? 'اطلب من ARIA التلخيص' : 'Ask ARIA to summarise'}
            </button>
          )}

          <button
            onClick={load}
            disabled={loading}
            title={locale === 'ar' ? 'تحديث' : 'Refresh'}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '7px 10px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={13} style={{ color: 'var(--ink-3)', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* List — scrollable */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px 24px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>

        {/* Loading skeleton */}
        {loading && [1, 2, 3].map(i => (
          <div key={i} style={{
            height: 90, borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.6,
          }} />
        ))}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            paddingTop: 60, gap: 12, textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--status-approved-bg)',
              border: '1px solid var(--status-approved-fg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--status-approved-fg)',
            }}>
              <ClipboardCheck size={22} />
            </div>
            <div>
              <p style={{
                fontSize: 14, fontWeight: 600, color: 'var(--ink-2)',
                margin: '0 0 4px', fontFamily: 'var(--font-serif)',
              }}>
                {locale === 'ar' ? 'كل شيء على ما يرام' : 'All caught up'}
              </p>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: 0 }}>
                {locale === 'ar' ? 'لا توجد موافقات معلّقة مسندة إليك' : 'No pending approvals assigned to you'}
              </p>
            </div>
          </div>
        )}

        {/* Approval cards */}
        {!loading && items.map(item => (
          <ApprovalCard
            key={item.instanceId}
            item={item}
            onDone={removeItem}
            locale={locale}
          />
        ))}
      </div>
    </div>
  )
}
