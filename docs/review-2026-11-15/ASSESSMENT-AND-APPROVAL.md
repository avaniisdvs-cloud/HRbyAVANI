# AVANIIS application consistency and feature assessment

Review date: 15 November 2026. Application baseline: `14253362169eb7aaf3415aa126cb002273a33f99`.

**Approval status: proposals only.** This review changes documentation only. No application UI, navigation, permissions, environment settings, data, or deployment is changed. Earlier UI approval does not override the new instruction to assess first.

## 1. Evidence and coverage

- Current GitHub `avaniisdvs-cloud/HRbyAVANI/main` and local HEAD match exactly at the baseline above; working tree was clean when review began.
- Compared all application directories in the original supplied ZIP with the current working copy: 857 original files; all application source retained; 123/123 pages and 28/28 API routes retained. Eleven absent original public assets are the retired branding images and uploaded assets, not source features. Three carousel photographs have renamed AVANIIS counterparts and the official logo has replaced the previous artwork.
- The earlier repository URL returns GitHub 404 to the authorized account. Its latest remote contents cannot be certified from this account. The ZIP comparison establishes inclusion from the supplied snapshot, not parity with inaccessible newer commits.
- Static inventory covers all 123 pages and 378 TSX UI files. The attached inventory lists each page, heading evidence, imported UI variation counts, entry-point evidence, and local style declarations with source lines.
- Live read-only Super Admin review: Employees, Legal Entities and its create dialog, Dashboard, Leave, Workflows, Employee Letters, Reports, Administration, Data Hub, and Org Chart. Opened but did not submit the create dialog. No business writes were exercised. Role-specific write actions, external services, all detail states, Arabic/dark-mode combinations, and every role require later functional acceptance testing.
- Preserve six synthetic employees. This assessment does not authorize changing reporting relationships, payroll settings, or role permissions.

## 2. Employees reference: retain the design language, refine its weak spots

Source: `app/(hr-admin)/persons/page.tsx` and `EmployeesMasterDetail.tsx`; tokens: `app/globals.css`; font loading: `app/layout.tsx`.

| Role | Existing benchmark | Proposed standard |
|---|---|---|
| Main page heading | Fraunces, weight 600, ink-1; local declaration 26px | One shared PageHeader. Keep responsive global heading scale, weight 600, consistent margins |
| Measured heading at 1280px viewport | 28.16px; global `main h1` clamp overrides inline 26px | Preserve responsiveness; remove contradictory inline heading sizes when approved |
| Body/count/filter labels | Inter; body token 0.875rem = 14px at default root; secondary/muted ink | Body 14px/1.5; controls 14px medium/semibold; captions 13px/1.5 |
| Employee detail name | Fraunces 21px, weight 650, 1.2 line height | Detail title 21px/650; reserve serif for titles, not every navigation link |
| Employee list names | Inter semibold; supporting job title muted | Keep two-level hierarchy; name and supporting text use shared tokens |
| Codes | JetBrains Mono; caption size | Retain mono for IDs, technical data, tabular identifiers |
| Arabic | Noto Sans Arabic supplied globally | Retain Arabic-specific typography and RTL; do not force Latin serif onto Arabic |
| Surface | bg #F9F6F0; card white; surface #F5F2EC; border #E6E2DB | Retain warm ivory canvas, white cards, soft neutral borders |
| Text | ink-1 #17212B; ink-2 #3E4855; ink-3 #606E7A | Use semantic tokens; keep selected/disabled/error roles distinct |
| Selection | pale green accent-050 #EDF5EA; brand-active #2F6B32 | Same active/selected behavior in filters, tabs, and navigation |
| Actions | navy accent background; 600–650 weight; 7–9px radii | Shared primary/secondary/destructive button variants; no page-local substitutes |
| Rhythm | header gap 4px; bottom 18px; detail padding 22/24px; 14–16px content gaps | 4/8/12/16/24/32 spacing scale; documented exceptions for dense tools |
| Scrollbars | global themed track/thumb with hover/active states | Retain shared behavior; audit custom editor/chart scroll areas in both themes |

Retain master-detail selection, searchable filters, clear status pills, tabbed detail, and keyboard focus support. These are strengths. Do not force every module into a master-detail layout: tables, calendars, workflow editors, organizational graphs, and SQL tools have different jobs.

The benchmark also needs small refinements: plural grammar (`1 legal entities`), repeated `Grade Grade`, clipped work email, narrow Job & Org tab wrapping, and controls wrapping at restricted content widths. Standardize the good parts without copying these defects. The list initially loads up to 200 people; pagination/large-organization behavior needs a separate functional review before customer-scale use.

## 3. Confirmed UI drift and recommended treatment

At 1280px, live main headings share Fraunces, 28.16px, and ink-1. Weight still varies:

| Screen/component | Existing evidence | Recommendation | Decision |
|---|---|---|---|
| Employees | 600 heading; strong hierarchy | Baseline; correct the small issues above | Retain + enhance |
| Main workspace menu | Inter 14px; active 600 vs inactive 400 | Keep sans-serif; align inactive/active weights, label case, spacing, and selected state with a shared navigation spec | Enhance |
| People submenu | Inter body token; active 600 vs inactive 450; multiple caption labels | Same semantic type scale as main menu; preserve navigation hierarchy | Enhance |
| Dashboard | heading 500 | Shared PageHeader at 600; consistent count/card typography | Enhance |
| Organization / Legal Entities | heading 500; bilingual subtitle; statistical tiles/table | Shared PageHeader, filters, count metadata and action styles | Enhance |
| Create Legal Entity | serif dialog title 18px/500 | Dialog title 20–21px/600, body 14px; same fields/errors/buttons as other create/edit dialogs | Enhance |
| Leave Management | heading 500; separate calendar/form/table variants | Shared typography and controls; keep calendar-specific density | Enhance |
| Workflow approvals | heading 500; specialized decision controls | Shared header/status/action tokens; retain approval semantics | Enhance |
| Employee Letters | heading 700 | Align page heading to 600; retain document preview layout | Enhance |
| Reports | heading 500 | Shared shell and filter toolbar; keep charts/tables and semantic colors | Enhance |
| Administration | heading 400; section titles Inter 15px/600 | Page title 600; explicit section-title role; normalize forms/dialogs | Enhance |
| Enterprise Data Hub | specialist editor/sidebar; no ordinary h1 found in live snapshot | Keep code font and dense grid; add accessible consistent page identity; align surrounding controls only | Enhance, retain tool layout |
| Org Chart | graph nodes, control panel, custom full-height canvas | Retain graph layout; align toolbar/node labels with shared roles | Retain + enhance |
| All remaining pages | see complete route/component inventory | Review local overrides against the same roles before replacing them | Assess/enhance per evidence |

There are 47 distinct font-size expressions in TSX, including semantic tokens, legitimate chart/avatar sizes, and dynamic expressions. This is a maintenance signal, not proof of 47 visual defects. The inventory includes literal colors and line evidence; semantic warning/success colors must not be flattened into one brand color. An earlier global h1 override reduced size drift but did not standardize weights, section headings, dialogs, or controls. Avoid another blanket `!important` pass: use shared primitives and retire local overrides deliberately.

## 4. Navigation alternatives — approval required

Measured current desktop shell: 208px main rail + 232px submenu = approximately 440px. At 1280px this leaves 840px (65.6%) before content padding; at 1440px it leaves 1000px (69.4%); at 1920px it leaves 1480px (77.1%). Therefore the perceived 30% navigation cost is accurate around a 1440px desktop, and worse at 1280px. The current rail already has a compact toggle and remembers its mode per role. Under 1024px, CSS switches to mobile navigation.

| Alternative | How it works | Content at 1440px, before padding | Advantages | Tradeoffs/accessibility/responsiveness |
|---|---|---:|---|---|
| A. Retain current two-column shell | Labeled workspaces + contextual submenu; normalize typography only | 1000px / 69.4% expanded; 1148px / 79.7% compact | Familiar; all workspace names visible; lowest implementation risk | Large width cost when expanded; compact icons need accessible names/tooltips; existing mobile drawer retained |
| B. Compact rail by default | Existing 60px icon rail + 232px submenu, expandable on demand | 1148px / 79.7% | Fastest practical width gain; preserves two-level model; little retraining | Icon recognition burden for new users; keyboard shortcuts, focus cues, labels/tooltips and explicit expand control essential |
| C. One expandable sidebar — recommended | One 256px labeled sidebar, workspace groups expand to their submenu; active group stays open | 1184px / 82.2% | Names remain readable; coherent hierarchy; saves 184px versus current expanded layout | More vertical scrolling across 11+ workspaces; must retain active context, search, role filtering and expansion state; mobile becomes one modal drawer with Escape/focus return |
| D. Top workspace switcher + contextual horizontal nav | Labeled workspace switcher/overflow menu above content; secondary links in a row or explicit More menu | Up to 1440px / 100% horizontal width | Best width for graphs, reports, and tables | Consumes roughly 96–112px vertical height; many modules do not fit in a single row; overflow discovery, keyboard navigation and touch behavior more complex; not the default recommendation |

Widths for B/C are explicit proposal dimensions, not measurements of implemented alternatives. Keep tables horizontally scrollable within their own regions. At zoom and tablet widths use drawers rather than squeezing two permanent columns. Preserve browser history, deep links, breadcrumbs, role-specific visibility, and ⌘K/shortcuts. Do not make hover the only way to expose submenus.

**Decision requested:** approve typography/component normalization independently of the layout. Choose A, B, C, or D before navigation implementation. C is recommended if labeled navigation and more content width are priorities; B is the lower-risk interim option. No structural change is applied by this report.

## 5. Employee Organization Structure finding

The feature is included and working for the reviewed Super Admin session:

- Current menu: **People → Org Chart**, not Organization → Employee Organization Structure.
- Direct URL: https://avaniis-hr-git-main-avaniis.vercel.app/org-chart
- Page: `app/(hr-admin)/org-chart/page.tsx`; shell/components under `components/org-chart/`; hierarchy logic under `lib/org-chart/`; server actions in `modules/core-hr/org-chart-actions.ts`.
- Menu entries exist in workspace, admin, manager, and employee navigation configurations, plus EmployeeSidebar. Main desktop admin layout consumes workspace navigation; role-specific layouts consume other configurations.
- Page accepts HR Admin, HR Director, Super Admin, Manager, Employee, Finance and Payroll Admin; viewer roles and manager-root scoping adapt the tree. No org-chart feature gate found.
- Live chart rendered six employee nodes, two managers, five reporting edges and three reporting levels. Reporting Manager, Department and My Team switches, filters, export and zoom controls are present. This review verified rendering, not mutation/export correctness for every viewer role.
- A scheduled snapshot endpoint exists but is not in `vercel.json`; historical snapshots must not be assumed scheduled.

Likely discoverability cause: its placement and shorter name differ from the name/location expected by the user. This does not establish the cause for every user/viewport. Proposed, subject to approval: label it **Employee Organization Structure** (with an Arabic equivalent), retain `/org-chart`, and agree whether People remains its primary home or Organization gains a cross-link. Update both navigation files and role-specific sources consistently, without broadening permissions.

## 6. Feature inclusion versus operational completeness

See [FEATURE-COMPARISON.md](FEATURE-COMPARISON.md) for the module matrix, complete page/API lists, known incomplete functions, navigation gaps and environment dependencies. Important distinctions:

- No application source/page/API loss detected against the supplied ZIP.
- Source inclusion and a successful build do not prove payroll, outbound email, provider AI, document signing/delivery, or all write workflows operate correctly.
- The six-person database supports UI testing, not comprehensive scenario coverage.
- Items deliberately gated or inherited as unfinished must be labeled clearly, rather than reintroduced as apparently functional buttons.

## 7. Proposed implementation sequence after approval

1. Approve the reference roles/type scale and selected navigation alternative separately.
2. Implement shared PageHeader, section/dialog titles, button, field, toolbar, status, table, tab and navigation primitives; preserve Arabic/dark-mode/semantic color behavior.
3. Roll out People and Organization first, including create/edit dialogs; review screenshots with the owner.
4. Apply the same primitives to Leave/Time, Workflows, Documents, Reports, Administration and Data Hub; preserve specialized chart/editor density.
5. Resolve approved discoverability gaps, separately from incomplete business features. No payroll gate or external delivery is enabled merely by visual approval.
6. Verify keyboard/focus, zoom, desktop/tablet/mobile, light/dark, EN/AR, role visibility, table scrolling and representative CRUD/approval flows. Maintain a per-route acceptance record and flag unavailable dependencies explicitly.

Approval options: typography/component standard only; standard + navigation A/B/C/D; approve proposed Org Chart labeling/location; separately prioritize functional gaps. This document is not approval to execute any of those changes.
