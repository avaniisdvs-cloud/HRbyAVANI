# Migration Factory — Migration Readiness Checklist

> **Status:** Updated 2026-06-01. Implementation remains 🔴 **NO-GO** — rollback test still pending.
> **Date:** 2026-06-01
> **Purpose:** A single gate that must read all-green before *any* Oracle Fusion data migration activity begins. Combines code-protection, database-protection, source-data, and build-condition gates.

Legend: ☐ open · ☑ done · 🔴 blocking · 🟡 manual/user-required.

---

## A. Application-code protection

- ☑ 🟢 Repository committed & pushed; `origin/main` in sync (HEAD `10a000e`).
- ☑ 🟢 Pre-migration git recovery tags created and pushed: `pre-migration-factory` → `b8cbd7c`; `pre-migration-frozen-20260601` → `935de3d`.
- ☑ 🟢 **Offline full ZIP backup** created: `/Users/d.kethari/D_Drive/HRMS_Backups/zips/20260601_1830_pre-migration-backup.zip` (1.1G, 265,609 entries, 0 secrets).
- ☑ 🟢 Stray working-tree changes from other sessions identified, reported, and captured in ZIP.
- ☑ 🟢 Auto-sync (`com.avaniis.gitsync`) paused — baseline frozen.

## B. Database protection (manual — Neon Console)

- ☑ 🟢 **Neon branch created:** `br-square-union-al2bxhr1` — point-in-time snapshot of production, 2026-06-01. *(Confirmed by project owner `d.kethari@avaniis.example`.)*
- ☑ 🟢 Neon branch identifier recorded in `04-baseline-certification.md` (item 3).
- ☑ 🟢 **Rollback tested** — baseline-count SQL run on `br-square-union-al2bxhr1` via Neon SQL Editor (2026-06-02). All 5 counts match exactly: persons=21, user_accounts=14, legal_entities=5, workflow_definitions_v2=12, feature_permissions=13. ✅
- ☐ 🟡 Decide: migrate against a Neon branch (recommended) rather than directly on `main`/prod.

## C. Environment safety

- ☑ 🟢 `DATABASE_URL` confirmed pointing at **Neon migration branch** (`ep-s***`) — production (`ep-empty-boat-***`) is isolated. Verified 2026-06-02 by read-only count check (all 5 baseline counts match).
- ☐ 🟡 `guard-db-write.js` rail — confirm still active for extra safety.
- ☑ 🟢 Secrets never committed; `.env*` excluded from backup ZIP (verified 0 secret entries).

## D. Source data (Oracle Fusion)

- ☐ 🔴 All required extracts received per `06-oracle-fusion-source-acquisition.md` §2 (WM/OS/AB).
- ☐ 🔴 **Source Readiness Assessment** (`06` §5) reads 🟢 across all three domains.
- ☐ Data dictionaries supplied; PII fields flagged.

## E. Build conditions (C1–C7) — only when build is authorized

- ☐ 🔴 C1 middleware role-gate + `requireRole` on every migration handler.
- ☐ 🔴 C2 PII encrypted before staging INSERT + redacted from audit.
- ☐ 🔴 C3 `NAVDEPTH-002` updated + new SUPER_ADMIN-visibility test.
- ☐ 🔴 C4 `feature_permissions` treated as metadata-only (or real enforcement wired).
- ☐ 🔴 C5 every staging write transactional + audited.
- ☐ 🔴 C6 enforceable execution (batch cap, `maxDuration`, async, cleanup cron, GIN index).
- ☐ 🔴 C7 executable backup/rollback runbook + runnable 4-role regression checklist.

## F. Rollback readiness

- ☑ 🟢 `09-rollback-runbook.md` exists and steps are documented.
- ☑ 🟢 Code rollback and database rollback separately documented (`07-production-cutover-and-rollback-strategy.md`).
- ☑ 🟢 Rollback dry-run completed — SQL verified on `br-square-union-al2bxhr1` (2026-06-02). All baseline counts confirmed. ✅

## G. Platform configuration seeds (MANDATORY — runs *after* schema migrations, *before* employee data migration / leave testing)

> **Why this gate exists:** Workflow engine v2 config (approval definitions/steps/rules) is **platform setup, not employee data**. It is **not** produced by the employee migration. If it is skipped, the schema is correct and employees + balances load fine, but **leave submission fails** because no approval workflow exists to route the request (see incident `11-incident-workflow-v2-seed-skipped.md`). This step must be checked green on **every** target database (UAT branch, production) before employee migration or leave testing.

**Required step — run once per target database, immediately after schema migrations:**

```bash
npx tsx drizzle/seed-workflow-v2.ts
```

> Idempotent and additive — it upserts workflow rules/definitions/steps/SLA only. It does **not** touch persons, assignments, or balances. Safe to re-run.

**Required platform row — the workflow system actor (MANDATORY):**

> **Why:** The workflow engine stamps every *automatic* action (advancing to the next approver, SLA auto-approve/escalate, reminders) with a fixed **system identity** — person `22222222-2222-2222-2222-222222222222` ("AVANIIS Workflow Engine"). `workflow_audit_log.actor_person_id` has a **foreign key to `persons.id`**, so this row **must exist** or the engine fails with a FK violation the first time a workflow **advances between steps**. The employee migration does **not** create it. It surfaces only on **multi-step** approvals (a single-step workflow never advances), which makes it easy to miss in shallow testing (see incident `11-incident-workflow-v2-seed-skipped.md`, addendum). The row is flagged `is_system_user = true`, `exclude_from_headcount = true`, `is_active = false` so it never appears in directory, headcount, or payroll.

Run once per target database (Neon SQL Editor — production writes go through the SQL Editor, not ad-hoc scripts, per the `guard-db-write` rail):

```sql
INSERT INTO persons (
  id, person_number, legal_entity_id,
  first_name_en, last_name_en, full_name_en, full_name_ar,
  date_of_birth, gender, nationality_code, nationality_category,
  employment_type, hire_date,
  is_system_user, exclude_from_headcount, is_active, payroll_eligible,
  created_by, created_by_name
) VALUES (
  '22222222-2222-2222-2222-222222222222', 'SYSTEM-WF-ENGINE', '<TARGET_LEGAL_ENTITY_ID>',
  'AVANIIS', 'Workflow Engine', 'AVANIIS Workflow Engine', 'محرك سير العمل أفانيس',
  '1970-01-01', 'NOT_SPECIFIED', 'ARE', 'EXPAT',
  'FULL_TIME', '1970-01-01',
  true, true, false, false,
  '00000000-0000-0000-0000-000000000001', 'System Seed'
)
ON CONFLICT (id) DO NOTHING;
```

> Replace `<TARGET_LEGAL_ENTITY_ID>` with a valid `legal_entities.id` on the target DB. `ON CONFLICT DO NOTHING` makes it safe to re-run. No PII fields are set.

**Verification checks (all must pass before proceeding to employee migration / leave testing):**

- ☐ 🔴 **1. Active rows exist:** `workflow_definitions_v2` has active rows (expect **12** core workflows).
  `SELECT count(*) FROM workflow_definitions_v2 WHERE is_active = true;`  → must be ≥ 12
- ☐ 🔴 **2. `WF_ANNUAL_LEAVE` exists and is active.**
  `SELECT workflow_code, is_active FROM workflow_definitions_v2 WHERE workflow_code = 'WF_ANNUAL_LEAVE';`  → 1 row, `is_active = true`
- ☐ 🔴 **3. `WF_ANNUAL_LEAVE` has approval steps.**
  `SELECT s.step_order, s.step_code FROM workflow_steps_v2 s JOIN workflow_definitions_v2 d ON d.id = s.workflow_definition_id WHERE d.workflow_code = 'WF_ANNUAL_LEAVE' ORDER BY s.step_order;`  → expect `LM_APPROVAL` then `HOD_APPROVAL`
- ☐ 🔴 **4. End-to-end submit:** a test employee (with an active assignment + a line manager + an initialized Annual Leave balance for the year) can submit an Annual Leave request and it reaches status **PENDING** (no "Server Components render" error).
- ☐ 🔴 **5. Correct routing:** the submitted request routes to the **expected approver** (the employee's line manager at Step 1 / `LM_APPROVAL`), visible in that approver's Approvals Inbox.
- ☐ 🔴 **6. Workflow system actor exists.**
  `SELECT id, is_system_user, exclude_from_headcount, is_active FROM persons WHERE id = '22222222-2222-2222-2222-222222222222';`  → 1 row (`is_system_user = true`, `exclude_from_headcount = true`, `is_active = false`)
- ☐ 🔴 **7. Multi-step advance works (the check single-step testing misses):** approve Step 1 of a **multi-step** workflow and confirm it **advances to Step 2** (next approver activated, request still routing) with **no foreign-key error**. This is the path that fails when the system actor row (check 6) is missing.

---

## Gate verdict

| Section | State |
|---|---|
| A. Code protection | ✅ 🟢 Complete |
| B. Database protection (Neon) | ✅ 🟢 Branch `br-square-union-al2bxhr1` created + rollback verified |
| C. Environment safety | ✅ 🟢 `.env.local` → Neon branch (not prod). Verified 2026-06-02 |
| D. Source data | 🔴 Not yet received |
| E. Build conditions C1–C7 | 🔴 Open (not in scope until build authorized) |
| F. Rollback readiness | ✅ 🟢 Verified 2026-06-02 |
| G. Platform config seeds (workflow v2 **+ system-actor person row**) | 🔴 Must be green per target DB before employee migration / leave testing |

> **Migration may begin ONLY when A, B, C, D, and F are all 🟢.**
> **Employee data migration / leave testing may begin ONLY when G is also 🟢 on the target database.**
> **Current status: 🟡 ALMOST READY** — A, B, C, F all green. **Remaining gates: D — Oracle Fusion source data; G — run the workflow v2 seed + verify on the target DB.**
