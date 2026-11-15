# AVANIIS HR — Employee Profile Enhancement Blueprint
# Task 2A: Inventory, Gap Analysis & Implementation Design

> **Status:** PLANNING ONLY — No code or migrations created.  
> **Date:** 2026-05-25  
> **Scope:** Tasks 2B–2G implementation design for HR Admin approval before any code changes.  
> **Agents run:** Schema Inventory, HR Admin Forms, ESS Profile + Navigation, Employee Photo, Working Calendar, Manager Hierarchy, Data Migration Risk, Testing Strategy (8 parallel agents)

---

## Executive Summary

8 child agents completed a full codebase inventory across schema, forms, navigation, photo infrastructure, working calendar, manager hierarchy, migration history, and test coverage.

**Top-line findings:**

| Category | Fields requested | Already in DB | In UI already | Needs migration | Needs UI only |
|---|---|---|---|---|---|
| Personal tab | 5 | 4 | 1 (religion) | 1 (blood_type) | 3 (emergency rel., home addr., qualification) |
| Employment tab | 7 | 5 partial | 2 (job, create-only type) | 2 (employee_code, worker_category) | 5 (edit form, ESS display) |
| Working calendar | 3 | 2 (schedules + override) | 0 | 0 | 3 (auto-assign, UI link, edit form) |
| Employee photo | 1 | 1 (schema + action exist) | 1 (HR profile only) | 0 | 4 surfaces missing |
| Navigation | 2 items to reorder | N/A | N/A | 0 | 1 file, 2 line changes |

**Required DB migrations:** 2 new columns on `persons` (blood_type, worker_category), 1 new column (probation_months_granted), 1 new column (employee_code). No new tables. No FK risks beyond self-referential (proven pattern).

---

## Phase 1 — Full Inventory Results

### 1.1 Persons Table — Column Inventory

**File:** `drizzle/schema/foundation.ts` lines 154–293

| Column | Type | Nullable | Relevant to requirement |
|---|---|---|---|
| person_number | varchar(30) UNIQUE | NO | Employee number (auto-generated, not manual) |
| religion | varchar(50) | YES | ✅ Present |
| religion_consent_given | boolean | NO default false | ✅ Present |
| employment_type | varchar(30) | NO | Partial — FULL_TIME/PART_TIME/TEMPORARY/TASK_BASED/FLEXIBLE/REMOTE/SHARED (not FTE/Contingent/Contractor) |
| contracted_hours_per_week | numeric(5,2) | NO default 48 | ✅ Present |
| hire_date | date | NO | ✅ Present |
| probation_end_date | date | YES | ✅ Present (end date only) |
| probation_status | varchar(20) | YES default ACTIVE | ✅ Present |
| notice_period_days | integer | NO default 30 | ✅ Present (days; display as months in UI) |
| line_manager_id | uuid FK persons | YES | ✅ Present |
| dotted_line_manager_id | uuid FK persons | YES | ✅ Present — IS the functional manager (not exposed in UI) |
| hr_representative_id | uuid FK persons | YES | ✅ Present (not in UI) |
| current_job_id | uuid FK jobs | YES | ✅ Present |
| current_position_id | uuid FK positions | YES | ✅ Present |
| profile_photo_url | varchar(500) | YES | ✅ Present (Azure Blob SAS URL) |
| assignment_status | varchar(30) | NO default ACTIVE | ✅ Present |
| separation_date | date | YES | ✅ Present |
| separation_reason | varchar(100) | YES | ✅ Present |
| pdpl_consent_given | boolean | NO default false | ✅ Present |
| sensitive_data_consent | boolean | NO default false | ✅ Present (gates religion, health data) |
| extra_data | jsonb | NO default {} | Custom fields bag |
| **blood_type** | — | — | ❌ MISSING — requires migration |
| **worker_category** | — | — | ❌ MISSING — FTE/Contingent/Contractor requires migration |
| **employee_code** | — | — | ❌ MISSING — manual code separate from personNumber |
| **probation_months_granted** | — | — | ❌ MISSING — duration not persisted (only end date) |

### 1.2 Person Detail Tables

| Table | File | Relevant columns | UI status |
|---|---|---|---|
| `person_emergency_contacts` | foundation.ts:588–605 | `relationship varchar(50) NOT NULL`, contactNameEn, phonePrimary, priorityOrder | ❌ NOT in create or edit form |
| `person_addresses` | foundation.ts:440–460 | `address_type varchar(30)` (UAE_CURRENT, UAE_PERMANENT, **HOME_COUNTRY**, MAILING), addressLine1, city, country | ❌ NOT in create or edit form |
| `person_education` | foundation.ts:607–621 | `is_highest_degree boolean default false`, degreeType, fieldOfStudy, institutionName, graduationYear | ❌ NOT in create or edit form |

### 1.3 Worker Assignments Table

**File:** `drizzle/schema/foundation.ts` lines 681–739

| Column | Status for requirements |
|---|---|
| line_manager_id | ✅ Present |
| dotted_line_manager_id | ✅ Present (functional manager semantic) |
| employment_type | ✅ Present (mirrors persons) |
| work_schedule_id | ✅ FK to work_schedules — employee-level override |
| contracted_hours_per_week | ✅ Per-assignment hours |
| is_acting | ✅ Acting assignment flag |
| project_id | ✅ Added in migration 0038 |

### 1.4 Working Calendar Infrastructure

**Work Schedules** (`drizzle/schema/configuration.ts` lines 156–202):
- ✅ `monday_start` through `sunday_end` (HH:MM per-day times, nullable = non-working day)
- ✅ `weekend_days int[]` (default [5,6] = Fri+Sat UAE standard)
- ✅ `total_hours_per_week`, `break_minutes`
- ✅ `is_ramadan_schedule`, `ramadan_hours_per_day`
- ✅ `is_default boolean` — marks entity's default schedule
- ✅ `legal_entity_id` — entity-scoped schedules
- ✅ Full MDM UI exists at `app/(hr-admin)/master-data/work-schedules/`

**Schedule Assignments** (`drizzle/schema/foundation.ts` lines 945–963):
- ✅ `work_schedule_assignments` table with date-effective history
- ✅ `work_schedule_id FK`, `person_id FK`, `effective_start_date`, `is_current`, `assigned_by`

**Gaps for working calendar requirement:**
- ❌ No auto-assignment of new hires to entity's default work schedule (application logic missing)
- ❌ No UI to set/view employee's current work schedule in PersonEditForm
- ❌ Legal entity MDM page does not show/link its default work schedule
- ❌ PersonNewForm does not assign schedule at hire time

### 1.5 Employee Photo Infrastructure

| Component | File | Status |
|---|---|---|
| Schema column | `drizzle/schema/foundation.ts` line 291 | ✅ `profile_photo_url varchar(500)` |
| Server action | `modules/core-hr/photo-upload.ts` | ✅ `uploadProfilePhoto()`, 2MB limit, 4 MIME types, role-gated |
| Upload widget | `app/(hr-admin)/persons/[id]/PhotoUploadWidget.tsx` | ✅ Exists but HR admin profile page only |
| Azure Blob client | `lib/blob-storage.ts` | ✅ Full upload/SAS URL/delete; dev fallback to public/uploads/ |
| HR profile display | `app/(hr-admin)/persons/[id]/page.tsx` lines 213–236 | ✅ Shows photo with InitialsAvatar fallback |
| Org chart display | `components/org-chart/EmployeeNode.tsx` lines 85–97 | ✅ Shows photo with InitialsAvatar fallback |
| ESS profile display | `app/(employee)/me/ProfilePageClient.tsx` | ❌ NO photo displayed |
| Top menu avatar | `components/employee/EmployeeTopbar.tsx` lines 361–367 | ❌ Initials only (no photo) |
| Left sidebar | `components/employee/EmployeeSidebar.tsx` | ❌ No avatar at all |
| Employee create form | `app/(hr-admin)/persons/new/PersonNewForm.tsx` | ❌ No photo upload in create flow |
| Employee edit form | `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx` | ❌ No photo upload widget |
| Avatar fallback | `components/org-chart/InitialsAvatar.tsx` | ✅ Initials + accent badge (reusable) |

### 1.6 Navigation Inventory

**File:** `components/employee/EmployeeSidebar.tsx` lines 8–19

Current order:
1. `/me` — Home
2. `/org-chart` — Organisation Chart  ← **must move to end**
3. `/absence/my` — My Leave
4. `/me/timesheet` — Timesheet
5. `/me/insurance` — My Insurance
6. `/me/documents` — My Documents
7. `/me/letters` — My Letters
8. `/me/directory` — Directory
9. `/me/profile` — My Profile  ← **must move to position 2**
10. `/me/aria` — ARIA

Required order:
1. `/me` — Home
2. `/me/profile` — My Profile ← **moved up**
3. `/absence/my` — My Leave
4. `/me/timesheet` — Timesheet
5. `/me/insurance` — My Insurance
6. `/me/documents` — My Documents
7. `/me/letters` — My Letters
8. `/me/directory` — Directory
9. `/me/aria` — ARIA
10. `/org-chart` — Organisation Chart ← **moved to end**

**Top menu profile:** `components/topbar/ProfileMenu.tsx` — "My Profile" link navigates to `/me/profile` for employees. ✅ Existing access preserved.

### 1.7 Form Coverage Summary

| Field | Create Form | Edit Form | ESS Profile |
|---|---|---|---|
| religion | ✅ | ✅ | ✅ (read-only with consent) |
| religionConsentGiven | ✅ | ✅ | — |
| emergencyContact (name, phone) | ❌ | ❌ | ✅ editable (name+phone only) |
| emergencyContact relationship | ❌ | ❌ | ❌ |
| homeAddress | ❌ | ❌ | ❌ |
| qualification/degree | ❌ | ❌ | ❌ |
| bloodType | ❌ | ❌ | ❌ |
| employmentType | ✅ | ❌ | ✅ (read-only) |
| job | ✅ | ✅ | ✅ (read-only) |
| employeeCode | ❌ | ❌ | ❌ |
| workerCategory (FTE/Contractor) | ❌ | ❌ | ❌ |
| lineManagerId | ✅ | ✅ | ✅ (read-only) |
| dottedLineManagerId (functional) | ❌ | ❌ | ❌ |
| probationEndDate | auto-calc | ❌ | ✅ (read-only) |
| probationMonthsGranted | drives calc, not stored | ❌ | ❌ |
| noticePeriodDays | ✅ | ❌ | ✅ (read-only, days) |
| profilePhotoUrl | ❌ | ❌ | ❌ |
| workScheduleId (override) | ❌ | ❌ | ❌ |

### 1.8 ESS Profile Page

**File:** `app/(employee)/me/profile/page.tsx` → renders `app/(employee)/me/ProfilePageClient.tsx`

**5 tabs:** Personal · Employment · Leave · Documents · Activity

**Personal tab fields (current):**
- Read-only: fullNameEn, fullNameAr, DOB, gender, nationality, maritalStatus, religion (if consent)
- Editable: mobileNumber, personalEmail, emergencyContactName, emergencyContactPhone

**Employment tab fields (current):**
- personNumber, entity, department, position, grade, hireDate, tenure, employmentType, workLocation, lineManager

**Missing from ESS profile:**
- No photo in profile header
- Emergency contact relationship not shown or editable
- No home address tab/section
- No qualification/degree section
- No bloodType field
- No workerCategory (FTE/Contractor) field
- No functionalManagerId display
- No probationMonthsGranted display
- No workSchedule display

---

## Phase 2 — Gap Analysis

### 2.1 Master Gap Table

| Field | DB Status | UI Status | Storage Location | Migration? | Create Form | Edit Form | ESS | Risk |
|---|---|---|---|---|---|---|---|---|
| **Emergency Relationship** | ✅ DB exists (person_emergency_contacts.relationship) | ❌ Not in any form | person_emergency_contacts | None | Add | Add | Expose in ESS edit | LOW |
| **Home Address** | ✅ DB exists (person_addresses, type=HOME_COUNTRY) | ❌ Not in any form | person_addresses | None | Add | Add | Add display + edit | LOW |
| **Highest Degree / Qualification** | ✅ DB exists (person_education, is_highest_degree) | ❌ Not in any form | person_education | None | Add | Add | Add display | LOW |
| **Religion** | ✅ DB exists, UI exposed | ✅ Create + Edit + ESS | persons.religion | None | ✅ Done | ✅ Done | ✅ Done | NONE |
| **Blood Type** | ❌ Missing | ❌ | persons | ADD COLUMN | Add | Add | Add | LOW |
| **Employee Type (FTE/Contingent/Contractor)** | ❌ Missing as category | ❌ | persons | ADD COLUMN worker_category | Add | Add | Add | LOW |
| **Job field** | ✅ DB + forms | ✅ Create + Edit + ESS | persons.current_job_id, jobs table | None | ✅ Done | ✅ Done | ✅ Done | NONE |
| **Employee Code** | ❌ Missing | ❌ | persons | ADD COLUMN employee_code | Add | Add | Add + searchable | MEDIUM |
| **Functional Manager** | ✅ DB (dotted_line_manager_id) | ❌ Not in forms | persons.dotted_line_manager_id | None | Add (relabel) | Add (relabel) | Add display | LOW |
| **Probation Period Duration** | ❌ Duration not stored (only end date) | ✅ Create (drives calc) not persisted | persons | ADD COLUMN probation_months_granted | Store value | Show read-only | Show | LOW |
| **Probation End Date** | ✅ DB | ✅ HR profile read-only | persons.probation_end_date | None | Auto-calc | Show read-only | Show | NONE |
| **Notice Period** | ✅ DB (days) | ✅ Create, ❌ Edit | persons.notice_period_days | None | ✅ Done | Add | Show (months) | LOW |
| **Employee Photo** | ✅ DB + server action | ✅ HR admin profile only | persons.profile_photo_url | None | Add widget | Add widget | Add header display | MEDIUM |
| **Photo in top menu** | N/A | ❌ Initials only | persons.profile_photo_url | None | — | — | Fetch + display | LOW |
| **Photo in left menu** | N/A | ❌ None | persons.profile_photo_url | None | — | — | Fetch + display | LOW |
| **Photo fallback avatar** | N/A | ✅ InitialsAvatar (org chart) | N/A | None | Reuse | Reuse | Reuse | NONE |
| **Entity-level working hours** | ✅ work_schedules (is_default per entity) | ❌ Not linked in entity MDM | work_schedules | None | — | — | — | LOW |
| **Employees inherit entity schedule** | ❌ No auto-assign logic | ❌ | worker_assignments.work_schedule_id | None | Add logic | — | — | MEDIUM |
| **HR Override per employee** | ✅ worker_assignments.work_schedule_id | ❌ Not in edit form | worker_assignments | None | Add | Add | Show | LOW |
| **Navigation: My Profile to 2nd** | N/A | ❌ Currently 9th | EmployeeSidebar.tsx | None | — | — | 1 file | LOW |
| **Navigation: Org Chart to end** | N/A | ❌ Currently 2nd | EmployeeSidebar.tsx | None | — | — | 1 file | LOW |

### 2.2 Fields Classified by Required Migration

**No migration needed (use existing schema):**
- Emergency relationship (use person_emergency_contacts.relationship)
- Home address (use person_addresses with address_type=HOME_COUNTRY)
- Highest degree (use person_education.is_highest_degree + degreeType)
- Religion (already in persons + forms)
- Functional manager (use persons.dotted_line_manager_id, relabel)
- Probation end date (already in persons)
- Notice period (already in persons.notice_period_days, show in months)
- Employee photo (column + upload action already exist)
- Entity working hours (use work_schedules.is_default)
- Employee schedule override (use worker_assignments.work_schedule_id)

**Migrations required — priority order:**

| Migration | Columns | Table | Nullable | Default | Risk |
|---|---|---|---|---|---|
| 0043 | blood_type varchar(10) | persons | YES | NULL | LOW |
| 0043 | worker_category varchar(20) | persons | YES | NULL | LOW |
| 0043 | employee_code varchar(50) | persons | YES | NULL | LOW |
| 0043 | probation_months_granted integer | persons | YES | NULL | LOW |

All 4 in a single migration 0043. All nullable, no defaults, no FKs, no uniqueness constraints initially. Zero seed data impact.

---

## Phase 3 — Implementation Blueprint

### Task 2B — Personal Fields

**Scope:** Blood type, employee code (personal identifier), home address display, emergency contact relationship, highest degree display in ESS.

**Schema changes (migration 0043):**
```sql
ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "blood_type" varchar(10),
  ADD COLUMN IF NOT EXISTS "worker_category" varchar(20),
  ADD COLUMN IF NOT EXISTS "employee_code" varchar(50),
  ADD COLUMN IF NOT EXISTS "probation_months_granted" integer;

-- Optional: unique index for employee_code (deferred to after business clarification)
-- CREATE UNIQUE INDEX IF NOT EXISTS persons_employee_code_unique
--   ON persons (tenant_id, legal_entity_id, employee_code)
--   WHERE employee_code IS NOT NULL;

COMMENT ON COLUMN persons.blood_type IS 'Blood type (A+, A-, B+, B-, AB+, AB-, O+, O-). Medical info — nullable.';
COMMENT ON COLUMN persons.worker_category IS 'Workforce category: FTE | CONTINGENT | CONTRACTOR. Distinct from employment_type (schedule arrangement).';
COMMENT ON COLUMN persons.employee_code IS 'Manual HR-assigned code. Optional, separate from auto-generated person_number.';
COMMENT ON COLUMN persons.probation_months_granted IS 'Duration in months at time of hire (1–6). Stored separately from probation_end_date.';
```

**Validation schema updates:**
- File: `modules/core-hr/validations.ts`
- Add to `PersonIdentity`: `bloodType: z.string().max(10).nullable().optional()`
- Add to `PersonIdentity`: `workerCategory: z.enum(['FTE','CONTINGENT','CONTRACTOR']).nullable().optional()`
- Add to `PersonEmployment`: `employeeCode: z.string().max(50).nullable().optional()`
- Add to `PersonEmployment`: `probationMonthsGranted: z.number().int().min(1).max(6).nullable().optional()`

**Server action updates:**
- File: `modules/core-hr/actions.ts` — `createPerson()` and `updatePerson()`
- Add blood_type, worker_category, employee_code, probation_months_granted to write paths

**HR Admin Create Form (PersonNewForm.tsx):**
- Step 0 — Personal: Add Blood Type select (A+, A-, B+, B-, AB+, AB-, O+, O-)
- Step 0 — Personal: Add Worker Category select (FTE, Contingent, Contractor)
- Step 1 — Employment: Add Employee Code text input (manual, optional)
- Step 1 — Employment: Capture probationMonths → also store as probationMonthsGranted in DB

**HR Admin Edit Form (PersonEditForm.tsx):**
- Personal section: Add Blood Type select
- Personal section: Add Worker Category select
- Employment section: Add Employee Code text input
- Employment section: Show Probation Duration (read-only from probation_months_granted)
- Employment section: Add Notice Period (days → show as months, editable) — updatePerson already supports this via patch schema

**ESS Profile (ProfilePageClient.tsx):**
- Personal tab: Add Blood Type display (if consent given + PDPL rules)
- Employment tab: Add Worker Category display
- Employment tab: Add Employee Code display
- Employment tab: Add Probation Duration + Probation End Date display

**Emergency Contact (existing separate table — person_emergency_contacts):**
- ESS Profile: Expose `relationship` field in emergency contact section (editable via `updateMyProfile`)
- HR Admin Edit: Add emergency contact management section (CRUD: add/edit/delete contacts with relationship field)
- HR Admin Create: Add emergency contact step (optional, relationship + name + phone required)
- Server action: Extend `updateMyProfile` in `modules/profile/actions.ts` to update relationship field

**Home Address (existing person_addresses table):**
- HR Admin Edit: Add Address section with address_type picker (UAE_CURRENT, HOME_COUNTRY, etc.)
- ESS Profile: Show addresses in Personal tab (read-only; editable for own address)
- Server action: `modules/core-hr/actions.ts` — add `updatePersonAddress()` for HR, extend `updateMyProfile` for self

**Qualification / Education (existing person_education table):**
- HR Admin Edit: Add Education section (institution, degree_type, field_of_study, graduation_year, is_highest_degree)
- ESS Profile: Show highest degree in Personal tab (read-only)
- Server action: `modules/core-hr/actions.ts` — add `savePersonEducation()`

**Tests required (Task 2B):**
- Unit: blood_type enum validation; worker_category enum validation; employee_code max length
- Unit: probation_months_granted stored correctly when probationMonths=3
- Integration: createPerson with blood_type → persisted; updatePerson blood_type patch
- Integration: emergency contact CRUD with relationship field
- Integration: address CRUD with type=HOME_COUNTRY
- Integration: employee_code uniqueness (if index added)
- E2E: Create form → blood type select visible; worker category select visible
- E2E: Edit form → employee code field; edit notice period
- E2E: ESS profile → displays blood type, worker category, employee code, probation duration

---

### Task 2C — Employment Fields

**Scope:** Expose dottedLineManagerId as "Functional Manager" in forms, make employment fields editable in edit form (notice period, employment type), fix create form to store probationMonthsGranted.

**No migration required** — all schema columns exist.

**Server action updates:**
- File: `modules/core-hr/validations.ts` — add `dottedLineManagerId` to `UpdatePersonSchema`
- File: `modules/core-hr/actions.ts` — add `dottedLineManagerId` to `updatePerson()` write path
- File: `modules/core-hr/validations.ts` — add `noticePeriodDays` to `UpdatePersonSchema` (if not already)

**HR Admin Create Form (PersonNewForm.tsx):**
- Step 1 — Employment: Add Functional Manager picker (separate from Line Manager, uses persons list)
- Step 1 — Employment: Ensure probationMonthsGranted is stored alongside probationEndDate calculation

**HR Admin Edit Form (PersonEditForm.tsx):**
- Employment section: Add Functional Manager picker (dottedLineManagerId)
- Employment section: Add Notice Period field (show as "X months" but store days: 30=1mo, 60=2mo, 90=3mo, 180=6mo, 365=12mo)
- Employment section: Add Employment Type (currently not editable in edit form — add as editable for HR_ADMIN)
- Employment section: Worker Category (if added in 2B)
- Employment section: Employee Code (if added in 2B)

**ESS Profile (ProfilePageClient.tsx):**
- Employment tab: Add Functional Manager display (if dottedLineManagerId is set)
- Employment tab: Notice Period shown as months

**Manager Options for Functional Manager picker:**
- Reuse existing `managerOptions` prop pattern from PersonEditForm (same person list, filtered to exclude self)
- Label the field "Functional Manager" (not "Dotted-line Manager")

**Tests required (Task 2C):**
- Unit: noticePeriodDays months conversion (30→1mo, 90→3mo, 180→6mo)
- Integration: updatePerson with dottedLineManagerId → persisted and audited
- Integration: updatePerson with noticePeriodDays → persisted
- Integration: createPerson stores probationMonthsGranted alongside probationEndDate
- E2E: Edit form → functional manager picker, notice period field
- E2E: ESS profile → functional manager displayed

---

### Task 2D — Working Hours / Calendar

**Scope:** Auto-assign new hires to entity default schedule; expose work schedule override in edit form; link entity MDM to default schedule; ESS display of active schedule.

**No migration required** — schema is complete (work_schedules, workScheduleAssignments, worker_assignments.work_schedule_id all exist).

**Application logic changes:**

1. **Auto-assign on hire** (`modules/core-hr/actions.ts` — `createPerson()`):
   - After person creation, look up `work_schedules WHERE legal_entity_id=? AND is_default=true LIMIT 1`
   - If found, insert into `work_schedule_assignments` with person_id, work_schedule_id, effective_start_date=hireDate, is_current=true
   - Also set `worker_assignments.work_schedule_id = defaultScheduleId` on the initial assignment row
   - If no default schedule exists for entity, proceed without assignment (safe — no assignment = contract hours only)

2. **Edit form schedule override** (`app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx`):
   - Add Work Schedule picker (select from work_schedules filtered by legal_entity_id)
   - On save: call new server action `updatePersonWorkSchedule(personId, scheduleId)` which:
     - Closes current work_schedule_assignment (effectiveTo = today)
     - Inserts new work_schedule_assignment (effectiveFrom = today, is_current=true)
     - Updates worker_assignments SET work_schedule_id = scheduleId WHERE is_current=true AND person_id=?
     - Writes audit log

3. **Legal entity MDM page** (`app/(hr-admin)/master-data/legal-entities/` — read existing files):
   - Add "Default Work Schedule" display on entity detail view
   - Show the work_schedule linked via `WHERE legal_entity_id=X AND is_default=true LIMIT 1`
   - Allow HR Director/SUPER_ADMIN to select a different default schedule

4. **ESS Profile display** (`app/(employee)/me/ProfilePageClient.tsx`):
   - Employment tab: Show "Work Schedule" — name of current schedule from getMyProfile

**New server action:**
- File: `modules/core-hr/actions.ts` — `updatePersonWorkSchedule(personId: string, scheduleId: string | null)`
- Auth: HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN
- Transaction: close old assignment + open new + update worker_assignments FK + audit

**Tests required (Task 2D):**
- Integration: createPerson with entity having default schedule → work_schedule_assignment created
- Integration: createPerson with entity having no default schedule → no assignment, no error
- Integration: updatePersonWorkSchedule → old closed, new opened, audit logged
- Integration: updatePersonWorkSchedule(personId, null) → clears override, falls back to entity default
- Unit: schedule inheritance logic (entity default → employee override precedence)
- E2E: Edit form → work schedule picker, shows current schedule, can change
- E2E: ESS profile → shows active work schedule name

---

### Task 2E — Employee Photo

**Scope:** Add photo upload to create form and edit form; display photo in ESS profile header, top menu, and left sidebar.

**No migration required** — `persons.profile_photo_url VARCHAR(500)` already exists. Upload action already exists.

**HR Admin Create Form (PersonNewForm.tsx):**
- Add photo upload as optional Step 0 addition (after name fields, before documents)
- Use existing `PhotoUploadWidget` component pattern, BUT:
  - At create time, no person_id yet — need a two-phase approach:
    - **Option A (recommended):** Create person first, then immediately allow photo upload (redirect to profile with photo upload prompt)
    - **Option B:** Upload to temp blob key, then link after person creation
  - Recommendation: Option A — create person, then show "Person created. Add a photo now?" prompt with the widget

**HR Admin Edit Form (PersonEditForm.tsx):**
- Add photo display/upload widget at the top of the form (same as `/persons/[id]/page.tsx` profile header)
- Reuse `PhotoUploadWidget` component (already exists)
- The widget calls `uploadProfilePhoto(personId, formData)` server action (already exists)

**ESS Profile header (`app/(employee)/me/ProfilePageClient.tsx`):**
- Add photo display in the profile header (where name is shown)
- Use existing `InitialsAvatar` pattern for fallback
- ESS users cannot upload their own photo (HR Admin only for now — see risk note)
- Display only: fetch profilePhotoUrl from getMyProfile() query

**Top menu avatar (`components/employee/EmployeeTopbar.tsx`):**
- Currently shows initials circle (lines 361–367)
- Pass `profilePhotoUrl` from session or server-side prop to EmployeeTopbar
- If profilePhotoUrl is set: show `<img>` tag (34px circle, objectFit:cover)
- If null: existing initials fallback
- **Challenge:** Session does not contain profilePhotoUrl — needs additional fetch or SSR prop
  - **Option A:** Add profilePhotoUrl to the session JWT (requires auth callback change, adds JWT size)
  - **Option B:** Fetch in the layout server component and pass as prop to EmployeeTopbar
  - **Recommendation:** Option B — layout server component fetches profile_photo_url (single query, cached)

**Left sidebar (`components/employee/EmployeeSidebar.tsx`):**
- Currently shows no avatar
- Add small avatar circle at top of sidebar (above nav items) or beside "AVANIIS HR" brand
- Same source: profilePhotoUrl from SSR prop passed from layout

**New server query:**
- `modules/core-hr/actions.ts` — `getPersonPhotoUrl(personId: string): Promise<string | null>`
- Used by layout.tsx to fetch photo for sidebar/topbar
- Cached with `unstable_cache` or revalidatePath pattern

**File: `app/(employee)/layout.tsx` (or the authenticated layout):**
- Fetch profilePhotoUrl for current user's personId
- Pass as prop to EmployeeTopbar and EmployeeSidebar

**Tests required (Task 2E):**
- Unit: uploadProfilePhoto MIME validation; size limit enforcement
- Unit: fallback InitialsAvatar renders correct initials for single-name, two-name, missing-name cases
- Integration: photo upload → blob written + persons.profile_photo_url updated + audit logged
- Integration: cross-entity upload blocked (entity scope check)
- Integration: getPersonPhotoUrl returns null for person with no photo
- E2E: Edit form → camera icon overlay, click to upload, preview updates
- E2E: Profile header → photo shown after upload (or initials if none)
- E2E: Top menu → photo shown after upload
- Security: EMPLOYEE cannot call uploadProfilePhoto for another employee's personId

---

### Task 2F — Navigation

**Scope:** Reorder employee left sidebar menu. One file, two reordering changes.

**File:** `components/employee/EmployeeSidebar.tsx`

**Change:**
1. Move `/me/profile` (My Profile) from position 9 to position 2 (immediately after Home)
2. Move `/org-chart` (Organisation Chart) from position 2 to end (position 10, after ARIA)

**No server-side changes.** No schema changes. No test framework changes needed beyond updating nav order assertions in cross-browser/E2E tests.

**Impact check:**
- `tests/e2e/cross-browser.spec.ts` — verify nav order tests don't assert specific positions
- `tests/e2e/employee-flows.spec.ts` — verify no test relies on org-chart at position 2

**Tests required (Task 2F):**
- E2E: Employee sidebar shows "My Profile" as second item after Home
- E2E: Employee sidebar shows "Organisation Chart" as last item (after ARIA)
- E2E: Navigation to /me/profile still works from sidebar
- E2E: Navigation to /org-chart still works from sidebar (moved but not removed)
- Cross-browser: nav order consistent across Chrome, Firefox, Safari, Edge

---

### Task 2G — Final Regression + Governance

**Scope:** Full regression test pass after all Tasks 2B–2F complete.

**Verification checklist:**
- `pnpm typecheck` → 0 errors
- `pnpm build` → all pages compile (currently 112)
- `pnpm vitest run tests/unit` → all unit tests pass
- `pnpm vitest run tests/integration` → all integration tests pass
- `pnpm vitest run tests/security` → 180/180 pass (RBAC not broken by new fields)
- `pnpm playwright test` → all E2E tests pass
- Migration rollback plan executed in staging environment

**Regression risk areas (verify explicitly):**
1. createPerson flow — probationMonthsGranted now stored; verify personNumber generation unaffected
2. updatePerson — new fields in patch do not break existing field updates
3. ESS leave balance cards — LeaveShell still works (Task 1 not regressed)
4. Org chart — profile photos still displayed (profile_photo_url column read unchanged)
5. Leave calculation — no schedule dependency introduced by Task 2D changes
6. Workflow engine — no changes; verify approve/reject flows unaffected
7. Payroll — notice_period_days change audited correctly
8. ARIA — new fields available in context (test that ARIA can answer "what is X's blood type")

---

## Phase 4 — Risk Analysis

### Risk Register

| Risk ID | Risk | Severity | Tasks | Mitigation | Tests |
|---|---|---|---|---|---|
| **EPE-R01** | Migration 0043 fails on production (Neon) due to table lock | LOW | 2B | Use `ADD COLUMN IF NOT EXISTS` (non-blocking in PG 16); nullable columns don't lock | Staging dry-run migration before prod deploy |
| **EPE-R02** | employee_code uniqueness scope unclear — two employees accidentally given same code | MEDIUM | 2B | Launch without unique constraint; add optional unique index AFTER business defines scope | Manual review test for duplicate codes |
| **EPE-R03** | probation_months_granted mismatch with probation_end_date after extension | LOW | 2B/2C | `probation_months_granted` = original grant duration (immutable after create); extensions tracked in probation_reviews table | Unit test: extend does not change probation_months_granted |
| **EPE-R04** | Functional manager (dotted_line_manager_id) creates circular reporting cycle | LOW | 2C | Application-level guard: validate functionalManagerId ≠ personId and functionalManagerId ≠ lineManagerId; DB has no cycle enforcement (same as lineManagerId pattern) | Integration: reject self-reference; reject cross-entity |
| **EPE-R05** | Photo SAS URL expires (15-min TTL) — top menu avatar shows broken image | MEDIUM | 2E | Photo in top menu/sidebar should regenerate SAS URL at each layout render (server component fetches fresh URL); OR use a longer TTL for profile photos (configurable in blob-storage.ts) | E2E: photo still displays after 15 minutes (extend TTL to 7 days for profile photos) |
| **EPE-R06** | Work schedule auto-assign on hire fails if entity has no default schedule | LOW | 2D | Wrap in try/catch; log warning; don't fail person creation | Integration: createPerson with no default schedule succeeds |
| **EPE-R07** | Work schedule change breaks leave duration calculation for in-flight requests | LOW | 2D | Leave duration is pre-computed and stored at request time (absenceEntries.duration_days); schedule change does not retroactively affect approved leave | No change needed; document in code comment |
| **EPE-R08** | PDPL compliance: blood_type and religion are sensitive health data | MEDIUM | 2B | Gate behind `sensitive_data_consent`; mask in API responses for non-HR roles; document in privacy policy; EMPLOYEE can see own; MANAGER cannot see; HR_ADMIN can see | Security test: blood_type masked for MANAGER role; visible for HR_ADMIN; visible for self |
| **EPE-R09** | Profile photo upload in create form — no person_id yet at upload time | MEDIUM | 2E | Use two-phase approach: create person first (Option A), then redirect to profile with photo upload prompt; do not attempt pre-creation upload | E2E: create flow redirects to profile after save, shows "Add photo" prompt |
| **EPE-R10** | Left sidebar photo fetch adds database query to every page render | LOW | 2E | Single query cached with Next.js `unstable_cache` (1-hour TTL); invalidated on photo upload via `revalidatePath`; negligible latency (<5ms from Neon co-located) | Performance: layout render time not degraded |
| **EPE-R11** | Navigation reorder breaks existing E2E tests that assert menu item position | LOW | 2F | Audit all E2E tests for position-based assertions before reordering; update test expectations | Run full E2E suite immediately after nav change |
| **EPE-R12** | Emergency contact CRUD via ESS does not go through workflow approval | LOW | 2B | Emergency contact edits are self-service (no approval needed per business); write audit log on all self-updates via `updateMyProfile` | Audit log test: PERSON.SELF_UPDATED event includes emergency contact changes |
| **EPE-R13** | worker_category distinct from employment_type may confuse HR users | LOW | 2C | Clear UI labels: "Employment Type" (FULL_TIME/PART_TIME etc.) and "Worker Category" (FTE/Contingent/Contractor) as two separate fields with help text | Usability review before shipping |
| **EPE-R14** | Address management adds significant UI complexity to already-large PersonEditForm | MEDIUM | 2B | Implement as expandable section or separate drawer (similar to MdmDrawer pattern); avoid blocking rest of Task 2B on address UI complexity | Address section can ship separately in a 2B.2 sub-task |
| **EPE-R15** | No image resize/compression before upload — 2MB JPEGs may load slowly on mobile | LOW | 2E | Accept for v1; document as 2E backlog item; client-side Canvas resize is Phase 3 enhancement | No immediate action |

### Rollback Plan

All schema changes are additive (nullable columns). Rollback procedure:
1. `ALTER TABLE persons DROP COLUMN IF EXISTS blood_type;`
2. `ALTER TABLE persons DROP COLUMN IF EXISTS worker_category;`
3. `ALTER TABLE persons DROP COLUMN IF EXISTS employee_code;`
4. `ALTER TABLE persons DROP COLUMN IF EXISTS probation_months_granted;`
5. Redeploy previous application code (removes UI references to dropped columns)
6. No data loss — columns were nullable and empty for new employees

---

## Phase 5 — Migration Specification

### Migration 0043 — Employee Profile Fields

**File:** `drizzle/migrations/0043_employee_profile_fields.sql`

```sql
-- Migration 0043: Employee Profile Enhancement — Phase 2B new columns on persons.
-- All columns: nullable, no DEFAULT, no uniqueness constraint initially.
-- Zero seeding impact: seeds use explicit .values() lists that ignore new columns.
-- Zero performance impact: persons table estimated <5MB at 1000 employees.
-- Rollback: DROP COLUMN IF EXISTS for each column (no cascade, no FK deps).

ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "blood_type" varchar(10),
  ADD COLUMN IF NOT EXISTS "worker_category" varchar(20),
  ADD COLUMN IF NOT EXISTS "employee_code" varchar(50),
  ADD COLUMN IF NOT EXISTS "probation_months_granted" integer;

-- No unique index on employee_code initially — scope TBD by business.
-- When scope is confirmed (per entity? per tenant? lifetime or active?), add:
--   CREATE UNIQUE INDEX IF NOT EXISTS persons_employee_code_unique
--     ON persons (tenant_id, legal_entity_id, employee_code)
--     WHERE employee_code IS NOT NULL;

-- Reporting index for functional queries by worker_category.
CREATE INDEX IF NOT EXISTS "persons_worker_category_idx"
  ON "persons" ("tenant_id", "worker_category")
  WHERE "worker_category" IS NOT NULL;
```

**Drizzle schema addition** (`drizzle/schema/foundation.ts` in persons table):
```typescript
bloodType:               varchar('blood_type', { length: 10 }),
workerCategory:          varchar('worker_category', { length: 20 }),
employeeCode:            varchar('employee_code', { length: 50 }),
probationMonthsGranted:  integer('probation_months_granted'),
```

---

## Phase 6 — Test Strategy

### New Test Files Required

| File | Type | Tests | Phase |
|---|---|---|---|
| `tests/unit/employee-profile-fields.test.ts` | Unit | blood_type validation, worker_category enum, employee_code max length, probation_months_granted range, notice period months conversion | 2B |
| `tests/unit/profile-photo.test.ts` | Unit | InitialsAvatar edge cases, MIME validation, size limit, SAS URL TTL | 2E |
| `tests/integration/person-profile-fields.test.ts` | Integration | CRUD for blood_type, worker_category, employee_code; RBAC masking for PDPL fields; emergency contact relationship; address type=HOME_COUNTRY | 2B |
| `tests/integration/work-schedule-assignment.test.ts` | Integration | auto-assign on hire; override via updatePersonWorkSchedule; rollback to entity default | 2D |
| `tests/e2e/employee-nav.spec.ts` | E2E | Menu order: My Profile 2nd, Org Chart last; navigation still works | 2F |
| `tests/e2e/person-profile-photo.spec.ts` | E2E | Upload widget in edit form; photo displays in profile/topbar/sidebar; fallback initials | 2E |
| `tests/e2e/person-create-enhanced.spec.ts` | E2E | Blood type select; worker category select; employee code; functional manager; home address section | 2B/2C |

### Regression Coverage Matrix

| Area | Tests that must remain green | Risk if broken |
|---|---|---|
| Person create flow | core-hr-actions, EMP-001–013 | HIGH — entire onboarding broken |
| Person edit flow | PersonEditForm, HA-010–011 | HIGH |
| ESS profile | employee-flows, EM-001–017 | HIGH |
| Leave balance (ESS Task 1) | ess-leave-history.test.ts (22 tests) | MEDIUM |
| Org chart photos | EmployeeNode.tsx render tests | MEDIUM |
| RBAC security | rbac-tests.test.ts (RBAC-001–010) | HIGH |
| Payroll | payroll-collision.test.ts | MEDIUM |
| Workflow engine | workflow-collision.test.ts | MEDIUM |

---

## Files to Change per Task

### Task 2B (Personal fields)
| File | Change type |
|---|---|
| `drizzle/migrations/0043_employee_profile_fields.sql` | CREATE (new migration) |
| `drizzle/schema/foundation.ts` | Add 4 columns to persons table definition |
| `modules/core-hr/validations.ts` | Add bloodType, workerCategory, employeeCode, probationMonthsGranted to schemas |
| `modules/core-hr/actions.ts` | Write new columns in createPerson + updatePerson |
| `modules/core-hr/index.ts` | Export new types/actions |
| `modules/profile/actions.ts` | Add relationship to updateMyProfile emergency contact write |
| `app/(hr-admin)/persons/new/PersonNewForm.tsx` | Add blood type, worker category, employee code fields |
| `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx` | Add blood type, worker category, employee code, emergency relationship, address section |
| `app/(employee)/me/ProfilePageClient.tsx` | Add blood type, employee code, worker category, probation months, emergency relationship, home address to appropriate tabs |
| `tests/unit/employee-profile-fields.test.ts` | CREATE (new tests) |
| `tests/integration/person-profile-fields.test.ts` | CREATE (new tests) |
| `tests/e2e/person-create-enhanced.spec.ts` | CREATE (new E2E) |

### Task 2C (Employment fields)
| File | Change type |
|---|---|
| `modules/core-hr/validations.ts` | Add dottedLineManagerId to UpdatePersonSchema |
| `modules/core-hr/actions.ts` | Add dottedLineManagerId, noticePeriodDays to updatePerson write |
| `app/(hr-admin)/persons/new/PersonNewForm.tsx` | Add functional manager picker; store probationMonthsGranted |
| `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx` | Add functional manager picker, notice period field, employment type field |
| `app/(hr-admin)/persons/[id]/edit/page.tsx` | Pre-fetch managerOptions already done; pass dottedLineManagerId as prop |
| `app/(employee)/me/ProfilePageClient.tsx` | Show functional manager, notice period in months |

### Task 2D (Working calendar)
| File | Change type |
|---|---|
| `modules/core-hr/actions.ts` | Add work schedule auto-assign in createPerson; add updatePersonWorkSchedule() |
| `modules/core-hr/index.ts` | Export updatePersonWorkSchedule |
| `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx` | Add work schedule picker |
| `app/(hr-admin)/persons/[id]/edit/page.tsx` | Fetch work schedule options for entity |
| `app/(hr-admin)/master-data/legal-entities/...` | Show default work schedule link on entity detail |
| `app/(employee)/me/ProfilePageClient.tsx` | Show active work schedule name in Employment tab |
| `modules/profile/actions.ts` (getMyProfile) | Include work schedule name in fetch |
| `tests/integration/work-schedule-assignment.test.ts` | CREATE (new tests) |

### Task 2E (Employee photo)
| File | Change type |
|---|---|
| `app/(hr-admin)/persons/new/PersonNewForm.tsx` | Add photo upload option (post-create redirect pattern) |
| `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx` | Add PhotoUploadWidget at form top |
| `app/(employee)/me/ProfilePageClient.tsx` | Add photo in profile header |
| `components/employee/EmployeeTopbar.tsx` | Accept profilePhotoUrl prop; show photo if available |
| `components/employee/EmployeeSidebar.tsx` | Add mini avatar at top of sidebar |
| `app/(employee)/layout.tsx` (or parent) | Fetch profilePhotoUrl for current user; pass to topbar + sidebar |
| `modules/core-hr/actions.ts` | Add getPersonPhotoUrl() |
| `tests/unit/profile-photo.test.ts` | CREATE (new tests) |
| `tests/e2e/person-profile-photo.spec.ts` | CREATE (new E2E) |

### Task 2F (Navigation)
| File | Change type |
|---|---|
| `components/employee/EmployeeSidebar.tsx` | Reorder: My Profile to 2nd, Org Chart to last |
| `tests/e2e/employee-nav.spec.ts` | CREATE (new E2E for nav order) |
| `tests/e2e/cross-browser.spec.ts` | UPDATE nav order assertions if any |
| `tests/e2e/employee-flows.spec.ts` | UPDATE nav assertions if any |

---

## Summary: PASS / FAIL / BLOCKED

**Status: ✅ PASS — Blueprint complete. Ready for implementation approval.**

### Fields already available (no schema change needed)
- religion, religionConsentGiven
- emergency contact relationship (person_emergency_contacts.relationship)
- home address (person_addresses with HOME_COUNTRY type)
- highest degree (person_education.is_highest_degree)
- employment_type (existing values; worker_category column needed for FTE/Contingent/Contractor semantic)
- job field (jobs table, currentJobId)
- functional manager (persons.dotted_line_manager_id — needs UI label as "Functional Manager")
- probation_end_date
- notice_period_days
- profile_photo_url + upload action + upload widget
- work_schedules table (per-day times)
- worker_assignments.work_schedule_id (employee override)

### Fields requiring migration (1 migration, 0043)
1. `persons.blood_type varchar(10)` — nullable, no default
2. `persons.worker_category varchar(20)` — nullable, no default (FTE / CONTINGENT / CONTRACTOR)
3. `persons.employee_code varchar(50)` — nullable, no default
4. `persons.probation_months_granted integer` — nullable, no default

### Recommended task split
- **2B** — Personal fields: blood_type, worker_category, employee_code, emergency relationship, home address, qualification, probation_months_granted
- **2C** — Employment fields: functional manager UI, notice period in edit form, employment type in edit form
- **2D** — Working calendar: auto-assign on hire, edit form schedule picker, entity default display
- **2E** — Employee photo: create/edit form widgets, ESS header, topbar, sidebar
- **2F** — Navigation: 1 file, 2-item reorder (can ship first as it's lowest risk)

### Highest risks
1. **EPE-R09** (MEDIUM) — Photo upload in create form — two-phase approach required (create first, then upload)
2. **EPE-R08** (MEDIUM) — PDPL compliance for blood_type — must gate behind sensitive_data_consent
3. **EPE-R05** (MEDIUM) — SAS URL TTL (15min) — extend to 7 days for profile photos in blob-storage.ts
4. **EPE-R02** (MEDIUM) — employee_code uniqueness — do not add unique constraint until business defines scope
5. **EPE-R14** (MEDIUM) — Address section UI complexity — implement as drawer/expandable section

### Files reviewed by agents
- `drizzle/schema/foundation.ts` (persons, workerAssignments, personAddresses, personEducation, personEmergencyContacts, legalEntities, workScheduleAssignments)
- `drizzle/schema/configuration.ts` (workSchedules, workSchedulePatterns, publicHolidays)
- `drizzle/schema/probation.ts`, `drizzle/schema/timesheets.ts`
- `drizzle/migrations/0000` through `0042`
- `app/(hr-admin)/persons/new/PersonNewForm.tsx` (1,497 lines)
- `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx` (1,194 lines)
- `app/(hr-admin)/persons/[id]/page.tsx`
- `app/(employee)/me/page.tsx`, `app/(employee)/me/profile/page.tsx`, `app/(employee)/me/ProfilePageClient.tsx`
- `modules/core-hr/validations.ts`, `modules/core-hr/actions.ts`, `modules/profile/actions.ts`
- `components/employee/EmployeeSidebar.tsx`, `components/employee/EmployeeTopbar.tsx`
- `components/topbar/ProfileMenu.tsx`
- `lib/blob-storage.ts`, `modules/core-hr/photo-upload.ts`
- `app/(hr-admin)/persons/[id]/PhotoUploadWidget.tsx`
- `components/org-chart/EmployeeNode.tsx`, `components/org-chart/InitialsAvatar.tsx`
- `tests/unit/core-hr-schemas.test.ts`, `tests/unit/core-hr-services.test.ts`, `tests/unit/person-form-helpers.test.ts`
- `tests/integration/core-hr-actions.test.ts`, `tests/integration/employee-profile.test.ts`
- `tests/security/rbac-tests.test.ts`, `tests/e2e/persons.spec.ts`, `tests/e2e/hr-admin.spec.ts`

---

*End of Task 2A Blueprint — STOP. No implementation yet.*
