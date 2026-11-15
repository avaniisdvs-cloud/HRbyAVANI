---
name: Medical Insurance — Confirmed Business Rules
description: Confirmed business decisions for the AVANIIS HR medical insurance module (answered 2026-05-15)
type: project
originSessionId: e2235667-8557-40bd-924c-aa1d519191fb
---
Confirmed business rules for medical insurance build. All decisions made 2026-05-15.

**Why:** UAE Labour Law and Avaniis policy decisions confirmed by product owner before implementation begins.
**How to apply:** Enforce these rules in every server action, validation schema, and UI built for the insurance module.

---

## BR-INS: Enrolment

- **No approval required for enrolment** — UAE law mandates employer-provided medical insurance; enrolment is automatic, not approval-gated. Do NOT add a workflow step for new employee enrolment.
- **Auto-enrol on hire** — `autoEnrolOnHire = true` must be respected; call `enrolEmployee()` inside the hire/worker-assignment action.

## BR-INS: Dependents

- **Dependent Visa is mandatory** — A dependent cannot be enrolled until a Dependent Visa document is attached to their `person_dependents` record (`dependentVisaDocumentId` FK or similar). Block enrolment if document is missing.
- **No approval required for dependent enrolment** — Same as employee enrolment; immediate upon eligibility confirmation.

## BR-INS: Plan Assignment

- **Multiple plans per legal entity** — A single entity can have many active `medical_insurance_plans` simultaneously (e.g. Basic for grades 1–4, Premium for grades 5+). Eligibility resolved by `gradeIds` array on the plan.
- **Plan change on promotion = automatic, no approval** — When a grade change makes an employee eligible for a higher plan, the plan must be changed automatically (or flagged immediately for HR action). No workflow gate.

## BR-INS: Premium Split

- **Employee-level override** — Employer vs. employee premium split is configured in `medical_insurance_policy_settings` as default but can be overridden at the individual employee level. Schema must support per-enrolment `employerPremiumAed` / `employeePremiumAed` override (already exists on `medical_insurance_enrolments` table — use it).

## BR-INS: Contractors

- **Excluded by default** — Contractors are excluded from company medical insurance.
- **Exception override** — A per-contractor boolean override must be supported (e.g. `workerAssignments.insuranceExceptionGranted` or similar flag, or a per-enrolment flag). When override is granted, contractor can be enrolled.

## BR-INS: Termination / Cancellation

- **Insurance ends at end of notice period** — Not immediate on termination date. When termination is processed, set `expiryDate = terminationDate + noticePeriodDays`.
- **Exception extension** — HR Admin must be able to extend the expiry date beyond the notice period end (e.g. compassionate cases, visa processing delays). This is an override field, not a workflow.

## BR-INS: Self-Service

- **Employee can view (read-only)** — Employees can see their own insurance card details, plan name, network, card number, effective/expiry dates, and dependent enrolment status. They cannot edit or submit changes through self-service (HR Admin manages enrolments).

## BR-INS: Insurer API

- **Phase 3 only** — No insurer API integration in Phase 1 or Phase 2. Manual data entry is the process until Phase 3.

## BR-INS: Historical Import

- **Bulk import required at go-live** — Existing insurance records must be migrated from the legacy system. A bulk import tool (CSV/Excel ingestion with validation) is required as part of the go-live sprint.
