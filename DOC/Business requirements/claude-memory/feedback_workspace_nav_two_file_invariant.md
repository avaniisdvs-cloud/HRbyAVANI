---
name: workspace-nav-two-file-invariant
description: "Adding an MDM/nav route requires updating BOTH workspace-nav.ts AND admin-nav.ts or admin users won't see it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b6477909-96a2-4c9f-b49d-94ccde37f673
---

When adding or restoring any navigation item (especially MDM routes), BOTH config files must be updated:

- `config/workspace-nav.ts` — drives navigation for HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN via `WorkspaceSecondaryNav`
- `config/admin-nav.ts` — drives navigation for MANAGER role only via `AdminSidebar`

**Why:** Admin roles use a completely different layout shell (`WorkspaceRail + WorkspaceSecondaryNav`) than Manager (`AdminSidebar`). Updating only `admin-nav.ts` has zero effect for admin users. This caused the Projects menu to be invisible to every admin login even when it was correctly listed in `admin-nav.ts`.

**How to apply:** Any time a nav item is added, renamed, or removed — search both files and update both. Both files now contain a `⚠️ REGRESSION GUARD` comment as a reminder.

**Key structure:**
- `workspace-nav.ts`: Organization workspace (`id: 'org'`) — MDM items go here
- `admin-nav.ts`: master-data group — MDM items also go here for manager visibility

See also: [[commit-fixes-to-main]]
