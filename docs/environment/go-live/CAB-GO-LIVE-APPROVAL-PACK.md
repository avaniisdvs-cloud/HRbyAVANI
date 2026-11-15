# CAB / Go-Live Approval Pack — AVANIIS HR (Core HR, non-payroll)

> **Status: DRAFT for review — production go-live NOT approved.**
> Baseline: `main` @ `2a9f4f1b` (Core HR hardening merged, CI green).
> Scope of this release: **Core HR only. Payroll is deferred and gated OFF.**

## A. Executive summary
The Core HR (non-payroll) application code is merged to `main`, CI-green, and its
production safeguards are verified in-repo (payroll feature-gate, dev-account /
storage / email fail-closed behavior, cron authentication + failure monitoring,
production preflight, performance smoke). **Production go-live remains conditional**
on Azure environment provisioning, production DB migration execution, durable
storage, Entra/MFA, monitoring provider + alerting, a production-like performance
run, and business UAT + CAB sign-off. This pack assembles the evidence and the
Go/No-Go gates for the Change Advisory Board.

## B. Scope — Core HR only
**In scope:** authentication, RBAC, employee/person records, organization /
position / assignment, leave/absence, approvals/workflow, reports, audit,
notifications/email readiness, document storage, cron/background jobs, monitoring,
production preflight, performance smoke.

**Out of scope (this release):** payroll UAT, payroll execution, payroll workflows,
payroll go-live.

## C. Payroll deferred and gated
- Controlled by `PAYROLL_WORKSTREAM_ENABLED` (server) — **fail-closed**: enabled
  only when the value is exactly `"true"`. Production must leave it unset/`false`.
- Enforced at three layers: payroll route layout (URL block + safe notice), **14
  payroll server actions** (12 run-lifecycle + 2 assignment), and navigation
  (workspace hidden). RBAC checks remain intact alongside the gate.
- Deferred payroll commits are preserved on `archive/hardening-corehr-score-90-plus-pre-pr5`.
- **Evidence:** `tests/security/payroll-gate.test.ts`, `lib/features/payroll-feature-gate.ts`.

## D. UAT sign-off (to be completed)
| Item | Owner | Status | Date | Notes |
|---|---|---|---|---|
| Non-payroll Core HR functional UAT executed (smoke checklist) | HR / Business | ☐ Pending | | See `CORE-HR-PRODUCTION-SMOKE-CHECKLIST.md` |
| UAT defects triaged; no open Sev1/Sev2 | QA | ☐ Pending | | |
| Business owner sign-off | Business Owner | ☐ Pending | | |
| HR owner sign-off | HR Owner | ☐ Pending | | |

## E. Known risks / accepted risks
| ID | Risk | Severity | Mitigation | Accepted by | Status |
|---|---|---|---|---|---|
| R-1 | Payroll reachable if `PAYROLL_WORKSTREAM_ENABLED` mis-set to `true` | High | Fail-closed default + preflight error on client/server flag mismatch | Security | ☐ |
| R-2 | Migration `0067` not yet applied to prod DB | Medium | Apply under DBA/CAB gate; app already enforces invariant in code | DBA | ☐ |
| R-3 | Monitoring provider not yet wired | Medium | Structured-log fallback present; provider before high-volume | IT | ☐ |
| R-4 | Performance unproven at production-scale data | Medium | Synthetic smoke green; prod-like load test before high volume | IT | ☐ |
| R-5 | Effective-dating deferred items (retro/proration/EOSB) | Medium | Out of first release; PO-accepted | HR/PO | ☐ |

## F. Go / No-Go checklist (P0 unless noted)
- [ ] **P0** Isolated Azure production environment live (app + config)
- [ ] **P0** Azure PostgreSQL provisioned; connection/SSL/firewall verified
- [ ] **P0** Neon backup taken; migration rehearsed on a clone; verified; rollback tested
- [ ] **P0** Production migrations applied + verified (incl. `0067`) — DBA + CAB
- [ ] **P0** Durable storage (Azure Blob) configured + upload/download/delete verified
- [ ] **P0** Entra/MFA live; dev/demo accounts disabled; break-glass verified
- [ ] **P0** `PAYROLL_WORKSTREAM_ENABLED` unset/`false` in production (verified by preflight)
- [ ] **P0** Production preflight passes (exit 0) in the prod environment
- [ ] **P0** Monitoring provider + alert routing configured; cron failure alert tested
- [ ] **P0** Non-payroll Core HR UAT signed off; no open Sev1/Sev2
- [ ] **P0** CAB / governance approval recorded
- [ ] **P1** Production-like performance run executed; thresholds met
- [ ] **P1** Email provider/sender/domain (SPF/DKIM) configured + verified
- [ ] **P2** `output:'standalone'` (only if Azure container deploy path chosen)

## G. Approval signatures
| Role | Name | Decision (GO / NO-GO) | Date | Signature |
|---|---|---|---|---|
| Business Owner | | | | |
| HR Owner | | | | |
| IT Owner | | | | |
| Security | | | | |
| DBA / Data Owner | | | | |
| CAB Chair | | | | |

> **Final rule:** GO only if **all P0 items are green and signed off**. Payroll
> go-live is explicitly **out of scope** for this approval.
