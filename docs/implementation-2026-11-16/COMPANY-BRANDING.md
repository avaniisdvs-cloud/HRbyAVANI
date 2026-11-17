# Configurable company branding

## Use

Sign in as Super Admin and open **Administration → Company Branding**. The primary AVANIIS logo is retained permanently. Browse for a customer logo in the secondary-logo section, then select **Upload secondary logo**. After upload, choose **Use primary logo** or **Use secondary logo** to control which logo appears. Uploading a file does not switch the displayed logo automatically. Transparent PNG or SVG is recommended; PNG, SVG, JPEG and WebP up to 2 MB are accepted.

The Upload button is intentionally disabled until a file is selected. After browsing, the page displays **File selected. Ready to upload.** and enables the button. Server errors remain visible and the selected file remains available for retry.

The setting is organization-wide for this application instance. Other users see it on their next navigation or refresh. No rebuild, deployment, GitHub change or database migration is required when changing the name or logo.

## Scope

- Two retained logo slots: primary AVANIIS and secondary customer artwork, with an audited active-logo selector.
- Configured product copy on sign-in, dashboard, help, navigation, mobile headers and settings; inherited browser titles and favicon.
- Shared logos in desktop, employee and mobile layouts; neutral HR mark if a newly named company has not uploaded its logo.
- Organization-chart exports, import-workbook title and download filename, default assistant identity, and outgoing email product-name defaults/confirmation pages.
- Existing company announcements remain editable content; standard previous-name product references are formatted using the new display name. Uploaded carousel images and their content are not regenerated.
- Legal entities, employee names/emails, payroll employer identity, legal letters, existing templates, historical audits and already queued messages remain business data. Branding does not rename these records or change authentication accounts, email sender addresses, integrations, domains or tenant IDs.
- Document letterhead remains the existing legal-entity document branding feature. This setting changes application identity, not legal-document ownership.

## Authorization and storage

The route and navigation are Super Admin only. All six branding server writes verify SUPER_ADMIN before validation/database access. The generic policy editor rejects the reserved COMPANY_BRANDING namespace. Identity is stored in existing global tenant policy settings; artwork uses existing page personalization storage. Writes and their audit records share a transaction. No new schema or foundational model changes.

A public read-only artwork endpoint serves only the configured global image, needed before sign-in; it does not expose private settings. Image responses enforce supported MIME types, the upload size limit, nosniff and an SVG sandbox policy. Root layout serializes the image URL instead of repeating uploaded image bytes across every page.

## Verification

- 192 test files pass: 3,339 passed, 36 skipped, 7 TODO.
- TypeScript and optimized application build pass (existing lint warnings remain).
- Browser: Super Admin changed AVANIIS to NESNAR; saved state persisted on reload. Dashboard heading/title, sign-in product copy, ticker/footer and uploaded test SVG changed to NESNAR. Public logo loaded successfully.
- Supplied transparent AVANIIS PNG (852 KB) uploaded and loaded successfully.
- Two-logo browser verification: the Upload button was disabled before file selection, enabled immediately after browsing, uploaded the secondary SVG, switched the application to it, then switched back to AVANIIS while retaining both logos.
- HR Admin saw no Company Branding link; direct /settings/branding redirected to /settings. Unit tests deny unauthenticated callers and all six other roles before any branding database write.
- Restored AVANIIS, Arabic name and original default logo after testing. Six synthetic employees remained visible; no employee/legal-entity records were edited.
- Final screenshot review caught an intrinsic image-size regression in the shared logo. Explicit inline layout dimensions now constrain artwork; a regression test verifies the size bound.
- First-upload test found a historical database ticker default. New personalization rows explicitly use neutral defaults, preventing an upload from introducing unrelated company copy.

Local browser evidence (ignored by Git):

- evidence/avaniis-uiux/company-branding/nesnar-sign-in.jpg
- evidence/avaniis-uiux/company-branding/nesnar-dashboard.jpg
- evidence/avaniis-uiux/company-branding/super-admin-company-settings.jpg
- evidence/avaniis-uiux/company-branding/hr-admin-denied.jpg

## Change boundary

No payroll calculations, employee/assignment data rules, approval decisions, workflow token validation, email delivery policy, legal-entity ownership or authentication logic changed. The permission changes apply only to the requested branding controls. Existing UI pages were updated only to consume the shared public display identity; neutral page titles inherit the root company-name template.
