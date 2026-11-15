# 09 — AI Session Guide

> Generated: 2026-06-04. Practical guide for all AI assistants continuing development on AVANIIS HR.
> Read this before any task. It documents what has gone wrong before and how to avoid it.

---

## Quick Start

Load these files at the start of every session (in this order):

1. `docs/project-memory/2026-06-04/00-README-HANDOVER.md` — orientation and state summary
2. `docs/project-memory/2026-06-04/03-CURRENT-STATE.md` — exact current codebase state
3. `docs/project-memory/2026-06-04/11-DO-NOT-BREAK-RULES.md` — what must never be changed

Then run these verification commands before touching any file:
```bash
git log --oneline -3       # confirm you are on the right commit
git status                 # confirm clean working tree (should be clean)
pnpm typecheck             # must be 0 errors before you start
```

---

## Task-Specific Loading Guide

| Task Type | Files To Load | Files To Avoid | Suggested Branch | Notes |
|---|---|---|---|---|
| **Employee record changes** | `modules/core-hr/actions.ts`, `modules/core-hr/validations.ts`, `drizzle/schema/foundation.ts` | `lib/workflow-engine.ts` | `feat/core-hr-*` | Always check effective-date pattern; never hard-delete persons |
| **Leave / absence changes** | `modules/absence/actions.ts`, `modules/absence/backdate-policy-actions.ts`, `drizzle/schema/transactions.ts` | `modules/payroll/` | `feat/leave-*` | Backdate policy enforced before DB write; advisory lock inside transaction |
| **Workflow engine changes** | `lib/workflow-engine.ts`, `lib/db.ts`, `drizzle/schema/workflow-engine.ts` | Everything else first | `feat/workflow-*` | MOST DANGEROUS FILE. Every change needs collision regression test in `tests/integration/workflow-collision.test.ts` |
| **Master data / MDM changes** | `app/(hr-admin)/master-data/`, `components/mdm/MdmDrawer.tsx`, relevant `modules/config/` | `lib/workflow-engine.ts` | `feat/mdm-*` | Both nav files must stay in sync if adding a new MDM route |
| **Reporting changes** | `modules/reports/`, `app/(hr-admin)/reports/` | Schema files | `feat/reports-*` | Always use Promise.all for parallel queries; never sequential awaits |
| **Payroll changes** | `modules/payroll/`, `app/(hr-admin)/payroll/` | `lib/workflow-engine.ts` | `feat/payroll-*` | Advisory lock required for run number; test EOSB edge cases |
| **RBAC changes** | `lib/auth.ts`, `drizzle/schema/configuration.ts` (feature_permissions) | Everything else | `feat/rbac-*` | requireRole() change affects ALL modules; MFA step-up gate must stay |
| **Database migrations** | `drizzle/migrations/` only | drizzle-kit (DO NOT USE) | `feat/migration-*` | Next slot: 0055. Apply via Neon SQL Editor only. Journal stops at 0039. |
| **UI / design changes** | `app/globals.css`, `tailwind.config.ts`, specific component | Schema files | `feat/ui-*` | Only use CSS tokens; never raw hex. Check dark-mode too. |
| **Bug fixing (generic)** | The specific file with the bug + its test file | Unrelated modules | `fix/bug-name` | Run typecheck before and after. Add regression test. |
| **Migration Factory changes** | `modules/migration/v2-executor.ts`, `modules/migration/v2-actions.ts`, `app/(hr-admin)/admin/migration/` | Production schema files | `feat/migration-factory-*` | Read CLAUDE.md migration section first. detectZeroWriteFailure() must stay. |
| **AI / ARIA changes** | `modules/aria/`, `app/api/aria/chat/route.ts`, `app/(hr-admin)/aria/`, `app/(employee)/me/aria/` | `lib/workflow-engine.ts` | `feat/aria-*` | All Claude API errors must return bilingual AriaResponse, never crash |

---

## Critical Session Rules

### 1. Always typecheck after code changes
```bash
pnpm typecheck   # must be 0 errors
```
If you see TypeScript errors after your change, fix them before committing. Never leave a session with TS errors.

### 2. Always check git status before starting
```bash
git status   # should show clean working tree
git log --oneline -3   # confirm you are on the right commit
```
If there are uncommitted changes from a previous session, understand them before adding more changes.

### 3. Never apply migrations via drizzle-kit
```bash
# WRONG — do not run this
pnpm drizzle-kit migrate

# CORRECT — apply via Neon SQL Editor
# Copy contents of drizzle/migrations/0055_your_migration.sql
# Paste into Neon Console → Project → SQL Editor → Execute
```
The drizzle journal only tracks 0000–0039. Running `drizzle-kit migrate` on a fresh DB will NOT apply 0040–0054. For new migrations (0055+), write the SQL file, then apply manually.

### 4. Always sync worktree changes to main project path
If you use git worktrees for parallel development, every file edit in the worktree must also be applied to `/Users/d.kethari/D_Drive/AVANIIS_HR_SYS` immediately. Changes in a worktree branch never automatically merge to main.

### 5. Never commit UAT dev credentials
The dev credential accounts (`employee@avaniis.dev`, `hr.admin@avaniis.dev`, etc.) are gated by `NODE_ENV=development`. The `ENABLE_DEV_ACCOUNTS` env var controls this in Vercel. Never expose real credentials in code or git history.

### 6. Always update e2etestresults.md after Playwright runs
After every `pnpm playwright test` run, add a new numbered entry to `tests/e2e/e2etestresults.md` before reporting results. This is a project invariant from MEMORY.md.

### 7. Never use translateError() in Server Components
`translateError()` has return type `never` — it always re-throws as AppError. In Server Components (page.tsx files), this crashes the render with "An error occurred in the Server Components render". 
- In server actions: return `{ error: string }` instead of throwing
- In server component pages: use try/catch with `notFound()` or empty state fallback

### 8. Always use db.transaction() + audit.log() for every write
Every DB write must be inside a transaction with an audit log entry in the same transaction. The audit log row must be written atomically with the business data row. No exceptions.

### 9. Always include tenant_id in every insert
Every table has `tenant_id DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`. Even though it has a default, explicitly include it in all inserts for clarity and defence against future multi-tenant changes.

### 10. Check both nav files when adding routes
`config/workspace-nav.ts` and `config/admin-nav.ts` are two separate files. Adding a new route to only one means the other role (MANAGER) loses access. Always update both files together.

---

## Known Footguns (Things That Have Caused Bugs Before)

### Footgun 1 — translateError() in Server Components
**What happened**: `listPersons`, `getMyProfile`, `getPerson` all used `translateError()` in catch blocks. Any DB error crashed the entire page with a generic Next.js error message instead of a graceful fallback. Fixed as BUG-NAV-001.
**Avoid by**: Never use `translateError()` in page.tsx Server Components. Return `null` / `[]` / `notFound()` on error.

### Footgun 2 — Silent .catch() swallowing errors in migration executor
**What happened**: `setManagerLinks`, `setDeptHeads`, `insertLeaveBalances` all had `.catch(() => { return { created: 0 } })` — exceptions were silently eaten. The migration reported `ok=true` even when 0 records were written. Fixed with `detectZeroWriteFailure()`.
**Avoid by**: Never use bare `.catch()` that returns a success-shaped object. Use explicit `try/catch` and push to `errors[]`.

### Footgun 3 — Manager links resolution using only live DB (not within-batch)
**What happened**: During the V1 migration pilot, all 21 employees had `lineManagerId = null` because the validator checked manager references against the live DB only. Employees being imported in the same batch couldn't be found as managers for each other.
**Avoid by**: Within-batch resolution via the Managers sheet. Do not assume imported-in-the-same-batch persons exist in DB yet.

### Footgun 4 — Sequential DB awaits on dashboards
**What happened**: The payroll page and original dashboard had sequential `await db.select()` calls. Each held the Neon connection in series, causing p95 page loads >2,000ms.
**Avoid by**: Always use `Promise.all([...])` for independent DB queries on the same page.

### Footgun 5 — Two nav files getting out of sync
**What happened**: A new MDM route was added to `workspace-nav.ts` but not `admin-nav.ts`. MANAGER role users couldn't see the new route.
**Avoid by**: `grep` both files when adding routes. They must always be identical in structure.

### Footgun 6 — Missing tenant_id on new table inserts
**What happened**: New tables added without `tenant_id` DEFAULT got null constraint violations on insert.
**Avoid by**: Every new table in Drizzle schema must have `tenantId: uuid('tenant_id').notNull().default(sql\`'00000000-...'::uuid\`)`.

### Footgun 7 — Workflow double-approval race condition
**What happened**: Two concurrent callers both read `status='PENDING'` and both wrote `status='APPROVED'`. The second approval silently succeeded.
**Fixed by COLLISION-001**: `takeWorkflowAction` now uses `UPDATE WHERE status='PENDING' RETURNING id`. Empty return = race detected → error.
**Avoid by**: Never read-then-write workflow status in two separate transactions.

### Footgun 8 — SAS URL written verbatim to audit log
**What happened**: Profile photo upload stored a 7-day Azure SAS URL directly in `audit_log.new_values`. The token was a live credential persisted in the audit trail.
**Fixed as FIX-2G-002**: Now writes `'<updated>'` placeholder instead of the SAS URL.
**Avoid by**: Never log tokens, SAS URLs, presigned URLs, or any time-limited credentials to the audit trail.

### Footgun 9 — EMPLOYEE role cross-person data access
**What happened**: `getMyProfile` server action accepted any `personId` parameter without checking session ownership. Any authenticated EMPLOYEE could read another employee's full profile.
**Fixed as FIX-2G-001**: EMPLOYEE role guard added: `if (role === 'EMPLOYEE' && session.user.personId !== personId) return null`.
**Avoid by**: Any server action accepting a `personId` must verify EMPLOYEE role can only access their own personId.

### Footgun 10 — EROFS: read-only file system on Vercel
**What happened**: Document upload fallback wrote to `process.cwd()/public/uploads/` — read-only on Vercel serverless functions.
**Fixed as BUG-DMG-001**: Fallback now uses `/tmp/avaniis-uploads/` (writable on Vercel).
**Avoid by**: Never write to `process.cwd()` or `__dirname` in server-side code on Vercel. Use `/tmp` for ephemeral storage, cloud provider for persistent storage.

---

## Migration Factory Session Notes

### Current DB State (as of 2026-06-04)
- 21 active employees loaded (V1 pilot)
- 0 manager links (`persons.lineManagerId = NULL` for all 21)
- 0 leave balances (`absence_balances` table empty)
- 2 department heads set (via V1 backfill, not V2)
- Org Chart, My Team, Leave Requests: NOT READY

### DO NOT attempt to patch the current state
The false-success bug is now fixed in v2-executor.ts. The correct action is to run a full V2 reload:

```
Step 2: Clear (removes 21 employees + V1 dept head backfill + all assignments)
Step 3: Seed master data
Step 4: Upload pilot-v2-migration-package.xlsx (from hr_data_migration/UAT/)
Step 5: Validate (expect: 21 employees, 20 manager links, 2 dept heads, 21 leave balances)
Step 6: Dry run (confirm counts match expected)
Step 7: Execute (expect: ok=true, all 4 phases write non-zero)
Step 8: Scorecard (expect: READY — all 9 checks pass)
Step 9: Sign off
```

### What the false-success fix does
`detectZeroWriteFailure()` in `v2-executor.ts`:
- If expected writes > 0 and created = 0 → pushes to `errors[]` → `ok = false`
- If expected writes = 0 (empty sheet) → not an error (legitimate)
- Fires for Phase 2 (managers), Phase 3 (deptHeads), Phase 4 (leaveBalances)

### If any phase returns 0 writes during Step 7
The executor now fails hard with an error naming the skipped person numbers. Do NOT proceed to Step 8. Investigate which person numbers are missing from DB / master data and re-run from Step 2.

---

## Testing Checklist Before Any Commit

```bash
pnpm typecheck                    # 0 errors required
pnpm vitest run tests/unit        # all unit tests
pnpm vitest run tests/integration # if DB-layer code changed
pnpm build                        # 0 build errors
# For E2E (when available):
pnpm playwright test --project=hr-admin   # HR admin flows
```

Then update `tests/e2e/e2etestresults.md` if any Playwright tests were run.
