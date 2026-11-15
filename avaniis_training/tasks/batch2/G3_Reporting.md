# CHILD AGENT TASK — G3: Reporting & Analytics
## Batch: 2 | Depends on: M1 M3 | Output: outputs/G3_Reporting_Analytics.html
## Target roles: HR_DIRECTOR · HR_ADMIN · PAYROLL_ADMIN · Executive

### S1 Preconditions (7)
1 Data populated: employees, payroll runs, leave records, timesheets
2 /reports route accessible (HR_ADMIN+)
3 Export permissions configured
4 BI integration credentials set (if applicable)
5 Date filters default to current financial year
6 Emiratisation targets set in system configuration
7 Department hierarchy complete for org analytics
Blocking: no payroll data = no payroll analytics · no leave data = no absence reports

### S2 Dependency Chains
A: [All modules running] → [Data accumulates] → [/reports dashboards] → [Real-time KPIs] → [Export to Excel/PDF]
B: [Payroll runs PAID] → [Payroll analytics update] → [Cost centre breakdown] → [GL reconciliation data]
C: [Workforce events] → [Attrition detected] → [Turnover rate calculated] → [Emiratisation % tracked] → [Executive dashboard updated]

### S3 Six Report Categories
Headcount & Org · Leave & Absence · Payroll & Cost · Attrition & Turnover · Emiratisation · Audit & Compliance
Each: available filters + export formats + who can access + refresh frequency

### S4 Two Swimlanes
Flow A: HR Admin generates headcount report — filters → generate → export
Flow B: Executive dashboard — auto-refresh KPIs → drill-down → PDF export

### S5 Report Export State Machine
REQUESTED → GENERATING → READY → DOWNLOADED → EXPIRED (after 24h)
GENERATING → FAILED (data timeout) → RETRY

### S6 Mockups
A: Executive dashboard — 6 KPI cards (headcount, vacancies, attrition, payroll cost, leave days, Emiratisation %)
B: Headcount report with department filter — table + bar chart + export buttons
C: Payroll cost analysis — entity breakdown + GL cost centre + monthly trend chart

### S7 BI Integration Guide
Export formats: Excel (.xlsx), PDF, CSV
Available integrations: Phase 1 = export only · Phase 2 = BI connector (Power BI / Tableau)
Scheduled reports: daily/weekly/monthly email delivery
Data retention: reports expire after 24h, regenerate on demand

### S8 Scenarios
A: Board wants headcount by entity for this quarter
B: Finance needs payroll cost breakdown by GL code
C: HR Director wants Emiratisation progress against target
D: Auditor requests all leave records for the past year

### S9 Troubleshooting
1: Report shows 0 records — date filter too narrow / no data for period
2: Export fails — large dataset timeout / retry with narrower filter
3: Payroll data missing from cost report — run not yet PAID status
4: Emiratisation % seems wrong — nationality_category not set on some employees

### S10 ARIA Queries
Q1: Total headcount by department → /reports headcount grouped by department_id
Q2: Attrition rate this year → terminated/total employees YTD
Q3: Payroll cost by entity this month → payroll_runs PAID current month
Q4: Emiratisation percentage → UAE national count / total headcount
Q5: Which departments have the most vacancies → vacancy_start_date IS NOT NULL by dept
Q6: Average sick days per employee this year → absence_requests sick type YTD
Q7: Show turnover trend last 12 months → monthly terminations/headcount
Q8: Who has not submitted timesheets this week → missing timesheet records

## QA Command
python3 qa_check.py outputs/G3_Reporting_Analytics.html
