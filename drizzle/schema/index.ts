// Foundation tables: Parts 1–6 of ERD (persons, org structure, payroll, absence, audit)
export * from './foundation'

// Configuration tables: Task 4 + ERD §7.1–7.4, §7.10, §9.1, §10.1, §10.6
export * from './configuration'

// Transaction/operational tables: ERD §7.5–7.15, §9.2–9.3, §10.2–10.5, §10.7
export * from './transactions'

// Workflow Engine v2: hybrid hierarchy, condition trees, immutable snapshots, UAE SLA
export * from './workflow-engine'

// Attendance / Timesheet: biometric sync, manual entries, exceptions
export * from './timesheets'

// HR Action Requests: hiring_requests, transfer_requests (Task E)
export * from './actions'

// Org Chart Snapshot Cache: org_hierarchy_snapshots (Session 6)
export * from './org-cache'

// Employee Letters: token registry, template types, templates, letter instances
export * from './employee-letters'

// Probation Workflow: probation_reviews table (BR-37, BR-PW-001)
export * from './probation'

// Durable in-DB document storage: document_files (bytea) — migration 0052
export * from './document-files'

// Communication / Email Platform: provider settings, templates, messages, events
export * from './communication'
