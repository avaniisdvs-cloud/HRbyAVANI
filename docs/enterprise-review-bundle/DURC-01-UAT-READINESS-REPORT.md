# DURC-01 — UAT Readiness & Production Go-Live Report (Board Quality)
## Avaniis HR Core Platform
**Date:** 2026-06-13 · **Stage:** DEVELOPMENT / UAT (not Production) · **Branch:** `fix/eprc-01-blockers`

> Consolidates DURC-01 Phases 0–7. Supersedes the environment framing of the earlier
> EPRC-01 reports (which over-weighted production-only items as current blockers).
> Repository is the source of truth; every verdict cites inspected code.

---

## 1. Executive Summary
The platform is **UAT-ready**. The single build-breaking error (ImportWizard) is resolved, all
three confirmed code blockers from the independent audit are remediated and test-green, and the
remaining audit items are correctly reclassified as **accepted UAT configurations**, **production
go-live conditions**, **documentation**, **business decisions**, or **future roadmap** — none are
current UAT blockers.

## 2. Current Environment Classification
**DEVELOPMENT / UAT — not Production.** Demo accounts, seeded test users, and UAT login shortcuts
are **accepted** for controlled role/workflow/stakeholder testing, and must be disabled before
production (tracked in §9). SEC-09 is therefore **NOT a current UAT blocker**.

## 3. UAT Readiness Verdict — ✅ **PASS WITH CONDITIONS**
UAT may proceed. Build + typecheck pass; blocker scope closed; demo accounts documented as UAT-only.
Conditions are hardening + production-only items (§9, §15), none blocking UAT.

## 4. Production Readiness Verdict — ⛔ **NOT READY** (by design, this stage)
Open production go-live conditions remain (demo-account hard-block, durable storage config, prod env
guards, runbook/DR, permission rollout). See §9.

## 5. Audit Legitimacy Matrix (UAT-reclassified — key points)
Full 33-point matrix: [EPRC-01-STOPGATE-REPORT.md](EPRC-01-STOPGATE-REPORT.md) §Phase 1. Reclassifications under DURC-01:

| # | Point | Verdict | UAT impact | Production impact | Status |
|---|---|---|---|---|---|
| A1 | Build failure (ImportWizard `StepBar` missing `isAr`) | TRUE → **ALREADY FIXED** | was UAT BLOCKER | n/a | Fixed concurrently; `StepBar current={step} isAr={isAr}` at line 184; typecheck+build green |
| A2 | P3-D3 DataOps PII write | PARTIALLY TRUE → **ALREADY FIXED** | was HIGH | condition met | B1 commit `652afd8` + 21 tests |
| A3 | DataOps hard DELETE | TRUE → **ALREADY FIXED** | was HIGH | condition met | B1 — protected-table delete block |
| A4 | DataOps audit bypass | TRUE → **ALREADY FIXED** | was HIGH | condition met | B1 — main-audit mirror |
| A5 | DataOps effective-dating | PARTIALLY TRUE → **ALREADY FIXED** | was MED | condition met | B1 — temporal-column block |
| A6 | RATE-01 rate limiting | TRUE → **ALREADY FIXED (UAT scope)** | was HIGH | hardening | B2 commit `6e3b9e8` + 10 tests |
| A7 | CRED-01 tracked cookie | TRUE → **ALREADY FIXED** | was MED | rotation pending | B3 commit `32a7169` |
| A8 | Production document storage | **ALREADY FIXED (UAT) / PRODUCTION CONDITION** | NOT A CURRENT DEFECT | PROD CONDITION | Azure/AWS/Postgres providers + prod guard; local OK for UAT |
| B9 | Demo accounts / SEC-09 | **ACCEPTED UAT CONFIGURATION** | NOT A CURRENT DEFECT | PROD CONDITION | `areDevAccountsAllowed()` blocks on `DATABASE_ENV=production` |
| C10/11 | requirePermission / P3-D2 | PARTIALLY TRUE | LOW (requireRole protects) | PROD CONDITION | "Resolver implemented; targeted rollout in progress" |
| C12 | Delegation validation | PARTIALLY TRUE | MED | hardening | circular+self blocked; self-at-rule-create / cross-entity / expiry open |
| C13 | Escalation paths | PARTIALLY TRUE | MED | hardening | SLA atomic+audited; ESCALATE lacks human-owner notify |
| C14 | IBAN-at-rest | **ALREADY FIXED (Core HR)** / NEEDS BUSINESS DECISION (payroll) | LOW | business decision | persons/bank encrypted AES-256-GCM; payroll masked (P2-P2) |
| D15 | Migration journal gap | TRUE (governed) | LOW | PROD CONDITION | ledger backfill 0040–0061 |
| D16 | CI/CD | PARTIALLY TRUE | LOW | PROD CONDITION | CI green; gated CD pending |
| D17 | Connection pool max:5 | **FALSE (NAD)** | NAD | n/a | intentional pgBouncer config |
| D18/19/E29–34 | API gateway / event streaming / multi-country / AI suite | **FUTURE ROADMAP** | LOW | roadmap | deferred |
| E21–28 | Data Dictionary / BPMN / Runbook / DR / RACI / training | **DOCUMENTATION** | LOW | PROD CONDITION (runbook/DR) | §9, §15 |

## 6. Accepted UAT Configurations (documented; not defects)
- **Demo/dev accounts & UAT login shortcuts** — `lib/auth.ts` DEV_ACCOUNTS, gated by `areDevAccountsAllowed()` (`lib/environment-guardrails.ts:44-48`). Active only in non-production. **Must be disabled before production (§9.1).**
- **MFA bypass for LOCAL/dev sessions** — documented (OP-001); Entra ID sessions enforce MFA.
- **Local document storage** — acceptable for UAT; durable provider required for production (§9.2).
- **Single Neon DB / pool max:5** — correct for current serverless UAT.

## 7. Current UAT Blockers — FIXED this engagement
| ID | Blocker | Fix | Evidence |
|---|---|---|---|
| A1 | Build break (ImportWizard) | `isAr` prop passed to StepBar (concurrent) | typecheck clean; build exit 0 (120/120 pages) |
| B1/P3-D3 | DataOps PII/delete/audit/temporal bypass | `lib/dataops/write-guard.ts` + 4 routes | 21 tests; commit `652afd8` |
| B2/RATE-01 | No rate limiting | `lib/rate-limit.ts` + auth/dataops/documents/workflow | 10 tests; commit `6e3b9e8` |
| B3/CRED-01 | Tracked staging cookie | untracked + `.gitignore` | commit `32a7169` |

## 8. Remaining UAT Blockers
**None.**

## 9. Production Go-Live Condition Register
| # | Condition | Current state | Closure criteria |
|---|---|---|---|
| 9.1 | **Demo accounts disabled** | Gated by `DATABASE_ENV=production`; no CI guard | Set `ENABLE_DEV_ACCOUNTS` unset/false; add CI/deploy guard that fails on unsafe prod env; test proving demo login rejected in production mode |
| 9.2 | **Durable document storage** | Azure/AWS providers implemented; prod guard throws if unconfigured | Configure `AZURE_STORAGE_CONNECTION_STRING`; hard-block explicit `local` in prod (currently warn-only); validate upload/read/delete |
| 9.3 | **Production Runbook** | Only rollback runbook exists | Author: env vars, deploy, rollback, monitoring, alerting, backup/restore, incident response, DR contacts, RPO/RTO |
| 9.4 | **CI/CD deploy guard** | CI green; no gated CD | Add prod env validation + unsafe-env detection + build/test gates |
| 9.5 | **requirePermission rollout** | Resolver + 3 critical actions wired | Cover critical/high-risk server actions; per-module allow/deny tests |
| 9.6 | **Credential/session rotation** | Cookie untracked; still in history | Rotate `AUTH_SECRET`; decide on git-history purge (needs authorization) |
| 9.7 | **Migration ledger** | 0062–0065 recorded; 0040–0061 unrecorded | Backfill ledger with binary verification |
| 9.8 | **DR plan / RPO / RTO** | Implied (Neon PITR), not formalized | Formal DR plan with targets + test schedule |

## 10. Production Go-Live Checklist (condensed)
☐ `ENABLE_DEV_ACCOUNTS` unset/false + demo login rejection test ☐ Azure Blob configured, `/tmp` hard-blocked ☐ prod env vars verified ☐ CI/CD env guard ☐ monitoring/logging (App Insights) ☐ backup/restore tested ☐ rate limiting backed by shared store/WAF ☐ requirePermission critical coverage ☐ migration ledger reconciled + applied to isolated prod DB ☐ data-migration validation ☐ final smoke test ☐ `AUTH_SECRET` rotated.

## 11. Current Status Register (merge of KNOWN_GAPS.md + OPEN-POINTS.md)
| Item | Category | Note |
|---|---|---|
| KNOWN_GAPS.md (2026-05-01) | **DOCUMENTATION** | Stale, self-flagged; superseded by `00-MASTER-QA-QC-REPORT.md` §7 + revalidation. Retire/redirect. |
| OP-001 MFA step-up for LOCAL high-priv | **PRODUCTION GO-LIVE CONDITION** | Re-enable before prod (Entra MFA already enforced) |
| P3-D2 permission rollout | **OPEN (hardening)** | Resolver done; targeted rollout in progress |
| P3-D3 DataOps | **CLOSED** | B1 |
| RATE-01 | **CLOSED (UAT)** | B2 |
| CRED-01 | **CLOSED (rotation pending)** | B3 |
| P2-P2 IBAN payroll masking | **BUSINESS DECISION** | encrypt vs accept masking (payroll scope) |
| P2-T3 self-approval, P1-H4 uniqueness | **CLOSED** | shipped `c0667cc` |
| Delegation self/cross-entity/expiry | **OPEN (hardening)** | C12 |
| Escalation human-owner notify | **OPEN (hardening)** | C13 |
| Data Dictionary / BPMN / Runbook / DR / RACI | **DOCUMENTATION / PROD CONDITION** | §9 |
| API gateway / event streaming / multi-country / AI suite | **FUTURE ROADMAP** | deferred |

## 12. Code Changes Made (this engagement) & 13. Files
3 commits on `fix/eprc-01-blockers`: `32a7169` (B3 .gitignore + untrack), `652afd8` (B1 `lib/dataops/write-guard.ts` + 4 dataops routes + 2 tests), `6e3b9e8` (B2 `lib/rate-limit.ts` + `lib/auth.ts` + dataops/documents/workflow routes + test). ImportWizard build fix landed via concurrent i18n commit (not this engagement). **No unrelated WIP staged in any of my commits (verified).**

## 14. Tests Added
`tests/security/dataops-write-guard.test.ts` (21) · `tests/security/rate-limit.test.ts` (10).

## 15. Validation Results (Phase 6)
| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ clean (0 errors) |
| `pnpm build` | ✅ PASS — compiled 11.0s, 120/120 static pages, exit 0 |
| EPRC-01 new tests | ✅ 31 pass (21 + 10) |
| Security + auth suite | ✅ 272 pass (rbac 77, encryption 35, auth-session 23, mfa 11, permission-resolver 10, …) |
| Foundation impact | `lib/auth.ts` — one additive `authorize()` guard; no model change |

*Caveat: the working tree is under heavy concurrent i18n editing (file set churns every few minutes; the i18n actor is committing onto this branch). Validation above reflects the tree at build time; re-run on a quiesced branch for a definitive release gate.*

## 16. Remaining Business Decisions
IBAN payroll masking posture (P2-P2; payroll out of scope) · DR RPO/RTO targets · feature-permission matrix ownership · git-history purge for the cookie.

## 17. Recommended Next Sprint
Hardening: H1 requirePermission critical/high rollout · H2 delegation guards (self-at-create/cross-entity/expiry) · H3 escalation-owner notification · H5 SEC-09 CI guard · H6 storage prod hard-block. Docs: Production Runbook, DR plan, Data Dictionary (from `drizzle/schema`), migration-ledger backfill. Ops: rotate `AUTH_SECRET`.

## 18. CEO-Level Conclusion
Avaniis HR Core is **UAT-PASS (with conditions)**: it builds, typechecks, and passes its security/auth
suites; the audit's genuine code blockers are closed with tests and runtime wiring; demo accounts are
correctly retained as accepted UAT configuration with a documented production hard-block path. **Production
is NOT READY** only in the expected sense — a tracked set of go-live conditions (demo-account lockout,
durable storage, prod guards, runbook/DR, permission rollout) remain. Recommend: continue UAT, schedule the
hardening + documentation sprint, and gate production cutover on the §9 register.
