# Core HR Production Smoke Test Checklist

> Manual post-deploy verification on the target (Azure) environment. **Read-only /
> controlled actions only** — do NOT trigger payroll, and avoid sending uncontrolled
> emails (use allowlisted test recipients). Record result + evidence per row.

Environment: __________  Tester: __________  Date: __________  Build SHA: __________

## A. Authentication & access
| # | Check | Expected | Result |
|---|---|---|---|
| A1 | Sign-in page loads over HTTPS | Renders; valid cert | ☐ |
| A2 | Entra SSO login (standard user) | Succeeds; lands on role home | ☐ |
| A3 | Entra **MFA** challenge for HIGH_PRIVILEGE role | MFA enforced | ☐ |
| A4 | **Super Admin break-glass** access | Works per policy | ☐ |
| A5 | **Separated worker** login (TERMINATED/RETIRED/DECEASED or past separationDate) | **Blocked** (`account_separated`) | ☐ |
| A6 | HR Admin login | Succeeds; HR scope | ☐ |
| A7 | Manager login | Succeeds; team scope | ☐ |
| A8 | Employee (ESS) login | Succeeds; own records only | ☐ |
| A9 | Dev/demo/test accounts | **Disabled / cannot log in** | ☐ |

## B. Core HR functional
| # | Check | Expected | Result |
|---|---|---|---|
| B1 | People search (`/persons`, directory) | Results return; acceptable latency | ☐ |
| B2 | Employee profile view | Loads; PII decrypts correctly | ☐ |
| B3 | Employee profile update (if in scope) | Saves; audit entry written | ☐ |
| B4 | Organization / position / assignment view | Renders; org chart resolves | ☐ |
| B5 | Leave request submission | Submits; balance snapshot recorded | ☐ |
| B6 | **Cross-year leave** scenario | Balance split by calendar year correct | ☐ |
| B7 | Manager approval queue | Pending items visible | ☐ |
| B8 | Approval / rejection action | State transitions; audit written | ☐ |
| B9 | **Workflow delegation guard** | Self / cross-entity / cycle delegation rejected | ☐ |
| B10 | Reports + export (CSV) | Generates; export downloads | ☐ |
| B11 | Audit trail visibility | Entries shown with friendly labels | ☐ |

## C. Payroll gate (must all hold)
| # | Check | Expected | Result |
|---|---|---|---|
| C1 | Payroll navigation | **Hidden** (workspace absent) | ☐ |
| C2 | Direct URL `/payroll` (and `/payroll/runs/new`) | **Blocked** — disabled notice | ☐ |
| C3 | Payroll server action (e.g. create/calculate/approve) | **Blocked** before RBAC/DB | ☐ |
| C4 | Message shown | "Payroll is disabled in this environment." | ☐ |
| C5 | RBAC still present (non-payroll role denied where expected) | Unchanged / not weakened | ☐ |

## D. Email / notification readiness
| # | Check | Expected | Result |
|---|---|---|---|
| D1 | `EMAIL_DELIVERY_MODE` in prod | `live` (requires `DATABASE_ENV=production`) or controlled | ☐ |
| D2 | Dev/test email mode | **Off** in production (no allowlist test mode) | ☐ |
| D3 | Approval notification queued (no uncontrolled send) | Queued; dispatch controlled | ☐ |
| D4 | Sender/domain (SPF/DKIM) | Configured + verified | ☐ |

## E. Cron / background readiness
| # | Check | Expected | Result |
|---|---|---|---|
| E1 | `CRON_SECRET` set | Present | ☐ |
| E2 | Cron endpoint without secret | **401 Unauthorized** | ☐ |
| E3 | Future-dated activation schedule | Registered | ☐ |
| E4 | Email dispatch / workflow SLA jobs | Registered | ☐ |
| E5 | Cron failure → monitoring | Failure reported (see F) | ☐ |

## F. Monitoring alert test
| # | Check | Expected | Result |
|---|---|---|---|
| F1 | Monitoring provider configured | `MONITORING_PROVIDER` set; events arriving | ☐ |
| F2 | Test error / cron failure | Captured by provider | ☐ |
| F3 | Alert routing | Alert reaches on-call channel | ☐ |
| F4 | Production logs accessible | Reachable by support | ☐ |

## Sign-off
- [ ] All A–F rows pass (or exceptions logged as accepted risks)
- [ ] No open Sev1/Sev2 Core HR defects
- [ ] Tester + HR/QA sign-off recorded in CAB pack
