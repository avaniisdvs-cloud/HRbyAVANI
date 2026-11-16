# AVANIIS feature inclusion and accessibility comparison

Assessment only, 15 November 2026, commit `1425336`. Read with [assessment and approval](ASSESSMENT-AND-APPROVAL.md) and [all-screen/component evidence](SCREEN-COMPONENT-INVENTORY.md).

## Interpretation

**Included** means the code/routes remain in the current GitHub repository and supplied ZIP baseline. **Runtime verified** means the named read-only flow actually rendered in the deployed preview. **Partial/gated** means an explicit stub, disconnected handler, disabled gate, absent schedule, or missing dependency was identified. **Unverified** is not the same as missing. Nothing here certifies every business action or every role.

The earlier source repository is not accessible to this account (404). Comparison against its latest unseen commits remains unavailable. Current GitHub and the working copy match exactly; the original ZIP supplies the historical baseline. No feature source loss was found in that baseline comparison.

## Complete business-module matrix

| Module directory | Included capabilities / entry points | Current verification and gaps | Classification |
|---|---|---|---|
| core-hr | Employees, profiles/new/edit, pending changes, legal entities, business units, departments, positions, grades, jobs, locations, schedules, calendars, org-chart hierarchy/actions | Employees and chart render with six records; legal-entity list and create dialog open. All CRUD/transfer/date-tracking scenarios not re-executed | Included; read flows verified; write scenarios unverified |
| directory | `/directory`, employee colleague cards | Routes included and referenced; employee role scope requires scenario testing | Included; runtime actions unverified |
| profile | `/me`, profile sections, bank details, documents, colleague detail | Included; self-service accommodations/probation pages lack literal entry references (see below) | Included; discoverability gaps |
| absence | `/absence`, balances/calendar, create/detail, rule/backdate pages, ESS leave | Leave landing renders; full entitlement/accrual/request/cancellation cycle not executed | Included; read flow verified; writes unverified |
| timesheets | personal/team timesheets and ESS wrappers | Routes and actions included; attendance/payroll integration not certified | Included; runtime business flows unverified |
| workflow | `/workflows`, approvals, queue, workflow definitions/editor, execution | Approvals landing renders; actual approve/reject/reassignment/edge cases not executed | Included; read flow verified; writes unverified |
| workflow-intelligence | operational analytics and approval insights | Source retained; analytics correctness requires seeded cases | Included; unverified |
| employee-letters | templates, letters, PDF generation/download, internal and token signing, ESS letters | Landing renders. Generation, signing and delivery not re-executed; outbound email depends on setup and is disabled in this preview | Included; partial operational verification |
| reports | reports landing and specialized dashboards, metrics/export code | Headcount report renders. Manager dashboard Approve and Reject handlers are empty | Included; specific actions incomplete |
| config | settings, appearance, branding, policy, form-layout, notifications, insurance/schedules, master configuration | Settings landing and entity dialog render. Eight legacy exported APIs throw NOT_IMPLEMENTED; not called by current app/components in static search | Included; legacy API gaps |
| auth | Auth.js, credentials, Microsoft provider, local eligibility/lockout, users/roles and MFA paths | Synthetic Super Admin credentials work. Microsoft/production identity configuration and every role/MFA path not certified | Included; provider-dependent verification |
| access | delegation/access requests and permissions logic | Routes included; privileged grants not exercised | Included; unverified |
| audit | append-only audit support, history UI, audit API | Source retained and audit history visible in list; full immutability/retention scenarios not re-executed | Included; unverified business coverage |
| compliance | compliance settings, document/expiry rules, jurisdiction helpers | Source retained; jurisdiction and expiry scenarios not re-executed | Included; unverified |
| insurance | plans, policies, employee insurance, settings | Routes/code retained; lifecycle scenarios not re-executed | Included; unverified |
| payroll | definitions, assignments, runs/new, salary elements, WPS, reports | Source pages exist. Server and public navigation flags default off. No gate changes made. Tax Tables and Benefits are coming-soon links with no pages | Included but gated; two absent UI features |
| aria | authenticated/pre-sign-in assistant, org-chart intents, provider settings | Widgets included; provider completions not tested. Document-content vector search is explicitly unavailable. Three model-provider options disabled/coming soon | Included; partial features/provider dependencies |
| notification | notifications, templates, notification infrastructure | Source retained; delivery/recipient isolation scenarios not executed. Legacy schedule-creation export incomplete | Included; partial/unverified |
| communication | configuration UI, Graph/SMTP sender, email templates/dispatcher | Source retained; preview email mode disabled and no delivery tested | Included; configuration-dependent |
| migration | Enterprise Data Hub/DataOps and Migration Factory surfaces, import validation/execution code | Data Hub loads database tree; migration/data writes deliberately not executed; role/environment console gate remains | Included; read flow observed; write flow unverified |

## Confirmed partial or absent functionality

1. **Manager report decision buttons do nothing:** `app/(hr-admin)/reports/_dashboards/ManagerDashboard.tsx:193`, handlers at lines 196 and 210 are `onClick={() => {}}`. This does not imply the separate workflow approval screens are broken. Proposed fix: wire the authorized workflow action or replace with a working link; do not show a successful mutation without action execution.
2. **Eight legacy config exports throw:** `modules/config/actions.ts:1127`–1138: `updateCustomField`, `saveCustomFieldValue`, `getCustomFieldValues`, `createLeaveRuleSet`, `updateLeaveRuleSet`, `resolveLeaveRule`, `createNotificationSchedule`, `getFormConfiguration`. Static references are only the declarations and module barrel. Separate newer action modules may implement related screens; do not equate these exports with total absence of the corresponding UI.
3. **Payroll is intentionally gated:** `lib/features/payroll-feature-gate.ts`, `config/workspace-nav.ts`. Server flag `PAYROLL_WORKSTREAM_ENABLED` and navigation mirror `NEXT_PUBLIC_PAYROLL_WORKSTREAM_ENABLED` must both be handled deliberately; visual standardization must not enable them. Validate UAT and approval scope first.
4. **Tax Tables and Benefits have no pages:** `/payroll/tax` and `/payroll/benefits` are marked comingSoon in navigation. They were not lost during import.
5. **ARIA document-content retrieval is incomplete:** `modules/aria/services.ts:648` explicitly states actual vector search of document contents is not available. Metadata assistance does not prove full document-content search.
6. **Additional ARIA provider choices are disabled:** Google Gemini, DeepSeek and Mistral are marked coming soon in `settings/ai-agent/AriaSettingsClient.tsx`. Existing selectable providers need credentials and independent flow verification.
7. **Two cron routes are not scheduled in the repository Vercel config:** org-chart snapshots and probation alerts. The three configured jobs are workflow SLA, email dispatch and future-dated activation. Endpoints can exist without automatic execution. No external scheduler was discovered or assumed by this review.
8. **Outbound communication is not verified operationally:** preview uses disabled email delivery. Microsoft identity/SMTP/Graph/provider AI need environment setup and controlled tests, not UI-only sign-off. Document storage has a Postgres implementation and can resolve to it with DATABASE_URL; lack of Azure/S3 alone does not prove uploads are absent. Upload/download durability still needs its own test.

## Source pages without a literal incoming UI reference

The scan checks app/components/config/lib TS/TSX strings. It does not prove absence of dynamically constructed links, emailed links, redirects or external entry points.

| Page | Finding | Proposed disposition |
|---|---|---|
| `/me/accommodations` | Accommodation request form and workflow source exist; no literal incoming UI reference found | Candidate missing self-service link; verify intended eligibility and workflow, then add after approval |
| `/me/requests/probation` | Probation progress/review page exists; no literal incoming UI reference found | Candidate missing self-service entry; verify active-probation eligibility and notifications, then add after approval |
| `/me/home` | A second employee dashboard exists, while the current role home is `/me` | Treat as possible legacy duplicate. Decide canonical home; do not add a duplicate menu item blindly |
| `/` | Root redirect, not an ordinary content screen | Expected utility entry, no sidebar link required |

Twenty-one record/token route patterns are included. These are not automatically orphaned: profile details, edit screens, letter signing and detail pages normally open from lists or secure links. Fifty-one more pages have literal UI/config references but no top-level workspace menu item; many are settings tiles or employee/manager entries. Forty-seven actual workspace menu routes have page implementations; no active workspace item points to an absent page. The two coming-soon payroll items are excluded from that active-route check.

## Organization Structure verification

**Included and working for Super Admin:** People → Org Chart → `/org-chart`. Rendered six people, two managers, three levels, and five edges. No missing route/component/dependency was found. The name and location differ from the expected “Employee Organization Structure” under Organization. Role-specific scoping is present; do not remove it to make the chart visible. Org-chart historical snapshot scheduling is a separate incomplete deployment integration (above).

## Inclusion accounting and limits

- Original application-directory files: 857.
- Original page routes retained: 123/123.
- Original API route handlers retained: 28/28.
- Missing application source files: zero.
- Original application-directory paths absent: eleven public assets from the retired branding/upload set. This was part of the authorized rebrand/clean preview; uploaded historical media is not restored automatically.
- Existing original files with byte differences: 419, encompassing prior rebranding/setup/UI/stability work. A byte difference is not a missing feature. Detailed behavior equivalence of every changed business function has not been certified by this read-only assessment.
- Added source/assets include shared error/scroll/connection UI, demo account/seed helpers, renamed carousel photos and official logos.
- All current 20 business-module directories are represented above.

The complete 123-page table and all component-local typography evidence are in SCREEN-COMPONENT-INVENTORY.md. JSON evidence contains each page's imported UI and reference files for follow-up investigation. It is a source-analysis aid, not a runtime audit result.

## Suggested functional acceptance work after approval

Prioritize missing entry points and inert report buttons; then confirm each role's visible routes and prohibited routes. Use fewer than ten synthetic employees to test employee create/edit, leave request → approval → balance change, timesheet approval, letter generation/signing/download, and audit records. Validate jobs in a non-production environment with no real delivery. Run payroll scenarios only after explicit scope/gate approval. Track positive, negative, validation, loading, empty and permission states separately; a page load alone is not completion.

## Complete API route inventory


| API path | Source handler | Inclusion / verification |
|---|---|---|
| `/api/attendance/sync` | `app/api/attendance/sync/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/auth/[...nextauth]` | `app/api/auth/[...nextauth]/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/cron/email-dispatch` | `app/api/cron/email-dispatch/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/cron/future-dated-activation` | `app/api/cron/future-dated-activation/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/cron/org-chart-snapshot` | `app/api/cron/org-chart-snapshot/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/cron/probation-alerts` | `app/api/cron/probation-alerts/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/cron/workflow-sla` | `app/api/cron/workflow-sla/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/audit` | `app/api/dataops/audit/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/execute` | `app/api/dataops/execute/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/nl2sql` | `app/api/dataops/nl2sql/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/saved-queries` | `app/api/dataops/saved-queries/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/schema/refresh` | `app/api/dataops/schema/refresh/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/schema` | `app/api/dataops/schema/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/tables/[schema]/[table]/[id]` | `app/api/dataops/tables/[schema]/[table]/[id]/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/tables/[schema]/[table]/rows` | `app/api/dataops/tables/[schema]/[table]/rows/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/dataops/tables/[schema]/[table]/snapshot` | `app/api/dataops/tables/[schema]/[table]/snapshot/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/documents/[id]` | `app/api/documents/[id]/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/employee-letters/download` | `app/api/employee-letters/download/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/employee-letters/download-my` | `app/api/employee-letters/download-my/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/employee-letters/employees` | `app/api/employee-letters/employees/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/employee-letters/jobs` | `app/api/employee-letters/jobs/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/employee-letters/list` | `app/api/employee-letters/list/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/health/db` | `app/api/health/db/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/health` | `app/api/health/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/persons/import/template` | `app/api/persons/import/template/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/search` | `app/api/search/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/translate` | `app/api/translate/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
| `/api/workflow/action` | `app/api/workflow/action/route.ts` | Included in both snapshots; methods/actions not all exercised in this review |
