---
name: Workflow decisions must include Delegate option
description: Approval decision UIs in AVANIIS HR must offer Approve / Reject / Delegate — never just Approve / Reject.
type: feedback
originSessionId: c793bc91-2bf6-466d-89ab-e895b042413e
---
Workflow approval/decision UIs (in-the-moment, on a single workflow instance)
must always present three actions: **Approve**, **Reject**, and **Delegate**.

**Why:** the user corrected the S9-03 spec mid-build — the original spec said
"Approve (optional comment) · Reject (comment required)". User added Delegate
as a required third option so an approver can hand off a single request without
needing the full ongoing-delegation flow (S9-04).

**How to apply:** any decision form built off `actOnWorkflowStep` (or a sibling
action) must support a `DELEGATE` action that takes a target person + comment,
records the delegation in the workflow's chain history, and re-routes the
pending instance to the chosen delegate. Surface those instances in
`getPendingApprovalsForCurrentUser` so the delegate sees them in their queue.
Don't ship a 2-button decision UI in the workflow domain.
