---
name: project-memory-package-2026-06-04
description: Project Memory Package generated 2026-06-04 — full repository documentation snapshot for safe AI session continuation
metadata: 
  node_type: memory
  type: project
  originSessionId: 032ffef8-c43a-4aa5-afe5-12805aa34fa5
---

A full Project Memory Package was generated on 2026-06-04 and committed at `docs/project-memory/2026-06-04/`.

**Why:** CLAUDE.md had grown to 164KB with accumulated session history. The package extracts stable architectural knowledge into 19 focused documents.

**What's in it:** 19 files covering project baseline, module map, current state, DB model, RBAC, workflow rules, UI patterns, payroll blueprint, AI session guide, development plan, invariants checklist, file ownership matrix, start prompts for Codex and Claude Code, verified implementation matrix, dependency graph, context loading matrix, and architectural decisions.

**How to apply:** Future sessions should load `docs/project-memory/2026-06-04/00-README-HANDOVER.md` + `03-CURRENT-STATE.md` + `11-DO-NOT-BREAK-RULES.md` as the minimum context set.

**CLAUDE.md:** Rewritten from 164KB → 8KB. Now a lightweight project constitution pointing to the package.

**Why:** The old CLAUDE.md was consuming massive context every session. The new structure reduces per-session context load by ~95%.
