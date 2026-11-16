'use client'

import { useState } from 'react'
import { FileText, Download, Mail, PenLine, Eye, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import type { EmployeeLetter } from '@/drizzle/schema'
import { useLocale } from '@/components/providers/LocaleProvider'

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  DRAFT:               { bg: '#F3F4F6', fg: '#6B7280' },
  PENDING_APPROVAL:    { bg: '#FEF3C7', fg: '#D97706' },
  PENDING_SIGNATURE:   { bg: '#EDE9FE', fg: '#7C3AED' },
  APPROVED:            { bg: '#DCFCE7', fg: '#16A34A' },
  REJECTED:            { bg: '#FEE2E2', fg: '#DC2626' },
  SIGNED:              { bg: '#DBEAFE', fg: '#2563EB' },
  SENT:                { bg: '#F0FDF4', fg: '#16A34A' },
  CANCELLED:           { bg: '#F3F4F6', fg: '#9CA3AF' },
}

type StatusFilter = 'pending' | 'signed'

interface Row extends EmployeeLetter {
  employeeName?:   string
  employeeNumber?: string
}

interface Toast { ok: boolean; msg: string }

interface Props {
  letters:       Row[]
  onPreview:     (id: string) => Promise<void>
  onDownload:    (id: string) => Promise<void>
  onSendEmail:   (id: string) => Promise<{ success: boolean; email?: string; error?: string }>
  onSignRequest: (id: string) => Promise<{ success: boolean; error?: string }>
}

export function LetterListTable({ letters, onPreview, onDownload, onSendEmail, onSignRequest }: Props) {
  const locale = useLocale()
  const [busy,        setBusy]        = useState<Record<string, string>>({})
  const [emailSent,   setEmailSent]   = useState<Set<string>>(new Set())
  const [signSent,    setSignSent]    = useState<Set<string>>(new Set())
  const [toast,       setToast]       = useState<Toast | null>(null)
  const [statusFilter, setFilter]     = useState<StatusFilter>('pending')

  function flash(ok: boolean, msg: string) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 4000)
  }

  async function handlePreview(id: string) {
    setBusy(p => ({ ...p, [id]: 'preview' }))
    try { await onPreview(id) } finally { setBusy(p => { const n = { ...p }; delete n[id]; return n }) }
  }

  async function handleDownload(id: string) {
    setBusy(p => ({ ...p, [id]: 'download' }))
    try {
      await onDownload(id)
    } catch {
      flash(false, locale === 'ar' ? 'فشل التنزيل — يرجى المحاولة مرة أخرى' : 'Download failed — please try again')
    } finally {
      setBusy(p => { const n = { ...p }; delete n[id]; return n })
    }
  }

  async function handleEmail(id: string) {
    setBusy(p => ({ ...p, [id]: 'email' }))
    try {
      const res = await onSendEmail(id)
      if (res.success) {
        setEmailSent(s => new Set(s).add(id))
        flash(true, locale === 'ar' ? `تم إرسال البريد إلى ${res.email ?? 'الموظف'}` : `Email sent to ${res.email ?? 'employee'}`)
      } else {
        flash(false, res.error ?? (locale === 'ar' ? 'فشل إرسال البريد' : 'Email failed'))
      }
    } catch {
      flash(false, locale === 'ar' ? 'فشل إرسال البريد الإلكتروني' : 'Email send failed')
    } finally {
      setBusy(p => { const n = { ...p }; delete n[id]; return n })
    }
  }

  async function handleSign(id: string) {
    setBusy(p => ({ ...p, [id]: 'sign' }))
    try {
      const res = await onSignRequest(id)
      if (res.success) {
        setSignSent(s => new Set(s).add(id))
        flash(true, locale === 'ar' ? 'تم إرسال طلب التوقيع إلى الموظف' : 'Signature request sent to employee')
      } else {
        flash(false, res.error ?? (locale === 'ar' ? 'فشل إرسال طلب التوقيع' : 'Failed to send signature request'))
      }
    } catch {
      flash(false, locale === 'ar' ? 'فشل إرسال طلب التوقيع' : 'Failed to send signature request')
    } finally {
      setBusy(p => { const n = { ...p }; delete n[id]; return n })
    }
  }

  const filtered     = letters.filter(l =>
    statusFilter === 'signed' ? l.status === 'SIGNED' : l.status !== 'SIGNED',
  )
  const signedCount  = letters.filter(l => l.status === 'SIGNED').length
  const pendingCount = letters.filter(l => l.status !== 'SIGNED').length

  if (letters.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
        <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
        <p style={{ margin: 0, fontSize: 'var(--text-body)' }}>{locale === 'ar' ? 'لم يتم إنشاء أي خطابات بعد.' : 'No letters generated yet.'}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 7, fontSize: 'var(--text-caption)',
          background: toast.ok ? '#DCFCE7' : '#FEE2E2',
          color:      toast.ok ? '#166534' : '#991B1B',
        }}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { key: 'pending' as StatusFilter, label: locale === 'ar' ? 'كل المعلّقة' : 'All Pending', count: pendingCount },
          { key: 'signed'  as StatusFilter, label: locale === 'ar' ? 'موقّعة ✓' : 'Signed ✓',      count: signedCount },
        ].map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 'var(--text-caption)', fontWeight: statusFilter === chip.key ? 700 : 400,
              background: statusFilter === chip.key ? 'var(--accent)' : 'var(--surface)',
              color:      statusFilter === chip.key ? '#fff'          : 'var(--ink-2)',
              transition: 'background 0.15s',
            }}
          >
            {chip.label}
            <span style={{
              padding: '1px 5px', borderRadius: 10, fontSize: 'var(--text-caption)',
              background: statusFilter === chip.key ? 'rgba(255,255,255,0.25)' : 'var(--border)',
              color: statusFilter === chip.key ? '#fff' : 'var(--ink-3)',
            }}>
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
          {locale === 'ar'
            ? (statusFilter === 'signed' ? 'لا توجد خطابات موقّعة.' : 'لا توجد خطابات معلّقة.')
            : `No ${statusFilter === 'signed' ? 'signed' : 'pending'} letters.`}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {(locale === 'ar'
                  ? ['المرجع', 'الموظف', 'التاريخ', 'الحالة', 'البريد', 'الإجراءات']
                  : ['Ref', 'Employee', 'Date', 'Status', 'Email', 'Actions']).map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                    color: 'var(--ink-2)', fontSize: 'var(--text-caption)', letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const s        = STATUS_STYLES[l.status] ?? STATUS_STYLES.DRAFT
                const rowBusy  = busy[l.id]
                const emailDone = emailSent.has(l.id) || !!l.emailSentAt
                const signDone  = signSent.has(l.id)  || l.status === 'PENDING_SIGNATURE'

                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)' }}>
                      {l.letterNumber}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--ink-1)' }}>{l.employeeName ?? '—'}</div>
                      {l.employeeNumber && (
                        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                          {l.employeeNumber}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink-2)' }}>
                      {l.generatedAt ? new Date(l.generatedAt).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        fontSize: 'var(--text-caption)', fontWeight: 500,
                        background: s.bg, color: s.fg,
                      }}>
                        {l.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                      {emailDone
                        ? <span style={{ color: '#16A34A', display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={11} /> {locale === 'ar' ? 'أُرسل' : 'Sent'}</span>
                        : (l.emailStatus ?? '—')}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>

                        {/* Preview */}
                        <ActionBtn
                          title={locale === 'ar' ? 'معاينة' : 'Preview'}
                          busy={rowBusy === 'preview'}
                          onClick={() => handlePreview(l.id)}
                          icon={<Eye size={15} />}
                        />

                        {/* Download */}
                        <ActionBtn
                          title={locale === 'ar' ? 'تنزيل PDF' : 'Download PDF'}
                          busy={rowBusy === 'download'}
                          onClick={() => handleDownload(l.id)}
                          icon={<Download size={15} />}
                        />

                        {/* Email */}
                        {l.status !== 'SIGNED' && (
                          <ActionBtn
                            title={emailDone ? (locale === 'ar' ? 'تم إرسال البريد ✓' : 'Email sent ✓') : (locale === 'ar' ? 'إرسال بريد' : 'Send Email')}
                            busy={rowBusy === 'email'}
                            onClick={() => handleEmail(l.id)}
                            icon={emailDone
                              ? <Mail size={15} style={{ color: '#16A34A' }} />
                              : <Mail size={15} />}
                            disabled={emailDone}
                          />
                        )}

                        {/* Sign request */}
                        {l.status !== 'SIGNED' && (
                          <ActionBtn
                            title={signDone ? (locale === 'ar' ? 'تم إرسال طلب التوقيع ✉' : 'Signature request sent ✉') : (locale === 'ar' ? 'إرسال طلب توقيع' : 'Send Signature Request')}
                            busy={rowBusy === 'sign'}
                            onClick={() => handleSign(l.id)}
                            icon={signDone
                              ? <PenLine size={15} style={{ color: '#7C3AED' }} />
                              : <PenLine size={15} />}
                            disabled={signDone}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  title, busy, onClick, icon, disabled,
}: {
  title:     string
  busy:      boolean
  onClick:   () => void
  icon:      React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={busy || disabled}
      style={{
        background: 'none', border: 'none', cursor: (busy || disabled) ? 'default' : 'pointer',
        padding: '4px', color: 'var(--ink-2)',
        opacity: (busy || disabled) ? 0.5 : 1,
        display: 'flex', alignItems: 'center',
      }}
    >
      {busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
    </button>
  )
}
