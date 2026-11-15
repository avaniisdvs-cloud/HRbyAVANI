'use client'

import { useState, useTransition } from 'react'
import { useRouter }  from 'next/navigation'
import {
  calculatePayrollRun,
  lockPayrollRun,
  submitPayrollForApproval,
  approvePayrollRun,
  rejectPayrollRun,
  generateWpsSif,
  confirmPayrollRun,
} from '@/modules/payroll/actions'
import type { PayrollRunStatus } from '@/modules/payroll/types'

interface Props {
  runId:  string
  status: PayrollRunStatus
  role:   string
}

const PAYROLL_ADMIN_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN']
const APPROVER_ROLES      = ['HR_DIRECTOR', 'SUPER_ADMIN', 'FINANCE']

export function PayrollRunActions({ runId, status, role }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showRejectForm, setShowRejectForm] = useState(false)

  const isPayrollAdmin = PAYROLL_ADMIN_ROLES.includes(role)
  const isApprover     = APPROVER_ROLES.includes(role)

  async function runAction(
    fn: (runId: string) => Promise<{ success: boolean; error?: string }>,
  ) {
    setError(null)
    startTransition(async () => {
      const result = await fn(runId)
      if (!result.success) {
        setError(result.error ?? 'Action failed')
      } else {
        router.refresh()
      }
    })
  }

  async function formAction(
    fn: (fd: FormData) => Promise<{ success: boolean; error?: string }>,
    fd: FormData,
  ) {
    setError(null)
    startTransition(async () => {
      const result = await fn(fd)
      if (!result.success) {
        setError(result.error ?? 'Action failed')
      } else {
        router.refresh()
        setShowRejectForm(false)
      }
    })
  }

  const btn = (label: string, onClick: () => void, variant: 'primary' | 'secondary' | 'danger' = 'secondary') => (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        variant === 'primary'   ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-700)]' :
        variant === 'danger'    ? 'bg-red-600 text-white hover:bg-red-700' :
                                  'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-1)] hover:bg-[var(--card)]'
      }`}
    >
      {isPending ? '…' : label}
    </button>
  )

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* DRAFT → Calculate */}
        {['DRAFT', 'PRE_CHECKS_PASSED'].includes(status) && isPayrollAdmin &&
          btn('▶ Calculate', () => runAction(calculatePayrollRun), 'primary')}

        {/* CALCULATED → Lock */}
        {['CALCULATED', 'UNDER_REVIEW'].includes(status) && isPayrollAdmin &&
          btn('🔒 Lock', () => {
            const fd = new FormData()
            fd.set('runId', runId)
            formAction(lockPayrollRun, fd)
          }, 'secondary')}

        {/* LOCKED → Submit for Approval */}
        {status === 'LOCKED' && isPayrollAdmin &&
          btn('Submit for Approval →', () => {
            const fd = new FormData()
            fd.set('runId', runId)
            formAction(submitPayrollForApproval, fd)
          }, 'primary')}

        {/* APPROVAL_PENDING → Approve / Reject */}
        {status === 'APPROVAL_PENDING' && isApprover && <>
          {btn('✓ Approve', () => {
            const fd = new FormData()
            fd.set('runId', runId)
            formAction(approvePayrollRun, fd)
          }, 'primary')}
          {btn('✗ Reject', () => setShowRejectForm(true), 'danger')}
        </>}

        {/* APPROVED → Generate SIF */}
        {status === 'APPROVED' && isPayrollAdmin &&
          btn('Generate WPS SIF', () => runAction(generateWpsSif), 'primary')}

        {/* SIF_GENERATED / SUBMITTED → Confirm */}
        {['SIF_GENERATED', 'SUBMITTED_TO_BANK'].includes(status) && isPayrollAdmin &&
          btn('✓ Confirm Payment', () => runAction(confirmPayrollRun), 'primary')}
      </div>

      {/* Reject form */}
      {showRejectForm && (
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            fd.set('runId', runId)
            formAction(rejectPayrollRun, fd)
          }}
          className="mt-2 w-72 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30"
        >
          <p className="text-xs font-medium text-red-800 dark:text-red-300">Rejection reason (required)</p>
          <textarea name="reason" required rows={3} placeholder="Enter reason…"
            className="w-full rounded border border-red-200 bg-white px-2 py-1 text-xs text-[var(--ink-1)] focus:outline-none dark:bg-red-950" />
          <div className="flex gap-2">
            <button type="submit" disabled={isPending}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {isPending ? '…' : 'Confirm Reject'}
            </button>
            <button type="button" onClick={() => setShowRejectForm(false)}
              className="rounded border border-[var(--border)] px-3 py-1 text-xs text-[var(--ink-2)] hover:bg-[var(--surface)]">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}
    </div>
  )
}
