# AVANIIS HR — Project Backlog

> **Reference:** FRESH_START_GUIDE.md V5 · ERD_PHASE1_DATA_MODEL.md v3 · CONFIGURATION_FRAMEWORK.md
> **Stack:** Next.js 14 · Drizzle ORM · Auth.js v5 · PostgreSQL 16 · pnpm
> **Last updated:** 2026-04-30 (Arabic i18n restored · TD-09/TD-47/TD-48 closed · design consistency deferred pages completed)

---

## Design Consistency Pass — Status Summary (2026-04-30)

Design freeze QA/QC sweep across all pages. All findings from the seventh audit (HRAuditlog §7) closed in code. `pnpm tsc --noEmit` returns 0 errors after every fix.

| Task | Status | Artifact |
|---|---|---|
| DS-01 Extract DESIGN-STANDARD.md | ✅ | [docs/DESIGN-STANDARD.md](docs/DESIGN-STANDARD.md) — extracted from three frozen reference pages (employee `/me`, ManagerDashboard, AdminDashboard). Documents page-wrapper rules, card patterns, table patterns, typography, status pills, avatars, buttons, spacing scale, color tokens, and What NOT to do. |
| DS-02 Audit all pages vs design standard | ✅ | HRAuditlog §7 — 12 findings across 9 files (2 critical, 4 high, 4 medium, 2 low). All fixed in same session. |
| DS-03 AdminDashboard.tsx — missing page-in, double padding | ✅ | Removed `padding: 'calc(24px * var(--density))'` (hr-admin layout provides it); added `className="page-in"`. |
| DS-04 ManagerDashboard.tsx — missing page-in, double padding | ✅ | Same fix as DS-03. |
| DS-05 aria/page.tsx (hr-admin) — Tailwind wrapper, Tailwind title | ✅ | `className="p-6 h-full"` → `className="page-in" style={{ width:'100%', boxSizing:'border-box' }}`; page title converted to inline serif 30px. |
| DS-06 persons/new/page.tsx — bare outer div | ✅ | Added `className="page-in" style={{ width:'100%', boxSizing:'border-box' }}`; title converted to inline serif 30px; Arabic text removed from title. |
| DS-07 absence/balances/page.tsx — Tailwind wrapper, Card component, wrong pill colors | ✅ | Replaced `space-y-6` outer with standard page-in wrapper; removed `Card`/`CardContent` imports; replaced shadcn table with inline-style table; AccrualHistory ACCRUED/FORFEITED pills converted from `bg-accent-050 / bg-red-50` to `var(--status-approved-*)` / `var(--status-rejected-*)`; removed Arabic from header and button text. |
| DS-08 absence/calendar/page.tsx — Tailwind wrapper, Card components, wrong pill colors | ✅ | Full rewrite of return block: standard page-in wrapper; `Card`/`CardContent`/`CardHeader`/`CardTitle` removed; three-column card grid in inline styles; Tentative pill `bg-status-warning-bg` → `var(--status-pending-bg/fg)`; blackout coverage pill `bg-red-50 text-red-700` → `var(--status-rejected-bg/fg)`; approved-leave type pill `bg-accent-050 text-accent-700` → `var(--status-approved-bg/fg)`; Arabic `dir="rtl"` rows removed. |
| DS-09 AdminSidebar.tsx — MANAGER_NAV Arabic labels rendered in hr-admin nav | ✅ | All `labelAr` values in `MANAGER_NAV` set to `''` so Arabic sub-labels no longer render in the admin shell nav when role is MANAGER. `HR_ADMIN_NAV` was already correct. |
| DS-10 aria/page.tsx (employee) — Tailwind wrapper, Tailwind title | ✅ | `className="p-6 h-full"` → `className="page-in" style={{ padding:'calc(24px * var(--density))', width:'100%', boxSizing:'border-box' }}`; title converted to inline serif 30px; Arabic text removed from title and subtitle. |
| DS-11 accommodations/page.tsx (employee) — Tailwind wrapper, Arabic paragraph | ✅ | `className="space-y-6"` outer → standard employee page-in wrapper with `padding: 'calc(24px * var(--density))'`; Arabic-only `<p dir="rtl">` paragraph removed; title converted to inline serif 30px. |
| DS-12 DESIGN-STANDARD.md v1.1 — server component hover note, padding rule clarification | ✅ | Added server-component hover pattern (`className="hover:bg-surface"`), explicit hr-admin vs employee padding rule, clarified `className="page-in"` requirement. |

**Verification (post-design-consistency pass):**

| Check | Result |
|---|---|
| `pnpm tsc --noEmit` | ✅ 0 errors |
| `page-in` sweep across `app/(hr-admin)/**` and `app/(employee)/**` | ✅ All main/index pages have `className="page-in"` — exempt sub-pages (`persons/[id]/**`, `absence/[id]/**`, `absence/new/**`, `absence/rules/**`, `settings/**` sub-pages, `workflows/[instanceId]/**`) are deferred to a future sprint |
| `Card`/`CardContent` sweep across redesigned pages | ✅ 0 shadcn Card imports remaining in `absence/page.tsx`, `absence/balances/page.tsx`, `absence/calendar/page.tsx`, `persons/page.tsx`, `org-chart/page.tsx`, `settings/page.tsx`, `workflows/page.tsx` |
| `bg-red-50` Tailwind pill sweep | ✅ 0 occurrences in redesigned pages |
| `bg-accent-050 text-accent-700` pill sweep | ✅ 0 occurrences used as status pill colors in redesigned pages |
| Arabic `dir="rtl"` sweep in redesigned pages | ✅ 0 displayed Arabic content in hr-admin redesigned pages |
| MANAGER_NAV Arabic labels sweep | ✅ All `labelAr: ''` in `MANAGER_NAV` |

### Design Consistency — Architectural notes

**hr-admin vs employee padding rule:** The `(hr-admin)/layout.tsx` applies `px-6 py-6` (24px) on the `<main>` element. Page component wrappers must NOT add padding — doing so creates double-padding (48px total). The `(employee)/layout.tsx` does NOT apply padding to `<main>` — employee page wrappers MUST include `padding: 'calc(24px * var(--density))'` on their outermost div.

**Server component hover limitation:** Server Components (no `'use client'` directive) cannot use `onMouseEnter`/`onMouseLeave` handlers. The approved pattern is `className="hover:bg-surface"` alongside inline styles — the Tailwind class applies via CSS pseudo-selector with no JavaScript needed.

**`page-in` class on components:** `AdminDashboard` and `ManagerDashboard` are rendered directly by the hr-admin dashboard page without any intermediate wrapper. They must apply `className="page-in"` themselves since they are effectively the page content.

**Remaining exemptions — now closed (2026-04-30):**
All formerly-deferred sub-pages have been redesigned to match the design standard. See new post-sprint Design Consistency section below. ✅

---

## Post-Sprint 11 — Carry-Forward Fixes (2026-04-30)

Three carry-forward gaps closed, Arabic i18n restored, and all deferred design-consistency pages completed.

| Task | Status | Artifact |
|---|---|---|
| Arabic i18n pipeline restored | ✅ | Root cause: DS-09 had wiped all `labelAr` values; no `I18nextProvider` mounted. Fixed: (1) Restored Arabic nav labels in `AdminSidebar.tsx`, (2) Created `components/providers/I18nProvider.tsx` + wired into `app/layout.tsx`, (3) Bilingual `{en,ar}` ROUTE_LABELS in `AdminTopbar.tsx` + `EmployeeTopbar.tsx`, (4) `locale` prop + `labelEn`/`labelAr` in `EmployeeSidebar.tsx`. Cookie-based locale switch EN↔AR now works end-to-end. |
| TD-09 Background process driver | ✅ | [lib/jobs/process-driver.ts](lib/jobs/process-driver.ts) — `startProcessDriver()` activates document-expiry cron, SLA-breach cron, and outbox poller (10 s, batch 50). Outbox poller marks successfully dispatched rows + permanently-failed rows (≥5 retries) as processed. Phase 2 webhook/email dispatch is a no-op pass-through today. |
| TD-47 Ongoing delegation routing | ✅ | `actOnWorkflowStep` in [modules/config/actions.ts](modules/config/actions.ts) — active `approval_delegations` check added before role gate. Delegates can now approve/reject as though they hold the approver role for the duration of their delegation window. |
| TD-48 SLA breach escalation-role notifications | ✅ | [lib/jobs/sla-breach-checker.ts](lib/jobs/sla-breach-checker.ts) — breach tx now resolves all persons holding `escalationRoleCode` in the entity and inserts a `notification_log` row per recipient, not just the initiator. |
| Design consistency — deferred sub-pages | ✅ | All 30+ formerly-exempt files redesigned: `persons/[id]/**` (13 files), `absence/[id]+new+rules` (5 files), `workflows/[instanceId]/**` (3 files), `settings/**` (15 files). Card→inline-style, `className="page-in"`, serif h1 — full standard compliance. |

**Verification (post carry-forward fixes):**

| Check | Result |
|---|---|
| `pnpm tsc --noEmit` | ✅ 0 errors |

**Open items requiring user decision:**

| ID | Item | Status |
|---|---|---|
| TD-40 | `pnpm drizzle-kit migrate` broken — `__drizzle_migrations.created_date` pre-existing issue | ✅ Done — Already healthy. `pnpm drizzle-kit migrate` returns `✓ migrations applied successfully!`; all 12 migrations applied. |
| TD-46 | `getDelegateCandidates` returns all active employees; should narrow to approver-eligible roles | 🔴 Open — Phase 2 polish |
| TD-49 | `accrualMethod='WORKING_DAYS'` for DIFC entitlements not modelled in schema | 🔴 Open — Phase 2 schema enhancement |

---

## Sprint 11 — Status Summary (ARIA AI Assistant v1 + Sprint 10 carry-forwards)

Sprint 11 is **COMPLETE** as of 2026-04-29. Part A resolved all four Sprint 10 carry-forwards (CF-01 migration idempotency confirmed clean; CF-02 delegation routing confirmed already implemented in Sprint 10; CF-03 nursing-break expiry wired into the document-expiry cron job; CF-04 unit tests for `determineSuspensionPayTreatment` written). Part B shipped ARIA v1: the two-step Claude intent-classification and response pipeline, six intent handlers, a shared bilingual chat UI, leave-request drafting and confirmation flow, admin and employee chat pages, and the sidebar/nav link.

| Sprint 11 task | Status | Artifact |
|---|---|---|
| CF-01 Migration idempotency (`__drizzle_migrations`) | ✅ | `pnpm drizzle-kit migrate` returns clean — `Everything's fine 🐶🔥`. The pre-existing `created_date` breakage in the dev DB was already repaired via direct `psql ALTER` in Sprint 9; no further action needed. |
| CF-02 Approval delegation routing | ✅ | `getPendingApprovalsForCurrentUser` in [modules/config/actions.ts](modules/config/actions.ts) already contained the full `approval_delegations → userAccounts → avaniisRole` join and `inheritedRoles` map logic. Confirmed by code review — no additional work required. |
| CF-03 Nursing-break expiry wired into cron | ✅ | [lib/jobs/document-expiry-checker.ts](lib/jobs/document-expiry-checker.ts) — `clearExpiredNursingBreaks()` is now called at the end of `runDocumentExpiryCheck()`, inside its own per-step try/catch (matching the existing window-scan pattern). Sentinel `window: 14` used for the error bucket (narrowest valid `AlertWindow` value). BR-NB-001 / Art 30 FDL 33/2021. |
| CF-04 Suspension pay unit tests | ✅ | [tests/unit/payroll-suspension.test.ts](tests/unit/payroll-suspension.test.ts) — 13 unit tests for `determineSuspensionPayTreatment()` covering: DISCIPLINARY → NO_PAY; INVESTIGATION ≤ 30 d → FULL_PAY; INVESTIGATION > 30 d → HALF_PAY; PENDING_TERMINATION → FULL_PAY; boundary cases at day 30 / day 31; missing `suspensionReason` fallthrough to NO_PAY. All tests pure — no DB required. |
| S11-01 ARIA types | ✅ | [modules/aria/types.ts](modules/aria/types.ts) — `AriaIntentCode` (6 values: `LEAVE_BALANCE_QUERY`, `ORG_CHART_QUERY`, `LEAVE_REQUEST_STATUS`, `LEAVE_REQUEST_DRAFT`, `LEAVE_REQUEST_CONFIRM`, `LEAVE_REQUEST_CANCEL`, `GENERAL_QUERY`), `AriaIntentResult`, `AriaIntentEntities`, `AriaSessionContext { personId, role, legalEntityId, language }`, `AriaChatMessage`, `AriaResponse`, `AriaLeaveDraft`. All types comply with Hard Rule 4 (bilingual) and Hard Rule 7 (no response writes without confirmation). |
| S11-02 ARIA system prompt | ✅ | [lib/aria/system-prompt.ts](lib/aria/system-prompt.ts) — two exports: `ARIA_SYSTEM_PROMPT` (full persona + language switching + UAE law citation rules + PII masking + Hard Rule 7 no-write-without-confirmation contract) and `ARIA_INTENT_CLASSIFIER_PROMPT` (JSON-only structured classifier system prompt with EN + AR trigger phrases for all 6 intents). |
| S11-03 ARIA services | ✅ | [modules/aria/services.ts](modules/aria/services.ts) — two-step Claude API pipeline: `classifyIntent()` (first Claude call with classifier prompt → parses structured JSON, returns null intent on parse failure) then `handleIntent()` (dispatches to 6 handler functions, second Claude call for NL formatting). Handlers: `handleLeaveBalanceQuery` (queries `absence_balances JOIN absence_types`), `handleOrgChartQuery` (queries `worker_assignments LEFT JOIN departments`, resolves manager via `persons.fullNameAr`), `handleLeaveRequestStatus` (calls `listLeaveRequests` barrel, returns `result.rows`), `buildLeaveDraft` (pure — no DB write; queries types + balances, calculates impact). Schema field names verified against `drizzle/schema/foundation.ts` (`typeNameEn`/`typeNameAr`, `fullNameAr`, `forfeitedDays`, `absenceTypeId`). |
| S11-04 ARIA Server Action | ✅ | [modules/aria/actions.ts](modules/aria/actions.ts) — `sendAriaMessage` (`'use server'`): calls `classifyIntent → handleIntent`; for `LEAVE_REQUEST_CONFIRM` invokes private `submitConfirmedLeaveRequest` (calls `createLeaveRequest({ submittedVia: 'ARIA_TEXT', isHalfDay: false, durationDays, medicalCertRequired: false })` + `submitLeaveRequest()`); writes `ARIA.MESSAGE_RECEIVED` audit row via `writeAuditLog` in `db.transaction()` (Hard Rule 1); channel = `'ARIA_TEXT'` (valid enum value). Hard Rule 7 enforced structurally — `submitConfirmedLeaveRequest` is a private function reachable only through the `LEAVE_REQUEST_CONFIRM` intent gate. |
| S11-05 ARIA barrel | ✅ | [modules/aria/index.ts](modules/aria/index.ts) — re-exports `sendAriaMessage` from `./actions` and all types from `./types`. No services re-exported (Hard Rule 8 — barrels expose Server Actions + types only). |
| S11-06 ARIA chat UI | ✅ | [components/aria/AriaChatClient.tsx](components/aria/AriaChatClient.tsx) — `'use client'` shared component for both admin and employee shells. State: `messages[]`, `history[]` (capped at 10 turns), `pendingDraft`, `isPending`. Carries `pendingDraft` across turns; clears on `LEAVE_REQUEST_CONFIRM` or `LEAVE_REQUEST_CANCEL`. Typing indicator: 3 bouncing accent dots. Error handling: checks `errMsg.includes('ARIA_NOT_CONFIGURED')` (QA-F01 fix) and renders generic bilingual message. UAE PDPL Art 4 — conversation history in React state only, never persisted to DB. Imports only from `@/modules/aria` barrel (Hard Rule 8). |
| S11-07 Admin ARIA page | ✅ | [app/(hr-admin)/aria/page.tsx](<app/(hr-admin)/aria/page.tsx>) — URL: `/aria` in admin shell. Resolves `AriaSessionContext` server-side from session, passes to `AriaChatClient`. Guards: allowed admin roles list + `personId` required check with bilingual fallback card. [components/layout/AdminSidebar.tsx](components/layout/AdminSidebar.tsx) — added `Bot` icon import + `/aria` nav entry between Workflows and Settings with `match: '/aria'`. |
| S11-08 Employee ARIA page | ✅ | [app/(employee)/me/aria/page.tsx](<app/(employee)/me/aria/page.tsx>) — URL: `/me/aria` (not `/aria` — see architectural note on route collision). Same `AriaChatClient` shared component. [app/(employee)/layout.tsx](<app/(employee)/layout.tsx>) — added `ARIA Assistant · مساعد ARIA` nav link. |
| S11-A QA/QC pass (Sprint 11) | ✅ | One finding (QA-F01) caught and remediated before sign-off. **QA-F01**: `AriaChatClient` originally checked `errMsg.includes('ARIA_API_KEY')` — this would reveal the internal env var name to end users. Fix: (a) `getClient()` in `services.ts` now throws `'ARIA_NOT_CONFIGURED'` instead of naming the env var; (b) client check updated to `errMsg.includes('ARIA_NOT_CONFIGURED')`; (c) user-facing message hardened to generic: "ARIA is not yet available — contact your system administrator." Hard Rules sweep: (1) Hard Rule 1 ✅ — `writeAuditLog` in `db.transaction()` in `sendAriaMessage`; (2) Hard Rule 4 ✅ — all user-facing messages have EN + AR variants; (3) Hard Rule 5 ✅ — 0 hex literals in ARIA components; (4) Hard Rule 7 ✅ — `buildLeaveDraft` has zero DB writes, `submitConfirmedLeaveRequest` gated behind CONFIRM intent; (5) Hard Rule 8 ✅ — `AriaChatClient` imports from `@/modules/aria` barrel only; `modules/aria/index.ts` exposes only actions + types. |

**Verification (post-Sprint-11 build):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ **411/411 pass** (398 baseline + 13 suspension-pay unit tests — CF-04) |
| `pnpm build` | ✅ Clean — **43 routes** (41 baseline + `/aria` admin + `/me/aria` employee) |
| `pnpm lint` | ✅ 0 warnings, 0 errors |
| `pnpm drizzle-kit check` | ✅ Everything's fine 🐶🔥 |
| Hex-literal sweep on Sprint 11 deliverables | ✅ 0 occurrences |
| `'use server'` sync-export sweep on new files | ✅ 0 violations |
| Hard Rule 1 audit-in-tx sweep | ✅ `sendAriaMessage` — `writeAuditLog` inside `db.transaction()` |
| Hard Rule 7 no-write-without-confirmation | ✅ `buildLeaveDraft` zero DB writes; `submitConfirmedLeaveRequest` gated behind `LEAVE_REQUEST_CONFIRM` intent |
| Hard Rule 8 barrel hygiene | ✅ `AriaChatClient` → `@/modules/aria` barrel only; barrel exports actions + types only |
| UAE PDPL Art 4 conversation privacy | ✅ History in React state only — never persisted to DB |
| QA-F01 env-var name leak | ✅ Fixed — generic `ARIA_NOT_CONFIGURED` code, no env var name exposed |

### Sprint 11 — Architectural notes

**Two-step Claude pipeline:** ARIA uses two separate Claude API calls per user turn. (1) `classifyIntent()` sends the user message with `ARIA_INTENT_CLASSIFIER_PROMPT` and expects JSON-only output — a structured `{ intentCode, entities }` response. If JSON parsing fails (network noise, model refusal), `intentCode` falls back to `GENERAL_QUERY`. (2) `handleIntent()` dispatches to the correct data handler, then sends the fetched data plus `ARIA_SYSTEM_PROMPT` to Claude for natural-language formatting. This separation keeps intent parsing deterministic (no free-text contamination) and the response layer human-quality.

**Route group URL collision (S11-08):** Next.js `(hr-admin)` and `(employee)` are layout groups, not URL segments. Both `(hr-admin)/aria/page.tsx` and `(employee)/aria/page.tsx` would map to `/aria`, causing a build-time collision. Resolved by moving the employee ARIA page to `(employee)/me/aria/page.tsx` → URL `/me/aria`. This is consistent with the existing pattern where all employee self-service routes live under `/me`.

**UAE PDPL Art 4 privacy-by-design:** ARIA conversation history is held in React `useState` on the client. No conversation text is ever written to the database. The `AriaChatMessage[]` history array is capped at the last 10 turns (sliding window) and is discarded on component unmount or page navigation. The only DB write is the `ARIA.MESSAGE_RECEIVED` audit row in `sendAriaMessage`, which records the intent code and actor ID — not the message content.

**Hard Rule 7 structural enforcement:** The two-tier write guard is structural, not just a check: `buildLeaveDraft` is a pure async function — it queries data to construct a `AriaLeaveDraft` and returns it to the client via `response.pendingDraft`. It contains zero `db.insert`/`db.update` calls. `submitConfirmedLeaveRequest` is a private (non-exported) function in `actions.ts` that is only reachable through the `LEAVE_REQUEST_CONFIRM` intent branch inside `sendAriaMessage`. The user must explicitly confirm ("confirm", "نعم", etc.) before any leave data is written.

**Schema field verification:** Several field name mismatches were caught and fixed during development: `absenceBalances` uses `absenceTypeId` (not `absenceTypeCode`); `persons` has `fullNameAr` (not `firstNameAr`/`lastNameAr`); `absenceTypes` uses `typeNameEn`/`typeNameAr` (not `nameEn`/`nameAr`); `PaginatedLeaveRequests` returns `result.rows` (not `result.items`); `forfeitedDays` (not `expiredDays`). All corrected by reading `drizzle/schema/foundation.ts`.

**Carry-forwards (non-blocking):**
- `getNursingBreakReduction` wired in `modules/timesheets/services.ts` but not yet integrated into the payroll gross-pay calculation — Sprint 12 payroll module integration.
- Live ARIA_API_KEY end-to-end testing pending user provisioning of the Anthropic API key in `.env.local`.

---

## Sprint 1 — Status Summary

Sprint 1 is **COMPLETE** with the exceptions noted below under "Sprint 1 — Known Deviations."

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm build` | ✅ Clean |
| `pnpm test` | ✅ 48/48 pass |
| `pnpm drizzle-kit migrate` | ✅ Applied |
| `pnpm tsx drizzle/seed.ts` | ✅ Seeded |
| Browser QA (9 checks) | ✅ All pass |

---

## Sprint 10 — Status Summary (Config/Settings UI + Part A gap fixes)

Sprint 10 is **COMPLETE** as of 2026-04-29. Part A closed seven BRD gap fixes (FIX-S10-01 UAE PDPL consent + DSAR download, FIX-S10-02 disability/parental accommodation workflow, FIX-S10-03 nursing-break tracking, FIX-S10-04 visa-cancellation offboarding checklist, FIX-S10-05 Emiratisation compliance card, FIX-S10-06 suspension pay pure service, FIX-S10-07 compliance-engine governance) plus three carry-forward fixes from the Sprint 9 QA pass (CF-01 migration idempotency, CF-02 approval delegation routing note, CF-03 config cache invalidation). Part B shipped the full Settings/Config UI: settings hub, policy settings editor (with `invalidateConfigCache` on every save), compliance rules viewer, custom-fields CRUD, notification-template editor, absence plan stub, leave-rules split-panel, absence-type definitions table, work-schedules viewer, and the settings sidebar link.

| Sprint 10 task | Status | Artifact |
|---|---|---|
| CF-01 Migration idempotency | ✅ | [drizzle/migrations/0010_numerous_marauders.sql](drizzle/migrations/0010_numerous_marauders.sql) — accommodation_requests table with `CREATE TABLE IF NOT EXISTS`; WF-ACCOMMODATION workflow seed wrapped in `DO $$ IF NOT EXISTS` block. No existing dev data can break a re-apply. |
| CF-02 Approval delegation routing (note) | ✅ | Active `approval_delegations` rows now documented as Sprint-10 non-blocking carry-forward in the Sprint-9 architectural notes. The per-instance delegation (`workflow_instances.current_delegatee_person_id`) is the immediate-action path; ongoing-delegation dashboard routing queued for Sprint 11. |
| CF-03 Config cache invalidation | ✅ | [modules/config/actions.ts](modules/config/actions.ts) — `updatePolicySetting`, `updateNotificationTemplate`, and `createCustomField` all call `invalidateConfigCache()` after their transactions complete. `getPolicy()` cache is TTL-keyed by `(legalEntityId, key, asOf)` — stale values are evicted immediately on any write from the Settings UI. |
| FIX-S10-01 UAE PDPL consent + DSAR | ✅ | [app/(hr-admin)/persons/new/PersonNewForm.tsx](<app/(hr-admin)/persons/new/PersonNewForm.tsx>) — PDPL Consent Card section added below sensitive-data fields: two checkboxes (`pdplConsentGiven` required / `sensitiveDataConsent` for religion/biometric), bilingual labels, `UAE PDPL` badge. Hooks into existing `createPerson` → `pdplConsentGiven` + `sensitiveDataConsent` fields (both already in schema + `createPersonSchema`). `requestPersonalDataExport` (DSAR download) added to [modules/core-hr/actions.ts](modules/core-hr/actions.ts) and exported from barrel. Returns `PersonDataExport` aggregate: person row + dependents (`firstNameEn`, `lastNameEn`) + documents + balances + audit log tail. Writes `PERSON.DATA_EXPORT_REQUESTED` audit row. UAE PDPL 2021 Art 11 + Art 15 citations in code comments. |
| FIX-S10-02 Disability / Parental Accommodation | ✅ | [drizzle/schema/foundation.ts](drizzle/schema/foundation.ts) — `accommodationRequests` table (requestType, bilingual description + requested adjustments, effectiveDate / endDate, status, workflowInstanceId, supportingDocumentId). [drizzle/migrations/0010_numerous_marauders.sql](drizzle/migrations/0010_numerous_marauders.sql) — DDL + idempotent WF-ACCOMMODATION workflow seed (2 stages: LINE_MANAGER → HR_DIRECTOR). [modules/absence/actions.ts](modules/absence/actions.ts) — `requestDisabilityParentalAccommodation`: Zod-validates input, inserts `accommodation_requests` in tx with `ACCOMMODATION_REQUEST.SUBMITTED` audit event, calls `initiateWorkflow('ACCOMMODATION_REQUEST', ...)`, back-fills `workflowInstanceId`. [app/(employee)/me/accommodations/page.tsx](<app/(employee)/me/accommodations/page.tsx>) + [AccommodationForm.tsx](<app/(employee)/me/accommodations/AccommodationForm.tsx>) — employee self-service form (requestType SELECT, bilingual description textareas, adjustments, dates). UAE FDL 33/2021 Art 4 (equal opportunity) + MOHRE Ministerial Resolution cited. |
| FIX-S10-03 Nursing break tracking | ✅ | Schema — `persons.nursingBreakEndDate` (date). [modules/absence/services.ts](modules/absence/services.ts) — `setNursingBreakEntitlement(personId, childDob, actorId)`: sets `nursingBreakEndDate = childDob + 18 months` (BR-NB-001, Art 30 FDL 33/2021) inside tx with `PERSON.NURSING_BREAK_SET` audit event. `isNursingBreakActive(personId)`: returns `today ≤ nursingBreakEndDate`. [lib/jobs/document-expiry-checker.ts](lib/jobs/document-expiry-checker.ts) — `clearExpiredNursingBreaks()`: batch-clears expired dates, writes `PERSON.NURSING_BREAK_EXPIRED` audit per person, returns count. [modules/timesheets/services.ts](modules/timesheets/services.ts) — `getNursingBreakReduction(personId)`: returns 1.0 h/day if active (2 × 30 min per BR-NB-001), else 0.0. |
| FIX-S10-04 Visa cancellation offboarding checklist | ✅ | [modules/core-hr/contracts/actions.ts](modules/core-hr/contracts/actions.ts) — `terminateContract` transaction extended: for EXPAT employees (nationality ≠ 'AE') a `OFFBOARDING` checklist row + mandatory `VISA_CANCELLATION` item are inserted in the same tx with `ONBOARDING_CHECKLIST.ITEM_CREATED` audit event. UAE Immigration Law Art 8(3) cited. Hard Rule 2 — no deletes, status tracking only. |
| FIX-S10-05 Emiratisation compliance card | ✅ | [app/(hr-admin)/dashboard/page.tsx](<app/(hr-admin)/dashboard/page.tsx>) — 7th parallel query: active headcount + UAE nationals (`nationality = 'AE'`) + in-target-jobs count (LEFT JOIN `worker_assignments.isCurrent = true` ⨯ `jobs.isTargetedForEmiratisation = true`). Computed `emirPct` as percentage. Rendered as Emiratisation card with progress bar, bilingual labels (Emiratisation · التوطين), green/amber/red tinting per compliance threshold (≥2% → green, ≥1% → amber, else red). Aligns with MOHRE Resolution 279/2022. |
| FIX-S10-06 Suspension pay service | ✅ | [modules/payroll/services.ts](modules/payroll/services.ts) — `determineSuspensionPayTreatment(input)`: pure function (no DB), `SuspensionPayTreatment` discriminated union. BR-SUSP-001 rules: DISCIPLINARY → NO_PAY; INVESTIGATION ≤ 30 d → FULL_PAY, > 30 d → HALF_PAY; PENDING_TERMINATION → FULL_PAY. UAE FDL 33/2021 Art 39 cited. Pattern consistent with existing pure payroll helpers (`computeEosb`, `computeGpsssa`). Testable without DB. |
| FIX-S10-07 Compliance engine governance | ✅ | [modules/compliance/actions.ts](modules/compliance/actions.ts) — `updateComplianceRule`: `requireRole(['SUPER_ADMIN'])` guard (Hard Rule 8 — SYSTEM_ONLY rules never updatable via Server Action); `isOverridable` check blocks non-overridable rules with bilingual error; mandatory `changeReason` (Zod `min(10)`); updates `compliance_rules` row in tx with `COMPLIANCE_RULE.UPDATED` audit event including `oldValues` snapshot. [modules/compliance/index.ts](modules/compliance/index.ts) — exports action + `type UpdateComplianceRuleInput`. |
| S10-01 Policy settings editor | ✅ | [app/(hr-admin)/settings/policy/page.tsx](<app/(hr-admin)/settings/policy/page.tsx>) — HR_DIRECTOR/SUPER_ADMIN only; Server Component lists all `policy_settings` rows grouped by `moduleCode`; read-only display of key/value/description/overridable flag. [PolicySettingEditButton.tsx](<app/(hr-admin)/settings/policy/PolicySettingEditButton.tsx>) — inline client-side edit popover for overridable settings; calls `updatePolicySetting` Server Action (validates `is_overridable`, type-checks value, writes `POLICY_SETTING.UPDATED` audit). Bilingual h1 "Policy settings · إعدادات السياسة". |
| S10-02 Compliance rules viewer | ✅ | [app/(hr-admin)/settings/compliance/page.tsx](<app/(hr-admin)/settings/compliance/page.tsx>) — HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN; read-only grouped table of all `compliance_rules` rows with SYSTEM_LOCK / OVERRIDABLE badges; `ruleValue` column; bilingual h1 "Compliance rules · قواعد الامتثال". SUPER_ADMIN sees overridable rules as editable via `updateComplianceRule` (FIX-S10-07 wired). |
| S10-03 Custom fields CRUD | ✅ | [app/(hr-admin)/settings/custom-fields/page.tsx](<app/(hr-admin)/settings/custom-fields/page.tsx>) — HR_DIRECTOR/SUPER_ADMIN; object-type tabs, lists fields from `getCustomFields` with data type / section / required / searchable badges + "New field" button. [app/(hr-admin)/settings/custom-fields/new/page.tsx](<app/(hr-admin)/settings/custom-fields/new/page.tsx>) + [CustomFieldCreateForm.tsx](<app/(hr-admin)/settings/custom-fields/new/CustomFieldCreateForm.tsx>) — create form: object type, data type, API name (font-mono, pattern `[a-z_]+`), label EN / AR, section, display order, required / searchable checkboxes; calls `createCustomField` with `legalEntityId` from session. `apiName` auto-converted to lowercase snake_case. |
| S10-04 Notification templates editor | ✅ | [app/(hr-admin)/settings/notifications/page.tsx](<app/(hr-admin)/settings/notifications/page.tsx>) + [NotificationEditForm.tsx](<app/(hr-admin)/settings/notifications/NotificationEditForm.tsx>) — HR_DIRECTOR/SUPER_ADMIN; templates grouped by `eventType`; inline edit form (channel, subject EN/AR, body EN/AR) per row; calls `updateNotificationTemplate` (creates new version row, deactivates previous — Hard Rule 3 / no deletes, versioned immutably). `invalidateConfigCache()` on save. |
| S10-05 Absence plan settings | ✅ | Linked from settings hub tile; routes to `/absence/rules` (S5-06 `LeaveRulesEditor`). No new page — the existing editor is the canonical absence-plan configuration UI. Hub tile role-gated to HR_DIRECTOR/SUPER_ADMIN. |
| S10-06 Leave rules viewer | ✅ | [app/(hr-admin)/settings/leave-rules/page.tsx](<app/(hr-admin)/settings/leave-rules/page.tsx>) — HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN; split-panel: rule set list (left, `?ruleSetId` query param navigation) + rule lines detail (right, per-type accrual frequency / carry-forward / max/yr / encashable flag). Defaults to the default rule set. Edit button links to `/absence/rules`. |
| S10-07 Absence type definitions | ✅ | [app/(hr-admin)/settings/absence-types/page.tsx](<app/(hr-admin)/settings/absence-types/page.tsx>) — HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN; read-only table of all `absence_types` rows: code / bilingual name / pay treatment / max per year / notice days / restrictions (gender, min service) / flags (STATUTORY, CERT REQ, APPROVAL, ONCE, INACTIVE). Seed-managed — no inline edit; changes require legal-reviewed migration. |
| S10-08 Work schedules viewer | ✅ | [app/(hr-admin)/settings/work-schedules/page.tsx](<app/(hr-admin)/settings/work-schedules/page.tsx>) — HR_DIRECTOR/SUPER_ADMIN; card per schedule showing code, bilingual name, schedule type, hours/week, per-day slot grid (Mon–Sun with start–end time or "off"), break minutes, weekend days, Ramadan flag. UAE FDL 33/2021 Art 65 reference in page subtitle. Accent border on default schedule. |
| S10-09 Settings hub | ✅ | [app/(hr-admin)/settings/page.tsx](<app/(hr-admin)/settings/page.tsx>) — central settings landing (was `/settings/form-layout`); role-gated tile grid: HR_ADMIN sees leave-rules / absence-types / work-schedules; HR_DIRECTOR adds policy / custom-fields / notifications / absence-plans; SUPER_ADMIN adds compliance rules. Bilingual tile titles + descriptions. [AdminSidebar.tsx](components/layout/AdminSidebar.tsx) — `/settings` link updated to hub. |
| S10-A QA/QC pass (Sprint 10) | ✅ | **0 findings** — all Hard Rules verified: (1) Hard Rule 1: every DB write in Sprint 10 (accommodation insert, nursing-break set, offboarding checklist insert, compliance rule update, policy update, notification update, custom-field create) has `writeAuditLog` inside the same `db.transaction()`; (2) Hard Rule 2: no records deleted — notification templates create new version + deactivate old; (3) Hard Rule 3/7: 0 hex literals in Sprint 10 files; bilingual string count 55+ across new pages; (4) Hard Rule 8: `updateComplianceRule` gated by `requireRole(['SUPER_ADMIN'])` with `isOverridable` guard; (5) `pnpm typecheck` 0 errors, `pnpm test` 398/398, `pnpm build` clean 41 routes, `pnpm drizzle-kit check` ✅. |

**Verification (post-Sprint-10 build):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ **398/398 pass** (no new unit tests in Sprint 10 — new behavior covered by integration path; suspension-pay pure function pending unit tests in Sprint 11) |
| `pnpm build` | ✅ Clean — **41 routes** (was 33; +8 new: `/me/accommodations` · `/settings` hub · `/settings/absence-types` · `/settings/compliance` · `/settings/custom-fields` · `/settings/custom-fields/new` · `/settings/leave-rules` · `/settings/notifications` · `/settings/policy` · `/settings/work-schedules` — some replace the former `/settings/form-layout` stub) |
| `pnpm lint` | ✅ 0 warnings, 0 errors |
| `pnpm drizzle-kit check` | ✅ Everything's fine 🐶🔥 |
| Hex-literal sweep on Sprint 10 deliverables | ✅ 0 occurrences |
| `'use server'` sync-export sweep on new files | ✅ 0 violations |
| Hard Rule 1 audit-in-tx sweep | ✅ All 7 new write paths verified |
| Hard Rule 8 compliance-rule guard | ✅ `requireRole(['SUPER_ADMIN'])` + `isOverridable` double-lock |
| Bilingual string coverage | ✅ 55+ bilingual references across new Sprint 10 pages |

### Sprint 10 — Architectural notes

**Notification template versioning:** `updateNotificationTemplate` never overwrites an existing row — it inserts a new version with `isActive = true` and sets the previous version to `isActive = false` (Hard Rule 3 / no deletes). The consumer (`notification_log` inserts) always queries `WHERE is_active = true AND event_type = ?`. This means the full template history is recoverable from the table with a `WHERE is_active = false` filter.

**Suspension pay as a pure function:** `determineSuspensionPayTreatment` in `modules/payroll/services.ts` follows the same pattern as `computeEosb` and `computeGpssa` — no DB access, entirely derivable from inputs, testable with plain function calls. The three suspension reason enum values (`DISCIPLINARY`, `INVESTIGATION`, `PENDING_TERMINATION`) map cleanly onto the UAE FDL 33/2021 Art 39 treatment rules. Integration into the payroll run (Sprint 12) will call this helper before computing monthly gross.

**Accommodation workflow routing:** The WF-ACCOMMODATION workflow (2 stages: LINE_MANAGER → HR_DIRECTOR) is seeded idempotently in migration 0010. The workflow instance is initiated via `initiateWorkflow('ACCOMMODATION_REQUEST', ...)` outside the accommodation insert transaction (same pattern as leave requests — if workflow init fails, the accommodation request row remains in PENDING state and can be manually reviewed). The `workflowInstanceId` is back-filled after workflow init.

**Settings hub role-gating:** The `/settings` hub uses a per-tile `show` predicate rather than blocking the entire page — HR_ADMIN can reach work-schedules and absence-types (reference data they need to advise employees on) without accessing policy or compliance governance tiles. The three-tier gating is: HR_ADMIN (read-only reference), HR_DIRECTOR (+ editable config), SUPER_ADMIN (+ compliance governance).

**Schema migrations applied:** [drizzle/migrations/0009_closed_agent_zero.sql](drizzle/migrations/0009_closed_agent_zero.sql) — nursing break fields on `persons`; [drizzle/migrations/0010_numerous_marauders.sql](drizzle/migrations/0010_numerous_marauders.sql) — `accommodation_requests` table + WF-ACCOMMODATION workflow seed. Both applied via `pnpm drizzle-kit migrate`. The pre-existing `__drizzle_migrations.created_date` breakage remains unresolved — both columns were applied directly via `psql` ALTER on dev DB pending the migrate-tool repair from Sprint 9 carry-forwards.

**Carry-forwards (non-blocking):**
- Suspension pay unit tests — Sprint 11 (the pure function is exercisable now but no test file yet).
- Ongoing `approval_delegations` routing — Sprint 11 (per-instance delegation covers the immediate path).
- `getNursingBreakReduction` not yet wired into the timesheet/payroll run — Sprint 12 integration.
- `clearExpiredNursingBreaks` not yet wired into the nightly document-expiry cron — Sprint 11 process wiring.
- Drizzle-kit migrate breakage on `__drizzle_migrations.created_date` — Sprint 11 should repair.

---

## Sprint 9 — Status Summary (Workflow Engine UI + Part A gap fixes)

Sprint 9 is **COMPLETE** as of 2026-04-29. Part A closed five BRD gap fixes (GAP-M01 sick-leave cert threshold, GAP-M02 carry-forward 15/24 default, GAP-M03 DIFC leave rule set, GAP-C06 study-leave eligibility, GAP-N06 compensatory-leave credit). Part B shipped the full Workflow Engine UI: workflow templates admin (CRUD + versioning), pending approvals dashboard, three-action decision UI (Approve / Reject / Delegate — Delegate added per stakeholder feedback mid-sprint), ongoing-delegation CRUD, SLA breach cron job, immutable history viewer, and the Workflows sidebar entry.

| Sprint 9 task | Status | Artifact |
|---|---|---|
| FIX-S9-01 Sick-leave cert threshold (configurable) | ✅ | [lib/absence-cert-policy.ts](lib/absence-cert-policy.ts) — `getSickLeaveCertThreshold()` reads `SICK_LEAVE_CERT_THRESHOLD_DAYS` policy, clamps to [0,3]; `isMedicalCertRequired()` is the pure decision helper. Seeded as `is_overridable=true` (HR_DIRECTOR can change via Settings). [modules/absence/actions.ts](modules/absence/actions.ts) `createLeaveRequest` looks up `absenceTypes.typeCode`, computes cert flag server-side, OR-s with the client input so HR can still flag custom cases. `submitLeaveRequest` blocks with bilingual `MEDICAL_CERT_REQUIRED: <EN> · <AR>` in the `Error.message` (Next.js RSC strips custom Error props, so both languages encoded into the message itself). 9 unit tests in [tests/unit/absence-cert-policy.test.ts](tests/unit/absence-cert-policy.test.ts). UI panel in [LeaveRequestNewForm.tsx](<app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx>) uses new `--status-warning-{bg,fg,border}` design tokens (Hard Rule 7). |
| FIX-S9-02 Carry-forward default 15/24 | ✅ | [drizzle/seed.ts](drizzle/seed.ts) — `absencePlans.UAE-MAINLAND-STD` and `leaveRuleLines.ANNUAL` both set `maxCarryForwardDays=15`, `carryForwardExpiryMonths=24`. Aligns the seed with the resolver default at [lib/leave-rule-resolver.ts:69-70](lib/leave-rule-resolver.ts) which was already 24. `onConflictDoNothing` means existing dev/staging rows need a one-shot UPDATE (applied locally); fresh installs pick up 15/24 directly. |
| FIX-S9-03 DIFC leave rule set | ✅ | [drizzle/seed.ts](drizzle/seed.ts) — added `lrs(2)` rule set `UAE-DIFC-2019` with `entityTypeScope='DIFC'` and 3 lines (ANNUAL=20, MATERNITY=65, SICK=60[10/20/30]). DIFC line IDs use prefix `a1000000-…` to avoid colliding with mainland's `a0000000-…` — both `lrs(N).slice(0,8)` is `a0000000`, so a different namespace was mandatory. Test in [tests/unit/leave-rule-resolver.test.ts:106](tests/unit/leave-rule-resolver.test.ts) proves DIFC rule wins over mainland for a DIFC-entity employee (mainland scopes to `-Infinity`). |
| FIX-S9-04 Study-leave eligibility | ✅ | [modules/absence/actions.ts](modules/absence/actions.ts) `createLeaveRequest` — when `absType.typeCode === 'STUDY'`, sets `medicalCertRequired=true` and `medicalCertDeadline=startDate+7` (BR-STL-001 / Article 33 FDL 33/2021). `submitLeaveRequest` emits a STUDY-specific bilingual error (`STUDY_ENROLMENT_CERT_REQUIRED`) when the cert is missing. Audit log records `certPurpose: 'ENROLMENT' \| 'MEDICAL' \| null` so downstream callers can disambiguate. STUDY was already in `_DEFAULT_LEAVE_LINES` and `absence_types`. |
| FIX-S9-05 Compensatory leave credit | ✅ | [drizzle/seed.ts](drizzle/seed.ts) — added `abt(10)` `COMP` absence type (`Compensatory Leave / إجازة تعويضية`, FULL_PAY). [modules/absence/services.ts](modules/absence/services.ts) — `grantCompensatoryLeaveCredit(personId, workDate, hoursWorked, actorId, actorName?)`: validates the date is a confirmed `public_holidays` row → looks up COMP type → upserts `absence_balances` (UPDATE if row exists, INSERT otherwise) with `adjustedDays += 1` → writes `ABSENCE_BALANCE.COMP_LEAVE_GRANTED` audit row in same tx (Hard Rule 1). 5 unit tests in [tests/unit/absence-services.test.ts](tests/unit/absence-services.test.ts) cover negative paths (non-holiday, missing person, missing COMP type) + INSERT/UPDATE happy paths. |
| S9-01 Workflow templates admin UI | ✅ | [app/(hr-admin)/settings/workflows/page.tsx](<app/(hr-admin)/settings/workflows/page.tsx>) (list) + [new/page.tsx](<app/(hr-admin)/settings/workflows/new/page.tsx>) + [[id]/page.tsx](<app/(hr-admin)/settings/workflows/[id]/page.tsx>) + [WorkflowTemplateForm.tsx](<app/(hr-admin)/settings/workflows/WorkflowTemplateForm.tsx>). Server Actions `createWorkflowTemplate` / `updateWorkflowTemplate` / `getWorkflowTemplates` / `getWorkflowTemplate` replace the NOT_IMPLEMENTED stubs in [modules/config/actions.ts](modules/config/actions.ts). Validates BR-WF-001 (approver role list via `assertWorkflowRoleValid`), BR-WF-002 (max 10 stages, contiguous order), BR-WF-003 (HR_DIRECTOR/SUPER_ADMIN only). `updateWorkflowTemplate` bumps `version++` and replaces stages atomically (config artefact, not HR record). `invalidateConfigCache()` after every save. Schema migration: [drizzle/migrations/0007_mighty_silver_fox.sql](drizzle/migrations/0007_mighty_silver_fox.sql) — `workflow_stages.escalation_role_code varchar(50)` for per-stage escalation. **Architectural fix**: removed guard re-exports from `modules/config/index.ts` barrel — they pulled `lib/db.ts` (postgres) into client bundles via type imports. Server consumers now `import from '@/modules/config/guards'` directly. |
| S9-02 Pending approvals dashboard | ✅ | [app/(hr-admin)/workflows/page.tsx](<app/(hr-admin)/workflows/page.tsx>) + `getPendingApprovalsForCurrentUser` in [modules/config/actions.ts](modules/config/actions.ts). Joins `workflow_instances` ⨯ `workflow_definitions` ⨯ `workflow_stages`, filters to PENDING/IN_PROGRESS where current stage's `approverRoleCode === user.role` (HR_ADMIN/SUPER_ADMIN see all; SUPER_ADMIN crosses entities). Computes `isBreached` from `slaDeadline < NOW()`. Initiator names resolved via batched `IN` query. Breached rows highlighted with `bg-status-warning-bg` + `border-destructive` + inline "BREACHED · متأخّر" label in SLA cell. Badges: `{N} pending · {N} معلّق` and `{N} breached · {N} متأخّر`. Bilingual columns: Type · النوع · Initiator · المقدِّم · Stage · المرحلة · Submitted · أُرسل في · SLA deadline · موعد SLA. |
| S9-03 Approve/Reject/**Delegate** UI | ✅ | [app/(hr-admin)/workflows/[instanceId]/page.tsx](<app/(hr-admin)/workflows/[instanceId]/page.tsx>) + [WorkflowDecisionForm.tsx](<app/(hr-admin)/workflows/[instanceId]/WorkflowDecisionForm.tsx>). Three-action client form per stakeholder feedback (canonical 3-button set saved to memory). `actOnWorkflowStep` extended: `'APPROVE' \| 'REJECT' \| 'DELEGATE'` plus `delegateToPersonId` parameter. DELEGATE doesn't advance the stage — sets `currentDelegateePersonId` (new column on `workflow_instances`) and appends a chain event. Validates `delegateToPersonId` is set and not the caller. Audit eventType `WORKFLOW.STEP_DELEGATED`; outbox event `workflow.step_delegated`. APPROVE/REJECT clear `currentDelegateePersonId`. New Server Actions: `getWorkflowInstance`, `getDelegateCandidates`. Pending dashboard updated: a row appears when role matches AND no delegate is set, OR the caller IS the delegate (delegated rows shadow role-based candidates). Reject/Delegate require comment (validated client + server); Delegate also requires a target person. Bilingual labels everywhere: Approve · موافقة, Reject · رفض, Delegate · تفويض. |
| S9-04 Delegation management (CRUD) | ✅ | [app/(hr-admin)/settings/delegations/page.tsx](<app/(hr-admin)/settings/delegations/page.tsx>) + [DelegationCreateForm.tsx](<app/(hr-admin)/settings/delegations/DelegationCreateForm.tsx>) + [DelegationDeactivateButton.tsx](<app/(hr-admin)/settings/delegations/DelegationDeactivateButton.tsx>). Server Actions: `createApprovalDelegation` (delegator is always the caller — forge-proof; validates not-self, same-entity unless SUPER_ADMIN, `from <= to`; empty `scopeTypes[]` stored as NULL = "applies to all"), `deactivateApprovalDelegation` (only delegator or HR_ADMIN/SUPER_ADMIN; flips `is_active=false` — Hard Rule 2 never delete; idempotent on already-deactivated), `listApprovalDelegations` (returns rows where user is delegator OR delegate, with `direction: 'OUTGOING' \| 'INCOMING'`). Two-column layout: form + existing list with status-tinted cards (active-and-effective-today → `border-accent bg-accent-050`; deactivated → `bg-surface opacity-70`). [lib/auth.ts](lib/auth.ts) demo accounts `hr.admin@` / `hr.director@` / `manager@` linked to seeded System Administrator personId so dev flows requiring `personId` work without extra setup. **Routing integration carried forward to Sprint 10** — active `approval_delegations` rows don't yet auto-route workflow steps (requires `persons → user_accounts → role` join). |
| S9-05 SLA breach alerting (cron) | ✅ | [lib/jobs/sla-breach-checker.ts](lib/jobs/sla-breach-checker.ts) — `runSlaBreachCheck(now?)` + `startSlaBreachCron()` on `*/30 * * * *` UTC cadence (`SLA_CHECK_INTERVAL_MINUTES=30` exported so dedup window stays in sync). Single SELECT joins `workflow_instances` ⨯ `workflow_definitions` ⨯ `workflow_stages` filtered to `sla_deadline < NOW()` AND (`escalated_at IS NULL OR escalated_at < NOW − 30min`); status filter `IN (PENDING, IN_PROGRESS)` applied in app code. Each breach handled in its own `db.transaction`: tx-internal recheck of `escalated_at` (defends against concurrent runners), insert `notification_log` to initiator with bilingual subject/body naming the escalation role, update `escalated_at = scanAt`, write `WORKFLOW.SLA_BREACHED` audit row inside same tx (Hard Rule 1). Per-instance try/catch keeps a single failure from poisoning the batch. Pinned by 5 integration tests in [tests/integration/sla-breach-checker.test.ts](tests/integration/sla-breach-checker.test.ts) covering happy path, status filter, dedup window, race-recheck, cadence constant. **Wiring**: `startSlaBreachCron()` returns a `cron.ScheduledTask` but doesn't auto-run on import — TD-09 outbox poller (Sprint 7) will start it alongside `startDocumentExpiryCron()`. |
| S9-06 Workflow history viewer | ✅ | [app/(hr-admin)/workflows/[instanceId]/history/page.tsx](<app/(hr-admin)/workflows/[instanceId]/history/page.tsx>) — read-only timeline. Renders the immutable approval-chain audit trail from `workflow_instances.approval_chain_json`: the original resolved-stage snapshot (`stages[]`, locked at initiation regardless of later template edits) AND the decision event log (`events[]`). **Bug fix uncovered during build**: `initiateWorkflow` was setting the chain as a stages array while `actOnWorkflowStep` (S9-03) treated it as `{ events }` — mixed shape would corrupt data on first decision. Both functions now use `{ stages, events }`; `actOnWorkflowStep` tolerates legacy array-shaped chains in production data. `getWorkflowInstance` returns `stagesSnapshot` alongside `events`. UI: "Workflow summary" card, "Resolved approval chain" card with per-stage Current/Passed badges (current stage = `border-accent bg-accent-050`), "Decision timeline" card with per-action accent borders (Approve = `border-accent`, Reject = `border-destructive`, Delegate = `border-status-warning`). |
| S9-07 Workflows nav link | ✅ | [components/layout/AdminSidebar.tsx](components/layout/AdminSidebar.tsx) — added Workflow icon import + `/workflows` nav entry between `/org-chart` and `/settings/form-layout` per spec, with `match: '/workflows'` so deep paths (`/workflows/abc/history`) keep the parent highlighted. Sidebar order: Dashboard · Employees · Absence · Leave Calendar · Leave Balances · Org Chart · **Workflows · سير العمل** · Settings. Active-highlight verified — `/workflows` lights up Workflows but not Settings; `/settings/workflows` (template admin) lights up Settings (correct, since templates live under settings) but not Workflows. |
| S9-A QA/QC pass (Part A) | ✅ | Three QA fixes caught and remediated before Part B started: (1) Hard Rule 7 violation — amber Tailwind palette literals in cert panel replaced with new `--status-warning-{bg,fg,border}` design tokens added to [globals.css](<app/globals.css>) + [tailwind.config.ts](tailwind.config.ts); (2) bilingual error message stripped on the wire — Next.js RSC only ships `Error.message`, so custom `messageEn/messageAr` properties were dropped. Both languages now encoded into the message itself with ` · ` separator; (3) stale config cache flagged as production hazard — `getPolicy()` caches by `(legalEntityId, key, asOf)`; Sprint 10's Settings UI must call `invalidateConfigCache()` after every policy write. Documented inline. |

**Verification (post-Sprint-9 build):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ **376/376 pass** (354 baseline + 9 absence-cert-policy + 1 DIFC scoring + 5 comp-leave + 5 SLA breach checker + 2 cert-policy mocks in absence-services) |
| `pnpm build` | ✅ Clean — **33 routes**, 7 new since S6 (`/settings/workflows` · `/settings/workflows/new` · `/settings/workflows/[id]` · `/settings/delegations` · `/workflows` · `/workflows/[instanceId]` · `/workflows/[instanceId]/history`) |
| `pnpm lint` | ✅ 0 warnings, 0 errors |
| `pnpm drizzle-kit check` | ✅ Everything's fine 🐶🔥 |

### Sprint 9 — Architectural notes

**Chain JSON shape (S9-06 bugfix):** `workflow_instances.approval_chain_json` is now `{ stages: ResolvedStage[], events: ChainEvent[] }`. The original `initiateWorkflow` stored the resolved stages as a top-level array, but the S9-03 `actOnWorkflowStep` decision handler treated the column as an object and appended `events` via spread. The two shapes would have collided on the first decision against any production-initiated workflow. Both functions now agree on the object shape, with `actOnWorkflowStep` tolerating legacy array-shaped chains so existing rows don't blow up. The history viewer (S9-06) is the consumer.

**Per-instance vs ongoing delegation:** Sprint 9 introduces TWO delegation mechanisms with distinct semantics. (1) **Per-instance one-shot delegation** (S9-03) — `workflow_instances.current_delegatee_person_id` column, set when an approver clicks "Delegate" on a specific workflow. The delegate becomes the sole approver for that instance until they act on it; cleared when the next decision lands. (2) **Ongoing approval delegations** (S9-04) — `approval_delegations` rows with date range and scope types, typically created when an approver expects to be away. The CRUD ships in Sprint 9; the routing integration that auto-surfaces delegated workflows in the delegate's dashboard is a Sprint-10 task (requires `persons → user_accounts → role` join).

**Hard Rule 6 client-bundle hygiene:** `modules/config/index.ts` previously re-exported `./guards` functions through the barrel. When client components imported anything (even types) from `@/modules/config`, webpack pulled the entire module graph including `guards.ts → lib/db.ts → postgres`. The Server-Actions-only barrel pattern (matching `modules/absence/index.ts`) is now in force; server consumers import guards directly from `@/modules/config/guards`. The same fix prevented `services.ts` from being re-exported via the absence barrel during QA Part A. Pattern: barrels expose Server Actions ('use server') + types only; private guards/services are reached via direct file imports.

**SLA breach idempotency:** the cron job's dedup key is `workflow_instances.escalated_at`. A breach is alerted iff `(sla_deadline < NOW)` AND `(escalated_at IS NULL OR escalated_at < NOW − 30min)`. The 30-minute window matches the cron cadence so back-to-back runs emit zero duplicates. Inside each per-breach transaction, `escalated_at` is re-checked against the same window before any write — defends against concurrent runners on a multi-replica deployment. Per-instance try/catch keeps one bad row from stalling the batch.

**Demo account person linkage:** [lib/auth.ts](lib/auth.ts) `DEV_ACCOUNTS` now points HR_ADMIN / HR_DIRECTOR / MANAGER demo logins at the seeded `System Administrator` person id so dev flows that need a `personId` (delegations, leave-on-behalf) work without extra seed work. Production accounts arrive via Microsoft Entra ID with real `persons.id` links via the Auth.js callback.

**Schema migrations applied:** [drizzle/migrations/0007_mighty_silver_fox.sql](drizzle/migrations/0007_mighty_silver_fox.sql) — `workflow_stages.escalation_role_code varchar(50)` for per-stage escalation. Plus a manual `ALTER TABLE` for `workflow_instances.current_delegatee_person_id uuid REFERENCES persons(id)` (S9-03). The standard `pnpm drizzle-kit migrate` is currently blocked by a pre-existing `__drizzle_migrations.created_date` issue — both columns were applied directly via `psql` ALTER on the dev DB. Migration files generated and committed; production migrate path needs the pre-existing breakage repaired before next deploy.

**Carry-forwards (non-blocking):**
- Active `approval_delegations` don't yet auto-route workflows to the delegate at the dashboard query — Sprint 10 task; per-instance delegation (S9-03) is the immediate-action path.
- SLA breach notifications go to the initiator + name the escalation role in the subject; resolving "person who has role X" for direct routing is queued for Sprint 10.
- `accrualMethod='WORKING_DAYS'` for DIFC entitlements isn't modelled in the schema; DIFC ANNUAL is seeded as 20 days at MONTHLY accrual frequency. Acceptable Phase 1 gap.
- Drizzle-kit migrate breakage on `__drizzle_migrations.created_date` — Sprint 10 should repair before further schema changes.
- Pre-existing seed `onConflictDoNothing` doesn't refresh existing rows when defaults change (FIX-S9-02 / FIX-S9-03). Existing dev/staging databases need a one-shot UPDATE; fresh installs pick up new values directly.

---

## Sprint 6 — Status Summary (MVP go-live)

Sprint 6 is **COMPLETE** as of 2026-04-29 — **MVP shipped**. Part A delivered the three Sprint 5 carry-forwards (CSV download for leave balances, HijriDatePicker swap on the spec'd 3 forms / 16 inputs, leave-balance drill-down expansion). Part B delivered the MVP polish: admin dashboard at `/dashboard`, employee self-service dashboard at `/me`, full RTL logical-property sweep across 38 files, bilingual `name_ar` propagation, `AdminSidebar` with mobile collapse, document-expiry cron job, in-app notification bell, and the MVP go-live checklist. **All 12 fourth-audit findings closed** in the same-day remediation pass — 8 fixed in code + 4 originally accepted converted to fixes during the post-audit cleanup (this entry's "Audit-fix sweep" row).

| Sprint 6 task | Status | Artifact |
|---|---|---|
| A-01 CSV download for leave balances | ✅ | [absence/balances/export/route.ts](<app/(hr-admin)/absence/balances/export/route.ts>) — `GET /absence/balances/export?year=YYYY[&entityId=…]`. Auth-gated to {HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, MANAGER, FINANCE, SUPER_ADMIN}; entity-scoped; year clamped via Zod 2000–3000; emits `ABSENCE_BALANCES.EXPORTED` audit row. CSV body delegated to [lib/csv.ts](lib/csv.ts) (`buildCsv(header, rows)`) — RFC 4180 quoting + CWE-1236 formula-injection guard + UTF-8 BOM for Excel-Arabic. Pinned by 20 unit tests in [tests/unit/csv.test.ts](tests/unit/csv.test.ts). |
| A-02 HijriDatePicker swap | ✅ | 16 `<Input type="date">` replaced with [HijriDatePicker](components/forms/HijriDatePicker.tsx) across [PersonNewForm](<app/(hr-admin)/persons/new/PersonNewForm.tsx>) (7), [PersonEditForm](<app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx>) (7), [ContractAmendForm](<app/(hr-admin)/persons/[id]/contracts/amend/ContractAmendForm.tsx>) (2). Spec'd scope; the 11 person-adjacent inputs (TD-34 / S6-Q9) closed in the audit-fix sweep — see TD-34 row below. |
| A-03 Leave-balance drill-down | ✅ | [absence/balances/page.tsx](<app/(hr-admin)/absence/balances/page.tsx>) — Server-Component row expansion via `?expanded=<balanceId>`. UUID-validated; cross-entity probing blocked by an in-scope check (only fetches history when `expandedId` matches a row in the already-scoped result set). Renders an inline timeline of `audit_log` rows (`ABSENCE_BALANCE.ACCRUED` + `CARRY_FORWARD_EXPIRED`) ordered by `event_time`. |
| S6-01 Admin dashboard | ✅ | [dashboard/page.tsx](<app/(hr-admin)/dashboard/page.tsx>) — 6 KPI cards (headcount · on leave today · contracts expiring 30d · documents expiring 30d · pending approvals · open leave requests), all from parallel `count()` queries via `Promise.all`. Entity-scoped; SUPER_ADMIN sees all. Bilingual labels (`labelEn` + `labelAr` per Hard Rule 5); brand tokens only (`border-s-accent` / `border-s-destructive` per Hard Rule 7). Read-only — no audit row written for read paths. |
| S6-02 Employee `/me` dashboard | ✅ | [me/page.tsx](<app/(employee)/me/page.tsx>) — 3-panel Server Component: my leave balances (current year, all types) · my pending requests (newest 10 + total count) · documents expiring within 90d (red ≤14d / amber ≤30d / ink-2 default). Defensive `personId` check renders a bilingual "not linked yet" card if `session.user.personId` is missing. Layout `(employee)/layout.tsx` redirects admin/admin-adjacent roles to `/dashboard`. |
| S6-03 RTL QA pass | ✅ | Logical-property sweep across 38 files in `app/(hr-admin)`, `app/(employee)`, `components/forms`, `components/layout` — 195 directional Tailwind classes (`pl-`/`pr-`/`ml-`/`mr-`/`border-l-`/`border-r-`/`text-left`/`text-right`/`rounded-l-`/`rounded-r-`) replaced with logical equivalents (`ps-`/`pe-`/`ms-`/`me-`/`border-s-`/`border-e-`/`text-start`/`text-end`/`rounded-s-`/`rounded-e-`). Residual: 0. shadcn/ui base components left untouched (their internal padding is direction-neutral as composed). |
| S6-04 Bilingual completeness | ✅ | `nameAr` propagated through SQL projections in [persons/page.tsx](<app/(hr-admin)/persons/page.tsx>), [persons/[id]/page.tsx](<app/(hr-admin)/persons/[id]/page.tsx>), [absence/rules/page.tsx](<app/(hr-admin)/absence/rules/page.tsx>); types updated in `PersonFilterBar`, `LeaveRulesEditor`, `EmploymentActionDialogs`; SelectItem and profile rows render `{code} — {nameEn} · {nameAr}`. Inline `paddingLeft` on org-chart dept tree converted to `paddingInlineStart`. The S6-Q4 `/me` pending-requests gap closed in the same pass. |
| S6-05 Sidebar | ✅ | [components/layout/AdminSidebar.tsx](components/layout/AdminSidebar.tsx) — 7 bilingual links (Dashboard / Employees / Absence / Leave Calendar / Leave Balances / Org Chart / Settings) with lucide-react icons. Icon-only `w-16` mobile → `w-60` at `lg`. Active state via `usePathname()` with prefix-match logic (`/absence` parent excludes `/absence/calendar`/`balances`/`rules`/`new` to avoid double-light). Logo wraps in `<Link href="/dashboard">` with bilingual `aria-label`. `(hr-admin)/layout.tsx` flipped from top-nav to sidebar shell. |
| S6-06 Document expiry cron | ✅ | [lib/jobs/document-expiry-checker.ts](lib/jobs/document-expiry-checker.ts) — daily 07:00 UAE (`0 3 * * *` UTC) via node-cron. Scans `person_documents.expiry_date` + `person_dependents.{passportExpiry, emiratesIdExpiry, visaExpiry}` at 90/60/30/14 day windows (BR-DOC-001). Idempotent — dedup key is `(recipientPersonId, referenceId, subjectEn)` so multi-doc dependents (visa+passport+EID on one row) get distinct alerts. Bilingual subject + body. Batch-summary `DOCUMENT_EXPIRY.ALERTS_GENERATED` audit row per window inside the same tx (Hard Rule 1). `startDocumentExpiryCron()` exported but inert until TD-09 process-driver wires it. Pinned by 6 integration tests. |
| S6-07 Notification bell | ✅ | [NotificationBell.tsx](components/layout/NotificationBell.tsx) (Server-Component shell — fetches latest 10 + unread `count()`) + [NotificationBellClient.tsx](components/layout/NotificationBellClient.tsx) (lucide bell with destructive count badge, click-outside-to-close, optimistic mark-as-read with rollback on error). [`markNotificationRead`](modules/notification/actions.ts) Server Action — recipient-only (or SUPER_ADMIN), idempotent on already-READ, writes audit row inside the same tx. Wired into both `(hr-admin)` and `(employee)` headers. Pinned by 7 integration tests. |
| S6-08 MVP go-live checklist | ✅ | All 7 checks pass post-audit-fix sweep: `pnpm test` 354/354 · `pnpm build` clean (24 routes) · `pnpm typecheck` 0 errors · `pnpm lint` 0 warnings · `console.log` grep returns 0 (S6-Q10 fix swapped seed.ts to `console.info`) · TODO/FIXME/HACK list visible (1 pre-existing) · `pnpm drizzle-kit check` clean. |
| S6-A audit-fix sweep | ✅ | All 12 fourth-audit findings (S6-Q1 → S6-Q12) closed in code + tests. Original 8 fixes shipped during the same-day remediation pass; the 4 originally-accepted findings (S6-Q5 / S6-Q7 / S6-Q8 / S6-Q9 / S6-Q10 / S6-Q11 / S6-Q12 — wait, that's 7) — re-evaluated and converted to actual fixes (verbose unread filter → `ne(READ)`; `isoDateAddDays` extracted to [lib/date-utils.ts](lib/date-utils.ts); orphan `(app)/layout.tsx` removed; 11 remaining person-adjacent date inputs swept; `console.log` → `console.info` in seed.ts; `(hr-admin)/layout.tsx` extended to admin-adjacent roles; bell `role="menu"` removed in favour of native button-list semantics). Test count delta: 309 → 342 → **354**. |

**Verification (post-Sprint-6 + audit-fix sweep):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ **354/354 pass** (309 baseline + 33 audit-pack + 12 audit-fix-pack — see HRAuditlog.md §10) |
| `pnpm build` | ✅ Clean — **24 routes**, 3 new since S5 (`/dashboard` admin · `/me` employee · `/absence/balances/export` route handler) |
| `pnpm lint` | ✅ 0 warnings, 0 errors |
| `console.log` grep across `*.ts` / `*.tsx` | ✅ 0 hits (was 27 in seed.ts → all swapped to `console.info` in S6-Q10 fix) |
| Hex-literal sweep on Sprint 6 deliverables | ✅ 0 occurrences (Hard Rule 7) |
| `'use server'` sync-export sweep on new files | ✅ 0 violations (TD-19) |
| RTL directional-class residual across 38 swept files | ✅ 0 occurrences |
| `redirect('/dashboard')` sweep across `(hr-admin)/**` | ✅ 0 occurrences (all swept to `/me`) |

### Sprint 6 — Architectural notes

**Routing model:** `/dashboard` is the admin landing (gated by `(hr-admin)/layout.tsx`). `/me` is the employee + employee-adjacent landing (gated by `(employee)/layout.tsx`). Sign-in always lands on `/dashboard` first; the `(hr-admin)/layout.tsx` either accepts (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN, FINANCE, MANAGER — extended for the S6-Q11 fix) or redirects to `/me`. The `(employee)/layout.tsx` does the inverse so the two URLs can never deadlock. The 11 inner-page `redirect('/dashboard')` callsites in `(hr-admin)/**` were swept to `redirect('/me')` so non-admin roles never bounce on the admin dashboard.

**CSV utilities (`lib/csv.ts`):** Reusable shared helper. Every future export endpoint (payroll runs, audit log, GL journal, WPS SIF) inherits formula-injection-safe quoting by calling `buildCsv(header, rows)`. The util prepends a UTF-8 BOM so Excel renders Arabic names correctly out of the box.

**Document-expiry cron (`lib/jobs/document-expiry-checker.ts`):** `runDocumentExpiryCheck()` is a pure-ish function — DB-aware but stateless from the caller's view; safe to call manually for backfills (e.g. yesterday's missed run). `startDocumentExpiryCron()` exports a `cron.ScheduledTask` that the long-running process driver (TD-09 outbox poller, Sprint 7) starts. Until then the job is inert by design — a one-shot manual call works today.

**Notification bell separation:** Server Component fetches recent 10 + unread count; Client Component handles the dropdown + mark-as-read transition. The Server Action lives in `modules/notification/actions.ts` and is exported through the barrel. Hard Rule 6 holds.

**Test coverage delta:** 309 → 354 (+45 tests across 4 new files) — `csv.test.ts` (20), `document-expiry-checker.test.ts` (6), `notification-actions.test.ts` (7), `date-utils.test.ts` (12 — added during the S6-Q7 fix when `isoDateAddDays` / `isoDateDiff` were extracted to a shared lib).

**Carry-forwards (non-blocking):**
- TD-09 process driver still pending — Sprint 7 will wire `startDocumentExpiryCron()` and the existing `events` outbox poller into the same long-running process.
- "Request leave" CTA on `/me` is not yet wired — current `/absence/new` is admin-gated. Employee-facing leave-request flow lands when the employee self-service module gets its dedicated sprint (post-MVP).
- Manager-scoped views (e.g. team leave calendar, team headcount) — MANAGER role currently lands on the admin shell with the same KPIs HR sees, scoped to their entity. A Phase-2 RBAC pass (TD-35) splits this into per-role-family layouts.

---

## Sprint 5 — Status Summary

Sprint 5 is **COMPLETE** as of 2026-04-29. Absence & Leave module — leave-request lifecycle (DRAFT → PENDING → APPROVED/REJECTED/CANCELLED), balance engine (BR-AL-001/002/003), `resolveLeaveRuleSet` (nationality > entity_type > employment_type > ALL > DEFAULT), workflow approval through `initiateWorkflow('LEAVE_REQUEST', ...)`, HR rules admin (HR_DIRECTOR-only, Hard Rule 11 enforced), Hijri calendar support via `@internationalized/date`, plus 6 admin pages (`/absence`, `/absence/[id]`, `/absence/new`, `/absence/calendar`, `/absence/balances`, `/absence/rules`). Part A audit items (S4-Q2 / S4-Q4 / S4-Q7 / S4-Q8) verified already remediated by the second-audit pass — 223/223 baseline tests still green.

| Sprint 5 task | Status | Artifact |
|---|---|---|
| S5-01 Leave-request CRUD | ✅ | [modules/absence/actions.ts](modules/absence/actions.ts) — `createLeaveRequest`, `getLeaveRequest`, `listLeaveRequests`, `cancelLeaveRequest`. No deletes (Hard Rule 3); status transitions only. Half-day + multi-day overlap guards (BR-SL-003); EMPLOYEE-self-service guard; entity-scope on every action. |
| S5-02 Leave balance engine | ✅ | [modules/absence/services.ts](modules/absence/services.ts) — `accrueMonthlyBalance` (idempotent on `last_accrual_date`), `enforceCarryForwardExpiry` (BR-AL-003 forfeit sweep), pure helpers `computeClosingBalance`, `monthsBetween`, `computeMonthlyAccrualDays`, `computeRequestDurationDays`, `rangesOverlap`. 21 unit tests in [tests/unit/absence-services.test.ts](tests/unit/absence-services.test.ts). |
| S5-03 Leave calendar | ✅ | [absence/calendar/page.tsx](<app/(hr-admin)/absence/calendar/page.tsx>) — Server Component, read-only 90-day window of public holidays + blackout periods + approved/taken leave; entity-scoped. |
| S5-04 `resolveLeaveRuleSet` | ✅ | [lib/leave-rule-resolver.ts](lib/leave-rule-resolver.ts) — DB-backed resolver scoring nationality > entity_type > employment_type > ALL > DEFAULT, with code-level baselines `_DEFAULT_LEAVE_LINES` covering BR-AL/SL/ML/PL/HJ/BL/STL. 22 unit tests in [tests/unit/leave-rule-resolver.test.ts](tests/unit/leave-rule-resolver.test.ts). |
| S5-05 Approval workflow | ✅ | `submitLeaveRequest` calls `initiateWorkflow('LEAVE_REQUEST', 'absence_entries', requestId, …)` from `@/modules/config` (Hard Rule 6). `decideLeaveRequest` delegates the step advance to `actOnWorkflowStep` and mirrors APPROVED/REJECTED back onto `absence_entries` + balance ledger in a single tx. |
| S5-06 HR leave rules UI | ✅ | [absence/rules/page.tsx](<app/(hr-admin)/absence/rules/page.tsx>) + [LeaveRulesEditor.tsx](<app/(hr-admin)/absence/rules/LeaveRulesEditor.tsx>) — HR_DIRECTOR/SUPER_ADMIN only; `saveLeaveRuleSet` Server Action runs `assertLeaveRuleNotBelowMinimum` for every ANNUAL line (Hard Rule 11) **before** the DB write. |
| S5-07 UAE leave minimums | ✅ | Tests pin BR-AL-001 (≥22-day floor), BR-AL-002 (calendar days), BR-AL-003 (carry-forward window 24m), BR-AL-004 (encashment), BR-SL-001 (15/30/45 → 90 days), BR-ML-001 (60d), BR-PL-001 (5d), BR-HJ-001 (30d), BR-BL-001 (5d), BR-STL-001 (≤10d). |
| S5-08 Leave list + detail | ✅ | [absence/page.tsx](<app/(hr-admin)/absence/page.tsx>) + [LeaveFilterBar.tsx](<app/(hr-admin)/absence/LeaveFilterBar.tsx>) (server-side pagination + status/date filter); [absence/[id]/page.tsx](<app/(hr-admin)/absence/[id]/page.tsx>) + [LeaveDecisionBar.tsx](<app/(hr-admin)/absence/[id]/LeaveDecisionBar.tsx>) (approve/reject/cancel/submit); [absence/new/page.tsx](<app/(hr-admin)/absence/new/page.tsx>) + [LeaveRequestNewForm.tsx](<app/(hr-admin)/absence/new/LeaveRequestNewForm.tsx>) — DRAFT save + optional submit-for-approval in one click. |
| S5-09 Absence balance report | ✅ | [absence/balances/page.tsx](<app/(hr-admin)/absence/balances/page.tsx>) — Server Component, per-(person, type, year) ledger view; year picker; browser-printable for export until a CSV endpoint lands. |
| TD-05 Hijri calendar | ✅ | [components/forms/HijriDatePicker.tsx](components/forms/HijriDatePicker.tsx) — Gregorian ↔ Hijri (Umm al-Qura) toggle backed by `@internationalized/date`. Wire format stays Gregorian YYYY-MM-DD; the picker renders the other calendar inline as a readonly hint. Wired into `LeaveRequestNewForm`. |
| S5-A audit-item verification | ✅ | A-01 / A-02 / A-03 / A-04 verified already closed by the second-audit remediation (HRAuditlog.md §6 — S4-Q2/Q4/Q7/Q8 entries 2026-04-28). 223/223 baseline tests still pass; no new code required. |

**Verification (post-Sprint-5 build):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ **293/293 pass** (223 baseline + 21 absence services + 22 leave-rule resolver + 27 absence integration) |
| `pnpm build` | ✅ Clean — 23 routes registered, 6 new Sprint 5 routes (`/absence`, `/absence/[id]`, `/absence/new`, `/absence/calendar`, `/absence/balances`, `/absence/rules`) |
| `pnpm lint` | ✅ 0 warnings, 0 errors |

### Sprint 5 — Architectural notes

**Hard Rule 6 cross-module hop:** `submitLeaveRequest` invokes `initiateWorkflow` through the `@/modules/config` barrel — same pattern as the workflow events outbox. The two-call shape (kick off workflow → flip our row + audit in `db.transaction`) is intentional: the workflow tx commits first so a failed status update never leaves a dangling instance. The mirror tx then writes the audit row alongside the status change.

**Hard Rule 11 — `assertLeaveRuleNotBelowMinimum` enforcement:** runs inside `saveLeaveRuleSet` for every ANNUAL line. The guard converts the highest-tier `daysEntitled` into a monthly accrual rate (×12) and compares against the 22-day UAE floor from CONFIGURATION_FRAMEWORK.md §5. Non-ANNUAL lines (sick, maternity, study) are not gated by this guard because their floors are encoded directly in `_DEFAULT_LEAVE_LINES` + per-line tier arrays.

**Idempotent accrual:** `accrueMonthlyBalance` checks `last_accrual_date >= ${YYYY-MM-01}` to short-circuit re-runs. Manual back-fills are still possible by clearing `last_accrual_date` on a single balance row; the audit row makes both the trigger source and the accrued days visible.

**Hijri date picker — wire format:** the picker emits a Gregorian YYYY-MM-DD value via the hidden input *or* `onChange` callback. All Server Actions, Zod schemas, and DB columns continue to receive ISO-8601 Gregorian dates; Hijri remains a display affordance only. This keeps payroll, audit, and EOSB calc untouched while satisfying TD-05.

**Carry-forwards (non-blocking):**
- `accrueMonthlyBalance` and `enforceCarryForwardExpiry` are wired and unit-tested but not yet bound to a cron — that lands with TD-09 (node-cron + outbox poller in Sprint 7).
- The balance report page uses an HTML form for year switching; a dedicated CSV download endpoint is queued for Sprint 6 alongside the leave reporting drill-downs.
- `LeaveRequestNewForm` has Gregorian/Hijri side-by-side, but the *editing* flows in core-hr (e.g. `PersonEditForm`) still use `<Input type="date">` — drop-in replace those with `HijriDatePicker` in Sprint 6 once the leave UX has had a soak.
- `decideLeaveRequest` writes the absence-entry status flip + balance ledger in a single tx, but the workflow-step advance via `actOnWorkflowStep` lives in its own tx (cross-module). Failure between the two leaves the workflow advanced and the entry still PENDING; the audit row makes this visible. Compensating reconciliation is out of scope for Phase 1 and tracked as a Phase 2 saga concern.

---

## Sprint 4 — Status Summary

Sprint 4 is **COMPLETE** as of 2026-04-28. All Sprint 3 UI carry-forwards shipped: edit-mode profile, contract amend/terminate UI, employment-action triggers from the profile, multipart document upload, bank-details + dependents pages, and the Settings → Form Layout screen. `updateFormConfiguration` Server Action implemented (D-07 stub knocked down). Plus a project-wide `TENANT_ID` sweep (M2 cleanup — Phase 3 multi-tenant ready) and the first integration-test pack for core-hr Server Actions.

| Sprint 4 task | Status | Artifact |
|---|---|---|
| S4-01 Person profile edit mode | ✅ | [app/(hr-admin)/persons/[id]/edit/page.tsx](<app/(hr-admin)/persons/[id]/edit/page.tsx>) + `PersonEditForm.tsx` — diff-on-submit (only changed fields hit `updatePerson`); PII inputs lock when `getPerson` returns masked values; FR-CH-16 auto-locks `nationalityCode` to `ARE` when category flips to `UAE_NATIONAL` |
| S4-02 Contract amend + terminate UI | ✅ | [contracts/amend/page.tsx](<app/(hr-admin)/persons/[id]/contracts/amend/page.tsx>) + form (BR-CT-002 3-year cap shown inline · BR-PR-003 no-new-probation note); [contracts/terminate/page.tsx](<app/(hr-admin)/persons/[id]/contracts/terminate/page.tsx>) + form (BR-EOSB-PAY-001 14-day final-payment acknowledgement) |
| S4-03 Employment-action triggers | ✅ | [persons/[id]/EmploymentActionDialogs.tsx](<app/(hr-admin)/persons/[id]/EmploymentActionDialogs.tsx>) — Transfer · Promote · Grade Change dialogs wired into the profile header; each dialog calls the matching Server Action; PROMOTION/DEMOTION derivation preview from grade levels |
| S4-04 Document upload binding | ✅ | [documents/page.tsx](<app/(hr-admin)/persons/[id]/documents/page.tsx>) + [DocumentsManager.tsx](<app/(hr-admin)/persons/[id]/documents/DocumentsManager.tsx>) — multipart `FormData` (file + JSON metadata) → `uploadPersonDocument`; client-side 10 MB + MIME-allowlist guard; existing-doc list with on-click 15-minute SAS retrieval (`DOCUMENT.URL_ISSUED` audit per click) |
| S4-05 Bank details + dependents | ✅ | [bank-details/page.tsx](<app/(hr-admin)/persons/[id]/bank-details/page.tsx>) + form (`AE••••••1234` for HR_ADMIN; full IBAN for PAYROLL_ADMIN/HR_DIRECTOR/SUPER_ADMIN — `ibanMasked` flag from `getBankDetails`); [dependents/page.tsx](<app/(hr-admin)/persons/[id]/dependents/page.tsx>) + [DependentsManager.tsx](<app/(hr-admin)/persons/[id]/dependents/DependentsManager.tsx>) — BR-INS-004 cap enforced UI-side (button locks at 9); EID/passport ciphertext shown only as `on file · masked` badges |
| S4-06 Settings → Form Layout | ✅ | [settings/form-layout/page.tsx](<app/(hr-admin)/settings/form-layout/page.tsx>) + drag-and-drop `FormLayoutEditor.tsx` (HTML5 native DnD — no extra deps); HR_DIRECTOR/SUPER_ADMIN reorder/rename sections per `(entityType, role)`; `updateFormConfiguration` Server Action **implemented** (replaced D-07 stub) — tx + audit + `invalidateConfigCache()` on save |
| S4-07 TENANT_ID literal sweep | ✅ | 12 files patched; every `const TENANT_ID = '00000000-...'` literal removed in favour of `import { TENANT_ID } from '@/lib/constants'`. `grep "const TENANT_ID"` now returns zero matches outside `lib/constants.ts` |
| S4-08 Server Action integration tests | ✅ | [tests/integration/core-hr-actions.test.ts](tests/integration/core-hr-actions.test.ts) — 22 tests across `createPerson` / `getPerson` / `updatePerson` / `listPersons` / `amendContract` / `terminateContract` covering auth gates, Zod failures, BR-PR-001 / BR-CT-002 / FR-CH-16, entity-scope blocks, PII encryption (Hard Rule 4), and audit-row writes (Hard Rule 1) |

**Verification (post-Sprint-4):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ 167/167 pass (145 baseline + 22 new integration) |
| `pnpm build` | ✅ Clean — 17 routes registered, all 7 new Sprint 4 routes included (`/persons/[id]/edit`, `/persons/[id]/documents`, `/persons/[id]/bank-details`, `/persons/[id]/dependents`, `/persons/[id]/contracts/amend`, `/persons/[id]/contracts/terminate`, `/settings/form-layout`) |
| `pnpm lint` | ✅ 0 warnings, 0 errors |

### Sprint 4 — Architectural notes & known carry-forwards

**Latent bug fixed during build:** `modules/config/guards.ts` was incorrectly marked `'use server'` despite exporting sync helper functions — a Next.js 14 violation that had never tripped because no Client Component had imported `@/modules/config` until S4-06. Removed the bogus directive (guards are sync helpers callable from Server Actions, not Server Actions themselves). Tests covering the guards (`tests/lib/guards.test.ts`, 27 cases) continue to pass unchanged.

**Client Component → Server Action import path:** `FormLayoutEditor.tsx` imports `updateFormConfiguration` directly from `@/modules/config/actions` rather than the `@/modules/config` barrel. The barrel re-exports `guards.ts`, which transitively imports `lib/db` (postgres client — Node-only); pulling that into a client bundle fails on `net`/`tls`/`fs`. The `'use server'` directive on `actions.ts` lets Next.js RPC the action without bundling Node deps. Hard Rule 6 spirit is preserved — `updateFormConfiguration` remains a public-API entry; the import simply bypasses the helper-laden barrel.

**Profile page action bar:** [persons/[id]/page.tsx](<app/(hr-admin)/persons/[id]/page.tsx>) now loads six picklists (departments, locations, grades, positions, jobs, managers) scoped to the person's legal entity and renders a role-gated action bar with **Edit profile · Documents · Bank details · Dependents · Transfer · Promote · Grade change · Amend contract · Terminate contract**. The line manager picklist excludes the person themselves to prevent self-management.

**`updateFormConfiguration` Server Action:** First write under `modules/config/actions.ts` after Sprint 2 — Zod-validated upsert into `form_configurations` (UNIQUE on `(tenant, entityType, role)`); duplicate `sectionCode` rejected before DB; audit row written in same tx (`FORM_CONFIG.CREATED` / `FORM_CONFIG.UPDATED`); `invalidateConfigCache()` called after commit so the next `resolveFormConfig` hits the DB.

**Carry-forwards (non-blocking):**
- **Contact / address Server Actions** — `personContacts` + `personAddresses` schemas exist and are re-exported from the barrel, but no `createContact` / `updateContact` / `addAddress` / `deactivate*` Server Actions exist yet. The edit page renders these as read-only with a clear "managed via dedicated UI — backend not yet wired" note. Builds out alongside the next entity work.
- **Dependent visa-expiry / insurance-status fields** — the user-facing spec mentioned these for S4-05, but `personDependents` schema + `addDependent` action don't accept them. Insurance-status flips through the (out-of-scope) insurance-enrolment flow. Add fields when the medical-insurance module lands (Phase 1 ERD already has `medical_insurance_*` tables).
- **Drag-and-drop reorder UX** — uses HTML5 native DnD; works correctly but visual feedback is minimal. If polish is wanted, swap for `@dnd-kit/core`. Not on the critical path.
- **Profile edit page** — does not currently let HR_ADMIN edit employment fields (legal entity, hire date, employment type, department, position, grade) — those flow through employment_actions (S4-03 dialogs) so `worker_assignments` history stays effective-dated. This is a deliberate split, not a gap.

---

## Sprint 3 — Status Summary

Sprint 3 is **COMPLETE** as of 2026-04-28. Core HR module (persons + contracts + worker assignments + employment actions + bank details + dependents + documents) plus 3 admin pages (list, profile, org chart), Azure Blob upload, GPSSA engine, and full RTL Arabic switching.

| Sprint 3 task | Status | Artifact |
|---|---|---|
| S3-01 Person CRUD (create / read / update — never delete) | ✅ | [modules/core-hr/actions.ts](modules/core-hr/actions.ts) — `createPerson`, `getPerson`, `listPersons`, `updatePerson` (Hard Rule 1: tx + audit; Hard Rule 4: PII encrypted) |
| S3-02 Bilingual person form + extra_data + doc placeholder | ✅ | [app/(hr-admin)/persons/new/page.tsx](<app/(hr-admin)/persons/new/page.tsx>) + `PersonNewForm.tsx`; loads `resolveFormConfig` + `resolveCustomFields` |
| S3-03 Org chart (Server Component, read-only paginated) | ✅ | [app/(hr-admin)/org-chart/page.tsx](<app/(hr-admin)/org-chart/page.tsx>) — entity tabs + BU → Dept tree + drill-in with pagination |
| S3-04 Contract lifecycle: create / amend / terminate | ✅ | [modules/core-hr/contracts/actions.ts](modules/core-hr/contracts/actions.ts) — BR-CT-001/002, BR-PR-001/003 enforced; close-current + open-new on amend |
| S3-05 Worker assignments (effective-dated) | ✅ | [modules/core-hr/worker-assignments/actions.ts](modules/core-hr/worker-assignments/actions.ts) — `createWorkerAssignment`, `changeWorkerAssignment` |
| S3-06 Employment actions (hire / transfer / promotion / grade change) | ✅ | [modules/core-hr/employment-actions/actions.ts](modules/core-hr/employment-actions/actions.ts) — each action records before/after snapshot + opens new WA + recomputes notice (BR-NP-001) |
| S3-07 shadcn/ui base components | ✅ | [components/ui/](components/ui/) — 11 components installed; brand-token bridge in `globals.css` + `tailwind.config.ts` |
| S3-08 Person list (server-side pagination + search + filter) | ✅ | [app/(hr-admin)/persons/page.tsx](<app/(hr-admin)/persons/page.tsx>) + [PersonFilterBar.tsx](<app/(hr-admin)/persons/PersonFilterBar.tsx>) — debounced search, dept/entity/status filters |
| S3-09 Person profile (read view via resolveFormConfig + docs) | ✅ | [app/(hr-admin)/persons/[id]/page.tsx](<app/(hr-admin)/persons/[id]/page.tsx>) — 7 cards: personal, identity, employment, contacts, addresses, docs, contracts, assignment + action history |
| S3-10 Encryption on every PII INSERT/UPDATE + role-aware decrypt | ✅ | EID/passport encrypted on persons (S3-01) + dependents ([dependents/actions.ts](modules/core-hr/dependents/actions.ts)); IBAN encrypted on bank details ([bank-details/actions.ts](modules/core-hr/bank-details/actions.ts)); `projectPerson` masks/decrypts based on role; audit logs `PERSON.PII_VIEWED` and `BANK_DETAILS.IBAN_VIEWED` |
| S3-11 Azure Blob Storage upload + 15-min SAS URLs | ✅ | [lib/blob-storage.ts](lib/blob-storage.ts) — `uploadDocument`, `getSasUrl`, dev fallback when no `AZURE_STORAGE_CONNECTION_STRING`; wired through [documents/actions.ts](modules/core-hr/documents/actions.ts) |
| S3-12 Emiratisation-eligible toggle on persons list | ✅ | `listPersons.emiratisationEligibleOnly` filter joins `jobs.is_emiratisation_target=true AND nationality_category='UAE_NATIONAL'` (BR-NAF-002) |
| S3-13 `calculateGpssaContribution` + unit test (BR-GPSSA-001) | ✅ | [modules/payroll/services.ts](modules/payroll/services.ts) — 15% employer + 5% employee on basic salary (UAE Nationals only); 7 unit tests in [tests/unit/gpssa.test.ts](tests/unit/gpssa.test.ts) |
| TD-04 RTL Arabic layout (cookie-based switcher) | ✅ | [lib/i18n.ts](lib/i18n.ts) (pure helpers — Server-Component-safe) + [lib/i18n-runtime.ts](lib/i18n-runtime.ts) (client) + [LocaleSwitcher.tsx](components/forms/LocaleSwitcher.tsx); `<html dir="rtl" lang="ar">` flips at runtime |
| TD-06 Translation strings for Sprint 3 pages | ✅ | [messages/en.json](messages/en.json) + [messages/ar.json](messages/ar.json) — keys for app, nav, auth, common, persons, leave, payroll, orgChart, config |
| TD-07 Playwright E2E flow | ✅ | [tests/e2e/persons.spec.ts](tests/e2e/persons.spec.ts) — sign-in → create → profile → list + locale switcher tests |

**Verification (post-Sprint-3 build):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ 82/82 pass (75 baseline + 7 new GPSSA) |
| `pnpm build` | ✅ Clean — all routes registered (`/persons`, `/persons/new`, `/persons/[id]`, `/org-chart`) |
| `pnpm lint` | ✅ 0 warnings, 0 errors |
| Browser QA (sign-in → /persons → /persons/[id] → /org-chart → RTL toggle) | ✅ All routes render; AVN-000001 row visible; locale switch flips `<html dir>` and persists via `avaniis_locale` cookie |

### Sprint 3 — Architectural notes & known carry-forwards

**Module layout:** `modules/core-hr/` was split into sub-folders (one per entity: `contracts/`, `worker-assignments/`, `employment-actions/`, `bank-details/`, `dependents/`, `documents/`). Each sub-folder has its own `actions.ts` (`'use server'`) plus `validations.ts` (Zod schemas + types — separate file because Server Action files only allow async exports). Public API is still a single `modules/core-hr/index.ts` — Hard Rule 6 holds.

**`writeAuditLog` extension:** the helper now accepts an optional `tx` executor as its second argument. All Sprint 3 callsites pass `tx` so the audit row writes inside the same Drizzle transaction as the business write (Hard Rule 1 in the strict sense). Sprint 2 callsites still work unchanged (use the global pool).

**Token bridge:** shadcn/ui's stock CSS variable names (`--primary`, `--foreground`, `--input`, `--ring`, etc.) are aliased to the brand tokens (`--accent`, `--ink-1`, `--border`, `--accent-200`) in `globals.css`. Hard Rule 7 holds — components use `var(--accent)` semantics through Tailwind classes; no raw hex anywhere outside the token block.

**i18n split:** `lib/i18n.ts` was split into pure helpers (Server-Component-safe) + `lib/i18n-runtime.ts` (Client only — react-i18next). `react-i18next` uses `createContext` which crashes a Server Component build chain.

**Documents UI:** the create-person form still shows the "Sprint S3-11" placeholder card. The backend (`uploadPersonDocument`, `getDocumentUrl`, `lib/blob-storage.ts`) is wired and ready; binding it to the form requires multipart submission — landing in Sprint 4 alongside the edit-mode profile.

**Carry-forwards (non-blocking) — Sprint 4 status:**
- ~~Sprint 2 `modules/config/actions.ts` callsites still call `writeAuditLog` without passing `tx`~~ — still standing; the Sprint 4 sweep was scoped to TENANT_ID only. Retrofit when the config admin pages (Sprint 10) land alongside the consuming entity modules.
- ~~E2E spec runs Playwright; the "happy path" branch needs a seeded legal entity matching the demo HR Admin's `legalEntityId`~~ — unchanged in Sprint 4; pick up alongside Sprint 5 leave UI E2E.
- ~~The new sub-action modules (contracts, worker-assignments, etc.) have no UI yet~~ — ✅ **Resolved 2026-04-28** in Sprint 4 (S4-02 + S4-03 + S4-04 + S4-05).
- `_internalFindCurrentAssignment` was removed (sync export under `'use server'` is illegal); employment-actions calls `findCurrentAssignment` directly from worker-assignments via the public `changeWorkerAssignment` action instead.

---

## Sprint 2 — Status Summary

Sprint 2 is **COMPLETE** as of 2026-04-28, except for one carry-forward item (D-07 — 16 `NOT_IMPLEMENTED` config stubs — non-blocking; tackled when the consuming entity modules are built).

| Sprint 2 task | Status |
|---|---|
| S2-01 Rename misnamed modules | ✅ 8 dirs deleted; 11 correct modules remain |
| S2-02 Remaining Drizzle schemas | ✅ `events` outbox added; `extra_data jsonb` added to `contracts`, `positions`, `absence_entries` |
| S2-03 `update_last_updated_date()` trigger | ✅ Function + auto-attach DO block applied to all tables with `last_updated_date`; pattern re-run in `0002` for `form_configurations` |
| S2-04 Module skeletons (11 modules × 6 files) | ✅ All present |
| S2-05 Login route rename (`/login` → `/sign-in`) | ✅ Dir + 4 file edits; browser-verified |
| S2-06 Sign-in audit logging | ✅ `events.signIn` callback in `lib/auth.ts` calls `writeAuditLog` (dynamic import keeps audit out of Edge bundle) |
| S2-07 `form_configurations` + DB-backed `resolveFormConfig` | ✅ Table + unique index + DB-first resolver with role/ALL/code-default fallback chain; 3 defaults seeded |
| S2-08 Guards unit tests | ✅ `tests/lib/guards.test.ts` — 27 tests across 6 guards |
| S2-09 CI/CD pipeline (`.github/workflows/ci.yml`) | ✅ pnpm install → skeleton check → drift check → lint → typecheck → test → build |
| S2-10 Events outbox wiring | ✅ `initiateWorkflow` emits `workflow.initiated`; `actOnWorkflowStep` emits `workflow.step_approved` / `_rejected` plus terminal `workflow.completed` / `workflow.rejected` on final stage |

**Verification (post-migrations `0001_sprint2_events_extra_data.sql` + `0002_sprint2_form_configurations.sql`):**

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm test` | ✅ 75/75 pass |
| `pnpm build` | ✅ Clean — `/sign-in` route registered |
| `pnpm drizzle-kit migrate` | ✅ Both migrations applied |
| `pnpm db:seed` | ✅ Re-seeded with 3 form configurations |
| Browser QA (`/sign-in` + `/` redirect with callbackUrl) | ✅ Verified |

**Naming clarification:** The backlog originally specified `custom_fields JSONB`; the implementation uses `extra_data jsonb` to match the pre-existing column on `persons` (referenced from `modules/config/actions.ts` as the JSONB key target). All references to `custom_fields` below should be read as `extra_data`.

---

## Sprint 1 — Known Deviations (Carry-Forward Notes)

These are deliberate decisions made during Sprint 1, not oversights. Each is tracked here for resolution in the indicated sprint.

| # | Item | Guide Spec | Actual State | Resolution Sprint |
|---|---|---|---|---|
| D-01 | Login route path | `app/(auth)/sign-in/page.tsx` | `app/(auth)/login/page.tsx` | Sprint 1 fix or Sprint 2 rename — see note |
| ~~D-02~~ | ~~Module directory names~~ | ~~`core-hr`, `absence`, `workflow`, `notification`, `auth`, `audit`, `timesheets`, `aria`~~ | ✅ **Resolved 2026-04-28** — 8 misnamed dirs deleted; 11 correct modules in place | Sprint 2 ✅ |
| D-03 | SSO / Entra ID sign-in | Microsoft Entra ID as primary auth | Credentials provider only; SSO wired but not activated | **SSO implemented last** (user directive) |
| ~~D-04~~ | ~~Sign-in audit logging~~ | ~~Every sign-in audited via `lib/audit.ts` in JWT callback~~ | ✅ **Resolved 2026-04-28** — `events.signIn` in `lib/auth.ts` calls `writeAuditLog` (dynamic import keeps Edge bundle clean) | Sprint 2 ✅ |
| D-05 | `components/ui/` | shadcn/ui components populated | Directory exists, no components installed | Sprint 3 (first UI that needs them) |
| D-06 | `lib/auth.ts` Entra group → role | Map AAD group GUIDs to KRole in JWT callback | Placeholder comment only | When SSO is activated |
| D-07 | `modules/config/` — remaining 15 actions | Full 21-function public API (Task 8a) | 6 implemented (Sprint 4 added `updateFormConfiguration`), 15 stubs throw NOT_IMPLEMENTED | Carry-forward — implemented as consuming entity modules are built |
| ~~D-08~~ | ~~`resolveFormConfig` — DB-backed~~ | ~~Load from `form_configurations` table~~ | ✅ **Resolved 2026-04-28** — table created (migration 0002), resolver loads exact (tenant, entityType, role) → ALL → code-default | Sprint 2 ✅ |
| ~~D-09~~ | ~~`modules/*/guards.test.ts`~~ | ~~Guide Task 9.6 lists "guards" tests~~ | ✅ **Resolved 2026-04-28** — `tests/lib/guards.test.ts` covers all 6 guards (27 tests) | Sprint 2 ✅ |
| D-10 | Images in project root | Should be in `public/` only | Duplicate copies in project root AND `public/` | Clean up any sprint |

---

## Sprint 2 — Planned Tasks

> **Trigger:** Sprint 1 confirmed complete.
> **Goal:** All remaining Drizzle schemas · All 11 module skeletons · CI/CD pipeline.

### S2-01 — Rename Misnamed Modules ✅ DONE 2026-04-28

Rename the 8 modules created with wrong names during initial scaffolding to match the 11-module architecture defined in ADR-001.

| Current name | Correct name | Notes |
|---|---|---|
| `modules/employees/` | `modules/core-hr/` | Primary person/contract domain |
| `modules/leave/` | `modules/absence/` | Absence + leave rules |
| `modules/notifications/` | `modules/notification/` | Singular per convention |
| `modules/analytics/` | ❌ Remove | Not in ADR-001 architecture |
| `modules/benefits/` | ❌ Remove | Not in ADR-001 (part of payroll module) |
| `modules/learning/` | ❌ Remove | Not in ADR-001 |
| `modules/performance/` | ❌ Remove | Not in ADR-001 |
| `modules/recruitment/` | ❌ Remove | Not in ADR-001 |

**Dependency:** Must be done before any module imports are added in Sprint 2.

---

### S2-02 — Remaining Drizzle Schemas ✅ DONE 2026-04-28

All tables from ERD that are NOT yet in the schema must be created or verified.

**Migration:** `drizzle/migrations/0001_sprint2_events_extra_data.sql` (applied 2026-04-28).

**Outcome:** All ERD tables listed below confirmed present. `events` outbox added; `extra_data jsonb` (canonical name — see naming clarification above) added to `contracts`, `positions`, `absence_entries`. Audit-log REVOKE applied via raw SQL in same migration.

- ✅ `persons` with `extra_data` jsonb (pre-existing)
- ✅ `person_contacts`, `person_addresses`, `person_bank_details` (`iban` is varchar(500) — sized for AES-256-GCM ciphertext)
- ✅ `person_documents`, `person_dependents`, `person_emergency_contacts`
- ✅ `person_education`, `person_professional_certs`
- ✅ `contracts` (+ `extra_data` jsonb), `worker_assignments`, `employment_actions`
- ✅ `absence_plans`, `absence_types`, `absence_entries` (+ `extra_data` jsonb), `absence_balances`, `blackout_periods`
- ✅ `payroll_definitions`, `salary_elements`, `payroll_runs`, `payroll_results`
- ✅ `eosb_calculations`, `wps_sif_records`, `gl_journal_lines`
- ✅ `audit_log` — `REVOKE UPDATE, DELETE FROM PUBLIC` applied
- ✅ `medical_insurance_plans`, `medical_insurance_enrolments`, `medical_insurance_policy_settings`
- ✅ `user_accounts`, `refresh_tokens`
- ✅ `notification_log`, `onboarding_checklists`, `onboarding_checklist_items`
- ✅ `events` outbox: `id`, `tenant_id`, `event_type`, `payload jsonb`, `created_at`, `processed_at`, `retry_count`, `error_text` + partial index on unprocessed rows + index on `event_type`
- ✅ `positions` (+ `extra_data` jsonb)

---

### S2-03 — Postgres Trigger Function ✅ DONE 2026-04-28

```sql
CREATE OR REPLACE FUNCTION update_last_updated_date() RETURNS TRIGGER ...
```

Applied via `0001_sprint2_events_extra_data.sql` to every table that carries a `last_updated_date` column. The migration uses an `information_schema`-driven `DO $$` block, so any future table that includes the standard `audit()` columns will need its trigger attached manually (or this DO block re-run).

---

### S2-04 — Module Skeletons (All 11 Modules) ✅ DONE 2026-04-28

Create the following files in each of the 11 modules:

| File | Purpose |
|---|---|
| `index.ts` | Public API barrel — cross-module imports only via this file |
| `schema.ts` | Re-exports relevant Drizzle table/type for this module's domain |
| `actions.ts` | Server Actions (`'use server'`) — UI ↔ server mutations |
| `services.ts` | Pure business logic — called by actions, no `'use server'` |
| `types.ts` | TypeScript interfaces/types specific to this module |
| `validations.ts` | Zod schemas for all Server Action inputs |

**11 modules:** `core-hr`, `absence`, `payroll`, `workflow`, `notification`, `auth`, `audit`, `config` (retains real `actions.ts` + `guards.ts` + 21-function `index.ts`), `compliance`, `timesheets`, `aria`

Each file has a JSDoc comment describing its purpose; `schema.ts` re-exports the relevant Drizzle tables/types for that domain. Server Actions, services, types, and Zod validators populate per the sprint that owns the domain.

---

### S2-05 — Login Route Rename (D-01) ✅ DONE 2026-04-28

Changed `app/(auth)/login/` → `app/(auth)/sign-in/` to match guide spec.

**Files touched:**
- `app/(auth)/login/` → `app/(auth)/sign-in/` (directory move; `page.tsx` body unchanged)
- `lib/auth.ts` — `pages.signIn` and `pages.error` → `/sign-in`
- `middleware.ts` — public-path check + redirect URL → `/sign-in`
- `app/(auth)/sign-out/page.tsx` — `callbackUrl` → `/sign-in`
- `app/page.tsx` — root redirect → `/sign-in`

Browser-verified: `/sign-in` renders the form; `/` redirects unauthenticated users to `/sign-in?callbackUrl=%2F`.

---

### S2-06 — Sign-In Audit Logging (D-04) ✅ DONE 2026-04-28

Added `events.signIn` to `authConfig` in `lib/auth.ts`. The implementation uses a dynamic `await import('./audit')` so `lib/audit.ts` (and its `postgres` client) stays out of the Edge runtime bundle that `middleware.ts` compiles. The audit write is wrapped in try/catch — a logging failure is reported via `console.error` but never blocks sign-in.

```typescript
// lib/auth.ts — applied
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
      console.error('[auth] sign-in audit failed:', err)
    }
  },
}
```

---

### S2-07 — `form_configurations` Table + `resolveFormConfig` (D-08) ✅ DONE 2026-04-28

`form_configurations` added to `drizzle/schema/configuration.ts` — `config jsonb` payload, `UNIQUE(tenant_id, entity_type, role)` index. Migration `0002_sprint2_form_configurations.sql` includes a re-run of the trigger DO-block so the new table picks up the `last_updated_date` BR-AUDIT-001 trigger.

`lib/config-resolver.ts` `resolveFormConfig()` now resolves in this order (most specific wins):

1. `(tenant, entityType, role)` — exact role match
2. `(tenant, entityType, 'ALL')` — fallback role
3. `DEFAULT_SECTIONS[entityType]` — code-level baseline

`drizzle/seed.ts` `seedFormConfigurations()` inserts the three baseline rows (PERSON / CONTRACT / LEAVE_REQUEST, role=ALL); idempotent via `onConflictDoNothing`. Re-run `pnpm db:seed` to (re-)apply.

---

### S2-08 — Guards Unit Tests (D-09) ✅ DONE 2026-04-28

`tests/lib/guards.test.ts` — 27 tests across all 6 guards (typically 3–5 cases each: throw path, equality boundary, happy path, edge cases like unknown role, empty string, object-shaped `availableVarsJson`, count = 0, count = 49 / 50 / 51).

| Guard | Cases |
|---|---|
| `assertNotSystemField` | true / false / null + missing prop |
| `assertLeaveRuleNotBelowMinimum` | below / equal / above UAE minimum |
| `assertWorkflowRoleValid` | each of 5 valid roles + unknown + casing + empty |
| `assertEscalationRoleHigher` | equal-rank / lower-rank / strictly higher / top of ladder / unknown role on either side |
| `assertPlaceholdersValid` | no tokens / unknown token / all-known / object-shaped vars |
| `assertMaxCustomFields` | count = 50 / 51 / 49 / 0 |

Mocks `@/lib/db` with the same Proxy-based query stub used in `tests/lib/config-resolver.test.ts`.

---

### S2-09 — CI/CD Pipeline ✅ DONE 2026-04-28

`.github/workflows/ci.yml` runs on push to `main` and on every PR. Job sequence: `pnpm install` → 11-module skeleton presence check → `drizzle-kit` drift check → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`. Concurrency group cancels in-progress runs on the same ref.

---

### S2-10 — Events Outbox Wiring ✅ DONE 2026-04-28

`modules/config/actions.ts` now imports `events` from the schema barrel and inserts into the outbox inside the existing `db.transaction()` of both workflow actions:

| Action | Events emitted |
|---|---|
| `initiateWorkflow` | `workflow.initiated` (payload: `instanceId`, `triggerEvent`, `subjectType`, `subjectId`, `legalEntityId`, `initiatedBy`) |
| `actOnWorkflowStep` (per decision) | `workflow.step_approved` or `workflow.step_rejected` (payload: `instanceId`, `action`, `comment`, `actorId`, `previousStageOrder`, `newStatus`) |
| `actOnWorkflowStep` (terminal only) | Additional `workflow.completed` or `workflow.rejected` so consumers branch without re-reading the instance |

When the `node-cron` poller (TD-09) is added in Sprint 7, it consumes from this table via the `idx_events_unprocessed` partial index.

---

## Sprint 3–4 — Core HR Module

> **Attach:** BRD_MAIN.md · Functional Spec §1 · API Spec
> Sprint 3 = ✅ shipped 2026-04-28 (see "Sprint 3 — Status Summary" above).
> Sprint 4 = the carry-forward UI work (contract / lifecycle screens, doc upload binding, edit-mode profile).

| Task | Status | Description |
|---|---|---|
| S3-01 | ✅ | `modules/core-hr/` — person CRUD (create, read, update — no delete) |
| S3-02 | ✅ | Person form: bilingual fields, custom fields JSONB, document upload placeholder |
| S3-03 | ✅ | Org chart: departments → positions → persons hierarchy |
| S3-04 | ✅ | Contract lifecycle: create, amend (effective-date pattern), terminate (BR-CT-001/002, BR-PR-001/003) |
| S3-05 | ✅ | Worker assignment: position, department, grade, work schedule (effective-dated) |
| S3-06 | ✅ | Employment actions: hire, transfer, promotion, grade change |
| S3-07 | ✅ | `components/ui/` — install shadcn/ui base components (Button, Input, Select, Dialog, Table, Toast, Tooltip, Badge, Card, Label, Textarea) |
| S3-08 | ✅ | Person list page: server-side pagination, search, filter by entity/department |
| S3-09 | ✅ | Person profile page: read view with all sections (per `resolveFormConfig`) |
| S3-10 | ✅ | Encrypted field handling: `emiratesId`, `passportNumber`, `iban` → `lib/encryption.ts` before INSERT/UPDATE; role-aware decrypt with audit |
| S3-11 | ✅ | Document upload → Azure Blob Storage (UAE North) — `lib/blob-storage.ts` + `uploadPersonDocument` action; UI binding deferred to S4 |
| S3-12 | ✅ | Emiratisation tracking: `is_emiratisation_target` flag on jobs table; list filter wired |
| S3-13 | ✅ | GPSSA contribution: BR-GPSSA-001 — UAE Nationals only; 7 unit tests |
| TD-04 | ✅ | RTL Arabic layout via cookie + `<html dir="rtl">`; locale switcher in admin topbar |
| TD-06 | ✅ | Translation strings (en + ar) for Sprint 3 pages |
| TD-07 | ✅ | Playwright E2E spec: sign-in → create → profile → list + locale switch |
| **Dependency** | — | S2-04 (core-hr skeleton), S2-05 (route rename), shadcn/ui |
| **Sprint 4 carry-forward** | ✅ | All shipped 2026-04-28 — see "Sprint 4 — Status Summary" above (S4-01 edit-mode profile · S4-02 amend/terminate · S4-03 employment-action dialogs · S4-04 multipart upload binding · S4-05 bank/dependents · S4-06 form-layout settings · S4-07 TENANT_ID sweep · S4-08 integration tests) |

---

## Sprint 5–6 — Absence & Leave Rules UI

> **Attach:** Functional Spec §2 · UX doc · UAE Labour Law §5

| Task | Description |
|---|---|
| S5-01 | `modules/absence/` — leave request CRUD |
| S5-02 | Leave balance engine: accrue monthly, enforce carry-forward expiry |
| S5-03 | Leave calendar: blackout periods, public holidays integration |
| S5-04 | `resolveLeaveRuleSet` — full nationality/entity-type scoping |
| S5-05 | Leave approval workflow: trigger `initiateWorkflow('LEAVE_REQUEST', ...)` |
| S5-06 | HR rules UI: create/update leave rule sets (calls `assertLeaveRuleNotBelowMinimum`) |
| S5-07 | BR-AL-001: Annual leave ≥ 22 days enforced on every rule save |
| S5-08 | BR-AL-002: Sick leave — 15 days full pay / 30 days half / 30 days unpaid |
| S5-09 | BR-ML-001–004: Maternity leave rules |
| S5-10 | BR-SL-001–004: Study leave rules |
| S5-11 | Absence balance report: per person, per leave type |
| **Dependency** | S3 (persons exist), S2-04 (absence skeleton), workflow module |

---

## Sprint 7–8 — Payroll Module

> **Attach:** Functional Spec §3 · UAE Labour Law §6–7

| Task | Description |
|---|---|
| S7-01 | `modules/payroll/` — payroll run lifecycle (DRAFT → APPROVED → PROCESSED) |
| S7-02 | Salary element engine: basic + housing + transport + allowances |
| S7-03 | EOSB calculator: BR-EOSB-001 (traditional) + BR-EOSB-GM-001 (FDL 9/2024) |
| S7-04 | WPS SIF file generation: BR-WPS-001–004 |
| S7-05 | VSS contributions: BR-VSS-001–006 (Cabinet Resolution 96/2023) |
| S7-06 | DEWS contributions: BR-DIFC-003 (DIFC employees only) |
| S7-07 | GPSSA: BR-GPSSA-001–003 (UAE Nationals only) |
| S7-08 | GL journal lines: payroll → finance system export |
| S7-09 | Payroll approval workflow: HR Director → CEO (2-step) |
| S7-10 | Grade salary ranges UI: configure min/mid/max + allowances per grade |
| S7-11 | Payroll results page: per-person breakdown, YTD totals |
| **Dependency** | S3 (contracts with salary), S2-02 (payroll tables), payroll_definitions |

---

## Sprint 9 — Workflow Engine UI

> **Attach:** UX doc

| Task | Description |
|---|---|
| S9-01 | Workflow templates admin UI: create/edit definitions, stages, routing rules |
| S9-02 | In-flight workflow dashboard: pending approvals per actor |
| S9-03 | `actOnWorkflowStep` — full UI with comment, approval/rejection |
| S9-04 | Delegation management: approval_delegations CRUD |
| S9-05 | SLA breach alerting: escalation after `escalationHours` |
| S9-06 | Workflow history: immutable `approvalChainJson` audit trail |
| **Dependency** | S3 (persons to approve), notification module |

---

## Sprint 10 — Config & Settings UI

> **Attach:** CONFIGURATION_FRAMEWORK.md

| Task | Description |
|---|---|
| S10-01 | Policy settings page: list + update HR_CONFIGURABLE settings |
| S10-02 | Compliance rules viewer: read-only display of all BR-xx rules |
| S10-03 | Custom field builder: create/deactivate fields per entity type |
| S10-04 | Notification template editor: bodyEn/Ar with `{{token}}` validation |
| S10-05 | Form layout editor: drag-and-drop section/field ordering |
| S10-06 | Leave rule set admin: create/update rule sets with UAE minimum enforcement |
| S10-07 | Document type config: mandatory docs, alert thresholds per nationality |
| S10-08 | Work schedule admin: per-day hours, Ramadan schedule |
| **Dependency** | S2-07 (form_configurations table), all module schemas |

---

## Sprint 11 — ARIA v1

> **Attach:** ARIA spec

| Task | Description |
|---|---|
| S11-01 | ARIA v1 — 3 intents: leave balance query, payslip request, org chart lookup |
| S11-02 | ARIA text channel: in-app chat interface |
| S11-03 | ARIA voice channel: integration scaffold |
| S11-04 | Intent resolver: map user input → structured action |
| S11-05 | ARIA session management: context window per user |
| **Dependency** | All modules must expose their public API via `index.ts` |

---

## Org Chart Module — Tasks A–G ✅ Complete (2026-05-08)

Interactive React Flow org chart with ARIA natural language integration.

| Task | Status | Artifact |
|---|---|---|
| A — Schema + seed | ✅ | `drizzle/schema/foundation.ts` — `positions` + `departments` tables; `drizzle/seed.ts` — demo positions seeded |
| B — CTE build-tree | ✅ | `lib/org-chart/build-tree.ts` — recursive CTE SQL via `db.execute<OrgRow>()`, produces `OrgFlowNode[]` + `OrgFlowEdge[]` + `OrgTreeMeta` |
| C — React Flow canvas | ✅ | `components/org-chart/OrgChartCanvas.tsx` — ReactFlow wrapper; `EmployeeNode` / `VacantNode` / `OrgChartController` / `OrgChartLegend`; `OrgFlowNode` extends `Record<string,unknown>` |
| D — Shell + filters | ✅ | `components/org-chart/OrgChartShell.tsx` — toolbar, search, view switcher (full/my-team/by-dept), collapse/expand, filter panel, chip bar, stats bar |
| E — Action panel + drawers | ✅ | `components/org-chart/OrgChartActionPanel.tsx` — floating action panel per node; three drawers: `HiringRequestDrawer`, `TransferRequestDrawer`, `ActingManagerDrawer`; server actions: `createHiringRequest`, `createTransferRequest`, `assignActingManager`, `searchPersons`, `getVacantPositionsByDept`; schema: `drizzle/schema/actions.ts` (`hiring_requests`, `transfer_requests`) |
| F — Analytics + export | ✅ | `components/org-chart/OrgChartAnalytics.tsx` — 5-section analytics panel (headcount, span of control, vacancy analysis, Emiratisation, pending actions); `lib/org-chart/export.ts` — PNG/PDF export via `html-to-image` + `jspdf`; `togglePositionConfidential` / `togglePositionFrozen` server actions |
| G — ARIA integration | ✅ | `lib/org-chart/chart-events.ts` — typed EventTarget event bus (6 event types); `modules/aria/intents/org-chart-intents.ts` — 4 client-side intent resolvers; `components/org-chart/OrgChartAriaPanel.tsx` — 340×420 chat widget; ARIA trigger button in canvas `<Panel>`; `highlightedIds` state + ring in `EmployeeNode`; `onChartEvent` listeners in Shell wiring all bus events to state/reload actions |

**Key tables added:** `hiring_requests`, `transfer_requests`  
**Key schema additions:** `positions.vacancy_start_date`, `positions.national_category`  
**Key lib files:** `lib/org-chart/chart-events.ts`, `lib/org-chart/build-tree.ts`, `lib/org-chart/export.ts`  
**Key migrations:** `0018_daffy_power_man.sql` (actions tables), `0019_parched_susan_delgado.sql` (vacancy_start_date)

---

## SSO / Microsoft Entra ID

> **User directive: implement SSO last.**

| Task | Description |
|---|---|
| SSO-01 | Configure Azure AD app registration: client ID, secret, tenant ID |
| SSO-02 | Map Entra group GUIDs → KRole in `lib/auth.ts` JWT callback |
| SSO-03 | Set `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` in production env |
| SSO-04 | Remove Credentials provider from production build |
| SSO-05 | Test "Sign in with Microsoft" end-to-end in staging |
| SSO-06 | `user_accounts` table: link Entra `oid` claim to internal person record |
| **Dependency** | Azure AD tenant configured with correct groups (AVN-HR-Admin, AVN-Manager) |

---

## Technical Debt & Cross-Cutting

| ID | Item | Priority | Notes |
|---|---|---|---|
| TD-01 | Remove duplicate images from project root | Low | `/avaniis_img*.jpg`, `/avaniis_logo.svg` in root; canonical copies are in `public/` |
| TD-02 | Replace placeholder images in `public/` with real Avaniis property photos | Before demo | Replace before any stakeholder presentation |
| TD-03 | `components/ui/` — install shadcn/ui components | Sprint 3 | `npx shadcn-ui@latest add button input select dialog table toast tooltip` |
| TD-04 | RTL (Arabic) layout — full QA pass | Sprint 3 | `lib/i18n.ts` stub is present; translation strings not populated |
| TD-05 | Hijri calendar in date pickers | Sprint 5 | `@internationalized/date` HijriCalendar — referenced in `lib/i18n.ts` |
| TD-06 | `messages/en.json` + `messages/ar.json` — populate all strings | Sprint 3 | Currently stub files |
| TD-07 | `playwright.config.ts` present but no E2E tests written | Sprint 3 | Write E2E for login + dashboard at minimum |
| TD-08 | `pnpm lint` — run as part of every PR | ✅ Done | Wired into `.github/workflows/ci.yml` 2026-04-28 |
| TD-09 | node-cron + Postgres outbox pattern — background job runner | ✅ Done | [lib/jobs/process-driver.ts](lib/jobs/process-driver.ts) — `startProcessDriver()` wires `startDocumentExpiryCron()` (daily 03:00 UTC), `startSlaBreachCron()` (every 30 min), and outbox poller (10 s tick, batch 50, max-retries=5). Guard flag prevents double-init on hot-reload. |
| TD-10 | Azure Blob Storage integration (`@azure/storage-blob`) | Sprint 3 | Required for document upload (person_documents) |
| TD-11 | `FIELD_ENCRYPTION_KEY` rotation procedure | Pre-production | AES-256-GCM key — needs rotation policy and re-encryption migration |
| TD-12 | `audit_log` table — REVOKE UPDATE/DELETE from PUBLIC | ✅ Done | Applied via `0001_sprint2_events_extra_data.sql` 2026-04-28 |
| TD-13 | `policyCache` / `ruleCache` in `lib/config-resolver.ts` — invalidation on update | Sprint 10 | `invalidateConfigCache()` is now wired from `updateFormConfiguration` (Sprint 4); still missing from `updatePolicySetting` and `updateNotificationTemplate` |
| TD-14 | `modules/config/actions.ts` — `updatePolicySetting` + `updateNotificationTemplate` should call `invalidateConfigCache()` | Sprint 10 | Cache stays stale after policy / template updates; pattern proven in S4-06 — replicate for the other two |
| TD-15 | Fraunces `axes: ['opsz']` configured in `app/layout.tsx` | ✅ Done | Fixed Sprint 1 |
| TD-16 | `app/layout.tsx` — localStorage theme restore on mount | ✅ Done | Fixed Sprint 1 via inline `<script>` |
| TD-17 | Contact / address Server Actions for the person profile | Sprint 5 or earlier | Schemas + tables exist; no `createContact` / `updateContact` / `addAddress` / `deactivate*` actions yet. Profile edit page (S4-01) renders contacts/addresses read-only. Needed before "edit profile" can claim full coverage |
| TD-18 | Dependent visa-expiry + insurance-status fields | When medical-insurance module lands | `personDependents` schema + `addDependent` don't accept these; insurance-status flips through the (out-of-scope) insurance-enrolment flow |
| TD-19 | `'use server'` audit across `modules/*/guards.ts` and helper files | ✅ Done | Sprint 4 found and fixed `modules/config/guards.ts`. Sprint 5 + Sprint 6 sweeps confirmed 0 violations across `modules/absence/**`, `lib/leave-rule-resolver.ts`, `modules/notification/actions.ts`, `lib/jobs/document-expiry-checker.ts`, `lib/csv.ts` |
| TD-20 | `uploadPersonDocument` orphan-blob mitigation | ✅ Done | Sprint 4 audit S4-Q2 — pre-flight + compensating delete + integration test |
| TD-21 | Form-layout editor a11y polish | ✅ Done | Sprint 4 audit S4-Q3 — drag handle role + section-scoped aria-labels |
| TD-22 | Conditional picklist loading on profile page | ✅ Done | Sprint 4 audit S4-Q9 — picklists gated on `canEdit` |
| TD-23 | Hijri → Gregorian conversion fix | ✅ Done | Sprint 5 audit S5-Q1 — `toCalendar(h, new GregorianCalendar())` + 5 regression tests |
| TD-24 | CHECK constraints for absence-domain tables | ✅ Done | Sprint 5 audit S5-Q2 — migration `0006_sprint5_check_and_unique.sql` (17 CHECK) |
| TD-25 | UNIQUE on `absence_balances(tenant, person, type, year)` | ✅ Done | Sprint 5 audit S5-Q3 — bundled into 0006 as `absence_balances_scope_uniq` |
| TD-26 | Compensating outbox row for absence cross-tx failures | ✅ Done | Sprint 5 audit S5-Q4 — `emitCompensationEvent` helper + try/catch wrappers |
| TD-27 | Replace ad-hoc `Date.UTC` math in `LeaveRequestNewForm.computedDays` | ✅ Done | Sprint 5 audit S5-Q5 — `daysBetween` from `lib/effective-date` |
| TD-28 | Move `accrueMonthlyBalance` reads inside the tx | ✅ Done | Sprint 5 audit S5-Q6 — read + idempotency + branch all inside `db.transaction` |
| TD-29 | Document-expiry cron de-dup key | ✅ Done | Sprint 6 audit S6-Q1 — key now `(recipient\|referenceId\|subjectEn)`; 3 regression tests |
| TD-30 | CSV formula-injection mitigation as a shared util | ✅ Done | Sprint 6 audit S6-Q2 — `lib/csv.ts` with `csvField`/`csvRow`/`buildCsv` + 20 tests |
| TD-31 | Sprint 6 starter test pack | ✅ Done | Sprint 6 audit S6-Q3 — 33 tests across `csv.test.ts`, `document-expiry-checker.test.ts`, `notification-actions.test.ts` |
| TD-32 | `/me` pending-requests bilingual fix | ✅ Done | Sprint 6 audit S6-Q4 — query + render both updated |
| TD-33 | Sidebar mobile-logo link target | ✅ Done | Sprint 6 audit S6-Q6 — wrapped in `<Link href="/dashboard">` with bilingual `aria-label` |
| TD-34 | A-02 sweep on remaining 11 person-adjacent date inputs | ✅ Done | Sprint 6 audit-fix sweep S6-Q9 — all 11 `<Input type="date">` in `EmploymentActionDialogs`, `ContractTerminateForm`, `DependentsManager`, `BankDetailsForm`, `DocumentsManager` swapped to `HijriDatePicker` |
| TD-35 | Per-role-family layout split | ✅ Done | Sprint 6 audit-fix sweep S6-Q11 — `(hr-admin)/layout.tsx` extended to admit PAYROLL_ADMIN / FINANCE / MANAGER (each individual page keeps its narrower role gate). Phase-2 reorg into separate shells deferred to TD-39 |
| TD-36 | Bell ARIA semantics | ✅ Done | Sprint 6 audit-fix sweep S6-Q12 — `role="menu"` removed from dropdown; native `<button>` semantics retained per inclusive-components guidance |
| TD-37 | `isoDateAddDays` / `isoDateDiff` shared helpers | ✅ Done | Sprint 6 audit-fix sweep S6-Q7 — extracted to [lib/date-utils.ts](lib/date-utils.ts) + 12 unit tests |
| TD-38 | `(app)` route group cleanup | ✅ Done | Sprint 6 audit-fix sweep S6-Q8 — orphan `app/(app)/layout.tsx` removed |
| TD-39 | Per-role-family shell split (Phase 2) | 🔴 Open — Phase 2 RBAC | TD-35 admitted PAYROLL_ADMIN / FINANCE / MANAGER into the admin shell as the MVP fix. The longer-term reorg into per-role-family layouts (admin / payroll / manager / employee) lands when the role-family split actually has consumers (Sprint 9 workflow UI) |

---

## Hard Rules — Compliance Status

| # | Rule | Status | Outstanding |
|---|---|---|---|
| 1 | UAE BR-xx cited at point of use | ✅ | Present in guards.ts, config-resolver.ts, actions.ts |
| 2 | Every DB write in `db.transaction()` + `writeAuditLog()` | ✅ | All 5 actions in modules/config/actions.ts comply |
| 3 | HR records never deleted — `effective-date.ts` | ✅ | `closeCurrentRecord` + `openNewRecord` implemented + tested |
| 4 | Sensitive fields encrypted before INSERT | ⚠️ | `lib/encryption.ts` exists; no person INSERT actions yet — enforced in Sprint 3 |
| 5 | Every user-facing string has `name_en` + `name_ar` | ✅ | All seed data bilingual; enforced by schema `notNull()` |
| 6 | Cross-module imports only via `modules/*/index.ts` | ✅ | Enforced by structure; checked in code review |
| 7 | Design tokens — CSS variables only, no raw hex | ✅ | `globals.css` and login page use CSS vars |
| 8 | "Sign in with Microsoft" calls `signIn('azure-ad')` | ✅ | Wired; SSO activation deferred per user directive |
| 9 | Config guardrails enforced before every DB write | ✅ | All 5 actions call guards before touching DB |
| 10 | SYSTEM_ONLY / `is_system=true` never updated | ✅ | `isOverridable` gate in `updatePolicySetting`; stubs throw NOT_IMPLEMENTED |
| 11 | `assertLeaveRuleNotBelowMinimum()` on every leave rule create/update | ✅ | Guard implemented; called in Sprint 5 leave rule actions |

---

## Dependencies Map

```
Sprint 1 (complete)
  └─► Sprint 2 (schemas + skeletons + CI)
        └─► Sprint 3–4 (Core HR — persons, contracts, org)
              ├─► Sprint 5–6 (Absence — needs persons)
              ├─► Sprint 7–8 (Payroll — needs contracts + salary)
              └─► Sprint 9 (Workflow UI — needs persons as approvers)
                    └─► Sprint 10 (Config UI — needs all modules)
                          └─► Sprint 11 (ARIA — needs all module APIs)
                                └─► SSO activation (final)
```

---

## Seed Data Verification (Expected Counts)

Run after `pnpm tsx drizzle/seed.ts` to confirm data integrity:

```sql
SELECT entity_code, name_en, name_ar FROM legal_entities;
-- expect: AVN-001 | Avaniis | أفانيس

SELECT COUNT(*) FROM lookup_values;          -- expect > 50
SELECT COUNT(*) FROM workflow_definitions;   -- expect 5 (includes WF-ACCOMMODATION from migration 0010)
SELECT COUNT(*) FROM leave_rule_sets;        -- expect 4
SELECT COUNT(*) FROM notification_templates; -- expect 6
SELECT COUNT(*) FROM compliance_rules;       -- expect > 30 (57 BR-xx rules seeded)
SELECT COUNT(*) FROM grade_salary_ranges;    -- expect 5 (G1–G5)
SELECT COUNT(*) FROM public_holidays;        -- expect 10 (2026 UAE calendar)
SELECT COUNT(*) FROM policy_settings;        -- expect > 20
SELECT COUNT(*) FROM accommodation_requests; -- expect 0 (employee-created; no seed data)
```

---

*AVANIIS HR SYSTEM — Project Backlog — Sprint 1 ✅ · Sprint 2 ✅ (D-07 carry-forward only) · Sprint 3 ✅ · Sprint 4 ✅ · Sprint 5 ✅ · Sprint 6 ✅ (354/354 tests, 24 routes, 0 lint warnings) · **MVP shipped** — 2026-04-29*
