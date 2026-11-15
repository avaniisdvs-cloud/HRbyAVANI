# 12 — File Ownership Matrix

> Generated: 2026-06-04.
> Use this matrix to assess risk before modifying any file. Higher-risk files require careful review and regression testing.

---

## Risk Definitions
- **CRITICAL**: A bug here can break production for all users immediately
- **HIGH**: Complex code with many dependents; changes require careful testing
- **MEDIUM**: Moderate complexity; test affected flows before committing
- **LOW**: Self-contained; safe with unit tests passing

---

## Ownership Matrix

| Path Pattern | Module | Safe To Modify | Requires Review | Risk Level | Notes |
|---|---|---|---|---|---|
| `lib/workflow-engine.ts` | Workflow | No — all changes need explicit approval and regression tests | AI/Human review + full collision test suite | CRITICAL | Powers ALL approval flows across leave, hiring, transfer, probation. Any change can break multiple modules simultaneously. Must run `tests/integration/workflow-collision.test.ts` after every change. COLLISION-001 through COLLISION-PROBATION all fixed here. |
| `lib/auth.ts` | Auth | No — changes affect all 119 pages | Human review + security test suite | CRITICAL | requireRole(), MFA step-up gate, HIGH_PRIVILEGE_ROLES constant. A bug here can bypass RBAC for all routes. Must run `tests/security/` after changes. |
| `lib/db.ts` | DB | No — used by every module | Human review | CRITICAL | Drizzle client singleton, pool settings (max:1 for Neon serverless), DbOrTx type export. Changing pool settings affects connection exhaustion at scale. |
| `lib/encryption.ts` | Security | No — handles PII | Human review + security tests | CRITICAL | AES-256-GCM for emirates_id, passport_number, iban. A bug corrupts encrypted PII permanently. |
| `lib/audit.ts` | Audit | With caution | Review + integration tests | HIGH | INSERT-only audit trail. Hard Rule 1: every write must call audit.log() in same transaction. A bug here breaks compliance and audit requirements. |
| `lib/effective-date.ts` | Core HR | With caution | Unit tests required | HIGH | Effective-date pattern (close + open). Never DELETE HR records — this implements the correct pattern. A bug here causes data integrity issues. |
| `modules/absence/actions.ts` | Absence | Yes, with tests | Run absence integration tests | HIGH | Contains ARIA-LOCK advisory lock, backdate policy enforcement, complex leave creation flow. Changes to createLeaveRequest need collision regression tests. |
| `modules/core-hr/actions.ts` | Core HR | Yes, with tests | Run core-hr unit tests | HIGH | Person create/update/list. Cross-module dependency. Any schema changes here ripple to ESS profile, HR admin, org chart. |
| `modules/payroll/` | Payroll | Yes (non-calculation files) | EOSB/GPSSA changes need specialist review | HIGH | `services.ts` (calculateEosb, calculateGpssaContribution) is UAE compliance code — errors cause incorrect payroll. Advisory lock must stay in `actions.ts`. |
| `modules/migration/v2-executor.ts` | Migration | Yes, with migration unit tests | Run `tests/unit/migration-v2-executor.test.ts` | HIGH | detectZeroWriteFailure() must stay. false-success bug was root cause of failed pilot. Any change to phase logic needs regression test V2EX-001–010. |
| `drizzle/schema/foundation.ts` | Database | With extreme caution | Human review + migration SQL | CRITICAL | Core HR tables: persons, positions, departments, worker_assignments, legal_entities. Schema changes require migration SQL. Column removals break backwards compatibility. |
| `drizzle/schema/configuration.ts` | Database | With caution | Human review + migration SQL | HIGH | Workflow templates, leave rules, custom fields, feature permissions, backdate policies. Changes affect MDM module. |
| `drizzle/schema/transactions.ts` | Database | With caution | Human review + migration SQL | HIGH | Payroll runs, leave requests, absence balances, EOSB, GPSSA, DEWS. Active transactional data. |
| `drizzle/schema/workflow-engine.ts` | Database | With extreme caution | Human review + collision tests | CRITICAL | Workflow instances, steps, SLA timers. Connected to workflow-engine.ts. Schema changes can corrupt in-flight approval workflows. |
| `drizzle/migrations/` | Database | New files only | Human review before applying to Neon | HIGH | Never modify an already-applied migration. Write new .sql files only. Apply via Neon SQL Editor (never drizzle-kit). Next slot: 0055. |
| `app/(hr-admin)/payroll/` | Payroll UI | Yes, with tests | Run payroll E2E if available | MEDIUM | UI layer only. Server actions in modules/payroll/actions.ts are the risk; UI changes are lower risk. |
| `app/(hr-admin)/admin/migration/` | Migration UI | Yes, with tests | Review MigrationConsoleV2.tsx changes carefully | MEDIUM | Step 6 status should show 'failed' (not 'warning') when ok=false. Regression tests cover this behavior. |
| `config/workspace-nav.ts` | Navigation | Yes — but ALWAYS update admin-nav.ts too | Check admin-nav.ts is in sync | MEDIUM | Two-file invariant. Adding route to only one file means MANAGER role users lose access. Both files must stay structurally identical. |
| `config/admin-nav.ts` | Navigation | Yes — but ALWAYS update workspace-nav.ts too | Check workspace-nav.ts is in sync | MEDIUM | See above. This serves MANAGER role. workspace-nav.ts serves HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN. |
| `components/layout/WorkspaceRail.tsx` | Navigation | Yes, with care | Visual regression check | MEDIUM | Renders the workspace switcher and secondary nav. Photo URL threading from layout must stay. Changes visible on all HR admin pages. |
| `middleware.ts` | Auth | No — affects all routes | Human review + security tests | CRITICAL | Auth.js session enforcement on every request. x-request-id generation. A bug here can expose all routes or block all authenticated users. |
| `app/api/auth/` | Auth | No | Human review | CRITICAL | Auth.js route handlers. Breaking these blocks all SSO login. |
| `app/api/cron/` | Background Jobs | With caution | Test timing/dedup logic | MEDIUM | workflow-sla and probation-alerts cron handlers. COLLISION-NOTIF dedup must stay in probation-alerts. Test that remindedAt is set atomically. |
| `app/globals.css` (design tokens) | Design System | Yes, tokens only | Visual regression check | LOW | Token values. WCAG AA certified. If changing token values: verify contrast ratios before committing. Never add raw hex colors. |

---

## Cross-Cutting Rules (Apply to All Files)

### Rule 1 — Transaction + Audit (lib/audit.ts, all modules)
Every file that writes to the database must:
```typescript
await db.transaction(async tx => {
  await tx.insert(table).values({...})
  await audit.log(tx, { actor, event, resourceId, newValues })
})
```

### Rule 2 — Role Gating (lib/auth.ts)
Every server action must start with:
```typescript
const session = await auth()
requireRole(session, ['ALLOWED_ROLES'])
```

### Rule 3 — Effective Date (lib/effective-date.ts)
HR records are NEVER deleted. Use close + open pattern:
```typescript
// Close old record: set validTo = today
// Open new record: insert with validFrom = today
```

### Rule 4 — PII Encryption (lib/encryption.ts)
These fields must ALWAYS be encrypted before persisting:
- `emirates_id`
- `passport_number`
- `iban`

### Rule 5 — Bilingual (all UI files)
Every user-facing string must have both `name_en` and `name_ar`.

### Rule 6 — Cross-Module Imports (modules/*/index.ts)
Import from other modules only via their barrel file:
```typescript
// Correct
import { getDepartmentHead } from '@/modules/core-hr'
// Wrong
import { getDepartmentHead } from '@/modules/core-hr/department-head'
```

### Rule 7 — Token-Only CSS (app/globals.css + components)
```css
/* Correct */
color: var(--ink-1);
background: var(--accent-050);

/* Wrong — never raw hex in components */
color: #151A22;
background: #EFF5F6;
```

### Rule 8 — tenant_id on Every Insert
```typescript
await tx.insert(myTable).values({
  ...data,
  tenantId: TENANT_ID,  // '00000000-0000-0000-0000-000000000001'
})
```
