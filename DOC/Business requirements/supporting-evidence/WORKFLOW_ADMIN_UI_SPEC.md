# AVANIIS HR — Workflow Admin UI Specification
## Component Hierarchy, Wireframes, and Interaction Design

**Status:** Design — Awaiting Implementation Approval  
**Date:** 2026-05-01  
**Design system:** AVANIIS Design Standard v1.1 (DESIGN-STANDARD.md)

---

## Routes

```
/configuration/workflows                  → Workflow Builder (list + detail)
/configuration/workflows/groups           → Approval Groups Manager
/configuration/workflows/delegations      → Delegation Manager
/configuration/workflows/sla-calendars    → SLA Calendar Configuration
/approvals                                → Approvals Inbox (manager + HR admin)
/approvals/[instanceId]                   → Approval Detail (drawer or page)
/me/requests                              → Employee: My Request Status
```

---

## 1. Workflow Builder (`/configuration/workflows`)

### 1.1 Page Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  [← Back]  [⚡] Workflow Configuration                    🔔  EN/AR  [Avatar]  │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────┐  ┌─────────────────────────────────────────────────┐ │
│  │  LEAVE    CORE HR    │  │  Annual Leave Approval    [ACTIVE ●]   [Preview] │ │
│  │  ATTENDANCE  TRAVEL  │  │  WF-LEAVE-ANNUAL  ·  Leave module                │ │
│  │  PAYROLL  ACCESS     │  │                                                   │ │
│  │──────────────────────│  │  Default hierarchy:                               │ │
│  │  ● Annual Leave  3 ✓ │  │  [LINE MANAGER ▼]  Fallback: [POSITION ▼]       │ │
│  │  ● Sick Leave    2 ✓ │  │                                                   │ │
│  │  ○ Emergency     2 ✓ │  │  ── STEP PIPELINE ─────────────────────────────  │ │
│  │  ● Maternity     3 ✓ │  │                                                   │ │
│  │  ● Hajj Leave    2 ✓ │  │  [1]────────[2]──────?──[3]──────?──[4]         │ │
│  │  ──────────────────  │  │  LM N+1    HOD               HR Admin   AUTO      │ │
│  │  ● Backdated Hire    │  │  48h 🟢    COND 48h 🟢      COND 24h 🟢  ⚙️    │ │
│  │  ● Salary Increment  │  │                                                   │ │
│  │  ──────────────────  │  │  [+ Add Step]                                     │ │
│  │  [+ New Workflow]    │  │                                                   │ │
│  └──────────────────────┘  └─────────────────────────────────────────────────┘ │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Left Panel — Workflow List

```
Component: WorkflowList
Width: 280px
Props: { module: WorkflowModule, selectedId: string }

Layout:
  Module tabs (horizontal scroll):
    [LEAVE] [CORE HR] [ATTENDANCE] [TRAVEL] [PAYROLL] [ACCESS] [ALL]
    Active tab: accent color underline
  
  Search input: "Search workflows..."
  
  Workflow items (vertical list):
    Each item:
      ● (active dot) / ○ (inactive)
      Workflow name (bold)
      Step count badge: "3 steps"
      Check/Warning icon: all steps configured vs. issues found
    
    Click: select workflow → loads in right panel
    
  Bottom:
    [+ New Workflow] button (outline style)
    
States:
  - Selected item: accent background
  - Inactive workflow: muted text
  - Draft workflow: [DRAFT] pill
```

### 1.3 Right Panel — Workflow Detail

```
Component: WorkflowDetail
Props: { workflowDefinitionId: string }

Header section:
  Editable title (click to edit inline)
  Code chip: [WF-LEAVE-ANNUAL] (read-only)
  Module tag: [LEAVE] pill
  Status toggle: [● Active] / [○ Draft]
  
  Row: "Default hierarchy for all steps:"
    [LINE MANAGER ▼]  with options:
      ○ Line Manager hierarchy (default, most common)
      ○ Position org chart hierarchy
      ○ Custom approval group
    
    "Fallback if primary fails:"
    [None ▼] / [Line Manager] / [Position] / [HR Admin]
  
  [🔍 Preview Chain] button — opens Hierarchy Preview Tool
  [↓ Export Config] button — exports as JSON
  [⚠ Validate] button — runs configuration check

Step Pipeline (see 1.4)

Configuration panel:
  Min approval levels: [1]
  Max approval levels: [10]
  On approver not found: [Escalate up ▼]
  Allow self-approval: ☐ No
  Auto-approve after SLA: ☐ No
  Version: 1 (auto-increment on save)
  
[Save Changes] button (sticky bottom)
[Discard] button
```

### 1.4 Step Pipeline

```
Component: StepPipeline
Props: { steps: WorkflowStepV2[], workflowDefId: string }

Visual:
  Horizontal scrollable pipeline
  
  Each step card (80px wide, 110px tall):
  ┌──────────────┐
  │ [icon] Step 1│ ← step_order
  │ Line Manager │ ← step_name (truncated)
  │ LM · N+1     │ ← hierarchy type + level
  │ 48h 🟢       │ ← SLA hours + status
  └──────────────┘
  
  Connector between cards: ──── (solid = always) or ─·─·─ (dashed = conditional)
  Conditional connectors show rule preview on hover:
    "Activates when: leave.days > 7"
  
  Step icons per hierarchy type:
    LINE_MANAGER:  👤  (person silhouette)
    POSITION:      🏢  (org chart node)
    CUSTOM_GROUP:  👥  (group)
    ROLE_IN_ORG:   🎭  (role badge)
    RULE_RESOLVED: 📋  (rule)
    AUTO:          ⚙️  (gear)
  
  Step card states:
    Normal:      white card, accent border
    Conditional: white card, dashed amber border
    SKIPPED:     grey card, "SKIPPED" label
    AUTO:        light grey card, no action required
  
  Click any step → opens Step Editor right drawer
  
  [+ Add Step] at end — opens new step editor in drawer
  
  Drag handles (⋮⋮) for reordering
  Delete button (✕) on hover
```

### 1.5 Step Editor Drawer

```
Component: StepEditorDrawer
Props: { step: WorkflowStepV2 | null, workflowDefId: string }
Width: 480px (slides in from right)

Title: "Edit Step 2" / "New Step"
Subtitle: workflow name

─────────────────────────────────────────────────
SECTION 1 — HIERARCHY CONFIGURATION
"How to find the approver for this step"
─────────────────────────────────────────────────

  Primary hierarchy:
  
    ● Line Manager hierarchy
      Level: [1 — Direct manager (N+1) ▼]
             Options: 1 (Direct), 2 (N+2), 3 (N+3),
                      HOD (Dept head), Entity Head
    
    ○ Position org chart hierarchy
      Level: [1 — One level above ▼]
    
    ○ Custom approval group
      Group: [searchable group picker]
      Voting: [Any one approves ▼]
    
    ○ Role in organisation
      Role: [HR_ADMIN ▼] (avaniisRole values)
    
    ○ Role in department
      Role: [DEPT_MANAGER ▼]
    
    ○ Named person (escape hatch)
      Person: [person search picker]
    
    ○ Determined by rule
      Rule: [rule picker]

  "What if no approver is found?"
  [Escalate to higher level ▼]
  Options: Escalate up / Use fallback hierarchy / Assign HR Admin / Show error

─────────────────────────────────────────────────
SECTION 2 — ACTIVATION CONDITION
"Show this step only when:"
─────────────────────────────────────────────────

  ● Always run this step
  ○ Only when condition is met:
    [Condition Builder Component — see Section 3]

─────────────────────────────────────────────────
SECTION 3 — SLA CONFIGURATION
─────────────────────────────────────────────────

  Approval deadline: [48] working hours
  ℹ️  "UAE working hours: Sunday–Thursday 09:00–18:00 GST.
       Deadline pauses on weekends and public holidays."
  
  Send reminder: [24] hours before deadline
  
  If deadline is missed:
  [Escalate to higher approver ▼]
  
  Escalate to: ● Next level up in this step's hierarchy
               ○ Specific role: [role picker]
               ○ HR Admin

─────────────────────────────────────────────────
SECTION 4 — ACTIONS & COMMENTS
─────────────────────────────────────────────────

  Available actions:
  ☑ Approve    ☑ Reject    ☑ Delegate
  ☑ Send back  ☑ Request information
  
  Require a comment when:
  [REJECT ▼] [SEND BACK ▼]  (multi-select pills)

─────────────────────────────────────────────────
SECTION 5 — NOTIFICATIONS
─────────────────────────────────────────────────

  ☑ Notify approver when this step activates
  ☑ Include one-click approve/reject links in email
  ☑ Send SLA reminder notification
  Channels: ☑ In-app  ☑ Email  ☐ SMS

─────────────────────────────────────────────────

  [Save Step]  [Cancel]  [Delete Step] (red, with confirm)
```

---

## 2. Approval Groups Manager (`/configuration/workflows/groups`)

### 2.1 Groups List Page

```
Component: ApprovalGroupsPage

Header: "Approval Groups" + [+ New Group] button
Subtext: "Named approver pools for custom routing"

Table:
  Columns: Name | Code | Type | Members | Used in | Actions
  
  Row example:
  Finance Committee | FINANCE_COMMITTEE | STATIC | 4 members | 2 workflows | [Edit] [Archive]
  HR Leadership     | HR_LEADERSHIP     | DYNAMIC| ~6 at runtime | 3 workflows | [Edit]
  
  Type badges:
    STATIC:  grey pill
    DYNAMIC: teal pill
    HYBRID:  purple pill
  
  Members column:
    STATIC:  "4 members" (exact count)
    DYNAMIC: "~6 at runtime" (estimated from last evaluation)
    HYBRID:  "2 static + ~4 dynamic"
  
  "Used in N workflows" is a link → shows which workflows reference this group
```

### 2.2 Group Editor

```
Component: GroupEditor
Route: /configuration/workflows/groups/[groupId]

Header: "Edit Group" / "New Group"

  Name (EN): [Finance Approval Committee        ]
  Name (AR): [لجنة موافقة المالية               ]
  Code:      [FINANCE_COMMITTEE                  ] (auto-generated, editable)
  
  Group type:
  ● Static — specific named members
  ○ Dynamic — resolved at runtime from conditions
  ○ Hybrid — static members PLUS dynamic conditions
  
  Voting method:
  [Any one approves ▼]
  Options: Any one / All must approve / Majority (>50%) / Unanimous
  
  Min members required: [1] (error if fewer resolved at runtime)

  ── For STATIC type ─────────────────────────────
  
  Members:
  ┌────────────────────────────────────────────────┐
  │ [DK] Dorababu Kethari   LEAD    01 Jan → –  [✕]│
  │ [AZ] Aisha Al Zaabi     MEMBER  01 Jan → –  [✕]│
  │ [OH] Omar Haddad        MEMBER  01 Mar → –  [✕]│
  └────────────────────────────────────────────────┘
  
  [+ Add Member] → opens person picker:
    Search by name or employee number
    Set role in group: LEAD / MEMBER / ALTERNATE
    Set valid from / to dates (or leave open-ended)
  
  ── For DYNAMIC type ───────────────────────────
  
  "Members are all persons where:"
  [Condition Builder — same component as step activation]
  
  Example condition:
    avaniis_role IS Finance_Manager
    AND entity_id IS [initiator entity]
  
  [▶ Preview members now]
  → Evaluates condition against live data
  → Shows: "This resolves to 3 persons: Sarah M., Khalid A., Reem F."
  
  ── For HYBRID type ────────────────────────────
  
  Both sections shown. 
  "Final group = named members UNION dynamic condition results"

  [Save Group]  [Cancel]
```

---

## 3. Condition Builder Component

```
Component: ConditionBuilder
Reused in: StepEditorDrawer (step activation), GroupEditor (dynamic membership)
Props: {
  value:    Condition[]
  logic:    'AND' | 'OR'
  onChange: (conditions: Condition[], logic: 'AND' | 'OR') => void
  context:  'LEAVE' | 'SALARY' | 'TRAVEL' | 'ATTENDANCE' | 'EMPLOYMENT_ACTION' | 'ANY'
}

Visual Layout:
┌──────────────────────────────────────────────────────────────┐
│  Match [ALL ▼] of the following conditions:                  │
│                                                              │
│  [Leave type ▼] [is ▼] [Annual Leave ▼]              [✕]   │
│  [Leave days ▼] [greater than ▼] [_7_______]          [✕]   │
│                                                              │
│  ┌── Or any of: (group) ────────────────────────────────┐   │
│  │  [Grade level ▼] [≥ ▼] [_7_]                   [✕]  │   │
│  │  [Is UAE national ▼] [is true ▼]                [✕]  │   │
│  │  [+ Add condition]                                    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  [+ Add condition]    [+ Add group (AND/OR)]                 │
│                                                              │
│  ── Human-readable preview ─────────────────────────────    │
│  "Activates when: leave type is Annual AND leave days >      │
│   7 AND (grade level ≥ 7 OR is UAE national)"                │
│                                                              │
│  [▶ Test with values]  → opens test panel                    │
└──────────────────────────────────────────────────────────────┘

Field Picker (searchable dropdown, grouped by category):

  EMPLOYEE
    Grade code           (TEXT)
    Grade level          (NUMBER)
    Department           (REFERENCE)
    Entity               (REFERENCE)
    Nationality          (TEXT/ENUM)
    Nationality category (ENUM: UAE_NATIONAL / GCC / EXPAT)
    Employment type      (ENUM)
    Service months       (NUMBER)
    Service years        (NUMBER)
    Is on probation      (BOOLEAN)
    Is UAE national      (BOOLEAN)
  
  LEAVE REQUEST
    Leave type           (ENUM)
    Duration (days)      (NUMBER)
    Working days         (NUMBER)
    Is backdated         (BOOLEAN)
    Backdated days       (NUMBER)
    Balance remaining    (NUMBER)
    Balance % used       (NUMBER)
    Start month          (NUMBER 1-12)
    Spans Ramadan        (BOOLEAN)
  
  SALARY CHANGE
    Increment %          (NUMBER)
    New basic salary     (NUMBER)
    Current basic salary (NUMBER)
    Increment amount     (NUMBER)
  
  TRAVEL
    Destination country  (TEXT ISO-3)
    Is international     (BOOLEAN)
    Duration (days)      (NUMBER)
    Estimated cost (AED) (NUMBER)
    Is GCC country       (BOOLEAN)
  
  ATTENDANCE
    Correction type      (ENUM: PUNCH_IN/PUNCH_OUT/BOTH)
    Missed days          (NUMBER)
    Is repeated this month (BOOLEAN)
  
  EMPLOYMENT ACTION
    Action type          (ENUM: PROMOTE/TRANSFER/GRADE_CHANGE)
    Salary impact %      (NUMBER)
  
  SYSTEM
    Today's date         (DATE)
    Day of week          (NUMBER 0-6)
    Current month        (NUMBER 1-12)
    Is Ramadan period    (BOOLEAN)

Operator options per data type:

  TEXT/ENUM:  is / is not / is one of / is not one of / contains / starts with
  NUMBER:     = / ≠ / > / < / ≥ / ≤ / between
  BOOLEAN:    is true / is false
  DATE:       is / before / after / between / in the last N days
  ARRAY:      contains / does not contain / is empty / is not empty

Test Panel (when [▶ Test with values] clicked):

  "Enter test values to see result:"
  
  Leave type:       [Annual Leave ▼]
  Leave days:       [8]
  Grade level:      [5]
  Is UAE national:  [No ▼]
  
  Result: ✓ TRUE (conditions met)
  
  Detail:
  ✓ leave type is Annual: TRUE
  ✓ leave.days (8) > 7:   TRUE
  ✗ Grade (5) ≥ 7:        FALSE
  ✗ UAE national:         FALSE
  → Group OR: FALSE (none matched)
  
  Final: TRUE AND TRUE AND FALSE = FALSE
  Wait — re-read: top-level is "ALL" (AND)
  → leave.type AND leave.days AND (grade OR nationality)
  → TRUE AND TRUE AND FALSE = FALSE
```

---

## 4. Hierarchy Preview Tool

```
Component: HierarchyPreviewTool
Route: accessible from Workflow Builder via [🔍 Preview Chain] button
Also available as standalone: /configuration/workflows/preview

Layout:
  Two-panel: Input (left) + Output (right, or below on narrow screens)

INPUT PANEL:
  "Simulate the approval chain for a test scenario"
  
  Workflow:       [WF-LEAVE-ANNUAL ▼]
  Test employee:  [person picker — search by name or number]
  
  Simulate request:
    Leave type:   [Annual ▼]
    Days:         [8]
    Is backdated: ☐
    
  [▶ Preview Chain]

OUTPUT PANEL (after preview):

  "For Aisha Khalidi (G5 · Architecture & Design)
   requesting 8 days Annual Leave:"
  
  ┌──────────────────────────────────────────────────────────────────┐
  │  ✓ Step 1 — Line Manager                                         │
  │    → Omar Haddad (Senior Architect)                              │
  │    Resolved via: Line Manager Hierarchy · Level 1                │
  │    SLA: 48 working hours · Actions: Approve / Reject / Delegate  │
  ├──────────────────────────────────────────────────────────────────┤
  │  ✓ Step 2 — Head of Department                          ACTIVE   │
  │    → Khalid Al Rashidi (VP Architecture)                         │
  │    Resolved via: Line Manager Hierarchy · HOD level              │
  │    CONDITION MET: leave.days (8) > 7 ✓                          │
  │    SLA: 48 working hours                                         │
  ├──────────────────────────────────────────────────────────────────┤
  │  ⊘ Step 3 — HR Admin                                   SKIPPED   │
  │    CONDITION NOT MET:                                            │
  │    leave.type (ANNUAL) not in                                     │
  │    [MATERNITY, PATERNITY, HAJJ, STUDY]                           │
  ├──────────────────────────────────────────────────────────────────┤
  │  ⚙ Step 4 — System Auto-Action                                   │
  │    Deduct leave balance · Create calendar block · Notify employee │
  └──────────────────────────────────────────────────────────────────┘
  
  Summary:
  "2 active approval steps + 1 auto step"
  "Estimated approval time: 96 working hours"
  "⚠ Assuming no SLA breaches"
  
  WHAT-IF CONTROLS:
  "Try changing the scenario:"
  
  [Change leave days: 8 → 15]
    → Step 3 HR Admin now ACTIVATES
    → New total: 3 active steps
    → Estimated: 120 working hours
  
  [Change grade: G5 → G8]
    → Step 2 HOD now activates even for 1 day leave
    → Condition: employee.grade_level (8) ≥ 7 ✓
  
  [Mark employee as Line Manager's direct report (no manager chain)]
    → Shows vacancy handling path
```

---

## 5. Delegation Manager (`/configuration/workflows/delegations`)

### 5.1 List View

```
Component: DelegationManager

Header: "Approval Delegations" + [+ New Delegation]

Tabs: [Active] [Upcoming] [Expired] [All]

Table:
  Delegator        | Delegate           | Scope         | Period          | Approved By    | Actions
  ─────────────────────────────────────────────────────────────────────────────────────────────────
  Omar Haddad      | Sarah Mohammed     | All workflows  | 01–14 Jun 2026 | Aisha Z.       | [Edit] [End]
  Khalid Al Rashidi| Reem Al Farsi      | Leave module   | 05–10 Jun 2026 | Aisha Z.       | [Edit] [End]

Status badges:
  ACTIVE:   green pill
  UPCOMING: amber pill
  EXPIRED:  grey pill

"[End]" button: immediately deactivates (with confirmation)
```

### 5.2 New Delegation Form

```
Component: CreateDelegationForm

"Create Approval Delegation"

  Who is delegating:   [person picker] *
  Delegate to:         [person picker] *
  
  Scope:
  ● All workflows
  ○ Specific modules:  ☑ Leave  ☐ Core HR  ☐ Attendance  ☐ Travel
  ○ Specific hierarchy types:  ☑ Line Manager  ☐ Position  ☐ Custom Group
  
  Valid from: [date picker] *
  Valid to:   [date picker] *
  
  Reason: [text area] *
  
  Approved by (HR Admin): [person picker — restricted to HR_ADMIN role] *
  
  ── Validation (real-time as user fills form) ──────────
  
  Error states shown inline:
  ✗ "Cannot delegate to yourself" (if delegator == delegate)
  ✗ "Circular delegation: Omar already delegates to Sarah, who delegates to Omar"
  ✗ "Overlapping delegation: Omar already has an active delegation to Khalid (01-20 Jun)"
  ✓ "Valid · Will affect 3 active approvals currently assigned to Omar"
  
  [Create Delegation]  [Cancel]
```

---

## 6. Approvals Inbox (`/approvals`)

### 6.1 Page Layout

```
Visible to: MANAGER, HOD, HR_ADMIN, EXECUTIVE
Filtered: Only steps where actor is the assigned approver

┌────────────────────────────────────────────────────────────────────────────────┐
│  [←]  [🔔] Pending Approvals         [Search employee...]      🔔  EN/AR  [A] │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Quick stats:   [14 Total]  [3 Overdue 🔴]  [2 Due Today 🟡]  [9 This Week]  │
│                                                                                 │
│  [All] [Leave] [Attendance] [Salary] [Travel] [Other]                          │
│                                                                                 │
│  Sort: [Oldest first ▼]  ☐ Overdue only   [All hierarchies ▼]                  │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ [DK] Dorababu Kethari  ·  AVN001000001                                  │   │
│  │      Architecture & Design  ·  Senior Architect                         │   │
│  │                                                                          │   │
│  │ [LEAVE · ANNUAL]  8 days  ·  04 Jun → 12 Jun 2026                      │   │
│  │ "Family event — visiting parents in India"                               │   │
│  │                                                                          │   │
│  │ Leave balance: 14 days remaining / 22 days total                        │   │
│  │                                                                          │   │
│  │ Step 1 of 2  ·  You are: Line Manager              [LINE MANAGER] pill  │   │
│  │ Submitted 2 days ago  ·  SLA: 22h remaining 🟡                          │   │
│  │                                                                          │   │
│  │    [ℹ Request info]  [→ Delegate]       [✕ Reject]  [✓ Approve]        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ [SM] Sarah Mohammed  ·  AVN001000042                    OVERDUE 🔴      │   │
│  │      Finance  ·  Financial Analyst                                       │   │
│  │                                                                          │   │
│  │ [ATTENDANCE · CORRECTION]  Missing punch-in  ·  28 May 2026             │   │
│  │                                                                          │   │
│  │ Step 1 of 1  ·  You are: Line Manager              [LINE MANAGER] pill  │   │
│  │ Submitted 3 days ago  ·  SLA: OVERDUE by 30h 🔴                         │   │
│  │                                                                          │   │
│  │    [→ Delegate]                          [✕ Reject]  [✓ Approve]        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘

SLA color coding:
  🟢 Green:  > 24 working hours remaining
  🟡 Amber:  6–24 working hours remaining
  🔴 Red:    < 6 working hours remaining
  OVERDUE:   Past SLA deadline (show exact overdue duration)

Hierarchy type pill:
  LINE MANAGER: teal pill
  POSITION:     blue pill
  CUSTOM GROUP: purple pill
  ROLE:         grey pill
```

### 6.2 Approval Detail Drawer

Clicking a card opens a right-side drawer (480px wide).

```
Component: ApprovalDetailDrawer

  ── EMPLOYEE CONTEXT ─────────────────────────────────────
  [DK large avatar]
  Dorababu Kethari  ·  AVN001000001
  Senior Architect  ·  Architecture & Design
  Grade G5  ·  Full-time  ·  UAE resident
  
  Leave balance (Annual): 14 remaining / 22 total
  Service: 2 years 3 months  ·  Probation: Confirmed
  
  ── REQUEST DETAILS ──────────────────────────────────────
  Leave type:  Annual Leave
  Duration:    8 days (calendar days)
  Dates:       04 June → 12 June 2026
  Reason:      "Family event — visiting parents in India"
  Submitted:   29 May 2026 at 10:42 GST
  
  ── WORKFLOW PROGRESS ────────────────────────────────────
  
  ✓  Step 1 — Line Manager (Omar Haddad)
     APPROVED  ·  29 May 2026 at 14:30  ·  "Approved, enjoy"
     Via: Line Manager Hierarchy · N+1
  
  ▶  Step 2 — Head of Department (YOU: Khalid Al Rashidi)
     ACTIVE  ·  SLA: 22 working hours remaining
     Via: Line Manager Hierarchy · HOD level
     Condition met: leave.days (8) > 7
  
  ○  Step 3 — HR Admin
     PENDING (activates after Step 2)
     Condition: leave.days > 14 [NOT MET at current duration]
  
  ⊘  Step 4 — SKIPPED
     HR Admin special types step
     leave.type (ANNUAL) not in [MATERNITY, HAJJ, ...]
  
  ⚙  Step 5 — System Auto-Action
     Deducts balance, creates calendar block
  
  ── ACTION ───────────────────────────────────────────────
  
  Comment (required for rejection):
  [                                                        ]
  [                                                        ]
  
  [← Send back to Step 1]   [→ Request info]
  
         [✕ Reject]                [✓ Approve]
  
  [→ Delegate to colleague]
    Delegate to: [person picker]
    Reason: [text]
    [Confirm Delegation]
```

---

## 7. Employee Request Status View (`/me/requests/[requestId]`)

```
Component: MyRequestStatus

"Your leave request — Annual Leave (8 days)"
Submitted: 29 May 2026  ·  Status: [IN PROGRESS 🔵]

  ✓  Step 1 — Line Manager (Omar Haddad)
     Approved  ·  29 May 2026 at 14:30
     "Approved, enjoy your trip"
  
  ⏳ Step 2 — Head of Department (Khalid Al Rashidi)
     Pending  ·  SLA expires: 02 Jun 2026 at 14:00 GST
  
  ○  Step 3 — HR Admin
     Waiting (activates after Step 2)
  
  ⊘  Step 4 — SKIPPED
     (This step applies to Maternity / Paternity / Hajj leave types)
  
  ⚙  Step 5 — System: Process leave
     (Activates automatically after all approvals)

"Estimated approval: by 02 Jun 2026 (assuming no delays)"

[Withdraw request] (only available while in Step 1)
```

**Design note:** Full transparency — employee sees all approver names and step conditions. This differs from Oracle HCM which hides future approvers. Our approach builds trust in UAE workforce culture where employees expect to understand the process.

---

## 8. SLA Calendar Configuration (`/configuration/workflows/sla-calendars`)

```
Component: SlaCalendarEditor

"SLA Working Hours Calendars"
Subtext: "Defines how approval deadlines are calculated. Deadlines only count working hours."

[+ New Calendar]

Existing calendars list:
  ● UAE Standard (Sun–Thu 09:00–18:00)  [DEFAULT]  [Edit]
  ○ Ramadan Schedule (override)                    [Edit]

Editor:
  Name: [UAE Standard                              ]
  
  Working days: ☑ Sun ☑ Mon ☑ Tue ☑ Wed ☑ Thu ☐ Fri ☐ Sat
  
  Work start: [09]:00   Work end: [18]:00
  
  Timezone: [Asia/Dubai (UTC+4) ▼]
  
  Ramadan settings:
  ☑ Apply reduced hours during Ramadan
    End time during Ramadan: [14]:00
    ℹ️  "Ramadan dates are detected automatically from UAE official calendar
         (configured in Public Holidays). No manual setup needed."
  
  [Preview SLA calculation]
    "Request submitted: Thursday 28 May at 17:30 GST"
    "SLA: 48 working hours"
    ↓
    "Deadline: Tuesday 02 June at 09:30 GST"
    "Breakdown: 0.5h Thu + 9h Sun + 9h Mon + 9h Tue(partial) = 48h"
  
  ☑ Set as default for all entities (unless overridden)
  
  [Save Calendar]  [Cancel]
```

---

## 9. Component Hierarchy Summary

```
/configuration/workflows
├── WorkflowConfigPage (page)
│   ├── WorkflowList (left panel)
│   │   └── WorkflowListItem (each row)
│   └── WorkflowDetail (right panel)
│       ├── WorkflowHeader (name, code, module, status toggle)
│       ├── HierarchySelector (default hierarchy dropdowns)
│       ├── StepPipeline (visual step chain)
│       │   ├── StepCard (each step)
│       │   └── StepConnector (conditional label)
│       └── StepEditorDrawer (right-side)
│           ├── HierarchySelector (per-step)
│           ├── ConditionBuilder (activation condition)
│           ├── SlaConfiguration
│           ├── ActionsConfiguration
│           └── NotificationsConfiguration

/configuration/workflows/groups
├── ApprovalGroupsPage (page)
│   ├── GroupsTable
│   └── GroupEditor (page or drawer)
│       ├── StaticMembersPanel
│       ├── DynamicConditionPanel
│       │   └── ConditionBuilder (reused)
│       └── GroupPreview

/configuration/workflows/delegations
├── DelegationManager (page)
│   ├── DelegationTable (with status filters)
│   └── CreateDelegationForm (modal or drawer)
│       └── DelegationValidation (real-time feedback)

/approvals
├── ApprovalsInbox (page)
│   ├── QuickStats (total/overdue/today/week)
│   ├── ModuleTabs (Leave/Attendance/...)
│   ├── FilterBar (sort/search/hierarchy filter)
│   ├── ApprovalCard (each pending item)
│   └── ApprovalDetailDrawer
│       ├── EmployeeContextPanel
│       ├── RequestDetailsPanel
│       ├── WorkflowProgressTimeline
│       └── ActionPanel (approve/reject/delegate/send back)

/me/requests/[requestId]
└── MyRequestStatus
    ├── RequestSummary
    ├── WorkflowProgressTimeline (read-only, employee view)
    └── WithdrawAction (if eligible)

Shared components:
├── ConditionBuilder (step activation + group membership)
├── HierarchyPreviewTool (workflow builder + standalone)
├── PersonPicker (delegation + named person + group members)
├── WorkflowProgressTimeline (approvals + employee view)
└── SlaCountdown (hours remaining, color-coded)
```

---

## 10. Design System Compliance

Per `DESIGN-STANDARD.md`:

**`(hr-admin)` pages** — layout provides `px-6 py-6` already:
```tsx
<div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>
```

**Color tokens** (no raw hex):
```tsx
// SLA status colors
// Green:  text-[var(--success)] / bg-[var(--success-muted)]
// Amber:  text-[var(--warning)] / bg-[var(--warning-muted)]
// Red:    text-[var(--destructive)] / bg-[var(--destructive-muted)]

// Status badges use PILL_TONES:
// ACTIVE:     'success'
// PENDING:    'warning'
// REJECTED:   'destructive'
// APPROVED:   'success'
// SKIPPED:    'muted'
// ESCALATED:  'warning'
```

**Icons** (lucide-react only):
```tsx
import {
  Clock,        // SLA / time
  CheckCircle,  // Approved
  XCircle,      // Rejected
  AlertTriangle,// Overdue / warning
  ArrowRight,   // Active step indicator
  SkipForward,  // Skipped step
  Settings,     // Auto step
  Users,        // Custom group
  User,         // Named person / line manager
  Building,     // Position hierarchy
  Shield,       // HR Admin / elevated
  GitBranch,    // Workflow definition
} from 'lucide-react'
```

**Arabic (RTL) support:**
- All user-facing strings have `nameAr` counterparts
- `dir="rtl"` on `<html>` when language = AR
- Pipeline layout mirrors in RTL (step 1 on right, last step on left)
- All date/time displays use UAE locale format: `DD/MM/YYYY HH:mm GST`
