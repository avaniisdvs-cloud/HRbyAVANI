---
name: project_issue_register
description: Current status of the workflow/env audit issue register (TASK-000 onwards)
metadata: 
  node_type: memory
  type: project
  originSessionId: 00b79cab-90af-4f4b-a2d8-d782a774bdda
---

Issue register as of 2026-05-20.

| Issue | Priority | Status | Title |
|-------|----------|--------|-------|
| ISSUE-009 | P0 | ✅ COMPLETE | DB safety rails — guard-db-write.js wired into all write scripts |
| ISSUE-004 | P1 QA Blocker | ⏸ DEFERRED | Dev accounts share SYSTEM_ADMIN personId — deferred, not needed for current UAT |
| ISSUE-002 | P1 Security | ✅ COMPLETE | listLeaveRequests MANAGER has no team-scope filter |
| ISSUE-013 | P1 RBAC | ✅ COMPLETE | /dashboard added to middleware ROLE_GATED_PATHS (EMPLOYEE excluded) + page-level redirect |
| ISSUE-001 | P1 | ✅ COMPLETE | resolveActorDisplayName added; all updatedByName/createdByName use display name, not UUID |
| ISSUE-005 | P1 | ✅ COMPLETE | MANAGER excluded from /aria middleware — added MANAGER to middleware ROLE_GATED_PATHS[/aria] |
| ISSUE-012 | P1 | ✅ COMPLETE | ARIA pending-approver resolution — resolvePendingApprover added to workflow/queries |
| ISSUE-006 | P1 | ✅ COMPLETE | isManager context variable logic inverted in workflow engine |
| ISSUE-003 | P0/P1 | OPEN | Migration drift — 0027-0039 not in journal |

**Why:** ISSUE-004 deferred 2026-05-20 — user confirmed no reseed planned for current UAT cycle.

**How to apply:** Do not prompt about ISSUE-004 until user explicitly asks to fix or reseed demo accounts.
