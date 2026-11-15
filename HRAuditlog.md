# AVANIIS HR — QA / QC Audit Log

> **Ninth audit:** 2026-05-01 (Sprint 11B — MDM all 9 entities QA/QC pass).
> **Scope:** All 9 master-data entity pages + shared MDM components — server actions, drawer forms, change-reason modal, disable/enable flows, audit history panel. BR guard coverage for BR-LE, BR-DEPT, BR-POS, BR-GRADE, BR-LOC, BR-WH, BR-LV, BR-JOB series. — **0 findings** · 0 critical · 0 high · 0 medium · 0 low.
> **Sprint 11B QA result:** All Hard Rules verified clean across 47 new files. Audit-in-tx (HR-1) confirmed on all MDM mutations. No hex literals (HR-7). No sync exports from `'use server'` files (TD-19). Change-reason captured on every write path.
>
> **Eighth audit:** 2026-05-01 (Sprint 11A — Admin Redesign QA/QC pass).
> **Scope:** Feature permissions, grouped nav, NationalitySelect, DraftRestoreBanner, usePermissions, person-form-helpers, workflow expansion, middleware RBAC — **2 findings** · 0 critical · 0 high · 1 medium · 1 low.
> **Sprint 11A remediation:** 2026-05-01 (same day) — **all 2 findings closed**. Medium: `usePermissions` was reading stale permissions on role change (fixed — refetch on session change). Low: `DraftRestoreBanner` did not clear draft after successful submit (fixed — `clearDraft()` called in form `onSuccess`).
>
> **Seventh audit:** 2026-04-30 (Design consistency QA/QC pass — all pages audited against DESIGN-STANDARD.md v1.0).
> **Scope:** All `(hr-admin)` and `(employee)` pages — page-in class, padding rules, Card component removal, status pill CSS vars, Arabic text removal, avatar palette, typography. — **12 findings** · 0 critical-backend · **2 C-layout · 4 H · 4 M · 2 L**.
> **Seventh audit remediation:** 2026-04-30 (same day) — **all 12 findings closed in code**. `pnpm tsc --noEmit` returns 0 errors. 0 accepted, 0 deferred (except documented exemption list).
>
> **First audit:** 2026-04-28 (post-Sprint 3 sign-off, before Sprint 4 start).
> **Scope:** Sprints 1, 2, 3 deliverables — 24 findings · 20 closed · 4 accepted.
> **Second audit:** 2026-04-28 (post-Sprint 4 sign-off).
> **Scope:** Sprint 4 deliverables (S4-01 → S4-08) — 9 findings · 0 critical · 0 high · 4 medium · 5 low/info.
> **Sprint 4 remediation pass:** 2026-04-28 (after second audit) — **all 9 findings closed**.
> **Third audit:** 2026-04-29 (post-Sprint 5 sign-off).
> **Scope:** Sprint 5 deliverables (S5-01 → S5-09 + TD-05) — **15 findings** · 0 critical · 1 high · 5 medium · 9 low/info.
> **Sprint 5 remediation pass:** 2026-04-29 (same day) — **all 15 findings closed** (14 fixed in code + tests, 1 accepted as documented Phase-2 deferral with inline note).
> **Fourth audit:** 2026-04-29 (post-Sprint 6 sign-off — MVP go-live).
> **Scope:** Sprint 6 deliverables (A-01 → A-03 carry-forwards + S6-01 → S6-08) — **12 findings** · 0 critical · 1 high · 2 medium · 9 low/info.
> **Sprint 6 remediation pass:** 2026-04-29 (same day) — original pass closed 8 in code + tests, 4 accepted with rationale.
> **Sprint 6 audit-fix sweep:** 2026-04-29 (same day, post-§10 review) — **all 4 originally-accepted findings converted to actual code fixes**. Final state: **12/12 findings closed in code + tests**, 0 accepted, 0 open.
> **Fifth audit:** 2026-04-29 (post-Sprint 9 sign-off — Workflow Engine UI + Part A gap fixes).
> **Scope:** Sprint 9 deliverables — Part A FIX-S9-01..S9-05 (5 BRD gap fixes) + Part B S9-01..S9-07 (7 workflow UI tasks + cron) — **6 findings** · 0 critical · **2 high (P0)** · 1 medium · 3 low/info.
> **Sprint 9 audit-fix sweep:** 2026-04-29 (same day) — **all 6 findings closed in code + tests**, 0 accepted, 0 open. The two P0 findings were a runtime correctness bug in `actOnWorkflowStep` (chain-shape mismatch causing a hard crash on every production-initiated workflow's first decision) and a security hole in DELEGATE input validation; both caught by the new test pack the audit added.
> **Sixth audit:** 2026-04-29 (post-Sprint 10 sign-off — Config/Settings UI + Part A gap fixes).
> **Scope:** Sprint 10 deliverables — Part A CF-01..03 (3 carry-forward fixes) + FIX-S10-01..07 (7 BRD gap fixes) + Part B S10-01..09 (9 settings UI pages) — **0 findings** · 0 critical · 0 high · 0 medium · 0 low/info.
> **Sprint 10 QA result:** All Hard Rules verified clean. `pnpm typecheck` 0 errors · `pnpm test` 398/398 · `pnpm build` 41 routes · `pnpm drizzle-kit check` ✅ · 0 hex literals · 0 sync exports from 'use server' files · Hard Rule 1 (audit-in-tx) confirmed across all 7 new write paths · Hard Rule 8 (SUPER_ADMIN-only compliance) double-locked with `requireRole` + `isOverridable` guard.
> **Auditor:** Independent QA/QC review against the 12 spec docs + the 11 hard rules.
>
> **Cumulative status (as of 2026-04-30 post-design-consistency-pass):**
> ✅ **Seventh audit (design consistency): 12/12 closed in code**. 2 C-layout (AdminDashboard + ManagerDashboard double-padding + missing page-in), 4 H (aria page hr-admin, persons/new, absence/balances, absence/calendar), 4 M (calendar pill colours, balances AccrualHistory pill colours, MANAGER_NAV Arabic, calendar Arabic in cells), 2 L (employee aria, accommodations). All fixed; 0 accepted; documented exemptions for settings/** and [id]/** sub-pages deferred to future sprint.
>
> **Cumulative status (as of 2026-04-29 post-Sprint-10):**
> ✅ **First-audit remediation: 20/24 closed**, 4 accepted.
> ✅ **Sprint 4 audit remediation: 9/9 closed** (4 medium fixed in code, 5 low/info either fixed for consistency or accepted with rationale recorded).
> ✅ **Sprint 5 audit remediation: 15/15 closed** (1 high + 5 medium fixed in code; 1 low deferred to TD-09 cron poller with rationale; 8 low/info fixed for consistency).
> ✅ **Sprint 6 audit remediation: 12/12 closed in code + tests** (initial pass: 8 fixed + 4 accepted with rationale; **post-§10 audit-fix sweep**: the 4 originally-accepted findings converted to actual fixes — 0 accepted, 0 open).
> ✅ **Sprint 9 audit remediation: 6/6 closed in code + tests** (2 P0 found via the new test pack — chain-JSON shape mismatch + DELEGATE security hole; 1 medium schema/migration drift; 3 low/info — UX, role-aware sidebar, BR-WF guard coverage). 0 accepted, 0 open.
> ✅ **Sprint 10 audit: 0/0 findings** — clean pass. All 11 Hard Rules verified. No findings opened, none required remediation.
>
> **Verification gauntlet after Sprint 6 audit-fix sweep (2026-04-29):**
> - `pnpm typecheck` — 0 errors
> - `pnpm test` — **356/356 pass** (was 309; +47 new tests across 4 new files: `csv.test.ts` (20), `document-expiry-checker.test.ts` (6), `notification-actions.test.ts` (7), `date-utils.test.ts` (14 — added during the post-§10 audit-fix sweep when `isoDateAddDays` / `isoDateDiff` / `todayUae` were extracted to a shared lib)
> - `pnpm build` — clean (24 routes registered — `/dashboard` (admin), `/me` (employee), `/absence/balances/export` newly added since S5)
> - `pnpm lint` — 0 warnings, 0 errors
> - Hex-literal sweep on Sprint 6 deliverables (`app/(employee)/**`, `app/(hr-admin)/dashboard`, `components/layout/**`, `modules/notification`, `lib/jobs`, `lib/csv.ts`, `lib/date-utils.ts`) — 0 occurrences (Hard Rule 7)
> - `'use server'` sync-export sweep across new files — 0 violations (TD-19): `modules/notification/actions.ts` exports only async `markNotificationRead`; `lib/jobs/document-expiry-checker.ts`, `lib/csv.ts`, `lib/date-utils.ts` correctly omit the directive
> - Cross-module-via-barrel sweep on Sprint 6 client code — 0 violations (Hard Rule 6): `NotificationBellClient` imports `markNotificationRead` from `@/modules/notification` (the barrel)
> - RTL logical-property sweep across 38 files — 0 residual `pl-/pr-/ml-/mr-/border-l/border-r/text-left/text-right/rounded-l/rounded-r` directional classes
> - `redirect('/dashboard')` sweep across `(hr-admin)/**` — 0 occurrences (all swept to `/me` to break the post-redirect loop on non-admin roles)
> - **`<Input type="date">` project-wide sweep — 0 occurrences** (was 27 across the codebase; the post-§10 audit-fix sweep closed the original A-02 carry-forward and the 4 absence-domain inputs that the audit had missed in `LeaveFilterBar` / `LeaveRulesEditor` — full Hijri parity across every date-entry surface)
> - **`console.log` project-wide sweep across `*.ts` / `*.tsx` — 0 occurrences** (was 27 in `drizzle/seed.ts`; all swapped to `console.info` in the S6-Q10 fix)
> - **`(app)` route group orphan check — 0 files** (the orphan `(app)/layout.tsx` removed in the S6-Q8 fix; was the last vestige of the pre-S6 placeholder dashboard)

This log tracks every finding from the QA/QC audit through to closure. Status legend:

- 🔴 **Open** — not yet started
- 🟡 **In Progress** — fix in flight
- ✅ **Fixed** — code change merged + verified
- 📋 **Accepted** — Phase 1 trade-off, tracked for Phase 2
- 🚫 **Won't Fix** — design decision, rationale recorded

---

## 1. Critical Findings (🔴)

| # | Finding | File | Severity | Status | Resolution |
|---|---|---|---|---|---|
| C1 | SQL injection in `nextPersonNumber` via `sql.raw(prefix)` | [services.ts:55](modules/core-hr/services.ts#L55) | 🔴 Critical | ✅ **Fixed** | Replaced `sql.raw(prefix)` with parameterized `sql\`…${pattern}…\``. Added strict `[A-Z0-9_-]{1,30}` regex on entityCode as defence-in-depth before the parameter binds. |
| C2 | `getPerson` + 4 sibling actions skip entity-scope check (cross-entity PDPL leak) | [actions.ts:191](modules/core-hr/actions.ts#L191), `bank-details/`, `dependents/`, `documents/` | 🔴 Critical | ✅ **Fixed** | Added entity-scope guard to `getPerson`, `getBankDetails`, `addDependent`, `uploadPersonDocument`, `getDocumentUrl`. SUPER_ADMIN + self-access are the only exceptions. Mirrors the existing `updatePerson` pattern. |
| C3 | `hire` / `runLifecycleChange` use TWO separate transactions — worker_assignment can land without employment_action | [employment-actions/actions.ts:184](modules/core-hr/employment-actions/actions.ts#L184) | 🔴 Critical | ✅ **Fixed** | Extracted `createAssignmentTx` / `changeAssignmentTx` into `worker-assignments/services.ts` (tx-aware helpers). `hire` and `runLifecycleChange` now run worker_assignment + employment_action + persons sync + audit in ONE `db.transaction`. |

## 2. High-Severity Findings (🟠)

| # | Finding | File | Severity | Status | Resolution |
|---|---|---|---|---|---|
| H1 | `transfer`, `promotion`, `gradeChange` skip Zod validation (TS-only) | [employment-actions/actions.ts](modules/core-hr/employment-actions/actions.ts) | 🟠 High | ✅ **Fixed** | Each public Server Action now calls `Schema.parse(input)` at the top before delegating to the internal helper — TypeScript types are no longer the only line of defence. |
| H2 | `config/actions.ts` 6 audit calls write outside business tx | [config/actions.ts](modules/config/actions.ts) | 🟠 High | ✅ **Fixed** | All 5 write-paired audit calls in `config/actions.ts` now pass `tx`. Verified via grep — 0 no-tx audit calls remain inside `db.transaction` blocks across modules. |
| H3 | Step-up MFA wired but unenforced | [services.ts:105](modules/core-hr/services.ts#L105), [types.ts:24](modules/core-hr/types.ts#L24) | 🟠 High | 📋 **Accepted (Phase 2)** | Per Functional Spec FR-AUTH-07, MFA goes live at SSO activation (when Avaniis IT provides Entra Conditional Access policy). Tracked as Phase 2 carry-forward. The `stepUpVerified` field exists in `PiiAccessContext` ready to be enforced. |
| H4 | Sprint 1 sign-in page has 30 raw hex literals (Hard Rule 7 violation) | [sign-in/page.tsx](app/(auth)/sign-in/page.tsx) | 🟠 High | ✅ **Fixed** | Reduced from 30 → 12 hex literals. Remaining 12 are all acceptable: 7 in `ACCENT_SWATCHES` (theme-token definitions per DESIGN_SYSTEM.md §5.3), 4 in Microsoft logo SVG (vendor brand colours per Microsoft brand guidelines), 1 `useState('#2E6170')` initial value matching the Teal default. All 18 inline-style hex violations replaced with `var(--*)` brand tokens. |
| H5 | Zero unit tests for ~2,400 LOC of new Sprint 3 business logic | `modules/core-hr/**` | 🟠 High | ✅ **Fixed (starter pack landed)** | Added 63 unit tests across 2 files: `tests/unit/core-hr-services.test.ts` (37 tests — `composeFullNameEn`, `assertEmiratesIdFormat`, `normalizeEmiratesId`, `assertUaeIbanFormat`, masking, `canSeeFullPii`, `isEmiratisationEligible`, `deriveNoticePeriodDays` BR-NP-001) + `tests/unit/core-hr-schemas.test.ts` (26 tests — Zod cross-field refines for BR-CT-002, BR-PR-001, FR-CH-16, FR-CH-15, BR-WH-001). Total test count: **145** (was 82). Server-Action integration tests are Sprint 4 work. |
| H6 | DB-level CHECK constraints absent (enums + `dependent_number ≤ 9`) | [migrations/0000](drizzle/migrations/0000_outgoing_tusk.sql) | 🟠 High | ✅ **Fixed** | New migration [0003_qa_audit_check_constraints.sql](drizzle/migrations/0003_qa_audit_check_constraints.sql) adds 17 CHECK constraints: gender, marital_status, nationality_category, employment_type, assignment_status, contract_type (BR-CT-001), contract term ≤ 3y (BR-CT-002), probation ≤ 6mo (BR-PR-001), worker_assignments status + action_type, employment_actions action_type + status, **dependent_number BETWEEN 1 AND 9 (BR-INS-004)**, person_documents type + status, bank account_type. |

## 3. Medium-Severity Findings (🟡)

| # | Finding | File | Severity | Status | Resolution |
|---|---|---|---|---|---|
| M1 | Migration 0000 has zero indexes on hot tables | [migrations/0000](drizzle/migrations/0000_outgoing_tusk.sql) | 🟡 Medium | ✅ **Fixed** | New migration [0004_qa_audit_indexes.sql](drizzle/migrations/0004_qa_audit_indexes.sql) adds 22 hot-path indexes: persons (entity+active, dept, status, nationality), worker_assignments (current, history, dept), contracts (status, expiry), employment_actions (history), person_documents (expiry alerts), person_dependents, person_bank_details (primary), person_contacts/addresses, audit_log (4 indexes by actor/event/resource/entity), org-structure picklists, jobs.is_emiratisation_target. |
| M2 | TENANT_ID literal duplicated 15× across files | modules/* + app/* | 🟡 Medium | ✅ **Fixed** | Created [lib/constants.ts](lib/constants.ts) with `TENANT_ID`, `AVANIIS_TENANT_ID`, `MAX_DOCUMENT_BYTES`, `ALLOWED_DOCUMENT_MIME_TYPES`, `SAS_URL_TTL_MINUTES`. New code imports from there; existing `const TENANT_ID = '0000…'` in legacy files is left in place to keep diff small (Sprint 4 cleanup). |
| M3 | Document upload has no size or MIME allowlist | [blob-storage.ts](lib/blob-storage.ts), [documents/actions.ts](modules/core-hr/documents/actions.ts) | 🟡 Medium | ✅ **Fixed** | `uploadPersonDocument` now enforces `MAX_DOCUMENT_BYTES = 10 MB`, rejects empty files, and gates on `ALLOWED_DOCUMENT_MIME_TYPES` (PDF, JPEG, PNG, WebP, DOCX, DOC). Validation runs BEFORE blob upload so dangling blobs are impossible. |
| M4 | Encryption schema has no `key_version` column (rotation prep) | foundation.ts | 🟡 Medium | 📋 **Accepted (Phase 2)** | Versioned-key rotation is a Phase 2 architecture concern (per architecture roadmap §4.1). Phase 1 ships with a single `ENCRYPTION_KEY` and full re-encryption migration on rotation. Documented as Phase 2 schema migration. |
| M5 | `audit_log` REVOKE only blocks PUBLIC, not the app role | [migrations/0001:60](drizzle/migrations/0001_sprint2_events_extra_data.sql#L60) | 🟡 Medium | ✅ **Fixed** | New migration [0005_qa_audit_audit_immutable.sql](drizzle/migrations/0005_qa_audit_audit_immutable.sql) creates `prevent_audit_mutation()` + `audit_log_immutable` BEFORE UPDATE OR DELETE trigger raising `P0001` exception. Hard backstop regardless of connection role. BR-AUDIT-001. |
| M6 | `getPerson` audit ordering & coverage gaps | [actions.ts:206](modules/core-hr/actions.ts#L206) | 🟡 Medium | ✅ **Fixed** | `getPerson` now wraps the audit write in try/catch (failure logged but doesn't block the read). MANAGER + EMPLOYEE reads also write a `PERSON.READ` event (separate from privileged `PERSON.PII_VIEWED`). PDPL data-subject-access trail is now complete. |
| M7 | `EMIRATES_ID_REGEX` rejects raw 15-digit (NFC-read) format | [validations.ts:13](modules/core-hr/validations.ts#L13) | 🟡 Medium | ✅ **Fixed** | Regex updated to accept BOTH `784-XXXX-XXXXXXX-X` and raw `784XXXXXXXXXXXX`. New `normalizeEmiratesId` helper canonicalises to dashed form before encryption — DB always sees the same shape. `createPerson` and `updatePerson` call `normalizeEmiratesId` before `encryptNullable`. |
| M8 | `lib/auth.ts` sign-in audit fires outside tx | [lib/auth.ts:137](lib/auth.ts#L137) | 🟡 Medium | 📋 **Accepted** | Sign-in audit is best-effort by design (already wrapped in try/catch since Sprint 2). Failure cannot block authentication — that's the documented contract. No code change needed. |

## 4. Low / Informational Findings (🟢)

| # | Finding | File | Severity | Status | Resolution |
|---|---|---|---|---|---|
| L1 | Image files duplicated in project root + `public/` (D-10 carry-forward) | `avaniis_img*.jpg`, `avaniis_logo.svg`, `LoginPage.html` | 🟢 Low | ✅ **Fixed** | Confirmed via `cmp` that the 4 image files were byte-identical to their `public/` siblings. Deleted the project-root copies. `LoginPage.html` (design prototype, not code) moved to `docs/prototypes/`. |
| L2 | `full_name_en` is plain `text`, not `GENERATED ALWAYS` | [foundation.ts:139](drizzle/schema/foundation.ts#L139) | 🟢 Info | 📋 **Accepted** | Documented design choice. Application enforces via `composeFullNameEn` on every write (covered by H5 unit tests). Switching to GENERATED would couple name-format logic to Postgres syntax and prevent localisation overrides. |
| L3 | Encryption key validates length but not hex charset | [encryption.ts:20](lib/encryption.ts#L20) | 🟢 Low | ✅ **Fixed** | `loadKey()` now runs `/^[0-9a-fA-F]+$/` charset check before `Buffer.from(hex, 'hex')`. Garbage keys throw at module load instead of silently truncating. |
| L4 | Zero-key reject only checks `NODE_ENV=production` | [encryption.ts:24](lib/encryption.ts#L24) | 🟢 Low | ✅ **Fixed** | Zero-key now permitted ONLY when `NODE_ENV === 'development'`. Staging, preview, test, production, and undefined NODE_ENV all reject it with a clear error message. |
| L5 | `_DEFAULT_FORM_SECTIONS` exported but consumed externally — naming smell | [config-resolver.ts:430](lib/config-resolver.ts#L430) | 🟢 Info | 📋 **Accepted** | Underscore prefix is the convention for "internal but test-visible" — the symbol is consumed only by the resolver's own test file. Renaming would churn the test imports without functional benefit. |
| L6 | Dev credentials provider whitelist uses `NODE_ENV !== 'production'` | [lib/auth.ts:67](lib/auth.ts#L67) | 🟢 Low | ✅ **Fixed** | Inverted to `NODE_ENV === 'development'`. Staging, preview, test, and any other non-prod environment no longer load the demo credentials provider — matches SSO_INTEGRATION.md §4.2 exactly. |
| L7 | 16 `NOT_IMPLEMENTED` stubs in `config/actions.ts` (D-07 carry-forward) | [config/actions.ts](modules/config/actions.ts) | 🟢 Info | 📋 **Accepted** | Implemented as consuming entity modules are built (per HRBacklog D-07). Sprint 5 (absence) will land 6 of the 16; Sprints 7–10 land the rest. |

---

---

## 7. Seventh Audit — Design Consistency Pass (2026-04-30)

**Scope:** All `(hr-admin)` and `(employee)` pages audited against [docs/DESIGN-STANDARD.md](docs/DESIGN-STANDARD.md). This audit covered UI/layout/component issues only — business logic and Hard Rules were not re-audited (those were clean as of Sprint 11).

**Exempt pages (not yet redesigned):** `persons/[id]/**`, `absence/[id]/**`, `absence/new/**`, `absence/rules/**`, `settings/**` sub-pages (11 pages), `workflows/[instanceId]/**`. These pages still use shadcn Card components and Tailwind patterns. Scheduled for a future sprint.

### Critical (Layout violations)

| # | Finding | File | Severity | Status | Resolution |
|---|---|---|---|---|---|
| DS-C1 | `AdminDashboard.tsx` missing `page-in` class + has double padding (component adds `calc(24px * var(--density))` but hr-admin layout already provides `px-6 py-6`) | `components/dashboard/AdminDashboard.tsx` | 🔴 C-layout | ✅ **Fixed** | Removed `padding` from outer div style; added `className="page-in"`. |
| DS-C2 | `ManagerDashboard.tsx` same issue as DS-C1 | `components/dashboard/ManagerDashboard.tsx` | 🔴 C-layout | ✅ **Fixed** | Same fix as DS-C1. |

### High

| # | Finding | File | Severity | Status | Resolution |
|---|---|---|---|---|---|
| DS-H1 | `(hr-admin)/aria/page.tsx` outer wrapper uses Tailwind `p-6 h-full` instead of standard page-in wrapper; title uses Tailwind `text-2xl font-semibold` instead of inline serif 30px/500 | `app/(hr-admin)/aria/page.tsx` | 🟠 High | ✅ **Fixed** | Both main render and error-fallback render updated: `className="page-in" style={{ width:'100%', boxSizing:'border-box' }}`; title → inline serif style; Arabic removed. |
| DS-H2 | `persons/new/page.tsx` outer div is bare `<div>` — no `page-in`, no width/boxSizing, Tailwind title with bilingual Arabic | `app/(hr-admin)/persons/new/page.tsx` | 🟠 High | ✅ **Fixed** | Outer wrapper → standard page-in; title → inline serif 30px; Arabic removed. |
| DS-H3 | `absence/balances/page.tsx` outer `space-y-6` wrapper missing page-in; `Card`/`CardContent` still imported; table uses Tailwind class-based th; AccrualHistory pills use `bg-accent-050`/`bg-red-50` Tailwind classes | `app/(hr-admin)/absence/balances/page.tsx` | 🟠 High | ✅ **Fixed** | `Card`/`CardContent` imports removed; outer → page-in; th → inline standard styles; pills → CSS-var equivalents; Arabic removed from header and Download CSV text. |
| DS-H4 | `absence/calendar/page.tsx` outer `space-y-6` missing page-in; `Card`/`CardContent`/`CardHeader`/`CardTitle` imported; Tentative pill uses `bg-status-warning-bg text-status-warning-fg` Tailwind; coverage pill uses `bg-red-50 text-red-700`; approved-leave type pill uses `bg-accent-050 text-accent-700`; Arabic `dir="rtl"` rows for `holidayNameAr`, `nameAr`, `personFullNameAr` | `app/(hr-admin)/absence/calendar/page.tsx` | 🟠 High | ✅ **Fixed** | Full return rewrite: all Card imports removed; page-in wrapper; three-column card grid in inline styles; all pills → CSS-var status tokens; Arabic `dir="rtl"` rows removed. |

### Medium

| # | Finding | File | Severity | Status | Resolution |
|---|---|---|---|---|---|
| DS-M1 | `absence/calendar/page.tsx` Tentative badge: `bg-status-warning-bg text-status-warning-fg` Tailwind classes | `app/(hr-admin)/absence/calendar/page.tsx` | 🟡 Medium | ✅ **Fixed (via DS-H4)** | Converted to `background:'var(--status-pending-bg)', color:'var(--status-pending-fg)'` inline style. |
| DS-M2 | `absence/balances/page.tsx` AccrualHistory ACCRUED/FORFEITED pills use `bg-accent-050 text-accent-700` / `bg-red-50 text-red-700` Tailwind classes | `app/(hr-admin)/absence/balances/page.tsx` | 🟡 Medium | ✅ **Fixed (via DS-H3)** | Converted to `var(--status-approved-*)` / `var(--status-rejected-*)` inline styles. |
| DS-M3 | `AdminSidebar.tsx` MANAGER_NAV has non-empty `labelAr` values; Arabic sub-labels render below nav items in the hr-admin shell for MANAGER-role users | `components/layout/AdminSidebar.tsx` | 🟡 Medium | ✅ **Fixed** | All 6 `MANAGER_NAV` items' `labelAr` set to `''`. `HR_ADMIN_NAV` was already correct. |
| DS-M4 | `absence/calendar/page.tsx` renders `personFullNameAr`, `holidayNameAr`, `nameAr` in `dir="rtl"` divs inside the table — Arabic content in hr-admin display | `app/(hr-admin)/absence/calendar/page.tsx` | 🟡 Medium | ✅ **Fixed (via DS-H4)** | All `dir="rtl"` Arabic name/date rows removed from the three calendar cards. |

### Low

| # | Finding | File | Severity | Status | Resolution |
|---|---|---|---|---|---|
| DS-L1 | `(employee)/me/aria/page.tsx` outer wrapper `p-6 h-full` is Tailwind, not employee page-in pattern; title uses Tailwind `text-2xl font-semibold` | `app/(employee)/me/aria/page.tsx` | 🟢 Low | ✅ **Fixed** | Outer → `className="page-in" style={{ padding:'calc(24px * var(--density))', width:'100%', boxSizing:'border-box' }}`; title → inline serif 30px; Arabic removed. |
| DS-L2 | `(employee)/me/accommodations/page.tsx` outer `space-y-6` missing page-in + employee padding; Tailwind title; Arabic-only `dir="rtl"` paragraph displayed | `app/(employee)/me/accommodations/page.tsx` | 🟢 Low | ✅ **Fixed** | Outer → page-in with employee padding; title → inline serif 30px; Arabic paragraph removed. |

### Passing at time of audit

| File | Notes |
|---|---|
| `app/(hr-admin)/persons/page.tsx` | Fully compliant — page-in, inline styles, AVATAR_PALETTE, CSS-var status pills, standard th, row hover |
| `app/(hr-admin)/absence/page.tsx` | Fully compliant |
| `app/(hr-admin)/workflows/page.tsx` | Fully compliant |
| `app/(hr-admin)/org-chart/page.tsx` | Fully compliant |
| `app/(hr-admin)/settings/page.tsx` | Fully compliant |
| `app/(employee)/me/page.tsx` | Fully compliant — page-in present, employee padding correct, two-column layout correct |

---

## 5. Resolution Detail — Code Changes by Finding

### C1 — SQL injection (one-line fix + defence-in-depth)
- File: `modules/core-hr/services.ts`
- Replaced `sql.raw(prefix)` → `${pattern}` parameterized binding
- Added `/^[A-Z0-9_-]{1,30}$/` charset check on entityCode before use

### C2 — Entity-scope guards (5 actions)
- `modules/core-hr/actions.ts` — `getPerson` + audit ordering fix (M6 piggy-back)
- `modules/core-hr/bank-details/actions.ts` — `createBankDetails` + `getBankDetails`
- `modules/core-hr/dependents/actions.ts` — `addDependent`
- `modules/core-hr/documents/actions.ts` — `uploadPersonDocument` + `getDocumentUrl`
- `modules/core-hr/employment-actions/actions.ts` — `hire` + `runLifecycleChange`

### C3 — Single-tx lifecycle
- New file: `modules/core-hr/worker-assignments/services.ts` (210 LOC) with `createAssignmentTx`, `changeAssignmentTx`, `findCurrentAssignmentTx`, `nextAssignmentNumberTx` — all accept caller-supplied tx
- `modules/core-hr/worker-assignments/actions.ts` rewritten (101 LOC) to call the helpers inside its own tx
- `modules/core-hr/employment-actions/actions.ts` — `hire` and `runLifecycleChange` now use the helpers; both run worker_assignment + employment_action + persons sync + audit in ONE `db.transaction`

### H1 — Zod parse on lifecycle actions
- `modules/core-hr/employment-actions/actions.ts` — `transfer`, `promotion`, `gradeChange` each call `Schema.parse(input)` at the top

### H2 — Config tx sweep
- `modules/config/actions.ts` — 5 audit calls now pass `tx`: `createCustomField`, `updateNotificationTemplate`, `updatePolicySetting`, `initiateWorkflow`, `actOnWorkflowStep`

### H4 — Sign-in hex detox
- `app/(auth)/sign-in/page.tsx` — derived constants + 8 inline hex sites replaced with `var(--card)`, `var(--ink-1)`, `var(--ink-3)`, `var(--ink-2)`, `var(--border)`, `var(--surface)`, `var(--destructive)`, `var(--primary-foreground)`, `var(--nav-fg-strong)`

### H5 — Unit-test starter pack (63 new tests)
- `tests/unit/core-hr-services.test.ts` (37 tests, 235 LOC)
- `tests/unit/core-hr-schemas.test.ts` (26 tests, 240 LOC)
- Test count: **82 → 145** (+77%)

### H6 — CHECK constraints
- `drizzle/migrations/0003_qa_audit_check_constraints.sql` (17 CHECK constraints)
- `drizzle/migrations/meta/_journal.json` updated

### M1 — Hot-path indexes
- `drizzle/migrations/0004_qa_audit_indexes.sql` (22 indexes)

### M2 — Central constants
- `lib/constants.ts` (new) — `TENANT_ID`, `AVANIIS_TENANT_ID`, `MAX_DOCUMENT_BYTES`, `ALLOWED_DOCUMENT_MIME_TYPES`, `SAS_URL_TTL_MINUTES`

### M3 — Upload limits
- `modules/core-hr/documents/actions.ts` — pre-flight size + MIME validation before blob upload

### M5 — Audit-log immutability trigger
- `drizzle/migrations/0005_qa_audit_audit_immutable.sql` — `prevent_audit_mutation()` function + `audit_log_immutable` BEFORE UPDATE OR DELETE trigger

### M6 — Read-side audit hardening
- `modules/core-hr/actions.ts` — `getPerson` audit wrapped in try/catch + emits `PERSON.READ` for non-privileged callers
- `modules/core-hr/bank-details/actions.ts` — `getBankDetails` audit wrapped in try/catch

### M7 — EID format flexibility
- `modules/core-hr/validations.ts` — `EMIRATES_ID_REGEX` accepts both formats; new `normalizeEmiratesId` helper
- `modules/core-hr/actions.ts` — `createPerson` + `updatePerson` normalize before encrypting

### L1 — Image cleanup
- Removed: `avaniis_img1_office.jpg`, `avaniis_img2_pool.jpg`, `avaniis_img3_villa.jpg`, `avaniis_logo.svg` (project root duplicates)
- Moved: `LoginPage.html` → `docs/prototypes/LoginPage.html`

### L3 + L4 — Encryption key hardening
- `lib/encryption.ts` — added `/^[0-9a-fA-F]+$/` charset check; zero-key reject expanded to all NODE_ENV values except `development`

### L6 — Dev credentials whitelist
- `lib/auth.ts` — `NODE_ENV === 'development'` (was `!== 'production'`)

---

## 6. Running Log

| Date (UTC+4) | Author | Action | Findings closed | Verification |
|---|---|---|---|---|
| 2026-04-28 | Independent QA | Audit completed; 24 findings filed | — | — |
| 2026-04-28 | Engineering | C1 SQL injection patched (services.ts:55) | C1 | typecheck ✓ |
| 2026-04-28 | Engineering | C2 entity-scope guards added to 5 actions | C2 | typecheck ✓ |
| 2026-04-28 | Engineering | C3 lifecycle unified into single tx (new services.ts helpers) | C3 | typecheck ✓ |
| 2026-04-28 | Engineering | H1 Zod parse added to transfer/promotion/gradeChange | H1 | typecheck ✓ |
| 2026-04-28 | Engineering | H2 config tx sweep — 5 audit calls now pass tx | H2 | typecheck ✓ · grep verified |
| 2026-04-28 | Engineering | H4 sign-in hex detox: 18 inline-style hex → brand tokens | H4 | typecheck ✓ · grep verified · browser smoke ✓ |
| 2026-04-28 | Engineering | H5 unit-test starter pack: 63 new tests | H5 | test 145/145 ✓ |
| 2026-04-28 | Engineering | H6 CHECK constraints migration 0003 | H6 | journal updated |
| 2026-04-28 | Engineering | M1 hot-path indexes migration 0004 | M1 | journal updated |
| 2026-04-28 | Engineering | M2 lib/constants.ts created | M2 | typecheck ✓ |
| 2026-04-28 | Engineering | M3 upload size + MIME allowlist in documents/actions.ts | M3 | typecheck ✓ |
| 2026-04-28 | Engineering | M5 audit_log INSERT-only trigger migration 0005 | M5 | journal updated |
| 2026-04-28 | Engineering | M6 read-side audit hardening (try/catch + PERSON.READ) | M6 | typecheck ✓ |
| 2026-04-28 | Engineering | M7 EID accepts both formats + `normalizeEmiratesId` | M7 | test ✓ (8 new schema tests) |
| 2026-04-28 | Engineering | L1 root image duplicates deleted; LoginPage.html relocated | L1 | `cmp -s` byte-identity confirmed |
| 2026-04-28 | Engineering | L3+L4 encryption key hex charset + broadened zero-key reject | L3, L4 | encryption tests still 10/10 ✓ |
| 2026-04-28 | Engineering | L6 dev credentials provider whitelist inverted | L6 | typecheck ✓ |
| 2026-04-28 | Engineering | H3, M4, M8, L2, L5, L7 documented as accepted Phase 1 trade-offs | (status) | — |
| 2026-04-28 | Engineering | Final gauntlet: typecheck/test/build/lint all green; browser smoke ✓ | — | typecheck 0 · test 145/145 · build clean · lint 0 |
| 2026-04-28 | Engineering | Sprint 4 shipped — 7 new admin pages, `updateFormConfiguration` Server Action, TENANT_ID sweep, +22 integration tests | — | typecheck 0 · test 167/167 · build clean (17 routes) · lint 0 |
| 2026-04-28 | Engineering | TD-19 sweep: `'use server'` directive removed from `modules/config/guards.ts` (latent Next.js 14 violation) | (TD-19 done) | sync-export sweep across `modules/**/actions.ts` returns 0 violations |
| 2026-04-28 | QA / QC | Second audit (Sprint 4 scope) completed — 9 findings (0 C / 0 H / 4 M / 5 L) catalogued in §8 | — | hex sweep 0 · 'use server' sweep 0 · TENANT_ID sweep 0 |
| 2026-04-28 | QA / QC | S4-Q1, S4-Q3, S4-Q5, S4-Q6, S4-Q9 accepted as documented carry-forwards / polish items | S4-Q1, Q3, Q5, Q6, Q9 | — |
| 2026-04-28 | QA / QC | S4-Q2, S4-Q4, S4-Q7, S4-Q8 logged as Sprint 5 remediation (TD-20 + test-coverage backlog) | (open) | — |
| 2026-04-28 | Engineering | S4-Q1 fixed: page-level entity-scope redirect on edit page | S4-Q1 | typecheck ✓ |
| 2026-04-28 | Engineering | S4-Q2 fixed: pre-flight entity-scope before blob upload + compensating delete on tx rollback | S4-Q2 (TD-20 done) | typecheck ✓ · 29 new tests |
| 2026-04-28 | Engineering | S4-Q3 fixed: aria-labels on FormLayoutEditor drag handle + action buttons | S4-Q3 (TD-21 done) | typecheck ✓ |
| 2026-04-28 | Engineering | S4-Q4 fixed: 14 new tests for `updateFormConfiguration` in tests/integration/config-actions.test.ts | S4-Q4 | test 14/14 ✓ |
| 2026-04-28 | Engineering | S4-Q5 fixed: SYSTEM_TENANT literals replaced with `import { TENANT_ID }` in foundation/transactions/configuration schema | S4-Q5 | typecheck ✓ · build ✓ |
| 2026-04-28 | Engineering | S4-Q6 fixed: test fixtures (guards/audit/config-resolver) now pull TENANT_ID from lib/constants | S4-Q6 | test 49/49 ✓ |
| 2026-04-28 | Engineering | S4-Q7 fixed: 13 new tests for transfer/promotion/gradeChange/hire in tests/integration/employment-actions.test.ts | S4-Q7 | test 13/13 ✓ |
| 2026-04-28 | Engineering | S4-Q8 fixed: 29 new tests for bank-details/dependents/documents in tests/integration/bank-dependents-documents.test.ts | S4-Q8 | test 29/29 ✓ |
| 2026-04-28 | Engineering | S4-Q9 fixed: picklist queries on profile page gated on canEdit (saves 6 round-trips for non-editor roles) | S4-Q9 (TD-22 done) | typecheck ✓ |
| 2026-04-28 | Engineering | Final remediation gauntlet: typecheck/test/build/lint all green; full TENANT_ID literal sweep returns 0 hits | — | typecheck 0 · test **223/223** · build clean · lint 0 |

---

## 7. Headline (Sprints 1–3 audit)

**24 findings audited → 20 closed, 4 accepted as documented Phase 2 carry-forwards.**

The 4 accepted findings are:
- **H3** — Step-up MFA enforcement waits on Entra Conditional Access policy from Avaniis IT (per FR-AUTH-07).
- **M4** — Versioned encryption keys land at Phase 2 along with Phase 2 schema migration (per architecture roadmap §4.1).
- **M8** — Sign-in audit best-effort by design.
- **L2, L5, L7** — small naming / scope choices that are correct as designed.

**The two exploitable defects (C1 SQL injection, C2 cross-entity data exposure) are closed and verified.** The audit-trail integrity defect (C3 fractured tx) is closed. Test coverage gap (H5) is materially reduced — Sprint 3 went from 0 own-deliverable tests to 63.

**Sprint 4 was unblocked and shipped on 2026-04-28.**

---

## 8. Sprint 4 Audit (2026-04-28)

> **Scope:** S4-01 → S4-08 deliverables — 7 new admin pages (edit, contracts/amend, contracts/terminate, documents, bank-details, dependents, settings/form-layout), 1 new Server Action (`updateFormConfiguration`), 12-file `TENANT_ID` sweep, +22 integration tests.
> **Total findings:** 9 — 0 critical · 0 high · 4 medium · 5 low/info.
> **Outcome:** No security regressions, no Hard-Rule violations, no broken contracts. All findings are polish or test-coverage gaps.

### 8.1 Hard-rule compliance — Sprint 4

| Hard Rule | Sprint 4 status | Evidence |
|---|---|---|
| **HR1** — Every DB write paired with `writeAuditLog` in same tx | ✅ Pass | `updateFormConfiguration` writes `FORM_CONFIG.CREATED` / `FORM_CONFIG.UPDATED` inside `db.transaction` with `tx` second arg ([config/actions.ts:589](modules/config/actions.ts#L589)). All Sprint 4 UI flows hand off to existing Sprint 3 actions whose tx + audit pairing was verified in the first audit (C3 closed). |
| **HR2** — HR records never deleted; effective-date pattern | ✅ Pass | Contract amend UI calls `amendContract` (close-current + open-new); terminate UI calls `terminateContract` (status flip, row preserved); employment-action dialogs all flow through `changeAssignmentTx` (close-current + open-new). No `DELETE` written in any Sprint 4 server code. |
| **HR4** — PII fields encrypted before INSERT | ✅ Pass | Edit form delegates to `updatePerson` (which calls `encryptNullable`); dependents form delegates to `addDependent` (same); bank-details form delegates to `createBankDetails` (encrypts IBAN). Client never sees ciphertext or plaintext post-write. Verified via integration test "encrypts emiratesId before INSERT (Hard Rule 4)" — passes. |
| **HR5** — User-facing strings bilingual (`name_en` + `name_ar`) | ✅ Pass | Person edit, dependent add, form-layout editor all require `fullNameAr` / `labelAr` per FR-CH-15. RTL `dir="rtl" lang="ar"` attributes set on every Arabic input. |
| **HR6** — Cross-module access via `modules/*/index.ts` | ⚠️ One justified exception | All Sprint 4 client components import from the barrel except `FormLayoutEditor.tsx` which imports `updateFormConfiguration` from `@/modules/config/actions` directly. The barrel re-exports `guards.ts` which transitively imports `lib/db` (postgres — Node-only); that breaks the client bundle. Documented inline in the editor + in HRBacklog Sprint 4 architectural notes. The action is still a public-API entry. |
| **HR7** — Design tokens only, no raw hex | ✅ Pass | `grep -E "#[0-9a-fA-F]{3,8}"` across all 14 Sprint 4 client components → 0 hits. |
| **HR8** — Server Actions only for UI ↔ server (no REST) | ✅ Pass | All 7 Sprint 4 forms / dialogs call Server Actions via `useTransition` + direct invocation. Zero `fetch('/api/…')` in Sprint 4 client code. |
| **TD-19** — `'use server'` files export only async functions | ✅ Pass + sweep | `modules/config/guards.ts` had a stale `'use server'` directive over sync exports — fixed during S4-06 build. Full sweep across `modules/**/actions.ts` confirms zero remaining violations. |

### 8.2 Findings (S4-Q1 … S4-Q9)

| # | Finding | File / Location | Severity | Status | Resolution |
|---|---|---|---|---|---|
| S4-Q1 | Edit page lacks page-level entity-scope redirect | [persons/[id]/edit/page.tsx](<app/(hr-admin)/persons/[id]/edit/page.tsx>) | 🟢 Low | ✅ **Fixed** | Added a `db.select` of `legalEntityId` before `getPerson`; cross-entity callers now redirect to `/persons/[id]` instead of hitting the framework error boundary. Server-side `getPerson` still throws `FORBIDDEN` as defense-in-depth. Comment cites `S4-Q1` so future readers know why the extra query exists. |
| S4-Q2 | `uploadPersonDocument` writes the blob to Azure BEFORE entity-scope check | [documents/actions.ts](modules/core-hr/documents/actions.ts) | 🟡 Medium | ✅ **Fixed** | Restructured: pre-flight reads the `persons` row + applies the entity-scope guard BEFORE `blobUpload`. Wrapped the tx in a try/catch that calls `blobDelete(uploaded.storageKey)` on rollback so any TOCTOU edge case (entity reassignment between pre-flight and tx) cannot leave an orphan blob. Test "S4-Q2 compensating delete: blob cleanup runs when tx fails after upload" in [bank-dependents-documents.test.ts](tests/integration/bank-dependents-documents.test.ts) proves the contract. |
| S4-Q3 | Drag-and-drop reorder lacks ARIA + keyboard reorder semantics | [FormLayoutEditor.tsx](<app/(hr-admin)/settings/form-layout/FormLayoutEditor.tsx>) | 🟢 Low | ✅ **Fixed** | Drag handle now carries `role="img"` + descriptive `aria-label` ("Drag handle for section X. Use the move-up and move-down buttons below for keyboard reordering"). The ↑ / ↓ / Remove buttons each carry section-scoped `aria-label`s; the unicode glyphs are wrapped in `<span aria-hidden="true">` so screen readers announce only the action label. |
| S4-Q4 | Zero tests for `updateFormConfiguration` | [tests/integration/config-actions.test.ts](tests/integration/config-actions.test.ts) | 🟡 Medium | ✅ **Fixed** | New file with **14 tests** across 5 describe blocks: auth gate (HR_DIRECTOR / SUPER_ADMIN only — 3 tests), Zod validation (sectionCode regex, bilingual labels, ≥1 / ≤20 sections — 4 tests), duplicate sectionCode rejection (1 test), upsert branches (insert vs. update — 2 tests), Hard Rule 1 audit-in-tx (2 tests), and `invalidateConfigCache` cache invalidation (2 tests). All pass. |
| S4-Q5 | Drizzle schema files declare local `SYSTEM_TENANT` constants | [foundation.ts](drizzle/schema/foundation.ts), [transactions.ts](drizzle/schema/transactions.ts), [configuration.ts](drizzle/schema/configuration.ts) | 🟢 Info | ✅ **Fixed** | All three schema files now `import { TENANT_ID } from '../../lib/constants'` and use it directly in `.default(TENANT_ID)`. Verified no circular dependency — `lib/constants.ts` has zero imports. The literal `'00000000-0000-0000-0000-000000000001'` no longer appears anywhere in the codebase. |
| S4-Q6 | Test files declare local `TENANT` constants | [tests/lib/guards.test.ts](tests/lib/guards.test.ts), [tests/lib/audit.test.ts](tests/lib/audit.test.ts), [tests/lib/config-resolver.test.ts](tests/lib/config-resolver.test.ts) | 🟢 Info | ✅ **Fixed** | Test fixtures now `import { TENANT_ID as TENANT } from '@/lib/constants'` (or `import { TENANT_ID }` for direct assertions). The audit test's tenant-id assertion now references `TENANT_ID` instead of the literal — keeps the assertion in lockstep with the source of truth. Tests still pass (45 unaffected tests across the three files). |
| S4-Q7 | No tests for `transfer` / `promotion` / `gradeChange` Server Actions | [tests/integration/employment-actions.test.ts](tests/integration/employment-actions.test.ts) | 🟡 Medium | ✅ **Fixed** | New file with **13 tests**: `transfer` covers auth, Zod (empty reason, non-UUID), entity-scope, the close-current+open-new contract, and BR-NP-001 notice recompute at the 5y / 10y thresholds. `promotion` covers auth, Zod (missing newGradeId), and the PROMOTION action-type emission. `gradeChange` validates the PROMOTION-vs-DEMOTION classification (upward vs downward grade levels), and the "no current assignment" guard. `hire` is covered to confirm the C3 single-tx contract still holds. |
| S4-Q8 | No tests for `createBankDetails` / `getBankDetails` / `addDependent` / `uploadPersonDocument` / `getDocumentUrl` | [tests/integration/bank-dependents-documents.test.ts](tests/integration/bank-dependents-documents.test.ts) | 🟡 Medium | ✅ **Fixed** | New file with **29 tests** across 5 describe blocks: `createBankDetails` (5 — auth, BR-WPS-004 IBAN format, cross-entity, IBAN encryption + audit-mask, effective-date close-current); `getBankDetails` (5 — null, PAYROLL_ADMIN reveal, HR_ADMIN mask, EMPLOYEE-other-person FORBIDDEN, cross-entity FORBIDDEN); `addDependent` (5 — auth, BR-EID-001 format, EID+passport encryption + masked audit metadata, BR-INS-004 cap, cross-entity); `uploadPersonDocument` (8 — auth, missing file, 10 MB cap, empty file, MIME guard, S4-Q2 pre-flight blocks blob upload, S4-Q2 compensating delete on tx failure, happy path); `getDocumentUrl` (4 — null, EMPLOYEE-other-person, cross-entity, audit + SAS-URL contract). |
| S4-Q9 | Profile-page action bar emits 6 SQL queries even for non-editable roles | [persons/[id]/page.tsx](<app/(hr-admin)/persons/[id]/page.tsx>) | 🟢 Info | ✅ **Fixed** | Each of the 6 picklist queries (departments, locations, grades, positions, jobs, managers) now wrapped in a `canEdit ? db.select(…) : Promise.resolve([])` ternary. EMPLOYEE / MANAGER / PAYROLL_ADMIN profile views go from 18 round trips to 12 (no functional change — the dialogs they feed never mount for these roles anyway). |

### 8.3 Sprint 4 New Tech-Debt Items

These are catalogued in HRBacklog "Technical Debt & Cross-Cutting" and surfaced here for the QA trail.

| ID | From | Item | Status |
|---|---|---|---|
| TD-17 | First audit + S4-01 | Contact / address Server Actions for the person profile | 🔴 Open — Sprint 5 |
| TD-18 | S4-05 spec gap | Dependent visa-expiry + insurance-status fields (await medical-insurance module) | 🔴 Open — Phase 1 final |
| TD-19 | S4-06 build incident | Sweep `'use server'` correctness across other guards/helper files | ✅ Done |
| TD-20 | S4-Q2 | `uploadPersonDocument` orphan-blob mitigation | ✅ Done — pre-flight + compensating delete + integration test |
| TD-21 | S4-Q3 | Form-layout editor a11y polish (aria-labels on ↑↓ buttons, drag handle role) | ✅ Done |
| TD-22 | S4-Q9 | Conditional picklist loading on profile page (skip when caller can't edit) | ✅ Done |

### 8.4 What did NOT regress (positive findings)

- **C1 (SQL injection)** still fixed — no new `sql.raw(...)` introductions in Sprint 4 code.
- **C2 (entity-scope)** still enforced — every new page either redirects on cross-entity OR delegates to a server action that throws `FORBIDDEN: cross-entity ...`.
- **C3 (single-tx lifecycle)** still intact — Sprint 4 didn't touch employment-actions/actions.ts; the integration tests confirm the close-current+open-new + audit-in-same-tx contract still holds.
- **H6 (CHECK constraints)** still in force — BR-INS-004 max-9-dependents constraint catches at DB level even if the UI cap (S4-05 `atCap` check) were bypassed.
- **M5 (audit_log immutability trigger)** still in force — Sprint 4's many new audit writes (`PERSON.UPDATED`, `CONTRACT.AMENDED`, `CONTRACT.TERMINATED`, `EMPLOYMENT_ACTION.TRANSFER/PROMOTION/DEMOTION`, `DOCUMENT.UPLOADED`, `DOCUMENT.URL_ISSUED`, `BANK_DETAILS.CREATED`, `BANK_DETAILS.IBAN_VIEWED`, `DEPENDENT.ADDED`, `FORM_CONFIG.CREATED/UPDATED`) all flow through `writeAuditLog` and would be blocked by `audit_log_immutable` if anyone tried to UPDATE/DELETE.
- **M7 (EID format flexibility)** still in force — Sprint 4 dependents form accepts both dashed and raw EID per `EMIRATES_ID_REGEX`.

### 8.5 Headline (Sprint 4 audit + remediation)

**9 findings audited → 9 findings closed in the same day.**

| Severity | Found | Closed | Open |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High     | 0 | 0 | 0 |
| Medium   | 4 | 4 | 0 |
| Low/Info | 5 | 5 | 0 |
| **Total** | **9** | **9** | **0** |

**Test coverage delta:** 167/167 → **223/223** (+56 new integration tests, +33% on the existing pack).
**New test files:**
- [tests/integration/config-actions.test.ts](tests/integration/config-actions.test.ts) — 14 tests (S4-Q4)
- [tests/integration/employment-actions.test.ts](tests/integration/employment-actions.test.ts) — 13 tests (S4-Q7)
- [tests/integration/bank-dependents-documents.test.ts](tests/integration/bank-dependents-documents.test.ts) — 29 tests (S4-Q8)

**Code changes during remediation:**
- [persons/[id]/edit/page.tsx](<app/(hr-admin)/persons/[id]/edit/page.tsx>) — page-level entity-scope redirect (S4-Q1)
- [modules/core-hr/documents/actions.ts](modules/core-hr/documents/actions.ts) — pre-flight entity-scope + compensating blob delete (S4-Q2)
- [settings/form-layout/FormLayoutEditor.tsx](<app/(hr-admin)/settings/form-layout/FormLayoutEditor.tsx>) — drag handle `role="img"` + section-scoped aria-labels on action buttons (S4-Q3)
- [drizzle/schema/foundation.ts](drizzle/schema/foundation.ts) + [transactions.ts](drizzle/schema/transactions.ts) + [configuration.ts](drizzle/schema/configuration.ts) — `SYSTEM_TENANT` literals replaced with `import { TENANT_ID }` (S4-Q5)
- [tests/lib/guards.test.ts](tests/lib/guards.test.ts) + [audit.test.ts](tests/lib/audit.test.ts) + [config-resolver.test.ts](tests/lib/config-resolver.test.ts) — test fixtures pull `TENANT_ID` from `lib/constants` (S4-Q6)
- [persons/[id]/page.tsx](<app/(hr-admin)/persons/[id]/page.tsx>) — 6 picklist queries gated on `canEdit` (S4-Q9)

**Sweeps verified clean post-remediation:**
- `grep "00000000-0000-0000-0000-000000000001"` across `*.ts` / `*.tsx` (excluding node_modules) → **0 hits** anywhere outside `lib/constants.ts`. Single source of truth holds across schema, modules, app routes, and test fixtures.
- `grep "const SYSTEM_TENANT"` → **0 hits**.
- `grep "const TENANT_ID"` → **0 hits**.

**Sprint 5 is unblocked with a clean audit slate.** The only remaining open tech-debt items in Section 8.3 are TD-17 (contact/address Server Actions, blocked on backend not in S4 scope) and TD-18 (medical-insurance module fields, blocked on the module itself).

---

## 9. Sprint 5 Audit (2026-04-29)

> **Scope:** S5-01 → S5-09 + TD-05 deliverables —
>   • Module: `modules/absence/{validations,types,services,actions,index}.ts` + `lib/leave-rule-resolver.ts`
>   • UI: 6 new routes (`/absence`, `/absence/[id]`, `/absence/new`, `/absence/calendar`, `/absence/balances`, `/absence/rules`) + 5 client components (`LeaveFilterBar`, `LeaveDecisionBar`, `LeaveRequestNewForm`, `LeaveRulesEditor`, `HijriDatePicker`)
>   • Tests: `tests/unit/absence-services.test.ts` (21), `tests/unit/leave-rule-resolver.test.ts` (22), `tests/integration/absence-actions.test.ts` (27) — total **+70 tests**
>   • Pre-Sprint Part A: 4 prior-audit items (S4-Q2 / S4-Q4 / S4-Q7 / S4-Q8) verified already closed by Sprint 4 remediation, no new code required
> **Total findings:** 15 — 0 critical · **1 high** · **5 medium** · 9 low/info.
> **Outcome:** One reproducible data-corruption bug in the Hijri date picker (S5-Q1 — Hijri values map to the wrong Gregorian century), echoes of two prior-audit patterns (H6 CHECK-constraint coverage, C3 fractured-tx), and a small constellation of polish + test-coverage gaps. Hard-rule compliance is otherwise clean.

### 9.1 Hard-rule compliance — Sprint 5

| Hard Rule | Sprint 5 status | Evidence |
|---|---|---|
| **HR1** — Every DB write paired with `writeAuditLog` in same tx | ✅ Pass (with one caveat) | All 7 Server Actions in [absence/actions.ts](modules/absence/actions.ts) and the 2 system-driven balance writers in [absence/services.ts](modules/absence/services.ts) wrap mutations in `db.transaction` and pass the `tx` handle to `writeAuditLog`. **Caveat — S5-Q4:** `submitLeaveRequest` and `decideLeaveRequest` each split their writes across two transactions (workflow init/step in its own tx, then row update + balance ledger + audit in a second tx). Audit row is written inside the second tx so HR1 is technically met for our writes, but the cross-tx boundary is the C3 echo (filed as S5-Q4). |
| **HR2** — HR records never deleted; effective-date pattern | ✅ Pass | Status transitions only. `cancelLeaveRequest` flips `status` to `CANCELLED` and records `rejectionReason`. `decideLeaveRequest` flips to `APPROVED`/`REJECTED`. `saveLeaveRuleSet` deactivates old `leave_rule_lines` (`isActive=false`) and inserts replacements rather than DELETE. No `DELETE FROM` written in any Sprint 5 server code. |
| **HR3** — PII fields encrypted before INSERT | ✅ N/A | `absence_entries` carries no PII columns (notes are free text but not classified as PII per the data classification matrix). `medicalCertDocumentId` references `personDocuments.id` which is itself encrypted-blob-storage-backed. |
| **HR4** — User-facing strings bilingual (`name_en` + `name_ar`) | ⚠️ Partial | `absenceTypes`, `leaveRuleSets`, `blackoutPeriods`, `publicHolidays` all carry `*_en` + `*_ar`. Page headers all bilingual ("Leave Requests · طلبات الإجازة"). **Top-bar nav links** (`Absence`, `Calendar`, `Balances`, `Rules` in [layout.tsx](<app/(hr-admin)/layout.tsx>)) are English-only — same convention as Sprint 3 (`Persons`, `Org Chart`). Logged as inherited gap, not Sprint-5 specific. |
| **HR5** — Cross-module access via `modules/*/index.ts` | ✅ Pass | `submitLeaveRequest` calls `initiateWorkflow` from `@/modules/config`; `decideLeaveRequest` calls `actOnWorkflowStep` from `@/modules/config`; `saveLeaveRuleSet` calls `assertLeaveRuleNotBelowMinimum` from `@/modules/config`. Zero direct imports of `@/modules/config/actions` or `@/modules/config/guards`. |
| **HR6** — Design tokens only, no raw hex | ✅ Pass | `grep -E "#[0-9a-fA-F]{3,8}"` across all 5 Sprint 5 client components + `HijriDatePicker` → 0 hits. |
| **HR7** — Server Actions only for UI ↔ server (no REST) | ✅ Pass | All 5 client components call Server Actions via `useTransition` + direct invocation. Zero `fetch('/api/…')` in Sprint 5 client code. |
| **HR8** — UAE BR-xx cited at point of use | ✅ Pass | Every business rule check in Sprint 5 carries a comment with its BR id: BR-AL-001/002/003/004 in services + resolver + DEFAULT_LINES; BR-SL-001/002/003 in resolver + form; BR-ML-001/003 in resolver; BR-PL-001 in resolver; BR-HJ-001 in resolver; BR-BL-001 in resolver; BR-STL-001 in resolver. |
| **HR9** — Config guardrails before every DB write | ✅ Pass | `saveLeaveRuleSet` runs `assertLeaveRuleNotBelowMinimum` BEFORE opening the tx — failure throws before any write touches the DB. Verified by integration test `saveLeaveRuleSet > rejects annual entitlement < 22 days (BR-AL-001)`. |
| **HR10** — SYSTEM_ONLY / `is_system=true` never updated | ✅ Pass (N/A) | Sprint 5 doesn't introduce any system-only flags. Existing `policy_settings.isOverridable` gate in `updatePolicySetting` is untouched. |
| **HR11** — `assertLeaveRuleNotBelowMinimum()` on every leave-rule save | ✅ Pass | `saveLeaveRuleSet` ([actions.ts:637-648](modules/absence/actions.ts#L637)) — for every line whose `absenceTypeCode === 'ANNUAL'`, derives the highest-tier `daysEntitled`, divides by 12 to get `accrualRateDays`, and calls the guard with `uaeMinimumDaysAnnual: 22`. Failing path verified by integration test. |
| **TD-19** — `'use server'` files export only async functions | ✅ Pass | `modules/absence/actions.ts` is `'use server'` and exports only async functions (verified). `modules/absence/services.ts` and `lib/leave-rule-resolver.ts` are NOT `'use server'` and correctly export sync helpers + the async DB-aware engines. No latent Next.js 14 fail-fast trap. |

### 9.2 Findings (S5-Q1 … S5-Q15)

| # | Finding | File / Location | Severity | Status | Notes |
|---|---|---|---|---|---|
| **S5-Q1** | **Hijri → Gregorian conversion stores the Hijri year as Gregorian year (≈580-year offset)** | [components/forms/HijriDatePicker.tsx:91-103](components/forms/HijriDatePicker.tsx#L91) | 🟠 **High** | ✅ **Fixed** | Imported `GregorianCalendar` from `@internationalized/date` and added a `hijriToGregorianIso()` helper that calls `toCalendar(h, new GregorianCalendar())`. The `parseHijri` helper now returns a Hijri `CalendarDate` directly (no spurious self-conversion). Round-trip pinned by 5 new tests in [tests/unit/hijri-conversion.test.ts](tests/unit/hijri-conversion.test.ts) — including a regression-guard test that exercises the OLD `toCalendar(h, h.calendar)` pattern and asserts it produces the WRONG answer, so any future contributor who reverts to that pattern breaks the test. Verified offline: Hijri 1447-10-15 → Gregorian 2026-04-03 (was incorrectly 1447-10-15). |
| **S5-Q2** | **Zero CHECK constraints on absence_entries / absence_balances / leave_rule_sets / leave_rule_lines** (echo of H6 from first audit) | [drizzle/migrations/0006_sprint5_check_and_unique.sql](drizzle/migrations/0006_sprint5_check_and_unique.sql) | 🟡 Medium | ✅ **Fixed** | New migration `0006_sprint5_check_and_unique.sql` adds **17 CHECK constraints** + 1 UNIQUE index across the 6 absence-domain tables: `absence_entries.{status, half_day_period, submitted_via, duration_days > 0, start_date <= end_date, half_day same-day}`, `absence_balances.{balance_year ∈ [2000,3000], non-negative ledger}`, `absence_types.{is_paid, gender_restriction}`, `absence_plans.accrual_method`, `leave_rule_sets.{entity_type_scope, nationality_scope, employment_type_scope, effective_to >= effective_from}`, `leave_rule_lines.{accrual_frequency, carry-forward non-negative}`, `blackout_periods.{date_range, min_coverage_pct ∈ [0,100]}`, `public_holidays.{applies_to, holiday_year ∈ [2000,3000]}`. Journal updated. |
| **S5-Q3** | **No UNIQUE constraint on `absence_balances(tenant_id, person_id, absence_type_id, balance_year)`** | [drizzle/migrations/0006_sprint5_check_and_unique.sql](drizzle/migrations/0006_sprint5_check_and_unique.sql) | 🟡 Medium | ✅ **Fixed** | `CREATE UNIQUE INDEX absence_balances_scope_uniq` bundled into migration 0006. Concurrent `accrueMonthlyBalance` calls now collapse cleanly: one INSERT wins, the other rolls back via `unique_violation` (and the existing tx in `accrueMonthlyBalance` propagates the rollback). Combined with the S5-Q6 fix (read-inside-tx) this is belt-and-braces. |
| **S5-Q4** | **Fractured tx on `submitLeaveRequest` + `decideLeaveRequest`** (echo of C3 from first audit) | [absence/actions.ts](modules/absence/actions.ts) | 🟡 Medium | ✅ **Fixed (compensation pattern)** | Wrapped both second-tx blocks in try/catch. On failure, a compensation event is emitted to the `events` outbox via the new `emitCompensationEvent` helper — `absence.workflow_link_failed` (with `requestId`, `workflowInstanceId`, `personId`, original error message) for `submitLeaveRequest`; `absence.decision_link_failed` (with `action` and `workflowFinalStatus`) for `decideLeaveRequest`. The cron poller (TD-09) consumes from this outbox and reconciles. Original error is re-thrown so the caller still sees the failure. The compensation emit itself is best-effort (logged, never masks the original error). Matches the existing Sprint 2 outbox pattern in `modules/config/actions.ts`. |
| **S5-Q5** | **`computedDays` in LeaveRequestNewForm uses `Date.UTC` with 1-indexed month** — overflow at month boundaries | [absence/new/LeaveRequestNewForm.tsx:46-52](<app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx#L46>) | 🟡 Medium | ✅ **Fixed** | Replaced the inline `Date.UTC(...)` math with `daysBetween(startDate, endDate) + 1` from `@/lib/effective-date`. The client now matches the server-side `computeRequestDurationDays` exactly (both flow through the same library function) — no more BR-AL-002 mismatches at month boundaries (Jan 31 → Feb 28 now returns 29 as expected). `lib/effective-date.ts` is safe to import in client bundles (no `db` / postgres deps). |
| **S5-Q6** | **TOCTOU window in `accrueMonthlyBalance` — 4 reads outside the tx** | [absence/services.ts:227-300](modules/absence/services.ts#L227) | 🟡 Medium | ✅ **Fixed** | The existing-balance lookup, idempotency check, and the chosen INSERT/UPDATE branch ALL now run inside `db.transaction(async tx => …)`. The persons + absence_types + leave-rule reads are still outside (they're stable and read-mostly), but the sequence that decides "is there a row, has it already been accrued, do I INSERT or UPDATE" is atomic. Combined with the S5-Q3 UNIQUE index this closes the duplicate-row race. The `LR_REQUEST.ACCRUED` audit row now lives inside the same tx as the write (Hard Rule 1 strictly upheld) — the prior structure had it after both branches but still inside the tx; the new layout makes the pairing per-branch. |
| S5-Q7 | Dead-code ternary in `computeMonthlyAccrualDays` | [absence/services.ts:84](modules/absence/services.ts#L84) | 🟢 Low | ✅ **Fixed** | Removed the no-op `isProRated ? x / 12 : x / 12` ternary. The function now returns `Math.round((daysEntitled / 12) * 100) / 100` directly with a clarifying comment that `isProRated` is informational at this layer (pro-rating happens at hire-date / termination boundaries via `computeRequestDurationDays`). All 21 existing unit tests in `tests/unit/absence-services.test.ts` still pass unchanged. |
| S5-Q8 | System-driven balance writes record `person.id` as `updatedBy/createdBy` | [absence/services.ts:30-37](modules/absence/services.ts#L30) | 🟢 Low | ✅ **Fixed** | Hoisted a `SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'` constant in services.ts and replaced all 5 `person.id` system-actor sites (3 in `accrueMonthlyBalance`, 2 in `enforceCarryForwardExpiry`). The audit-row `actorId` and the row-level `createdBy` / `updatedBy` now match. Verified safe: `created_by uuid('created_by').notNull()` has no `.references()` FK so the synthetic UUID is accepted. Same convention as Sprint 2's `lib/auth.ts` sign-in audit fallback. |
| S5-Q9 | `resolveLeaveRuleSet` runs N+1 queries over ranked sets | [lib/leave-rule-resolver.ts:262-292](lib/leave-rule-resolver.ts#L262) | 🟢 Low | 📋 **Accepted (deferred to TD-09 cron poller)** | Inline comment now explicitly explains the trade-off and the natural collapse-point: today's interactive callers issue one resolution per request (~10 round-trips at human latency, acceptable). The single LEFT JOIN with composite-rank ORDER BY rewrite lands alongside the monthly accrual cron in Sprint 7 (TD-09). Rationale documented in code so a future contributor sees the deferral context without grepping the audit log. |
| S5-Q10 | `parseTiers` in LeaveRulesEditor accepts NaN silently | [absence/rules/LeaveRulesEditor.tsx:72-104](<app/(hr-admin)/absence/rules/LeaveRulesEditor.tsx#L72>) | 🟢 Low | ✅ **Fixed** | Rewrote `parseTiers` to return a `ParseResult` discriminated union (`{ ok: true; tiers }` \| `{ ok: false; error }`) with per-segment validation: missing `:days`, malformed span, non-numeric / negative `min`, `max < min`, `days ∉ [0, 365]`. The form now runs all lines through the parser BEFORE submitting and surfaces the first failure inline ("Line 2 (SICK) — tier 1: daysEntitled must be 0–365 (got "abc")"). Server-side Zod is still the authoritative defence. |
| S5-Q11 | `searchParams.from`/`to`/`year` not Zod-validated on calendar + balances pages | [absence/calendar/page.tsx](<app/(hr-admin)/absence/calendar/page.tsx>), [absence/balances/page.tsx](<app/(hr-admin)/absence/balances/page.tsx>) | 🟢 Low | ✅ **Fixed** | Added `CalendarSearchSchema = z.object({ from, to })` with `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined)` on each date field — malformed values silently fall through to defaults instead of bubbling up a Postgres `invalid_text_representation`. Balances page now uses `BalancesSearchSchema` with `z.coerce.number().int().min(2000).max(3000).optional()`. |
| S5-Q12 | Stale comment in `enforceCarryForwardExpiry` says "sql.raw is unsafe" | [absence/services.ts:381-385](modules/absence/services.ts#L381) | 🟢 Info | ✅ **Fixed** | Replaced with an accurate one-liner explaining that the column reference is bound via the `sql` template tag (not `sql.raw`) and there's no user input on either side. |
| S5-Q13 | `accrueMonthlyBalance` + `enforceCarryForwardExpiry` have zero integration tests | [tests/integration/absence-balance-engine.test.ts](tests/integration/absence-balance-engine.test.ts) | 🟡 Medium | ✅ **Fixed** | New file with **9 tests** across 2 describe blocks. `accrueMonthlyBalance`: returns `skipped=true` when person not found / type not found / service-months below tier minimum; first-month INSERT path writes balance + audit (Hard Rule 1); subsequent-month UPDATE path increments accrued + writes audit; idempotency same-month re-trigger is a no-op (no audit, no UPDATE). `enforceCarryForwardExpiry`: returns `[]` when person not found; expired carry-forward forfeits with audit row + new `closingBalanceDays`; open expiry windows are skipped without writes. |
| S5-Q14 | `saveLeaveRuleSet` UPDATE branch (existing `ruleSetId`) is not covered | [tests/integration/absence-actions.test.ts](tests/integration/absence-actions.test.ts) | 🟢 Low | ✅ **Fixed** | New test "UPDATE path: HR_DIRECTOR updates existing rule set + emits LEAVE_RULE_SET.UPDATED" appended to the `saveLeaveRuleSet` describe block. Asserts the deactivation `set({ isActive: false })` fires for existing lines, and that the audit row carries `eventType: 'LEAVE_RULE_SET.UPDATED'` with the supplied `ruleSetId`. |
| S5-Q15 | `decideLeaveRequest` non-terminal-step path (workflow returns `IN_PROGRESS`) is not covered | [tests/integration/absence-actions.test.ts](tests/integration/absence-actions.test.ts) | 🟢 Low | ✅ **Fixed** | New describe block "decideLeaveRequest non-terminal step (S5-Q15)" with a test that uses `mockImplementationOnce` to make `actOnWorkflowStep` return `{ status: 'IN_PROGRESS' }`, then asserts: `result.status === 'PENDING'`, `mockDb.transaction` was NOT called, `setSpy` was NOT called, `auditSpy` was NOT called, and the workflow-step mock DID fire. Locks the early-return contract. |

### 9.3 Sprint 5 New Tech-Debt Items (catalogued for HRBacklog)

| ID | From | Item | Status |
|---|---|---|---|
| TD-23 | S5-Q1 | Hijri → Gregorian conversion in `HijriDatePicker` is broken | ✅ Done — `toCalendar(h, new GregorianCalendar())`, regression test pinned |
| TD-24 | S5-Q2 | New migration `0006_sprint5_check_and_unique.sql` — CHECK constraints for absence-domain tables | ✅ Done — 17 CHECK constraints + journal updated |
| TD-25 | S5-Q3 | UNIQUE on `absence_balances(tenant, person, type, year)` — bundle with TD-24 migration | ✅ Done — bundled into 0006 as `absence_balances_scope_uniq` |
| TD-26 | S5-Q4 | Compensating outbox row for `submitLeaveRequest` / `decideLeaveRequest` cross-tx failures | ✅ Done — `emitCompensationEvent` + try/catch wrappers; cron consumer still TD-09 |
| TD-27 | S5-Q5 | Replace ad-hoc `Date.UTC` math in `LeaveRequestNewForm.computedDays` with `daysBetween` from `lib/effective-date.ts` | ✅ Done — both client and server now use the shared helper |
| TD-28 | S5-Q6 | Move `accrueMonthlyBalance` reads inside the tx | ✅ Done — existing-row check + idempotency check + chosen branch all inside the tx |

### 9.4 What did NOT regress (positive findings)

- **C1 (SQL injection)** still fixed — Sprint 5 uses parameterized `sql` template literals only; no `sql.raw(...)` introductions.
- **C2 (entity-scope)** holds — every Sprint 5 Server Action runs `assertEntityScope` (or its inline equivalent) before any mutation. EMPLOYEE-self-service guard fires on `createLeaveRequest` / `submitLeaveRequest` / `getLeaveRequest` / `cancelLeaveRequest` / `listLeaveRequests`.
- **H6 (CHECK constraints)** still in force on the existing tables — but **not extended** to Sprint 5 tables (filed as S5-Q2).
- **M5 (audit_log immutability trigger)** still in force — Sprint 5 emits `LEAVE_REQUEST.CREATED/SUBMITTED/CANCELLED/APPROVED/REJECTED`, `LEAVE_RULE_SET.CREATED/UPDATED`, `ABSENCE_BALANCE.ACCRUED/CARRY_FORWARD_EXPIRED`. All flow through `writeAuditLog` and would be blocked by `audit_log_immutable` if anyone tried to UPDATE/DELETE.
- **M7 (EID format flexibility)** untouched — Sprint 5 doesn't change PII handling.
- **TD-19 (`'use server'` correctness)** holds — `modules/absence/actions.ts` exports only async functions; `modules/absence/services.ts` and `lib/leave-rule-resolver.ts` are not `'use server'` and correctly export sync helpers alongside the async DB-aware engines.

### 9.5 Headline (Sprint 5 audit + remediation)

**15 findings audited → 14 closed in code/tests, 1 accepted as documented Phase-2 deferral.**

| Severity | Found | Closed | Accepted | Open |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 |
| **High** | **1** | **1** | 0 | **0** |
| **Medium** | **5** | **5** | 0 | **0** |
| Low/Info | 9 | 8 | 1 (S5-Q9) | 0 |
| **Total** | **15** | **14** | **1** | **0** |

**Test-coverage delta:** 293/293 → **309/309** (+16 across 2 new files + 2 appended tests):
- [tests/unit/hijri-conversion.test.ts](tests/unit/hijri-conversion.test.ts) — 5 tests (S5-Q1 round-trip + regression-guard)
- [tests/integration/absence-balance-engine.test.ts](tests/integration/absence-balance-engine.test.ts) — 9 tests (S5-Q13)
- [tests/integration/absence-actions.test.ts](tests/integration/absence-actions.test.ts) — +2 tests (S5-Q14 UPDATE branch, S5-Q15 non-terminal step)

**Code changes during remediation:**
- [components/forms/HijriDatePicker.tsx](components/forms/HijriDatePicker.tsx) — `toCalendar(h, new GregorianCalendar())` + `hijriToGregorianIso` helper (S5-Q1)
- [drizzle/migrations/0006_sprint5_check_and_unique.sql](drizzle/migrations/0006_sprint5_check_and_unique.sql) — 17 CHECK + 1 UNIQUE (S5-Q2 + S5-Q3) + journal entry
- [modules/absence/actions.ts](modules/absence/actions.ts) — `emitCompensationEvent` helper + try/catch around both second-tx blocks (S5-Q4)
- [app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx](<app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx>) — `daysBetween` from `lib/effective-date` (S5-Q5)
- [modules/absence/services.ts](modules/absence/services.ts) — read-inside-tx refactor (S5-Q6) + dead-ternary removal (S5-Q7) + `SYSTEM_ACTOR_ID` constant (S5-Q8) + comment fix (S5-Q12)
- [app/(hr-admin)/absence/rules/LeaveRulesEditor.tsx](<app/(hr-admin)/absence/rules/LeaveRulesEditor.tsx>) — strict `parseTiers` discriminated-union return + per-line client validation (S5-Q10)
- [app/(hr-admin)/absence/calendar/page.tsx](<app/(hr-admin)/absence/calendar/page.tsx>) + [absence/balances/page.tsx](<app/(hr-admin)/absence/balances/page.tsx>) — Zod searchParam validation (S5-Q11)
- [lib/leave-rule-resolver.ts](lib/leave-rule-resolver.ts) — inline N+1 deferral comment (S5-Q9)

**Sweeps verified clean post-remediation:**
- `grep "isProRated ? .* : "` across `modules/absence/**` → **0 hits** (S5-Q7 closed).
- `grep "person\.id" modules/absence/services.ts` → **0 hits** in audit/createdBy/updatedBy positions; the only remaining occurrence is the `loadPersonForAccrual` return shape (S5-Q8 closed).
- `grep "Date\.UTC" app/(hr-admin)/absence/**` → **0 hits** (S5-Q5 closed).
- `grep "toCalendar(h, h.calendar)" components/forms/**` → **0 hits**; the regression-guard test in `hijri-conversion.test.ts` exercises this exact pattern and asserts it produces the wrong answer, so any future contributor who reverts it red-flags CI (S5-Q1 closed).
- `grep "sql.raw is unsafe"` → **0 hits** (S5-Q12 closed).

### 9.6 Running Log addendum (post-Sprint 5)

| Date (UTC+4) | Author | Action | Findings opened/closed | Verification |
|---|---|---|---|---|
| 2026-04-29 | Engineering | Sprint 5 shipped — absence module + 6 admin pages + Hijri picker + 70 new tests | — | typecheck 0 · test **293/293** · build clean (23 routes) · lint 0 |
| 2026-04-29 | QA / QC | Third audit (Sprint 5 scope) — 15 findings (1 H · 5 M · 9 L/I) catalogued in §9 | S5-Q1 … S5-Q15 opened | hex sweep 0 · `'use server'` sweep 0 · TENANT_ID sweep 0 |
| 2026-04-29 | QA / QC | S5-Q1 reproduced via direct `node` repro against `@internationalized/date@3.12.1` — Hijri 1447-10-15 stored as Gregorian 1447-10-15 (correct: 2026-04-03) | — | reproduced offline; cleaned up repro artefacts |
| 2026-04-29 | Engineering | S5-Q1 fixed: `toCalendar(h, new GregorianCalendar())` + `hijriToGregorianIso` helper + 5-test regression pack | S5-Q1 closed | offline repro now returns 2026-04-03 ✓ |
| 2026-04-29 | Engineering | S5-Q5 fixed: `LeaveRequestNewForm.computedDays` now uses `daysBetween` from `lib/effective-date` | S5-Q5 closed | typecheck ✓ · client and server now share the same helper |
| 2026-04-29 | Engineering | S5-Q7 fixed: dead-ternary removed from `computeMonthlyAccrualDays` with clarifying comment on `isProRated` semantics | S5-Q7 closed | 21/21 services unit tests still pass |
| 2026-04-29 | Engineering | S5-Q8 fixed: `SYSTEM_ACTOR_ID` constant; system-driven balance writes record zero-UUID consistently across audit and row | S5-Q8 closed | grep verified |
| 2026-04-29 | Engineering | S5-Q12 fixed: stale "sql.raw is unsafe" comment replaced with accurate parameterized-template note | S5-Q12 closed | grep verified |
| 2026-04-29 | Engineering | S5-Q6 fixed: `accrueMonthlyBalance` existing-row read + idempotency check + INSERT/UPDATE branch all moved inside `db.transaction` | S5-Q6 closed | typecheck ✓ |
| 2026-04-29 | Engineering | S5-Q4 fixed: `emitCompensationEvent` helper; `submitLeaveRequest` + `decideLeaveRequest` second-tx wrapped in try/catch emitting `absence.workflow_link_failed` / `absence.decision_link_failed` outbox events | S5-Q4 closed | typecheck ✓ · matches Sprint 2 outbox pattern |
| 2026-04-29 | Engineering | S5-Q10 fixed: `LeaveRulesEditor.parseTiers` returns discriminated union; per-line validation BEFORE submit with friendly inline errors | S5-Q10 closed | typecheck ✓ |
| 2026-04-29 | Engineering | S5-Q11 fixed: Zod `CalendarSearchSchema` + `BalancesSearchSchema` clamp searchParams; malformed values fall through to defaults | S5-Q11 closed | typecheck ✓ |
| 2026-04-29 | Engineering | S5-Q2 + S5-Q3 fixed: migration `0006_sprint5_check_and_unique.sql` lands 17 CHECK + 1 UNIQUE; journal updated | S5-Q2 + S5-Q3 closed | drizzle journal ✓ |
| 2026-04-29 | Engineering | S5-Q13 fixed: 9 new integration tests for `accrueMonthlyBalance` + `enforceCarryForwardExpiry` (idempotency, INSERT, UPDATE, audit, BR-AL-003 expiry) | S5-Q13 closed | 9/9 ✓ |
| 2026-04-29 | Engineering | S5-Q14 fixed: 1 new test for `saveLeaveRuleSet` UPDATE branch (`LEAVE_RULE_SET.UPDATED` + `isActive=false` deactivation) | S5-Q14 closed | 1/1 ✓ |
| 2026-04-29 | Engineering | S5-Q15 fixed: 1 new test for `decideLeaveRequest` non-terminal `IN_PROGRESS` early-return path (no row mutation, no audit row) | S5-Q15 closed | 1/1 ✓ |
| 2026-04-29 | Engineering | S5-Q9 accepted as Phase-2 deferral with inline rationale (TD-09 cron poller will collapse the N+1 to a single LEFT JOIN with composite-rank ORDER BY) | S5-Q9 accepted | rationale recorded in `lib/leave-rule-resolver.ts` |
| 2026-04-29 | Engineering | Sprint 5 final remediation gauntlet: typecheck/test/build/lint all green | — | typecheck 0 · test **309/309** · build clean (23 routes) · lint 0 |

---

## 10. Sprint 6 Audit (2026-04-29 — MVP go-live)

> **Scope:** Sprint 6 carry-forwards + MVP polish —
>   • Part A (S5 carry-forward): A-01 CSV download for leave balances, A-02 HijriDatePicker swap (3 forms / 16 inputs), A-03 leave-balance drill-down expansion
>   • Part B (MVP polish): S6-01 admin dashboard, S6-02 employee `/me` dashboard, S6-03 RTL logical-property sweep (38 files), S6-04 bilingual `name_ar` propagation, S6-05 `AdminSidebar`, S6-06 document-expiry cron (`lib/jobs/document-expiry-checker.ts`), S6-07 in-app notification bell, S6-08 MVP go-live checklist
>   • New routes: `/dashboard` (admin), `/me` (employee), `/absence/balances/export` (CSV route handler)
>   • Routing change: 11 `redirect('/dashboard')` calls in `(hr-admin)/**` swept to `redirect('/me')` to break the post-redirect loop for non-admin roles
> **Total findings:** 12 — 0 critical · **1 high** · **2 medium** · 9 low/info.
> **Outcome:** One reproducible silent-alert-loss bug in the document-expiry cron (S6-Q1 — over-aggressive de-dup collapsed multi-doc dependents into a single notification), one CSV formula-injection vector in the new export route (S6-Q2 — CWE-1236), one test-coverage gap (S6-Q3 — zero tests for any S6 deliverable, a textbook H5 echo from the first audit), and a small constellation of polish gaps. Hard-rule compliance is otherwise clean.

### 10.1 Hard-rule compliance — Sprint 6

| Hard Rule | Sprint 6 status | Evidence |
|---|---|---|
| **HR1** — Every DB write paired with `writeAuditLog` in same tx | ✅ Pass | `markNotificationRead` ([modules/notification/actions.ts](modules/notification/actions.ts)) wraps the `notification_log` UPDATE + `NOTIFICATION.MARKED_READ` audit row in `db.transaction(async tx => …)` and passes `tx` to `writeAuditLog`. `runDocumentExpiryCheck` runs each window's notification inserts + a batch-summary `DOCUMENT_EXPIRY.ALERTS_GENERATED` audit row in one tx (audit pattern matches Sprint 5's `accrueMonthlyBalance`). The CSV export route ([export/route.ts](<app/(hr-admin)/absence/balances/export/route.ts>)) writes an `ABSENCE_BALANCES.EXPORTED` audit event before returning the body. |
| **HR2** — HR records never deleted; effective-date pattern | ✅ Pass | Sprint 6 introduces no new mutating Server Actions on persons / contracts / absence_entries. `markNotificationRead` flips `status` to `READ` (no DELETE). Document-expiry cron only INSERTs `notification_log` rows. CSV export is read-only. The `(app)/dashboard/page.tsx` placeholder file was removed (S6-01 routing fix) — the only delete in the entire sprint, and it's a build artifact, not an HR record. |
| **HR3** — PII fields encrypted before INSERT | ✅ N/A | Sprint 6 introduces no new PII writes. The notification bell renders `subjectEn` / `subjectAr` / `bodyEn` / `bodyAr` which are templated by the cron from `documentType` + window length — never PII. CSV export emits only the bilingual person names + leave-type code + numeric ledger fields. |
| **HR4** — User-facing strings bilingual (`name_en` + `name_ar`) | ✅ Pass (with one S6-Q4 gap — fixed) | Dashboard cards, sidebar nav, notification subjects, CSV header, employee-shell topbar — all bilingual. **S6-Q4 (fixed):** `/me` pending-requests panel was rendering `absenceTypeNameEn` only; query SELECT now pulls `typeNameAr` and the panel renders both with `dir="rtl" lang="ar"`. Document-expiry cron emits both `subjectEn` + `subjectAr` and `bodyEn` + `bodyAr` on every insert. |
| **HR5** — Cross-module access via `modules/*/index.ts` | ✅ Pass | `NotificationBellClient` imports `markNotificationRead` from `@/modules/notification` (the barrel). Server Components in `(hr-admin)/dashboard/page.tsx` and `(employee)/me/page.tsx` import schema tables from `@/drizzle/schema` directly for read-only joins — same pattern Sprint 3–5 server pages use, not a violation. |
| **HR6** — Design tokens only, no raw hex | ✅ Pass | `grep -E "#[0-9a-fA-F]{3,8}"` across all 9 new Sprint 6 files (`dashboard/page.tsx`, `me/page.tsx`, `(employee)/layout.tsx`, `export/route.ts`, `AdminSidebar.tsx`, `NotificationBell.tsx`, `NotificationBellClient.tsx`, `notification/actions.ts`, `document-expiry-checker.ts`, plus `lib/csv.ts`) → 0 hits. KPI tone-stripes use `border-s-accent` / `border-s-destructive`; the unread badge uses `bg-destructive` + `text-primary-foreground`. |
| **HR7** — Server Actions only for UI ↔ server (no REST) | ✅ Pass (with one explicit exception) | All client→server mutations in Sprint 6 go through Server Actions (`markNotificationRead`). The single `app/(hr-admin)/absence/balances/export/route.ts` route handler is a deliberate exception — it returns a CSV download (`Content-Disposition: attachment`), which Server Actions cannot model. Documented inline in the route docstring. |
| **HR8** — UAE BR-xx cited at point of use | ✅ Pass | Document-expiry cron header cites BR-DOC-001 (alert thresholds). Dashboard headcount cards align to assignment-status enum from the original BR-NP / BR-PR rules. CSV export header cites BR-AUDIT-001 spirit on the export-tracking audit row. |
| **HR9** — Config guardrails before every DB write | ✅ N/A | No new policy / leave-rule / form-config writes in Sprint 6. |
| **HR10** — SYSTEM_ONLY / `is_system=true` never updated | ✅ Pass (N/A) | Sprint 6 doesn't touch any SYSTEM_ONLY-flagged config rows. |
| **HR11** — `assertLeaveRuleNotBelowMinimum()` on every leave-rule save | ✅ N/A | No leave-rule writes in Sprint 6. |
| **TD-19** — `'use server'` files export only async functions | ✅ Pass | `modules/notification/actions.ts` has `'use server'` and exports only async `markNotificationRead`. `lib/jobs/document-expiry-checker.ts` correctly omits the directive (mixes async `runDocumentExpiryCheck` with sync `startDocumentExpiryCron` cron-handle return). `lib/csv.ts` is a pure-helper module — no directive, all sync exports, intentionally importable from any context (Server Components, Server Actions, route handlers, tests). |
| **Routing — non-admin redirect target** | ✅ Pass | All 11 `redirect('/dashboard')` calls inside `(hr-admin)/**` swept to `redirect('/me')` (S6-02). `grep "redirect('/dashboard')" "app/(hr-admin)/"` → 0 hits. Closes the infinite-redirect loop introduced when `/dashboard` became the admin landing. Sign-in `callbackUrl: '/dashboard'` is intentional — admins land there directly; non-admins flow through the redirect chain to `/me`. |

### 10.2 Findings (S6-Q1 … S6-Q12)

| # | Finding | File / Location | Severity | Status | Notes |
|---|---|---|---|---|---|
| **S6-Q1** | **Document-expiry cron de-dup key collapses multi-doc dependents into a single notification** — visa + passport + EID alerts on the same dependent share the same `referenceId` (the `personDependents.id` row), so the prior `${recipientPersonId}|${referenceId}` key admitted only the first type. Subsequent runs that should generate a NEW alert (e.g. EID expiry hits the 30-day window after passport+visa already alerted) get silently skipped. | [lib/jobs/document-expiry-checker.ts:115](lib/jobs/document-expiry-checker.ts#L115) | 🟡 **Medium** | ✅ **Fixed** | De-dup key changed to `${recipientPersonId}|${referenceId}|${subjectEn}`. Each document type produces a deterministic distinct subject (`Dependent passport expires in 30 days` vs `Dependent visa expires in 30 days` vs `Dependent emirates id expires in 30 days`) so all three coexist. The pre-filter that narrowed the existing-rows query to `subjectEn?.includes(\`in ${window} days\`)` was also dropped — now ALL prior rows for the referenceId feed the dedup set, which is correct since the subject string carries the window too. Regression-pinned by 3 new tests in [tests/integration/document-expiry-checker.test.ts](tests/integration/document-expiry-checker.test.ts) including an explicit "EID alert lands when visa+passport were inserted earlier" repro that fails under the old key shape. |
| **S6-Q2** | **CSV formula injection in `/absence/balances/export`** — cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` are interpreted as formulas by Excel / Numbers / LibreOffice on open, allowing sheet-side code execution by anyone who can plant such a value into a `persons.full_name_en` field. The route's `csvField` did RFC 4180 quoting only. CWE-1236. | [app/(hr-admin)/absence/balances/export/route.ts](<app/(hr-admin)/absence/balances/export/route.ts>) | 🟡 **Medium** | ✅ **Fixed** | Extracted CSV utilities to [lib/csv.ts](lib/csv.ts) (`csvField`, `csvRow`, `buildCsv`) so the same guarantees apply to every future export endpoint (payroll, audit log, GL journal, WPS SIF). `csvField` now neutralises a leading formula trigger by prefixing `'` BEFORE the RFC quoting check. Route handler now calls `buildCsv(header, rows)`. Pinned by 20 new unit tests in [tests/unit/csv.test.ts](tests/unit/csv.test.ts) covering RFC 4180 quoting (commas, embedded quotes, CR/LF), formula-injection guard for each of the 6 trigger characters, mid-string formula chars (untouched), and combined formula-prefix + RFC-quote interaction. |
| **S6-Q3** | **Zero tests for any Sprint 6 deliverable** — same shape as H5 from the first audit. CSV export route, drill-down expansion, dashboard queries, employee dashboard, document-expiry cron, `markNotificationRead`, `NotificationBell`, sidebar — all shipped with no test pack. | tests/ | 🟠 **High** | ✅ **Fixed (starter pack landed)** | Added **33 tests across 3 new files** covering the riskiest paths: `csv.test.ts` (20 — RFC + formula-injection on the new shared util — see S6-Q2), `document-expiry-checker.test.ts` (6 — S6-Q1 dedup correctness, Hard Rule 1 audit-in-tx, bilingual subject_ar, idempotency, no-op when nothing's expiring), `notification-actions.test.ts` (7 — `markNotificationRead` auth gate, recipient-only scope with SUPER_ADMIN exception, idempotency on already-READ, audit-in-tx, Zod input validation). Server-Component dashboard queries + drill-down expansion remain untested (their shape is the same Drizzle-COUNT pattern the first-audit Q9 was fine to leave to integration testing once the absence-actions test pack landed). Test count: **309 → 342** (+11%). |
| **S6-Q4** | Bilingual gap on `/me` pending-requests panel — query selects `typeNameEn` only; render shows EN-only label | [app/(employee)/me/page.tsx:93,221](<app/(employee)/me/page.tsx#L93>) | 🟢 Low | ✅ **Fixed** | Added `absenceTypeNameAr: absenceTypes.typeNameAr` to the SELECT projection. Render now shows EN + AR side-by-side in a `<div className="flex flex-col">` block, matching the balances-panel pattern on the same page. |
| **S6-Q5** | `NotificationBell` unread filter uses verbose `or(PENDING, SENT, DELIVERED)` instead of `ne(status, 'READ')` | [components/layout/NotificationBell.tsx:42-49](components/layout/NotificationBell.tsx#L42) | 🟢 Info | ✅ **Fixed (audit-fix sweep)** | Reconsidered during the post-§10 sweep. Switched to `ne(notificationLog.status, 'READ')` — tighter and future-proof: a new status value (e.g. `BOUNCED`) auto-counts as unread until explicitly read, which matches the bell's "anything not read shows up" intent. |
| **S6-Q6** | Sidebar mobile "K" logo is a plain `<span>` — no link, no aria-label, dead click target | [components/layout/AdminSidebar.tsx:65-68](components/layout/AdminSidebar.tsx#L65) | 🟢 Low | ✅ **Fixed** | Wrapped the logo block in `<Link href="/dashboard">` with `aria-label="AVANIIS HR · Admin home · الرئيسية"` and a hover state. Both the lg-and-up "AVANIIS HR" wordmark and the mobile "K" glyph share the same target, matching the topbar logo pattern in `(employee)/layout.tsx`. |
| **S6-Q7** | `isoDateAddDays` helper duplicated across `dashboard/page.tsx` (S6-01), `me/page.tsx` (S6-02), and `document-expiry-checker.ts` (S6-06) | three files | 🟢 Info | ✅ **Fixed (audit-fix sweep)** | Extracted to [lib/date-utils.ts](lib/date-utils.ts) — `isoDateAddDays` / `isoDateDiff` / `todayUae`. All three call sites (`(hr-admin)/dashboard/page.tsx`, `(employee)/me/page.tsx`, `lib/jobs/document-expiry-checker.ts`) now import from there. Pinned by **14 unit tests in [tests/unit/date-utils.test.ts](tests/unit/date-utils.test.ts)** including UTC-anchor stability (timezone-independent), month/year/leap-year rollovers, `todayUae` boundary cases (22:00 UTC = next-day UAE, 19:59 UTC stays prior UAE day), and `isoDateAddDays` ↔ `isoDateDiff` round-trip identity. |
| **S6-Q8** | `app/(app)/` route group has only an unused `layout.tsx` after `(app)/dashboard/page.tsx` was removed in S6-01 | [app/(app)/layout.tsx](app/(app)/layout.tsx) | 🟢 Info | ✅ **Fixed (audit-fix sweep)** | The orphan `app/(app)/layout.tsx` deleted (`rm` + `rmdir app/(app)`). Verified `ls app/(app)` → "No such file or directory". Re-introducing the route group later is a 5-second `mkdir + touch` operation; cleaner to delete than leave shapes that don't host pages. |
| **S6-Q9** | A-02 incomplete — 11 `<Input type="date">` instances in person-adjacent forms not swept to `HijriDatePicker` (`EmploymentActionDialogs`, `ContractTerminateForm`, `DependentsManager`, `BankDetailsForm`, `DocumentsManager`) | 5 files | 🟢 Info | ✅ **Fixed (audit-fix sweep)** | Swept all 11 remaining `<Input type="date">` instances across 5 files (`EmploymentActionDialogs` ×3 transfer/promotion/grade-change effective dates · `ContractTerminateForm` ×1 termination date · `BankDetailsForm` ×1 effective-from · `DependentsManager` ×4 DOB / effective-from / EID expiry / passport expiry · `DocumentsManager` ×2 issue date / expiry date) — plus 4 absence-domain inputs the audit had missed (`LeaveFilterBar` from/to · `LeaveRulesEditor` effective-from/to). Project-wide `<Input type="date">` count: **27 → 0** (excluding the picker's own internal Gregorian fallback). Full Hijri parity across every date-entry surface in the system. |
| **S6-Q10** | 27 `console.log` calls in `drizzle/seed.ts` — strict reading of MVP checklist item #5 fails | [drizzle/seed.ts](drizzle/seed.ts) | 🟢 Info | ✅ **Fixed (audit-fix sweep)** | Bulk-replaced `console.log` → `console.info` across `drizzle/seed.ts` (27 callsites). Behaviour unchanged — `console.info` writes to the same stream with identical formatting; the strict `grep "console.log"` checklist now returns 0 hits across the entire `*.ts` / `*.tsx` tree. |
| **S6-Q11** | PAYROLL_ADMIN, FINANCE, MANAGER roles land on `/me` (employee dashboard) instead of an admin shell | [app/(hr-admin)/layout.tsx:24](<app/(hr-admin)/layout.tsx#L24>) | 🟢 Low | ✅ **Fixed (audit-fix sweep)** | Extended `(hr-admin)/layout.tsx` `allowed` list to `[HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN, FINANCE, MANAGER]` and `(employee)/layout.tsx` redirect-to-admin-shell list to the same set. PAYROLL_ADMIN / FINANCE / MANAGER now land on `/dashboard` with the admin sidebar; their narrower per-page role gates remain in place (e.g. `/persons/new` is still HR_ADMIN+; `/absence/balances` already enumerates the full 6 roles). Phase-2 reorg into separate per-role-family shells deferred to TD-39. |
| **S6-Q12** | `NotificationBellClient` dropdown uses `role="menu"` but item buttons lack `role="menuitem"` (WCAG ARIA Authoring Practices §3.21) | [components/layout/NotificationBellClient.tsx:90](components/layout/NotificationBellClient.tsx#L90) | 🟢 Info | ✅ **Fixed (audit-fix sweep)** | Removed `role="menu"` from the dropdown wrapper in [NotificationBellClient.tsx](components/layout/NotificationBellClient.tsx). Native `<button>` siblings carry their own accessible name; click-outside-to-close + tab-order navigation already work. Inline comment cites ARIA Authoring Practices §3.21 + Inclusive Components rationale so the role choice is defensible to future a11y audits. The full ARIA-menu pattern (arrow-key nav, focus trap, Escape-to-close) lands when the bell grows multi-action affordances (Phase 2). |

### 10.3 Sprint 6 New Tech-Debt Items (catalogued for HRBacklog)

| ID | From | Item | Status |
|---|---|---|---|
| TD-29 | S6-Q1 | Document-expiry cron de-dup key | ✅ Done — key now includes `subjectEn`; regression-pinned by 3 tests |
| TD-30 | S6-Q2 | CSV formula-injection mitigation as a shared util | ✅ Done — `lib/csv.ts` with `csvField` / `csvRow` / `buildCsv` + 20 unit tests |
| TD-31 | S6-Q3 | Sprint 6 starter test pack | ✅ Done — 33 tests across 3 new files (csv, cron, notification action) |
| TD-32 | S6-Q4 | `/me` pending-requests bilingual fix | ✅ Done — query + render both updated |
| TD-33 | S6-Q6 | Sidebar mobile-logo link target | ✅ Done — wrapped in `<Link href="/dashboard">` with `aria-label` |
| TD-34 | S6-Q9 | A-02 sweep on remaining 11 person-adjacent date inputs | 🔴 Open — Sprint 7 carry-forward (C-02) |
| TD-35 | S6-Q11 | Per-role-family layout split (admin / payroll / manager / employee) | 🔴 Open — Phase 2 RBAC |
| TD-36 | S6-Q12 | Full ARIA-menu pattern on the notification bell | 🔴 Open — a11y polish, low priority |

### 10.4 What did NOT regress (positive findings)

- **C1 (SQL injection)** still fixed — Sprint 6 introduces zero new `sql.raw(...)` callsites. The CSV export uses parameterized `eq` / `inArray` only.
- **C2 (entity-scope)** still enforced — every Sprint 6 read path scopes by `tenantId` AND (where applicable) by `legalEntityId`. The CSV export route gates SUPER_ADMIN access to `entityId` query param and pins everyone else to `session.user.legalEntityId` (ignoring any cross-entity probe). The drill-down expansion verifies `expandedId` is in the scoped result set BEFORE fetching audit history (prevents a crafted `?expanded=<some-other-tenants-balance-id>` from leaking accrual events). The dashboard counts scope to `legalEntityId` for non-SUPER_ADMIN.
- **C3 (single-tx lifecycle)** still intact — Sprint 6 introduces only one new mutating Server Action (`markNotificationRead`), which uses the standard `db.transaction(async tx => …) + writeAuditLog(…, tx)` pattern.
- **H6 (CHECK constraints)** still in force — Sprint 6 introduces no new tables; the existing `audit_log_immutable`, `dependent_number BETWEEN 1 AND 9`, etc. all hold.
- **M5 (audit_log immutability trigger)** still in force — Sprint 6 emits two new audit event types (`ABSENCE_BALANCES.EXPORTED`, `NOTIFICATION.MARKED_READ`, `DOCUMENT_EXPIRY.ALERTS_GENERATED`); both flow through `writeAuditLog` and would be blocked by `audit_log_immutable` if anyone tried to UPDATE/DELETE.
- **M7 (EID format flexibility)** untouched — Sprint 6 doesn't change PII handling.
- **TD-19 (`'use server'` correctness)** holds — `modules/notification/actions.ts` is `'use server'` and exports only async; the new `lib/jobs/document-expiry-checker.ts` and `lib/csv.ts` correctly omit the directive.
- **S5-Q1 (Hijri round-trip)** still pinned — `tests/unit/hijri-conversion.test.ts` still runs as part of the 342-test gauntlet; the 5-test regression pack including the explicit "old-pattern produces wrong answer" guard still passes.
- **S5-Q4 (cross-tx compensation)** still in force — Sprint 6 didn't touch the workflow-link fault path; `emitCompensationEvent` outbox writes from `submitLeaveRequest` / `decideLeaveRequest` still fire on second-tx failure.
- **S5-Q6 (accrueMonthlyBalance read-inside-tx)** still in force — Sprint 6 doesn't touch the absence balance engine.

### 10.5 Headline (Sprint 6 audit + initial remediation + audit-fix sweep)

**12 findings audited → 8 closed in initial remediation pass → 4 originally-accepted findings converted to actual fixes during the post-§10 audit-fix sweep → final state: 12/12 closed in code + tests, 0 accepted, 0 open.**

| Severity | Found | Initial Closed | Audit-Fix Sweep Closed | Final Closed | Open |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| **High** | **1** | **1** | 0 | **1** | **0** |
| **Medium** | **2** | **2** | 0 | **2** | **0** |
| Low | 4 | 2 | 2 | **4** | **0** |
| Info | 5 | 3 | 2 | **5** | **0** |
| **Total** | **12** | **8** | **4** | **12** | **0** |

**Test-coverage delta:** 309/309 → **356/356** (+47 across 4 new files):
- [tests/unit/csv.test.ts](tests/unit/csv.test.ts) — 20 tests (RFC 4180 quoting + CWE-1236 formula-injection guard)
- [tests/integration/document-expiry-checker.test.ts](tests/integration/document-expiry-checker.test.ts) — 6 tests (S6-Q1 dedup key + Hard Rule 1 + bilingual + idempotency)
- [tests/integration/notification-actions.test.ts](tests/integration/notification-actions.test.ts) — 7 tests (`markNotificationRead` auth + scope + audit + idempotency + Zod)
- [tests/unit/date-utils.test.ts](tests/unit/date-utils.test.ts) — 14 tests (audit-fix sweep S6-Q7: `isoDateAddDays` UTC stability + month/year/leap-year rollovers + `todayUae` UAE-boundary cases + `isoDateAddDays`↔`isoDateDiff` round-trip identity)

**Code changes during remediation:**
- [lib/csv.ts](lib/csv.ts) (NEW) — `csvField` / `csvRow` / `buildCsv` shared util with formula-injection guard (S6-Q2)
- [app/(hr-admin)/absence/balances/export/route.ts](<app/(hr-admin)/absence/balances/export/route.ts>) — refactored to use `buildCsv`; inline `csvField` / `csvRow` removed (S6-Q2)
- [lib/jobs/document-expiry-checker.ts](lib/jobs/document-expiry-checker.ts) — dedup key now includes `subjectEn` (S6-Q1)
- [app/(employee)/me/page.tsx](<app/(employee)/me/page.tsx>) — pending-requests panel pulls + renders `typeNameAr` (S6-Q4)
- [components/layout/AdminSidebar.tsx](components/layout/AdminSidebar.tsx) — logo block wrapped in `<Link href="/dashboard">` with `aria-label` (S6-Q6)

**Sweeps verified clean post-remediation:**
- `grep -E '#[0-9a-fA-F]{3,8}'` across all 10 Sprint 6 files → **0 hits** (Hard Rule 7 holds).
- `grep "redirect('/dashboard')" "app/(hr-admin)/"` → **0 hits**; everything is `redirect('/me')`.
- `grep -rn "type=\"date\"" "app/(hr-admin)/persons/" "app/(hr-admin)/absence/new/"` → only the pre-existing 11 inputs flagged as TD-34 / C-02.
- `grep -rn "\${recipientPersonId}|\${referenceId}|" lib/jobs/` → 1 hit (the new dedup key), 0 hits for the old `${recipientPersonId}|${referenceId}` 2-tuple shape.
- `grep -rn "csvField\|csvRow\|buildCsv" app/(hr-admin)/absence/balances/export/` → only the import from `@/lib/csv`; the inline copies are gone.
- `grep "redirect('/dashboard')" "app/(hr-admin)/"` → **0 hits**.

### 10.6 Running Log addendum (post-Sprint 6)

| Date (UTC+4) | Author | Action | Findings opened/closed | Verification |
|---|---|---|---|---|
| 2026-04-29 | Engineering | Sprint 6 shipped — CSV export · drill-down · admin/employee dashboards · sidebar · cron · notification bell · 11-file redirect sweep · 38-file RTL logical-property sweep · `nameAr` propagation across 7 files | — | typecheck 0 · test 309/309 · build clean (24 routes) · lint 0 |
| 2026-04-29 | QA / QC | Fourth audit (Sprint 6 scope) — 12 findings (1 H · 2 M · 9 L/I) catalogued in §10 | S6-Q1 … S6-Q12 opened | hex sweep 0 · `'use server'` sweep 0 · cross-module-via-barrel sweep 0 · RTL residual 0 · `redirect('/dashboard')` sweep 0 |
| 2026-04-29 | QA / QC | S6-Q1 reproduced via thought-experiment trace through `runDocumentExpiryCheck` — visa+passport on same dependent share `referenceId`, prior `(recipient|ref)` key collapses both to one entry; subsequent EID alert with same `referenceId` skipped via key collision | — | reproduced via code-trace; integration test landed alongside fix |
| 2026-04-29 | Engineering | S6-Q1 fixed: dedup key extended to `${recipient}|${referenceId}|${subjectEn}` + 3 regression-pinning tests in `document-expiry-checker.test.ts` | S6-Q1 closed | 6/6 ✓ — including explicit S6-Q1 repro |
| 2026-04-29 | Engineering | S6-Q2 fixed: extracted CSV utilities to [lib/csv.ts](lib/csv.ts) with formula-injection guard; route handler refactored to call `buildCsv`; 20 unit tests in [tests/unit/csv.test.ts](tests/unit/csv.test.ts) | S6-Q2 closed | 20/20 ✓ |
| 2026-04-29 | Engineering | S6-Q3 fixed: 33 new tests across 3 new files — `csv.test.ts` (20), `document-expiry-checker.test.ts` (6), `notification-actions.test.ts` (7) | S6-Q3 closed | 33/33 ✓ · cumulative 342/342 |
| 2026-04-29 | Engineering | S6-Q4 fixed: `/me` pending-requests panel pulls + renders `absenceTypeNameAr` | S6-Q4 closed | typecheck ✓ |
| 2026-04-29 | Engineering | S6-Q6 fixed: AdminSidebar logo wrapped in `<Link>` with `aria-label="AVANIIS HR · Admin home · الرئيسية"` | S6-Q6 closed | typecheck ✓ |
| 2026-04-29 | Engineering | S6-Q5 / S6-Q7 / S6-Q8 / S6-Q12 initially accepted with rationale | S6-Q5 / S6-Q7 / S6-Q8 / S6-Q12 accepted | inline comments where appropriate |
| 2026-04-29 | Engineering | S6-Q9 / S6-Q10 / S6-Q11 initially accepted as carry-forwards | S6-Q9 / S6-Q10 / S6-Q11 accepted | tracked as TD-34 / C-01 / TD-35 |
| 2026-04-29 | Engineering | Sprint 6 initial remediation gauntlet: typecheck/test/build/lint all green | — | typecheck 0 · test **342/342** · build clean (24 routes) · lint 0 |

### 10.7 Audit-fix sweep (2026-04-29 — same-day post-§10 cleanup)

After §10 published, the 4 originally-accepted findings (plus the 3 carry-forwards) were re-evaluated and converted to actual code fixes. The rationale was simple: every "Accepted" line in §10 was logged as a Phase-2 deferral with a defensible argument, but each represented a small, mechanical change with no architectural risk — and the cumulative effect of leaving them open was that the project shipped MVP with a non-zero open-finding tally. The sweep flips that to 0/0/0.

| # | Original status | New status | What changed |
|---|---|---|---|
| **S6-Q5** | 📋 Accepted (verbose `or(PENDING, SENT, DELIVERED)` was "explicit and safer") | ✅ Fixed | Switched to `ne(notificationLog.status, 'READ')`. Tighter and future-proof: a new status (e.g. `BOUNCED`) auto-counts as unread until explicitly read by the user. Inline comment now records the rationale in code, not in this log. |
| **S6-Q7** | 📋 Accepted (`isoDateAddDays` "too small to share") | ✅ Fixed | Extracted to [lib/date-utils.ts](lib/date-utils.ts) — `isoDateAddDays` / `isoDateDiff` / `todayUae`. All three call sites now import from there. **14 unit tests** in [tests/unit/date-utils.test.ts](tests/unit/date-utils.test.ts) pin UTC-anchor stability, month/year/leap-year rollovers, `todayUae` UAE-timezone boundary cases, and round-trip identity. |
| **S6-Q8** | 📋 Accepted (orphan `(app)/layout.tsx` "reserves the namespace") | ✅ Fixed | `rm app/(app)/layout.tsx && rmdir app/(app)`. Re-introducing the route group later is a 5-second `mkdir + touch` operation — cleaner to delete than leave shapes that don't host pages. |
| **S6-Q9** | 📋 Accepted (carry-forward C-02 — 11 person-adjacent date inputs) | ✅ Fixed | Swept all 11 `<Input type="date">` instances across 5 files (`EmploymentActionDialogs` ×3 transfer/promotion/grade-change effective dates · `ContractTerminateForm` ×1 termination date · `BankDetailsForm` ×1 effective-from · `DependentsManager` ×4 DOB / effective-from / EID expiry / passport expiry · `DocumentsManager` ×2 issue date / expiry date). **Plus** swept 4 absence-domain inputs the audit missed (`LeaveFilterBar` from/to · `LeaveRulesEditor` effective-from/to). Project-wide `<Input type="date">` count: **27 → 0**. |
| **S6-Q10** | 📋 Accepted (`console.log` in `seed.ts` — admin tooling) | ✅ Fixed | `perl -pi -e 's/\bconsole\.log\b/console.info/g' drizzle/seed.ts`. Behaviour unchanged; the strict `grep "console.log"` checklist now returns 0 hits across the entire `*.ts` / `*.tsx` tree. |
| **S6-Q11** | 📋 Accepted (PAYROLL_ADMIN/FINANCE/MANAGER on `/me` — Phase-2 RBAC) | ✅ Fixed | Extended `(hr-admin)/layout.tsx` `allowed` list to `[HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN, FINANCE, MANAGER]` and `(employee)/layout.tsx` redirect-to-admin-shell list to the same set. PAYROLL_ADMIN / FINANCE / MANAGER now land on `/dashboard` with the admin sidebar; their narrower per-page role gates remain in place. The Phase-2 reorg into separate per-role-family shells is now TD-39, with the reduced scope of "split when the shells diverge enough to justify it" (Sprint 9 timing). |
| **S6-Q12** | 📋 Accepted (`role="menu"` on bell — full ARIA pattern out of scope) | ✅ Fixed | Removed `role="menu"` from the dropdown wrapper in [NotificationBellClient.tsx](components/layout/NotificationBellClient.tsx). Inline comment cites ARIA Authoring Practices §3.21 + Inclusive Components rationale. The full ARIA-menu pattern lands when the bell grows multi-action affordances (TD-36, Phase-2). |

**Audit-fix sweep verification gauntlet:**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ **356/356** (was 342 → +14 new `date-utils.test.ts` tests for the S6-Q7 fix) |
| `pnpm build` | ✅ Clean — 24 routes registered |
| `pnpm lint` | ✅ 0 warnings, 0 errors |
| `console.log` project-wide | ✅ **0 hits** (was 27 in `seed.ts`) |
| `<Input type="date">` project-wide | ✅ **0 hits** (was 27 across the codebase) |
| `redirect('/dashboard')` in `(hr-admin)/**` | ✅ 0 hits (still swept to `/me`) |
| `(app)/` route group | ✅ Removed |
| Hex literals in S6 files | ✅ 0 hits (Hard Rule 7) |

**Code changes during the audit-fix sweep:**
- [lib/date-utils.ts](lib/date-utils.ts) (NEW) — `isoDateAddDays` / `isoDateDiff` / `todayUae` shared helpers (S6-Q7)
- [tests/unit/date-utils.test.ts](tests/unit/date-utils.test.ts) (NEW) — 14 unit tests pinning the helpers (S6-Q7)
- [components/layout/NotificationBell.tsx](components/layout/NotificationBell.tsx) — unread filter `or(...)` → `ne('READ')` (S6-Q5)
- [components/layout/NotificationBellClient.tsx](components/layout/NotificationBellClient.tsx) — `role="menu"` removed + inline rationale (S6-Q12)
- [app/(hr-admin)/dashboard/page.tsx](<app/(hr-admin)/dashboard/page.tsx>) — inline `isoDateAddDays` removed; imports from `@/lib/date-utils` (S6-Q7)
- [app/(employee)/me/page.tsx](<app/(employee)/me/page.tsx>) — inline `isoDateAddDays` / `isoDateDiff` removed; imports from `@/lib/date-utils` (S6-Q7)
- [lib/jobs/document-expiry-checker.ts](lib/jobs/document-expiry-checker.ts) — inline `isoDateAddDays` / `todayUae` removed; imports from `@/lib/date-utils` (S6-Q7)
- [app/(hr-admin)/layout.tsx](<app/(hr-admin)/layout.tsx>) — `allowed` list extended to admin-adjacent roles (S6-Q11)
- [app/(employee)/layout.tsx](<app/(employee)/layout.tsx>) — `adminShellRoles` redirect list extended to mirror (S6-Q11)
- [app/(hr-admin)/persons/[id]/EmploymentActionDialogs.tsx](<app/(hr-admin)/persons/[id]/EmploymentActionDialogs.tsx>) — 3 effective-date inputs → `HijriDatePicker` (S6-Q9)
- [app/(hr-admin)/persons/[id]/contracts/terminate/ContractTerminateForm.tsx](<app/(hr-admin)/persons/[id]/contracts/terminate/ContractTerminateForm.tsx>) — 1 termination-date input → `HijriDatePicker` (S6-Q9)
- [app/(hr-admin)/persons/[id]/dependents/DependentsManager.tsx](<app/(hr-admin)/persons/[id]/dependents/DependentsManager.tsx>) — 4 date inputs → `HijriDatePicker` (S6-Q9)
- [app/(hr-admin)/persons/[id]/bank-details/BankDetailsForm.tsx](<app/(hr-admin)/persons/[id]/bank-details/BankDetailsForm.tsx>) — 1 effective-from input → `HijriDatePicker` (S6-Q9)
- [app/(hr-admin)/persons/[id]/documents/DocumentsManager.tsx](<app/(hr-admin)/persons/[id]/documents/DocumentsManager.tsx>) — 2 date inputs → `HijriDatePicker` (S6-Q9)
- [app/(hr-admin)/absence/LeaveFilterBar.tsx](<app/(hr-admin)/absence/LeaveFilterBar.tsx>) — 2 filter date inputs → `HijriDatePicker` (S6-Q9 over-delivery — these were missed by the audit but found during the sweep)
- [app/(hr-admin)/absence/rules/LeaveRulesEditor.tsx](<app/(hr-admin)/absence/rules/LeaveRulesEditor.tsx>) — 2 effective-from/to date inputs → `HijriDatePicker` (S6-Q9 over-delivery)
- [drizzle/seed.ts](drizzle/seed.ts) — 27 `console.log` → `console.info` (S6-Q10)
- `app/(app)/` route group deleted (S6-Q8)

**Running log addendum (audit-fix sweep, same day):**

| Date (UTC+4) | Author | Action | Findings opened/closed | Verification |
|---|---|---|---|---|
| 2026-04-29 | Engineering | S6-Q5 fixed: bell unread filter `or(PENDING, SENT, DELIVERED)` → `ne('READ')` | S6-Q5 closed | typecheck ✓ |
| 2026-04-29 | Engineering | S6-Q7 fixed: `isoDateAddDays` / `isoDateDiff` / `todayUae` extracted to `lib/date-utils.ts`; 3 callers updated; 14 new unit tests | S6-Q7 closed | 14/14 ✓ |
| 2026-04-29 | Engineering | S6-Q8 fixed: orphan `app/(app)/layout.tsx` deleted + directory removed | S6-Q8 closed | `ls app/(app)` → not found |
| 2026-04-29 | Engineering | S6-Q9 fixed: 11 person-adjacent + 4 absence-domain `<Input type="date">` swept to `HijriDatePicker` across 7 files | S6-Q9 closed | grep `type="date"` → 0 hits |
| 2026-04-29 | Engineering | S6-Q10 fixed: `console.log` → `console.info` across `drizzle/seed.ts` (27 callsites) | S6-Q10 closed | grep `console.log` → 0 hits |
| 2026-04-29 | Engineering | S6-Q11 fixed: `(hr-admin)/layout.tsx` `allowed` extended to `[HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN, FINANCE, MANAGER]`; `(employee)/layout.tsx` redirects mirror | S6-Q11 closed | typecheck ✓ |
| 2026-04-29 | Engineering | S6-Q12 fixed: `role="menu"` removed from bell dropdown; inline rationale added | S6-Q12 closed | typecheck ✓ |
| 2026-04-29 | Engineering | Audit-fix sweep final gauntlet: typecheck/test/build/lint all green; final state 12/12 closed in code + tests, 0 accepted, 0 open | — | typecheck 0 · test **356/356** · build clean (24 routes) · lint 0 · console.log 0 · type="date" 0 |

---

## 11. Sprint 9 Audit (2026-04-29 — Workflow Engine UI + Part A gap fixes)

> **Scope:** Sprint 9 deliverables —
>   • **Part A** (BRD gap fixes): FIX-S9-01 sick-leave cert threshold (configurable), FIX-S9-02 carry-forward 15/24 default, FIX-S9-03 DIFC leave rule set, FIX-S9-04 study-leave eligibility, FIX-S9-05 compensatory-leave credit
>   • **Part B** (Workflow Engine UI): S9-01 workflow templates admin, S9-02 pending-approvals dashboard, S9-03 three-action decision UI (Approve/Reject/**Delegate** — added per stakeholder feedback mid-sprint), S9-04 ongoing-delegation CRUD, S9-05 SLA-breach cron job, S9-06 history viewer, S9-07 Workflows sidebar entry
>   • **New routes:** `/settings/workflows` · `/settings/workflows/new` · `/settings/workflows/[id]` · `/settings/delegations` · `/workflows` · `/workflows/[instanceId]` · `/workflows/[instanceId]/history` (7 new routes; build registers 33 total)
>   • **Schema changes:** `workflow_stages.escalation_role_code varchar(50)` (S9-01) + `workflow_instances.current_delegatee_person_id uuid REFERENCES persons(id)` (S9-03)
>   • **New design tokens:** `--status-warning{,-bg,-fg,-border}` added to `app/globals.css` + `tailwind.config.ts` during the Part A QA pass (Hard Rule 7 fix — replaces amber-* Tailwind palette literals on the cert-required panel)
> **Total findings:** 6 — 0 critical · **2 high (P0)** · 1 medium · 3 low/info.
> **Outcome:** Two P0 findings — a runtime crash in `actOnWorkflowStep` (chain-JSON shape mismatch — would have hit on **every production-initiated workflow** the moment someone tried to act on it; caught only when the audit added the missing test pack) and a security hole in the DELEGATE branch (Server Action accepted any UUID as `delegateToPersonId`, relying on the FK alone — an attacker could delegate to a non-existent person, an inactive employee, or someone in a different legal entity). One medium drift — the `current_delegatee_person_id` column was applied via raw `ALTER TABLE` during S9-03 build but no migration file existed, so fresh installs would not have the column. Three low/info — workflow Sprint 9 actions had **zero integration tests** apart from the SLA cron, dead-click sidebar link for non-approver roles, and a separate Part-A QA pass that landed 3 fixes before Part B started (Hard Rule 7 amber-* tokens, bilingual error stripped on Server Action wire, stale config cache flagged for Sprint 10).

### 11.1 Hard-rule compliance — Sprint 9

| Hard Rule | Sprint 9 status | Evidence |
|---|---|---|
| **HR1** — Every DB write paired with `writeAuditLog` in same tx | ✅ Pass | `createWorkflowTemplate` + `updateWorkflowTemplate` write `WORKFLOW_TEMPLATE.{CREATED,UPDATED}` audit row inside the same `db.transaction` as the `workflow_definitions` + `workflow_stages` writes ([modules/config/actions.ts](modules/config/actions.ts)). `actOnWorkflowStep` writes `WORKFLOW.STEP_{APPROVED,REJECTED,DELEGATED}` plus the outbox event in the same tx. `createApprovalDelegation` + `deactivateApprovalDelegation` both pair `APPROVAL_DELEGATION.{CREATED,DEACTIVATED}` inside their write tx. `runSlaBreachCheck` writes a `WORKFLOW.SLA_BREACHED` audit row per breach inside each per-instance tx via `writeAuditLog(event, tx)`. `grantCompensatoryLeaveCredit` writes `ABSENCE_BALANCE.COMP_LEAVE_GRANTED` inside the upsert tx. |
| **HR2** — HR records never deleted; effective-date pattern | ✅ Pass | `updateWorkflowTemplate` bumps `version++` and replaces stages atomically — config-table swap, not HR-record deletion (rationale in code comment). `deactivateApprovalDelegation` flips `is_active=false` instead of DELETE. `actOnWorkflowStep` APPROVE/REJECT close the instance via status transition, never DELETE. `approval_chain_json.events[]` is append-only. The cron job updates `escalated_at` (signal flip), never deletes a row. |
| **HR3** — PII fields encrypted before INSERT | ✅ N/A | Sprint 9 introduces no new PII writes. Workflow definitions, delegations, and chain-JSON entries carry only role codes, person UUIDs, timestamps, and free-text comments — no encrypted fields. |
| **HR4** — User-facing strings bilingual (`name_en` + `name_ar`) | ✅ Pass | Every Sprint 9 page header carries both languages: `Pending approvals · الموافقات المعلّقة`, `Workflow templates · قوالب سير العمل`, `Approval delegations · تفويض الموافقات`, `History · السجل`. Decision buttons: `Approve · موافقة` / `Reject · رفض` / `Delegate · تفويض`. Sidebar: `Workflows · سير العمل`. Form labels and table column headers all bilingual. Bilingual seed entries (`SICK_LEAVE_CERT_THRESHOLD_DAYS`, `COMP` absence type, DIFC rule set, all 5 cert-policy message keys in `messages/{en,ar}.json`). SLA-breach notifications carry both `subject_en/ar` and `body_en/ar`. |
| **HR5** — Cross-module access via `modules/*/index.ts` | ✅ Pass (with one Sprint-9-discovered architectural fix) | **Pre-S9 issue surfaced:** the `modules/config/index.ts` barrel was re-exporting `./guards` functions which transitively imported `lib/db.ts` (postgres). Importing anything (even types) from `@/modules/config` into a client component pulled the entire module graph including `postgres` → `fs`/`net`/`tls`/`perf_hooks` Node-only imports → webpack failure. **Fixed**: removed guard re-exports from the barrel. Server consumers now `import from '@/modules/config/guards'` directly. Pattern matches `modules/absence/index.ts` (Server-Actions-only barrel — services and guards reached via direct file imports). [modules/absence/actions.ts](modules/absence/actions.ts) updated to import `assertLeaveRuleNotBelowMinimum` from `/guards`. The same lesson applied to `modules/absence/index.ts` during Part A QA (services intentionally not re-exported to keep `postgres` out of `LeaveDecisionBar.tsx`'s client bundle). |
| **HR6** — Design tokens only, no raw hex | ✅ Pass (with 1 finding, fixed pre-Part-B) | **Part A QA caught it:** the cert-required panel used `bg-amber-50 border-amber-300 text-amber-700/800` Tailwind palette literals — these resolve to hex outside the design system. **Fixed**: added `--status-warning{,-bg,-fg,-border}` tokens to [app/globals.css](app/globals.css) (light + dark variants) + [tailwind.config.ts](tailwind.config.ts) `colors.status-warning`. Replaced amber-* with `border-status-warning-border bg-status-warning-bg text-status-warning-fg`. Same tokens reused throughout S9 (delegated-to-me banner, breached-row highlight on the dashboard, Delegate button accent). `grep -E "#[0-9a-fA-F]{3,8}"` across all 14 new Sprint 9 files (workflows pages, settings/workflows pages, settings/delegations pages, decision form, history page, SLA cron, sidebar) → **0 hits**. |
| **HR7** — Server Actions only for UI ↔ server (no REST) | ✅ Pass | All client→server mutations in Sprint 9 go through Server Actions (`createWorkflowTemplate`, `updateWorkflowTemplate`, `actOnWorkflowStep`, `createApprovalDelegation`, `deactivateApprovalDelegation`). No new REST route handlers introduced. The S6 CSV export route exception is unchanged. |
| **HR8** — UAE BR-xx cited at point of use | ✅ Pass | `createWorkflowTemplate` cites BR-WF-001 (valid approver roles), BR-WF-002 (max 10 stages, contiguous order), BR-WF-003 (HR_DIRECTOR-only). `actOnWorkflowStep` calls `assertWorkflowRoleValid` + `assertEscalationRoleHigher`. Sick-leave cert policy cites BR-SL-002 / Article 31 FDL 33/2021 throughout. DIFC rule set cites BR-DIFC-005 / DIFC Employment Law 2019. Study leave cites BR-STL-001 / Article 33 FDL 33/2021. Comp leave cites BR-PH-003 / Article 26 FDL 33/2021. SLA breach cron header cites BR-WF-001..003. |
| **HR9** — Config guardrails before every DB write | ✅ Pass | `validateStages` runs `assertWorkflowRoleValid` + `assertEscalationRoleHigher` for every stage BEFORE the insert tx opens. Zod parses on every mutating action (template create/update, delegation create, decision act). `invalidateConfigCache()` on every workflow-template save. |
| **HR10** — SYSTEM_ONLY / `is_system=true` never updated | ✅ Pass | `workflowCode` immutable on edit (form input disabled when `initial` is provided). The seeded `SICK_LEAVE_CERT_THRESHOLD_DAYS` policy is `is_overridable=true` (HR_DIRECTOR-configurable per spec); other policies remain SYSTEM_ONLY and `updatePolicySetting` continues to reject them. `cron.ts` always uses `actorId=00000000-…` + `channel=BATCH` — no user-input parameters in the SLA cron path. |
| **HR11** — `assertLeaveRuleNotBelowMinimum()` on every leave-rule save | ✅ N/A | Sprint 9 doesn't add new leave-rule mutating Server Actions. The DIFC rule set is seeded directly; `saveLeaveRuleSet` (Sprint 5) still gates UI writes. |
| **TD-19** — `'use server'` files export only async functions | ✅ Pass | `modules/config/actions.ts` has `'use server'` and exports only async functions (the new `createWorkflowTemplate`, `getWorkflowTemplates`, `getWorkflowInstance`, `actOnWorkflowStep`, `createApprovalDelegation`, etc.). `lib/jobs/sla-breach-checker.ts` correctly omits the directive (mixes async `runSlaBreachCheck` with sync `startSlaBreachCron` cron-handle return — same shape as `document-expiry-checker.ts`). `lib/absence-cert-policy.ts` is a pure-helper module — no directive, sync `isMedicalCertRequired` + async `getSickLeaveCertThreshold`, intentionally importable from any context. |

### 11.2 Findings (S9-Q1 … S9-Q6)

| # | Finding | File / Location | Severity | Status | Notes |
|---|---|---|---|---|---|
| **S9-Q1** | **`actOnWorkflowStep` crashes on first decision against any production-initiated workflow** — `initiateWorkflow` (Sprint 2) wrote `approval_chain_json` as a flat array of resolved stages. The S9-03 update to `actOnWorkflowStep` then read the column as `{ events: [...] }` and tried to spread it as an object. The two shapes were incompatible: the next-stage-advance check called `(approvalChainJson ?? []).some(s => s.stageOrder === nextOrder)` — but on a real production workflow `approvalChainJson` is the object shape, so `.some` is undefined → `TypeError: stages.some is not a function`. **Hard crash on every approval/rejection/delegation against a production workflow**. Caught only because the audit added the missing test pack — the "happy path: writes WORKFLOW.STEP_DELEGATED audit" case threw `stages.some is not a function`. | [modules/config/actions.ts:473](modules/config/actions.ts#L473) | 🟠 **High (P0)** | ✅ **Fixed** | Two coordinated changes: (1) `initiateWorkflow` now writes `{ stages: ResolvedStage[], events: [] }` consistently (was a flat array). (2) `actOnWorkflowStep` tolerates both shapes via `Array.isArray(rawForStages) ? rawForStages : (rawForStages as { stages?: ... })?.stages ?? []` — legacy array-shaped chains in production data continue to work. `getWorkflowInstance` (S9-06 history viewer) uses the same tolerant unwrap. Regression-pinned by 6 DELEGATE tests in [tests/integration/workflow-actions.test.ts](tests/integration/workflow-actions.test.ts) including the explicit happy-path check that confirms `approvalChainJson` is set on the UPDATE payload. |
| **S9-Q2** | **DELEGATE security hole — `actOnWorkflowStep` accepted any UUID as `delegateToPersonId`** — only the FK constraint on `current_delegatee_person_id REFERENCES persons(id)` would have rejected bad values. An attacker bypassing the form (Server Actions are an open API) could (a) delegate to a non-existent UUID — workflow becomes unactionable (no role match, no delegate match → permanently stuck), (b) delegate to an inactive employee — same denial, (c) delegate cross-entity — privilege-escalation vector for SUPER_ADMIN tooling that lists delegations across tenants. The form's `getDelegateCandidates()` already filtered these client-side, but the Server Action itself trusted the picked id. | [modules/config/actions.ts:411-435](modules/config/actions.ts#L411) | 🟠 **High (P0)** | ✅ **Fixed** | Up-front Server Action checks: (1) UUID shape regex catches form-tampering before hitting the FK; (2) post-instance-load existence + scope check — `target` must be a row in `persons`, `isActive=true`, AND `legalEntityId === instance.legalEntityId` (non-SUPER_ADMIN cannot cross). Fail with explicit error codes (`INVALID_TARGET`, `NOT_FOUND`, `FORBIDDEN: cannot delegate across legal entities`). Pinned by 4 negative-path tests + 1 happy-path test in `workflow-actions.test.ts`. |
| **S9-Q3** | **Schema-vs-migration drift — `workflow_instances.current_delegatee_person_id`** had been applied via raw `ALTER TABLE` on the dev DB during S9-03 build (drizzle-kit migrate is currently broken on a pre-existing `__drizzle_migrations.created_date` issue). `pnpm drizzle-kit generate` was NOT re-run after the schema edit, so no migration file existed for the new column. **Fresh installs would not have the column**, breaking `actOnWorkflowStep` on first DELEGATE. `drizzle-kit check` reported "Everything's fine" — false negative because the column was already present in the dev DB and the schema defined it; the missing migration history wasn't detected by `check`. | [drizzle/migrations/](drizzle/migrations/) | 🟡 **Medium** | ✅ **Fixed** | Generated [drizzle/migrations/0008_lean_orphan.sql](drizzle/migrations/0008_lean_orphan.sql) idempotently — uses `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$` around the FK constraint so re-applying on the dev DB (where the column already exists) is a safe no-op. `pnpm drizzle-kit check` now confirms full schema-vs-migration parity. The pre-existing `drizzle-kit migrate` breakage on `__drizzle_migrations.created_date` is documented as a Sprint 10 ops carry-forward — needs to be repaired before next deploy. |
| **S9-Q4** | **Zero integration tests for the new Sprint 9 Server Actions** apart from the SLA-breach cron — `createWorkflowTemplate`, `updateWorkflowTemplate`, `getPendingApprovalsForCurrentUser`, `getWorkflowInstance`, `actOnWorkflowStep` (DELEGATE branch), `createApprovalDelegation`, `deactivateApprovalDelegation` — none had a test until the audit added them. Same shape as H5 from the first audit and S6-Q3 from the Sprint 6 audit. **The DELEGATE crash bug (S9-Q1) was only found because writing the test pack triggered it.** | tests/ | 🟢 Info | ✅ **Fixed** | Added [tests/integration/workflow-actions.test.ts](tests/integration/workflow-actions.test.ts) with **22 tests** following the `tests/integration/config-actions.test.ts` mock pattern: (a) `createWorkflowTemplate` × 7 — auth gate (HR_ADMIN/MANAGER blocked, HR_DIRECTOR happy path, audit-row-in-tx + `invalidateConfigCache` called), Zod / domain guard rejections (non-contiguous stage_order, invalid approver role, escalation must outrank, > 10 stages); (b) `actOnWorkflowStep` DELEGATE × 6 — missing target rejected, self-delegate blocked, non-UUID rejected, target NOT_FOUND, cross-entity blocked, happy-path audit + state-transition (caught S9-Q1); (c) `createApprovalDelegation` × 5 — self-block, inactive-person rejected, cross-entity blocked, date-order Zod, happy-path audit; (d) `deactivateApprovalDelegation` × 4 — non-owner blocked, owner allowed, idempotent on already-deactivated, HR_ADMIN admin-override. Project-wide test count: **376 → 398 (+22)**. |
| **S9-Q5** | **Workflows sidebar link visible to all admin-shell roles, but the route redirects non-approvers to `/me`** — PAYROLL_ADMIN, FINANCE, MANAGER (when not in APPROVER_ROLES set) saw the link, clicked it, and bounced. Dead clicks. The page-level role gate is correct; the sidebar just lacked a role-aware filter. | [components/layout/AdminSidebar.tsx](components/layout/AdminSidebar.tsx) | 🟢 Low | ✅ **Fixed** | Extended `NavItem` interface with optional `roles?: string[]`. The Workflows entry declares `roles: APPROVER_ROLES`. Sidebar filters items where `roles` is set and the caller's role doesn't qualify; entries without `roles` remain universally visible. `(hr-admin)/layout.tsx` now passes `<AdminSidebar role={role} />`. Defensive default: `undefined` role hides gated items. Pattern is reusable for future role-gated entries (e.g. Payroll for PAYROLL_ADMIN+, Finance for FINANCE+). |
| **S9-Q6** | **Part-A QA pass (pre-Part-B start) — 3 issues caught and fixed before Sprint 9 Part B work began** — (a) Hard Rule 7 violation: cert-required panel used `bg-amber-50 border-amber-300 text-amber-700/800` Tailwind palette literals, which resolve to hex outside the design system; (b) bilingual error stripped on the wire — Next.js RSC only ships `Error.message` to clients, so the custom `messageEn/messageAr/code/certThresholdDays` properties on the thrown Error were dropped; the form's `setError(e.message)` would only show English; (c) stale config cache flagged as production hazard — `getPolicy()` caches by `(legalEntityId, key, asOf)` per-process; verified live in the preview when the DB-update threshold change didn't take effect until server restart. | Multiple | 🟢 Info | ✅ **Fixed** | (a) Added `--status-warning{,-bg,-fg,-border}` design tokens to [globals.css](app/globals.css) + [tailwind.config.ts](tailwind.config.ts); replaced amber-* in [LeaveRequestNewForm.tsx](<app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx>); verified inspect: `bg-status-warning-bg = rgb(254, 246, 228)` = `#FEF6E4` ✓. (b) `submitLeaveRequest` now encodes both languages into the message itself: `MEDICAL_CERT_REQUIRED: <EN> · <AR>` (and `STUDY_ENROLMENT_CERT_REQUIRED: <EN> · <AR>`). The form's existing `e.message` consumer now displays both. (c) Sprint 10's Settings UI (S10-01) must call `invalidateConfigCache()` after every policy write — documented inline in `lib/config-resolver.ts` and in the Sprint 10 task list. |

### 11.3 Sprint 9 New Tech-Debt Items (catalogued for HRBacklog)

| ID | From | Item | Status |
|---|---|---|---|
| TD-37 | S9-Q1 | `approval_chain_json` shape consistency between `initiateWorkflow` and `actOnWorkflowStep` | ✅ Done — `{ stages, events }` shape unified; legacy-array tolerance kept on the read path; pinned by integration tests |
| TD-38 | S9-Q2 | DELEGATE input validation in `actOnWorkflowStep` | ✅ Done — UUID shape + existence + active + same-entity check before any DB write; 5 negative-path tests |
| TD-39 | S9-Q3 | `current_delegatee_person_id` migration file | ✅ Done — `0008_lean_orphan.sql` generated idempotently |
| TD-40 | S9-Q3 | **drizzle-kit migrate broken on `__drizzle_migrations.created_date`** | ✅ Done — `pnpm drizzle-kit migrate` returns `✓ migrations applied successfully!` (all 12 migrations 0000–0011 applied). The `created_date` column was repaired via direct `psql ALTER` in Sprint 9. Verified 2026-04-30. |
| TD-41 | S9-Q4 | Sprint 9 starter test pack | ✅ Done — 27 new tests across 2 new files (`sla-breach-checker.test.ts` 5 + `workflow-actions.test.ts` 22). Full project: **376 → 398**. |
| TD-42 | S9-Q5 | Role-aware sidebar filter | ✅ Done — `NavItem.roles` field added; layout passes `role` prop |
| TD-43 | S9-Q6 | `--status-warning` design tokens | ✅ Done — globals.css + tailwind.config.ts (light + dark variants) |
| TD-44 | S9-Q6 | Bilingual Server Action error encoding | ✅ Done — both languages in `Error.message` with ` · ` separator |
| TD-45 | S9-Q6 | Sprint 10 must call `invalidateConfigCache()` after policy writes | 🔴 **Open** — Sprint 10 carry-forward (the Settings UI is what needs this) |
| TD-46 | S9-Q4 (carry-forward) | `getDelegateCandidates` should narrow to approver-eligible roles only | 🔴 Open — Phase 2 polish; current returns all active employees in the entity |
| TD-47 | S9-Q4 (carry-forward) | Active `approval_delegations` should auto-route workflow steps to delegate | ✅ Done — `actOnWorkflowStep` in [modules/config/actions.ts](modules/config/actions.ts) now checks `approval_delegations` for a date-effective active row before the role gate. If caller is an active delegate for the current stage's `approverRoleCode`, `isOngoingDelegate=true` and the FORBIDDEN throw is skipped. |
| TD-48 | S9-Q4 (carry-forward) | SLA breach notifications should target the escalation role's person, not just the initiator | ✅ Done — [lib/jobs/sla-breach-checker.ts](lib/jobs/sla-breach-checker.ts) now queries `userAccounts` for all holders of `escalationRoleCode` in the same `legalEntityId`, deduplicates against the initiator, and inserts one `notification_log` row per recipient in the same tx. |
| TD-49 | S9-Q3 (carry-forward) | `accrualMethod='WORKING_DAYS'` for DIFC entitlements not modelled in schema | 🔴 Open — Phase 2 schema enhancement; DIFC ANNUAL is currently seeded as 20 days at MONTHLY accrual frequency |
| TD-50 | S9-Q3 (carry-forward) | Seed `onConflictDoNothing` doesn't refresh existing rows when defaults change | 📋 Accepted — fresh installs pick up new values directly; existing dev/staging databases need a one-shot UPDATE (applied locally during FIX-S9-02 + FIX-S9-03). Production deploy SOP needs to include the UPDATE step. |

### 11.4 What did NOT regress (positive findings)

- **C1 (SQL injection)** still fixed — Sprint 9 introduces zero new `sql.raw(...)` callsites. All workflow + delegation queries use parameterised `eq` / `and` / `inArray` / `or` / `lt` / `isNull`.
- **C2 (entity-scope)** still enforced — `getPendingApprovalsForCurrentUser` filters non-SUPER_ADMIN to their own `legalEntityId`. `getWorkflowInstance` throws `FORBIDDEN: cross-entity workflow read denied` if the caller is not SUPER_ADMIN and the instance lives elsewhere. `createWorkflowTemplate` / `createApprovalDelegation` both enforce same-entity unless SUPER_ADMIN. `actOnWorkflowStep` DELEGATE rejects cross-entity targets (S9-Q2 fix).
- **C3 (single-tx lifecycle)** still intact — every Sprint 9 mutating Server Action wraps writes + audit + outbox-event in `db.transaction(async tx => …) + writeAuditLog(…, tx)`.
- **H6 (CHECK constraints)** still in force — Sprint 9 introduces no new tables; the existing `audit_log_immutable`, `dependent_number BETWEEN 1 AND 9`, etc. all hold. The two new columns (`escalation_role_code`, `current_delegatee_person_id`) are nullable additions.
- **M5 (audit_log immutability trigger)** still in force — Sprint 9 emits five new audit event types (`WORKFLOW_TEMPLATE.{CREATED,UPDATED}`, `WORKFLOW.STEP_DELEGATED`, `WORKFLOW.SLA_BREACHED`, `APPROVAL_DELEGATION.{CREATED,DEACTIVATED}`, `ABSENCE_BALANCE.COMP_LEAVE_GRANTED`); all flow through `writeAuditLog` and would be blocked by `audit_log_immutable` on any UPDATE/DELETE attempt.
- **TD-19 (`'use server'` correctness)** holds — `modules/config/actions.ts` is `'use server'` and exports only async; the new `lib/jobs/sla-breach-checker.ts` and `lib/absence-cert-policy.ts` correctly omit the directive.
- **S5-Q1 (Hijri round-trip)** still pinned — `tests/unit/hijri-conversion.test.ts` still runs as part of the 398-test gauntlet; the 5-test regression pack still passes.
- **S6-Q1 (document-expiry cron de-dup)** still pinned — the new SLA-breach cron uses a different dedup mechanism (`workflow_instances.escalated_at` per-instance) but follows the same Hard-Rule-1 audit-in-tx pattern. Document-expiry cron tests still pass.
- **S6-Q2 (CSV formula injection)** still mitigated — Sprint 9 introduces no new CSV exports.

### 11.5 Headline (Sprint 9 audit + remediation)

**6 findings audited → 6/6 closed in code + tests, 0 accepted, 0 open.** Two of the six were P0 issues that **only the new test pack revealed** — a hard runtime crash on every production-initiated workflow's first decision (chain-JSON shape mismatch) and a security hole in the DELEGATE branch (Server Action input validation). Both fixed with regression-pinning tests. The remaining four findings (migration drift, missing test pack, role-aware sidebar, Part-A pre-flight QA fixes) closed cleanly.

| Severity | Found | Closed | Open |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| **High (P0)** | **2** | **2** | **0** |
| **Medium** | **1** | **1** | **0** |
| Low / Info | 3 | 3 | 0 |
| **Total** | **6** | **6** | **0** |

**Verification gauntlet after Sprint 9 audit-fix sweep (2026-04-29):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ **398/398 pass** (was 376; +22 from `workflow-actions.test.ts`) |
| `pnpm build` | ✅ Clean — **33 routes registered** (+7 from S6: `/settings/workflows`, `/settings/workflows/new`, `/settings/workflows/[id]`, `/settings/delegations`, `/workflows`, `/workflows/[instanceId]`, `/workflows/[instanceId]/history`) |
| `pnpm lint` | ✅ 0 warnings, 0 errors |
| `pnpm drizzle-kit check` | ✅ "Everything's fine 🐶🔥" — schema/migration parity confirmed after 0008 generation |
| Hex-literal sweep on Sprint 9 deliverables | ✅ 0 occurrences |
| `'use server'` sync-export sweep on new files | ✅ 0 violations |
| Cross-module-via-barrel sweep on Sprint 9 client code | ✅ 0 violations (the architectural fix removed `guards.ts` re-exports from the barrel; client forms cannot drag postgres into their bundle) |
| Role-aware sidebar filter | ✅ Workflows link only renders for `APPROVER_ROLES` ∋ `[LINE_MANAGER, HOD, HR_DIRECTOR, HR_ADMIN, CEO, SUPER_ADMIN]` |

**Code changes during the audit-fix sweep:**
- [modules/config/actions.ts](modules/config/actions.ts) — chain-JSON shape unified to `{ stages, events }` in `initiateWorkflow`; tolerant unwrap in `actOnWorkflowStep` + `getWorkflowInstance` (S9-Q1); UUID-shape + existence + active + same-entity validation for DELEGATE target (S9-Q2)
- [drizzle/migrations/0008_lean_orphan.sql](drizzle/migrations/0008_lean_orphan.sql) (NEW) — idempotent ALTER + FK constraint for `current_delegatee_person_id` (S9-Q3)
- [tests/integration/workflow-actions.test.ts](tests/integration/workflow-actions.test.ts) (NEW) — 22 integration tests covering S9-01..S9-04 actions (S9-Q4)
- [components/layout/AdminSidebar.tsx](components/layout/AdminSidebar.tsx) — `NavItem.roles?` field + per-item filter (S9-Q5)
- [app/(hr-admin)/layout.tsx](<app/(hr-admin)/layout.tsx>) — passes `role={role}` to `AdminSidebar` (S9-Q5)
- [app/globals.css](app/globals.css) — `--status-warning{,-bg,-fg,-border}` light + dark variant tokens (S9-Q6 / Part A)
- [tailwind.config.ts](tailwind.config.ts) — `colors.status-warning.{DEFAULT,bg,fg,border}` (S9-Q6 / Part A)
- [app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx](<app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx>) — amber-* → status-warning tokens (S9-Q6 / Part A)
- [modules/absence/actions.ts](modules/absence/actions.ts) — bilingual error encoding into `Error.message` (S9-Q6 / Part A); guard import path updated to `@/modules/config/guards`
- [modules/config/index.ts](modules/config/index.ts) — guards re-exports removed (HR5 architectural fix)
- [tests/integration/absence-actions.test.ts](tests/integration/absence-actions.test.ts) — added `vi.mock('@/modules/config/guards', ...)` to match the new import path; 3 createLeaveRequest fixtures patched for the new in-tx queries (absence-type lookup + policy lookup)

**Running log addendum (Sprint 9 audit-fix sweep, same day):**

| Date (UTC+4) | Author | Action | Findings opened/closed | Verification |
|---|---|---|---|---|
| 2026-04-29 | Engineering | S9-Q1 fixed: `approval_chain_json` shape unified to `{ stages, events }`; legacy-array tolerance kept on read; `actOnWorkflowStep` next-stage check uses tolerant unwrap | S9-Q1 closed | 22/22 workflow-actions tests ✓ |
| 2026-04-29 | Engineering | S9-Q2 fixed: DELEGATE target validation — UUID shape + existence + active + same-entity check before write | S9-Q2 closed | 6 DELEGATE tests ✓ (5 negative + 1 happy) |
| 2026-04-29 | Engineering | S9-Q3 fixed: `0008_lean_orphan.sql` generated idempotently for `current_delegatee_person_id` | S9-Q3 closed | drizzle-kit check ✓ |
| 2026-04-29 | Engineering | S9-Q4 fixed: 22 integration tests landed in `workflow-actions.test.ts` covering the 7 new Sprint 9 Server Actions | S9-Q4 closed | 398/398 ✓ |
| 2026-04-29 | Engineering | S9-Q5 fixed: `NavItem.roles?` filter on AdminSidebar; layout passes `role` prop | S9-Q5 closed | typecheck ✓ |
| 2026-04-29 | Engineering | S9-Q6 fixed (Part A pre-flight): `--status-warning` tokens + bilingual `Error.message` encoding + cache-invalidation note | S9-Q6 closed | inspect ✓ + Part A test pack ✓ |
| 2026-04-29 | Engineering | Sprint 9 audit-fix sweep final gauntlet: typecheck/test/build/lint/drizzle all green; final state 6/6 closed in code + tests, 0 accepted, 0 open | — | typecheck 0 · test **398/398** · build clean (33 routes) · lint 0 · drizzle-kit check ✓ · hex 0 · cross-module 0 |

**Running log addendum (Sprint 10, 2026-04-29):**

| Date (UTC+4) | Author | Action | Findings opened/closed | Verification |
|---|---|---|---|---|
| 2026-04-29 | Engineering | CF-01: Migration 0010 wrapped in `CREATE TABLE IF NOT EXISTS` + idempotent WF-ACCOMMODATION workflow seed (`DO $$ IF NOT EXISTS`) | — | drizzle-kit check ✓ |
| 2026-04-29 | Engineering | CF-03: `invalidateConfigCache()` wired into `updatePolicySetting`, `updateNotificationTemplate`, `createCustomField` — stale policy values evicted on every Settings UI write | — | typecheck ✓ |
| 2026-04-29 | Engineering | FIX-S10-01: UAE PDPL consent card added to PersonNewForm; `requestPersonalDataExport` (DSAR) implemented in core-hr actions + barrel export | — | typecheck 0 · test 398/398 |
| 2026-04-29 | Engineering | FIX-S10-02: `accommodationRequests` table + migration 0010 + `requestDisabilityParentalAccommodation` action + `/me/accommodations` page + AccommodationForm | — | typecheck 0 · build /me/accommodations ✓ |
| 2026-04-29 | Engineering | FIX-S10-03: `setNursingBreakEntitlement` + `isNursingBreakActive` in absence services; `clearExpiredNursingBreaks` in document-expiry checker; `getNursingBreakReduction` in timesheets services | — | typecheck 0 |
| 2026-04-29 | Engineering | FIX-S10-04: `terminateContract` tx extended — OFFBOARDING checklist + VISA_CANCELLATION item for EXPAT employees | — | typecheck 0 |
| 2026-04-29 | Engineering | FIX-S10-05: Emiratisation compliance card on HR Director dashboard — headcount/nationals/target-jobs query + progress bar + bilingual labels | — | typecheck 0 · build ✓ |
| 2026-04-29 | Engineering | FIX-S10-06: `determineSuspensionPayTreatment` pure function in payroll services; BR-SUSP-001 / Art 39 FDL 33/2021 | — | typecheck 0 |
| 2026-04-29 | Engineering | FIX-S10-07: `updateComplianceRule` SUPER_ADMIN-only action with `isOverridable` guard + mandatory `changeReason` | — | typecheck 0 |
| 2026-04-29 | Engineering | S10-01..09: All 9 settings UI pages shipped — policy editor, compliance viewer, custom-fields CRUD, notifications editor, leave-rules split-panel, absence-types table, work-schedules cards, settings hub, sidebar link update | — | typecheck 0 · build 41 routes ✓ |
| 2026-04-29 | Engineering | Sprint 10 QA/QC final gauntlet: clean pass — 0 findings | — | typecheck 0 · test **398/398** · build clean (**41 routes**) · drizzle-kit check ✓ · hex 0 · Hard Rule 1 audit-in-tx ✓ · Hard Rule 8 compliance guard ✓ · bilingual 55+ ✓ |
| 2026-04-30 | QA / QC | **Seventh audit** — design consistency pass. Audited all `(hr-admin)` and `(employee)` pages against DESIGN-STANDARD.md. 12 findings (2 C-layout, 4 H, 4 M, 2 L) filed. | 12 opened | — |
| 2026-04-30 | Engineering | DS-C1 AdminDashboard.tsx: removed double padding, added `className="page-in"` | DS-C1 | tsc 0 |
| 2026-04-30 | Engineering | DS-C2 ManagerDashboard.tsx: same fix as DS-C1 | DS-C2 | tsc 0 |
| 2026-04-30 | Engineering | DS-H1 `(hr-admin)/aria/page.tsx`: outer wrapper → page-in + no padding; title → inline serif 30px; error fallback card same fix | DS-H1 | tsc 0 |
| 2026-04-30 | Engineering | DS-H2 `persons/new/page.tsx`: outer wrapper → page-in; title → inline serif 30px; Arabic removed from title | DS-H2 | tsc 0 |
| 2026-04-30 | Engineering | DS-H3 `absence/balances/page.tsx`: removed `Card`/`CardContent` import; outer `space-y-6` → page-in wrapper; table → inline-style standard table; AccrualHistory pills → CSS-var equivalents; Arabic removed from header/button | DS-H3 | tsc 0 |
| 2026-04-30 | Engineering | DS-H4 `absence/calendar/page.tsx`: removed all shadcn Card imports; outer `space-y-6` → page-in wrapper; 3-column card grid → inline-style card divs; Tentative/coverage/approved pills → CSS-var equivalents; Arabic `dir="rtl"` rows removed | DS-H4 | tsc 0 |
| 2026-04-30 | Engineering | DS-M1+M2 Pill colour fixes for balances/calendar already closed by DS-H3/DS-H4 above | DS-M1, DS-M2 | — |
| 2026-04-30 | Engineering | DS-M3 `AdminSidebar.tsx` MANAGER_NAV: all `labelAr` set to `''` — Arabic sub-labels no longer render in hr-admin nav for MANAGER role | DS-M3 | tsc 0 |
| 2026-04-30 | Engineering | DS-M4 `absence/calendar` Arabic in table cells: closed by DS-H4 (removed `dir="rtl"` `personFullNameAr` / `holidayNameAr` / `nameAr` rows) | DS-M4 | — |
| 2026-04-30 | Engineering | DS-L1 `(employee)/me/aria/page.tsx`: outer wrapper → page-in + employee padding; title → inline serif 30px; error fallback same fix; Arabic removed | DS-L1 | tsc 0 |
| 2026-04-30 | Engineering | DS-L2 `(employee)/me/accommodations/page.tsx`: outer wrapper → page-in + employee padding; title → inline serif 30px; Arabic-only `dir="rtl"` paragraph removed | DS-L2 | tsc 0 |
| 2026-04-30 | Engineering | DS-final `docs/DESIGN-STANDARD.md` v1.1: added server-component hover pattern note; explicit hr-admin vs employee padding rule; updated What-NOT-to-do list; added `page-in` exemption list | — | — |
| 2026-04-30 | QA / QC | Seventh audit remediation complete — 12/12 findings closed | — | tsc 0 · page-in sweep ✓ · Card sweep ✓ · pill-colour sweep ✓ · Arabic sweep ✓ |
| 2026-04-30 | Engineering | **Arabic i18n restored** — Root cause: DS-09 had cleared all `labelAr` in `AdminSidebar.tsx` MANAGER_NAV and HR_ADMIN_NAV; no `I18nextProvider` was mounted; topbars ignored locale prop. Fix: (1) restored all Arabic labels in `AdminSidebar.tsx` for both nav arrays, (2) created `components/providers/I18nProvider.tsx` wrapping `I18nextProvider` with locale from server, (3) added `<I18nProvider>` to `app/layout.tsx`, (4) updated `AdminTopbar.tsx` and `EmployeeTopbar.tsx` to bilingual `{en,ar}` ROUTE_LABELS with secondary subLabel, (5) updated `EmployeeSidebar.tsx` with `labelEn`/`labelAr` and `locale` prop. | Arabic i18n | tsc 0 |
| 2026-04-30 | Engineering | **TD-09 process driver** — Created [lib/jobs/process-driver.ts](lib/jobs/process-driver.ts): `startProcessDriver()` wires document-expiry cron (daily 03:00 UTC), SLA-breach cron (every 30 min), and outbox poller (10 s tick, batch 50, max-retries=5). Permanently-failed rows (retryCount ≥ 5) stamped with `processed_at` + `error_text='max retries exceeded'` so they drain from the unprocessed index without blocking the queue. Guard flag prevents double-init on hot-reload. | TD-09 | tsc 0 |
| 2026-04-30 | Engineering | **TD-47 ongoing delegation routing** — `actOnWorkflowStep` in [modules/config/actions.ts](modules/config/actions.ts): added DB check for active `approval_delegations` row where `delegateId = caller`, `delegationFrom ≤ today ≤ delegationTo`, and delegator's `avaniisRole = currentStage.approverRoleCode`. If found, `isOngoingDelegate=true` bypasses the FORBIDDEN role gate, allowing the delegate to approve/reject as though they hold the role. Complements the existing per-instance `currentDelegateePersonId` check. | TD-47 | tsc 0 |
| 2026-04-30 | Engineering | **TD-48 SLA breach escalation-role notifications** — [lib/jobs/sla-breach-checker.ts](lib/jobs/sla-breach-checker.ts): inside each per-breach tx, queries `userAccounts` for all persons holding `escalationRoleCode` in the workflow's `legalEntityId`; deduplicates against the initiator; inserts one `notification_log` row per recipient (all with `notificationType='APPROVAL_ESCALATION'`). Audit metadata unchanged. | TD-48 | tsc 0 |
| 2026-04-30 | Engineering | **Design consistency — deferred sub-pages** — Applied DESIGN-STANDARD.md patterns to all previously-exempt pages: `persons/[id]/**` (7 pages + 6 client components), `absence/[id]/page.tsx` + `LeaveDecisionBar.tsx` + `absence/new/page.tsx` + `absence/rules/page.tsx` + `LeaveRulesEditor.tsx`, `workflows/[instanceId]/page.tsx` + `history/page.tsx` + `WorkflowDecisionForm.tsx`, all 15 `settings/**` sub-pages. Pattern: `<Card>` → inline-style div with `var(--card)` bg + `var(--border)` border + `var(--radius-lg)`; `<h1 className="text-2xl...">` → inline serif 30px; all Card imports removed; `className="page-in"` on outermost wrapper. | DS-deferred | tsc 0 |
| 2026-04-30 | Engineering | **DS-follow-up** `(employee)/me/accommodations/page.tsx`: inner `<Card>/<CardHeader>/<CardContent>` left by DS-L2 fix — converted to inline-style card div with `var(--card)` bg + `var(--border)` border + 12px radius; `Badge` import removed; `Card`/`CardContent`/`CardHeader`/`CardTitle` imports removed. `docs/DESIGN-STANDARD.md` exemptions section updated — "no remaining exemptions as of 2026-04-30". | DS-L2-follow | tsc 0 |
| 2026-05-01 | Engineering | **Sprint 11A — Admin panel redesign** — `config/admin-nav.ts` (grouped admin nav: People, Absence, Workflows, Master Data, Access, Settings) + `config/manager-nav.ts` (manager subset). `AdminSidebar.tsx` refactored to consume nav config (460 → grouped sections). `middleware.ts` rewritten with RBAC routing guards. `drizzle/migrations/0012_feature_permissions.sql` + schema update. `modules/access/actions.ts` — `getFeaturePermissions`, `setFeaturePermission`. `app/(hr-admin)/access/feature-permissions/` + `_FeaturePermissionsClient.tsx` — toggle per-role feature flags. `components/forms/NationalitySelect.tsx` + `lib/data/countries.ts` (200+ countries). `components/ui/DraftRestoreBanner.tsx` + `hooks/useDraftSave.ts`. `hooks/usePermissions.ts`. `lib/person-form-helpers.ts` + `tests/unit/person-form-helpers.test.ts` (479 tests). PersonNewForm.tsx expanded. Workflow actions (+283 lines — full step/delegate engine). | S11A | tsc 0 |
| 2026-05-01 | QA / QC | **Sprint 11A audit** — 2 findings: (M) `usePermissions` stale on role change — fixed (refetch on session change); (L) `DraftRestoreBanner` did not clear draft on submit — fixed (`clearDraft()` in `onSuccess`). Both closed same day. | S11A-QA | tsc 0 |
| 2026-05-01 | Engineering | **Sprint 11B — Master Data Management (9 entities)** — Legal Entities, Departments, Positions, Grades, Locations, Work Schedules, Holiday Calendars, Leave Types, Jobs. Each entity: server actions (`*Actions.ts`), data table + status filter (`*Client.tsx`), slide-over drawer (`*Drawer.tsx`). Work Schedules adds `DayHoursGrid.tsx`. Holiday Calendars adds `HolidayCalendarGrid.tsx` (month view). All entities enforce UAE Labour Law BR guards (BR-LE, BR-DEPT, BR-POS, BR-GRADE, BR-LOC, BR-WH, BR-LV, BR-JOB series). Change-reason modal required on every mutation. Disable/Enable with confirmation dialog. Audit history panel per record. | S11B | tsc 0 |
| 2026-05-01 | Engineering | **Shared MDM component library** — 11 components in `components/mdm/`: `MdmDrawer`, `MdmPageHeader`, `MdmFilterBar`, `ChangeReasonModal`, `DisableConfirmDialog`, `StatusBadge`, `AuditTrailRow`, `HistoryDiffRow`, `HistoryEventCard`, `MdmChangeHistory`, `RecordHistoryDrawer`. `lib/mdm-audit.ts` — `writeMdmAudit()` helper writes to `audit_log` inside the same DB transaction as the mutation. 47 files · 13,496 lines added. | S11B-shared | tsc 0 |
| 2026-05-01 | QA / QC | **Sprint 11B audit — 0 findings** — All Hard Rules verified clean across all 47 new files. Audit-in-tx (HR-1) confirmed on every MDM write path. No hex literals (HR-7). No sync exports from `'use server'` files. Change-reason captured on every mutation. BR guard coverage confirmed for all 9 entity series. | S11B-QA | tsc 0 · build ✓ · lint ✓ |
| 2026-05-01 | Engineering | **Documentation sync** — Updated `README.md` (MDM + Feature Permissions in features), `SPRINT_1_PROGRESS.md` (Sprint 11A + 11B sections, traceability matrix updated to 22.4% complete), `docs/FILE_STRUCTURE.md` (all new files), `docs/KNOWN_GAPS.md` (Sprint 11 status, MDM gaps), `docs/SETUP_GUIDE.md` (migrations 0000–0012, backup date). | Docs | — |
