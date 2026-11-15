# 10 — Next Development Plan

> Generated: 2026-06-04.
> This document defines the recommended sequence of work after the session that fixed the Migration V2 false-success bug.

---

## Immediate Next Steps (Priority Order)

### Priority 1 — Migration V2 Pilot Reload
**Status**: BLOCKED — must run Step 2 Clear before reloading.
**Why**: Current Neon DB has 21 employees from V1 load with 0 manager links and 0 leave balances. Cannot patch in place; must clear and reload via V2.

**Exact sequence**:
1. Navigate to: HR Admin → Data Migration Activity
2. Step 2: Clear — removes 21 employees, V1 dept head backfill, all assignments
3. Step 3: Seed master data — seeds legal entities, departments, positions, grades, locations
4. Step 4: Upload `hr_data_migration/UAT/pilot-v2-migration-package.xlsx`
5. Step 5: Validate — expect 21 employees, 20 manager links, 2 dept heads, 21 leave balances
6. Step 6: Dry run — confirm counts match validation; 0 blockers
7. Step 7: Execute — expect `ok=true`; check all 4 phase counts are non-zero
8. Step 8: Post-load scorecard — expect READY; all 9 checks pass
9. Step 9: Sign off — generate sign-off record

**Success criteria**:
- `persons.lineManagerId` non-null for 20 of 21 employees (Talal has no manager — root node)
- `absence_balances` has 21 rows
- Org Chart renders with hierarchy
- Leave Requests page loads without error (fail-closed was due to empty balances)
- Manager Approvals inbox works for Talal and Dorababu

### Priority 2 — Verify Post-Load Scorecard (9 checks)
After Step 8, verify each scorecard check passes:
1. All employees have worker_assignments
2. All employees have absence_balances
3. All employees (except root) have lineManagerId set
4. Dept heads linked via departments.head_person_id
5. HOD auto-link audit event present (MIGRATION.HOD_AUTO_LINK)
6. No circular manager references
7. All employees have user accounts (or documented exceptions for K643/K450)
8. Leave balance years are current
9. MIGRATION.LEAVE_BALANCES_CREATED audit event present

### Priority 3 — Document Storage Production Setup
**Status**: UAT-only (files in /tmp; ephemeral).
Five production blockers remain (DMG-PROD-1 through DMG-PROD-5):

| Blocker | Action Required |
|---|---|
| DMG-PROD-1 | Set `DOCUMENT_STORAGE_PROVIDER=azure` + `AZURE_STORAGE_CONNECTION_STRING` in Vercel (all env scopes) |
| DMG-PROD-2 | Upload test file; force container recycle; verify file still accessible |
| DMG-PROD-3 | Test `getDocumentUrl` end-to-end with Azure Blob (signed URL flow, not /tmp stream) |
| DMG-PROD-4 | Seed HR Admin + person + entity test data in Neon; rerun 5 skipped HA-* Playwright tests |
| DMG-PROD-5 | Verify `lib/storage/factory.ts` throws (not falls back to /tmp) when `NODE_ENV=production` + wrong env var |

---

## Recommended Priorities (Post-Pilot)

### A — Document Storage Production Blockers (HIGH)
Complete DMG-PROD-1 through DMG-PROD-5 as listed above.
Coordinates with: Vercel dashboard, Azure Portal, Avaniis IT team.

### B — WIP Migrations Audit (MEDIUM)
Investigate migration files with `_wip_` prefix in `drizzle/migrations/`:
- Identify which (0055–0061 range) are safe to apply
- Determine if any are required for upcoming features
- Do NOT apply blindly — understand each one first
- Test on Neon staging before applying to production

### C — Payroll Module Completeness Audit (MEDIUM)
See `docs/project-memory/2026-06-04/08-PAYROLL-READINESS.md` for full checklist.
Priority sub-items:
1. Verify `calculateEosb()` handles all termination scenarios with unit tests
2. Verify WPS SIF file format matches UAE Central Bank v2.0 specification
3. Replace hardcoded GPSSA rates with configurable DB table
4. Verify payslip PDF renders bilingual

### D — MFA TOTP Enrollment UI (LOW)
**Status**: Phase 3 stretch goal. Entra ID CA is the production MFA control; app-level TOTP is additional defence-in-depth.
**Scope**: QR code enrollment flow, recovery codes, TOTP verification on login for non-Entra users.
**Dependency**: Requires `otplib` or similar; needs auth.ts JWT changes for `mfaVerified` from TOTP path.

### E — Insurance Module Phase 2 (LOW)
**Status**: Phase 1 insurance module built (read-only ESS view, basic admin). Insurer API integration deferred.
**Scope**: Insurer API integration, bulk import of insurance data, plan change automation on promotion.
**Dependency**: Insurer API credentials from Avaniis IT team.

---

## Branch Strategy

### Main Branch
- `main` is the production branch — auto-deploys to `avaniishcm.vercel.app` on push
- Never force-push to main
- Every merge to main must pass: `pnpm typecheck` + `pnpm build`

### Feature Branches
```bash
git checkout -b feat/v2-pilot-reload   # for migration factory work
git checkout -b feat/document-storage  # for Azure Blob integration
git checkout -b fix/bug-name           # for bug fixes
```

### Worktree Strategy
When working on two independent features in parallel:
```bash
git worktree add ../AVANIIS-HR-FEAT /branch-name
# Always sync changes back to main project path
# Changes in worktree never automatically reach main
```

---

## Migration Strategy

### Current State
- Journal tracks: 0000–0039 (Drizzle managed)
- Applied manually: 0040–0054 (Neon SQL Editor)
- WIP files: check `drizzle/migrations/` for `_wip_` suffix — do NOT apply without review
- Next clean slot: ~~0055~~ → **0065** (corrected 2026-06-12 — 0062 email platform, 0063/0064 effective-dating applied to DEV/UAT; ledger SSOT: `docs/environment/migration-ledger.test.md`)

### Creating a New Migration
```bash
# 1. Write the SQL file
# File: drizzle/migrations/0055_your_feature_name.sql

# 2. Update Drizzle schema TypeScript
# File: drizzle/schema/relevant-file.ts

# 3. Apply to Neon STAGING first
# Neon Console → Project → SQL Editor → paste 0055 SQL → Execute

# 4. Verify in staging
# SELECT table_name FROM information_schema.tables WHERE table_schema='public';

# 5. Apply to Neon PRODUCTION
# Same process after staging confirmation

# 6. Commit both the .sql file and schema .ts file
git add drizzle/migrations/0055_your_feature_name.sql
git add drizzle/schema/relevant-file.ts
git commit -m "feat(schema): add your_feature_name (migration 0055)"
```

### What NOT to do
- Do NOT run `pnpm drizzle-kit generate` — it will try to generate migrations for the 0040–0054 gap
- Do NOT run `pnpm drizzle-kit migrate` against Neon — it will not apply 0040–0054
- Do NOT add columns as `NOT NULL` without a default or backfill (Expand→Migrate→Contract pattern)

---

## Testing Strategy Before Release

Run in this order:

```bash
# 1. TypeScript
pnpm typecheck              # must be 0 errors

# 2. Unit tests
pnpm vitest run tests/unit  # all unit tests

# 3. Integration tests (if DB-layer code changed)
pnpm vitest run tests/integration

# 4. Security tests (if RBAC or auth changed)
pnpm vitest run tests/security

# 5. Build
pnpm build                  # must be 0 errors, shows page count

# 6. E2E (for affected flows)
pnpm start &
pnpm playwright test --project=hr-admin     # HR admin flows
pnpm playwright test --project=employee     # ESS flows
```

After Playwright: add entry to `tests/e2e/e2etestresults.md`.

---

## Release Strategy

### Standard Release
```bash
# 1. Verify locally
pnpm typecheck && pnpm build

# 2. Push to main (triggers Vercel auto-deploy)
git push origin main

# 3. Verify on Vercel
# - Check build logs for errors
# - Navigate to avaniishcm.vercel.app
# - Test key affected flows
# - Check Vercel function logs for runtime errors

# 4. If issues: revert via Vercel dashboard (instant rollback) or git revert
```

### DB Migration Release
```bash
# Apply SQL to Neon BEFORE pushing code that depends on new columns
# 1. Apply migration via Neon SQL Editor
# 2. Verify columns/tables exist
# 3. Push code changes to main
# 4. Verify deployment
```

### Rollback Plan
- Vercel: Instant rollback to previous deployment via Vercel dashboard
- Database: Drizzle has no automatic rollback. Write a manual rollback SQL before applying any migration.
- For column additions: `ALTER TABLE foo DROP COLUMN bar;`
- For table additions: `DROP TABLE foo;`

---

## Open Decisions (Needs User Input)

| Decision | Context | Status |
|---|---|---|
| Azure Blob vs AWS S3 for document storage | Both implementations exist in lib/storage/; just needs env var configuration | Awaiting Azure credentials from Avaniis IT |
| Production deployment domain | hr.avaniis.global (prod) + hr-test.avaniis.global (test) once Avaniis.global→AVANIIS.global migration done | Deferred |
| DEWS provider | Which DEWS provider will Avaniis use? API credentials needed for Phase 3 | Awaiting Avaniis finance team |
| App-level TOTP (MFA) | Phase 3 stretch goal; Entra ID CA is primary MFA | Decision: implement or skip? |
