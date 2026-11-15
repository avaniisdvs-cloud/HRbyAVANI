# Migration Factory — Architecture Freeze

> **Status:** 🧊 **FROZEN** as of 2026-06-01.
> **Frozen at git SHA:** `97c8608e13e7089ba3a49011420163879d211f30` (branch `main`)
> **Implementation status:** 🔴 **NO-GO** — Track B not started. No code, migrations, routes, APIs, tables, navigation, or permission changes exist.

---

## 1. What is frozen

The Migration Factory **design and governance baseline** is frozen. The following artifacts constitute the frozen architecture; they are not to be changed without a deliberate re-opening of governance (see §3):

| Doc | Title | Role |
|---|---|---|
| 00 | Pre-Implementation Governance | Locked decisions D1–D5, impact, risk, backup/rollback, gate, C1–C10 |
| 01 | Staging Schema Design | `migration_*` staging table set (4 tables), validation lifecycle, isolation, OD-2 locked |
| 02 | Build Readiness Review | Adversarial review, verified findings, C1–C10 |
| 03 | C1–C7 Closure Plan | Closure plan, implementation order, risk matrix, recommendation |
| 04 | Baseline Certification | Verified pre-implementation platform state |

## 2. Frozen decisions (recap)

- **D1** Scope (this phase): Workforce Master + Org Structure + Absence only.
- **D2** Write target: isolated `migration_*` staging only; no production writes this phase.
- **D3** Ingestion: fully independent; existing `/persons/import` + `import-engine.ts` untouched.
- **D4** Navigation: new SUPER_ADMIN top-level workspace in `workspace-nav.ts` only; never `admin-nav.ts`.
- **D5** Promotion to production: separate, future, explicitly-gated phase.
- **C8** Intra-set FKs: Option A (enforced) — locked.

## 3. Change control (freeze rule)

While frozen, the architecture is the stable reference for downstream workstreams (source-data acquisition, and eventually the build). Any proposed change to a frozen decision or design element requires:
1. An explicit "re-open governance" instruction from the project owner.
2. A documented impact re-assessment (which decisions/conditions are affected).
3. A new dated revision entry in the affected document.

Mechanical corrections (typos, broken links) are exempt.

## 4. Gate status (unchanged)

- Blocking conditions **C1–C7**: 🔴 OPEN.
- Design conditions **C9, C10**: 🟡 pending (C8 locked).
- **Implementation: 🔴 NO-GO.** Remains NO-GO until Oracle Fusion source files are available and analyzed **and** C1–C7 are explicitly closed.

## 5. Next workstream

**Oracle Fusion Source Data Acquisition** — see `06-oracle-fusion-source-acquisition.md`. Objective: obtain and analyze all required Oracle Fusion source data before any implementation begins. This workstream does **not** unfreeze the architecture and does **not** start the build.
