# Azure Storage Readiness Runbook — Core HR documents

> Owner-gated (IT). Configures durable document storage for production. The app's
> storage factory **fails closed** in production when `DOCUMENT_STORAGE_PROVIDER`
> is unset (`lib/storage/factory.ts`) — local `/tmp` is dev-only.

## 1. Azure Blob setup checklist
- [ ] Create Storage Account (same region as app, e.g. UAE North)
- [ ] Redundancy per policy (LRS/ZRS/GRS)
- [ ] Create container(s) for HR documents (e.g. `hr-documents`)
- [ ] Generate connection string / SAS / managed identity for the app
- [ ] Set app config: `DOCUMENT_STORAGE_PROVIDER=azure` + `AZURE_STORAGE_CONNECTION_STRING`

## 2. Container / security / access policy
- [ ] Container access level = **Private** (no anonymous/public access)
- [ ] App authenticates via connection string or (preferred) **managed identity** + RBAC
- [ ] Network: restrict to app subnet / private endpoint where possible
- [ ] Encryption at rest enabled (default); TLS in transit enforced
- [ ] PII documents: confirm encryption + access logging expectations

## 3. Upload / download / delete validation (non-prod or controlled test container)
- [ ] Upload a test document via the app → succeeds, returns durable URL/handle
- [ ] Download the same document → bytes match
- [ ] Delete the test document → removed; access denied afterward
- [ ] Confirm no fallback to local/`/tmp` occurred (provider = azure in logs)

## 4. Retention / backup considerations
- [ ] Soft delete / versioning enabled per retention policy
- [ ] Lifecycle management rules (archive/cool tiers) if applicable
- [ ] Backup/restore approach documented
- [ ] Legal/compliance retention windows confirmed with HR

## 5. Production env config confirmation
- [ ] `DOCUMENT_STORAGE_PROVIDER=azure` set in production
- [ ] `pnpm prod:preflight` passes (storage check is an **error** in prod if provider
      is unset/non-durable)
- [ ] Post-deploy smoke: one real document upload/download round-trip (see smoke checklist)

## 6. Sign-off
| Item | Owner | Status |
|---|---|---|
| Blob configured + private | IT | ☐ |
| Round-trip verified | IT/QA | ☐ |
| Retention/backup agreed | IT/HR | ☐ |
| Production provider confirmed via preflight | IT | ☐ |
