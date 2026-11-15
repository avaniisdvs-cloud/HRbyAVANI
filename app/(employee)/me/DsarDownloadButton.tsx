'use client'

// GAP-C04 FIX: UAE PDPL Article 13 — employee right to access their personal data

import { useState } from 'react'
import { requestPersonalDataExport } from '@/modules/core-hr/actions'
import { type Locale } from '@/lib/i18n'

export function DsarDownloadButton({ personId, locale = 'en' }: { personId: string; locale?: Locale }) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const data = await requestPersonalDataExport(personId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `my-hr-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-ink-2 hover:bg-surface disabled:opacity-50"
    >
      {loading
        ? (locale === 'ar' ? 'جارٍ التحضير…' : 'Preparing…')
        : (locale === 'ar' ? 'تنزيل بياناتي' : 'Download my data')}
    </button>
  )
}
