# i18n / EPRC Branch Split Recovery Report

> 2026-06-13 · recovery from a source-control contamination incident on `hardening/corehr-score-90-plus`

## 1. Final Recovery Verdict

## ✅ SAFE — clean i18n branch recovered, EPRC work preserved, nothing lost

The i18n localization work was cleanly separated from the parallel EPRC/security-hardening workstream into a new branch containing **zero** EPRC/security/schema/auth files. All work is preserved (backup branch + patches + the contaminated branch is untouched). All quality gates pass on the clean branch.

## 2. Branches

| Branch | Purpose | HEAD |
|---|---|---|
| `hardening/corehr-score-90-plus` | Contaminated working branch (i18n + EPRC mixed) — **left untouched**; active parallel session | `64214ca` |
| `backup/mixed-i18n-eprc-before-split-20260613-2203` | Safety backup of the mixed state | `64214ca` |
| `fix/i18n-rtl-language-preference-enterprise` | Clean i18n base (pre-EPRC) | `b0a0ae5` |
| **`fix/i18n-rtl-language-preference-clean`** | **NEW — recovered i18n-only branch** | `7d7a479` |

Worktree for the clean branch: `/Users/d.kethari/D_Drive/AVANIIS_i18n_clean` (isolated; node_modules/.env.local symlinked for validation).

## 3. Backup Created

- **Branch:** `backup/mixed-i18n-eprc-before-split-20260613-2203` @ `64214ca` (full mixed state, recoverable).
- **Patches/dir:** `/Users/d.kethari/D_Drive/HRMS_Backups/i18n-eprc-split-20260613-2203/`
  - `uncommitted-unstaged.patch` (451 lines — parallel session's uncommitted work)
  - `staged.patch` (empty), `status-porcelain.txt`, `untracked-list.txt`, `untracked-copy/` (copies of 16 untracked files), `commit-{def4d8b,86cde0f,64214ca}-stat.txt`.
- The EPRC/security work remains fully recoverable from `hardening/corehr-score-90-plus`, the backup branch, and the parallel session's still-intact uncommitted changes.

## 4. Mixed Commit Analysis

| Commit | Problem | i18n files kept | Non-i18n files excluded |
|---|---|---|---|
| `def4d8b` (F1–F6) | none — clean | 15 UI `.tsx` | — |
| `86cde0f` (comprehensive) | none — clean | ~43 UI `.tsx` + 2 i18n test updates | — |
| `64214ca` (dashboards) | **MIXED** via `git add -u` | 11 UI `.tsx` (4 dashboards, ProfilePageClient, bank/directory forms, PersonEdit/EditDrawer/Import/New) | 22 EPRC/other: `lib/app-error.ts`, `lib/dataops/write-guard.ts`, 13 `modules/**` (incl. `bank-details/actions.ts` adding `requirePermission`), 2 `docs/environment/migration-ledger.*`, 7 security/integration tests |
| `980b635` (governance doc) | parallel, not i18n | — | `DURC-01-UAT-READINESS-REPORT.md` (excluded) |
| `32a7169`,`652afd8`,`6e3b9e8` (`fix(sec)`) | EPRC | — | all (not cherry-picked) |

The clean branch was built by cherry-picking `def4d8b` + `86cde0f` onto `b0a0ae5`, then `git checkout 64214ca -- <only the 11 i18n .tsx>` and committing as `7d7a479`. No EPRC commit was included.

## 5. Clean i18n Branch Contents

~68 UI `.tsx` files (employee ESS, persons, master-data drawers, reports + role dashboards, settings, org-chart, timesheets, workflow config, employee-letters) + 2 i18n source-inspection test updates (`leave-rules-navigation`, `report-manager-ui`). The base `b0a0ae5` already carries the i18n infrastructure (`lib/i18n.ts`, `lib/language-preference.ts`, `lib/i18n-messages.ts`, `components/providers/LocaleProvider.tsx`, `messages/*.json`).

## 6. Excluded EPRC / Security Files (NOT on clean branch)

`lib/app-error.ts`, `lib/dataops/write-guard.ts`, `modules/access/actions.ts`, `modules/core-hr/{actions,validations,edit-person,bank-details/actions,contacts/actions,contracts/actions,dependents/actions,documents/actions,employment-actions/actions,work-schedule-assignment-actions,worker-assignments/actions}.ts`, `docs/environment/migration-ledger.{production,test}.md`, `tests/integration/{contracts-actions,employment-actions,bank-dependents-documents}.test.ts`, `tests/security/{dataops-write-guard,permission-resolver,rbac-tests}.test.ts`, `tests/unit/core-hr-schemas.test.ts`, `DURC-01-UAT-READINESS-REPORT.md`. All preserved on the contaminated/backup branches for the EPRC workstream.

## 7. Quality Gates on Clean i18n Branch

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm lint` | ✅ 0 errors (14 pre-existing `<img>` warnings) |
| `pnpm test` | ✅ **3124 passed**, 15 skipped, 7 todo, **0 failed** |
| `tests/security/encryption-audit.test.ts` | ✅ **35/35 pass** (the 6 failures on the mixed branch were caused by the excluded EPRC `requirePermission` change — confirmed not i18n) |
| `pnpm build` | ✅ Compiled successfully, 152 routes |

## 8. Localization Status After Recovery

## 🟡 PARTIAL (unchanged by recovery)

The recovery faithfully preserved the i18n work as-is; it did not alter localization completeness. Substantial structural localization is done and verified (menus, DB-first source of truth, RTL, mixed-language elimination, toasts, placeholders, role dashboards, employee profile, F1–F6), but the broad multi-pattern sweep still finds genuine hardcoded English.

## 9. Remaining Localization Gaps

Genuine hardcoded English (verified, not false positives) remains primarily in **master-data list/client components** and a few others:
- `master-data/*/components/*Client.tsx` — `WorkScheduleClient` (9), `DepartmentClient` (8), `LegalEntityClient`/`LocationClient`/`GradeClient` (7), `JobClient`/`ProjectClient`/`LeaveTypeClient`/`PositionClient` (6), `BusinessUnitClient` (5) — column/action/filter `label=`/`title=` props.
- `configuration/workflows/groups/GroupListClient.tsx` (5), `components/org-chart/OrgChartFilters.tsx` (0 locale — all English), `components/topbar/ProfileMenu.tsx` (every-page user menu), `settings/document-branding/DocumentBrandingForm.tsx`, `DepartmentDrawer`/`JobDrawer`/`PositionDrawer`/`ProjectDrawer`/`LeaveTypeDrawer` residual labels, `HolidayCalendarGrid`, `AccommodationForm`, `admin/probation`/`exit-clearance` pages.
- False positives (already localized via `labelAr`-paired components / EN-branch ternaries): `DocumentsClient`, `ProbationStatusCard`, `me/page`.

(Migration consoles excluded as justified SUPER_ADMIN ops-diagnostic exception.)

## 10. Recommendation

The clean branch `fix/i18n-rtl-language-preference-clean` is **safe for continued localization work** and is the correct base going forward (not the contaminated `hardening/corehr-score-90-plus`). It is **not yet ready for Foundation Board sign-off as a complete YES** — finish the remaining gaps (§9), ideally guarded by an automated rule (ESLint `no-literal-jsx-text` / CI sweep over `<span>/<p>/<th>/label=/title=`) so the blind-spot cycle does not recur. The EPRC/security workstream should continue independently on its own branch; never use `git add -u` when the two workstreams share a working tree — stage explicit i18n paths only.
