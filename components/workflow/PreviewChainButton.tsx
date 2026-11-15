'use client'

/**
 * PreviewChainButton — thin client wrapper that owns the modal open/close state.
 * Used on the workflow template edit page so the page itself stays server-rendered.
 */

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { type Locale } from '@/lib/i18n'
import { HierarchyPreviewModal } from './HierarchyPreviewModal'

interface Props {
  workflowCode: string
  defaultLegalEntityId?: string
  locale?: Locale
}

export function PreviewChainButton({ workflowCode, defaultLegalEntityId, locale = 'en' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius, 6px)',
          fontSize: 'var(--text-caption)',
          fontWeight: 600,
          color: 'var(--ink-2)',
          cursor: 'pointer',
        }}
      >
        <Eye size={14} />
        {locale === 'ar' ? 'معاينة السلسلة' : 'Preview Chain'}
      </button>

      {open && (
        <HierarchyPreviewModal
          workflowCode={workflowCode}
          defaultLegalEntityId={defaultLegalEntityId}
          locale={locale}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
