# Vercel Production Deployment Gate / Release Governance

**Status:** Active · **Date:** 2026-06-20
**Applies to:** Vercel project serving http://localhost:3001 (current public **DEV/UAT-grade** domain).

> ⚠️ This gate governs publishing to the current **public DEV/UAT domain**. It is **not** a real-production environment and being on the `production` branch does **not** make a commit real-production-ready. See "Real production prerequisites" below.

## Why the gate was introduced

Previously, merging to `main` auto-published to the public Vercel domain. Because `main` is the integration branch (every merged PR lands there, including work that is DEV/UAT-grade only), this meant any merge could instantly change what the public domain serves — with no owner approval step between "merged" and "publicly visible." The gate decouples **integration** from **publication** so the owner explicitly controls what appears on the public domain.

## Branch model

| Branch | Role | Vercel behaviour |
|---|---|---|
| `main` | **Integration / DEV-UAT.** All merged PRs land here. | Builds **Preview** deployments. Does **not** update the public domain. |
| `production` | **Owner-approved public deployment branch.** Only advanced on explicit owner approval. | Vercel **Production Branch** = `production`. Advancing it triggers a Production deployment that the public domain is aliased to. |

- **Vercel Production Branch is set to `production`.**
- **Public DEV/UAT domain:** `avaniishcm.vercel.app`.
- **Current `production` branch commit:** **`c91ee18a`** (PR #15 navigation fix; published 2026-06-20, Production deployment state: success).
- The PR #15 Reports navigation fix was published to the public domain **through the `production` branch**, not by merging to `main`.

## Operating rules

- **Future `main` merges must not auto-update `avaniishcm.vercel.app`.** They produce Preview builds only.
- **The public domain updates only when the `production` branch moves.**
- Advancing `production` is an **owner-approved** action. The publish is performed by Git fast-forward of `production` to the approved commit; **Vercel's production-branch automation creates the deployment** — no manual `vercel` CLI deploy.
- Pre-publish, confirm: `main` is at the approved commit, the `production`→approved diff contains only the intended changes, CI on the approved commit passes, the diff has no schema/migration/package/env changes, and the working tree is clean.

## What this publish did and did NOT change

- ✅ Advanced `production` `03b8b411` → `c91ee18a` (fast-forward) and let Vercel automation deploy.
- ❌ **No Vercel env-var changes.** No Vercel settings changes.
- ❌ **No database changes.** No DB data writes.
- ❌ **No migrations run.** PR #14 + PR #15 introduced no migration files; no Neon migration required.
- ❌ No code changes during publish (published the already-merged `c91ee18a`).

## Real production prerequisites (NOT yet met)

Being on the `production` branch / public DEV/UAT domain is **not** real production. Real production still requires, at minimum:

- **Isolated production database** (separate from the current shared DEV/UAT Neon DB).
- **Dev/demo accounts disabled** (e.g. `super.admin@avaniis.dev`, `employee@avaniis.dev`, password login).
- **Separate secrets** per environment (encryption keys, `AUTH_SECRET`, Entra/Azure AD app registrations, etc.).
- **Production UAT sign-off** by the owner / Foundation Board.

Until these are met, the public domain is classified **DEV/UAT-grade** and must not be treated as carrying real production data or guarantees.

## Rollback model

- **To roll back a publish:** move the `production` branch back to the prior approved commit (e.g. `03b8b411`) and let Vercel redeploy, **or** use Vercel's built-in "Rollback / Promote previous deployment" in the dashboard.
- **Do NOT run a database rollback** for the PR #14 / PR #15 publish — **no migration or schema change occurred**, so there is nothing in the DB to revert. Rollback is purely a branch-pointer / Vercel-deployment operation.

## Related

- Feature & validation detail: [`docs/reports/EMPLOYEE-MOVEMENT-AND-HISTORY.md`](../reports/EMPLOYEE-MOVEMENT-AND-HISTORY.md)
- Environment governance: `docs/environment/environment-governance.md`
