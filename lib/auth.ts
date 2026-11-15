/**
 * Auth.js v5 — AVANIIS HR authentication configuration.
 *
 * Providers:
 *   1. MicrosoftEntraID (microsoft-entra-id) — primary SSO for Avaniis employees
 *   2. Credentials (dev/local)               — dev demo + SUPER_ADMIN password login
 *
 * Session strategy: JWT (no DB sessions — reduces latency for every request).
 * The JWT carries: id, email, name, role, legalEntityId, personId.
 *
 * Cloud portability: zero provider-specific SDK imports.
 * All config via process.env — moving cloud = .env change only.
 */
import NextAuth, { type NextAuthConfig } from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { PREVIEW_ACCOUNTS, PREVIEW_ENTITY_ID } from './demo-accounts'
import { areDevAccountsAllowed } from './environment-guardrails'
import { rateLimit, rateLimitKey, clientIp, RATE_LIMITS } from './rate-limit'

// ── Types ──────────────────────────────────────────────────────────────────

declare module 'next-auth' {
  interface Session {
    user: {
      id:            string
      name:          string
      email:         string
      role:          string
      legalEntityId: string
      personId?:     string
      /** SEC-04: true when the session was established via a provider that enforces
       *  MFA (Microsoft Entra ID Conditional Access). false for dev credentials.
       *  undefined for legacy JWTs minted before this field was added (treated as
       *  trusted — old sessions are not retroactively blocked).
       */
      mfaVerified?:  boolean
      /** OP-001: 'LOCAL' for password (non-corporate-email) sessions, 'SSO' for Entra. */
      loginProvider?: 'LOCAL' | 'SSO'
    }
  }
  interface JWT {
    id:            string
    role:          string
    legalEntityId: string
    personId?:     string
    mfaVerified?:  boolean
    loginProvider?: 'LOCAL' | 'SSO'
  }
}

// ── Dev demo accounts (credentials provider) ───────────────────────────────

// Dev-only hardcoded accounts — production is hard-blocked by DATABASE_ENV.
// These match the demo accounts shown on the login page for local development.
const DEV_ACCOUNTS = PREVIEW_ACCOUNTS.map(account => ({
  ...account, password: 'demo', legalEntityId: PREVIEW_ENTITY_ID,
}))

const credentialsSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

// ── Auth.js config ─────────────────────────────────────────────────────────

export const authConfig: NextAuthConfig = {
  providers: [
    // ── Provider 1: Microsoft Entra ID ────────────────────────────────────
    // Zero cloud-specific code — all config via process.env.
    // To move cloud: update AUTH_MICROSOFT_ENTRA_ID_* in .env only.
    MicrosoftEntraID({
      clientId:     process.env.AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID ?? process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? '',
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET ?? process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? '',
      issuer:       process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID
                      ? `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`
                      : process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: {
        params: { scope: 'openid profile email User.Read' },
      },
    }),

    // ── Provider 2: Credentials ───────────────────────────────────────────
    // Dev demo accounts (hardcoded) — development or ENABLE_DEV_ACCOUNTS only.
    // DB-backed LOCAL password — SUPER_ADMIN role only in all environments.
    Credentials({
      id:   'credentials',
      name: 'Password',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        const { email, password } = parsed.data

        // EPRC-01 B2 (RATE-01): throttle sign-in attempts per email+IP to blunt
        // credential brute-force. Additive guard — does not alter the auth model.
        const ip = clientIp((request as Request | undefined)?.headers ?? new Headers())
        if (!rateLimit(rateLimitKey('auth', ip, email.toLowerCase()), RATE_LIMITS.AUTH).allowed) {
          throw new Error('RATE_LIMITED: too many sign-in attempts. Please wait a minute and try again.')
        }

        // 1 — Dev hardcoded accounts (development or explicit non-production enablement only)
        if (areDevAccountsAllowed()) {
          const devAccount = DEV_ACCOUNTS.find(
            a => a.email === email && a.password === password,
          )
          if (devAccount) {
            let personId: string | undefined
            let accountId: string | undefined
            // Derive the REAL primary entity from the DB so the dev session
            // matches production (where legalEntityId = userAccounts.primaryEntityId).
            // The hardcoded devAccount.legalEntityId is only a fallback when the
            // account is not yet linked in the DB. Without this, a dev account
            // whose seeded person lives in a different entity than the hardcoded
            // value hits the cross-entity guard and cannot view its own team.
            let resolvedEntityId = devAccount.legalEntityId
            try {
              const { db }           = await import('./db')
              const { userAccounts } = await import('@/drizzle/schema')
              const { eq }           = await import('drizzle-orm')
              const [row] = await db
                .select({ id: userAccounts.id, personId: userAccounts.personId, primaryEntityId: userAccounts.primaryEntityId })
                .from(userAccounts)
                .where(eq(userAccounts.primaryEmail, email.toLowerCase()))
                .limit(1)
              personId = row?.personId ?? undefined
              accountId = row?.id
              if (row?.primaryEntityId) resolvedEntityId = row.primaryEntityId
            } catch {
              // DB unavailable — proceed with the hardcoded fallback entity
            }
            return {
              id:            accountId ?? crypto.randomUUID(),
              email:         devAccount.email,
              name:          devAccount.name,
              role:          devAccount.role,
              legalEntityId: resolvedEntityId,
              personId,
            }
          }
        }

        // 2 — DB-backed password login.
        //   • SUPER_ADMIN: break-glass, unchanged (any provider, no lockout).
        //   • EMPLOYEE / MANAGER: controlled LOCAL login — only when the account
        //     is provider=LOCAL, active, has a password hash, with lockout
        //     enforcement. All other roles are rejected. SSO is unaffected.
        try {
          const { db }                    = await import('./db')
          const { userAccounts, persons } = await import('@/drizzle/schema')
          const { eq, and, sql }          = await import('drizzle-orm')
          const bcrypt                    = await import('bcryptjs')
          const {
            isLocalLoginEligible, isLocked, failureUpdate, successUpdate, isSeparated,
          } = await import('./local-login')

          const [row] = await db
            .select({
              id:                 userAccounts.id,
              passwordHash:       userAccounts.passwordHash,
              avaniisRole:        userAccounts.avaniisRole,
              isActive:           userAccounts.isActive,
              primarySsoProvider: userAccounts.primarySsoProvider,
              failedLoginCount:   userAccounts.failedLoginCount,
              lockedUntil:        userAccounts.lockedUntil,
              primaryEntityId:    userAccounts.primaryEntityId,
              personId:           userAccounts.personId,
              fullNameEn:         persons.fullNameEn,
              assignmentStatus:   persons.assignmentStatus,
              separationDate:     persons.separationDate,
            })
            .from(userAccounts)
            .innerJoin(persons, eq(userAccounts.personId, persons.id))
            .where(and(
              eq(userAccounts.primaryEmail, email.toLowerCase()),
              eq(userAccounts.isActive, true),
            ))
            .limit(1)

          if (!row?.passwordHash) return null

          // B1 (approved): block separated workers (TERMINATED/RETIRED/DECEASED or
          // separationDate ≤ today) even though persons.isActive stays true.
          // SUPER_ADMIN break-glass is exempt. The person record is NOT modified.
          if (
            row.avaniisRole !== 'SUPER_ADMIN' &&
            isSeparated(row.assignmentStatus, row.separationDate, new Date().toISOString().slice(0, 10))
          ) {
            console.warn('[auth] Login blocked — worker is separated (employment ended)')
            return null
          }

          const buildUser = () => ({
            id:            row.id,
            email,
            name:          row.fullNameEn ?? email,
            role:          row.avaniisRole,
            legalEntityId: row.primaryEntityId,
            personId:      row.personId,
          })

          // ── SUPER_ADMIN break-glass — unchanged from prior behavior ──────────
          if (row.avaniisRole === 'SUPER_ADMIN') {
            const valid = await bcrypt.compare(password, row.passwordHash)
            if (!valid) return null
            return buildUser()
          }

          // ── Controlled LOCAL login for EMPLOYEE / MANAGER ────────────────────
          if (!isLocalLoginEligible(row)) return null

          const now = new Date()

          // Reject before comparing the password when the account is locked.
          if (isLocked(row, now)) return null

          const valid = await bcrypt.compare(password, row.passwordHash)

          if (!valid) {
            // Increment failure counter; lock after the threshold.
            const upd = failureUpdate(row, now)
            await db.update(userAccounts)
              .set({ failedLoginCount: upd.failedLoginCount, lockedUntil: upd.lockedUntil })
              .where(eq(userAccounts.id, row.id))
            return null
          }

          // Success — reset failures, clear lock, stamp + count the login.
          const ok = successUpdate(now)
          await db.update(userAccounts)
            .set({
              failedLoginCount: ok.failedLoginCount,
              lockedUntil:      ok.lockedUntil,
              lastLoginAt:      ok.lastLoginAt,
              lastLoginProvider: 'LOCAL',
              loginCount:       sql`${userAccounts.loginCount} + 1`,
            })
            .where(eq(userAccounts.id, row.id))

          return buildUser()
        } catch (err) {
          console.error('[auth] DB credentials lookup failed:', err)
          return null
        }
      },
    }),
  ],

  // NFR-10: session timeout — 30 min for all roles (1800s).
  // S3-10 / SEC-04: 15-min idle enforcement for HR_ADMIN+ is a Phase 3 stretch goal.
  // Current control: JWT maxAge=1800s covers the absolute timeout; idle-timeout
  // middleware (client-side heartbeat + server-side revocation) is deferred.
  session: { strategy: 'jwt', maxAge: 1800 },

  pages: {
    signIn: '/sign-in',
    error:  '/sign-in',
  },

  callbacks: {

    // ── signIn: domain restriction + active check + new-user notification ──
    async signIn({ user, account }) {

      // Dev credentials bypass
      if (
        areDevAccountsAllowed() &&
        account?.provider === 'credentials'
      ) {
        const isDev = DEV_ACCOUNTS.some(a => a.email === user.email)
        if (isDev) return true
      }

      // Password login — authorize() handled validation
      if (account?.provider === 'credentials') {
        return true
      }

      // Microsoft Entra ID OIDC flow
      if (account?.provider === 'microsoft-entra-id') {

        if (!user.email) {
          console.error('[signIn] No email from Entra ID')
          return '/sign-in?error=no_email'
        }

        // Domain restriction
        const allowed = (process.env.AUTH_ALLOWED_DOMAINS ?? '')
          .split(',')
          .map(d => d.trim().toLowerCase())
          .filter(Boolean)

        const domain = user.email.split('@')[1]?.toLowerCase()

        if (allowed.length > 0 && !allowed.includes(domain ?? '')) {
          console.warn(`[signIn] Blocked domain: ${domain}`)
          return '/sign-in?error=domain_not_allowed'
        }

        try {
          const { db }                    = await import('@/lib/db')
          const { userAccounts, persons } = await import('@/drizzle/schema')
          const { eq }                    = await import('drizzle-orm')
          const { isSeparated }           = await import('./local-login')

          const [row] = await db
            .select({
              id:              userAccounts.id,
              avaniisRole:     userAccounts.avaniisRole,
              isActive:        userAccounts.isActive,
              personId:        userAccounts.personId,
              primaryEntityId: userAccounts.primaryEntityId,
              assignmentStatus: persons.assignmentStatus,
              separationDate:   persons.separationDate,
            })
            .from(userAccounts)
            .leftJoin(persons, eq(userAccounts.personId, persons.id))
            .where(eq(userAccounts.primaryEmail, user.email.toLowerCase()))
            .limit(1)

          // ── Existing user ──────────────────────────────────────────────
          if (row) {
            if (!row.isActive) {
              return '/sign-in?error=account_disabled'
            }
            // B1 (approved): block separated workers (employment ended) even
            // though the user_account / person record stays active. SUPER_ADMIN
            // break-glass is exempt. Person record is NOT modified.
            if (
              row.avaniisRole !== 'SUPER_ADMIN' &&
              isSeparated(row.assignmentStatus, row.separationDate, new Date().toISOString().slice(0, 10))
            ) {
              console.warn('[signIn] Blocked — worker is separated (employment ended)')
              return '/sign-in?error=account_separated'
            }
            // Attach to user object so jwt callback picks them up
            ;(user as Record<string, unknown>).role          = row.avaniisRole
            ;(user as Record<string, unknown>).personId      = row.personId ?? undefined
            ;(user as Record<string, unknown>).legalEntityId = row.primaryEntityId
            return true
          }

          // ── New user — not in user_accounts ───────────────────────────
          // Cannot auto-provision without a persons record (personId NOT NULL).
          // Allow login as EMPLOYEE; notify Super Admin to create HR record.
          console.info(`[signIn] New SSO user — no user_accounts row: ${user.email}`)
          ;(user as Record<string, unknown>).role          = 'EMPLOYEE'
          ;(user as Record<string, unknown>).legalEntityId = process.env.DEFAULT_LEGAL_ENTITY_ID ?? '11111111-1111-1111-1111-111111111111'

          notifySuperAdmin(user.email, user.name ?? user.email).catch(err =>
            console.error('[signIn] notifySuperAdmin failed:', err),
          )

          return true

        } catch (err) {
          console.error('[signIn] Entra ID DB lookup failed:', err)
          return '/sign-in?error=auth_error'
        }
      }

      return true
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.id            = user.id ?? ''
        token.role          = (user as { role?: string }).role ?? 'EMPLOYEE'
        token.legalEntityId = (user as { legalEntityId?: string }).legalEntityId
                              ?? '11111111-1111-1111-1111-111111111111'
        token.personId      = (user as { personId?: string }).personId
        // SEC-04: MFA claim. Microsoft Entra ID sessions are treated as MFA-verified
        // because the Avaniis tenant enforces MFA via Conditional Access — by the
        // time the OIDC token reaches this callback, the user has already passed MFA.
        // Dev credentials are explicitly NOT MFA-verified; they rely on the dev bypass
        // in requireRole() which checks NODE_ENV / ENABLE_DEV_ACCOUNTS.
        token.mfaVerified = account?.provider === 'microsoft-entra-id'
        // Identity-based auth policy (OP-001): any credentials sign-in is a LOCAL
        // (non-corporate-email) session; Entra is SSO. LOCAL sessions are exempt
        // from the MFA step-up in requireRole() because they cannot perform
        // Entra MFA. RBAC is still enforced by role.
        token.loginProvider = account?.provider === 'credentials' ? 'LOCAL' : 'SSO'
      }
      // If personId is still not set (e.g. first-time SSO with no DB row yet),
      // try a DB lookup by email. Guard with `user || account` so this only
      // runs at initial sign-in, not on every subsequent JWT read.
      if ((user || account) && !token.personId && token.email) {
        try {
          const { db }           = await import('./db')
          const { userAccounts } = await import('@/drizzle/schema')
          const { eq }           = await import('drizzle-orm')
          const [row] = await db
            .select({
              personId:        userAccounts.personId,
              avaniisRole:     userAccounts.avaniisRole,
              primaryEntityId: userAccounts.primaryEntityId,
            })
            .from(userAccounts)
            .where(eq(userAccounts.primaryEmail, (token.email as string).toLowerCase()))
            .limit(1)
          if (row?.personId) {
            token.personId = row.personId
            if (!token.role || token.role === 'EMPLOYEE') token.role = row.avaniisRole
            if (!token.legalEntityId) token.legalEntityId = row.primaryEntityId
          }
        } catch {
          // DB unavailable — proceed; middleware has its own fallback
        }
      }
      return token
    },

    async session({ session, token }) {
      session.user.id            = token.id as string
      session.user.role          = token.role as string
      session.user.legalEntityId = token.legalEntityId as string
      session.user.personId      = token.personId as string | undefined
      session.user.mfaVerified   = token.mfaVerified as boolean | undefined
      session.user.loginProvider = token.loginProvider as 'LOCAL' | 'SSO' | undefined
      return session
    },
  },

  // ── BR-AUDIT-001 / D-04 — every successful sign-in writes an audit row.
  events: {
    async signIn({ user, account }) {
      try {
        const { writeAuditLog } = await import('./audit')
        await writeAuditLog({
          actorId:      user.id ?? '00000000-0000-0000-0000-000000000000',
          actorName:    user.name ?? user.email ?? 'unknown',
          actorRole:    (user as { role?: string }).role ?? 'EMPLOYEE',
          channel:      'WEB',
          eventType:    'AUTH.SIGN_IN',
          resourceType: 'user_accounts',
          resourceId:   user.id,
          metadata:     { provider: account?.provider ?? 'unknown' },
        })
      } catch (err) {
        // Never block sign-in on audit failure — BR-AUDIT-001 fail-open design.
        // Audit errors are non-fatal: user must always be able to authenticate.
        console.error('[auth] sign-in audit failed:', err)
      }
    },
  },

  secret: process.env.AUTH_SECRET,
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)

// ── notifySuperAdmin ───────────────────────────────────────────────────────
// Fires asynchronously after a new SSO user's first login.
// Never blocks the sign-in flow — caller must .catch() it.

async function notifySuperAdmin(email: string, name: string): Promise<void> {

  // Always: in-app notification
  try {
    const { db }           = await import('@/lib/db')
    const { userAccounts, notificationLog } = await import('@/drizzle/schema')
    const { eq }           = await import('drizzle-orm')
    const { TENANT_ID }    = await import('@/lib/constants')

    const [admin] = await db
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(eq(userAccounts.avaniisRole, 'SUPER_ADMIN'))
      .limit(1)

    if (admin?.personId) {
      await db.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        recipientPersonId: admin.personId,
        notificationType:  'SYSTEM_ALERT',
        channel:           'IN_APP',
        subjectEn:         'New SSO user — action required',
        subjectAr:         'مستخدم SSO جديد — إجراء مطلوب',
        bodyEn:
          `${name} (${email}) signed in via Microsoft SSO for the first time. ` +
          `No HR record is linked. Please create an employee record and assign the correct role.`,
        bodyAr:
          `قام ${name} (${email}) بتسجيل الدخول عبر Microsoft SSO للمرة الأولى. ` +
          `لا يوجد سجل HR مرتبط. يرجى إنشاء سجل الموظف وتعيين الدور الصحيح.`,
        status:        'SENT',
        sentAt:        new Date(),
        createdBy:     '00000000-0000-0000-0000-000000000000',
        createdByName: 'SSO Auto Provision',
      })
    }
  } catch (err) {
    console.error('[notifySuperAdmin DB]', err)
  }

  // Optional: email — only if SMTP configured.
  // Works with any SMTP provider (Azure, AWS SES, SendGrid, Mailgun) — cloud agnostic.
  if (!process.env.SMTP_HOST?.trim()) return

  try {
    const nodemailer = await import('nodemailer')

    const transport = nodemailer.default.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    await transport.sendMail({
      from:    process.env.SMTP_FROM ?? 'noreply@avaniis.ae',
      to:      process.env.SUPER_ADMIN_NOTIFY_EMAIL,
      subject: `New SSO user — ${name}`,
      text:
        `New Microsoft SSO sign-in detected.\n\n` +
        `Name:  ${name}\n` +
        `Email: ${email}\n` +
        `Role:  EMPLOYEE (no HR record linked)\n\n` +
        `Please log in to create an employee record and assign the correct role:\n` +
        `${process.env.AUTH_URL}`,
    })
  } catch (err) {
    console.error('[notifySuperAdmin email]', err)
  }
}

// ── Session helper types ────────────────────────────────────────────────────

export type KRole =
  | 'HR_ADMIN'
  | 'HR_DIRECTOR'
  | 'PAYROLL_ADMIN'
  | 'MANAGER'
  | 'EMPLOYEE'
  | 'FINANCE'
  | 'SUPER_ADMIN'

/**
 * RBAC-BL-08: role-appropriate landing route for a rejected/redirected user.
 * Mirrors middleware ROLE_HOME exactly (the single source of truth): every
 * privileged role lands on /dashboard, EMPLOYEE on /me. Page/layout guards use
 * this instead of a hardcoded '/me' so a rejected privileged role goes straight
 * to /dashboard rather than bouncing /me → (employee layout) → /dashboard.
 * Allow/deny is unaffected — only the redirect destination.
 */
export function roleHome(role?: string): string {
  return role === 'EMPLOYEE' ? '/me' : '/dashboard'
}

export type SessionUser = {
  id:            string
  name:          string
  email:         string
  role:          string
  legalEntityId: string
  personId?:     string
  /** SEC-04: MFA verification status from JWT claim. See notes on Session.user.mfaVerified. */
  mfaVerified?:  boolean
  /** OP-001: 'LOCAL' for password sessions (MFA-exempt), 'SSO' for Entra. */
  loginProvider?: 'LOCAL' | 'SSO'
}

// ── getCurrentUser ──────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('UNAUTHENTICATED')
  return session.user as SessionUser
}

// ── requireRole ─────────────────────────────────────────────────────────────
//
// SEC-04 — Phase 2 MFA step-up enforcement (IMPLEMENTED).
// HR_ADMIN, HR_DIRECTOR, and SUPER_ADMIN sessions MUST carry a verified MFA
// claim (mfaVerified === true in JWT). EMPLOYEE, MANAGER, PAYROLL_ADMIN, and
// FINANCE are single-factor — no step-up required.
//
// mfaVerified derivation:
//   • Microsoft Entra ID sessions → true  (Avaniis CA enforces MFA at OIDC layer)
//   • Dev credentials (local/staging) → false (bypassed via isDevSession guard below)
//   • Legacy JWTs without the field → undefined (not blocked — treated as trusted)
//
// Dev bypass: NODE_ENV=development or ENABLE_DEV_ACCOUNTS=true, but never when
// DATABASE_ENV=production. This lets local/UAT HR_ADMIN sessions continue
// without TOTP enrollment while blocking demo accounts in production.
//
// Production path: mfaVerified is always true for Entra ID (set in jwt callback).
// No TOTP library is required for the current implementation — the MFA enforcement
// is satisfied by trusting Entra ID Conditional Access.
//
// Future Phase 3: add app-level TOTP enrollment UI (recovery codes, QR code, etc.)
// for environments where Entra ID CA cannot be enforced.
//
// See tests/roadmap/mfa-phase1-assessment.md for full risk register.

/** Roles that require MFA verification (SEC-04). */
const HIGH_PRIVILEGE_ROLES: KRole[] = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

export async function requireRole(allowed: KRole[]): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!allowed.includes(user.role as KRole)) {
    throw new Error(
      `FORBIDDEN: requires one of [${allowed.join(', ')}], got ${user.role}`,
    )
  }

  // SEC-04: step-up MFA check for high-privilege roles.
  // Use strict `=== false` so undefined (legacy JWTs) is not blocked.
  const roleRequiresMfa = HIGH_PRIVILEGE_ROLES.includes(user.role as KRole)
  const isDevSession = areDevAccountsAllowed()
  // Identity-based policy (OP-001): LOCAL (non-corporate-email) accounts cannot
  // perform Entra MFA, so they are exempt from the step-up. Corporate-email/SSO
  // sessions still require MFA. RBAC (the allowed-roles check above) ALWAYS
  // applies regardless of provider. NOTE: re-enabling MFA is tracked as OP-001
  // (docs/OPEN-POINTS.md) — to revert, drop `&& !isLocalSession`.
  const isLocalSession = user.loginProvider === 'LOCAL'
  if (roleRequiresMfa && !isDevSession && !isLocalSession && user.mfaVerified === false) {
    throw new Error(
      'STEP_UP_REQUIRED: MFA verification required for this role. ' +
      'Please sign in via Microsoft to complete MFA verification.',
    )
  }

  return user
}
