'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { CheckCheck, FileText, Calendar, AlertCircle, PenLine } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import {
  getMyNotifications,
  markAllRead,
  getApprovalDetail,
  approveRequest,
  rejectRequest,
  requestInfo,
} from '@/modules/notification'

type NotifItem = {
  id:                 string
  type:               string
  title:              string
  message:            string
  isRead:             boolean
  isActioned:         boolean
  createdAt:          string
  workflowInstanceId: string | null
  referenceId:        string | null
  referenceType:      string | null
}

type Detail = Awaited<ReturnType<typeof getApprovalDetail>>

interface Props {
  personId:       string
  tenantId:       string
  onClose:        () => void
  onCountChange:  (n: number) => void
}

function typeStyle(type: string): { icon: React.ReactNode; bg: string; fg: string } {
  if (type === 'LETTER_SIGN_REQUEST') {
    return {
      icon: <PenLine size={14} />,
      bg:   '#EDE9FE',
      fg:   '#7C3AED',
    }
  }
  if (type.startsWith('LEAVE') || type === 'APPROVAL_REQUIRED' || type === 'APPROVAL_ESCALATION') {
    return {
      icon: <Calendar size={14} />,
      bg:   'var(--status-pending-bg)',
      fg:   'var(--status-pending-fg)',
    }
  }
  if (type === 'LEAVE_APPROVED') {
    return {
      icon: <CheckCheck size={14} />,
      bg:   'var(--status-approved-bg)',
      fg:   'var(--status-approved-fg)',
    }
  }
  if (type === 'LEAVE_REJECTED') {
    return {
      icon: <AlertCircle size={14} />,
      bg:   'var(--status-rejected-bg)',
      fg:   'var(--status-rejected-fg)',
    }
  }
  if (type.includes('DOCUMENT') || type.includes('CONTRACT') || type.includes('WPS')) {
    return {
      icon: <FileText size={14} />,
      bg:   'var(--status-pending-bg)',
      fg:   'var(--status-pending-fg)',
    }
  }
  return {
    icon: <AlertCircle size={14} />,
    bg:   'var(--surface)',
    fg:   'var(--ink-2)',
  }
}

function formatTime(iso: string, locale: string): string {
  const ar = locale === 'ar'
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000
    if (diff < 60)   return ar ? 'الآن' : 'just now'
    if (diff < 3600) return ar ? `قبل ${Math.floor(diff / 60)} د` : `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return ar ? `قبل ${Math.floor(diff / 3600)} س` : `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString(ar ? 'ar-AE' : 'en-GB', { day: '2-digit', month: 'short' })
  } catch {
    return iso.slice(0, 10)
  }
}

type ActionMode = 'idle' | 'reject-input' | 'ask-input'

export function NotificationPanel({ personId, tenantId, onClose, onCountChange }: Props) {
  const locale                    = useLocale()
  const [items, setItems]         = useState<NotifItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState<NotifItem | null>(null)
  const [detail, setDetail]       = useState<Detail | null>(null)
  const [detailLoading, setDL]    = useState(false)
  const [detailError, setDE]      = useState<string | null>(null)
  const [actionMode, setMode]     = useState<ActionMode>('idle')
  const [text, setText]           = useState('')
  const [actionMsg, setMsg]       = useState('')
  const [pending, start]          = useTransition()

  useEffect(() => {
    getMyNotifications(personId, tenantId)
      .then(r => { setItems(r); setLoading(false) })
      .catch(() => setLoading(false))
  }, [personId, tenantId])

  function selectItem(item: NotifItem) {
    setSelected(item)
    setDetail(null)
    setDE(null)
    setMode('idle')
    setText('')
    setMsg('')
    if (item.workflowInstanceId) {
      setDL(true)
      getApprovalDetail(item.workflowInstanceId)
        .then(d => { setDetail(d); setDL(false) })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Could not load approval details.'
          setDE(msg)
          setDL(false)
        })
    }
  }

  function handleMarkAll() {
    start(async () => {
      await markAllRead(personId, tenantId)
      setItems(prev => prev.map(i => ({ ...i, isRead: true })))
      onCountChange(0)
    })
  }

  function markItemActioned(id: string) {
    setItems(prev => {
      const next = prev.map(i => i.id === id ? { ...i, isRead: true, isActioned: true } : i)
      const newUnread = next.filter(i => !i.isRead && !i.isActioned).length
      onCountChange(newUnread)
      return next
    })
  }

  function handleApprove() {
    if (!selected?.workflowInstanceId) return
    start(async () => {
      const res = await approveRequest(selected.workflowInstanceId!, personId, '')
      if (res.success) {
        setMsg(locale === 'ar' ? '✅ تمت الموافقة بنجاح' : '✅ Approved successfully')
        markItemActioned(selected.id)
      } else {
        setMsg(`${locale === 'ar' ? 'خطأ' : 'Error'}: ${res.error}`)
      }
    })
  }

  function handleRejectSubmit() {
    if (!selected?.workflowInstanceId || !text.trim()) return
    start(async () => {
      const res = await rejectRequest(selected.workflowInstanceId!, text, personId)
      if (res.success) {
        setMsg(locale === 'ar' ? '✅ تم الرفض' : '✅ Rejected')
        markItemActioned(selected.id)
      } else {
        setMsg(`${locale === 'ar' ? 'خطأ' : 'Error'}: ${res.error}`)
      }
    })
  }

  function handleAskSubmit() {
    if (!selected?.workflowInstanceId || !text.trim()) return
    start(async () => {
      const res = await requestInfo(selected.workflowInstanceId!, text, personId)
      if (res.success) {
        setMsg(locale === 'ar' ? '✅ تم إرسال السؤال' : '✅ Question sent')
        setTimeout(() => onClose(), 2500)
      } else {
        setMsg(`${locale === 'ar' ? 'خطأ' : 'Error'}: ${res.error}`)
      }
    })
  }

  const unreadCount    = items.filter(i => !i.isRead && !i.isActioned).length
  const activeItems    = items.filter(i => !i.isActioned)
  const actionedItems  = items.filter(i => i.isActioned)

  return (
    <div
      role="dialog"
      aria-label={locale === 'ar' ? 'الإشعارات' : 'Notifications'}
      style={{
        position:     'fixed',
        top:          60,
        right:        16,
        width:        700,
        maxHeight:    500,
        background:   'var(--card)',
        border:       '1px solid var(--border)',
        borderRadius: 14,
        boxShadow:    '0 8px 32px rgba(0,0,0,0.16)',
        zIndex:       150,
        display:      'flex',
        overflow:     'hidden',
      }}
    >
      {/* LEFT COLUMN */}
      <div style={{
        width:        280,
        flexShrink:   0,
        borderRight:  '1px solid var(--border)',
        display:      'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          padding:      '12px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink:   0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
              {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
            </span>
            {unreadCount > 0 && (
              <span style={{
                background: 'var(--accent)',
                color:      'var(--card)',
                fontSize:   'var(--text-caption)', fontWeight: 700,
                borderRadius: 10, padding: '1px 6px',
                fontFamily: 'var(--font-sans)',
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={handleMarkAll}
            disabled={pending || unreadCount === 0}
            style={{
              fontSize: 'var(--text-caption)', color: 'var(--brand-active)',
              background: 'transparent', border: 'none',
              cursor: unreadCount > 0 ? 'pointer' : 'default',
              opacity: unreadCount > 0 ? 1 : 0.4,
              fontFamily: 'var(--font-sans)',
              padding: '2px 6px', borderRadius: 4,
              transition: 'background 120ms',
            }}
            onMouseEnter={e => { if (unreadCount > 0) e.currentTarget.style.background = 'var(--accent-050)' }}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {locale === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all read'}
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
              {locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
              {locale === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
            </div>
          ) : (
            <>
              {activeItems.map(item => {
                const { icon, bg, fg } = typeStyle(item.type)
                const active = selected?.id === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    style={{
                      display:    'flex',
                      alignItems: 'flex-start',
                      gap:        10,
                      width:      '100%',
                      padding:    '10px 14px',
                      background: active ? 'var(--accent-050)' : 'transparent',
                      borderTopWidth: "0px",
                      borderTopStyle: "none",
                      borderTopColor: "currentColor",
                      borderRightWidth: "0px",
                      borderRightStyle: "none",
                      borderRightColor: "currentColor",
                      borderBottomWidth: "0px",
                      borderBottomStyle: "none",
                      borderBottomColor: "currentColor",
                      borderLeftWidth: "3px",
                      borderLeftStyle: "solid",
                      borderLeftColor: (active) ? "var(--accent)" : "transparent",
                      cursor:     'pointer',
                      textAlign:  'left',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: 6,
                      background: bg, color: fg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}>
                      {icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 'var(--text-caption)', fontWeight: item.isRead ? 400 : 600,
                        color: active ? 'var(--brand-active)' : 'var(--ink-1)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontFamily: 'var(--font-sans)',
                      }}>
                        {item.title || item.type}
                      </div>
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                      marginTop: 2, fontFamily: 'var(--font-sans)' }}>
                        {formatTime(item.createdAt, locale)}
                      </div>
                    </div>
                    {!item.isRead && (
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--accent)',
                        flexShrink: 0,
                        marginTop: 6,
                      }} />
                    )}
                  </button>
                )
              })}

              {actionedItems.length > 0 && (
                <>
                  <div style={{
                    padding: '6px 14px 4px',
                    fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.6px',
                    textTransform: 'uppercase', color: 'var(--ink-4)',
                    fontFamily: 'var(--font-sans)',
                    borderTop: activeItems.length > 0 ? '1px solid var(--border)' : 'none',
                    marginTop: activeItems.length > 0 ? 4 : 0,
                  }}>
                    {locale === 'ar' ? 'تم اتخاذ إجراء' : 'Actioned'}
                  </div>
                  {actionedItems.map(item => {
                    const { icon } = typeStyle(item.type)
                    const active = selected?.id === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectItem(item)}
                        style={{
                          display:    'flex',
                          alignItems: 'flex-start',
                          gap:        10,
                          width:      '100%',
                          padding:    '8px 14px',
                          background: active ? 'var(--surface)' : 'transparent',
                          borderTopWidth: "0px",
                          borderTopStyle: "none",
                          borderTopColor: "currentColor",
                          borderRightWidth: "0px",
                          borderRightStyle: "none",
                          borderRightColor: "currentColor",
                          borderBottomWidth: "0px",
                          borderBottomStyle: "none",
                          borderBottomColor: "currentColor",
                          borderLeftWidth: "3px",
                          borderLeftStyle: "solid",
                          borderLeftColor: (active) ? "var(--ink-3)" : "transparent",
                          cursor:     'pointer',
                          textAlign:  'left',
                          opacity:    0.55,
                          transition: 'background 120ms',
                        }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface)' }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{
                          width: 22, height: 22, borderRadius: 6,
                          background: 'var(--surface)', color: 'var(--ink-3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 1,
                        }}>
                          {icon}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 'var(--text-caption)', fontWeight: 400, color: 'var(--ink-3)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            fontFamily: 'var(--font-sans)',
                          }}>
                            {item.title || item.type}
                          </div>
                          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
                          marginTop: 1, fontFamily: 'var(--font-sans)' }}>
                            {formatTime(item.createdAt, locale)}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 600,
                          letterSpacing: '0.3px', textTransform: 'uppercase',
                          fontFamily: 'var(--font-sans)',
                          marginTop: 4, flexShrink: 0,
                        }}>
                          {locale === 'ar' ? 'تم' : 'Done'}
                        </span>
                      </button>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selected ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 8,
          }}>
            <span style={{ fontSize: 32 }}>🔔</span>
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
              {locale === 'ar' ? 'اختر إشعاراً' : 'Select a notification'}
            </span>
          </div>
        ) : (
          <>
            {/* Detail content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
              {detailLoading ? (
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</div>
              ) : detailError ? (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--status-rejected-bg)',
                  color: 'var(--status-rejected-fg)',
                  fontSize: 'var(--text-caption)', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
                }}>
                  {detailError}
                </div>
              ) : (
                <>
                  <h3 style={{
                    fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)',
                    margin: '0 0 12px', fontFamily: 'var(--font-sans)',
                  }}>
                    {selected.title || selected.type}
                  </h3>
                  {selected.message && (
                    <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', margin: '0 0 14px', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>
                      {selected.message}
                    </p>
                  )}

                  {/* Letter sign request action */}
                  {selected.type === 'LETTER_SIGN_REQUEST' && selected.referenceId && (
                    <a
                      href={`/me/letters/sign/${selected.referenceId}`}
                      onClick={onClose}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        marginTop: 4,
                        padding: '8px 14px', borderRadius: 7,
                        background: '#7C3AED', color: "var(--on-accent)",
                        fontSize: 'var(--text-caption)', fontWeight: 600,
                        textDecoration: 'none',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      <PenLine size={13} /> {locale === 'ar' ? 'فتح وتوقيع ←' : 'Open & Sign →'}
                    </a>
                  )}

                  {/* Leave request details */}
                  {detail?.entry && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        [locale === 'ar' ? 'الموظف' : 'Employee',    detail.person?.fullNameEn ?? '—'],
                        [locale === 'ar' ? 'رقم الموظف' : 'Employee #',  detail.person?.personNumber ?? '—'],
                        [locale === 'ar' ? 'نوع الإجازة' : 'Leave Type',  detail.absenceType?.typeNameEn ?? '—'],
                        [locale === 'ar' ? 'من' : 'From',        detail.entry.startDate ?? '—'],
                        [locale === 'ar' ? 'إلى' : 'To',          detail.entry.endDate ?? '—'],
                        [locale === 'ar' ? 'المدة' : 'Duration',    locale === 'ar' ? `${detail.entry.durationDays} يوم` : `${detail.entry.durationDays} day(s)`],
                        [locale === 'ar' ? 'الحالة' : 'Status',      detail.entry.status ?? '—'],
                        [locale === 'ar' ? 'الرقم المرجعي' : 'Ref #',       detail.entry.requestNumber ?? '—'],
                      ].map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 500,
                            minWidth: 80, flexShrink: 0, fontFamily: 'var(--font-sans)',
                          }}>
                            {label}:
                          </span>
                          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Backdated hire approval details */}
                  {detail && !detail.entry && detail.person && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {([
                        [locale === 'ar' ? 'الموظف' : 'Employee',      detail.person.fullNameEn ?? '—'],
                        [locale === 'ar' ? 'رقم الموظف' : 'Employee #',    detail.person.personNumber ?? '—'],
                        ...(detail.hireContext ? [
                          [locale === 'ar' ? 'تاريخ التعيين' : 'Hire Date',   String(detail.hireContext.hireDate ?? '—')],
                          [locale === 'ar' ? 'الأيام الرجعية' : 'Days Back',   locale === 'ar' ? `${detail.hireContext.backdatingDays ?? '—'} يوم` : `${detail.hireContext.backdatingDays ?? '—'} day(s)`],
                          ...(detail.hireContext.reason ? [[locale === 'ar' ? 'السبب' : 'Reason', detail.hireContext.reason]] : []),
                        ] : []),
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 500,
                            minWidth: 80, flexShrink: 0, fontFamily: 'var(--font-sans)',
                          }}>
                            {label}:
                          </span>
                          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Action inputs */}
              {actionMode === 'reject-input' && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)', display: 'block',
                  marginBottom: 4 }}>
                    {locale === 'ar' ? 'سبب الرفض (مطلوب):' : 'Rejection reason (required):'}
                  </label>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={3}
                    placeholder={locale === 'ar' ? 'أدخل السبب…' : 'Enter reason…'}
                    style={{
                      width: '100%', resize: 'vertical',
                      fontSize: 'var(--text-caption)', padding: '8px 10px',
                      borderRadius: 6, border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--ink-1)',
                      fontFamily: 'var(--font-sans)', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
              {actionMode === 'ask-input' && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)', display: 'block',
                  marginBottom: 4 }}>
                    {locale === 'ar' ? 'سؤال إلى الموظف:' : 'Question to employee:'}
                  </label>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={3}
                    placeholder={locale === 'ar' ? 'أدخل السؤال…' : 'Enter question…'}
                    style={{
                      width: '100%', resize: 'vertical',
                      fontSize: 'var(--text-caption)', padding: '8px 10px',
                      borderRadius: 6, border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--ink-1)',
                      fontFamily: 'var(--font-sans)', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {actionMsg && (
                <div style={{
                  marginTop: 12, padding: '8px 12px', borderRadius: 6,
                  background: actionMsg.startsWith('✅') ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)',
                  color:      actionMsg.startsWith('✅') ? 'var(--status-approved-fg)' : 'var(--status-rejected-fg)',
                  fontSize:   'var(--text-caption)', fontFamily: 'var(--font-sans)',
                }}>
                  {actionMsg}
                </div>
              )}
            </div>

            {/* Not-actionable note — request is cancelled/final or otherwise closed.
                Gated on the server-computed isActionable so a CANCELLED leave can
                never present live Approve/Reject buttons (escaped-defect P0). */}
            {selected.workflowInstanceId && !detailLoading && detail && detail.isActionable === false && (
              <div style={{
                flexShrink: 0, padding: '10px 18px', borderTop: '1px solid var(--border)',
                fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)',
              }}>
                {detail.actionDisabledReason
                  ?? (locale === 'ar' ? 'لم يعد هذا الطلب قابلاً للإجراء.' : 'This request is no longer actionable.')}
              </div>
            )}

            {/* Action buttons — only shown for actionable workflow notifications not yet
                actioned AND whose underlying request is still actionable (isActionable). */}
            {selected.workflowInstanceId && !actionMsg && !selected.isActioned && detail?.isActionable === true && (
              <div style={{
                flexShrink: 0,
                padding:    '10px 18px',
                borderTop:  '1px solid var(--border)',
                display:    'flex', gap: 8,
              }}>
                {actionMode === 'idle' && (
                  <>
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={pending}
                      style={{
                        flex: 1, padding: '7px 10px',
                        borderRadius: 7, border: 'none', cursor: 'pointer',
                        background: 'var(--status-approved-bg)',
                        color:      'var(--status-approved-fg)',
                        fontSize: 'var(--text-caption)', fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                        opacity: pending ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        transition: 'opacity 120ms',
                      }}
                    >
                      {pending ? '…' : (locale === 'ar' ? '✓ موافقة' : '✓ Approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMode('reject-input'); setText('') }}
                      disabled={pending}
                      style={{
                        flex: 1, padding: '7px 10px',
                        borderRadius: 7, border: 'none', cursor: 'pointer',
                        background: 'var(--status-rejected-bg)',
                        color:      'var(--status-rejected-fg)',
                        fontSize: 'var(--text-caption)', fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                        opacity: pending ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        transition: 'opacity 120ms',
                      }}
                    >
                      {locale === 'ar' ? '✕ رفض' : '✕ Reject'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMode('ask-input'); setText('') }}
                      disabled={pending}
                      style={{
                        flex: 1, padding: '7px 10px',
                        borderRadius: 7, cursor: 'pointer',
                        background: 'var(--surface)',
                        color:      'var(--ink-2)',
                        fontSize: 'var(--text-caption)', fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                        border: '1px solid var(--border)',
                        opacity: pending ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        transition: 'opacity 120ms',
                      } as React.CSSProperties}
                    >
                      {locale === 'ar' ? '؟ استفسار' : '? Ask'}
                    </button>
                  </>
                )}
                {actionMode === 'reject-input' && (
                  <>
                    <button
                      type="button"
                      onClick={handleRejectSubmit}
                      disabled={pending || !text.trim()}
                      style={{
                        flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none',
                        cursor: text.trim() ? 'pointer' : 'default',
                        background: 'var(--status-rejected-bg)',
                        color:      'var(--status-rejected-fg)',
                        fontSize: 'var(--text-caption)', fontWeight: 600, fontFamily: 'var(--font-sans)',
                        opacity: (pending || !text.trim()) ? 0.5 : 1,
                      }}
                    >
                      {pending ? '…' : (locale === 'ar' ? 'إرسال الرفض' : 'Submit Rejection')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('idle')}
                      style={{
                        padding: '7px 12px', borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'transparent', cursor: 'pointer',
                        fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </>
                )}
                {actionMode === 'ask-input' && (
                  <>
                    <button
                      type="button"
                      onClick={handleAskSubmit}
                      disabled={pending || !text.trim()}
                      style={{
                        flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none',
                        cursor: text.trim() ? 'pointer' : 'default',
                        background: 'var(--accent)', color: 'var(--card)',
                        fontSize: 'var(--text-caption)', fontWeight: 600, fontFamily: 'var(--font-sans)',
                        opacity: (pending || !text.trim()) ? 0.5 : 1,
                      }}
                    >
                      {pending ? '…' : (locale === 'ar' ? 'إرسال السؤال' : 'Send Question')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('idle')}
                      style={{
                        padding: '7px 12px', borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'transparent', cursor: 'pointer',
                        fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
