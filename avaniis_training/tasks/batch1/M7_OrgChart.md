# CHILD AGENT TASK — M7: Org Chart & ARIA AI Assistant
## Batch: 1 | No dependencies | Output: outputs/M7_OrgChart_ARIA.html
## Target roles: ALL users (read) · HR_ADMIN (actions) · SUPER_ADMIN (config)

### S1 Preconditions (7)
1 All employees ACTIVE with positions assigned
2 Department hierarchy set in master data
3 ARIA API key configured (ANTHROPIC_API_KEY)
4 Org chart permissions set per role
5 Acting assignments workflow configured
6 Hiring request workflow configured
7 Export PDF/PNG — A3 landscape print CSS
Blocking: no ACTIVE assignment = no org chart node · no API key = ARIA disabled

### S2 Dependency Chains
A: [worker_assignments] → [Org chart renders] → [Node colours applied] → [Acting strips shown] → [Vacancy indicators]
B: [User query] → [ARIA intent detected] → [Confidence ≥0.7] → [DB query] → [PII masked] → [Response + action offered]
C: [Org chart ··· action] → [Drawer opens] → [Request submitted] → [Workflow created] → [Org chart updates on approval]

### S3 Six Feature Cards
Full Org / My Team / By Dept views · Node types (5 colours) · ··· Action menu · Analytics panel · Filter panel · Export (PNG/PDF)
Common mistakes: export blank — too many nodes / acting strip not showing — still PENDING not ACTIVE

### S4 Two Swimlanes
Flow A: Assign Acting Manager from org chart ··· menu
Flow B: Request Transfer from org chart ··· menu

### S5 ARIA Intent State Machine
RECEIVED → INTENT_DETECTED → CONFIDENCE_CHECKED → [≥0.7: DB_QUERY → RESPONSE → LOGGED]
CONFIDENCE_CHECKED → [<0.7: ESCALATION_OFFERED]
INTENT_DETECTED → [INJECTION: BLOCKED → ALERT]
4 intent types: ORG_QUERY · HR_ACTION · DIAGNOSTIC · COMPLIANCE

### S6 Mockups
A: Full org chart — filter panel open, amber acting strip, red vacant node, ··· menu open
B: ARIA chat panel — example query + structured response + action button
C: Org Chart Analytics panel — headcount KPIs, span of control, vacancy %, Emiratisation %

### S7 Navigation Guide
Zoom/pan controls · search by name/ID · breadcrumb trail · view shortcuts
Node colour legend: green(active) · amber(acting/frozen) · red(vacant) · blue(contractor)
How to reach from each role · mobile nav behaviour

### S8 Scenarios
A: Large org — find specific person without scrolling
B: Acting end date wrong — update acting assignment
C: ARIA wrong answer — confidence fallback and escalation
D: Org chart not reflecting approved transfer — effective date in future (expected)

### S9 Troubleshooting
1: Employee missing — PENDING_HIRE / confidential / active filter
2: Acting amber strip not showing — PENDING_APPROVAL not ACTIVE yet
3: ARIA not responding — API key / rate limit / network
4: PDF export blank pages — too many nodes / print CSS issue

### S10 ARIA Queries
Q1: Show Finance department org chart → PAN_TO_NODE intent
Q2: Who reports to the CEO → direct reports query
Q3: Find Ahmed Al-Rashidi in org chart → person search + pan
Q4: How many vacancies in IT → vacancy_start_date IS NOT NULL count
Q5: Acting assignments expiring this month → is_acting=true + acting_end_date range
Q6: Current Emiratisation percentage → nationality_category count / total
Q7: Who has the most direct reports → line_manager_id count GROUP BY
Q8: Navigate to Operations department → FILTER_DEPT intent

## QA Command
python3 qa_check.py outputs/M7_OrgChart_ARIA.html
