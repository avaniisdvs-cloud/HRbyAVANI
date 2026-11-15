# 05 — RBAC & SECURITY

> Last updated: 2026-06-04
> Sources: lib/auth.ts, modules/auth/index.ts, drizzle/schema/configuration.ts (featurePermissions)

---

## Roles (7 total)

| Role | Access Scope | Key Permissions | Notes |
|---|---|---|---|
| EMPLOYEE | Own records only (ESS) | View/edit own profile, submit leave, view payslips, view own letters, read-only insurance | Routes to /me/* only. Cannot cross-read other employees. getMyProfile enforces ownership guard. |
| MANAGER | Own team + approval inbox | View direct reports, approve/reject leave and actions for team, view team timesheets | Routes to admin-nav.ts sidebar. No access to payroll or global HR admin. |
| PAYROLL_ADMIN | Payroll module only | Create/run payrolls, generate WPS SIF, view salary elements, EOSB calculations | Does NOT require MFA step-up. Entity-scoped. |
| FINANCE | Finance reports only | View GL journals, financial exports, payroll cost reports | Does NOT require MFA step-up. Read-mostly. |
| HR_ADMIN | Full HR admin (entity-scoped) | Create/edit employees, manage leave, run workflows, approve documents, access all HR modules | **Requires MFA** (HIGH_PRIVILEGE_ROLES). Scoped to `session.user.legalEntityId`. Cannot cross-entity without SUPER_ADMIN. |
| HR_DIRECTOR | Full HR admin (cross-entity) | Same as HR_ADMIN but can view across multiple entities | **Requires MFA** (HIGH_PRIVILEGE_ROLES). |
| SUPER_ADMIN | Everything + DataOps + Migration | All HR_DIRECTOR permissions + user management, DataOps console (/admin/dataops), Data Migration Factory (/admin/migration), system settings | **Requires MFA** (HIGH_PRIVILEGE_ROLES). Only role allowed password-based login in production (bcryptjs). |

### Dev-only credential accounts

These are hardcoded in `lib/auth.ts` and active ONLY when `NODE_ENV=development` or `ENABLE_DEV_ACCOUNTS=true`:

```
super.admin@avaniis.dev / demo   → SUPER_ADMIN
hr.admin@avaniis.dev    / demo   → HR_ADMIN
hr.director@avaniis.dev / demo   → HR_DIRECTOR
payroll@avaniis.dev     / demo   → PAYROLL_ADMIN
manager@avaniis.dev     / demo   → MANAGER
employee@avaniis.dev    / demo   → EMPLOYEE
finance@avaniis.dev     / demo   → FINANCE
```

---

## HIGH_PRIVILEGE_ROLES

```typescript
const HIGH_PRIVILEGE_ROLES: KRole[] = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
```

These roles require `mfaVerified === true` in the JWT for any `requireRole()` call.

**How mfaVerified is set:**
- Microsoft Entra ID sessions → `mfaVerified = true` (Avaniis Conditional Access enforces MFA at OIDC layer)
- Dev credentials → `mfaVerified = false` (bypassed via `isDevSession` guard in `requireRole()`)
- Legacy JWTs without the field → `mfaVerified = undefined` (not blocked — treated as trusted to avoid breaking existing sessions)

**Dev bypass:** When `NODE_ENV=development` OR `ENABLE_DEV_ACCOUNTS=true`, the MFA check is skipped entirely. This allows local HR_ADMIN development without TOTP enrollment.

---

## RBAC Implementation

### Layer 1 — requireRole() in lib/auth.ts

```typescript
export async function requireRole(allowed: KRole[]): Promise<SessionUser>
```

- Called at the top of every Server Action
- Throws `FORBIDDEN: requires one of [...], got <role>` if role not in allowed list
- Throws `STEP_UP_REQUIRED: MFA verification required...` if HIGH_PRIVILEGE role with `mfaVerified === false` (and not dev session)
- Returns the authenticated `SessionUser` on success

**Standard Server Action pattern:**
```typescript
const session = await auth()
const user = await requireRole(session, ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
// user.legalEntityId is now safe to use for entity scoping
```

### Layer 2 — feature_permissions table (configuration.ts)

- Per-feature × per-role action matrix
- Actions: `view / create / edit / delete / approve / export`
- Zero code change to add a new permission — insert one row into `feature_permissions`
- UI at `/access/feature-permissions` (HR_ADMIN+ only)
- Checked by `modules/config/guards.ts` before every config write

---

## Access Boundaries

| Module | EMPLOYEE | MANAGER | PAYROLL_ADMIN | FINANCE | HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN |
|---|---|---|---|---|---|---|---|
| ESS (profile, leave, payslips) | Own only | Own only | Own only | Own only | Full | Full | Full |
| My Team | — | Own team | — | — | Full | Full | Full |
| People (persons list/detail) | — | Own team only | — | — | Entity-scoped | Cross-entity | All |
| Leave Admin | — | Team approvals | — | — | Entity-scoped | Cross-entity | All |
| Payroll | Own payslips | — | Full | Read | Run only | Run only | Full |
| Org Chart | View | View + actions | — | — | Full | Full | Full |
| Master Data | — | — | — | — | Full | Full | Full |
| Reports | — | Team reports | Payroll reports | Finance reports | HR reports | All | All |
| User Management | — | — | — | — | — | — | Full |
| DataOps Console | — | — | — | — | — | — | Full |
| Data Migration Factory | — | — | — | — | — | — | Full |
| System Settings | — | — | — | — | Partial | Partial | Full |
| ARIA Assistant | Own chat | Own chat | — | — | HR console | HR console | Full |

---

## Security Controls

### Authentication
- **Primary:** Microsoft Entra ID OIDC (Avaniis tenant, Conditional Access enforces MFA)
- **Secondary:** Password login — SUPER_ADMIN only, bcryptjs hash comparison
- **Dev/UAT:** Credentials provider (hardcoded accounts, disabled in production unless `ENABLE_DEV_ACCOUNTS=true`)
- **Session:** JWT strategy, `maxAge=1800s` (30 minutes), Auth.js v5

### MFA (SEC-04 — SHIPPED)
- Entra ID Conditional Access is the primary MFA control (enforced at OIDC layer before the app sees the token)
- `mfaVerified` JWT claim set from provider in `jwt` callback
- `requireRole()` enforces `mfaVerified === true` for HIGH_PRIVILEGE_ROLES in production
- App-level TOTP enrollment UI is a Phase 3 stretch goal (not yet implemented)

### PII Encryption
- `emirates_id`, `passport_number`, `iban` stored as AES-256-GCM ciphertext
- Key: `FIELD_ENCRYPTION_KEY` env var (32-byte hex) — NEVER commit
- Encrypt before write, decrypt after read — `lib/encryption.ts`
- Never log, compare, or display raw ciphertext

### Audit Trail (BR-AUDIT-001)
- `audit_log` table — INSERT-only, never updated or deleted
- `writeAuditLog()` must be called inside every `db.transaction`
- Every Server Action write produces an audit row
- Event types: AUTH.SIGN_IN, PERSON.CREATED, WORKER_ASSIGNMENT.CREATED, DOCUMENT.URL_ISSUED, DOCUMENT.ACCESS_DENIED, MIGRATION.MANAGER_LINKS_SET, etc.

### XSS Prevention
- `isomorphic-dompurify` used in `pdf-template.tsx` for all user-HTML-to-PDF paths
- Radix UI / shadcn components escape content by default
- No `dangerouslySetInnerHTML` in production UI paths

### SQL Injection
- Drizzle ORM uses parameterized queries exclusively
- No raw SQL string concatenation in application code
- DataOps console (SUPER_ADMIN) executes NL2SQL — gated at SUPER_ADMIN level, audit-logged

### Document Access (Defense in Depth)
- Server Action (`getDocumentUrl`): validates session + ownership/role → returns `/api/documents/${id}` URL (never raw storage key)
- API Route (`/api/documents/[id]`): independently re-validates session + ownership/role before serving bytes
- Unauthenticated direct URL → 401
- Cross-user URL attempt → 403
- Cloud storage: private containers; 5-minute SAS/presigned URL per-request
- `DOCUMENT.URL_ISSUED` and `DOCUMENT.ACCESS_DENIED` always audit-logged

### EMPLOYEE Ownership Guard
- `getMyProfile` in `modules/profile/actions.ts` enforces: if `session.user.role === 'EMPLOYEE'` and `session.user.personId !== personId` → return null (FIX-2G-001)
- HR_ADMIN+ roles can cross-read legitimately
- This prevents any authenticated EMPLOYEE from reading another employee's full profile via direct Server Action call

### CSRF
- Auth.js v5 handles CSRF protection for its own flows
- Next.js Server Actions are same-origin by design (no CSRF risk for mutation)

---

## Security Assumptions Future AI Agents Must Preserve

1. **Never expose raw storage keys or SAS tokens to the browser.** The API route + server action double-check pattern must be maintained. Removing either layer creates a direct PII exposure path.

2. **requireRole() must be the first call in every Server Action.** Any code that runs before requireRole() is unauthenticated by definition.

3. **PII fields must be encrypted before insert and decrypted after select.** Never pass plaintext emiratesId, passportNumber, or iban to Drizzle directly.

4. **Every db.transaction must include writeAuditLog() inside the same transaction.** Audit log outside the transaction can silently drop records if the transaction rolls back.

5. **The mfaVerified === false (strict equality) check must never be changed to falsy (!mfaVerified).** `undefined` (legacy JWTs) must not be blocked — that would lock out existing sessions at the moment of deployment.

6. **tenant_id must appear on every INSERT.** The column default only fires when the field is omitted; explicit `undefined` bypasses it. Always pass `tenantId: TENANT_ID`.

7. **The EMPLOYEE ownership guard in getMyProfile must be preserved.** It prevents cross-employee profile reads at the Server Action layer. Do not remove it to "simplify" the code.

8. **Cross-entity data isolation for HR_ADMIN.** HR_ADMIN is entity-scoped. Every query that runs under HR_ADMIN must include `WHERE legal_entity_id = session.user.legalEntityId`. SUPER_ADMIN bypasses this — but never extend SUPER_ADMIN bypass to HR_ADMIN.

9. **Dev credential bypass (ENABLE_DEV_ACCOUNTS) must never fire in production without explicit operator opt-in.** The guard is `process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_ACCOUNTS === 'true'`. Do not change to `!== 'production'` — that would include staging.

10. **Password login is restricted to SUPER_ADMIN role only.** The check `if (row.avaniisRole !== 'SUPER_ADMIN') return null` in the Credentials provider authorize() function must not be removed or relaxed.

---

## DataOps Console Security

- **Route:** `/admin/dataops` (SUPER_ADMIN only, `superAdminOnly: true` flag in workspace-nav.ts)
- **APIs:** `/api/dataops/execute`, `/api/dataops/nl2sql`, `/api/dataops/schema`, `/api/dataops/tables/[schema]/[table]` (CRUD)
- **All writes:** SUPER_ADMIN-gated at the API route level
- **NL2SQL:** Converts natural language to SQL via Claude API — every execution is audit-logged
- **Risk:** SUPER_ADMIN can execute arbitrary SQL. This is intentional (DataOps use case) but must never be exposed to lower roles.

---

## Session JWT Claims

The JWT carries exactly these claims (set in `lib/auth.ts` jwt callback):

| Claim | Type | Notes |
|---|---|---|
| id | string | User account UUID |
| email | string | Primary email |
| name | string | Display name |
| role | KRole | One of the 7 roles |
| legalEntityId | string | Primary entity UUID |
| personId | string? | persons.id — may be undefined for new SSO users |
| mfaVerified | boolean? | true=Entra ID, false=dev creds, undefined=legacy |

JWT maxAge: 1800 seconds (30 minutes). No refresh tokens for the session JWT itself.

---

## New User SSO Flow

When a Microsoft Entra ID user signs in for the first time with no `user_accounts` row:
1. Assigned `role = 'EMPLOYEE'` (safe default)
2. Assigned `legalEntityId = DEFAULT_LEGAL_ENTITY_ID` env var
3. SUPER_ADMIN receives in-app notification + email (if SMTP configured)
4. HR Admin must manually create an employee record and assign the correct role
5. `personId` remains undefined in JWT until the employee record is created and linked

This flow is safe: the new SSO user has EMPLOYEE access only and no personId, so they can log in but cannot access any meaningful HR data until provisioned.
