---
name: Admin Shell Redesign — Phase tracking
description: Tracks the 4-phase admin shell redesign from design_handoff_admin_shell package. All 4 phases complete.
type: project
originSessionId: dcfd316d-2443-4bc4-9d94-945475cfe07a
---
Design handoff source: `/Users/d.kethari/Downloads/design_handoff_admin_shell/` (README + 10 artboards).
Branch: `claude/nostalgic-darwin-3e3af2` — 4 commits ahead of main, not yet merged.

**Phase 1 — COMPLETE (2026-05-16)**
Built:
- `config/workspace-nav.ts` — 11 workspace config with all existing routes; Payroll items marked comingSoon
- `components/layout/WorkspaceRail.tsx` — near-black dark rail (60/208px), expand/collapse via ⌘\, auto-compact < 1280px
- `components/layout/WorkspaceSecondaryNav.tsx` — 232px light contextual nav, derives workspace from pathname
- `app/(hr-admin)/layout.tsx` — admin roles → new shell; MANAGER → old AdminSidebar; EMPLOYEE → EmployeeSidebar
- `app/globals.css` — added `--rail-*` + `--secnav-width` tokens (separate from `--nav-*` to not break EmployeeSidebar)

**Phase 2 — COMPLETE (2026-05-16)**
IA fine-tuning:
- Added `/my-team` → People workspace
- Added `/absence/rules` → Leave & Time > Configuration group
- Added `/workflows` → Workflows workspace as "Workflow Runs"
- Removed duplicate `/approvals` cross-link from Workflows
- Fixed double-highlight bugs in `isItemActive` for `/timesheets/team` and `/configuration/workflows/groups`

**Phase 3 — COMPLETE (2026-05-16)**
Settings hub + ⌘K command palette:
- `config/settings-hub.ts` — 7 categories, 40+ items mapped to real routes
- `app/(hr-admin)/settings/page.tsx` — categorized hub with live search (replaces redirect)
- `app/(hr-admin)/settings/SettingsHubClient.tsx` — client search + 2-col card grid
- `app/(hr-admin)/settings/layout.tsx` — removed old SettingsNav sidebar (was "duplicate settings sidebar")
- `components/layout/CommandPalette.tsx` — ⌘K overlay: Navigate / Settings / Actions groups, ↑↓ nav, Esc close
- `components/layout/AdminTopbar.tsx` — removed ⌘K → focus-search (palette owns ⌘K now)

**Phase 4 — COMPLETE (2026-05-16)**
Polish:
- `WorkspaceRail.tsx` — ⌘1-⌘0 workspace keyboard shortcuts (functional, not just labels)
- `WorkspaceRail.tsx` — compact hover flyout: 240px panel, 100ms open delay, 250ms dismiss delay
- `app/(hr-admin)/layout.tsx` — `dir="rtl"` on admin shell root when locale === 'ar'
- `WorkspaceSecondaryNav.tsx` — `key={workspace.id}` + fadeIn 0.15s on workspace switch
- `CommandPalette.tsx` — fadeIn backdrop + modalIn panel animations
- `app/globals.css` — `@keyframes flyout-in` added

**Known remaining gaps (not in original scope, future work):**
- Settings detail pages still use old page layout (no kicker + serif title + tabs pattern from design spec artboard 06)
- Mobile responsive shell (≤767px bottom tab bar) — artboard 09, not implemented
- Dark mode rail token variants — Phase 4 added foundational RTL; dark mode is separate work

**Why:** User is d.kethari@avaniis.example, replacing the Super-Admin and HR-Admin UI shell of AVANIIS HR for Avaniis.
**PR:** Branch `claude/nostalgic-darwin-3e3af2` pushed to `github.com/avaniisdvs-cloud/HRbyAVANI`. Open PR at: https://github.com/avaniisdvs-cloud/HRbyAVANI/compare/main...claude/nostalgic-darwin-3e3af2?expand=1
