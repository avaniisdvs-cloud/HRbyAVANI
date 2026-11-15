# 14 — Claude Code Session Start Prompt

> Use this as the opening message when starting a fresh Claude Code session on AVANIIS HR.
> Copy the block below verbatim.

---

```
You are continuing development on AVANIIS HR — a bilingual (EN/AR), UAE-compliant HCM platform built for Avaniis / Avaniis.

Stack: Next.js 15.3.9 App Router, TypeScript strict, PostgreSQL (Neon), Drizzle ORM 0.45.2, Auth.js v5, pnpm only.

---

## Current State (2026-06-04)

Phase 1 MVP is COMPLETE and QA-certified (production at avaniishcm.vercel.app). However:

- Neon production DB has 21 pilot employees from V1 migration with PARTIAL data:
  - 0 manager links (lineManagerId = null for all 21)
  - 0 leave balances (absence_balances empty)
  - Org Chart, Leave Requests, Manager Approvals: NOT ready
- The V2 Migration Factory false-success bug is FIXED (detectZeroWriteFailure added)
- Document storage production blockers: files still in /tmp (ephemeral); Azure Blob not yet configured

The next action is: Run V2 pilot reload via Data Migration Activity (Step 2 → Step 3 → Steps 4–9).

---

## 5 Most Important Rules

1. Every DB write = db.transaction() + audit.log() in the SAME transaction. No exceptions.
2. HR records are NEVER deleted. Use lib/effective-date.ts (close old, open new).
3. translateError() must NEVER be used in Server Components (page.tsx). It has return type never and crashes the page. Return { error: string } or null instead.
4. workspace-nav.ts and admin-nav.ts must ALWAYS be updated together. They serve different roles and must stay in sync.
5. Use var(--token) for all CSS colors. Never raw hex. WCAG AA certified — do not regress it.

---

## Verify State Before Touching Any File

Run these commands first:

```bash
git log --oneline -3    # confirm you are on commit 7f6821b (Migration Phase D)
git status              # must be clean working tree
pnpm typecheck          # must be 0 errors
```

If typecheck fails before you touch anything: stop and investigate. Do not add changes on top of existing errors.

---

## Migration Situation

The Drizzle journal tracks migrations 0000–0039 ONLY.
Migrations 0040–0054 are manual SQL applied via Neon SQL Editor. They are NOT in _journal.json.

This means:
- pnpm drizzle-kit migrate: DO NOT RUN against Neon (will not apply 0040–0054)
- pnpm drizzle-kit generate: DO NOT RUN (will try to regenerate the 0040–0054 gap)
- New migrations: write SQL file manually, apply via Neon Console SQL Editor
- Next available slot: 0055

WIP migrations (files with _wip_ prefix in drizzle/migrations/): do NOT apply without understanding them first.

---

## Safety Checks Before Modifying Any File

1. Read the file first — understand the full scope before changing anything
2. Check docs/project-memory/2026-06-04/12-FILE-OWNERSHIP-MATRIX.md for risk level
3. For CRITICAL files (lib/workflow-engine.ts, lib/auth.ts, middleware.ts): ask for confirmation before proceeding
4. Run pnpm typecheck after every logical change
5. Write a test for any bug you fix (prevent regression)

---

## 3 Most Dangerous Files to Modify

1. lib/workflow-engine.ts — powers ALL approval flows. A bug breaks leave approvals, hiring, transfer, probation for all users. Every change needs tests in tests/integration/workflow-collision.test.ts.

2. lib/auth.ts — requireRole(), MFA step-up gate. A bug here bypasses RBAC for all 119 pages.

3. drizzle/schema/foundation.ts — core HR tables (persons, positions, departments). Schema changes require migration SQL and can corrupt data if applied incorrectly.

---

## Server Action Pattern (Always Follow)

```typescript
'use server'
import { auth }          from '@/lib/auth'
import { requireRole }   from '@/lib/auth'
import { db }            from '@/lib/db'
import { audit }         from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function myAction(input: unknown) {
  const session = await auth()
  requireRole(session, ['HR_ADMIN'])         // 1. Auth gate
  const data = MySchema.parse(input)          // 2. Zod validation
  // BR-xx: business rule citation
  await db.transaction(async tx => {          // 3. Atomic write + audit
    await tx.insert(myTable).values({ ...data, tenantId: TENANT_ID })
    await audit.log(tx, { actor: session.user, event: 'X.CREATED', resourceId: data.id, newValues: data })
  })
  revalidatePath('/path')                     // 4. Revalidate
  // On error: return { error: string } — never throw
}
```

---

## Where to Find Context

All project memory and documentation is in docs/project-memory/2026-06-04/:

- 00-README-HANDOVER.md — orientation, what was done this session
- 01-ARCHITECTURE-OVERVIEW.md — full stack and folder structure
- 02-DATABASE-SCHEMA.md — all 109 tables, key relationships
- 03-CURRENT-STATE.md — exact DB state, test pass matrix, pending tasks
- 04-MIGRATION-FACTORY.md — V2 migration factory, false-success fix, reload sequence
- 05-RBAC-AND-AUTH.md — roles, requireRole(), MFA, session types
- 06-KEY-MODULES.md — module-by-module breakdown
- 07-UI-PATTERNS.md — design tokens, layout patterns, bilingual requirements
- 08-PAYROLL-READINESS.md — payroll module completeness assessment
- 09-AI-SESSION-GUIDE.md — task-specific file loading, known footguns
- 10-NEXT-DEVELOPMENT-PLAN.md — priority order for upcoming work
- 11-DO-NOT-BREAK-RULES.md — invariants that must never be violated
- 12-FILE-OWNERSHIP-MATRIX.md — risk level for every file pattern
- 13-CODEX-START-PROMPT.md — equivalent prompt for Codex sessions

CLAUDE.md in the project root also has the full session history and all decisions made.
```
