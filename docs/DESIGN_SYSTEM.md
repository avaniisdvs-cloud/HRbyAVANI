# AVANIIS interface standard

Approved implementation: 16 November 2026. Employees is the visual reference. This document describes presentation; it does not change permissions or business rules.

| Role | Token / standard |
|---|---|
| Page title | `PageTitle`, Fraunces, responsive 24–30px, 600, ink-1 |
| Section title | `SectionTitle`, Inter, 18px, 600, ink-1 |
| Dialog title | `DialogHeading` / shared Radix DialogTitle, Fraunces, 21px, 600 |
| Body and controls | Inter, `--text-body` 14px, 1.5 line height |
| Caption / supporting labels | `--text-caption` 13px |
| Lead | `--text-lead` 16px |
| Arabic | Noto Sans Arabic through the existing locale stylesheet |
| Identifiers / editor | JetBrains Mono; retain specialist editor density |
| Primary/secondary/muted text | `--ink-1`, `--ink-2`, `--ink-3` |
| Canvas / card / secondary surface | `--bg`, `--card`, `--surface` |
| Active selection | `--accent-050` with `--brand-active` text |
| Text on filled accent | `--on-accent` (white in both themes) |
| Control / card radius | `--radius-control` 8px / `--radius-card` 12px |
| Spacing | 4, 8, 12, 16, 24, 32px according to component role |

Use semantic success, pending, rejected and warning colors without replacing them with the primary brand color. Typography components retain caller children, handlers, spacing, IDs and accessible attributes; only the type-role presentation is standardized. Charts and Data Hub keep specialist layouts.

Admin navigation uses a 256px labeled expandable sidebar and optional 60px compact mode. Existing workspace and item visibility checks are reused. Mobile retains the existing bottom navigation/drawer. Section links disclose through real buttons with aria-expanded/aria-controls. Routing and role guards remain on their existing pages and server actions. Org Chart is labeled Employee Organization Structure and keeps `/org-chart`.
