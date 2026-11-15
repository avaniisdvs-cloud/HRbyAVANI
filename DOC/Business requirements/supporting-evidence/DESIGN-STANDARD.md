# AVANIIS HR — Design Standard

**v1.1 — updated 2026-04-30** (design consistency QA pass — server-component hover pattern, padding rule clarification, What NOT to do expanded, page-in exemption list added)

Extracted from three frozen reference pages:
- `app/(employee)/me/page.tsx` + component tree  
- `components/dashboard/ManagerDashboard.tsx`  
- `components/dashboard/AdminDashboard.tsx`  

These observations are authoritative. Every other page must match.

---

## 1. Shell & Layout Rules

### Page wrapper (outermost div of every page component)

**`(employee)` pages** — layout provides NO padding, so the page wrapper must add its own:
```tsx
<div
  className="page-in"
  style={{
    width: '100%',
    padding: 'calc(24px * var(--density))',
    boxSizing: 'border-box',
  }}
>
```

**`(hr-admin)` pages** — layout already applies `px-6 py-6` (24px), so the page wrapper must NOT add padding:
```tsx
<div
  className="page-in"
  style={{
    width: '100%',
    boxSizing: 'border-box',
  }}
>
```
- **No `maxWidth`**, no `margin: 'auto'`, no `width: Npx`
- `className="page-in"` on every outermost div (triggers `slideInRight 220ms ease`)
- **Components rendered directly as page content** (e.g. `AdminDashboard`, `ManagerDashboard`) must apply `className="page-in"` themselves — they are effectively the page root

### Topbar shell — mandatory element set

Every page across all roles must have ALL five topbar elements. Do not add page-level topbars.

All roles — identical topbar layout:
```
[←]?  [icon] [Page Title]     ←—— Search bar (max-width 400px) ——→     [🔔] [EN/AR] | [Avatar + Name] [logout→]
```

| Element | Component | Spec |
|---------|-----------|------|
| Back button | `ChevronLeft` (16px) | 32×32px; hidden when `pathname === homeRoute` |
| Search bar | inline SVG + span + `<kbd>` | `flex:1; max-width:400px`; centered |
| Bell | inline SVG button | 36×36px; transparent bg |
| Language toggle | `<LocaleSwitcher current={locale} />` | locale read from cookie in server layout |
| User profile | Avatar circle + name + role | Avatar: 36px (admin) / 32px (employee) |
| Logout | `<Link href="/sign-out">` + `<LogOut>` | 32×32px icon; topbar far right; all roles |

**Shell components:**
- `(hr-admin)` → `components/layout/AdminTopbar.tsx` (client). Locale + user props from `app/(hr-admin)/layout.tsx`.
- `(employee)` → `components/employee/EmployeeTopbar.tsx` (client). Locale + user props from `app/(employee)/layout.tsx`.

**Logout placement:** topbar far right on **all roles**. `EmployeeSidebar` footer also retains a logout link as a secondary affordance.

**Do not** hardcode role names or bilingual text in the topbar — derive from `session.user.role`.

### Design coverage
All pages across both route groups (`(hr-admin)` and `(employee)`) follow this standard. There are no remaining exemptions as of 2026-04-30. Sub-pages that were previously deferred (`persons/[id]/**`, `absence/[id]/**`, `absence/new/**`, `absence/rules/**`, `settings/**` sub-pages, `workflows/[instanceId]/**`) have been updated: shadcn Card imports removed, `className="page-in"` applied, page headers converted to inline serif 30px. Residual `space-y-*` and `text-sm` Tailwind helpers within list items are tolerated inside formerly-exempt content areas.

### Full-width two-column layout (where used)
```tsx
// Row container
display: 'flex', gap: 20, alignItems: 'flex-start', width: '100%'

// Left column (main content)
flex: 1, minWidth: 0

// Right column (sidebar/summary)
width: 300  // or 320 for wider right rail
flexShrink: 0
```

### Section spacing
- Between page header and first section: `marginBottom: 24`
- Between KPI grid and two-column layout: `marginBottom: 24`
- Between stacked right-rail cards: `gap: 16`
- Between stacked left cards: `gap: 20`

### Card base
```tsx
background: 'var(--card)'
border: '1px solid var(--border)'
borderRadius: 12
overflow: 'hidden'
```
No `boxShadow`. Border only.

### Card header row
```tsx
padding: '14px 20px'           // employee cards
padding: '16px 20px'           // manager/admin cards
borderBottom: '1px solid var(--border)'
display: 'flex', alignItems: 'center', justifyContent: 'space-between'
```

### Card body
- Default padding: `padding: '20px'`
- Activity/row-based content: `padding: '14px 20px'` per row, no wrapper padding
- Flush table (no padding): `padding: 0`

---

## 2. Typography Rules

| Element | Font | Size | Weight | Color | Other |
|---|---|---|---|---|---|
| Page title | `var(--font-serif)` | 30–32px | 500 | `var(--ink-1)` | letter-spacing `-0.5px` to `-0.6px`; margin 0 |
| Page subtitle | `var(--font-sans)` | 14px | 400 | `var(--ink-3)` | margin 0 |
| Card section heading | `var(--font-sans)` | 14px | 600 | `var(--ink-1)` | letterSpacing `-0.1` to 0 |
| KPI number | `var(--font-serif)` | 40px (KPI grid), 32px (balance band) | 500–600 | `var(--ink-1)` or `var(--accent-900)` | lineHeight 1 |
| KPI label | `var(--font-mono)` | 11px | 700 | `var(--ink-3)` or `var(--accent-700)` | uppercase; letterSpacing `1.2px` |
| KPI subtext | `var(--font-sans)` | 12px | 400 | `var(--ink-3)` or `var(--accent-700)` | marginTop 2–4px |
| Row name (primary) | `var(--font-sans)` | 13.5px | 600 | `var(--ink-1)` | lineHeight 1.3 |
| Row detail (secondary) | `var(--font-sans)` | 12px | 400 | `var(--ink-3)` | marginTop 2px |
| Table th | `var(--font-sans)` | 11px | 700 | `var(--ink-3)` | uppercase; letterSpacing `0.8px`; background `var(--surface)` |
| Table td | `var(--font-sans)` | 13px | 400 | `var(--ink-2)` | padding `14px 20px` |
| Status pill text | `var(--font-sans)` | 11–11.5px | 600–700 | pill fg color | uppercase; letterSpacing `0.4–0.5px` |
| Card action link | `var(--font-sans)` | 12–13px | 600 | `var(--accent-700)` | no underline |

---

## 3. Component Patterns

### KPI Card — default
```tsx
<div style={{
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '22px 24px',
  display: 'flex', flexDirection: 'column', gap: 6,
}}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Icon size={16} strokeWidth={1.75} style={{ color: 'var(--ink-3)' }} />
    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)',
      textTransform: 'uppercase', letterSpacing: '1.2px', fontFamily: 'var(--font-mono)' }}>
      LABEL
    </span>
  </div>
  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 500,
    color: 'var(--ink-1)', lineHeight: 1, marginTop: 8 }}>
    {value}
  </div>
  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>sub text</div>
</div>
```

### KPI Card — accent variant (pending approvals only)
```tsx
background: 'var(--accent-050)'
border: '1px solid var(--accent-200)'
// Icon color: var(--accent-700)
// Label color: var(--accent-700)
// Number color: var(--accent-900)
// Subtext color: var(--accent-700)
// Wrap in <Link href="..."> — entire card is clickable
```

### Table
```tsx
// Wrapper
<div style={{ width: '100%', overflowX: 'auto' }}>
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead>
      <tr>
        <th style={{
          padding: '12px 20px',
          fontSize: 11, fontWeight: 700, color: 'var(--ink-3)',
          textTransform: 'uppercase', letterSpacing: '0.8px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          textAlign: 'left', whiteSpace: 'nowrap',
        }}>
          COLUMN
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        onClick={...}
        style={{
          cursor: 'pointer',           // only if clickable
          transition: 'background 120ms',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
      >
        <td style={{
          padding: '14px 20px',
          fontSize: 13, color: 'var(--ink-2)',
          borderBottom: '1px solid var(--border)',
          verticalAlign: 'middle',
        }}>
          ...
        </td>
      </tr>
    </tbody>
  </table>
</div>
```
Last row: `borderBottom: 'none'` on tds.

### Status Pill
```tsx
<span style={{
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: STATUS.bg, color: STATUS.fg,
  borderRadius: 999, padding: '3px 10px',
  fontSize: 11, fontWeight: 700,        // or 11.5
  textTransform: 'uppercase', letterSpacing: '0.4px',
  flexShrink: 0,
}}>
  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS.dot }} />
  {STATUS.label}
</span>
```

### Avatar
```tsx
// Default (36px)
<div style={{
  width: 36, height: 36, borderRadius: '50%',
  background: color,   // employee color, never grey
  color: '#fff',
  display: 'grid', placeItems: 'center',
  fontSize: 11.5, fontWeight: 700, flexShrink: 0,
  fontFamily: 'var(--font-sans)',
}}>
  {initials}
</div>

// Dense list (32px)
// same but: width: 32, height: 32, fontSize: 11
```

### Button — Primary
```tsx
style={{
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'var(--accent)', color: '#fff',
  border: 'none', borderRadius: 7,
  padding: '9px 16px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', textDecoration: 'none',
  transition: 'background 120ms',
}}
// hover: background var(--accent-700)
```

### Button — Secondary
```tsx
style={{
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'var(--card)', color: 'var(--ink-1)',
  border: '1px solid var(--border)', borderRadius: 7,
  padding: '9px 16px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  transition: 'border-color 120ms',
}}
// hover: borderColor var(--ink-4)
```

### Button — Small (inside rows)
```tsx
padding: '5px 12px', fontSize: 12, borderRadius: 6
// Same colors as secondary
```
Observed in ManagerDashboard "Review" button: `padding: '6px 14px', fontSize: 12, borderRadius: 7`.

### Form Input
```tsx
style={{
  width: '100%', padding: '9px 12px',
  border: '1px solid var(--border)', borderRadius: 7,
  background: 'var(--card)', color: 'var(--ink-1)',
  fontSize: 13.5, fontFamily: 'var(--font-sans)',
  outline: 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
}}
// :focus — borderColor: var(--accent); boxShadow: '0 0 0 3px var(--accent-100)'
```

### Field Label
```tsx
style={{
  display: 'block',
  fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)',
  letterSpacing: '0.3px', textTransform: 'uppercase',
  marginBottom: 6,
}}
```

### Modal
```tsx
// Overlay
position: 'fixed', inset: 0,
background: 'rgba(15,24,36,0.45)', zIndex: 50,
display: 'grid', placeItems: 'center'

// Panel
background: 'var(--card)', borderRadius: 14,
boxShadow: '0 30px 60px rgba(0,0,0,0.22)',
width: 480,                         // 520 for forms, 600 for wide
maxWidth: 'calc(100vw - 40px)',
animation: 'modalIn 180ms ease'

// Header
padding: '18px 22px', borderBottom: '1px solid var(--border)',
display: 'flex', alignItems: 'center', justifyContent: 'space-between'
fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)'

// Body
padding: '22px'

// Footer
padding: '16px 22px', borderTop: '1px solid var(--border)',
display: 'flex', justifyContent: 'flex-end', gap: 10
```
Close (X) button: `width:30, height:30, borderRadius:7, background:transparent, border:none, color:var(--ink-3), cursor:pointer` — hover: `background:var(--surface), color:var(--ink-1)`.

### Empty State
```tsx
<div style={{
  padding: '48px 20px',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
}}>
  <div style={{
    width: 48, height: 48, borderRadius: '50%',
    background: 'var(--accent-100)',
    display: 'grid', placeItems: 'center',
    color: 'var(--accent-700)',
  }}>
    <Icon size={20} strokeWidth={1.75} />
  </div>
  <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
    Nothing here yet
  </div>
  <div style={{ fontSize: 13, color: 'var(--ink-3)', textAlign: 'center', maxWidth: 300 }}>
    Supporting text
  </div>
</div>
```

### Page Header (standard two-part)
```tsx
<div style={{
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
  marginBottom: 24,
}}>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <h1 style={{
      fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
      letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0,
    }}>
      Page Title
    </h1>
    <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: 0 }}>
      Supporting subtitle
    </p>
  </div>
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    {/* action buttons */}
  </div>
</div>
```

---

## 4. Color Usage Rules

| Usage | Token |
|---|---|
| Page background | `var(--bg)` — #F0F2F5 |
| Card background | `var(--card)` — #FFFFFF |
| Table header / zebra bg | `var(--surface)` — #F5F6F8 |
| Row hover background | `var(--surface)` |
| Card border | `var(--border)` — #E5E8EC |
| Primary text | `var(--ink-1)` — #151A22 |
| Secondary text | `var(--ink-2)` — #3E4855 |
| Muted / placeholder | `var(--ink-3)` — #6E7885 |
| Disabled / hairline | `var(--ink-4)` — #A2A9B3 |
| Brand accent | `var(--accent)` |
| Accent KPI card bg | `var(--accent-050)` — **only** for pending-approvals KPI card |
| Accent KPI card border | `var(--accent-200)` |
| Progress bar track | `var(--surface)` or `var(--border)` |

### Status pill colors (use CSS vars where available)
| Status | bg | fg | dot |
|---|---|---|---|
| PENDING / on_leave | `var(--status-pending-bg)` | `var(--status-pending-fg)` | `var(--status-pending-dot)` |
| APPROVED / active | `var(--status-approved-bg)` | `var(--status-approved-fg)` | `var(--status-approved-dot)` |
| REJECTED | `var(--status-rejected-bg)` | `var(--status-rejected-fg)` | `var(--status-rejected-dot)` |
| DRAFT / CANCELLED | `var(--status-draft-bg)` | `var(--status-draft-fg)` | `var(--status-draft-dot)` |
| SUBMITTED / TIMESHEET | `#EAF1F8` | `#1E3A5F` | `#2F5D8A` |

### Hardcoded constants (always define at top of file)
```tsx
const LEAVE_COLORS = { ANNUAL: '#0F4C5C', SICK: '#E2956A', EMERGENCY: '#B33A3A' }

const AVATAR_PALETTE = [
  '#2E6170','#6B3458','#B56B45','#2E8B57',
  '#4A6741','#7A6B3A','#3A5F8B','#8B3A5F','#5F3A8B','#8B6B3A'
]
// Assign round-robin when no color in data. Never use grey.
```

### Leave icon square tints (RecentActivityCard pattern)
```tsx
const ICON_TINT = {
  ANNUAL:    { bg: '#D9E7E9', fg: '#0F4C5C' },
  SICK:      { bg: '#FAE8DC', fg: '#B56B45' },
  EMERGENCY: { bg: '#F9DEDE', fg: '#B33A3A' },
}
// Fallback: { bg: 'var(--surface)', fg: 'var(--ink-3)' }
```

### Nav active state
```tsx
background: 'var(--nav-active-bg)'  // rgba(255,255,255,0.08)
color: 'var(--nav-active-fg)'       // #FFFFFF
// sidebar bg: var(--nav-bg) = #0F2E38
```

---

## 5. Interaction & Animation Rules

### Page entry
```css
/* Already in globals.css */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: none; }
}
.page-in { animation: slideInRight .22s ease; }
```
Every page outermost div **must** have `className="page-in"`.

### Modal entry
```css
/* Already in globals.css */
@keyframes modalIn {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
```

### Row hover

**Server Component pattern** (no `'use client'` — cannot use event handlers or `useState`):
```tsx
// Use Tailwind pseudo-class alongside inline styles:
<tr
  className="hover:bg-surface"
  style={{ transition: 'background 120ms', background: 'transparent' }}
>
```

**Client Component pattern** (with `'use client'`):
```tsx
// Option A — useState:
const [hovered, setHovered] = useState(false)
<tr
  style={{ background: hovered ? 'var(--surface)' : 'transparent', transition: 'background 120ms' }}
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
>

// Option B — inline event handlers (simpler for single rows):
<tr
  style={{ transition: 'background 120ms' }}
  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
  onMouseLeave={e => (e.currentTarget.style.background = '')}
>
```
Only add hover on rows that are **actually clickable** or expandable.

### Button hover
All buttons must use CSS transitions `120ms`. Use `onMouseEnter`/`onMouseLeave` or CSS `:hover` for:
- Primary → `background: var(--accent-700)`
- Secondary → `borderColor: var(--ink-4)`
- Ghost → `background: var(--surface)`
- Danger → `background: #FBE9E9`

### Progress bar fill
```tsx
transition: 'width 0.4s ease'  // observed in LeaveBalanceBand
```

### Cursor
- `cursor: 'pointer'` — every button, link, clickable row, clickable card
- `cursor: 'default'` — non-interactive rows (never pointer on static rows)

---

## 6. Spacing Scale

| Value | Usage |
|---|---|
| 2px | hairline gap between sub-elements |
| 4px | tight inline gap (flex-direction column subtitle gap) |
| 6px | pill internal gap, small button gap |
| 8px | form gap, KPI icon+label gap |
| 10px | button group gap, hero button gap |
| 12px | table th padding vertical, list item gap |
| 14px | card header padding vertical, row padding vertical |
| 16px | standard grid gap, stacked right-rail gap |
| 20px | card body padding, two-column gap |
| 24px | section margin-bottom, page header margin-bottom |
| 28px | hero padding (28px 32px) |
| 32px | hero padding horizontal |

---

## 7. What NOT to do

- ❌ `boxShadow` on cards — border only
- ❌ `maxWidth` on page wrapper divs
- ❌ `margin: 'auto'` on page wrapper divs
- ❌ Arabic text / bilingual labels displayed in any hr-admin page UI — English only
- ❌ `dir="rtl"` rows showing Arabic DB fields (`nameAr`, `fullNameAr`, etc.) in hr-admin tables
- ❌ Arabic `labelAr` values in `MANAGER_NAV` or `HR_ADMIN_NAV` sidebar entries
- ❌ Tailwind classes mixed with inline styles on pages (existing Tailwind in shell components is grandfathered — new page code must use inline styles)
- ❌ Tailwind `bg-accent-050 text-accent-700` as a status pill (it's an accent tint, not a status) — use `var(--status-approved-*)` for APPROVED/ACTIVE states
- ❌ Tailwind `bg-red-50 text-red-700/800` as a status pill — use `var(--status-rejected-*)`
- ❌ Tailwind `bg-status-warning-bg text-status-warning-fg` as a status pill — use `var(--status-pending-*)` inline style
- ❌ Hardcoded `#hex` colors for status pills — use `var(--status-...)`
- ❌ shadcn `<Card>` / `<CardContent>` / `<CardHeader>` / `<CardTitle>` in redesigned list/index pages — use inline-style div equivalents
- ❌ Grey (`#9CA3AF`, `bg-accent-100 text-accent-700`) as avatar background — use `AVATAR_PALETTE` colors
- ❌ Raw text empty states ("No data available" with no icon treatment) — use 48px icon circle + serif title pattern
- ❌ `cursor: pointer` on non-clickable rows
- ❌ Missing `className="page-in"` on page outer div (except documented exemption list above)
- ❌ `padding: 'calc(24px * var(--density))'` on `(hr-admin)` page wrappers — double-padding with layout
- ❌ No padding on `(employee)` page wrappers — layout provides none, page must add it
- ❌ `border-radius` values other than: `4px` (progress bars), `6–7px` (buttons/small), `8px` (icon squares), `12px` (cards), `14px` (modals), `50%` (avatars), `999px` (pills)
