# Avaniis HR local preview

This local working copy uses the exact official AVANIIS logo and canonical company spelling. The approved UI/UX rollout applies shared typography, the Premium Hybrid palette, consistent scrollbars, responsive navigation and accessibility improvements. Existing HR data and role checks are preserved. See `AVANIIS-UIUX-ASSESSMENT.md` for the implementation log and verification limits.

## Open the application

Run `pnpm build` followed by `pnpm preview:stable` from the project folder, then open
[Avaniis HR](http://localhost:3001).

The command checks the local database and starts the already-provisioned local
PostgreSQL instance if needed. No Vercel or GitHub connection is needed for this
preview. Stop the web server with Ctrl+C. Data remains on disk between sessions.

## Six synthetic employees

All six local preview accounts use password `demo`.

| Account | Name | Role |
| --- | --- | --- |
| super.admin@avaniis.dev | Alex Morgan | Super Admin |
| hr.admin@avaniis.dev | Sara Ahmed | HR Admin |
| payroll@avaniis.dev | Omar Hassan | Payroll Admin |
| manager@avaniis.dev | Maya Patel | Manager |
| employee@avaniis.dev | Adam Wilson | Employee |
| employee.two@avaniis.dev | Lina Ali | Employee |

Adam and Lina report to Maya. Each account maps to its own employee and the same
Avaniis entity. Each employee has a current assignment, salary element, payroll
assignment, work schedule, leave-plan enrolment, and annual/sick leave balances.
The small seed also configures manager approval workflows for leave submission.
There are six employee records; supporting configuration and transaction tables
contain additional rows needed by the application.

The preview seed is restricted to a local development database. It refuses to run
if employee IDs outside this synthetic dataset exist. `pnpm db:seed:preview` can
repair missing preview rows without clearing existing records or leave activity.
It expects the base reference data in `drizzle/seed.ts` to exist first.

## Database and private settings

No database dump or usable previous connection was supplied with the source ZIP.
No existing remote database has been read, reset, or modified. This preview uses
an isolated PostgreSQL 16 database on loopback port 55432. Private connection and
encryption settings are stored in the ignored `.env.local` file with restricted
permissions. The data directory is outside the repository at
`~/.local/share/avaniis/database`.

The current schema was created from the Drizzle definitions on an empty database.
Existing supporting SQL was then applied for workflow detail views, workflow
snapshot columns, effective-date constraints, identity uniqueness indexes, and
append-only audit triggers. `pnpm db:prepare:preview` records these in a local
checksum ledger and can safely skip already-applied SQL.
The historical migration journal is incomplete; do not initialize a fresh system
with `db:migrate` alone, and do not run schema push against existing customer data.
Historical migration files remain for reference. Their text and branded identifiers
have changed during rebranding, so do not replay them against a historical database
without a reviewed migration plan and backup.

Payroll is enabled in the local `.env.local` for validation. Default deployment
flags remain off. Demo credentials remain unavailable when `DATABASE_ENV=production`.
Email delivery is disabled. Microsoft SSO, AI provider calls, email providers, and
cloud storage integrations need credentials for the new environment before they
can be validated. Local document storage is for the preview only.

## Source and hosting

The configured Git remote is the user's Avaniis repository. The connected GitHub
integration currently exposes no repositories. The Vercel integration requires a
team-access grant before project inspection and linking can proceed. No remote
push, Vercel project creation, deployment, or customer data migration was performed.
Historical release/certification documents are inherited reference material;
they do not certify this rebranded working copy or establish a live deployment.

Obsolete branded slide artifacts and original logo assets were moved outside the
project into `~/.local/share/avaniis/source-assets`. They are not served or packaged
with the application. The original downloaded ZIP is also unchanged.

## Validation commands

```bash
pnpm typecheck
pnpm test
pnpm audit:branding
pnpm build
```

The branding audit scans all project-owned files and nested ZIP contents, excluding
dependencies, generated build output, test reports, screenshots, and Git internals.
The active raster assets were inspected separately. Generated output is rebuilt
from the updated source. Browser evidence is kept locally under `evidence/avaniis/`.
