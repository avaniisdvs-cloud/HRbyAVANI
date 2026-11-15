# AVANIIS HR — Azure Blob Storage Deployment Guide

> **Target environment:** Production / Staging on Vercel (fra1) with Azure Blob Storage UAE North  
> **Storage provider:** `AzureBlobProvider` (`lib/storage/providers/azure.ts`)

---

## ⚠️ Storage Mode — Read Before Deploying

The application uses `DOCUMENT_STORAGE_MODE` to control file-operation behaviour across environments.

| `DOCUMENT_STORAGE_MODE` | Behaviour |
|---|---|
| `uat-temporary` | Upload/View/Download enabled with **amber UAT warning**. Files stored in `/tmp` — ephemeral, lost on container recycle or redeployment. For Vercel UAT only. |
| `durable` (default in production) | Requires `DOCUMENT_STORAGE_PROVIDER=azure` or `aws`. If not configured → **red "Not Configured" banner**, all file ops blocked. |
| `disabled` | All file ops hidden. Document metadata still visible. |

**For Vercel UAT** (before Azure/AWS is ready): set `DOCUMENT_STORAGE_MODE=uat-temporary` + `DOCUMENT_STORAGE_PROVIDER=local`. Employees can upload, view, and download — they see the amber warning. Files are ephemeral but UAT can proceed.

**For production**: set `DOCUMENT_STORAGE_MODE=durable` (or omit — it is the default when `NODE_ENV=production`) + configure `DOCUMENT_STORAGE_PROVIDER=azure` + `AZURE_STORAGE_CONNECTION_STRING`.

**Container isolation caveat (UAT mode):** On Vercel serverless, `/tmp` is scoped to a single container. An upload handled by Container A may not be visible to the download container B. If a UAT file is unavailable, the card shows an inline amber warning: *"Temporary UAT file is unavailable — it may have been lost due to serverless container isolation or after redeployment. Please re-upload to continue testing."* — the browser does **not** navigate away.

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| Azure subscription | UAE North region recommended for data-residency compliance |
| Storage Account | General-purpose v2, LRS or GRS redundancy |
| Container | Private access level (no anonymous read) |
| Node.js | 18 + (LTS) |

---

## 2. Environment Variables

Set all of these in Vercel → Project → Settings → Environment Variables.  
**Never commit these to Git.**

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DOCUMENT_STORAGE_MODE` | ✅ | `durable` | `durable` \| `uat-temporary` \| `disabled`. Omit in production (defaults to `durable` when `NODE_ENV=production`). |
| `DOCUMENT_STORAGE_PROVIDER` | ✅ | `azure` | Selects the Azure Blob provider |
| `AZURE_STORAGE_CONNECTION_STRING` | ✅ | `DefaultEndpointsProtocol=https;AccountName=…;AccountKey=…;EndpointSuffix=core.windows.net` | Azure Portal → Storage Account → Access keys → Connection string |
| `AZURE_STORAGE_CONTAINER_NAME` | ⚠️ optional | `avaniis-documents` | Defaults to `avaniis-documents` if not set |

### How to obtain the connection string

1. Sign in to [Azure Portal](https://portal.azure.com)
2. Navigate to your Storage Account
3. Left panel → **Security + networking → Access keys**
4. Click **Show keys** (requires MFA)
5. Copy **Connection string** from key1 or key2

---

## 3. Storage Account Configuration

### Container setup
```bash
# Using Azure CLI
az storage container create \
  --account-name <YOUR_ACCOUNT_NAME> \
  --name avaniis-documents \
  --auth-mode login \
  --public-access off
```

### Recommended CORS policy (for direct browser download)
CORS is not required — all access goes through server-issued SAS URLs.

### Recommended lifecycle policy
```json
{
  "rules": [
    {
      "name": "DeleteSoftDeleted",
      "enabled": true,
      "type": "Lifecycle",
      "definition": {
        "actions": { "version": { "delete": { "daysAfterCreationGreaterThan": 30 } } },
        "filters": { "blobTypes": ["blockBlob"] }
      }
    }
  ]
}
```

---

## 4. SAS URL TTL

| Use case | TTL | Constant |
|---|---|---|
| Document download | 15 min | `DEFAULT_URL_TTL` (default) |
| Profile photo (ESS nav display) | 7 days | `PHOTO_SAS_TTL_MINUTES` |

SAS URLs are generated server-side on every retrieval request. Stale client-side links simply expire — no security impact on the underlying blob.

---

## 5. Production Readiness Checklist

- [ ] `DOCUMENT_STORAGE_PROVIDER=azure` set in Vercel env vars (all environments: production + preview)
- [ ] `AZURE_STORAGE_CONNECTION_STRING` set in Vercel env vars
- [ ] `AZURE_STORAGE_CONTAINER_NAME` set (or defaulting to `avaniis-documents`)
- [ ] Container exists and access level is **Private**
- [ ] Storage Account is in **UAE North** region (data residency)
- [ ] Soft-delete enabled on the Storage Account (7-day retention recommended)
- [ ] Connection string rotated and old key deactivated after initial deployment
- [ ] Test upload via `POST /api/persons/{id}/documents` with HR_ADMIN credentials
- [ ] Test download via `GET /api/persons/{id}/documents/{docId}/url`
- [ ] Test ESS self-upload via `POST /api/me/documents`
- [ ] Verify SAS URL in response expires after 15 minutes

---

## 6. Backup / DR

Azure Blob Storage with GRS (Geo-Redundant Storage) provides automatic replication to a paired Azure region. For UAE North, the paired region is **UAE Central**.

For point-in-time restore, enable **Blob Versioning** and **Blob Soft Delete** in the Azure Portal.

---

## 7. Rotating Credentials

1. In Azure Portal → Storage Account → Access keys → Regenerate key2
2. Update `AZURE_STORAGE_CONNECTION_STRING` in Vercel with the new key2 connection string
3. Redeploy (Vercel reads env vars at build time for static analysis but at runtime for server actions)
4. Verify uploads/downloads working
5. Regenerate key1 to invalidate the old connection string

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Document storage is not configured` in logs | `DOCUMENT_STORAGE_PROVIDER` missing | Add env var in Vercel |
| `AZURE_STORAGE_CONNECTION_STRING is required` | Env var not set for the Azure provider | Add env var |
| `EROFS: read-only file system` | Old code path writing to `process.cwd()/public` | Upgrade to current codebase — all writes now go through `lib/storage/` |
| SAS URL returns 404 | Blob was never uploaded / key mismatch | Check `person_documents.storage_key` value; re-upload |
| SAS URL returns 403 | SAS expired or account key rotated | Re-issue URL via `getDocumentUrl(docId)` |
| `Invalid AZURE_STORAGE_CONNECTION_STRING` | Malformed string (copy/paste truncation) | Re-copy from Azure Portal; verify AccountName and AccountKey are present |

---

## 9. Cost Estimate (UAE North, 2024 pricing)

| Usage | Approximate cost/month |
|---|---|
| 500 GB stored | ~$10 USD (LRS) |
| 1M read operations | ~$0.005 USD |
| 1M write operations | ~$0.025 USD |

Costs are indicative. Review [Azure pricing](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/) for current rates.
