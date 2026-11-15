# KNOWN_GAPS.md — Avaniis HR System

> ⚠️ **STALE DOCUMENT (flagged 2026-06-12).** Content below reflects 2026-05-01 (Sprint 11) and predates ~200 commits: Workflow Intelligence Phases A–D, Migration Factory V2, requirements baseline v1.0, Email Communication Platform, and the effective-dating remediation (Phases 1, 2A–2D). For current gaps use: `docs/qa-qc/00-MASTER-QA-QC-REPORT.md` §7 + `docs/qa-qc/revalidation-2026-06-12.md` (defects), `docs/project-memory/2026-06-04/19-EFFECTIVE-DATING-AUDIT.md` §9 (effective dating), `docs/OPEN-POINTS.md` (deferrals), `CHANGELOG.md` (what shipped).

Last updated: 2026-05-01 (Sprint 11 — Admin Redesign + MDM complete)

---

## Sprint Status

### Sprint 11B — Master Data Management (COMPLETE as of 2026-05-01)

All 9 MDM entities built with full CRUD:
- **Legal Entities, Departments, Positions, Grades, Locations** — full server actions, data table, slide-over drawer, change-reason modal, disable/enable, audit history
- **Work Schedules** — full CRUD + `DayHoursGrid` per-day hours editor
- **Holiday Calendars** — full CRUD + `HolidayCalendarGrid` month-view
- **Leave Types** — full CRUD with UAE Labour Law type restrictions
- **Jobs** — full CRUD with Emiratisation targeting + management role flag
- **Shared MDM component library** — 11 reusable components in `components/mdm/`
- **MDM audit lib** — `lib/mdm-audit.ts` writes change history on every mutation
- **BR guards enforced** — BR-LE, BR-DEPT, BR-POS, BR-GRADE, BR-LOC, BR-WH, BR-LV, BR-JOB series

### Sprint 11A — Admin Panel Redesign (COMPLETE as of 2026-05-01)

- **Grouped sidebar nav** — `config/admin-nav.ts` + `config/manager-nav.ts` replace inline nav; sections: People, Absence, Workflows, Master Data, Access, Settings
- **Feature Permissions** — `app/(hr-admin)/access/feature-permissions/` — toggle per-role feature access; `drizzle/migrations/0012_feature_permissions.sql`; `modules/access/actions.ts`
- **NationalitySelect** — `components/forms/NationalitySelect.tsx` + `lib/data/countries.ts` (200+ countries) replacing plain text input
- **DraftRestoreBanner + useDraftSave** — auto-save form drafts to localStorage with restore prompt on return
- **usePermissions hook** — client-side feature permission resolver
- **Person form helpers** — `lib/person-form-helpers.ts` with 479 unit tests
- **Workflow engine expansion** — `modules/workflow/actions.ts` fully wired step/delegate/approve/reject engine
- **Role-aware middleware** — `middleware.ts` rewritten with RBAC routing guards

### Sprint 2 — Design System (COMPLETE as of 2026-04-29)

All UI pages have been updated to the AVANIIS design system:
- **PILL_TONES status badges** applied consistently across all modules (Absence, Workflows, Org Chart, Settings, Employee Self-Service)
- **Badge component eliminated** — replaced with inline `<span>` tokens throughout; `Badge` import removed from all pages
- **lucide-react icons** — all inline SVG icons replaced; `Eye/EyeOff/Moon/Sun` on login, `Network/Flag/Users` on org chart, `BarChart3/Download/CalendarDays` on absence, `GitBranch/AlertTriangle/Check/X/ArrowRight` on workflows, etc.
- **next/image avatar** — person profile page renders photo from `person.extraData.photoUrl` (jsonb field) with initials fallback
- **Appearance settings** — `settings/appearance/page.tsx` allows per-tenant accent theme, dark mode, and density; SSR hydration applies `data-accent`, `data-dark`, `data-density` to `<body>` via `app/layout.tsx`
- **Design token compliance** — all raw hex removed from `globals.css`; `text-primary-foreground` replaced with `text-white`; scrollbar colours use design tokens
- **Tailwind safelist** — dynamic accent classes protected from purge in `tailwind.config.ts`
- **Full QA/QC audit passed** — Hard Rules 1–7 verified across all 24 modified files

### Sprint 1 — Foundation (COMPLETE)

Foundation, data layer, core HR, and initial UI are built. All module scaffolding is in place.

---

## Ongoing Gaps

This snapshot was taken at the end of Sprint 11 (2026-05-01). The system is in a
**development stage approaching MVP** — foundation, data layer, core HR, design system,
ARIA, absence management, workflow engine, all 9 MDM entities, and admin navigation are
complete. The remaining gaps are primarily payroll calculation, E2E test expansion,
email delivery, and production hardening.

---

## 1. Incomplete / Stub Modules

### Payroll (`modules/payroll/`)
- Schema, types, validations and service stubs are defined.
- **No actual payroll calculation engine** exists yet.
- Integration with external payroll providers (e.g. SAP, ADP) is not implemented.
- Payroll-suspension-on-leave logic is modelled but not fully wired.

### Timesheets (`modules/timesheets/`)
- Module skeleton exists (schema, types, services, validations).
- **No timesheet entry UI** has been built.
- Timesheet approval workflow is not connected.

### GPSSA / UAE Pension
- Compliance calculations for GPSSA (UAE pension scheme) are partially modelled.
- Full contribution calculation and submission reporting is not implemented.
- `tests/unit/gpssa.test.ts` covers the core formula but the production path is incomplete.

---

## 2. Authentication

- **Microsoft Entra SSO** is configured in code but requires an Azure App Registration
  to be set up with real credentials before it works in production.
- The **dev credentials provider** (`DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD`) must be
  disabled or removed before deploying to production.
- Role-based access control (RBAC) beyond the basic HR-admin / employee split is not yet
  fully enforced across all pages.

---

## 3. Document Vault

- Azure Blob Storage integration (`lib/blob-storage.ts`) is implemented.
- **Local dev fallback** (disk storage) is not implemented — document upload/download
  requires valid Azure credentials even in development.
- Virus scanning / content moderation on uploaded documents is not implemented.

---

## 4. Notifications

- In-app notification system is built.
- **Email delivery** is not connected — there is no SMTP/SendGrid integration.
  `modules/notification/services.ts` writes to the DB but does not send emails.

---

## 5. Org Chart

- `app/(hr-admin)/org-chart/page.tsx` exists.
- The interactive tree visualisation depends on a hierarchy query that needs further
  testing with large datasets.
- No export (PDF/PNG) of the org chart is implemented.

---

## 6. Form Layout Editor

- `app/(hr-admin)/settings/form-layout/FormLayoutEditor.tsx` is built as a UI component.
- Drag-and-drop reordering persistence to the database (`form_configurations` table)
  needs end-to-end verification.

---

## 7. Work Schedules & Delegations

- Work schedules now have full CRUD via the MDM module (Sprint 11B).
- The delegation resolution path in the workflow engine has basic coverage;
  complex multi-level delegation chains are not fully tested.

## 7b. MDM — Remaining Gaps (Post Sprint 11)

- **Seed data not linked to MDM UI** — `drizzle/seed.ts` seeds reference data directly;
  it has not been updated to use the new MDM server actions. New admin-created entities
  are stored correctly but the seed script bypasses business rule guards.
- **RTL layout QA on MDM pages** — Arabic `dir="rtl"` is configured but MDM pages
  (`master-data/*`) have not been visually QA'd in Arabic mode.
- **Soft-delete cascade** — when a Legal Entity is disabled, its child Departments and
  Positions are not automatically disabled. Cascade disable is a Phase 2 item.
- **Grade salary ranges not in MDM** — the `grade_salary_ranges` table (effective-dated
  min/mid/max per grade) has no admin UI; grade ranges are managed via seed data only.
- **Holiday Calendar — Eid estimate handling** — the system stores `is_confirmed = false`
  for estimated Eid dates but there is no notification flow to remind HR to confirm dates
  once officially announced.

---

## 8. i18n Coverage

- English (`messages/en.json`) is well-populated.
- Arabic (`messages/ar.json`) has partial translations — some keys may fall back to English.
- RTL layout is configured via `dir="rtl"` but has not been visually QA'd across all pages.

---

## 9. Tests

- Unit and integration tests cover core business logic well.
- **E2E coverage** (`tests/e2e/`) is minimal — only `persons.spec.ts` exists.
- No visual regression tests.
- Integration tests require a live database; they are not run in CI without a test DB.

---

## 10. CI/CD

- `.github/workflows/ci.yml` defines a GitHub Actions pipeline.
- The pipeline runs lint and type-check but **integration tests are skipped** in CI
  because no test database service is configured.
- No deployment pipeline (CD) is set up yet.

---

## 11. Security Hardening (Pre-Production Checklist)

- [ ] Remove `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` credentials provider
- [ ] Rotate `AUTH_SECRET` and `ENCRYPTION_KEY` for production
- [ ] Enable Content Security Policy headers in `next.config.mjs`
- [ ] Set `secure: true` on session cookies (requires HTTPS)
- [ ] Enable Azure Storage private endpoints (no public access)
- [ ] Add rate limiting to auth endpoints
- [ ] Review and tighten RBAC guards on all server actions

---

## 12. Assumptions Made During Development

- UAE Labour Law rules (annual leave accrual, sick leave limits, etc.) are implemented
  based on Federal Law No. 33 of 2021 as understood at time of development.
  Legal review before production deployment is recommended.
- Hijri calendar conversion uses `@internationalized/date` library — accuracy should be
  validated against official UAE calendar authority outputs for critical date calculations.
- The ARIA AI assistant uses the Anthropic Claude API. Response quality depends on the
  system prompt in `lib/aria/system-prompt.ts` and may require tuning.
- Data retention policies in `lib/retention-policy.ts` are based on assumed regulatory
  requirements. Actual requirements must be confirmed with legal counsel.
