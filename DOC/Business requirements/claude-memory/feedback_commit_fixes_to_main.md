---
name: commit-fixes-to-main
description: "Every code fix must be committed to main branch immediately, not left as unstaged changes — worktree commits never reach main"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b6477909-96a2-4c9f-b49d-94ccde37f673
---

After every code fix, immediately `git add` and `git commit` the changed files to the `main` branch before reporting the task as done.

**Why:** Previous fixes to `workspace-nav.ts` (and other files) were committed only to Claude Code worktree feature branches, never merged to `main`. When the next session starts from `main`, those fixes are absent — causing the same bug to reappear repeatedly. Uncommitted changes on disk are equally fragile: any `git reset`, server restart from git, or new worktree wipes them.

**How to apply:** After every edit session:
1. `git add <changed files>`
2. `git commit -m "fix(scope): description"` with Co-Authored-By trailer
3. Verify `git log --oneline -3` shows the commit on `main`

This rule applies even for small one-line fixes. The fix is not done until it's committed.

**Linked issue:** `workspace-nav.ts` Projects entry regressed multiple times because it was fixed in worktrees (e.g. commit `3948056` on a worktree branch, May 19 2026) but main never received it. Fixed and committed as `7702342` on 2026-05-21.

See also: [[worktree-sync]] (applying disk changes), [[workspace-nav-two-file-invariant]]
