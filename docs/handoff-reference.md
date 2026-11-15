# AVANIIS HRMS — Design Handoff Reference

Converted from the Claude Design export (`HRSystem-handoff.zip`). Use this as the canonical
source of truth for layouts, components, data shapes, and interaction patterns when
implementing or extending any HRMS screen.

---

## Table of Contents

1. [Design Tokens & CSS Variables](#1-design-tokens--css-variables)
2. [Shared Primitives](#2-shared-primitives)
3. [App Shell](#3-app-shell)
4. [Data Shapes & Seed Data](#4-data-shapes--seed-data)
5. [Employee Views](#5-employee-views)
6. [Manager Views](#6-manager-views)
7. [Admin Views](#7-admin-views)
8. [Leave Views](#8-leave-views)
9. [Timesheet Views](#9-timesheet-views)
10. [Directory & Profile Views](#10-directory--profile-views)
11. [Icon Reference](#11-icon-reference)

---

## 1. Design Tokens & CSS Variables

All values are CSS custom properties. **Never use hardcoded hex in components.**

### Colours

```css
/* Brand — teal (default theme) */
--accent-050: #EFF5F6
--accent-100: #D9E7E9
--accent-200: #B5CED2
--accent-500: #3E7582
--accent:     #2E6170   /* primary */
--accent-700: #1F4A57
--accent-900: #0F2E38

/* Text */
--ink-1: #151A22   /* headings, primary */
--ink-2: #3E4855   /* body */
--ink-3: #6E7885   /* muted / labels */
--ink-4: #A2A9B3   /* disabled / hairline */

/* Surfaces */
--card:    #FFFFFF
--surface: #F5F6F8
--bg:      #F0F2F5
--border:  #E5E8EC

/* Navigation (dark sidebar) */
--nav-bg:        #0F2E38
--nav-fg:        #A8BFC6
--nav-fg-dim:    #6D8990
--nav-fg-strong: #FFFFFF
--nav-border:    rgba(255,255,255,0.06)
--nav-active-bg: rgba(255,255,255,0.08)
--nav-active-fg: #FFFFFF
```

### Typography

```css
--font-serif: 'Fraunces', Georgia, serif   /* headings, large numbers */
--font-sans:  'Inter', system-ui, sans-serif
--font-mono:  'JetBrains Mono', monospace  /* codes, dates, small labels */
```

### Status Pill Colours

```css
--status-pending-bg:   #FEF6E4   --status-pending-fg:   #8A5A0B   --status-pending-dot:   #D98A00
--status-approved-bg:  #E8F3ED   --status-approved-fg:  #1E5B38   --status-approved-dot:  #2E8B57
--status-rejected-bg:  #FBE9E9   --status-rejected-fg:  #7A2E2E   --status-rejected-dot:  #B33A3A
--status-draft-bg:     #F1F2F4   --status-draft-fg:     #4B5563   --status-draft-dot:     #8A8F98
--status-submitted-bg: #EAF1F8   --status-submitted-fg: #1E3A5F   --status-submitted-dot: #2F5D8A
```

### Leave Type Colours

| Code      | Colour  | Days/year |
|-----------|---------|-----------|
| ANNUAL    | #0F4C5C (≈ `--accent-700`) | 22 |
| SICK      | #B56B45 (≈ `--status-warning`) | 15 |
| UNPAID    | #6B6B6B (≈ `--ink-3`) | unlimited |
| EMERGENCY | #7A2E2E (≈ `--status-rejected-dot`) | 3 |

---

## 2. Shared Primitives

### `Card`

Rounded card container with optional title bar + action slot.

```
Props:
  children  — content
  style?    — extra styles (merge with card base)
  pad?      — inner padding (default 20); use 0 for flush tables
  title?    — shows a 14px semibold header row
  action?   — right-aligned slot in the header (e.g. "View all →" link button)

Base styles:
  background: var(--card)
  border: 1px solid var(--border)
  border-radius: 12px
  overflow: hidden

Header row (when title present):
  padding: 14px 20px
  border-bottom: 1px solid var(--border)
  display: flex; align-items: center; justify-content: space-between
  font: 14px/600 var(--font-sans); color: var(--ink-1); letter-spacing: -0.1px
```

### `Btn`

```
variants: primary | secondary | ghost | danger | success
sizes:    sm (5/10px pad, 12px) | md (8/14px, 13px) | lg (10/18px, 14px)

primary:   bg var(--accent), white text, border var(--accent)
secondary: bg var(--card),   ink-1 text, border var(--border)
ghost:     bg transparent,   ink-2 text, border transparent
danger:    bg white,         #7A2E2E text, border #E9C5C5
success:   bg white,         #1E5B38 text, border #C5E0D0

All: border-radius 7px; font-weight 600; inline-flex; gap 6px
Supports icon prop (renders Icon at 14px on the left)
```

### `Pill` (Status Badge)

```
tones: pending | approved | rejected | draft | submitted | info | warn | accent

Renders: inline-flex; border-radius 999px; padding 3px 10px
         font: 11.5px/600; letter-spacing 0.2px; text-transform uppercase
         Optional leading dot (6×6px circle)

PILL_TONES lookup:
  pending:   bg #FEF6E4, fg #8A5A0B, dot #D98A00
  approved:  bg #E8F3ED, fg #1E5B38, dot #2E8B57
  rejected:  bg #FBEAEA, fg #7A2E2E, dot #B33A3A
  draft:     bg #F1F2F4, fg #4B5563, dot #8A8F98
  submitted: bg #EAF1F8, fg #1E3A5F, dot #2F5D8A
  warn:      bg #FEF6E4, fg #8A5A0B, dot #D98A00
  accent:    bg var(--accent-100), fg var(--accent-700), dot var(--accent)
```

### `Avatar`

```
Props: emp (employee object), size (default 36), ring (boolean, adds white+colour border)

Circle with emp.color background, white initials text.
Font-size = size × 0.38; font-weight 600
ring → box-shadow: 0 0 0 3px #fff, 0 0 0 4px {emp.color}40
```

### `PageHeader`

```
Props: title, subtitle?, actions?

Layout: flex row; align-items flex-end; gap 20; margin-bottom 24
title:    font-serif; 28px; weight 600; letter-spacing -0.6px; color var(--ink-1)
subtitle: 14px; color var(--ink-3); margin-top 6px
actions:  right-aligned flex row with gap 8
```

### `Kpi` (KPI tile)

```
Props: icon, label, value, sub, tone?, onClick?

tone="accent" → bg var(--accent-050), border var(--accent-200)
default       → bg var(--card), border var(--border)
border-radius: 12px; padding: 18px

Layout:
  icon + LABEL (uppercase 11.5px/600)   ← row 1
  VALUE (30px serif/600 ink-1)          ← row 2 (margin-top 10)
  sub (11.5px ink-3)                    ← row 3 (margin-top 4)
```

### `Modal`

```
Props: children, onClose, title, width (default 480)

Overlay: fixed inset-0; rgba(18,24,36,0.45); z-index 50; grid center
Panel:   bg var(--card); border-radius 14px; box-shadow 0 30px 60px rgba(0,0,0,0.25)
Header:  padding 18/22px; border-bottom; serif 17px/600; X close button
Body:    padding 22px
Animations: fadeIn overlay, modalIn panel
```

### `Field`

```
Label wrapper for form fields.
Props: label (string), children (input/select/textarea)

Renders: flex-column; gap 6
Label text: 11.5px/600 ink-3; letter-spacing 0.3px; uppercase

inputStyle (shared):
  padding: 9px 12px
  border: 1px solid var(--border); border-radius 7px
  font: 13.5px var(--font-sans); color var(--ink-1)
  background: var(--card); outline none
```

### `EmptyState`

```
Props: icon, title, body

Centered; padding 60px; bg var(--card); border; border-radius 12px
Icon circle: 48×48; border-radius 50%; bg var(--accent-100); color var(--accent-700)
Title: 15px serif/600 ink-1; letter-spacing -0.2px
Body: 13px ink-3; margin-top 6px
```

### Table Styles

```css
tableStyle:  width 100%; border-collapse collapse; font-size 13px
thStyle:     padding 12/20px; text-align left; 11px/600 ink-3;
             letter-spacing 0.4px; uppercase; bg var(--surface)
tdStyle:     padding 14/20px; color var(--ink-2); vertical-align middle
linkBtn:     inline-flex; bg transparent; border 0; color var(--accent-700);
             12px/600; cursor pointer
```

---

## 3. App Shell

### Layout

```
Full viewport: flex row

┌─────────────────────────────────────────┐
│  Sidebar (240px, collapsible to 72px)   │
│  bg: var(--nav-bg)                      │
│  ┌──────────────────────────────────┐   │
│  │ Logo: "M" icon + "AVANIIS People"│   │
│  │        "Avaniis"  │   │
│  ├──────────────────────────────────┤   │
│  │ Nav items (role-specific)        │   │
│  ├──────────────────────────────────┤   │
│  │ Footer (employee sidebar only):  │   │
│  │  Avatar + name + role + logout→  │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  Main area (flex-column)                │
│  ┌──────────────────────────────────┐   │
│  │ Topbar (56px admin / 64px emp)   │   │
│  │ [←]? icon title    [search]      │   │
│  │  🔔 EN/AR | avatar+name logout→  │   │
│  │  (logout in topbar for all roles)│   │
│  ├──────────────────────────────────┤   │
│  │ Page content (scrollable)        │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Topbar — 5 Mandatory Elements (all roles)

All three roles (EMPLOYEE, MANAGER, HR_ADMIN) must show these elements on every page:

| # | Element | Position | Condition |
|---|---------|----------|-----------|
| 1 | Back button (chevron-left, 32×32) | Topbar far LEFT | Hidden on home page (`/me` employee · `/dashboard` admin/manager) |
| 2 | Search bar (max-width 400px) | Topbar CENTER (flex: 1) | Always visible |
| 3 | Bell notification icon (36×36) | Topbar RIGHT, before language | Always visible |
| 4 | Language toggle EN / عربي | Topbar RIGHT, between bell and user | Always visible |
| 5 | User avatar + name + role | Topbar far RIGHT | Always visible |
| 6 | Logout icon (`/sign-out`) | Topbar far RIGHT — all roles | Always visible; `EmployeeSidebar` footer also has a secondary logout link |

**Back button behavior:** `router.back()` if `window.history.length > 1`, else navigate to role home.

**Components:**
- `(hr-admin)` shell: `components/layout/AdminTopbar.tsx` (client component; locale passed as prop from server layout)
- `(employee)` shell: `components/employee/EmployeeTopbar.tsx` (client component; locale passed as prop from server layout)

### Nav Items by Role

**Employee:**
`Home (dashboard)` · `My Leave (leave)` · `Timesheet` · `Directory` · `My Profile (profile)`

**Manager:**
`Team Overview (dashboard)` · `Approvals` *(badge: pending count)* · `My Team (team)` · `My Leave (leave)` · `Timesheet` · `Directory`

**Admin:**
`Overview (dashboard)` · `Users & Roles (users)` · `Employees` · `Assignments` · `Leave (leave-admin)` · `Timesheets (timesheet-admin)` · `Reports` · `Settings`

### Topbar Search

`flex: 1; max-width: 400px; margin: 0 auto` (centered in topbar).
bg `var(--surface)`; border `1px var(--border)`; border-radius 8px; padding 7/12px.
Placeholder: "Search people, leaves, timesheets…"
Left slot: magnifying-glass SVG (15px, `var(--ink-4)`).
Right slot: `⌘K` kbd badge — `font: 11px/600 var(--font-mono); background: var(--border)`.

### Toast

Fixed bottom-center; border-radius 10px; padding 12/18px; z-index 100.
Auto-dismisses after 3.2 s.
Tones: `success` (#1E5B38 bg) · `warn` (#8A5A0B bg) · `info` (#1E3A5F bg)

---

## 4. Data Shapes & Seed Data

### Employee

```typescript
{
  id:        string        // 'e01'
  initials:  string        // 'AK'
  first:     string
  last:      string
  email:     string
  phone:     string
  dept:      string        // department id
  pos:       string        // job title
  hired:     string        // ISO date
  status:    'ACTIVE'
  managerId: string | null
  color:     string        // hex, used for avatar background
}
```

**Key personas:**
| id  | Name             | Role     | Dept              |
|-----|------------------|----------|-------------------|
| e01 | Aisha Khalidi    | Employee | Architecture (d2) |
| e10 | Omar Haddad      | Manager  | Architecture (d2) |
| e20 | Noura Al-Hashimi | Admin    | Human Resources (d6) |

Omar's direct reports: e02 Devika, e03 Jorge, e04 Fatima, e05 Kenji, e06 Layla

### Leave Request

```typescript
{
  id:         string
  employeeId: string
  type:       'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY'
  startDate:  string   // ISO date
  endDate:    string
  days:       number   // working days (UAE weekend = Fri/Sat)
  status:     'PENDING' | 'APPROVED' | 'REJECTED'
  reason:     string
  reviewNote: string
  submitted:  string   // ISO date
}
```

### Leave Balance

```typescript
{ [employeeId: string]: {
    ANNUAL:    { total: number, used: number }
    SICK:      { total: number, used: number }
    EMERGENCY: { total: number, used: number }
} }
```

Aisha (e01): Annual 22/8 used · Sick 15/2 · Emergency 3/0

### Timesheet

```typescript
{
  id:         string
  employeeId: string
  weekStart:  string   // ISO Monday date
  hours:      number[] // [Mon,Tue,Wed,Thu,Fri,Sat,Sun], 7 elements
  status:     'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  reviewNote: string
}
```

UAE weekend = Friday (index 4) and Saturday (index 5).
Overtime threshold: >45 hours/week.

### `daysBetween(start, end)`

Counts working days (skips Fri=5, Sat=6). Returns minimum 1.

---

## 5. Employee Views

### Employee Dashboard

**URL:** `/me` (employee) · **Route:** `dashboard`

**Layout:** `maxWidth 1200; margin 0 auto`

#### Hero Banner

```
background: linear-gradient(135deg, var(--accent-900) 0%, var(--accent-700) 100%)
border-radius: 16px; padding: 28/32px; color: white; position: relative; overflow: hidden

Decorative circles (position: absolute, pointer-events: none):
  right: -40, top: -40 → 200×200px, rgba(255,255,255,0.06)
  right: 60, bottom: -80 → 240×240px, rgba(255,255,255,0.04)

Content (position: relative):
  Date: 13px/500; opacity 0.75; uppercase; letter-spacing 0.04em
  Greeting: serif 34px/500; letter-spacing -0.8px; margin 6/0/4px
  Subtitle: 15px; opacity 0.82; maxWidth 520px
    → if pending: "Your leave request is pending review from {manager.first}."
    → else: "Nothing needs your attention. Have a productive day."
  Buttons (margin-top 18, gap 10):
    "Request Leave" → bg #fff, color var(--accent-900), border 0
    "Log hours ({N}h this week)" → bg rgba(255,255,255,0.12), border rgba(255,255,255,0.22)
```

#### Main Grid

`gridTemplateColumns: 2fr 1fr; gap: 20; margin-top: 24`

**Left column (2fr):** `flex-column; gap 20`
1. Leave Balance Band → [see §5 Leave Balance Band]
2. Recent Activity Card → [see §5 Recent Activity]

**Right column (1fr):** `flex-column; gap 20`
1. Upcoming Time Off Card → [see §5 Upcoming Time Off]
2. Who's Out This Week Card → [see §5 Team Out]
3. Company Updates Card → [see §5 Announcements]

#### Leave Balance Band

Title: `"Leave balance — {year}"` · action: `"View all →"`

Three equal columns (`repeat(3, 1fr)`), right-border divider between first two.

Each column (`padding: 22/24px`):
```
LABEL LEAVE       ← 11.5px/600 ink-3; uppercase; letter-spacing 0.05em
{N}  / {total} days  ← N: 32px serif/600 ink-1 letter-spacing -1px; /total: 13px ink-3
Progress bar (6px, border-radius 4, bg var(--surface)):
  filled: leave type colour; width = (used/total)%
{used} days used  ← 11.5px ink-3; margin-top 6px
```

**Leave type colours for the band:**
- ANNUAL → `var(--accent)`
- SICK → `var(--status-warning)` (#F29900)
- EMERGENCY → `var(--status-rejected-dot)` (#C0392B)

#### Recent Activity Card

Title: `"My recent activity"` (no action link)

Up to 4 rows, each `padding: 14/20px; border-top 1px var(--border); flex; gap 14`:
```
Icon circle (40×40, border-radius 10):
  bg: typeColor + '15'; color: typeColor
  Calendar SVG icon (18px)

Text block:
  Line 1 (13.5px/600 ink-1): "{TypeLabel} leave · {N} day(s)"
  Line 2 (12px ink-3): "{startShort} → {endShort} · Submitted {submitDate}"

Status pill (Pill component, right-aligned)
```

#### Upcoming Time Off Card

Title: `"Upcoming time off"`

Each row `padding: 14/20px; flex; gap 12`:
```
Calendar tile (44px wide, border-radius 8):
  bg var(--accent-100); color var(--accent-700); text-align center
  Month: 10px/700; uppercase; letter-spacing 0.05em
  Day:   18px/700 serif; line-height 1.2

Text:
  "{TypeLabel} leave" — 13px/600 ink-1
  "{N} days · {reason}" — 11.5px ink-3
```
Empty state: `"No approved leave coming up."`

#### Who's Out This Week Card

Title: `"Who's out this week"`

Each row `padding: 12/20px; flex; gap 10`:
```
Avatar (32px)
Name (13px/600 ink-1) + type · dates (11px ink-3)
```
Empty state: `"Full team in this week."`

Filter: `status === 'APPROVED' && startDate starts with current month YYYY-MM`.

#### Company Updates Card (Static)

Title: `"Company updates"`

Three announcements (static, no DB query):
| id | icon     | title                         | body                                                  | time  | pinned |
|----|----------|-------------------------------|-------------------------------------------------------|-------|--------|
| a1 | megaphone| Q2 townhall — May 7           | Leadership update, 2pm in the Atrium. Remote link in calendar. | 2h ago | ✓ |
| a2 | gift     | Wellness stipend refreshed    | AED 1,500 available for 2026. Submit claims via Finance portal. | 1d ago | |
| a3 | users    | New hire — Layla Abdelrahman | Interior Designer, joining Architecture team.         | 3d ago | |

Each row `padding: 14/20px; flex; gap 12; align-items flex-start`:
```
Icon circle (32×32, border-radius 8): bg var(--accent-100); color var(--accent-700)

Text:
  Title row: 13px/600 ink-1; inline "● PINNED" badge (9px/700 accent) if pinned
  Body: 12px ink-3; line-height 1.5
  Time: 11px ink-4
```

---

## 6. Manager Views

### Manager Dashboard

**Route:** `dashboard` (manager role)

**Layout:** `maxWidth 1200; PageHeader with greeting + team summary`

#### KPI Row

`gridTemplateColumns: repeat(4, 1fr); gap 16; margin-bottom 24`

| KPI             | Icon    | Value                         | Sub                          | Tone   |
|-----------------|---------|-------------------------------|------------------------------|--------|
| Pending approvals | check | leaves.PENDING + ts.SUBMITTED | "{N} leave · {M} timesheet" | accent |
| Team size       | users   | team.length                   | "All active"                 | —      |
| On leave this month | calendar | approved out count       | "Approved requests"          | —      |
| Avg hours / week | clock  | 41.2                          | "Team last week"             | —      |

#### Main Grid

`gridTemplateColumns: 1.4fr 1fr; gap 20`

**Left — "Needs your review" Card:**
Merged list of pending leaves + submitted timesheets, max 5 shown.
Each row: Avatar (36px) + name/details + type pill + "Review" button (sm secondary).
Leave detail: `"{TypeLabel} leave · {N}d · {start}–{end}"`
Timesheet detail: `"Timesheet · {total}h · week of {date}"`
Empty state: checkmark icon + "Queue is clear".

**Right — "Team at a glance" Card:**
Each team member row: Avatar (32px) + name + position + status dot.
On leave → `<Pill tone="warn">On leave</Pill>`
Active → green dot (#2E8B57, 8×8px circle).

### Approvals Page

**Route:** `approvals`

Tab bar: `"Leave requests ({N})"` · `"Timesheets ({N})"` (underline-tab style, accent border-bottom on active).

#### Leave Approval Card

Per pending leave request, `bg var(--card); border; border-radius 12; padding 20`:
```
Header row: Avatar (44px) + name/title + detail stats (flex wrap, gap 24)
  Stats (LeaveStat): Type | Dates | Days | Balance after | Submitted
  Reason block: bg var(--surface); border-left 3px var(--accent); 13px ink-2

Action column (min-width 140, flex-column gap 8):
  <Btn variant="success" icon="check">Approve</Btn>
  <Btn variant="danger"  icon="x">Reject</Btn>
```
Reject → opens `RejectModal` (textarea for required reason).

#### Timesheet Approval Card

`flex; gap 14` + 7-day grid below:
Avatar + name/week/total + Approve/Reject buttons (sm).
`7-col grid`: each cell `padding 10px; bg var(--surface); border-radius 6`.
Fri/Sat columns opacity 0.6 (UAE weekend).
Overtime label: `color #8A5A0B` when total > 45.

**`RejectModal`:** Title + description + textarea (required) + Cancel/Reject buttons.

### Team Page

**Route:** `team`

Table: Name | Position | Annual left | Last week hours | Status | chevron.
Click row → navigate to employee detail.
OT label: `color #8A5A0B; "· OT"` when hours > 45.

---

## 7. Admin Views

### Admin Dashboard

**Route:** `dashboard` (admin role)

KPIs: Active headcount | On leave today | Pending approvals (accent) | Overtime alerts (>45h).
Actions in PageHeader: Export + Add employee.

#### Headcount by Department

`flex-column; gap 10`. Each bar row:
```
Department name (170px) | Progress bar (flex 1, 22px tall) | Count (serif 13px) | Entity (110px)
Bar: linear-gradient(90deg, var(--accent-700), var(--accent)); width = (count/max)%
```

#### Leave Utilization YTD

Three leave types (ANNUAL/SICK/EMERGENCY).
Each: label + "used / total · pct%" row, then 8px progress bar.
Followed by "Upcoming holidays" sub-section.

### Users & Roles Page

Table: User | Email (mono) | Role pill | Department | Status pill | dot-menu.
Role tone: ADMIN → rejected, MANAGER → accent, EMPLOYEE → info.
Search input above.

### Employees Admin Page

Table: Employee (avatar+name+id) | Position | Department | Manager | Hired | Status.
Click row → navigate to employee detail.
Actions: Import CSV + Add employee.

### Assignments Page

**Entity cards grid** (`repeat(4,1fr); gap 14`):
Each entity: label "ENTITY" (uppercase 11px ink-3) + name (serif 15px/600) + dept/people count.
`border-left: 3px solid var(--accent)`.

**Department blocks** (one per dept, margin-bottom 14):
Header: icon circle + dept name (serif 15px/600) + entity/count + head avatar.
Members: pill-style chips with avatar (22px) + name; `flex-wrap; gap 6; padding-left 54`.

### Reports Page

6 report cards in `repeat(3,1fr)` grid:
Headcount | Leave utilization | Timesheet summary | Attendance | Turnover | Access audit log.
Each: icon circle (accent-100/700) + title (serif 14px/600) + desc + format label + Export button.

### Settings Page

**Leave Policies card** (table-style rows):
Each leave type: colour dot + label + policy description + Edit button.

**Approval Workflows card:**
3-step flow with numbered Pill badges (accent tone):
1. Employee submits → 2. Manager reviews within 2 business days → 3. Balance deducts on approval.

---

## 8. Leave Views

### Leave Page (Employee Self-Service)

**Route:** `leave` · Actions: "New request" button.

#### Balance Strip

`gridTemplateColumns: repeat(4, 1fr); gap 16; margin-bottom 24`

Each card: `bg var(--card); border; border-radius 12; padding 18; border-top: 3px solid {typeColor}`.
```
TYPE LABEL   ← 11px/600 ink-3; uppercase
{N} days left ← N: 26px serif/600 ink-1; "days left": 12px ink-3
{used} used of {total} ← 11px ink-4
UNPAID special case: "Unlimited, unpaid"
```

#### Tab Filter

`All requests | Pending | Approved | Rejected` — underline tabs with count badge.

#### Requests Table

Columns: Type (dot + label) | Dates | Days | Reason (truncated) | Submitted | Status pill.

### Leave Composer Modal

Width 520px. Fields:
1. **Leave type** — 2×2 button grid; selected: bg var(--accent-100), border var(--accent).
   Each button: colour dot + label + remaining balance sub-text.
2. **Start / End date** — side-by-side date pickers.
3. **Summary bar** — "N working days requested" + "Exceeds balance" warning in #B33A3A.
4. **Reason** — optional textarea.
5. **Approver** — read-only row with manager avatar + name + title.
6. Footer: Cancel + "Submit for approval" (disabled if insufficient balance).

---

## 9. Timesheet Views

### Timesheet Page

**Route:** `timesheet`

#### Week Selector Bar

`padding 16/20px; border-bottom; flex; gap 14`
Prev/Next chevron buttons (iconBtn 32px) · "Week of {date}" serif heading · status pill.

#### 7-Day Input Grid

`gridTemplateColumns: repeat(7,1fr)`.
UAE weekend: Fri (index 4) and Sat (index 5) → `bg var(--surface); opacity 0.6`.

Each cell:
```
Day abbreviation: 11px/700 ink-3; uppercase; letter-spacing 0.5em
Date number: 12px ink-4
Number input: width 100%; 22px serif/600; padding 14/4px; border-radius 8
  ink-1 if hours > 0; ink-4 if zero
  disabled (bg var(--surface)) when status !== DRAFT/REJECTED
"HOURS" label: 10px ink-4; mono; letter-spacing 0.3em
```

#### Totals Bar

`bg var(--surface); padding 18/20px; border-top; flex; gap 20`
Total hours (24px serif/600) · Overtime pill (warn tone, shows +Nh) · Save draft + Submit buttons.
Status "Awaiting manager review" text when SUBMITTED.
Manager review note: `bg #FEF6E4; border-top; 13px; color #6B4300`.

#### History Table

Columns: Week | Total hours (+ OT label) | Status pill | "Open →" link button.

---

## 10. Directory & Profile Views

### Directory Page

**Route:** `directory`

Search input (full-width, with search icon at left 12px) + Department filter dropdown (minWidth 200px).

Grouped by department:
```
Dept header: icon (briefcase, accent) + name + entity name (ink-4) + "{N} people" right-aligned
Employee cards grid: repeat(auto-fill, minmax(260px, 1fr)); gap 12
  Each card: border; border-radius 10; padding 14; flex; gap 12; cursor pointer
  Hover: borderColor var(--accent); bg var(--accent-050)
  Avatar (40px) + name (13.5px/600) + position (12px ink-3)
```

### Employee Detail / Profile Page

**Route:** `employee-detail`, `profile`

#### Profile Header Card

```
Banner: height 110px; background: linear-gradient(135deg, {emp.color}, {emp.color}CC)
Content area: padding 0/28/24px; flex; gap 22
  Avatar (96px, ring=true): margin-top -44px (overlaps banner)
  Name: serif 28px/600; letter-spacing -0.6px
  Position: 14px ink-2; margin-top 4px
  Meta row: icon + text for: Dept | Entity | Email | Phone
    metaItem: inline-flex; gap 6; 12.5px ink-2
  Status pill (top-right)
```

#### Detail Grid `1fr 1fr`

**Employment card:**
Rows (label/value): Hired · Tenure · Employee ID · Reports to (with avatar) · Direct reports count.
`Row` component: flex space-between; padding 10/0; border-bottom (except last).

**Leave Balance 2026 card (flush, pad=0):**
3 rows (ANNUAL/SICK/EMERGENCY): 4px vertical colour bar + label + "X of Y used" + remaining days (18px serif/600 right-aligned).

**Direct Reports card** (full width if any reports):
Auto-fill grid of mini employee chips (avatar 32px + name + position).

**Recent Leave table** (full width):
Columns: Type (dot+label) | Dates | Days | Status pill.

---

## 11. Icon Reference

All icons: `stroke currentColor; strokeWidth 1.75; strokeLinecap round; strokeLinejoin round; fill none`

| name          | description         | SVG path summary |
|---------------|---------------------|-----------------|
| home          | house               | `path d="M3 11l9-8 9 8v10..."` |
| users         | two people          | circle + paths for person group |
| user          | single person       | circle + path |
| calendar      | calendar grid       | rect + horizontal line + verticals |
| clock         | clock face          | circle + hands `M12 7v5l3 2` |
| org           | org chart nodes     | 4 rects + connecting paths |
| chart         | bar chart           | vertical bars |
| settings      | gear                | circle + outer path with notches |
| search        | magnifying glass    | circle + line |
| bell          | notification bell   | path + `M10 21a2 2 0 004 0` |
| plus          | add / cross         | `M12 5v14M5 12h14` |
| check         | checkmark           | `M5 13l4 4 10-10` |
| x             | close               | `M6 6l12 12M6 18L18 6` |
| chevron-right | >                   | `M9 6l6 6-6 6` |
| chevron-down  | ∨                   | `M6 9l6 6 6-6` |
| chevron-left  | <                   | `M15 6l-6 6 6 6` |
| arrow-right   | → with arrowhead    | line + arrowhead |
| arrow-up-right| ↗ diagonal          | `M7 17L17 7M9 7h8v8` |
| megaphone     | speaker/announce    | path with cone shape |
| gift          | present box         | rect + bow + ribbon |
| file          | document            | folded corner path |
| download      | ↓ to line           | `M12 4v12m0 0l-5-5m5 5l5-5M4 20h16` |
| upload        | ↑ from line         | `M12 20V8m0 0l-5 5m5-5l5 5M4 4h16` |
| filter        | funnel              | `M3 5h18l-7 8v6l-4 2v-8L3 5z` |
| logout        | door with arrow     | path + arrow |
| mail          | envelope            | rect + diagonal `M3 7l9 7 9-7` |
| phone         | handset             | detailed path |
| building      | office block        | rect + windows + door |
| briefcase     | briefcase           | rect + handle path |
| dot-menu      | ···                 | 3 filled circles |
| sparkle       | ✦ star              | 4-pointed star path |
| shield        | security shield     | path outline |
| activity      | waveform            | `M3 12h4l3-8 4 16 3-8h4` |

---

*End of handoff reference. Last converted: 2026-04-30.*
