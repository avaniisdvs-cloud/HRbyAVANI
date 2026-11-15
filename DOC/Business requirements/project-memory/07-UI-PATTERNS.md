# 07 — UI Patterns & Design System

> Generated: 2026-06-04. Source of truth: app/globals.css, tailwind.config.ts, CLAUDE.md.
> Do not modify token names or values without updating DESIGN_SYSTEM.md and globals.css.

---

## Layout Conventions

### Route Groups
| Route Group | Purpose | Auth |
|---|---|---|
| `(auth)` | Sign-in, sign-out pages | Public |
| `(employee)/me` | Employee Self-Service (ESS) | Authenticated, EMPLOYEE |
| `(hr-admin)` | HR Admin, Manager, SuperAdmin pages | Authenticated, role-gated |
| `(signing)/me` | Letter signing page (token-based) | Token-auth (no session) |

### Layout Architecture

**HR Admin Layout** (`app/(hr-admin)/layout.tsx`):
- `WorkspaceRail` (left sidebar, 240px) — workspace switcher + secondary nav
- `AdminTopbar` (top bar) — breadcrumbs, user avatar, notifications
- Main content area — route-specific Server Components
- `MobileBottomBar` — shown at ≤1024px, hidden at ≥1025px

**Employee Layout** (`app/(employee)/layout.tsx`):
- `EmployeeSidebar` (left sidebar) — ESS navigation (My Profile 2nd, Org Chart last per Task 2F)
- `EmployeeTopbar` (top bar) — user avatar, profile menu
- Main content area

**Font Assignments**:
- `var(--font-sans)` → Inter — body text, labels, UI strings
- `var(--font-serif)` → Fraunces — headings, display numbers, KPI values
- `var(--font-mono)` → JetBrains Mono — person numbers (AVN-XXXXX), email addresses, IDs, codes

---

## Design System (CSS Tokens)

**Hard Rule 7**: Always use `var(--token)` — NEVER raw hex colors anywhere in components.

### Accent Scale (Brand: Teal)
```css
--accent-050: #EFF5F6   /* very light tint — selected row bg, tag bg */
--accent-100: #D9E7E9   /* focus rings, selected item bg */
--accent-200: #B5CED2   /* hover borders */
--accent-500: #3E7582   /* mid accent */
--accent:     #2E6170   /* PRIMARY BRAND — buttons, active states, links */
--accent-700: #1F4A57   /* dark accent — pressed state */
--accent-900: #0F2E38   /* deepest — nav background, dark surfaces */
```

### Neutral Ink Scale
```css
--ink-1: #151A22   /* primary text — headings, labels, body */
--ink-2: #3E4855   /* secondary text — descriptions, subtitles */
--ink-3: #606E7A   /* muted / placeholder — darkened from #6E7885 for WCAG AA ≥4.5:1 (fixed P6F 2026-05-25) */
--ink-4: #A2A9B3   /* disabled / hairline — EXEMPT from SC 1.4.3 contrast rules */
```

### Surface Scale
```css
--card:    #FFFFFF   /* cards, panels, drawers, modals */
--surface: #F5F6F8   /* secondary bg, hover states, striped rows */
--bg:      #F0F2F5   /* page background */
--border:  #E5E8EC   /* dividers, input borders, table borders */
```

### Navigation Sidebar Tokens
```css
--nav-bg:        #0F2E38             /* sidebar background (dark teal) */
--nav-fg:        #A8BFC6             /* sidebar text (default) */
--nav-fg-dim:    #6D8990             /* dimmed sidebar text */
--nav-fg-strong: #FFFFFF             /* sidebar text (active/hover) */
--nav-border:    rgba(255,255,255,0.06)  /* sidebar dividers */
--nav-active-bg: rgba(255,255,255,0.08) /* active nav item background */
--nav-active-fg: #FFFFFF             /* active nav item text */
```

### Rail Tokens (WorkspaceRail specific)
```css
/* WorkspaceRail uses --rail-* tokens; --rail-fg-mute brightened to #7B8FA0 for WCAG AA (P6F) */
```

### Status Palette
```css
/* Warning / Amber */
--status-warning:        #F29900
--status-warning-bg:     #FEF6E4
--status-warning-fg:     #8A5A0B
--status-warning-border: #E5C896

/* Info / Blue */
--status-info:           #1A73E8

/* Success / Green */
--status-success:        #1E7E34

/* Status Pills */
--status-pending-bg:     #FEF6E4   --status-pending-fg:   #8A5A0B   --status-pending-dot:   #D98A00
--status-approved-bg:    #E8F3ED   --status-approved-fg:  #1E5B38   --status-approved-dot:  #2E8B57
--status-rejected-bg:    #FBE9E9   --status-rejected-fg:  #8A1F1F   --status-rejected-dot:  #C0392B
```

### Org Chart Special Tokens
```css
--org-acting:            #F59E0B   /* amber — acting assignment ring */
--org-vacant:            #EF4444   /* red — vacant position */
--org-frozen:            #F59E0B   /* amber — budget frozen */
--org-contractor:        #3B82F6   /* blue — contractor ring */
--org-overloaded:        #F97316   /* orange — >8 direct reports */
--org-under-supervised:  #808899   /* grey dashed ring — dedicated literal (decoupled from --ink-4 since P6F) */
```

### Font Variables
```css
--font-sans:  /* Inter — set via Next.js font loader in app/layout.tsx */
--font-serif: /* Fraunces — display headings */
--font-mono:  /* JetBrains Mono — codes, IDs */
```

### Tailwind Token Bridge
All tokens are bridged into Tailwind via `tailwind.config.ts`:
- `text-ink-1`, `text-ink-2`, `text-ink-3`, `text-ink-4`
- `bg-accent`, `bg-accent-050`, `bg-surface`, `bg-card`, `bg-bg`
- `border-border`, `border-accent-200`
- `text-accent`, `text-accent-700`

---

## Navigation Patterns

### Three Navigation Systems
AVANIIS HR has three completely separate navigation systems — they do NOT share components.

| System | File | Roles | Notes |
|---|---|---|---|
| Workspace Rail | `config/workspace-nav.ts` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | 11 workspace tiles + secondary nav |
| Admin Sidebar | `config/admin-nav.ts` | MANAGER | Flat grouped sidebar |
| Employee Sidebar | `components/employee/EmployeeSidebar.tsx` | EMPLOYEE | Fixed order: Home → My Profile → ... → Org Chart |

**Critical Invariant**: `workspace-nav.ts` and `admin-nav.ts` must ALWAYS be updated together. Adding a route to only one file means the other role loses it. This is a known footgun documented in MEMORY.md.

### SUPPRESS_SECONDARY_NAV
Some workspace IDs are listed in `SUPPRESS_SECONDARY_NAV` — these route directly to the workspace URL without showing the secondary nav panel. Example: `'migration'` was added so the Data Migration Activity workspace tiles directly.

### SUPER_ADMIN-Only Items
Items with `superAdminOnly: true` in workspace-nav.ts are filtered at render time. Only visible to SUPER_ADMIN role. Example: Users management, DataOps console.

### Employee Sidebar Order (locked by Task 2F tests NAV-001–010)
```
1. Home (/me)
2. My Profile (/me/profile)       ← moved to 2nd (Task 2F)
3. ARIA (/me/aria)
4. Leave (/me/leave)
5. Timesheet (/me/timesheet)
6. Payslips (/me/payslips)
7. Insurance (/me/insurance)
8. Letters (/me/letters)
9. Documents (/me/documents)
10. Organisation Chart (/me/org-chart)  ← last (Task 2F)
```

---

## Component Patterns

### Available shadcn/ui Primitives
Located at `components/ui/`:
- `badge.tsx` — status badges
- `button.tsx` — all button variants
- `card.tsx` — card container
- `dialog.tsx` — modal dialogs
- `input.tsx` — text inputs
- `label.tsx` — form labels
- `select.tsx` — dropdown selects
- `table.tsx` — data tables
- `textarea.tsx` — multi-line inputs
- `toast.tsx` + `toaster.tsx` — toast notifications
- `tooltip.tsx` — hover tooltips

### Custom Components
- `components/ui/ActionModeSelector.tsx` — action mode toggle
- `components/ui/DraftRestoreBanner.tsx` — draft recovery banner
- `components/ui/ErrorAlert.tsx` — error display
- `components/ui/LeaveBalanceCard.tsx` — leave balance display
- `components/ui/SectionHeader.tsx` — section headings
- `components/ui/SortableHeader.tsx` — sortable table column header

### Drawer Pattern (MdmDrawer)
`components/mdm/MdmDrawer.tsx` has a WAI-ARIA compliant focus trap:
- `getFocusable()` — finds all focusable elements within drawer
- Auto-focuses first element on open
- Tab/Shift+Tab cycles within drawer boundary
- Focus restores to trigger element on close
- `role="dialog"` with `aria-modal="true"` and `aria-labelledby`

**Do not replace MdmDrawer with a plain div.** It is WCAG 2.1.2 compliant (CB-BUG-002 fix).

### PersonSelect Component
`components/forms/PersonSelect.tsx` — searchable in-container person picker:
- Safe to use inside MdmDrawer (focus-trap compatible)
- `valueLabel` fallback for inactive saved persons
- Stores `person_id` (UUID), never display text
- Used for Department Head, Line Manager, Dotted Line Manager

### Table Pattern
- Server Component fetches data with `Promise.all` (never sequential awaits for >1 query)
- Client Component handles pagination state, filter bar
- `SortableHeader` for column sorting
- Export button triggers server action returning blob

### Form Pattern
- Zod schema at `modules/*/validations.ts`
- `useFormState` / `useActionState` for server action forms
- `revalidatePath()` after successful write
- Error display: inline field errors or ErrorAlert component

---

## Server Action Pattern (Mandatory)

Every server action that writes to the database must follow this exact pattern:

```typescript
'use server'

import { auth }        from '@/lib/auth'
import { requireRole } from '@/lib/auth'
import { db }          from '@/lib/db'
import { audit }       from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { Schema }      from './validations'

export async function myAction(input: unknown) {
  // 1. Auth + role gate
  const session = await auth()
  requireRole(session, ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  // 2. Zod validation
  const data = Schema.parse(input)

  // 3. Transaction + audit (ALWAYS together, never separate)
  await db.transaction(async tx => {
    // BR-xx: cite the business rule driving this write
    await tx.insert(myTable).values({
      ...data,
      tenantId: TENANT_ID,    // ALWAYS include tenant_id
    })
    await audit.log(tx, {
      actor:      session.user,
      event:      'MY_RESOURCE.CREATED',
      resourceId: data.id,
      newValues:  data,
    })
  })

  // 4. Revalidate affected routes
  revalidatePath('/hr-admin/my-resource')
}
```

**NEVER throw from a server action in a catch block** — Next.js 15 sanitizes thrown errors to a generic message. Return `{ error: string }` instead.

**NEVER use `translateError()` in server components** — it has return type `never` and always re-throws, crashing the page render with "An error occurred in the Server Components render".

---

## Bilingual Requirements

- ALL user-facing strings: `name_en` AND `name_ar` fields (bilingual mandatory)
- All form inputs: bilingual `aria-label` (e.g. `aria-label="Department / القسم"`)
- Auto-translate framework: `lib/translation.ts` + `POST /api/translate` + `useAutoTranslate` hook
- All MDM create/update server actions call `translateToArabic()`
- Arabic is NEVER translated back to English
- RTL support: `dir="rtl"` on `<html>` when locale is `ar`; use `[dir="rtl"]` CSS selectors for flip styles

---

## Accessibility Requirements (WCAG 2.1 AA)

- Color contrast: CERTIFIED 2026-05-25 (P6F). 3 token values corrected.
  - `--ink-3` fixed to #606E7A (was #6E7885) — ratio 5.24:1 on white
  - `--org-under-supervised` fixed to #808899 literal (was var(--ink-4)) — SC 1.4.11 compliant
  - `--rail-fg-mute` fixed to #7B8FA0 (was #5E7080) — ratio 5.57:1 on #0D1117
- Focus management: MdmDrawer focus trap (WCAG 2.1.2)
- ARIA roles: `role="dialog"`, `role="switch"`, `aria-checked`, `aria-label` on all interactive elements
- Bilingual aria-labels on all 4 PersonFilterBar select triggers (CB-BUG-001 fix)
- axe-core: 0 critical violations on 3 key pages
- RTL: 45/45 RTL certification tests pass

---

## Dark Mode

- Enabled via `[data-dark="true"]` on `<html>` (Tailwind selector strategy)
- All tokens must have dark-mode overrides defined in `globals.css` under `[data-dark="true"]`
- Do not use Tailwind's `dark:` prefix — use the `[data-dark]` attribute selector only
- Check dark-mode equivalents before adding new light-mode token values
