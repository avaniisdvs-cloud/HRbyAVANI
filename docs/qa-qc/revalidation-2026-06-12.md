# QA/QC Independent Revalidation — 2026-06-12

**Scope:** Independent code-level re-verification of the 12 highest-severity closures claimed in `00-MASTER-QA-QC-REPORT.md` (W0–W3), plus spot-checks of claimed-open findings. Performed without trusting prior reports; every verdict cites current source.

## Result summary

| Verdict | Count | Findings |
|---|---|---|
| CLOSED — verified in code | 8 | P3-A1, P3-A3, P2-P1, P3-A2, P3-A5, P3-M-FALLBACK-EMAIL, P2-L1, (OP-001 deferral confirmed in place as designed) |
| **PARTIALLY CLOSED — claim overstated** | 1 | **P2-P2** — IBAN on `payroll_results` is **masked, not encrypted** (`modules/payroll/actions.ts:84–88` maskIban; full IBAN sourced from encrypted `person_bank_details`). Masking ≠ encryption; closure wording must be corrected or posture formally accepted. |
| **OPEN — falsely listed as closed in W1 summary** | 2 | **P3-D2** — `feature_permissions` table exists (`drizzle/schema/configuration.ts:539–560`) but **no runtime `requirePermission()` resolver exists**; enforcement is client-side only. **P3-D3** — DataOps write route is SUPER_ADMIN-gated (`app/api/dataops/execute/route.ts:15`) but PII writes still bypass encryption/effective-dating/main audit_log; hard DELETE possible. |
| OPEN — confirmed still open (spot check) | 3 | P2-T3 (no self-approval guard, `lib/workflow-engine.ts:1181–1187`), P1-H4 (no uniqueness on emirates_id/passport/employee_code, `foundation.ts:187–229`), P2-M-PRORATION (no proration logic in calculation engine) |
| NOT VERIFIED (environment, not code) | 1 | SEC-09 — code guard exists (`lib/environment-guardrails.ts:44–48`: dev accounts blocked when `DATABASE_ENV=production`), but actual Vercel production env values cannot be verified from the repo |

## Corrections required to the master report
1. Restate W0–W3 closure count: of the 12 sampled claimed closures, **10 verified, 2 actually open (P3-D2, P3-D3), 1 partial (P2-P2)**. The "DUAL status" entries in the master report must be resolved to OPEN.
2. P2-P2 closure note must say "masked" not "encrypted", or the finding stays open until at-rest encryption (or a formally accepted masking posture) is in place.

## Required before production go-live (carried forward)
1. Implement runtime `requirePermission(feature, action)` and wire server-side gates (P3-D2).
2. Block or encrypt-route DataOps writes to PII tables; prevent hard DELETE of HR rows (P3-D3).
3. Decide IBAN-at-rest posture (encrypt vs accepted masking) (P2-P2).
4. SEC-09: unset `ENABLE_DEV_ACCOUNTS` in Vercel production and verify demo logins rejected.
5. OP-001: re-enable MFA step-up for LOCAL high-privilege sessions.

## Effective-dating execution evidence (same date)
83/83 effective-dating unit tests pass across 12 files (as-of engine, sentinel, error firewall, retro split, future-bounded split, cancellation, activation cron, canonical routing, pending-changes as-of, employee-history report).
