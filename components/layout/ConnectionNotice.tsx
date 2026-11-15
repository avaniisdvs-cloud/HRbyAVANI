'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '@/components/providers/LocaleProvider'

/** Honest network state; never claims a request was saved while offline. */
export function ConnectionNotice() {
  const locale = useLocale()
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  if (!offline) return null
  return <div role="status" style={{ padding: '8px 16px', background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', borderBottom: '1px solid var(--status-warning-border)' }}>{locale === 'ar' ? 'أنت غير متصل. احتفظ بهذه الصفحة مفتوحة وتحقق من الاتصال قبل إعادة المحاولة.' : 'You are offline. Keep this page open and check your connection before retrying.'}</div>
}
