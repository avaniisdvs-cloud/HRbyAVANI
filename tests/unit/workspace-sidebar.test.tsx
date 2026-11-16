import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar'
import { getVisibleWorkspaces } from '@/config/workspace-nav'

vi.mock('next/navigation', () => ({ usePathname: () => '/persons', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/image', () => ({ default: (props: any) => <img {...props} /> }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }))
afterEach(() => { cleanup(); localStorage.clear() })

describe('unified workspace presentation', () => {
  for (const role of ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE']) {
    it(`retains the existing visible destinations for ${role}`, () => {
      render(<WorkspaceSidebar role={role} locale="en" userName="Demo" initials="D" />)
      const workspaces = getVisibleWorkspaces(role)
      for (const workspace of workspaces) {
        const toggle = screen.queryByRole('button', { name: workspace.labelEn })
        if (toggle && toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
        for (const item of workspace.nav.flatMap(group => group.items).filter(item => !item.comingSoon &&
          (role === 'SUPER_ADMIN' || !item.superAdminOnly) &&
          (role === 'SUPER_ADMIN' || !item.allowedRoles || item.allowedRoles.includes(role)))) {
          expect(document.querySelector(`a[href="${item.route}"]`)).not.toBeNull()
        }
      }
      if (role !== 'SUPER_ADMIN') expect(screen.queryByRole('button', { name: 'Enterprise Data Hub' })).toBeNull()
      expect(document.querySelector('a[href="/payroll/tax"]')).toBeNull()
      expect(document.querySelector('a[href="/payroll/benefits"]')).toBeNull()
    })
  }
  it('supports keyboard-compatible disclosure and named width controls', () => {
    render(<WorkspaceSidebar role="SUPER_ADMIN" locale="en" userName="Demo" initials="D" />)
    const group = screen.getByRole('button', { name: 'People' })
    expect(group.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(group)
    expect(group.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeTruthy()
  })
})
