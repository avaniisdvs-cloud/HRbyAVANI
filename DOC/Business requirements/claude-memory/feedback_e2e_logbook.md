---
name: E2E test logbook must be updated after every run
description: After every Playwright test run, update tests/e2e/e2etestresults.md before reporting results to the user
type: feedback
originSessionId: c6f2bba7-bf55-4e63-a287-a968548bc6f5
---
After every Playwright test run — single project or multi-project — update `tests/e2e/e2etestresults.md` with a new numbered run section BEFORE reporting results to the user.

Each run entry must include: date, project(s), duration, passed/failed/skipped counts, run command, and a notes section covering what changed or why tests were skipped.

Also update the Run History table at the bottom of the file.

**Why:** User explicitly requested this as a standing workflow rule (2026-05-12).

**How to apply:** Every time `pnpm playwright test ...` is run, write the logbook entry first, then summarise to the user.
