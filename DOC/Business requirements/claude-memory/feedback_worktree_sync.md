---
name: Always sync changes to main project, not just the worktree
description: When editing files in a worktree, always apply the same changes to the main project directory so the user can test at localhost:3000 without being asked
type: feedback
originSessionId: c6f2bba7-bf55-4e63-a287-a968548bc6f5
---
When working in a worktree (`/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/.claude/worktrees/<name>/`), always apply every file change to the corresponding path in the main project (`/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/`) as well — either by editing both in parallel or by copying the file after editing.

**Why:** The user's dev server runs at localhost:3000 from the main project directory. Worktree changes only appear at the worktree's preview port (e.g. 3003), which the browser preview can't reach. The user should never have to ask for changes to be synced.

**How to apply:** After every Edit or Write to a worktree file, immediately apply the same change to the main project path. Use `cp` to copy the file if the changes are large.
