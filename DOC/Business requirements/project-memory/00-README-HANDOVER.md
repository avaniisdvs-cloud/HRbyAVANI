# Project Memory — Handover Package
**Generated:** 2026-06-04
**Project:** AVANIIS HR (Avaniis / Avaniis)
**Phase:** Phase 1 MVP — Complete and QA-certified

---

## Why this package exists

This directory is a structured knowledge snapshot for future AI coding sessions (and human developers who join mid-project). The CLAUDE.md at the repository root carries running session notes, but those accumulate over time and become noisy. This package provides clean, stable reference material that does not change between sessions.

Load this package at the start of a new session **before** reading CLAUDE.md, or when CLAUDE.md is ambiguous about the current state of an architectural rule.

---

## How to use it

1. Read this README first (you are here).
2. Read `01-PROJECT-BASELINE.md` for technology choices, deployment config, and commands.
3. Read `11-DO-NOT-BREAK-RULES.md` before touching any existing code.
4. Read `18-ARCHITECTURAL-DECISIONS.md` when you are about to propose a new approach and want to understand why the current one was chosen.
5. The remaining files (02–17) cover specific subsystems. Load them only when working in that area.

---

## File inventory

| File | Purpose |
|---|---|
| `00-README-HANDOVER.md` | This file — explains the package, when generated, how to use it |
| `01-PROJECT-BASELINE.md` | Tech stack, deployment architecture, auth model, roles, env vars, build commands |
| `02-MODULE-MAP.md` | Every module with status, main files, key tables, dependencies, risk, and load guidance |
| `03-CURRENT-STATE.md` | What's complete, what's partial, known issues, technical debt, open decisions |
| `04-DATABASE-MODEL.md` | Schema files, key tables, migration state (applied vs WIP), risky areas, payroll deps |
| `05-RBAC-SECURITY.md` | 7 roles, permissions, MFA enforcement, access boundaries, security controls |
| `06-WORKFLOW-RULES.md` | Workflow engine, approval chains, collision hardening, business invariants |
| `07-UI-PATTERNS.md` | CSS design tokens, layout conventions, nav patterns, bilingual, accessibility |
| `08-PAYROLL-READINESS.md` | UAE payroll blueprint (WPS/GPSSA/DEWS/EOSB), reusable entities, missing prerequisites |
| `09-AI-SESSION-GUIDE.md` | Task-specific file loading guide, session rules, known footguns |
| `10-NEXT-DEVELOPMENT-PLAN.md` | Immediate next steps, priorities, branch/migration/release strategy |
| `11-DO-NOT-BREAK-RULES.md` | Numbered checklist of architectural invariants — read before every code change |
| `12-FILE-OWNERSHIP-MATRIX.md` | Risk level per file/path pattern, what's safe to modify |
| `13-CODEX-START-PROMPT.md` | Ready-to-paste startup prompt for OpenAI Codex |
| `14-CLAUDE-START-PROMPT.md` | Ready-to-use startup prompt for a fresh Claude Code session |
| `15-VERIFIED-IMPLEMENTATION-MATRIX.md` | Evidence-backed module status — claimed vs verified with file references |
| `16-DEPENDENCY-GRAPH.md` | Module dependency tree, risk propagation, cross-cutting concerns |
| `17-CONTEXT-LOADING-MATRIX.md` | Minimum file sets per task type — critical for reducing context consumption |
| `18-ARCHITECTURAL-DECISIONS.md` | 13 ADRs with rationale, rejected alternatives, and future warnings |

---

## Important notes for AI sessions

- **Code freeze is the default.** Do not modify production code unless the user explicitly asks. Diagnose and explain only; ask permission before editing any file.
- **Never run `npm` or `yarn`.** This project uses `pnpm` exclusively.
- **Never deviate from ADR-001 stack.** No NestJS, Kafka, Redis, Prisma, TypeORM, Kubernetes, or Kong — ever.
- **Neon migration gap.** `drizzle-kit migrate` only applies migrations 0000–0039. Migrations 0040–0054 are applied manually via Neon SQL Editor. Migrations 0055–0057, 0060, and 0061 in the folder are WIP and NOT yet applied. The next safe slot for a new migration is 0058 (verify by checking `drizzle/migrations/` before creating anything).
- **CLAUDE.md is authoritative for session state.** This package is stable reference; CLAUDE.md carries current in-progress notes and pending tasks.
- **Production URL:** http://localhost:3001 — never run destructive operations against it.
