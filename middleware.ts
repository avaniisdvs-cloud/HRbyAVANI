/**
 * Auth + role routing middleware — OBS-003: request correlation IDs.
 *
 * 1. Public paths bypass auth entirely.
 * 2. Unauthenticated requests → /sign-in (callbackUrl preserved).
 * 3. After sign-in, / and /dashboard redirect to the role-appropriate home.
 * 4. Role-restricted path groups (master-data, access, users, persons, aria)
 *    redirect non-permitted roles to their role home rather than showing a 403.
 * 5. OBS-003: generates x-request-id if absent; echoes it in every response.
 *    API routes and Server Actions read this via headers() for log correlation.
 */
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

// Role → landing page after successful sign-in
const ROLE_HOME: Record<string, string> = {
  HR_ADMIN:     '/dashboard',
  HR_DIRECTOR:  '/dashboard',
  SUPER_ADMIN:  '/dashboard',
  PAYROLL_ADMIN:'/dashboard',
  FINANCE:      '/dashboard',
  MANAGER:      '/dashboard',
  EMPLOYEE:     '/me',
}

// Path prefixes that require specific roles (beyond the shell gate in layout.tsx)
// These entries are checked in order — first match wins.
const ROLE_GATED_PATHS: { prefix: string; allowed: string[] }[] = [
  // RBAC-BL-07: DataOps is a raw DB console — SUPER_ADMIN only. Gates both the
  // page and its data API. The read API otherwise treats the HR_ADMIN group as
  // full-access (no row filter) over audit_log / user_accounts / refresh_tokens /
  // sso_provider_config / person_bank_details / payroll. Listed first so the
  // narrow /admin/dataops match wins before any broader future /admin entry.
  {
    prefix:  '/admin/dataops',
    allowed: ['SUPER_ADMIN'],
  },
  {
    prefix:  '/api/dataops',
    allowed: ['SUPER_ADMIN'],
  },
  // UAT Migration Load Console — SUPER_ADMIN only (request-boundary backstop;
  // page also guards). Listed alongside the other narrow /admin matches.
  {
    prefix:  '/admin/migration',
    allowed: ['SUPER_ADMIN'],
  },
  {
    prefix:  '/api/migration',
    allowed: ['SUPER_ADMIN'],
  },
  // RBAC-BL-03: config-grade routes previously protected ONLY by per-page guards
  // now get a middleware backstop (defense-in-depth). Each gate's role set EXACTLY
  // matches the route's existing page guard(s) — no expansion, no loss.
  // Listed after /admin/dataops so the SUPER_ADMIN-only dataops match wins first;
  // these are distinct /admin/* sub-prefixes (no shadowing). NEVER add a broad
  // '/admin' entry — it would mis-gate /admin/dataops.
  {
    // Workflow Operations console — org-wide oversight, HR leadership only.
    // The /approvals base stays open to all approver roles; only this sub-path
    // is gated. /approvals itself is NOT listed (deliberately open).
    prefix:  '/approvals/operations',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/configuration',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/admin/probation',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    // SUPER-SET of both pages: the list page (/admin/exit-clearance) is HR-only,
    // but the detail page (/admin/exit-clearance/[personId]) intentionally also
    // admits MANAGER + PAYROLL_ADMIN (they own clearance tasks). The middleware
    // gate must be the union so it never strips the detail page's legitimate
    // users; the per-page guards keep the narrower list-vs-detail enforcement.
    prefix:  '/admin/exit-clearance',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'PAYROLL_ADMIN', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/master-data',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/access',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/users',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/settings',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'],
  },
  {
    prefix:  '/dashboard',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'],
  },
  {
    prefix:  '/persons',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'],
  },
  {
    prefix:  '/aria',
    allowed: ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER'],
  },
]

export default auth((req) => {
  const { pathname } = req.nextUrl

  // ── OBS-003: request correlation ID ──────────────────────────────────────
  // Reuse existing header (from upstream proxy/load balancer) or generate one.
  // Edge runtime has crypto.randomUUID() available since Node 18 / CF Workers.
  const reqId = req.headers.get('x-request-id') ?? crypto.randomUUID()

  // ── Public paths ──────────────────────────────────────────────────────────
  const isPublic =
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/cron') ||
    pathname === '/api/workflow/action' ||
    pathname.startsWith('/_next') ||
    /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(pathname)

  if (isPublic) {
    const res = NextResponse.next()
    res.headers.set('x-request-id', reqId)
    return res
  }

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!req.auth) {
    const signInUrl = new URL('/sign-in', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    const res = NextResponse.redirect(signInUrl)
    res.headers.set('x-request-id', reqId)
    return res
  }

  const role = (req.auth.user as { role?: string })?.role ?? 'EMPLOYEE'

  // ── Root redirect → role home ─────────────────────────────────────────────
  if (pathname === '/') {
    const home = ROLE_HOME[role] ?? '/me'
    const res = NextResponse.redirect(new URL(home, req.url))
    res.headers.set('x-request-id', reqId)
    return res
  }

  // ── Role-gated path protection ────────────────────────────────────────────
  for (const gate of ROLE_GATED_PATHS) {
    if (pathname.startsWith(gate.prefix)) {
      if (!gate.allowed.includes(role)) {
        const home = ROLE_HOME[role] ?? '/me'
        const res = NextResponse.redirect(new URL(home, req.url))
        res.headers.set('x-request-id', reqId)
        return res
      }
      break
    }
  }

  // ── Authenticated pass-through: inject request ID into downstream headers ─
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', reqId)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('x-request-id', reqId)
  return res
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
