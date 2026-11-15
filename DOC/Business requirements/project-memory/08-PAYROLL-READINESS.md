# 08 — Payroll Module Readiness Assessment

> Generated: 2026-06-04. BLUEPRINT ONLY — no implementation changes.
> Source: modules/payroll/, app/(hr-admin)/payroll/, drizzle/schema/transactions.ts.

---

## Current Payroll State

### Module Files
Located at `modules/payroll/`:
- `actions.ts` — server actions (createPayrollRun, etc.) with RISK-PAYROLL-2 advisory lock fix
- `calculation-engine.ts` — payroll calculation orchestration
- `index.ts` — public barrel (cross-module import point per Hard Rule 6)
- `payroll-assignment-actions.ts` — payroll grade/assignment history
- `queries.ts` — read queries
- `schema.ts` — Drizzle schema aliases/helpers
- `services.ts` — EOSB, GPSSA, DEWS calculation logic
- `types.ts` — TypeScript types, `PayrollRunStatus` enum, status labels
- `validations.ts` — Zod schemas

### Payroll Run Status Lifecycle
```
DRAFT → CALCULATED → LOCKED → APPROVAL_PENDING → APPROVED → SIF_GENERATED → CONFIRMED → ARCHIVED
```

### UI Pages (app/(hr-admin)/payroll/)
| Route | Purpose | Status |
|---|---|---|
| `/payroll` | Dashboard — KPI cards, recent runs, entity summary | Built (Promise.all parallelised — GEO-OPT-001) |
| `/payroll/runs` | Payroll run list + create | Built |
| `/payroll/salary-elements` | Salary element master data | Built |
| `/payroll/wps` | WPS file management | Built (SIF_GENERATED status exists) |
| `/payroll/definitions` | Payroll definition config | Built |
| `/payroll/reports` | Payroll reporting | Built |

### Hardening Already Applied
- **RISK-PAYROLL-2 (FIXED)**: `nextRunNumber` moved inside `db.transaction` with `pg_advisory_xact_lock(hashtext('payroll_run:' || entityId))` — prevents two concurrent `createPayrollRun` calls generating the same run number
- **GEO-OPT-001**: `/payroll/page.tsx` uses `Promise.all` for parallel DB queries (saves ~205ms per page load vs sequential awaits)
- **Workflow integration**: `APPROVAL_PENDING` → approval via workflow engine → `APPROVED`

---

## UAE Payroll Requirements

### Mandatory Compliance Items
| Requirement | Description | Implementation Status |
|---|---|---|
| **WPS** | Wages Protection System — Central Bank of UAE mandates SIF (Salary Information File) format submission for every payroll run | `SIF_GENERATED` status exists; SIF file format needs verification |
| **GPSSA** | General Pension & Social Security Authority — applies to UAE nationals only; employer + employee contributions | `calculateGpssaContribution()` in services.ts |
| **DEWS** | Dirhams End of Service Workscheme — alternative EOSB scheme for certain free zone employees | `dewsContributions` table in schema |
| **EOSB** | End of Service Benefit (gratuity) — UAE Labour Law: 21 days/year for first 5 years, 30 days/year thereafter | `calculateEosb()` in services.ts |
| **Bilingual Payslips** | All payslips must render in both English and Arabic | Payslip generation status needs verification |
| **IBAN Validation** | UAE bank accounts require validated IBAN for WPS compliance | PII-encrypted in persons table |

### WPS SIF File Format
The UAE Central Bank mandates a specific CSV/fixed-width format (SIF — Salary Information File):
- Must include: employer_bank_code, routing_code, employee_name, bank_account_number, salary_amount, currency, payment_date
- Submitted monthly to bank; bank files with MOHRE (Ministry of Human Resources)
- Penalties for late or incorrect submission

### GPSSA Contribution Rates (as of 2026 — rates are configurable, not hardcoded)
- UAE Nationals: Employee 5%, Employer 12.5% (Abu Dhabi); varies by emirate
- Non-nationals: exempt from GPSSA
- Implementation must support configurable rates — do not hardcode percentages

### EOSB Calculation Formula (UAE Labour Law Article 51–56)
```
Years 1–5:   21 days basic salary per year
Year 6+:     30 days basic salary per year
Maximum:     2 years total basic salary
Deductions:  Absent days, advances (per employment contract)
Triggers:    Resignation (≥5 years), termination, end of contract
```

---

## Reusable Entities Already Built

The payroll module can leverage all of these without rebuilding:

| Entity | Table(s) | Payroll Use |
|---|---|---|
| Legal Entities | `legal_entities` | Payroll run per entity; WPS per entity bank |
| Persons + Worker Assignments | `persons`, `worker_assignments` | Employee list for run; grade/position for salary band |
| Leave/Absence | `absence_requests`, `absence_balances` | Leave deduction calculation inputs |
| Work Schedules | `work_schedules`, `work_schedule_assignments` | Hours worked calculation, Ramadan schedule |
| Salary Elements | `salary_elements` (in transactions schema) | Earnings + deductions structure |
| Payroll Assignments | `payroll_assignments` | Grade-to-payroll-band mapping history |
| Workflow Engine | `workflow_instances`, `workflow_steps` | Payroll approval flow (APPROVAL_PENDING → APPROVED) |
| Audit Trail | `audit_log` | Payroll audit entries (every write must use audit.log()) |
| Notifications | `notification_log` (outbox) | Payslip ready notification to employee |
| GPSSA Contributions | `gpssaContributions` | Stored per run |
| DEWS Contributions | `dewsContributions` | Stored per run |
| EOSB Calculations | `eosbCalculations` | Stored per calculation |

---

## Missing Prerequisites (Audit Checklist)

Before payroll can go live, verify each item:

### Calculation Completeness
- [ ] `calculateEosb()` — verify all termination scenarios: resignation <5yr, resignation ≥5yr, termination without cause, contract expiry; unpaid leave deduction
- [ ] `calculateGpssaContribution()` — verify Abu Dhabi vs Dubai vs other emirate rate logic; verify UAE national detection (nationality field)
- [ ] Overtime calculation — UAE Labour Law: 25% premium (day), 50% premium (night/Friday); verify against `work_schedules`
- [ ] Ramadan schedule deductions — reduced hours, late deduction rules
- [ ] Allowances processing — housing, transport, school fees: verify they are salary-element-driven, not hardcoded

### File Generation
- [ ] WPS SIF file format — verify output matches UAE Central Bank v2.0 specification; include all mandatory fields; test with sample bank routing code
- [ ] Bank file generation — IBAN validation (must be 23-character UAE IBAN: AE + 2 check + 3 bank + 16 account)
- [ ] Payslip PDF generation — verify `jspdf` renders bilingual (EN/AR), all salary elements, YTD totals, company branding
- [ ] GPSSA monthly report format — confirm format required by authority

### Integration Points
- [ ] WPS submission workflow — does it integrate with bank portal API or is it file-upload only?
- [ ] DEWS provider API — which DEWS provider? API credentials needed?
- [ ] Email notification — payslip attached to email or link to portal?

### Data Prerequisites
- [ ] All employees have valid UAE IBAN (for WPS)
- [ ] All UAE nationals flagged correctly (for GPSSA)
- [ ] All employees assigned to correct payroll definition
- [ ] Salary elements configured per legal entity

---

## Risks

### Risk 1 — WPS SIF Format (HIGH)
**Risk**: UAE Central Bank updates SIF specification periodically. If implementation uses an old format version, WPS filing will be rejected.
**Mitigation**: Verify current SIF version (v2.0 as of 2026) at uaewps.ae before go-live. Make format version configurable.

### Risk 2 — GPSSA Contribution Rates (MEDIUM)
**Risk**: GPSSA rates change by emirate and occasionally by decree. Hardcoded rates cause incorrect deductions after rate change.
**Mitigation**: Store rates in a `gpssa_contribution_rates` configuration table. Never hardcode percentages in services.ts. The calculation engine should read from DB, not constants.

### Risk 3 — EOSB Calculation Complexity (HIGH)
**Risk**: EOSB edge cases are numerous: partial years, unpaid leave periods, salary changes mid-year, advances against EOSB.
**Mitigation**: Write comprehensive unit tests for `calculateEosb()` covering all edge cases before go-live. Test against manually calculated examples from a UAE labour lawyer.

### Risk 4 — Multi-Entity Isolation (MEDIUM)
**Risk**: WPS filing and bank accounts are per legal entity. Cross-entity data leakage in reports or file generation would be a compliance violation.
**Mitigation**: Every payroll query must include `tenantId` AND `legalEntityId` filters. Verify no cross-entity aggregations in WPS file generation.

### Risk 5 — Payslip Confidentiality (LOW)
**Risk**: Payslip PDF is generated server-side; if the URL is guessable, employees could access other employees' payslips.
**Mitigation**: Use signed URLs (short-lived, per-user) for payslip access. Same pattern as document management. Audit `PAYSLIP.ACCESSED` events.

---

## Phased Roadmap

### Phase 1 — Foundation (COMPLETE)
- Salary elements master data
- Payroll run lifecycle (DRAFT → ARCHIVED)
- Basic payroll assignment history
- EOSB calculation engine (needs verification)
- GPSSA calculation engine (needs verification)
- Payroll dashboard

### Phase 2 — Calculation Engine (VERIFY / COMPLETE)
- EOSB edge case handling and comprehensive test coverage
- GPSSA rate configuration table (replace hardcoded rates)
- Overtime calculation engine
- Ramadan schedule integration
- Allowances processing via salary elements
- Payslip PDF generation (bilingual)

### Phase 3 — Filing
- WPS SIF file generation (UAE Central Bank format v2.0)
- GPSSA monthly report generation
- DEWS contribution file generation
- Bank file generation with IBAN validation
- WPS submission status tracking

### Phase 4 — Integration
- Bank portal API integration (if available) vs manual file upload workflow
- DEWS provider API integration
- Employee payslip email delivery
- Payroll calendar and period management automation
- Direct debit processing confirmation

---

## Key Code Locations

```
modules/payroll/
├── actions.ts                  ← createPayrollRun (has advisory lock)
├── calculation-engine.ts       ← orchestration
├── services.ts                 ← calculateEosb, calculateGpssaContribution, determineSuspensionPayTreatment
├── payroll-assignment-actions.ts ← assignToPayroll, correctPayrollAssignment, getPayrollAssignmentHistory
├── queries.ts                  ← read queries
├── types.ts                    ← PayrollRunStatus, PAYROLL_RUN_STATUS_LABELS
└── validations.ts              ← Zod schemas

app/(hr-admin)/payroll/
├── page.tsx                    ← dashboard (Promise.all parallelised)
├── runs/                       ← run management
├── salary-elements/            ← MDM for salary components
├── wps/                        ← WPS file management
├── definitions/                ← payroll config
└── reports/                    ← analytics

drizzle/schema/transactions.ts  ← payrollRuns, eosbCalculations, gpssaContributions, dewsContributions
```
