'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deactivateApprovalDelegation } from '@/modules/config'
import { type Locale } from '@/lib/i18n'

interface Props {
  id: string
  locale?: Locale
}

/**
 * S9-04 — soft-deactivate button.
 * Hard Rule 2: never deletes. Sets is_active=false; row remains for history.
 */
export function DelegationDeactivateButton({ id, locale = 'en' }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onClick = () => {
    if (!window.confirm(locale === 'ar' ? 'إلغاء تفعيل هذا التفويض؟' : 'Deactivate this delegation?')) return
    setError(null)
    startTransition(async () => {
      try {
        await deactivateApprovalDelegation(id)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'This action could not be completed. Please try again.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-xs text-destructive hover:underline disabled:opacity-50"
      >
        {pending
          ? (locale === 'ar' ? 'جارٍ الإلغاء…' : 'Deactivating…')
          : (locale === 'ar' ? 'إلغاء التفعيل' : 'Deactivate')}
      </button>
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  )
}
