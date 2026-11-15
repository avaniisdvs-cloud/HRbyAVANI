'use client'

import { signOut } from 'next-auth/react'
import { useEffect } from 'react'

/**
 * Sign-out page — clears the JWT session cookie server-side via Auth.js
 * and redirects to /sign-in. Rendered once on mount; the user never sees
 * the blank screen because the redirect is immediate.
 */
export default function SignOutPage() {
  useEffect(() => {
    signOut({ callbackUrl: '/sign-in' })
  }, [])

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: 'var(--color-bg)' }}
    >
      <p style={{ color: 'var(--color-ink-2)', fontSize: '14px' }}>
        Signing out…
      </p>
    </div>
  )
}
