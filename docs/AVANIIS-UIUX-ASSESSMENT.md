# AVANIIS UI/UX assessment and approval proposal

**Date:** 14 November 2026 · **Status:** approved by the user on 15 November 2026; shared rollout implemented; full acceptance remains conditional on the unverified checks below.

**Recommendation:** enhance the existing application rather than replace it. Keep its task-specific HR workflows, employee master–detail, configuration drawers, bilingual date handling and approval evidence. Apply the approved AVANIIS identity through shared tokens and components, then address responsive navigation, keyboard access, error recovery and component consistency in small verified changes.

The correct company spelling is **AVANIIS**. The current preview still contains the earlier one-i spelling and a temporary text logo. Those are recorded as proposed corrections, not changed during this assessment.

## 1. Inputs, scope and confidence

The comparison benchmark is the supplied [UI/UX master prompt, version 2.0](</Users/dorababu/Documents/UI_UX/PREMIUM_WEB_APPLICATION_MASTER_PROMPT.md>). The identity reference is the supplied [official original logo](</Users/dorababu/Documents/Avaniis Logo/Avaniis-logo-1024-ivory.jpg>). The prompt is treated as a design benchmark; its implementation instructions do not override the user's requirement to review and approve recommendations first.

The official JPEG is 1024 × 1024, 196,354 bytes. Its SHA-256 is `bd05270431761a12e7ef5f37e25afbb8de5984e20c69cdd1c3e904557593aec7`. It has not been edited, recolored, cropped, converted into a new mark, or installed in the application.

| Assessment coverage | Evidence and limit |
| --- | --- |
| Every route | 123 `page.tsx` entries inventoried and source-assessed, including aliases and signing routes. A route entry is not necessarily a distinct screen. |
| Every React interface entry | 375 product TSX files: 123 pages and 252 non-page entries. The latter include 129 shared components plus 123 page-local forms, panels, layouts and boundaries. |
| Styling and interaction scan | Global tokens, theme rules, DataOps styling, form/drawer/table primitives and page-specific styles assessed. Automated source cues are not a substitute for rendered testing. |
| Current browser review | 24 routes visited in the HR Admin session; three requests redirected to other destinations, so this is not a claim that all 24 requested screens rendered. Dashboard, People, employee detail, employee self-service, manager queue, approval detail and sign-in were also observed during the preceding walkthrough. |
| Responsive sampling | Current HR Admin dashboard sampled at 320, 360, 390, 768, 1024, 1440, 1920 and 3840 CSS px, with 900px height. The desktop route review used 1440 × 1000. This is one-page width coverage, not all-screen responsive certification. |
| Interaction spot check | Master-data drawer opening focus, reverse-Tab containment, Escape close and focus restoration verified without saving a record. |
| Dataset | Six synthetic employees, one entity, a sample payroll run and a synthetic leave request. No customer data or remote production system was accessed for this assessment. |
| Not verified | Full Arabic runtime matrix, 200% zoom/reflow, screen-reader journeys, all keyboard paths, all component states, cross-browser/touch behavior, offline/session-expiry recovery, realistic high-volume performance and external SSO/AI/email integrations. |

The complete side-by-side file-level register is [AVANIIS-UIUX-INVENTORY.md](/Users/dorababu/Avaniis/HRPayroll/docs/AVANIIS-UIUX-INVENTORY.md). It gives every route and non-page React entry a disposition, the applicable prompt sections, source evidence and a proposed approach. Repeated family recommendations are intentional: shared patterns should be enhanced once, not redesigned independently for each screen.

The current application is locally available at [localhost:3001](http://localhost:3001). UI source files were fingerprinted at the start of this assessment. Product TSX/CSS implementations are to remain unchanged through delivery of this assessment. New assessment documents and screenshots are separate review material.

## 2. What should be retained

| Existing strength | Master prompt comparison | Disposition and rationale |
| --- | --- | --- |
| Searchable people list with adjacent employee detail, cohort/entity/department filters and profile tabs | §§5–7 favor contextual work and progressive disclosure. A generic dashboard would add navigation and hide employee context. | **Retain** the task model. Enhance narrow-screen list/detail switching and keyboard tab behavior. [Source](/Users/dorababu/Avaniis/HRPayroll/app/(hr-admin)/persons/EmployeesMasterDetail.tsx:3). |
| Five-stage employee creation and privacy-aware draft recovery | §§6–7 require preserved work and explicit validation. The existing form is richer than a generic form template. | **Retain** sections, consent, validation and draft safeguards. Improve error navigation and shared form layout. [Form](/Users/dorababu/Avaniis/HRPayroll/app/(hr-admin)/persons/new/PersonNewForm.tsx:1), [draft hook](/Users/dorababu/Avaniis/HRPayroll/hooks/useDraftSave.ts:1). |
| Master-data drawers with opening focus, focus trap, Escape and restoration | §§6,10–11 call for bounded, accessible interactions. These behaviors were also observed in the browser. | **Retain** the mechanics. Add logical RTL positioning, localized accessible naming and dirty-state protection. Rewriting the drawer from scratch is not justified. [Source](/Users/dorababu/Avaniis/HRPayroll/components/mdm/MdmDrawer.tsx:1). |
| Change reasons, history/diffs, disable/enable and effective-date actions | §8 asks for accountable state transitions and preserved baselines. | **Retain**. A visual refresh must not replace these with destructive CRUD or remove audit evidence. [Components](/Users/dorababu/Avaniis/HRPayroll/components/mdm/MdmChangeHistory.tsx:1). |
| Named approvers, request evidence, SLA and decision history | §§8,12 require responsibility and trustworthy state. | **Retain** the reusable timeline and status vocabulary; improve action placement and recovery. [Source](/Users/dorababu/Avaniis/HRPayroll/components/workflow/WorkflowTimeline.tsx:1). |
| Gregorian/Hijri conversion and Arabic font support | §§7,11 require locale-aware dates and Arabic support. This exceeds a generic date input. | **Retain** conversion and wire format. Enhance accessible label associations, localized hints and bidi testing. [Date picker](/Users/dorababu/Avaniis/HRPayroll/components/forms/HijriDatePicker.tsx:1). |
| Organization canvas with contextual inspector, filters and export | §2's canvas/inspector principle suits hierarchy work; it does not imply every screen needs a canvas. | **Retain** the specialized experience. Add a keyboard/list alternative and mobile focus mode. [Source](/Users/dorababu/Avaniis/HRPayroll/components/org-chart/OrgChartShell.tsx:1). |
| Role-specific employee, manager and administrator experiences | §§1,5 require a task/persona model before dashboards. | **Retain** different task emphasis. Unify behavior/tokens, not the visibility of all admin functions. [Shell](/Users/dorababu/Avaniis/HRPayroll/app/(hr-admin)/layout.tsx:1). |
| Existing Radix/shadcn primitives, Lucide icons and semantic token bridge | §§4,10 favor component variants and consistent states. | **Retain** the stack. There is no evidence-based reason to install another UI library. [Button](/Users/dorababu/Avaniis/HRPayroll/components/ui/button.tsx:1), [tokens](/Users/dorababu/Avaniis/HRPayroll/app/globals.css:27). |
| Explicit unavailable/empty states | §§10,12 prohibit fake success or invented data. The letters page honestly says no letter types are configured; the recommendation panel identifies unavailable AI advice. | **Retain** honesty. Add role-appropriate setup/retry links where useful; do not fill empty states with fabricated activity. |

![Current employee workspace; original application layout retained](/Users/dorababu/Avaniis/HRPayroll/evidence/avaniis-assessment/people-desktop.jpg)

The screenshot records the current implementation, not a proposed design. It is not evidence that loading performance has been benchmarked.

## 3. Side-by-side comparison by UI area

| Area | Existing implementation | Supplied requirements | Gap / difference | Proposed disposition and approach |
| --- | --- | --- | --- | --- |
| Company identity | Temporary text logo and earlier spelling appear in metadata, navigation and company data. | Exact original supplied logo; AVANIIS spelling; separate company/product/tenant identity (§§4,14). | Placeholder identity differs from the supplied artwork and name. | **Replace** the placeholder asset and **Enhance** identity configuration after approval. Preserve the original logo file and ordinary accessible brand text; confirm Arabic/legal names separately. |
| Brand palette | Default accent `#2E6170`, workspace `#F0F2F5`, dark navigation tokens and seven accent choices. | Ivory `#F9F6F0`, white panels, navy primary/text, restrained green/gold; no forest-heavy chrome (§14). | The token architecture is useful; the default palette is not the requested preset. | **Replace** default token values after approval, **Retain** token names/bridge and status semantics. Validate existing saved themes rather than silently overriding them. |
| Logo scale | Current wide temporary wordmark fits a small rail slot. | Supplied official logo is a complete square composition (§14). | Simply swapping image files would shrink the wordmark excessively in a 44px collapsed slot. | **Enhance** placement: full original logo on a suitably sized ivory brand area; collapsed navigation may use a standard Home control with an accessible AVANIIS label. A cropped symbol or invented logo variant needs separate approval. |
| Typography | Inter body, Fraunces headings, JetBrains Mono identifiers, Noto Sans Arabic. Many metadata labels are 11–13px. | Readable 14–16px body, numeral alignment, Arabic/long labels; no mandated font family (§4). | Good multilingual foundation; small secondary/uppercase labels and inconsistent heading sizes need review. | **Retain** the font families initially. **Enhance** semantic type scale, tabular money and text enlargement. Replacing fonts merely for novelty would add risk without demonstrated benefit. |
| Navigation | Administrator rail + secondary navigation, separate manager/employee sidebars and mobile bottom bar. | Coherent compact shell, contextual location, responsive task navigation, no redundant navigation (§5). | Role specialization is useful; admin sidebars remain present at narrow widths and clip essential content. Some topbar labels fall back to “Overview” on other screens. | **Enhance** the shell and **Replace** its narrow-screen breakpoint strategy. Keep role routes; use drawer navigation and compact context controls on smaller widths. |
| People workspace | Specialized master–detail with employee filters and profile tabs. | Contextual disclosure, relevant actions and preserved navigation context (§§5–7). | Strong desktop match; fixed 340px list plus shell creates small-screen pressure. | **Retain** master–detail. **Enhance** mobile list → detail navigation, URL selection/back behavior and semantic keyboard tabs. |
| Forms | Native/shared inputs coexist with many inline field layouts; draft handling exists in key HR forms. | Semantic widths, linked validation, error summary, explicit actions, keyboard support (§§6–7). | Useful business validation but inconsistent label association, error focus and field sizing. | **Enhance** reusable form sections and field contracts. **Introduce** focused error summaries; retain validation, consent and saved drafts. |
| Tables | Shared table wrapper, custom page tables, sort/filter controls and exports. | Relevant columns, keyboard sorting, priority columns or bounded table scroll, numeric alignment (§7). | Shared sorting uses a click handler directly on `<th>`; data/empty states and widths vary. | **Replace** sort activation mechanics with a native button inside the header; **Enhance** table contracts and mobile priority columns. Keep actual sorting/query behavior. |
| Drawers and dialogs | MDM drawer has verified focus mechanics; other dialogs are bespoke. | Named, keyboard-operable bounded decisions with focus restoration (§§6,10–11). | Drawer edge is physically `right: 0`, accessible name is English; letter preview lacks the same focus/Escape/naming mechanics. | **Enhance** MDM RTL/name handling. **Replace** the letter-preview modal mechanics with the existing accessible dialog primitive, retaining its content renderer. |
| Approvals | Inbox, evidence, named owner, SLA, chain and top/bottom action forms. | Real state machines, clear responsibility, focused decisions and trustworthy persistence (§8). | Desktop duplicated action panels may be convenient but increase cognitive/tab-order load. The earlier generic-inbox balance issue requires a full end-to-end retest after its pre-assessment routing fix. | **Retain** workflow evidence. **Enhance** one clear responsive decision area, rejection reason, pending/error feedback and result verification. No automatic approvals are proposed. |
| Document review | Generated letters, templates/tokens, PDF/HTML modal, signing/status lifecycle. | Split-pane anchored review/versioning for document-heavy workflows (§8). | Existing letter workflows do not establish a need for a full document-collaboration product. | **Retain** letter generation and signing. **Introduce** annotation/redline/version comparison only if the relevant customer task is approved. |
| Motion | Four-second login carousel, Ken Burns keyframes, continuous ticker and page transitions. | Purposeful motion, no continuous decoration, reduced-motion support (§9). | No reduced-motion hook/media rule was found in product TSX/global CSS during the scan. | **Replace** continuous default motion with static/optional presentation; **Introduce** reduced-motion behavior. Retain short state/focus transitions where helpful. |
| Assistant | Floating draggable ARIA launcher, chat/voice and role-specific panels. | Permission-scoped assistance that does not cover critical actions (§10). | At the sampled narrow layout the launcher overlaps the mobile-navigation region; drag-only positioning is insufficient for keyboard users. | **Enhance** reserved docking/safe areas, keyboard placement/dismissal and unavailable states; preserve permissions. Do not add a custom cursor. |
| Feedback/recovery | ErrorAlert, toasts, key-form drafts, two route loading boundaries and two error boundaries. | Loading/empty/error/offline/session-expiry/retry state contracts across screens (§§6,10,12–13). | These states are not consistently specified across all modules. Two loading files do not mean other screens have no loading state; inline loading also exists. | **Retain** useful feedback components. **Introduce** a shared state catalog, network/retry/session-expiry patterns and consistent focus announcements. |
| Accessibility/RTL | Arabic strings/fonts, locale provider, focus-aware drawer and some alert/dialog semantics. | WCAG 2.2 AA, screen reader/keyboard, bidi, touch, zoom and eight-width testing (§11). | Prior historical claims are not fresh evidence. Pointer-only headers, unnamed controls and physical-edge CSS need correction; full matrix is unrun. | **Enhance** and revalidate. Do not claim compliance based on passing unit tests or screenshots. |
| Trust and scope | Role gates, entity-scoped actions, audit trail and a local-demo note on sign-in. | Explicit environment, trustworthy statuses and separation of simulated/live data (§12). | The six synthetic employees are not persistently labelled as synthetic inside the application shell. | **Introduce** a quiet local/synthetic environment label near scope; **Retain** RBAC, audit and separate calculation/approval/payment states. |
| Operational dashboards | Real counts, role-specific reports, clear empty letter state and feature flags. | Task-based performance and meaningful KPIs, units/date/freshness (§§1,13). | No measured task baseline or all-state performance acceptance was established. Some placeholders consume prime space. | **Retain** real metrics and exports. **Enhance** explicit period/freshness and relevant task actions; remove/hide placeholders only after agreeing the role's tasks. |

## 4. AVANIIS brand proposal — approval required

These are the exact values supplied in the master prompt; they are not colors guessed from JPEG pixels.

| Semantic use | Current baseline | Proposed value | Decision / constraint |
| --- | --- | --- | --- |
| Workspace background | `#F0F2F5` | `#F9F6F0` ivory | **Replace** default surface token. |
| Panels | `#FFFFFF` | `#FFFFFF` | **Retain**. |
| Primary text and primary action | Ink `#151A22`; teal action | `#17212B` navy | **Enhance** separate action/text tokens with clear hover/focus/disabled variants. |
| Small brand accent | Teal accent scale | `#438A35` leaf green | **Replace** accent treatment; avoid normal-size green text on white. |
| Active text/icons | Teal values | `#2F6B32` | **Enhance** active state with text/indicator, not color alone. |
| Hover surface | Existing accent tints | `#EDF5EA` | **Replace** hover tint after full focus/contrast checks. |
| Gold accent | Mixed local values | `#E9A028` sparingly | **Enhance** small emphasis only; not a default body-text color or automatic warning substitute. |
| Borders | `#E5E8EC` | `#E6E2DB` | **Replace** decorative borders; separately validate necessary input boundaries/focus rings. |
| Default navigation | Dark rail / role sidebar variants | White/ivory with thin active indicator | **Enhance** role shells without making a forest-green sidebar. |
| Logo | Temporary SVG wordmark | Original supplied JPEG, unchanged | **Replace** asset only after placement approval. Do not regenerate/recolor/crop. |
| Font families | Inter/Fraunces/JetBrains Mono/Noto Sans Arabic | Keep pending approval | **Retain**; master prompt does not require a new family. |
| Status colors | Dedicated pending/approved/rejected/draft tokens | Retain semantic roles; contrast-check values | **Retain/Enhance**. Brand gold/green must not erase status distinctions. |

Calculated sRGB contrast examples: navy on ivory **15.11:1**; active green on white **6.42:1**; leaf green on white **4.26:1**; gold on white **2.21:1**; navy on gold **7.39:1**. These calculations cover these pairs only, not full component conformance. Normal-size text requires at least 4.5:1 under the relevant WCAG AA criterion, so use navy/active green for ordinary labels rather than the lighter leaf green or gold. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Brand layers should be explicit: **company identity → product design tokens → tenant/customer configuration → approved personal appearance preferences**. None may change permissions or business rules. Whether customers may replace the AVANIIS logo, and whether dark/system modes remain available, are approval decisions rather than assumptions. The supplied JPEG needs an ivory support area; an alternate transparent/compact/monochrome official asset must be supplied or approved separately.

## 5. Three design directions to compare

All concepts must use the same six synthetic employees and the same employee-leave, manager-approval and payroll-review tasks. No customer research or task-time benefit is claimed here. These are proposed directions, not installed interfaces.

| Concept | Layout / scenario | Strength | Cost / limitation | Recommendation |
| --- | --- | --- | --- | --- |
| A — Focus workspace | Compact role-aware navigation; contextual secondary navigation only when needed; employee list + selected profile; mobile list/detail stack. | Builds on the strongest current pattern; short path between related records; bounded density. | Needs deliberate breakpoints and a clear scope/breadcrumb model. | **Recommended default**. Enhance the present shell rather than replace it. |
| B — Operational command center | Prioritized action queue with headcount/leave exceptions; payroll period + run status dominate the payroll role's entry view. | Good for manager and payroll work at the start of a task. | A universal KPI dashboard would add noise for employees and master-data editing. | Use selectively as role home pages, not as a universal shell replacement. |
| C — Document/review workspace | Readable letter/evidence pane with contextual decision/activity pane; mobile switches between document and decision. | Good for approvals or approved review-heavy document scenarios. | A full annotation/redline system adds new requirements, permissions and version semantics. | Keep for relevant review screens. Introduce richer collaboration only if justified and approved. |

Recommended mix: **A as the common shell**, **B for role entry priorities**, **C for review tasks**. It preserves existing strengths without imposing the same layout on every module. Consistent navigation form/behavior and shorter task travel also align with the [Ant Design navigation guidance](https://ant.design/docs/spec/navigation/).

## 6. Role/task model to preserve

| Role | Top task and scope | Current strength | Enhancement to approve |
| --- | --- | --- | --- |
| Super Admin | Platform setup, company identity, access and migration | Separate privileged tools and branding controls | Strong environment/scope labels; grouped business vs technical settings; preserve restricted routes. |
| HR Admin | Find/create/update employees, leave/lifecycle operations | Master–detail, drawers, draft recovery | Accessible error navigation, clear entity context, mobile record workflow. |
| HR Director | Cross-entity oversight, policy decisions | Source contains role-specific report/configuration access | Explicit cross-entity/as-of scope, prioritized exceptions; not runtime-tested with a seeded director account. |
| Payroll Admin | Review a pay period, calculate/reconcile runs, WPS staging | Explicit run stages and financial summaries | Entity/currency/period anchoring, numeric table priority, consistent iconography and recovery. |
| Finance | Financial reporting and relevant review | Separate source role and reports | Clear read/action capability; not runtime-tested with a seeded finance account. |
| Manager | Team visibility and assigned decisions | Team dashboard, named inbox and SLA | One focused decision area, required reason where applicable, reliable return-to-queue feedback. |
| Employee | Own profile, leave, letters, documents and timesheet | Smaller self-service task model | Clear personal scope, mobile primary task, meaningful balances and accessible dates. |

There are seven supported roles but six synthetic employee records; two preview users are ordinary employees. No role expansion or permission redesign is proposed.

## 7. Journey comparison and recovery requirements

| Journey | Existing path | What to retain | Proposed enhancement / acceptance evidence |
| --- | --- | --- | --- |
| Normal | Employee → new leave → dates/reason → Draft or Submit → named manager → approval history | Explicit separation of Draft, Pending and Approved; named owner; balance visibility | Preserve values on error; linked field validation; confirm persisted request, workflow and balance values together; return to the relevant list with clear feedback. |
| Exception | Invalid/missing date, insufficient balance, unavailable certificate/provider, unauthorized page | Server validation, business rules, honest unavailable states | Use focused field-error summary plus matching inline errors; explain the next allowed step; do not label permission redirects as successful completion. |
| Recovery | Restore a saved employee/leave draft; retry a failed action; session expires before submission | Existing draft restore and disabled-in-flight actions | Preserve non-sensitive work, re-authenticate safely, retry with duplicate protection, show whether the action was persisted before asking the user to resubmit. |
| Payroll | Choose period/entity/payroll → create draft → calculate → inspect totals and employee lines | Calculation/approval/confirmation are distinct steps; role and feature gates | Expose scope/currency and total reconciliation; keyboard-operable table; no simulated bank success; later stages require their own acceptance tests. |
| Document | Choose letter/template → preview → generate/download → optional signing | Template tokens, render pipeline and signing state | Exact approved identity on documents, named accessible preview dialog, expired/revoked/error states; rich comments/redlines remain optional. |

The error-summary recommendation is a pattern to adapt, not a requirement to copy another product's visual styling. GOV.UK's reference pairs a focused summary with corresponding inline errors. [Error-summary guidance](https://design-system.service.gov.uk/components/error-summary/).

## 8. Prioritized gaps and evidence

Priorities describe proposed acceptance work, not authorization to perform it. **P1** blocks an affected task or acceptance criterion; **P2** is a meaningful consistency/usability issue; **P3** is optional refinement.

| ID | Priority | Finding / evidence | Disposition | Acceptance condition |
| --- | --- | --- | --- | --- |
| U01 | P1 | At 320/360/390px the admin rail and secondary nav remain visible; the main heading starts near x=316 and important actions extend beyond the viewport. At 768px user/locale controls still extend offscreen. Document width staying equal to viewport hides this clipping from a simple overflow check. [Layout](/Users/dorababu/Avaniis/HRPayroll/app/(hr-admin)/layout.tsx:112), [evidence](/Users/dorababu/Avaniis/HRPayroll/evidence/avaniis-assessment/dashboard-360.jpg). | **Enhance shell / Replace breakpoint mechanics** | Primary task, navigation and account controls reachable without clipping at all required widths and at 200% zoom/reflow. |
| U02 | P1 | Shared `SortableHeader` activates sorting on a `<th>` with no native button/tab stop/key handler. [Source](/Users/dorababu/Avaniis/HRPayroll/components/ui/SortableHeader.tsx:20). | **Replace activation mechanics** | Sorting works with keyboard and pointer; direction is announced; resizing has an accessible alternative if retained. |
| U03 | P1 | Bilingual business-name fields are correctly linked, but other visible fields (including shared Gregorian date rendering) lack consistent `htmlFor`/input-id association. The date picker renders a label independently of an unnamed input. [Source](/Users/dorababu/Avaniis/HRPayroll/components/forms/HijriDatePicker.tsx:151). | **Enhance** | Every relevant control has a correct accessible name, required/error association and keyboard input path. |
| U04 | P1 | The supplied official identity is not installed; the preview uses the earlier spelling and a placeholder logo. | **Replace asset / Enhance configuration** | AVANIIS spelling and exact original artwork are used at approved sizes across app metadata, navigation and configured document outputs. |
| U05 | P1 acceptance gate | Prior generic-inbox approval changed request status without completing the domain balance update. A routing correction and four tests were added before this assessment; the new browser-to-ledger path still needs an end-to-end retest. Earlier synthetic data was reconciled with audit evidence. | **Retain domain workflow; verify correction** | No approval is accepted until request, workflow, pending/taken/closing balance and audit evidence agree; include rejection/cancellation/concurrency paths. This is not fixed by visual redesign. |
| U06 | P2 | Continuous ticker/carousel/Ken Burns motion; reduced-motion support not found in the source scan. [Login](/Users/dorababu/Avaniis/HRPayroll/app/(auth)/sign-in/_LoginClient.tsx:156), [CSS](/Users/dorababu/Avaniis/HRPayroll/app/globals.css:286). | **Replace defaults / Introduce reduced motion** | No continuous required decorative motion; optional motion can be stopped; reduced-motion preference respected. |
| U07 | P2 | `MdmDrawer` uses physical right edge and English `aria-label`; the letter-preview modal does not implement equivalent focus/Escape/named-close mechanics. [Drawer](/Users/dorababu/Avaniis/HRPayroll/components/mdm/MdmDrawer.tsx:125), [preview](/Users/dorababu/Avaniis/HRPayroll/components/employee-letters/LetterPreviewModal.tsx:40). | **Enhance / Replace modal mechanics** | Localized accessible names, mirrored intended placement, focus trapping/restoration, Escape and safe unsaved-state close. |
| U08 | P2 | Source scan found 1,290 hex-literal occurrences in 128 product TSX files. Includes semantic exceptions/fallbacks; this is a review scope indicator, not 1,290 proven defects. | **Enhance** | Normal, hover, disabled, error, dark and print states use approved semantic tokens; justified chart/status exceptions documented. |
| U09 | P2 | Local small/uppercase labels, non-4px spacing and page-specific button/table variants vary. Functional emoji also appear in payroll and other controls. | **Enhance / Replace functional emoji** | Consistent type/spacing/controls; icons use the existing library and accessible labels; long Arabic labels remain usable. |
| U10 | P2 | Assistant launcher overlaps the bottom navigation region in the sampled narrow layout. [Evidence](/Users/dorababu/Avaniis/HRPayroll/evidence/avaniis-assessment/dashboard-360.jpg). | **Enhance** | Essential mobile navigation/actions are unobscured; keyboard users can dismiss/reposition assistance. |
| U11 | P2 | Sign-in labels local preview, but authenticated task screens lack a persistent synthetic-data label. | **Introduce** | Scope/environment consistently visible; synthetic, calculated, approved and live states distinguishable. |
| U12 | P2 | No shared linked field-error summary or skip-to-main pattern was found; offline/session-expiry recovery is not established as a shared contract. | **Introduce** | Keyboard focus and announced feedback lead to correction/recovery without losing safe draft content. |
| U13 | P2 | Legal-entity topbar shows “Overview”; several settings requests redirect for the HR Admin role. | **Enhance** | Titles/breadcrumbs reflect the actual task; menu choices match capability, while server permission gates remain authoritative. |
| U14 | P2 | Blank letter configuration is correctly reported; current data does not support validating generated-letter previews/signing. | **Retain honest empty state / Enhance setup guidance** | Authorized setup action is discoverable; document/signature journeys validated after approved sample templates exist. |
| U15 | P3 | Full document comments/redlines/revision anchors are not established by current letter workflows. | **Introduce — optional** | Add only against an approved document-review task, permission/version model and acceptance criteria. |

No screen-reader certification or broad WCAG pass is claimed. The criteria and acceptance language should be checked against [WCAG 2.2](https://www.w3.org/TR/WCAG22/) during implementation QA.

## 9. Responsive and QA evidence matrix

| Width | Dashboard observation | Current verdict for this sample |
| --- | --- | --- |
| 320 | Both navigation columns consume almost all available width; heading/actions offscreen. | **FAIL** for usable primary task. |
| 360 | Same clipping; assistant overlaps the bottom-navigation region. | **FAIL**. |
| 390 | Heading, account/locale and primary controls remain outside view. | **FAIL**. |
| 768 | Account/locale controls extend outside the viewport. | **FAIL** for accessible account controls. |
| 1024 | No sampled `h1/button/link/input` horizontally offscreen in this dashboard check. | **CONDITIONAL PASS** for sampled horizontal geometry only. |
| 1440 | No sampled primary-control horizontal clipping; desktop layout usable for review. | **CONDITIONAL PASS** for sampled geometry only. |
| 1920 | No sampled primary-control horizontal clipping. | **CONDITIONAL PASS** for sampled geometry only. |
| 3840 | No sampled primary-control horizontal clipping; wide-screen density/readability still needs a human task review. | **CONDITIONAL PASS** for sampled geometry only. |

Measurements include element geometry because `overflow: hidden` can clip a control while the document still reports no horizontal overflow. Screenshots and raw DOM geometry are kept in [responsive evidence](/Users/dorababu/Avaniis/HRPayroll/evidence/avaniis-assessment/responsive-dashboard.json).

| Test dimension | Status |
| --- | --- |
| All route/component source inventory | Completed; specific source cues are assessment evidence only. |
| HR Admin read-only route sampling | 24 requests logged; redirects identified. No forms submitted during this assessment. |
| Drawer focus trap/Escape/restore | Spot check passed; not every dialog tested. |
| TypeScript / unit/integration suite | See final validation addendum. These do not establish UX/accessibility acceptance. |
| Post-fix leave UI → API → balance retest | **NOT VERIFIED** at the assessment freeze. |
| 200% zoom, full Arabic matrix, screen reader, keyboard-only full journeys | **NOT VERIFIED**. |
| Touch and all target browsers | **NOT VERIFIED**. |
| Realistic-volume performance and task success/time baselines | **NOT VERIFIED**. |
| Independent QA | Not performed. This is the same agent's assessment/self-review; no independent reviewer or customer research is claimed. |

## 10. Approval packages and implementation order

| Package | Proposed scope | What stays intact | Approval required |
| --- | --- | --- | --- |
| A — Identity and tokens | Correct AVANIIS spelling, install exact original logo at approved placements, adopt ivory/navy/green/gold semantic mapping, align document branding configuration. | Routes, records, role checks, schema, state machines, existing font families initially. | Approve name/logo placement, palette, Arabic/legal naming and theme policy. |
| B — Shell and accessibility | Responsive navigation, context titles, keyboard sorting, linked labels, error summary, skip link, dialog mechanics, assistant safe area and reduced motion. | Role-specific task models, master–detail, drawer histories, date conversion and underlying UI library. | Approve Concept A-based shell behavior and shared component contracts. |
| C — Module refinement | Harmonize employee, leave, payroll, reports, settings and document screens using approved shared components. | Business rules, audit/history and effective-date semantics. | Review representative vertical slices before wider application. |
| D — Optional capabilities | Rich document collaboration, additional command-center functions or new charts only where tasks justify them. | Existing simpler task flows remain available. | Separate product scope and acceptance approval; do not bundle into a branding refresh. |

Suggested sequence after approval: identity/tokens → one employee workflow and one approval screen as reference slices → shell/keyboard/mobile fixes → module rollout → complete failure/RTL/theme/performance matrix → independent QA and handover. No production deployment is included in this assessment approval.

Decisions for review:

1. Adopt the supplied Premium Hybrid palette with **Concept A** as the base shell, while retaining role-specific dashboards and review layouts?
2. Keep the existing font families initially, with a unified readable type scale?
3. Use the complete original logo in an ivory brand area, with no cropped/generated small-mark variant?
4. Confirm the Arabic company name, legal entity name and whether personal dark/system modes or customer white-label overrides should be available.
5. Approve packages A/B first; review module slices before C; keep D outside the initial scope?

These are review decisions, not a request to approve an unspecified rewrite. The user approved the recommendations on 15 November 2026. Packages A–C are authorized; optional new product capabilities in D remain outside this rollout.

## 11. Validation addendum

The full test run reported **182 test files passed, 3,298 tests passed, 36 skipped and 7 TODO**. A TypeScript-only issue in the new regression test's query options was corrected without changing application UI behavior. The final `pnpm typecheck` passed, and all four focused approval-routing regression tests passed again. Product UI source fingerprints confirm zero implementation changes during the assessment.

The current application source remains a local working copy imported from a ZIP, with no Git commit history. Historical release/certification documents are not treated as acceptance evidence for this copy. Build, cloud configuration, customer deployment and external service validation are separate gates.


## Approved implementation log — 15 November 2026

- Identity: exact official logo installed; canonical AVANIIS spelling applied.
- Shared foundation: approved ivory/white/navy/green palette, retained font families, shared caption/body scale, readable placeholders, numeric alignment, shared scrollbar tokens and dark variants. Small inline typography normalized across 250 TSX files; generated letter/PDF typography is excluded from that normalization.
- Shell: attached responsive hooks to actual sidebars; mobile role-specific navigation uses the accessible dialog primitive; skip links and main targets; local synthetic-data scope label.
- Components: native sortable-header buttons; keyboard profile tabs; date label associations; logical/localized MDM drawer; accessible letter-preview dialog; error summary in employee creation.
- Motion: automatic sign-in carousel/ticker motion removed; reduced-motion preference respected.
- Verification is recorded separately. This log does not claim full WCAG conformance, independent QA, or completion of every deferred per-screen refinement.


## Rollout verification — 15 November 2026

The approved shared foundation and component rollout is installed in the compiled local preview. Small typography, active text, grids, tables and inherited themes were updated across module families; no HR workflow rules were redesigned. The exact original logo remains unchanged.

| Check | Result | Scope / limitation |
| --- | --- | --- |
| Production build and TypeScript | PASS | Existing build lint warnings remain. |
| Automated suite | PASS | 186 test files; 3,306 passed, 36 skipped, 7 TODO. |
| Inline React styles | PASS | 378 TSX files / 7,601 styles / zero conflicts; 62 dynamic styles need runtime coverage. |
| Screen-load smoke | PASS within seeded scope | 117 route templates requested using admin/employee accounts; no runtime error pages or captured console warnings/errors. One exit-clearance detail has no demo record. Six other record/token-dependent templates lack demo records. |
| Responsive sample | PASS | Dashboard, People, new leave, Settings and payroll runs at 320/360/390/768/1024/1440/1920/3840 CSS px; 40 checks, no page or main-content horizontal overflow. This is not all-screen responsive certification. |
| Typography/color/scrollbars | PASS in rendered sample | Shared Inter 14px body, navy/ivory light tokens and common scrollbar colors; Arabic leave table uses Noto Sans Arabic and RTL. Dark employee view resolves dark text, surfaces, menus and scrollbar tracks consistently. |
| Interaction checks | PASS in sampled controls | Mobile menu focus/Escape restoration, arrow-key profile tabs, Enter-key sorting, Arabic table containment. |
| Document runtime packaging | PASS on retest | Fixed bundled sanitizer dependency asset lookup; letter-template page renders and fresh server log is clean. |
| Independent/full acceptance | NOT VERIFIED | All-state RTL/zoom/screen reader/cross-browser, external integrations, offline recovery and realistic-volume/performance matrix remain outside the evidence collected. |

See [machine-readable verification summary](/Users/dorababu/Avaniis/HRPayroll/evidence/avaniis-uiux/verification-summary.json), [desktop view](/Users/dorababu/Avaniis/HRPayroll/evidence/avaniis-uiux/dashboard-desktop.jpg), and [mobile view](/Users/dorababu/Avaniis/HRPayroll/evidence/avaniis-uiux/dashboard-mobile.jpg). Optional new product capabilities in package D remain excluded.
