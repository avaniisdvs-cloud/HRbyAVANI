/**
 * auth schema re-exports — Sprint 2 skeleton.
 * User accounts, refresh tokens, and SSO provider config.
 * Auth.js v5 sessions are JWT-only — refresh tokens here are for the
 * password / SSO flows wired in `lib/auth.ts`.
 */
export {
  userAccounts,
  refreshTokens,
  ssoProviderConfig,
} from '@/drizzle/schema'

export type {
  UserAccount,
  RefreshToken,
  SsoProviderConfig,
  NewUserAccount,
} from '@/drizzle/schema'
