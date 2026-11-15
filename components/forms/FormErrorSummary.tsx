'use client'

import { useEffect, useRef } from 'react'
import { useLocale } from '@/components/providers/LocaleProvider'

/** Focus the summary after validation; links move directly to the invalid field. */
export function FormErrorSummary({ errors }: { errors: Record<string, string> }) {
  const locale = useLocale()
  const ref = useRef<HTMLDivElement>(null)
  const entries = Object.entries(errors).filter(([, message]) => Boolean(message))
  const signature = entries.map(([key, message]) => `${key}:${message}`).join('|')
  useEffect(() => { if (signature) ref.current?.focus() }, [signature])
  if (!entries.length) return null
  return <div ref={ref} role="alert" tabIndex={-1} style={{ border: '1px solid var(--status-rejected-fg)', borderRadius: 8, padding: 16, marginBottom: 16, background: 'var(--card)', color: 'var(--ink-1)' }}>
    <h2 style={{ fontSize: 'var(--text-body)', fontWeight: 700 }}>{locale === 'ar' ? 'يرجى تصحيح الحقول التالية' : 'Please correct the following fields'}</h2>
    <ul style={{ paddingInlineStart: 20 }}>{entries.map(([key, message]) => <li key={key}><a href={`#${key}`} onClick={event => { const target = document.getElementById(key); if (target) { event.preventDefault(); target.focus(); target.scrollIntoView({ block: 'center' }) } }}>{message}</a></li>)}</ul>
  </div>
}
