# Identity-Based LOCAL Login

**Created:** 2026-06-12 · **Implemented:** 2026-06-05 (`c67ef3c`, building on `9aabfb6`) · **Related open point:** OP-001 (`docs/OPEN-POINTS.md`)

## What it is
Password-based sign-in for users **without a corporate (Entra ID) email** — e.g. workers with personal email addresses — alongside the primary Microsoft Entra ID SSO. Login provider is recorded per user (`loginProvider = 'LOCAL'`).

## Behaviour
- **Who:** non-corporate-email identities; originally scoped to EMPLOYEE/MANAGER (`9aabfb6`), extended to identity-based resolution for any non-corporate user (`c67ef3c`).
- **Credential storage:** bcrypt password hashes.
- **Lockout:** 5 failed attempts → 15-minute lockout (enforced in `lib/local-login.ts`).
- **Domain routing:** `AUTH_ALLOWED_DOMAINS` decides SSO vs LOCAL path; corporate-domain users must use SSO.
- **Dev/demo accounts:** separate mechanism (`ENABLE_DEV_ACCOUNTS`, `lib/environment-guardrails.ts: areDevAccountsAllowed()` — blocked when `DATABASE_ENV=production`). Demo accounts are NOT LOCAL login; see SEC-09 release gate.

## Security posture & known deferral (OP-001)
MFA step-up for HIGH_PRIVILEGE_ROLES is **relaxed for LOCAL sessions** (`lib/auth.ts` ~L593–608: `isLocalSession` exempts LOCAL from `mfaVerified` enforcement). This is a deliberate, tracked deferral — protected meanwhile by password + lockout + bcrypt. **Must be re-enabled before production go-live** (OP-001).

## Key files
`lib/auth.ts` (provider resolution, MFA step-up logic) · `lib/local-login.ts` (password verification, lockout) · `lib/environment-guardrails.ts` (dev-account gating).

## Operational notes
- Production: set `AUTH_ALLOWED_DOMAINS`, ensure `ENABLE_DEV_ACCOUNTS` is unset, and close OP-001 before go-live.
- Password resets for LOCAL users are an HR Admin operation (no self-service reset flow in Phase 1).
