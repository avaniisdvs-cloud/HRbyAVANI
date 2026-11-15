# Migration Factory — C1–C7 Closure Plan

> **Status:** Planning only. **Implementation = NO-GO** until C1–C7 are explicitly closed by the project owner.
> **Date:** 2026-06-01
> **Scope:** Closure plan for the seven blocking Build Readiness Review conditions (C1–C7). No code, migrations, routes, tables, navigation, or permission changes. C8–C10 (design conditions) are tracked in `02-build-readiness-review.md`.

---

## Framing

Not all seven conditions are closeable *before* the build:

- **Closeable pre-build (harden existing surfaces / decisions):** C4, C7, and the guard-test half of C3.
- **Closed *during* the build, verified at a build gate (intrinsic to Factory code):** C1, C2, C5, C6, and the nav-append half of C3.

The plan below reflects that split. Effort key: **S** ≈ ≤0.5 day · **M** ≈ 1–2 days · **L** ≈ 3–5 days.

---

## C1 — Middleware role-gate + mandatory `requireRole`

| Field | Detail |
|---|---|
| **1. Objective** | Make `/migration-factory` + `/api/migration/*` reachable only by SUPER_ADMIN at the request boundary, not just at page level. |
| **2. Risk mitigated** | R5 — privilege escalation if any handler omits `requireRole` (layout admits EMPLOYEE/MANAGER; no backstop today). |
| **3. Files expected** | `middleware.ts` (add order-sensitive `ROLE_GATED_PATHS` entries); every new `app/(hr-admin)/migration-factory/*` page + `app/api/migration/*` handler (each calls `requireRole(['SUPER_ADMIN'])`). |
| **4. Effort** | **S** (~0.5 day for middleware + convention; per-handler guard ongoing during build). |
| **5. Validation** | Test matrix: unauthenticated → redirect/401; EMPLOYEE/MANAGER/HR_ADMIN → 403/redirect; SUPER_ADMIN → 200. Verify existing gated paths still resolve (order regression). |
| **6. Rollback** | Remove the two `ROLE_GATED_PATHS` entries; `git revert`. Single file — instant. |
| **7. Success criteria** | No migration route reachable by non-SUPER_ADMIN; existing route gating unchanged. |
| **8. Regression tests** | 7-role matrix for existing gated prefixes (`/admin/dataops`, `/api/dataops`, `/configuration`, `/master-data`, …) — prove order change didn't mis-gate. |
| **9. Dependencies** | Route namespace decision (`(hr-admin)/migration-factory` vs `(super-admin)`). |
| **10. Go/No-Go** | GO when 7-role matrix passes for new + existing prefixes with zero regression. |

## C2 — Encrypt PII before staging INSERT + redact from audit

| Field | Detail |
|---|---|
| **1. Objective** | `emirates_id`/`passport`/`iban`/PII encrypted via `lib/encryption.ts` before persisting to `migration_staging_rows`; payloads redacted from `audit_log.new_values`. |
| **2. Risk mitigated** | R8 / S-A / S-B — Hard Rule 3 (unconditional PII encryption) + PDPL; audit-spillage class (FIX-2G-002). |
| **3. Files expected** | New ingestion Server Actions (`modules/migration/*`); per-domain PII field map; audit redaction helper/usage. (Reuse `lib/encryption.ts` — no change to it.) |
| **4. Effort** | **M** (~1.5–2 days; per-domain PII classification is the real work). |
| **5. Validation** | Ingest a known-PII row → assert ciphertext at rest (not plaintext); assert audit values contain no raw PII; decrypt round-trip. |
| **6. Rollback** | `DELETE FROM migration_* WHERE batch_id=…` / `DROP` staging tables. No production effect. |
| **7. Success criteria** | Zero plaintext PII in staging tables or audit log across all three domains. |
| **8. Regression tests** | Confirm existing `persons` PII encryption path + `lib/encryption.ts` callers unchanged. |
| **9. Dependencies** | C8 (schema locked); domain PII inventory; C5 (audit pattern). |
| **10. Go/No-Go** | GO when a PII-bearing test batch shows ciphertext-only at rest + clean audit values. |

## C3 — Fix `NAVDEPTH-002` + add SUPER_ADMIN-visibility test

| Field | Detail |
|---|---|
| **1. Objective** | Deliberately update `NAVDEPTH-002` to 12 workspaces; add a test asserting MANAGER/EMPLOYEE cannot see the SUPER_ADMIN workspace; remove the false NAV-001–010 citation. |
| **2. Risk mitigated** | R2/R6 — nav append silently breaking a green test; unauthorized workspace visibility. |
| **3. Files expected** | `tests/unit/nav-depth-governance.test.ts`; new nav-visibility test; `config/workspace-nav.ts` (the append — build-time). **`admin-nav.ts` untouched.** |
| **4. Effort** | **S** (~0.5 day). Guard-test half can land pre-build (against existing DataOps workspace). |
| **5. Validation** | Run nav unit suite; assert filtered nav for MANAGER/EMPLOYEE/HR_ADMIN excludes the new workspace id. |
| **6. Rollback** | Revert nav array append + test edits; `git revert`. |
| **7. Success criteria** | Nav suite green with 12 workspaces; visibility test passes for all 7 roles. |
| **8. Regression tests** | NAVDEPTH-003/004 + employee/manager nav tests still pass; rail renders for all admin roles. |
| **9. Dependencies** | Workspace id/label finalized; route namespace (C1). |
| **10. Go/No-Go** | GO when the visibility test exists and the full nav suite is green. |

## C4 — `feature_permissions` is metadata-only (or wire real enforcement)

| Field | Detail |
|---|---|
| **1. Objective** | Decide & document that `feature_permissions` provides **no runtime enforcement**; do not rely on a "default-deny row" for protection (rely on C1 + `requireRole`). Optional: wire real enforcement (larger). |
| **2. Risk mitigated** | S-C — false sense of a second access layer that doesn't exist. |
| **3. Files expected** | Docs (already corrected); optionally `modules/access` + a request-boundary check if real enforcement chosen. |
| **4. Effort** | **S** (decision + doc, ~0.25 day) — or **M/L** if wiring platform-wide enforcement. |
| **5. Validation** | Metadata-only: assert no migration access logic reads the perms columns. Enforcement: deny/allow boundary test. |
| **6. Rollback** | Documentation revert; if enforcement wired, revert the check. |
| **7. Success criteria** | Access guarantee provably rests on C1 + `requireRole`, not on a perms row. |
| **8. Regression tests** | If enforcement added, full regression of the feature-permission editor + all role flows (high blast radius). |
| **9. Dependencies** | C1. |
| **10. Go/No-Go** | GO when the enforcement model is unambiguous + documented; metadata-only is the recommended close. |

## C5 — Transactional + audited staging writes

| Field | Detail |
|---|---|
| **1. Objective** | Every staging write uses `db.transaction() + writeAuditLog`; permission toggling audited; do **not** copy `saveFeaturePermissions` (omits audit). |
| **2. Risk mitigated** | R7 / S-D — Hard Rule 1 violation; unaudited migration writes. |
| **3. Files expected** | New `modules/migration/*` write actions; optionally fix `modules/access/actions.ts` (`saveFeaturePermissions` audit gap). |
| **4. Effort** | **M** (~1 day; +0.5 day if fixing the sibling). |
| **5. Validation** | Each batch/row/issue write produces an `audit_log` row in the same transaction; forced failure rolls back data + audit. |
| **6. Rollback** | `DROP`/`DELETE` staging; revert action code. |
| **7. Success criteria** | No staging write path without an in-transaction audit entry. |
| **8. Regression tests** | If `saveFeaturePermissions` fixed, regress the feature-permission editor save flow. |
| **9. Dependencies** | C2 (audit redaction), C8 (schema). |
| **10. Go/No-Go** | GO when an audit-coverage test proves every write path is logged. |

## C6 — Enforceable execution architecture

| Field | Detail |
|---|---|
| **1. Objective** | Make R1 enforceable: hard batch-size cap (~500/commit), `export const maxDuration`, async/background via existing `node-cron` + Postgres outbox (return `202 + jobId`), off-peak gate, orphaned-batch cleanup cron, JSONB GIN index, cross-reference query timeout/circuit breaker. |
| **2. Risk mitigated** | R1 / P-A–P-F — pool starvation, 504 mid-transaction, orphaned batches, O(N) scans, live-page latency (dashboard `Promise.all`). |
| **3. Files expected** | New `app/api/migration/ingest` (202); new background processor + cron route; `vercel.json` (new cron); schema indexes (migration 0055, build-time); batch-size/off-peak guard util. |
| **4. Effort** | **L** (~3–5 days; async/outbox + cleanup + perf testing dominate). |
| **5. Validation** | Load test: large batch processes in bounded chunks without blocking a concurrent dashboard load; DB p95 within NFR-01; simulated timeout leaves a recoverable `ABANDONED` batch cleaned by cron. |
| **6. Rollback** | Disable the cron in `vercel.json`; `DROP` staging; revert endpoints. Existing SLA cron unaffected. |
| **7. Success criteria** | No synchronous long transaction; live p95 unaffected during ingest; no orphaned batches survive cleanup. |
| **8. Regression tests** | Existing crons (workflow-SLA, probation, snapshot) + outbox processor still run; dashboard NFR-01 p95 unregressed under concurrent ingest. |
| **9. Dependencies** | C8 (schema + indexes); cron secret/config; C2/C5 plug into the write path. |
| **10. Go/No-Go** | GO when a concurrent load test proves zero live-traffic regression + clean failure recovery. |

## C7 — Executable backup/rollback runbook + runnable regression

| Field | Detail |
|---|---|
| **1. Objective** | Turn the aspirational backup/rollback into executable steps (git tag + Vercel deploy id + Neon branch) using **`DATABASE_URL`**; produce a runnable 4-role regression checklist. |
| **2. Risk mitigated** | R-D / R-E — non-executable recovery; wrong env var; aspirational validation suite. |
| **3. Files expected** | New `scripts/` backup/snapshot helper; `docs/migration-factory/` runbook; documented 4-role regression checklist (reusing existing Playwright role projects + seed). No app code. |
| **4. Effort** | **M** (~1–1.5 days; seed-data gap for skipped HA-* tests is the wildcard). |
| **5. Validation** | Dry-run backup against a Neon branch; execute rollback on a throwaway branch + confirm restoration; run the 4-role checklist end-to-end. |
| **6. Rollback** | N/A (scripts/docs only). |
| **7. Success criteria** | Backup + rollback executable by a second engineer from the runbook alone; checklist runs. |
| **8. Regression tests** | The checklist *is* the regression artifact; verify coverage of Nav/Org/Leave/Docs/Approvals/Payroll/ARIA/imports × 4 roles. |
| **9. Dependencies** | Seed data for currently-skipped HA-* tests; Neon branch access. |
| **10. Go/No-Go** | GO when backup + rollback are demonstrated on a branch and the checklist runs green. |

---

## Implementation Order

**Recommended sequence (when build is approved):**

1. **C7** — backup/rollback must be executable *before any data activity*. Prerequisite to everything.
2. **C4** — cheap decision (metadata-only); removes a false security assumption before anyone designs around it.
3. **C3 (guard-test half)** — add the SUPER_ADMIN-visibility test now (against the existing DataOps workspace) so the guard exists before the nav append.
4. **C1** — establish the request-boundary security gate before any migration surface becomes reachable.
5. **C6** — build the execution skeleton (async/batch/cron) the ingestion runs on.
6. **C2 + C5** — weave PII encryption + audit into the write path *as it is built on top of C6*; finish the **C3 nav-append** + `NAVDEPTH-002` update here.

**Why:** safety net first (C7) → cheap truth-corrections (C4, C3-guard) → security boundary before any reachable surface (C1) → execution foundation (C6) → data-protection woven into the write path last but before any real ingest (C2/C5). Front-loads lowest-cost/highest-leverage guards; never leaves a reachable surface ungated or an unsafe write path live.

---

## Risk Matrix

| Dimension | Item | Why |
|---|---|---|
| **Highest risk (consequence)** | **C2 (PII)** | Wrong = PDPL/legal exposure + Hard Rule 3 breach — costliest failure mode. |
| **Most complex** | **C6** | Async architecture + cron + batching + cleanup + indexes + perf testing across multiple files + `vercel.json`. |
| **Most likely to cause regression** | **C1** | `middleware.ts` is global + order-sensitive — gates *every* route. A mis-ordered matcher can mis-gate existing paths. C3's shared-nav change is a close second. |
| **Most likely to delay** | **C6** | Largest scope; async/perf hardest to estimate; depends on load-test results + cron+outbox integration. |

---

## Recommendation

**Two tracks — not one undifferentiated release, not many small build releases:**

- **Track A — Pre-build guardrails (standalone, low risk):** C7 + C4 + C3 guard-test. Harden existing surfaces / correct assumptions; need no Factory code; land as a small independent PR immediately, tiny blast radius.
- **Track B — Factory Phase-1 build, feature-flagged (single release):** C1, C6, C2, C5, C3 nav-append. Inseparable from ingestion code; verified together at **one build gate** before the feature flag is enabled. Splitting across public releases would create half-gated states (routes reachable before C1, or writes live before C2/C5) — the exact regressions we prevent. A feature flag keeps it dark until all C1–C7 verify green.

Not a generic "hardening sprint" (most build a *new* feature; only C3-guard/C4/C7 are true hardening). Not big-bang (Track A shouldn't wait on the build).

### Self-Challenge

1. *Single Track-B release too big given C6?* It may split internally (C1+C6 skeleton, then C2+C5 write-path) **only behind the feature flag** — never exposing a reachable surface or live write path before its guard closes. Internal sequencing yes; public half-gated releases no.
2. *Is C1 really more regression-prone than C3?* Both touch global shared config. C1 ranks first because middleware affects *all* routes and is order-sensitive (documented foot-gun); the nav change is confined to admin-role rendering and is test-guarded. Close, both need full multi-role regression.
3. *Should C4 wire real enforcement?* Platform-wide `feature_permissions` enforcement has a huge blast radius (would retroactively gate every existing feature) — a larger regression risk than the Factory itself. Recommendation: **metadata-only + rely on C1/`requireRole`**; defer any real enforcement to a separate, deliberately-scoped initiative.

---

**Status: Implementation = NO-GO. This is a plan only.**
