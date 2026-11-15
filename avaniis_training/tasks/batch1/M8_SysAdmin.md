# CHILD AGENT TASK — M8: System Administration & Master Data
## Batch: 1 | No dependencies | Output: outputs/M8_System_Administration_MasterData.html
## Target roles: SUPER_ADMIN · HR_ADMIN

### S1 Preconditions (7)
1 Super Admin user exists and logged in
2 Microsoft Entra ID SSO configured
3 Default tenant_id set (00000000-0000-0000-0000-000000000001)
4 At minimum: 1 legal entity configured
5 Database migrations current (0026 applied)
6 Cron jobs running (/api/cron/*)
7 SMTP configured for notifications
Blocking: no legal entity = cannot create any employee · no grade salary band = promotions blocked · SSO misconfigured = no login

### S2 Dependency Chains
A: [Legal Entity] → [Department] → [Grade+SalaryBand] → [Job] → [Position] → [Worker Assignment] → [All modules work]
B: [Grade salary band update] → [Existing positions recheck] → [Grade Band Validator updates] → [Finance sign-off required if above max]
C: [Workflow template config] → [Approval steps resolve] → [SLA timers apply] → [Delegation rules apply] → [All request types work]

### S3 Six Entity Types
Legal Entities · Departments · Grades & Salary Bands · Jobs · Positions · Custom Fields
Each: route + who can edit + what breaks if missing + bilingual (name_en + name_ar required)

### S4 Two Swimlanes
Flow A: New legal entity setup — full hierarchy from scratch
Flow B: New grade addition — salary band + impact on existing positions + Finance notification

### S5 Position Lifecycle State Machine
DRAFT → ACTIVE → OCCUPIED → VACANT (on departure) → FROZEN → ARCHIVED
FROZEN: is_frozen=true blocks all assignments
VACANT: vacancy_start_date set automatically

### S6 Mockups
A: /master-data navigation — all entity types listed, counts, last updated
B: Grade editor — salary band with min/mid/max visual slider
C: Position record — is_frozen toggle + is_confidential toggle + vacancy_start_date field

### S7 User Management Guide
/users — SUPER_ADMIN only · role assignment · SSO integration
Role permissions matrix table: all 7 roles × all 10 modules
Password/SSO: Microsoft Entra ID is the ONLY login method — no local passwords
Custom fields: /settings/custom-fields — add to persons or assignments

### S8 Scenarios
A: New subsidiary acquired — full entity hierarchy setup
B: Salary band increase — updating min/max and impact on existing employees
C: Reorganisation — moving department to new parent without breaking assignments
D: Position frozen — freeze process, impact, and unfreeze with HR Director approval

### S9 Troubleshooting
1: Transfer failing — position is_frozen=true or grade rank mismatch
2: Promotion salary blocked — grade_salary_ranges not defined
3: Employee in wrong entity — legal_entity_id mismatch in assignment
4: New user cannot log in — Entra ID SSO / role not assigned

### S10 ARIA Queries
Q1: How many positions currently vacant → vacancy_start_date IS NOT NULL
Q2: Show all frozen positions → is_frozen=true list
Q3: Salary band for Grade 7 → grade_salary_ranges WHERE grade_id=G7
Q4: Why can't I promote Ahmed if salary is in range → other blockers check
Q5: All positions in Avaniis Construction entity → by legal_entity_id
Q6: How to set up a new legal entity → step-by-step configuration
Q7: What custom fields are configured → /settings/custom-fields list
Q8: Which departments have no positions → department vacancy analysis

## QA Command
python3 qa_check.py outputs/M8_System_Administration_MasterData.html
