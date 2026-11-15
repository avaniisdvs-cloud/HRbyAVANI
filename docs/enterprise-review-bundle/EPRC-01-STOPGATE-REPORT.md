# EPRC-01 — Executive Stop-Gate Report (Phases 0–2)
## Avaniis HR Core Platform — Production-Readiness Legitimacy Review
**Date:** 2026-06-13 · **Mode:** read-only inspection (no code changed) · **Repo = source of truth**

> This report completes EPRC-01 Phases 0, 1, 2. Per the command's own rule and the active code freeze, **no code has been changed.** Phase 3 remediation awaits explicit authorization. Evidence was gathered by four independent read-only investigations against the live repo.

---

## PHASE 0 — Repository Orientation

| Concern | Implementation (evidence) |
|---|---|
| Framework | Next.js 15.3.9 (App Router), TypeScript, Drizzle ORM 0.45.2, PostgreSQL 16 (Neon), pnpm |
| Auth model | Auth.js v5; Microsoft Entra ID (OIDC, MFA enforced at IdP) + dev/UAT credential accounts (`lib/auth.ts`) |
| RBAC | `requireRole()` (`lib/auth.ts:557-611`, **501 call sites**) = first gate; `requirePermission()` (`lib/permissions.ts`, **3 wired call sites**) = additive matrix gate |
| DataOps | SUPER_ADMIN-only raw-SQL console (`app/api/dataops/**`); SQL validator blocks DDL, allows DML; separate `dataops.audit_log`; `lib/dataops/access-policy.ts` table classes |
| Document storage | `lib/storage/` — 4 providers (Azure/AWS/Postgres/Local), real SDKs, factory with production guard + Vercel auto-upgrade to Postgres |
| Workflow engine | `lib/workflow-engine.ts` (1,703 lines) + `lib/workflow-guards.ts`; SLA cron `app/api/cron/workflow-sla` |
| Effective dating | `lib/effective-date.ts`, `lib/as-of-query.ts` (10 adapters); DB constraints migrations 0063/0064 (EXCLUDE gist, one-current-row, date-order) |
| Audit | `lib/audit.ts` INSERT-only `public.audit_log`; immutability via DB trigger |
| Env governance | `lib/environment-guardrails.ts` (`areDevAccountsAllowed`, production blocks) |
| Migrations | Drizzle journal 0000–0039; **0040–0065 manual SQL**; ledger `docs/environment/migration-ledger.*.md` |
| Tests | 189 files / ~3,386 cases (unit/integration/security/e2e/chaos/perf/lib/a11y) |
| Deployment | Vercel auto-deploy on `main`; CI = lint/typecheck/test/build + schema-drift; weekly soak test; **no gated CD / no integration-test stage** |

---

## PHASE 1 — Copilot Audit Legitimacy Matrix

Verdict legend: TRUE · FALSE · PARTIALLY TRUE (PT) · ALREADY FIXED (AF) · NEEDS BUSINESS DECISION (NBD) · DOCUMENTATION ONLY (DOC) · FUTURE ROADMAP ONLY (FRO). Impact: BLOCKER · HIGH · MED · LOW · NOT-A-DEFECT (NAD).

### A. Production Security & Governance

| # | Audit point | Repo evidence | Verdict | Impact | Code? | Closure criteria |
|---|---|---|---|---|---|---|
| 1 | DataOps raw-PII write (P3-D3) | `execute/route.ts:27` `rawSql.unsafe(sql)`; no encryption interception; SUPER_ADMIN-only `:15`; SQL validator blocks DDL only | **PT** | **BLOCKER** | YES | PII columns cannot be written plaintext via DataOps; encryption-aware path or denylist + audit |
| 2 | DataOps hard DELETE | `[id]/route.ts:88` snapshot required; `:124` soft-copy to `_archive` *if exists*; `:131` hard `DELETE` of original | **TRUE** | **BLOCKER** | YES | Hard DELETE blocked on protected/effective-dated tables; archive mandatory |
| 3 | DataOps main-audit bypass | All DataOps writes → `dataops.audit_log` (`bootstrap.ts:16`); **never** `lib/audit.ts`/`public.audit_log`; no old/new diff | **TRUE** | HIGH | YES | DataOps mutations mirrored to main audit trail (actor/old/new) |
| 4 | DataOps effective-dating bypass | App layer no temporal validation; DB constraints (0063/0064) catch overlaps with raw errors | **PT** | MED | YES | Pre-flight guard or block on temporal tables; safe error surfacing |
| 5 | SEC-09 demo accounts in prod | Gate works: `environment-guardrails.ts:44-48` blocks when `DATABASE_ENV=production`; **but no CI/deploy guard** | **PT** (gate AF; CI guard missing) | MED | YES (CI guard) | CI fails if prod env + demo accounts; prod env value verified |
| 6 | CRED-01 staging auth cookie | `tests/performance/staging-auth-cookie.txt` **git-tracked**; expired (30-min TTL) | **TRUE** | **BLOCKER** | YES | `git rm --cached` + `.gitignore`; rotate; no test depends on it |
| 7 | RATE-01 rate limiting | Absent on auth, ARIA, DataOps, documents, workflow-token (`grep` clean); only app-level reissue cap 3/day; signing routes empty | **TRUE** | **BLOCKER** | YES | Rate limiting on high-risk surfaces + tests |
| 8 | Production document storage | `lib/storage/factory.ts` prod guard `:256` throws if unconfigured; Vercel+DB auto→postgres `:54`; Azure real SDK; tested | **AF** (minor nit) | LOW | optional | Hard-block explicit `local` in production (currently warn-only) |

### B. RBAC & Permission Governance

| # | Audit point | Repo evidence | Verdict | Impact | Code? | Closure criteria |
|---|---|---|---|---|---|---|
| 9 | requirePermission rollout | Resolver `lib/permissions.ts`; **3 of ~168** actions wired (core-hr create/edit, reports view); payroll/workflow/assignments/docs/leave/insurance use requireRole only | **PT** | HIGH | YES | requirePermission on Critical+High actions; tests allow/deny per module |
| 10 | P3-D2 closure status | Resolver implemented; rollout ~2%; LEGACY_ALLOW default | **PT** | MED | DOC+YES | Governance wording: "resolver implemented; targeted rollout for critical/high actions" |
| 11 | Delegation validation | Circular prevented + audited (`workflow/actions.ts:1340`); self-approval/delegate-to-initiator/self blocked (`workflow-guards.ts:59-72`); **self-delegation at rule-create, expiry TTL, cross-entity = ABSENT** | **PT** | MED | YES | Add self-delegation + cross-entity checks; optional expiry |
| 12 | Escalation paths | SLA engine atomic+audited (`workflow-engine.ts:1565`); SEND_REMINDER notifies; **ESCALATE sets status, no human notification** | **PT** | MED | YES | Notify escalation owner on ESCALATE |
| 13 | IBAN-at-rest | `persons.iban` + `personBankDetails.iban` **encrypted AES-256-GCM** (`bank-details/actions.ts:53`); `wps_sif_records.iban` masked; `payroll_results.iban` masked/null (P2-P2) | **AF** (Core HR) / **NBD** (payroll) | LOW | NO | Business decision: payroll masking vs encrypt (payroll out of scope) |

### C. Architecture, Deployment, Migration

| # | Audit point | Repo evidence | Verdict | Impact | Code? | Closure criteria |
|---|---|---|---|---|---|---|
| 14 | Migration journal gap | Journal 0000–0039; 0040–0065 manual; ledger backfilled 0062–0065 only; 0040–0061 unrecorded; WIP not applied | **TRUE** (governed) | MED | NO (ops/doc) | Backfill ledger 0040–0061 (binary verify); confirm 0061 |
| 15 | CI/CD | CI lint/typecheck/test/build + drift; Vercel auto-deploy; no gated CD, no integration stage, no pre-deploy security check | **PT** | MED | NO (ops) | Add CD gate + integration stage + pre-deploy checklist |
| 16 | Connection pool max:5 | `lib/db.ts:36` documented pgBouncer transaction-mode config | **FALSE (NAD)** | NAD | NO | — intentional, correct |
| 17 | API gateway absence | Direct route access; no gateway | **FRO** | LOW | NO | Azure API Management — future phase |
| 18 | Event streaming absence | Outbox + cron (sufficient this phase) | **FRO** | LOW | NO | Event Grid/Service Bus — future |
| 19 | UAE-only rules | Scope is UAE-only | **FRO** | LOW | NO | Country abstraction — future multi-country |

### D. Documentation & Governance

| # | Audit point | Repo evidence | Verdict | Impact |
|---|---|---|---|---|
| 20 | Data Dictionary | Missing (only `WORKFLOW_DATA_MODEL.md`) | **DOC** | MED |
| 21 | BPMN diagrams | Missing (textual only) | **DOC** | LOW |
| 22 | KNOWN_GAPS vs OPEN-POINTS | KNOWN_GAPS stale-by-design + self-flags; OPEN-POINTS current (OP-001) | **PT/DOC** | LOW |
| 23 | Terminology drift | Minor person/employee/worker/assignment overlap | **PT/DOC** | LOW |
| 24 | Production Runbook | Partial — only `migration-factory/09-rollback-runbook.md` | **DOC** | MED |
| 25 | DR / RPO / RTO | Missing (Neon PITR implied, not formalized) | **DOC** | HIGH (doc) |
| 26 | RACI matrix | Missing | **DOC** | MED |
| 27 | Training guides | Dev-only (`TRAINING_MANUAL_CONTEXT.md`) | **DOC** | LOW |

### E. AI & Future Roadmap

| # | Points 28–33: M365 Copilot, predictive analytics, enterprise search, autonomous HR, ML pipeline, microservices | **FRO** | LOW | No current production requirement |

---

## PHASE 2 — Executive Stop-Gate

### 1. Executive summary
The platform is materially production-capable for Core HR UAT. The repository contradicts several of the harshest external-audit framings (document storage is implemented and guarded; IBAN PII is encrypted in Core HR; connection pool is correct by design; demo-account gate works). However, **three confirmed code-level production blockers** remain, plus a cluster of high-risk hardening gaps and documentation deliverables. None require foundation-model changes or redesign.

### 2. Legitimacy matrix — see Phase 1 above.

### 3. Confirmed production blockers (code) — trigger FAIL until closed
- **B1 — DataOps governance (points 1,2,3):** raw-SQL DML can write plaintext PII, hard-delete protected rows, and bypasses the main audit trail (writes only to `dataops.audit_log`). SUPER_ADMIN-only break-glass mitigates but does not close it.
- **B2 — RATE-01:** no rate limiting on auth/ARIA/DataOps/documents/workflow-token surfaces.
- **B3 — CRED-01:** `tests/performance/staging-auth-cookie.txt` is git-tracked.

### 4. Confirmed high-risk hardening gaps (strongly recommended, not strict FAIL triggers)
- **H1 — requirePermission targeted rollout** (point 9/10): wire Critical+High actions.
- **H2 — Delegation guards** (point 11): self-delegation at rule-create + cross-entity + optional expiry.
- **H3 — Escalation notification** (point 12): notify a human owner on ESCALATE.
- **H4 — DataOps effective-dating pre-flight** (point 4): friendly temporal validation.
- **H5 — SEC-09 CI guard + prod env verification** (point 5).
- **H6 — Document-storage prod hard-block** (point 8): reject explicit `local` in production.

### 5. False / overstated audit findings (no action / NAD)
- Connection pool max:5 (#16) — intentional, correct.
- Document storage "unsafe /tmp in prod" (#8) — guarded + auto-upgraded; AF.
- IBAN-at-rest for Core HR (#13) — encrypted AES-256-GCM; AF.
- "No CD pipeline" (#15) — Vercel auto-deploy exists; gap is *gated* CD, not absence.

### 6. Documentation-only gaps
Data Dictionary (#20), BPMN (#21), KNOWN_GAPS/OPEN-POINTS merge (#22), terminology glossary (#23), Production Runbook completion (#24), DR/RPO/RTO (#25), RACI (#26), training guides (#27), migration-ledger backfill (#14).

### 7. Future-roadmap-only items
API gateway (#17), event streaming (#18), multi-country (#19), M365 Copilot/predictive/enterprise-search/autonomous-HR/ML/microservices (#28–33).

### 8. Items requiring business decision
- IBAN payroll masking posture (P2-P2) — **payroll is out of scope**; defer.
- DR RPO/RTO targets (need exec sign-off on acceptable data loss / downtime).
- requirePermission matrix policy ownership (who curates feature permissions).

### 9. Recommended remediation sprint scope (Phase 3 — pending authorization)
**Mandatory (close blockers):** B1 DataOps hardening + tests · B2 rate limiting + tests · B3 credential untracking.
**High-value if time:** H5 SEC-09 CI guard · H6 storage prod hard-block · H2 delegation guards · H3 escalation notify.
**Defer to follow-up:** H1 full requirePermission rollout (large, additive, requireRole already protects) · docs deliverables · ledger backfill.

### 10. Items explicitly excluded from current remediation
Payroll (all), UI redesign, M365 Copilot, predictive analytics, enterprise search, autonomous HR, microservices, API gateway, event streaming, migration-history rewrite, destructive git purge, any effective-dating/audit/RBAC weakening.

---

## ⛔ STOP-GATE — authorization required before Phase 3

Phase 3 changes code. Two governance constraints currently **block** it:
1. **Code freeze** in effect (no edits without explicit instruction).
2. **Working tree is dirty** — ~24 modified files from the `fix/i18n-rtl-language-preference-enterprise` branch. Remediation should land on a **clean dedicated branch**, not on top of unrelated WIP.

**Recommended next step:** authorize Phase 3 for the **three blockers only (B1, B2, B3)** on a fresh branch, with tests, then re-gate. Final verdict until then: **PASS WITH CONDITIONS pending blocker closure** (the command's FAIL triggers — DataOps bypass, missing rate limiting, tracked credential — are currently met, so a strict reading is FAIL-until-remediated).
