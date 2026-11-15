# CHILD AGENT TASK — G4: Operational Scenarios — Edge Cases
## Batch: 3 | Depends on: M1 M2 M3 M5 | Output: outputs/G4_Operational_Scenarios.html
## Target roles: HR_ADMIN · PAYROLL_ADMIN · MANAGER
## NOTE: This module is SCENARIO-DRIVEN not feature-driven. S3 has 12 scenarios not 6 type cards.

### S1 Preconditions
All base modules M1-M5 must be live. This module references real situations that arise only when the system is in production use.

### S2 Dependency Chains
A: [Payroll LOCKED] → [Any approval blocked] → [Finance step frozen] → [Wait for close] → [Actions resume]
B: [Employee submits resignation] → [Notice period starts] → [Leave/transfers/payroll all intersect] → [EOSB calculated] → [Final payslip] → [Termination]
C: [Backdated event discovered] → [BR-WF-010 or retroactive payroll] → [Dual approval] → [Audit correction] → [Downstream impact assessed]

### S3 Twelve Operational Scenarios (use sc-card for each, 2 columns)
1: Employee resigned during open payroll run — EOSB + final pay handling
2: Leave request overlaps notice period — what blocks + override options
3: WPS file rejected by bank after payroll LOCKED — re-generation process
4: Manager delegation expired while request still pending — SLA breach cascade
5: Employee transferred mid-payroll month — pro-rata GL split
6: Backdated hire discovered after payroll close — correction workflow
7: Probation extension during sick leave — two concurrent statuses
8: Acting assignment exceeded 6 months — UAE Law conversion to promotion
9: Cross-entity transfer EOSB carry-forward not documented — compliance risk
10: Payroll run shows wrong cost centre — position transfer not yet effective
11: Duplicate employee record discovered — merge or deactivate process
12: Public holiday added retroactively — impact on approved leave in that period

### S4 Two Swimlanes
Flow A: Employee resignation end-to-end (resignation → notice → EOSB → final pay → termination)
Flow B: Retroactive payroll correction (discover error → correction run → audit note → Finance sign-off)

### S5 Resignation & Termination State Machine
ACTIVE → NOTICE_PERIOD → LAST_WORKING_DAY → TERMINATED
ACTIVE → IMMEDIATE_TERMINATION (disciplinary)
NOTICE_PERIOD → NOTICE_WAIVED (mutual agreement)
Each state: what payroll/leave/access does

### S6 Mockups
A: EOSB calculation screen — showing hire_date, effective_date, scheme, amount breakdown
B: Correction run workflow — payroll run with "CORRECTION" badge, original + delta amounts
C: Resignation processing — notice period tracker with leave balance, pending transfers blocked

### S7 Compliance Risk Reference
UAE Labour Law (FDL 33/2021) scenarios:
- Immediate termination without cause: 30-day notice or payment in lieu
- EOSB must be paid within 14 days of termination
- Unlawful deductions: only approved deductions permitted
- Sick leave during notice: notice period pauses (Art. 44)

### S8 Scenarios (summary cards — link to S3 detailed scenarios)
A: Payroll-resignation intersection
B: Backdated correction process
C: Acting conversion to promotion
D: Cross-entity EOSB compliance failure

### S9 Troubleshooting
1: Payroll correction rejected — Finance refused, reasons and retry
2: EOSB amount disputed — recalculation with audit trail
3: Acting conversion blocked — promotion prerequisites not met
4: Retroactive leave adjustment — balance negative after correction

### S10 ARIA Queries
Q1: Ahmed resigned today — what steps do I need to follow
Q2: What is Ahmed's final EOSB amount
Q3: There's a payroll error from last month — how do I correct it
Q4: Ahmed's acting is now 6 months — what happens
Q5: The WPS file was rejected after payroll closed — next steps
Q6: Sara's leave overlaps her notice period — what are the options
Q7: We hired someone 45 days ago but forgot to enter them
Q8: A public holiday was added retroactively — impact on existing approvals

## QA Command
python3 qa_check.py outputs/G4_Operational_Scenarios.html
