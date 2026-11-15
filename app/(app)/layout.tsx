import { redirect } from 'next/navigation'
import { Toaster } from '@/components/ui/toaster'
import { auth } from '@/lib/auth'
import { type Locale } from '@/lib/i18n'
import { resolveLocale } from '@/lib/language-preference'

/**
 * (app) route group — authenticated, full-screen layout.
 * No sidebar. Used for full-viewport experiences like the Org Chart.
 * Auth: any authenticated user. Individual pages add their own role gates.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // Single source of truth: cookie hint → persisted preference → 'en'.
  const locale: Locale = await resolveLocale(session.user.personId)
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <div dir={dir} style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {children}
      <Toaster />
    </div>
  )
}
