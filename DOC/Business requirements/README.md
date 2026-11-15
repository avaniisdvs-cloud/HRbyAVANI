# AVANIIS HR — Business Requirements Package

> Consolidated requirements, design, and UAE labour-law compliance basis for the AVANIIS HR system.
> Compiled: 2026-06-04 · Production: http://localhost:3001

## Start Here (read in this order)

| # | Document | What it is |
|---|---|---|
| 1 | **[AVANIIS-HR-REQUIREMENTS-AND-DESIGN-SPECIFICATION.md](AVANIIS-HR-REQUIREMENTS-AND-DESIGN-SPECIFICATION.md)** | The complete requirements + design basis (SRS + SDD). Law levels, compliance integration, all modules, full system design. |
| 2 | **[hr-requirements-uae-labour-law-validation.md](hr-requirements-uae-labour-law-validation.md)** | Article-by-article UAE labour-law compliance proof + legitimacy findings. |

## Folder Contents

| Folder | Contents |
|---|---|
| *(root)* | The 2 primary documents above |
| `supporting-evidence/` | Known gaps, workflow specs, design standard — referenced by the spec |
| `project-memory/` | The 19-file engineering handover package (module-by-module basis) |
| `claude-memory/` | AI assistant working memory — confirmed business rules & decisions captured during development |

## Key Answers for Executive Review

- **Laws implemented (4 levels):** Federal labour (FDL 33/2021), Federal social/data (GPSSA 7/1999, PDPL 45/2021), Regulatory authority (MOHRE WPS, Central Bank), Free-zone (DIFC Law 2/2019). System is multi-jurisdiction aware.
- **Compliance integration:** Enforced in code via a governed `compliance_rules` table + ~80 `BR-xx` rules, not just documented.
- **Open items needing legal sign-off:** GPSSA rate currency (FDL 57/2023), WPS SIF format, ILOE (FDL 13/2022), FDL 9/2024 — see Document 1 §7.

> **Legal caveat:** These documents describe how the software implements UAE law. They are not a legal opinion — final compliance sign-off requires a licensed UAE labour-law advisor.
</content>
