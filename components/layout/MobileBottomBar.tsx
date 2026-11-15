'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ClipboardCheck, Menu } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { pickLabel } from '@/lib/i18n'
import type { WorkspaceItem } from '@/config/workspace-nav'
import { getVisibleWorkspaces } from '@/config/workspace-nav'
import { MANAGER_NAV } from '@/config/manager-nav'
import { EMPLOYEE_NAV } from '@/config/employee-nav'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'

/** Responsive task navigation. The existing role-filtered configurations remain authoritative. */
export function MobileBottomBar({ role, locale = 'en' }: { role: string; locale?: Locale }) {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)
  useEffect(() => { setSheetOpen(false) }, [pathname])
  const employee = role === 'EMPLOYEE'
  const home = employee ? '/me' : '/dashboard'
  const groups: Array<{ items: WorkspaceItem[] }> = role === 'MANAGER' ? MANAGER_NAV : employee ? EMPLOYEE_NAV
    : getVisibleWorkspaces(role).flatMap(workspace => workspace.nav)
  const links = [...new Map(groups.flatMap(group => group.items).filter(item => !item.comingSoon).map(item => [item.route, item])).values()]
  const linkStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, color: 'var(--ink-1)', fontSize: 14, textDecoration: 'none', flex: 1 } as const
  return (
    <nav className="mobile-bottom-bar" aria-label={locale === 'ar' ? 'التنقل عبر الجوال' : 'Mobile navigation'} style={{ position: 'fixed', insetInline: 0, bottom: 0, paddingBottom: 'env(safe-area-inset-bottom)', background: 'var(--card)', borderTop: '1px solid var(--border)', zIndex: 40, display: 'flex' }}>
      <Link href={home} aria-current={pathname === home ? 'page' : undefined} style={linkStyle}><Home size={18} aria-hidden />{locale === 'ar' ? 'الرئيسية' : 'Home'}</Link>
      <Link href="/approvals" aria-current={pathname.startsWith('/approvals') ? 'page' : undefined} style={linkStyle}><ClipboardCheck size={18} aria-hidden />{locale === 'ar' ? 'الموافقات' : 'Approvals'}</Link>
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogTrigger asChild><button type="button" style={{ ...linkStyle, border: 0, background: 'transparent' }}><Menu size={18} aria-hidden />{locale === 'ar' ? 'القائمة' : 'Menu'}</button></DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <DialogTitle>{locale === 'ar' ? 'التنقل' : 'Navigation'}</DialogTitle>
          <DialogDescription>{locale === 'ar' ? 'اختر مساحة العمل أو المهمة' : 'Choose a workspace or task.'}</DialogDescription>
          <nav aria-label={locale === 'ar' ? 'كل المهام' : 'All tasks'} style={{ display: 'grid', gap: 4 }}>
            {links.map(item => <Link key={item.route} href={item.route} onClick={() => setSheetOpen(false)} aria-current={pathname === item.route ? 'page' : undefined} style={{ ...linkStyle, justifyContent: 'flex-start', padding: '8px 12px', borderRadius: 8, background: pathname === item.route ? 'var(--accent-050)' : 'transparent' }}>{pickLabel(item, locale)}</Link>)}
            <Link href="/sign-out" style={linkStyle}>{locale === 'ar' ? 'تسجيل الخروج' : 'Sign out'}</Link>
          </nav>
        </DialogContent>
      </Dialog>
    </nav>
  )
}
