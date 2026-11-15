# Migration Factory — Build Readiness Review

> **Status:** Review complete. **Implementation = NO-GO** until blocking conditions **C1–C7** are explicitly closed.
> **Date:** 2026-06-01
> **Method:** 6 independent code-verifying reviewers (architecture, impact, rollback, security, performance, production-readiness) + 1 adversarial red-team pass, followed by direct code verification of every load-bearing claim by the synthesizer.
> **Mandate:** prevent regressions, not accelerate development.
> **Legend:** 🟢 Green (sound / pass) · 🟡 Amber (gap, needs work, non-blocking or conditionally OK) · 🔴 Red (blocking / verified-false claim / must fix).
> **✅-VERIFIED** = confirmed directly against the codebase by the synthesizer (not merely asserted by an agent — the agent pool had previously hallucinated migration counts, so all high-impact claims were re-checked).

---

## 1. Executive Summary

🟢 **The core architecture is sound and salvageable without redesign for Phase 1.** It is additive (new `migration_*` tables, new routes, new APIs), writes no production data this phase, has no inbound FKs from production (clean rollback), and is SUPER_ADMIN-only by intent.

🔴 **However, several "safe / No-Impact / clean" claims in the original design were verified FALSE against the codebase** — including claims authored in the governance/design docs. Left uncorrected, each is a latent regression against the Prime Directive.

**Verdict:** 🟡 **APPROVE WITH CONDITIONS.** Ten conditions (C1–C10); seven are blocking (C1–C7). Multi-tenancy and the promotion phase are explicitly **out of scope** for Phase 1.

| Severity | Count (post-dedup/reconciliation) |
|---|---|
| 🔴 Blocking conditions | 7 (C1–C7) |
| 🟡 Design conditions | 3 (C8–C10) |
| 🟢 Confirmed-sound claims | isolation, additive DB, clean DROP, no production writes |

---

## 2. Architecture Review

| # | Finding | Rating |
|---|---|---|
| A1 | **(hr-admin) layout is not an access gate.** ✅-VERIFIED: `app/(hr-admin)/layout.tsx` (lines 46–50) admits **all** roles incl. `EMPLOYEE`/`MANAGER`, redirecting only if outside that broad list. Migration routes are protected only if every handler calls `requireRole(['SUPER_ADMIN'])`; there is no middleware backstop for them. | 🔴 → **C1** |
| A2 | **Hidden coupling to Neon pool; original analysis mismatched.** ✅-VERIFIED: `lib/db.ts` line 27 sets `max:1` **only when `NODE_ENV==='production'`** (else pool 10). On prod, a long ingest serializes all queries in a warm instance, threatening the dashboard `Promise.all` (NFR-01 fix). | 🔴 → **C6** |
| A3 | **Redundancy/conflict with DataOps.** DataOps already does SUPER_ADMIN raw SQL + CRUD; two surfaces can touch `migration_*` rows with no locking. | 🟡 → **C9** |
| A4 | **Generic jsonb-envelope** keeps schema small but pushes all typing into code; maintenance burden. | 🟡 |
| A5 | Isolation strategy, staging-only scope, additive DB design. | 🟢 |

## 3. Existing Functionality Impact Review

No existing module code is modified. Only real runtime coupling is the shared Neon pool during ingest.

| Module | Rating | Rationale |
|---|---|---|
| ESS, MSS, Core HR, Org Chart, Leave, Payroll, MDM, Reporting/Dashboard, Approvals/Workflows | 🟡 Low | No code touched; transient latency only if a bulk ingest runs concurrently (pool contention). Dashboard `Promise.all` most exposed. |
| Documents & Letters, ARIA, Time & Attendance | 🟢 No Impact | No shared path. |
| Existing imports (`/api/persons/import`, `import-engine.ts`) | 🟢 No Impact *(conditional)* | Only if D3 independence honored; `import-engine.ts` must **not** be reused. |
| Existing APIs | 🟢 No Impact | New `/api/migration/*` namespace. |
| **Navigation** | 🔴 Corrected | Was "No Impact"; actually **Low Impact** — appending a workspace **fails NAVDEPTH-002** (see §4 R-A). |

## 4. Rollback Review

| # | Finding | Rating |
|---|---|---|
| R-A | **Nav append breaks an existing green test.** ✅-VERIFIED: `tests/unit/nav-depth-governance.test.ts` **NAVDEPTH-002** hardcodes 11 workspace ids and asserts the set. Appending a 12th fails it unless deliberately updated. Original "append-only / inert" claim was wrong. | 🔴 → **C3** |
| R-B | **Wrong safety-net test cited.** ✅-VERIFIED: `NAV-001–010` is in `employee-navigation.test.ts` (EMPLOYEE sidebar) and never references `WORKSPACE_NAV`. No test asserts MANAGER/EMPLOYEE cannot see a SUPER_ADMIN workspace. | 🔴 → **C3** |
| R-C | **"Clean DROP" is real.** ✅-VERIFIED: no production table FKs into `migration_*`; `resolved_target_id` is a plain uuid. | 🟢 |
| R-D | **Rollback validation aspirational.** "4-role, 30–45 min" is not runnable (parallel role specs; HA-* skipped for seed data). | 🟡 → **C7** |
| R-E | **Wrong env var.** ✅-VERIFIED: docs/CLAUDE.md said `POSTGRES_URL`; code uses **`DATABASE_URL`** (`lib/db.ts`, `drizzle.config.ts`, `.env.local`). | 🟡 → **C7** |
| R-F | **Orphaned in-flight batches** after a Vercel timeout/redeploy mid-ingest; no cleanup cron (`vercel.json` has only SLA cron). | 🟡 → **C6** |

## 5. Security Review

| # | Finding | Rating |
|---|---|---|
| S-A | **PII unencrypted in staging.** ✅-VERIFIED design intent defers encryption to promotion; Hard Rule 3 is **unconditional**. Plaintext `emirates_id`/`passport`/`iban` lands in staging jsonb on first ingest. | 🔴 → **C2** |
| S-B | **audit_log PII spillage vector.** Mandated `db.transaction()+audit.log()` can write payloads into `audit_log.new_values`; platform already fixed this class (FIX-2G-002). | 🔴 → **C2** |
| S-C | **`feature_permissions` is NOT enforcement.** ✅-VERIFIED: `employeePerms/managerPerms/hrAdminPerms` read only in the editor UI + its server action; zero request-boundary consumers. "Default-deny row" provides no protection. | 🔴 → **C4** |
| S-D | **Sibling pattern omits audit.** ✅-VERIFIED: `saveFeaturePermissions` (`modules/access/actions.ts` ~37–57) wraps `db.transaction()` with **no `writeAuditLog`**; copying it propagates a Hard Rule 1 violation; permission toggling itself is unaudited. | 🔴 → **C5** |
| S-E | `requireRole` / MFA step-up / `isDevSession` bypass correctly designed. Caveat: `ENABLE_DEV_ACCOUNTS=true` in staging bypasses MFA for high-privilege roles. | 🟡 |
| S-F | No middleware entry for `/migration-factory` or `/api/migration` (the real backstop). | 🔴 → **C1** |

## 6. Performance Review

| # | Finding | Rating |
|---|---|---|
| P-A | **No `maxDuration`; synchronous import** → 504 mid-transaction on large files → orphaned batch. | 🔴 → **C6** |
| P-B | **Pool contention** (see A2). | 🔴 → **C6** |
| P-C | **No batch-size cap** → runaway memory on 50k-row uploads. | 🟡 → **C6** |
| P-D | **No JSONB index strategy** → O(N) validation scans at scale. | 🟡 → **C6** |
| P-E | **No async/background architecture** — should reuse the in-house `node-cron` + Postgres outbox pattern (return `202 + jobId`). | 🟡 → **C6** |
| P-F | **No query timeout / circuit breaker** on cross-reference SELECTs against production under pool pressure. | 🟡 → **C6/C10** |

## 7. Production Readiness Review

| Capability | Rating | Notes |
|---|---|---|
| Oracle Fusion migration (this phase, staging) | 🟢 (after C1–C7) | Architecture supports it without redesign. |
| Future **customer** migrations | 🔴 | ✅-VERIFIED: platform is Phase-1 **single-tenant** (`tenant_id` defaults to a constant). Requires a multi-tenancy program — out of scope, not achievable additively. |
| UAT → Production promotion | 🟡 | Feasible via proven in-house patterns (effective-date, encryption, transactional, dry-run) but under-specified; **deferred to its own gate (D5)**. |

## 8. Self-Challenge Findings

The synthesizer challenged the agents, not just the design:

- 🟢 **Downgraded an over-stated "CRITICAL."** A reviewer flagged "DataOps appears in both `workspace-nav.ts` and `admin-nav.ts` = critical leak." ✅-VERIFIED **false as a leak**: `admin-nav.ts` gates that group with `superAdminOnly:true`, so MANAGER does **not** see it. Real (narrower) risk: a future edit dropping that flag, with no test guarding it → re-rated 🟡 and folded into C3's spirit.
- 🟢 **Re-checked agent numbers.** The agent pool hallucinated migration counts in an earlier run, so pool config, layout roles, `feature_permissions` consumers, NAVDEPTH-002 contents, and the audit gap were **all re-verified directly** before being treated as findings.
- 🟡 **Reconciled a direct contradiction.** Security ("PII unencrypted = CRITICAL") vs Production-readiness ("PII deferral correct by design"). Adjudicated in favor of Security — Hard Rule 3 is unconditional (→ C2).

## 9. Verified Findings (consolidated, ✅ = code-confirmed)

| Claim | Verdict |
|---|---|
| ✅ `(hr-admin)/layout.tsx` admits EMPLOYEE/MANAGER; no SUPER_ADMIN gate at layout | CONFIRMED |
| ✅ `middleware.ts` `ROLE_GATED_PATHS` gates `/admin/dataops` + `/api/dataops`; nothing for migration | CONFIRMED |
| ✅ `NAVDEPTH-002` hardcodes 11 workspace ids; append fails it | CONFIRMED |
| ✅ `NAV-001–010` is the EMPLOYEE sidebar test, not a `WORKSPACE_NAV` guard | CONFIRMED |
| ✅ `feature_permissions` perms columns read only in editor UI + its action (no runtime enforcement) | CONFIRMED |
| ✅ `lib/db.ts` `max:1` only when `NODE_ENV==='production'`; else pool 10 | CONFIRMED |
| ✅ Code reads `DATABASE_URL`, not `POSTGRES_URL` | CONFIRMED |
| ✅ `saveFeaturePermissions` wraps `db.transaction()` with no `writeAuditLog` | CONFIRMED |
| ✅ No production table FKs into `migration_*` namespace (clean DROP) | CONFIRMED |
| ✅ Platform is single-tenant (`tenant_id` constant default) | CONFIRMED |

## 10. Blocking Conditions (C1–C10)

**Blocking — implementation NO-GO until all closed:**

| # | Condition | 🔴/🟡 |
|---|---|---|
| **C1** | Add `/migration-factory` + `/api/migration` to `middleware.ts` `ROLE_GATED_PATHS` (`allowed:['SUPER_ADMIN']`); `requireRole(['SUPER_ADMIN'])` mandatory on every handler. | 🔴 |
| **C2** | Encrypt PII via `lib/encryption.ts` before INSERT into staging; redact `raw/normalized_payload` from `audit_log`. | 🔴 |
| **C3** | Deliberately update `NAVDEPTH-002` to 12; add a NEW test asserting MANAGER/EMPLOYEE cannot see the SUPER_ADMIN workspace; remove the false NAV-001–010 citation. | 🔴 |
| **C4** | Treat `feature_permissions` as metadata-only (or wire real enforcement); do not rely on a "default-deny row" for protection. | 🔴 |
| **C5** | Every staging write = `db.transaction() + writeAuditLog`; do not copy `saveFeaturePermissions`; audit permission toggling. | 🔴 |
| **C6** | Make R1 enforceable: hard batch-size cap, `export const maxDuration`, async/background via cron+outbox, off-peak gate, orphaned-batch cleanup cron, JSONB GIN index, query timeout. | 🔴 |
| **C7** | Executable backup/rollback runbook (git tag + Vercel deploy id + Neon branch) using `DATABASE_URL`; runnable 4-role regression checklist. | 🔴 |

**Design — decide before build (non-blocking):**

| # | Condition | 🟡 |
|---|---|---|
| **C8** | Lock OD-2 to Option A (enforced intra-set FKs) — fixes rollback DROP order. *(Recorded as locked in `01-staging-schema-design.md` §6.)* | 🟡 |
| **C9** | Define DataOps ↔ Migration Factory boundary + per-batch advisory lock. | 🟡 |
| **C10** | Define ERROR-vs-WARNING cross-reference thresholds; document migration 0055 as a manual, un-journalled Neon step. | 🟡 |

## 11. Final Recommendation

🟡 **APPROVE WITH CONDITIONS.**

- The architecture does **not** require redesign for Phase 1 (Oracle Fusion → isolated staging).
- **C1–C7 are mandatory before any code is written.** Each closes a verified-false "safe" claim that would otherwise breach the Prime Directive.
- **C8–C10** should be decided before build but do not block conceptually.
- **Out of scope for Phase 1:** multi-tenancy (future-customer migrations) and the production promotion phase (its own gate, D5).

> **Implementation remains NO-GO until C1–C7 are explicitly closed by the project owner.**
