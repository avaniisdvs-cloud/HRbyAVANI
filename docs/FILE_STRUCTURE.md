# FILE_STRUCTURE.md — Avaniis HR System

Generated: 2026-05-01 (Sprint 11 — Admin Redesign + MDM complete)

```
AVANIIS_HR_SYS/
│
├── app/                                  # Next.js 14 App Router pages & API routes
│   ├── (auth)/                           # Auth route group (no sidebar)
│   │   ├── layout.tsx                    # Auth shell layout (login carousel)
│   │   ├── sign-in/page.tsx              # Microsoft Entra SSO + dev credentials login
│   │   └── sign-out/page.tsx             # Sign-out handler
│   │
│   ├── (employee)/                       # Employee self-service route group
│   │   ├── layout.tsx                    # Employee shell layout
│   │   └── me/
│   │       ├── page.tsx                  # Employee profile / dashboard
│   │       ├── DsarDownloadButton.tsx    # GDPR DSAR export trigger
│   │       ├── aria/page.tsx             # Employee-facing ARIA chat
│   │       └── accommodations/
│   │           ├── page.tsx              # Reasonable accommodations list
│   │           └── AccommodationForm.tsx # New accommodation request form
│   │
│   ├── (hr-admin)/                       # HR Admin route group (full sidebar)
│   │   ├── layout.tsx                    # Admin shell layout with sidebar
│   │   ├── dashboard/page.tsx            # HR dashboard (headcount, alerts, KPIs)
│   │   ├── org-chart/page.tsx            # Interactive org chart
│   │   ├── aria/page.tsx                 # Admin-facing ARIA chat
│   │   │
│   │   ├── access/                       # Access control (Sprint 11A)
│   │   │   └── feature-permissions/
│   │   │       ├── page.tsx              # Feature permissions list page
│   │   │       └── _FeaturePermissionsClient.tsx  # Client — toggle feature access per role
│   │   │
│   │   ├── master-data/                  # Master Data Management hub (Sprint 11B)
│   │   │   ├── page.tsx                  # MDM hub — links to all 9 entities
│   │   │   ├── legal-entities/
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── LegalEntityActions.ts    # Server actions (create/update/disable)
│   │   │   │       ├── LegalEntityClient.tsx    # Data table + filter bar
│   │   │   │       └── LegalEntityDrawer.tsx    # Slide-over create/edit drawer
│   │   │   ├── departments/
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── DepartmentActions.ts
│   │   │   │       ├── DepartmentClient.tsx
│   │   │   │       └── DepartmentDrawer.tsx
│   │   │   ├── positions/
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── PositionActions.ts
│   │   │   │       ├── PositionClient.tsx
│   │   │   │       └── PositionDrawer.tsx
│   │   │   ├── grades/
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── GradeActions.ts
│   │   │   │       ├── GradeClient.tsx
│   │   │   │       └── GradeDrawer.tsx
│   │   │   ├── locations/
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── LocationActions.ts
│   │   │   │       ├── LocationClient.tsx
│   │   │   │       └── LocationDrawer.tsx
│   │   │   ├── work-schedules/
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── WorkScheduleActions.ts
│   │   │   │       ├── WorkScheduleClient.tsx
│   │   │   │       ├── WorkScheduleDrawer.tsx
│   │   │   │       └── DayHoursGrid.tsx         # Per-day hours grid sub-component
│   │   │   ├── holiday-calendars/
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── HolidayActions.ts
│   │   │   │       ├── HolidayCalendarGrid.tsx  # Month-grid calendar view
│   │   │   │       └── HolidayClient.tsx
│   │   │   ├── leave-types/
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── LeaveTypeActions.ts
│   │   │   │       ├── LeaveTypeClient.tsx
│   │   │   │       └── LeaveTypeDrawer.tsx
│   │   │   └── jobs/
│   │   │       ├── page.tsx
│   │   │       └── components/
│   │   │           ├── JobActions.ts
│   │   │           ├── JobClient.tsx
│   │   │           └── JobDrawer.tsx
│   │   │
│   │   ├── persons/                      # People management
│   │   │   ├── page.tsx                  # People list with filters
│   │   │   ├── PersonFilterBar.tsx       # Filter/search bar component
│   │   │   ├── new/
│   │   │   │   ├── page.tsx              # New person form page
│   │   │   │   └── PersonNewForm.tsx     # New hire form component (updated Sprint 11A)
│   │   │   └── [id]/
│   │   │       ├── page.tsx              # Person profile detail
│   │   │       ├── EmploymentActionDialogs.tsx  # Transfer/Promote/Suspend dialogs
│   │   │       ├── edit/
│   │   │       │   ├── page.tsx
│   │   │       │   └── PersonEditForm.tsx
│   │   │       ├── contracts/
│   │   │       │   ├── amend/            # Contract amendment flow
│   │   │       │   └── terminate/        # Contract termination flow
│   │   │       ├── bank-details/         # Encrypted bank account management
│   │   │       ├── dependents/           # Dependent records
│   │   │       └── documents/            # Document vault (Azure Blob)
│   │   │
│   │   ├── absence/                      # Leave management
│   │   │   ├── page.tsx                  # Leave requests list
│   │   │   ├── LeaveFilterBar.tsx        # Absence filter bar
│   │   │   ├── new/                      # New leave request
│   │   │   ├── [id]/                     # Leave request detail + approve/reject
│   │   │   ├── balances/                 # Leave balance report + CSV export
│   │   │   ├── calendar/                 # Absence calendar view
│   │   │   └── rules/                    # Leave rule editor UI
│   │   │
│   │   ├── workflows/                    # Workflow instance management
│   │   │   ├── page.tsx                  # Pending workflow tasks list
│   │   │   └── [instanceId]/
│   │   │       ├── page.tsx              # Workflow detail + Approve/Reject/Delegate
│   │   │       ├── WorkflowDecisionForm.tsx
│   │   │       └── history/page.tsx      # Audit trail for workflow
│   │   │
│   │   ├── users/                        # User account management
│   │   │   ├── page.tsx
│   │   │   └── new/
│   │   │       ├── page.tsx
│   │   │       └── _NewUserClient.tsx
│   │   │
│   │   └── settings/                     # System configuration
│   │       ├── page.tsx                  # Settings hub
│   │       ├── absence-types/            # Leave type definitions
│   │       ├── appearance/               # Theme / accent / density
│   │       ├── compliance/               # UAE Labour Law settings
│   │       ├── custom-fields/            # Dynamic field builder
│   │       ├── delegations/              # Approval delegation rules
│   │       ├── form-layout/              # Drag-and-drop form layout editor
│   │       ├── leave-rules/              # Accrual & policy rules
│   │       ├── notifications/            # Notification template editor
│   │       ├── policy/                   # HR policy settings
│   │       ├── work-schedules/           # Shift/schedule definitions
│   │       └── workflows/                # Workflow template CRUD
│   │
│   ├── api/
│   │   └── auth/[...nextauth]/route.ts   # Auth.js v5 catch-all route
│   │
│   ├── globals.css                       # Design tokens, theme vars, animations
│   ├── layout.tsx                        # Root layout (providers, toaster)
│   └── page.tsx                          # Root redirect (→ /dashboard or /sign-in)
│
├── components/                           # Shared React components
│   ├── aria/
│   │   └── AriaChatClient.tsx            # Streaming ARIA chat widget
│   ├── dashboard/
│   │   ├── AdminDashboard.tsx            # Admin KPI dashboard
│   │   ├── DeptBarRow.tsx                # Department bar chart row
│   │   ├── LeaveUtilCard.tsx             # Leave utilisation card
│   │   └── ManagerDashboard.tsx          # Manager-view dashboard
│   ├── employee/                         # Employee self-service components
│   │   ├── AtAGlanceStrip.tsx
│   │   ├── CompanyUpdatesCard.tsx
│   │   ├── EmployeeHero.tsx
│   │   ├── EmployeeSidebar.tsx
│   │   ├── EmployeeTopbar.tsx
│   │   ├── ExpiringDocsList.tsx
│   │   ├── LeaveBalanceBand.tsx
│   │   ├── LeaveRequestsTable.tsx
│   │   ├── RecentActivityCard.tsx
│   │   ├── TeamOutCard.tsx
│   │   └── UpcomingTimeOffCard.tsx
│   ├── forms/
│   │   ├── BilingualField.tsx            # EN/AR dual-input field
│   │   ├── HijriDatePicker.tsx           # Hijri ↔ Gregorian date picker
│   │   ├── LocaleSwitcher.tsx            # EN/AR language toggle
│   │   └── NationalitySelect.tsx         # Nationality dropdown (Sprint 11A) — 200+ countries
│   ├── layout/
│   │   ├── AdminSidebar.tsx              # Left nav sidebar — grouped nav (Sprint 11A redesign)
│   │   ├── AdminTopbar.tsx               # Client topbar for (hr-admin) shell — all 5 elements
│   │   ├── NotificationBell.tsx          # Server component bell wrapper
│   │   └── NotificationBellClient.tsx    # Client-side polling bell
│   ├── master-data/
│   │   └── MasterDataPage.tsx            # Shared MDM page shell (Sprint 11A)
│   ├── mdm/                              # Shared MDM UI components (Sprint 11B)
│   │   ├── AuditTrailRow.tsx             # Single row in MDM audit history
│   │   ├── ChangeReasonModal.tsx         # Required change-reason capture modal
│   │   ├── DisableConfirmDialog.tsx      # Disable / enable confirmation dialog
│   │   ├── HistoryDiffRow.tsx            # Field-level diff display
│   │   ├── HistoryEventCard.tsx          # History event card wrapper
│   │   ├── MdmChangeHistory.tsx          # Full change history panel
│   │   ├── MdmDrawer.tsx                 # Base slide-over drawer shell
│   │   ├── MdmFilterBar.tsx              # Shared filter bar (search + status)
│   │   ├── MdmPageHeader.tsx             # Page header with title + action button
│   │   ├── RecordHistoryDrawer.tsx       # Full history slide-over for a record
│   │   ├── StatusBadge.tsx               # Active / Inactive / Pending status pill
│   │   └── fieldLabels/                  # Field label config per entity
│   ├── settings/
│   │   └── PagePersonalizationCard.tsx   # Per-page personalisation settings
│   └── ui/                               # shadcn/ui primitives (Radix-based)
│       ├── DraftRestoreBanner.tsx         # Draft auto-save restore banner (Sprint 11A)
│       ├── SectionHeader.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── select.tsx
│       ├── table.tsx
│       ├── textarea.tsx
│       ├── toast.tsx
│       ├── toaster.tsx
│       └── tooltip.tsx
│
├── config/                               # Navigation & permission config (Sprint 11A)
│   ├── admin-nav.ts                      # Grouped sidebar nav for HR Admin role
│   └── manager-nav.ts                    # Grouped sidebar nav for Manager role
│
├── modules/                              # Domain business logic (server-only)
│   ├── absence/                          # Leave management module
│   │   ├── actions.ts                    # Server actions (create, approve, reject)
│   │   ├── services.ts                   # Business logic (balance engine, accruals)
│   │   ├── schema.ts                     # Zod validation schemas
│   │   ├── types.ts                      # TypeScript types
│   │   ├── validations.ts                # Zod input validators
│   │   └── index.ts                      # Public exports
│   ├── access/                           # Feature permissions module (Sprint 11A)
│   │   └── actions.ts                    # Server actions (getPermissions, setPermission)
│   ├── aria/                             # AI assistant module (Claude API)
│   ├── audit/                            # Immutable audit log module
│   ├── auth/                             # Authentication & session module
│   ├── compliance/                       # UAE Labour Law & GPSSA compliance
│   ├── config/                           # Tenant configuration module
│   │   ├── actions.ts                    # Config server actions (all MDM entities)
│   │   ├── actions/
│   │   │   └── page-personalization.ts   # Page personalisation sub-actions
│   │   ├── guards.ts                     # Config access guards
│   │   ├── index.ts                      # Public exports
│   │   └── schema.ts                     # Zod schemas for config inputs
│   ├── core-hr/                          # Core HR records module
│   │   ├── bank-details/                 # Encrypted bank account actions
│   │   ├── contracts/                    # Contract lifecycle (amend, terminate)
│   │   ├── dependents/                   # Dependent record management
│   │   ├── documents/                    # Document vault integration
│   │   ├── employment-actions/           # Transfer, promote, suspend, terminate
│   │   └── worker-assignments/           # Position assignments
│   ├── notification/                     # In-app notification module
│   ├── payroll/                          # Payroll integration stub
│   ├── timesheets/                       # Timesheet module stub
│   └── workflow/                         # Approval workflow engine (expanded Sprint 11A)
│
├── drizzle/                              # Database layer
│   ├── schema/
│   │   ├── index.ts                      # Schema barrel export
│   │   ├── foundation.ts                 # Core tables (persons, contracts, etc.)
│   │   ├── configuration.ts              # Config & settings tables (+ feature_permissions Sprint 11A)
│   │   └── transactions.ts               # Transactional tables (leave, workflows)
│   ├── migrations/                       # SQL migration files (0000–0012)
│   │   ├── 0000_outgoing_tusk.sql        # Foundation schema (30 tables)
│   │   ├── 0001–0011_*.sql               # Sprints 2–10 incremental migrations
│   │   ├── 0012_feature_permissions.sql  # Feature permissions table (Sprint 11A)
│   │   └── meta/                         # Drizzle migration metadata snapshots
│   └── seed.ts                           # Dev seed data script
│
├── lib/                                  # Shared utilities & cross-cutting services
│   ├── aria/
│   │   └── system-prompt.ts              # ARIA AI system prompt definition
│   ├── data/
│   │   └── countries.ts                  # 200+ country list for NationalitySelect (Sprint 11A)
│   ├── jobs/
│   │   ├── document-expiry-checker.ts    # Cron: document expiry notifications
│   │   ├── process-driver.ts             # Cron job process driver
│   │   └── sla-breach-checker.ts         # Cron: SLA breach detection
│   ├── absence-cert-policy.ts            # Medical certificate policy logic
│   ├── audit.ts                          # Audit logging helper
│   ├── auth.ts                           # Auth.js config & session helpers
│   ├── blob-storage.ts                   # Azure Blob Storage integration
│   ├── config-resolver.ts                # Tenant config resolution chain
│   ├── constants.ts                      # App-wide constants
│   ├── csv.ts                            # CSV generation utility
│   ├── date-utils.ts                     # Date helpers (Hijri, UAE weekends)
│   ├── db.ts                             # Drizzle/postgres db client
│   ├── effective-date.ts                 # Effective-date versioning logic
│   ├── encryption.ts                     # AES-256-GCM field encryption
│   ├── i18n-runtime.ts                   # i18n runtime (server-side)
│   ├── i18n.ts                           # i18n config
│   ├── leave-rule-resolver.ts            # Leave rule resolution engine
│   ├── locale-server.ts                  # Server-side locale detection
│   ├── mdm-audit.ts                      # MDM-specific audit write helper (Sprint 11B)
│   ├── person-form-helpers.ts            # Person form utilities (Sprint 11A)
│   ├── retention-policy.ts               # GDPR/data retention logic
│   └── utils.ts                          # cn() and misc helpers
│
├── hooks/                                # React hooks
│   ├── use-toast.ts                      # Toast hook (shadcn/ui)
│   ├── useDraftSave.ts                   # Auto-save draft to localStorage (Sprint 11A)
│   └── usePermissions.ts                 # Client-side feature permission resolver (Sprint 11A)
│
├── messages/                             # i18n translation files
│   ├── en.json                           # English translations
│   └── ar.json                           # Arabic translations
│
├── public/                               # Static assets
│   ├── avaniis_logo.svg              # Avaniis Avaniis brand logo
│   ├── avaniis_img1_office.jpg           # Login carousel — office photo
│   ├── avaniis_img2_pool.jpg             # Login carousel — pool photo
│   └── avaniis_img3_villa.jpg            # Login carousel — villa photo
│
├── tests/                                # Test suite
│   ├── accessibility/
│   │   └── wcag-static.test.ts           # Static WCAG accessibility checks
│   ├── e2e/
│   │   ├── accessibility.spec.ts         # Playwright WCAG E2E
│   │   └── persons.spec.ts               # Playwright E2E — persons flow
│   ├── integration/                      # Integration tests (hit real DB)
│   │   ├── absence-actions.test.ts
│   │   ├── absence-balance-engine.test.ts
│   │   ├── bank-dependents-documents.test.ts
│   │   ├── compliance-actions.test.ts
│   │   ├── config-actions.test.ts
│   │   ├── contracts-actions.test.ts
│   │   ├── core-hr-actions.test.ts
│   │   ├── document-expiry-checker.test.ts
│   │   ├── employment-actions.test.ts
│   │   ├── notification-actions.test.ts
│   │   ├── sla-breach-checker.test.ts
│   │   └── workflow-actions.test.ts
│   ├── lib/                              # Unit tests for lib utilities
│   │   ├── audit-immutability.test.ts
│   │   ├── audit.test.ts
│   │   ├── config-resolver.test.ts
│   │   ├── effective-date.test.ts
│   │   ├── encryption.test.ts
│   │   └── guards.test.ts
│   ├── performance/
│   │   ├── k6-load-test.js               # k6 load test script
│   │   └── nfr-performance.test.ts       # Non-functional performance tests
│   ├── security/
│   │   ├── auth-session.test.ts          # Auth session security tests
│   │   ├── mfa-enforcement.test.ts       # MFA enforcement tests
│   │   └── security-static.test.ts       # Static security checks
│   ├── unit/                             # Pure unit tests (no DB)
│   │   ├── absence-cert-policy.test.ts
│   │   ├── absence-services.test.ts
│   │   ├── core-hr-schemas.test.ts
│   │   ├── core-hr-services.test.ts
│   │   ├── csv.test.ts
│   │   ├── date-utils.test.ts
│   │   ├── gpssa.test.ts
│   │   ├── hijri-conversion.test.ts
│   │   ├── leave-rule-resolver.test.ts
│   │   ├── payroll-suspension.test.ts
│   │   └── person-form-helpers.test.ts   # Person form helper tests (Sprint 11A — 479 tests)
│   └── setup.ts                          # Vitest global test setup
│
├── docs/                                 # Project documentation
│   ├── prototypes/
│   │   └── LoginPage.html                # Static HTML login prototype
│   ├── DESIGN-STANDARD.md                # 11 Hard Rules, design tokens, component patterns
│   ├── DEPENDENCIES.md                   # External services & tools
│   ├── FILE_STRUCTURE.md                 # This file
│   ├── KNOWN_GAPS.md                     # Incomplete items & assumptions
│   ├── SETUP_GUIDE.md                    # Step-by-step run instructions
│   └── handoff-reference.md              # Full handoff reference for new developers
│
├── .github/
│   └── workflows/
│       └── ci.yml                        # GitHub Actions CI pipeline
│
├── .claude/
│   ├── launch.json                       # Claude Code launch config
│   └── settings.local.json               # Claude Code local settings
│
├── HRAuditlog.md                         # QA/QC audit log — all findings and resolutions
├── HRBacklog.md                          # Full product backlog
├── SPRINT_1_PROGRESS.md                  # Sprint progress tracker (all sprints)
│
├── .env.example                          # Environment variable template
├── .env.local                            # Local dev environment (DO NOT COMMIT)
├── .eslintrc.json                        # ESLint config
├── .gitignore                            # Git ignore rules
├── components.json                       # shadcn/ui config
├── docker-compose.yml                    # Local PostgreSQL via Docker
├── drizzle.config.ts                     # Drizzle ORM config
├── middleware.ts                         # Next.js middleware (role-aware routing — Sprint 11A)
├── next-env.d.ts                         # Next.js TypeScript declarations
├── next.config.mjs                       # Next.js config
├── package.json                          # NPM manifest (pnpm)
├── playwright.config.ts                  # Playwright E2E config
├── pnpm-lock.yaml                        # pnpm lockfile
├── postcss.config.mjs                    # PostCSS config
├── tailwind.config.ts                    # Tailwind CSS config
├── tsconfig.json                         # TypeScript config
├── tsconfig.tsbuildinfo                  # TS incremental build cache
└── vitest.config.ts                      # Vitest unit/integration test config
```
