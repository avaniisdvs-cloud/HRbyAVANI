# Oracle Fusion — Source Data Acquisition Package

> **Status:** Documentation only. Implementation remains 🔴 **NO-GO**.
> **Date:** 2026-06-01
> **Objective:** Obtain and analyze ALL required Oracle Fusion source data **before** any Migration Factory implementation begins.
> **Scope (locked, D1):** **Workforce Master + Org Structure + Absence** only. Payroll history, compensation, banking-for-pay, and benefits are **out of scope** this phase.
> **Gate:** Implementation stays NO-GO until Oracle Fusion source files are (a) received and (b) pass the Source Readiness Assessment (§5).

This package contains five deliverables:
1. Oracle Fusion Extraction Checklist
2. Oracle Fusion Report Catalog
3. Oracle Fusion Data Request Package
4. Oracle Fusion Export Instructions
5. Oracle Fusion Source Readiness Assessment

> **Note on Oracle Fusion (SaaS) reality:** Oracle Fusion HCM is SaaS — there is **no direct database/table access**. The physical table names below (e.g. `PER_ALL_PEOPLE_F`) are given **for reference only**, to identify the data; actual extraction is done via **OTBI analyses**, **HCM Extracts**, or **BI Publisher** reports. The functional source-of-truth, not raw tables, is what we request.

---

## Domain → Target mapping (anchor)

Each source domain maps to the Migration Factory staging domain and ultimately (future, gated) to AVANIIS target tables.

| Fusion source domain | Staging domain (`migration_batches.domain`) | AVANIIS target tables (future promotion only) | Natural key |
|---|---|---|---|
| Workforce Master (person + employment) | `WORKFORCE_MASTER` | `persons`, `person_contacts`, `person_addresses`, `person_dependents`, `person_emergency_contacts`, `person_education`, `person_documents`, `worker_assignments`, `contracts` | Person Number |
| Org Structure | `ORG_STRUCTURE` | `legal_entities`, `business_units`, `departments`, `positions`, `jobs`, `grades`, `locations`, `work_schedules` | Code per entity (Dept Code, Position Code, etc.) |
| Absence | `ABSENCE` | `absence_types`, `absence_plans`, `absence_entries`, balances | Absence Type Code / (Person Number + Absence Id) |

---

# 1. Oracle Fusion Extraction Checklist

A pre-flight checklist to be completed by the Fusion administrator / client before producing any extract.

### 1.1 Access & roles
- [ ] Extractor has a Fusion role that permits the chosen tool:
  - OTBI analyses → **Human Resource Analyst** / **BI Author** + relevant HCM data security.
  - HCM Extracts → **Human Capital Management Integration Specialist**.
  - BI Publisher → **BI Author** / **BI Administrator**.
- [ ] Data security: extractor can see **all legal employers / business units** in scope (not row-restricted).
- [ ] Read-only — no configuration changes made in Fusion to produce extracts.

### 1.2 Environment & scope
- [ ] Source environment identified (Production vs Stage/Test) and recorded.
- [ ] Effective/"as-of" date agreed (default: extraction run date).
- [ ] Population agreed: **active workers** + **terminated workers within the last N years** (N to confirm) + **future-dated hires** (yes/no).
- [ ] Legal employers / business units in scope listed explicitly.
- [ ] History depth for assignments and absence agreed (current only vs full effective-dated history).

### 1.3 Format & delivery
- [ ] Output format: **CSV, UTF-8**, comma-delimited, double-quote text qualifier, header row included.
- [ ] Date format: **ISO 8601 (`YYYY-MM-DD`)**; timestamps `YYYY-MM-DDThh:mm:ssZ`.
- [ ] One file per Report Catalog entry (§2); file naming per §3.4.
- [ ] Delivery via a **secure channel** (SFTP / encrypted, access-controlled storage). **Not** email; **never** pasted into chat.
- [ ] Volume estimate captured per file (row counts) for reconciliation (§5).

### 1.4 PII & compliance
- [ ] PII fields (Emirates ID, passport, IBAN, national IDs, DOB) flagged in each file.
- [ ] Transfer encrypted; access restricted to the migration team.
- [ ] Client data-protection / PDPL sign-off for the extract obtained.
- [ ] A data-handling owner named on the migration side.

### 1.5 Governance
- [ ] Extraction point-of-contact (Fusion side) named.
- [ ] Receiving owner (AVANIIS side) named.
- [ ] Target delivery date agreed.
- [ ] This checklist signed off before extraction begins.

---

# 2. Oracle Fusion Report Catalog

The specific extracts to produce, one row per file. **Tool** = recommended Fusion mechanism. **Reference objects** identify the data (not direct-access table requests).

### 2.1 Workforce Master (`WORKFORCE_MASTER`)

| ID | File / report | Tool & subject area | Reference objects | Key fields (minimum) |
|---|---|---|---|---|
| WM-01 | Worker & Person Core | OTBI — *Workforce Management – Person Real Time* | `PER_ALL_PEOPLE_F`, `PER_PERSON_NAMES_F`, `PER_PERSON_LEGISLATIVE_DATA` | Person Number, Title, First/Middle/Last Name, DOB, Gender, Marital Status, Nationality, Hire Date |
| WM-02 | National Identifiers (PII) | OTBI / HCM Extract | `PER_NATIONAL_IDENTIFIERS` | Person Number, ID Type (Emirates ID/Passport), ID Number, Issue/Expiry, Issuing Country |
| WM-03 | Addresses | OTBI — Person Real Time | `PER_ADDRESSES_F`, `PER_PERSON_ADDR_USAGES_F` | Person Number, Address Type, Line1-3, City, Emirate/Region, Country, From/To dates |
| WM-04 | Contact methods | OTBI | `PER_EMAIL_ADDRESSES`, `PER_PHONES` | Person Number, Email (work/home), Phone type + number |
| WM-05 | Dependents & Contacts | OTBI | `PER_CONTACT_RELSHIPS_F` | Person Number, Contact Name, Relationship, DOB, Dependent flag, Emergency flag |
| WM-06 | Emergency contacts | (subset of WM-05 where emergency flag) | `PER_CONTACT_RELSHIPS_F` | Person Number, Contact Name, Relationship, Phone |
| WM-07 | Education / Qualifications | OTBI — *Talent Profile* / Person | `HRT_PROFILE_ITEMS` (education content) | Person Number, Qualification, Institution, Year, Field of study |
| WM-08 | Employment / Assignments | OTBI — *Workforce Management – Worker Assignment Real Time* | `PER_PERIODS_OF_SERVICE`, `PER_ALL_ASSIGNMENTS_M` | Person Number, Assignment Number, Worker Type, Assignment Status, Job Code, Position Code, Dept Code, Grade Code, Location Code, Manager Person Number, FTE, Working Hours, Effective Start/End |
| WM-09 | Document records | OTBI — *Document Records* | Document Records of Record | Person Number, Document Type, Number, Issue/Expiry, Country |
| WM-10 *(optional, PII)* | Bank/payment details | OTBI / HCM Extract | Personal Payment Methods / external bank accounts | Person Number, Bank Name, IBAN, Account Holder — *flag: may defer with payroll* |

### 2.2 Org Structure (`ORG_STRUCTURE`)

| ID | File / report | Tool | Reference objects | Key fields |
|---|---|---|---|---|
| OS-01 | Legal Entities (Legal Employers) | OTBI / Setup export | `XLE_ENTITY_PROFILES`, HR org classifications | Legal Entity Code, Name, Registration, Country |
| OS-02 | Business Units | OTBI | `FUN_ALL_BUSINESS_UNITS_V` | BU Code, Name, Legal Entity |
| OS-03 | Departments / Organizations | OTBI — *Workforce Management* | `HR_ALL_ORGANIZATION_UNITS_F`, `PER_DEPARTMENTS` | Dept Code, Name, Parent Dept Code, Legal Entity/BU, Manager (Dept head) Person Number, Effective dates |
| OS-04 | Positions | OTBI | `HR_ALL_POSITIONS_F` | Position Code, Name, Dept Code, Job Code, Grade, Reports-To Position Code, Headcount, Status, Effective dates |
| OS-05 | Jobs | OTBI | `PER_JOBS_F` | Job Code, Name, Job Family, Status, Effective dates |
| OS-06 | Grades | OTBI | `PER_GRADES_F` | Grade Code, Name, Sequence, Status (grade **rates** excluded — comp) |
| OS-07 | Locations | OTBI | `HR_LOCATIONS_ALL`, `PER_LOCATION_DETAILS_F` | Location Code, Name, Address, Country, Emirate |
| OS-08 | Work Schedules / Shifts | OTBI / Setup | Work schedules, work patterns | Schedule Name, Pattern (days/hours), Default flag, Legal Entity |

### 2.3 Absence (`ABSENCE`)

| ID | File / report | Tool | Reference objects | Key fields |
|---|---|---|---|---|
| AB-01 | Absence Types & Plans | OTBI — *Absence Real Time* / Setup | `ANC_ABSENCE_TYPES`, `ANC_ABSENCE_PLANS` | Absence Type Code, Name, Plan, Unit (days/hours), Paid flag |
| AB-02 | Absence Entries (records) | OTBI — *Workforce Management – Absence Real Time* | `ANC_PER_ABS_ENTRIES` | Person Number, Absence Id, Type Code, Start/End Date, Duration, Status |
| AB-03 | Plan Enrollments & Balances | OTBI / HCM Extract | `ANC_PER_PLAN_ENRT`, `ANC_PER_ACRL_ENTRIES` | Person Number, Plan, As-of Date, Accrued, Taken, Balance |

---

# 3. Oracle Fusion Data Request Package

The formal request to hand to the Oracle Fusion administrator / client.

### 3.1 Request summary
> Please provide Oracle Fusion HCM source extracts for **Workforce Master, Org Structure, and Absence**, per the file specifications below, as **UTF-8 CSV** delivered via secure transfer, by **[target date]**, from the **[Production / specified]** environment, as of **[as-of date]**, covering **[legal employers / BUs in scope]**.

### 3.2 Files requested
Exactly the Report Catalog entries (§2): **WM-01…WM-10, OS-01…OS-08, AB-01…AB-03** (WM-10 optional/deferrable). One CSV per ID.

### 3.3 Per-file specification (must contain)
For each file:
- **Header row** with column names (stable, documented).
- **Natural key column(s)** populated and unique (Person Number; or entity Code).
- **Effective dates** where the object is effective-dated (assignments, departments, positions, grades, jobs).
- **Referential keys** as codes, not display names (e.g., Dept Code on WM-08, not department name) so cross-file resolution works.
- **PII flagged** in the column dictionary (WM-02, WM-09, WM-10).
- **No truncation**; full data set for the agreed population.

### 3.4 File naming convention
`AVANIIS_FUSION_<DOMAIN>_<ID>_<YYYYMMDD>.csv`
e.g. `AVANIIS_FUSION_WORKFORCE_WM-08_20260601.csv`.

### 3.5 Population & history
- Active + terminated-within-N-years + future-dated hires (confirm N and future-hire inclusion).
- Assignment / department / position history: **full effective-dated history** preferred (enables correct effective-date promotion later); minimum = current record.
- Absence: entries for the last **[N]** years + current balances as of the as-of date.

### 3.6 Delivery, security, acceptance
- Secure channel (SFTP / encrypted store). Encrypted in transit + at rest.
- Provide a **row-count manifest** per file (for §5 reconciliation).
- Acceptance = passes the Source Readiness Assessment (§5).

### 3.7 Data dictionary requirement
Request a short **column dictionary** per file (column name → meaning, data type, code list where applicable). This is essential for building the staging normalization map (and C2 PII classification) later.

---

# 4. Oracle Fusion Export Instructions

Concrete, tool-by-tool steps the Fusion extractor can follow. (Navigation labels may vary slightly by Fusion release.)

### 4.1 OTBI analysis → CSV (recommended for most files)
1. **Navigator → Tools → Reports and Analytics** (or **Analytics Publisher**).
2. **Create → Analysis**; pick the subject area named in §2 (e.g. *Workforce Management – Worker Assignment Real Time*).
3. Add the **Key fields** columns from the relevant Catalog row; add filters for **legal employer/BU** and **effective/as-of date** and **assignment status** (active + terminated as agreed).
4. Run → **Export → Data → CSV**. Confirm UTF-8 and header row.
5. Save the analysis in a shared catalog folder named `AVANIIS Migration`.

### 4.2 HCM Extract (recommended for large/bulk or balance data)
1. **My Client Groups → Data Exchange → HCM Extracts**.
2. **Create** a new extract (or reuse a delivered template) scoped to the records in §2; set **Output = CSV (BI Publisher template)**, delivery to **UCM/SFTP**.
3. Set parameters: effective date, legal employer, person population.
4. **Submit**; download the CSV from the extract run / delivery target.

### 4.3 BI Publisher report (for fixed-format / scheduled)
1. **Reports and Analytics → Browse Catalog**; create/run a **BIP report** over an HCM data model.
2. Set output to **CSV**, run, and export.

### 4.4 Format settings (all tools)
- Encoding **UTF-8**; delimiter **comma**; text qualifier **double-quote**; header row **on**.
- Dates **`YYYY-MM-DD`**; numbers without thousands separators.
- Large volumes: paginate/split if the tool caps rows, but keep one logical file per Catalog ID (note split parts).

### 4.5 PII caveat
Do **not** mask Emirates ID / passport / IBAN in the extract (the Factory needs the real values to encrypt and migrate), but treat the files as confidential per §1.4 and §3.6. If client policy forbids real PII in non-prod transfer, agree a secure prod-to-prod channel.

---

# 5. Oracle Fusion Source Readiness Assessment

The gate that determines whether the received source data is complete and fit for migration. **Implementation stays NO-GO until this passes.**

### 5.1 Per-file completeness (each WM/OS/AB file)
| Check | Pass condition |
|---|---|
| File present | All required IDs received (WM-10 optional) |
| Header + dictionary | Header row + column dictionary supplied |
| Encoding/format | UTF-8, comma-delimited, ISO dates |
| Row count vs manifest | Matches the Fusion-side manifest (§3.6) |
| Natural key populated | Person Number / Code present on every row |
| Natural key unique | No duplicate keys (within effective-dated context) |

### 5.2 Referential integrity (cross-file)
| Check | Pass condition |
|---|---|
| WM-08 → OS-03 | Every assignment Dept Code exists in Departments |
| WM-08 → OS-04 | Every Position Code exists in Positions |
| WM-08 → OS-05/06/07 | Grade / Job / Location codes exist in their files |
| WM-08 manager | Manager Person Number exists in WM-01 |
| OS-03 parent | Parent Dept Code resolves within Departments |
| OS-04 reports-to | Reports-To Position Code resolves within Positions |
| AB-02 → WM-01 | Every absence Person Number exists in workers |
| AB-02 → AB-01 | Every absence Type Code exists in Types |

### 5.3 Data quality
| Check | Pass condition |
|---|---|
| Required fields | No nulls in mandatory columns (name, hire date, key codes) |
| Date validity | Valid dates; start ≤ end; no impossible DOB |
| Enumerations | Worker type / status / gender map to known code lists |
| PII present | Emirates ID/passport present where expected (WM-02/09) |
| Encoding integrity | Arabic / special characters render correctly (UTF-8) |

### 5.4 Volume reconciliation
- Workers, departments, positions, absence entries: extract counts reconcile with Fusion control totals (HR provides headcount/org counts).

### 5.5 Readiness scorecard & sign-off
| Domain | Files received | Completeness | Ref. integrity | Data quality | Verdict |
|---|---|---|---|---|---|
| Workforce Master | ▢ | ▢ | ▢ | ▢ | 🔴/🟡/🟢 |
| Org Structure | ▢ | ▢ | ▢ | ▢ | 🔴/🟡/🟢 |
| Absence | ▢ | ▢ | ▢ | ▢ | 🔴/🟡/🟢 |

**Source Readiness GO criteria (all must hold):**
1. All required files received with dictionaries.
2. §5.1–§5.4 checks pass (or exceptions are explicitly accepted in writing).
3. Volume reconciliation within agreed tolerance.
4. PII handling confirmed.
5. Sign-off by the receiving owner (AVANIIS) and the Fusion point-of-contact.

> Until this scorecard reads 🟢 across all three domains, **Migration Factory implementation remains NO-GO** — independently of the C1–C7 build conditions.

---

## Out of scope (this phase)
Payroll history, compensation/salary, grade rates, benefits, and pay-banking are **excluded** (D1). WM-10 (bank details) is optional and may be deferred to the payroll phase.

## What this package does NOT do
- ❌ No connection to Oracle Fusion is made here (this is the request/spec, not the extract).
- ❌ No code, migration, route, API, table, navigation, or permission change.
- ❌ Does not unfreeze the architecture or start the build.
