# Open Points Tracker

Running list of deferred decisions and items to revisit. Add new items at the top.

| # | Date raised | Owner | Status | Item | Detail / context |
|---|-------------|-------|--------|------|------------------|
| OP-001 | 2026-06-05 | d.kethari | OPEN — deferred | **Re-enable MFA step-up enforcement** | During development/testing the MFA step-up for high-privilege roles (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN) is being relaxed so LOCAL/password (non-corporate-email) service & admin accounts can sign in without Microsoft Entra MFA — in **all environments incl. production**. **Action:** re-enable / harden MFA enforcement **after all changes and bug fixes are complete**, before go-live sign-off. Affected: `lib/auth.ts` (`requireRole` step-up at ~L584, `HIGH_PRIVILEGE_ROLES`), `lib/local-login.ts`. Security note: while deferred, high-privilege LOCAL accounts are protected by password + lockout (5/15min) + bcrypt only. Also review `ENABLE_DEV_ACCOUNTS=true` is never left on for real production. |

---

## Notes
- This tracker is for deferred/▸later items so they are not lost. Closing an item: set Status = DONE with the resolving commit/date.
