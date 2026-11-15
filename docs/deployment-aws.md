# AVANIIS HR — AWS S3 Deployment Guide

> **Target environment:** Production / Staging on Vercel (fra1) with Amazon S3  
> **Storage provider:** `AWSS3Provider` (`lib/storage/providers/aws.ts`)

---

## ⚠️ Storage Mode — Read Before Deploying

The application uses `DOCUMENT_STORAGE_MODE` to control file-operation behaviour across environments.

| `DOCUMENT_STORAGE_MODE` | Behaviour |
|---|---|
| `uat-temporary` | Upload/View/Download enabled with **amber UAT warning**. Files stored in `/tmp` — ephemeral, lost on container recycle or redeployment. For Vercel UAT only. |
| `durable` (default in production) | Requires `DOCUMENT_STORAGE_PROVIDER=aws` (this guide) or `azure`. If not configured → **red "Not Configured" banner**, all file ops blocked. |
| `disabled` | All file ops hidden. Document metadata still visible. |

**For Vercel UAT** (before AWS is ready): set `DOCUMENT_STORAGE_MODE=uat-temporary` + `DOCUMENT_STORAGE_PROVIDER=local`.

**For production**: set `DOCUMENT_STORAGE_MODE=durable` (or omit — it is the default when `NODE_ENV=production`) + configure `DOCUMENT_STORAGE_PROVIDER=aws` + all 4 required AWS vars below.

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| AWS account | IAM user with programmatic access (not root) |
| S3 bucket | Private, in the target region |
| AWS SDK v3 | Already installed (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) |

---

## 2. Environment Variables

Set all of these in Vercel → Project → Settings → Environment Variables.  
**Never commit these to Git.**

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DOCUMENT_STORAGE_MODE` | ✅ | `durable` | `durable` \| `uat-temporary` \| `disabled`. Omit in production (defaults to `durable` when `NODE_ENV=production`). |
| `DOCUMENT_STORAGE_PROVIDER` | ✅ | `aws` | Selects the AWS S3 provider |
| `AWS_REGION` | ✅ | `me-central-1` | Use `me-central-1` (UAE) or `eu-central-1` (Frankfurt) for data residency |
| `AWS_ACCESS_KEY_ID` | ✅ | `AKIAIOSFODNN7EXAMPLE` | IAM user access key ID |
| `AWS_SECRET_ACCESS_KEY` | ✅ | `wJalrXUtnFEMI/K7MDENG/…` | IAM user secret key |
| `AWS_S3_BUCKET_NAME` | ✅ | `avaniis-documents-prod` | Target S3 bucket name |

---

## 3. IAM Setup

### Create IAM user

```bash
aws iam create-user --user-name avaniis-hr-storage

aws iam create-access-key --user-name avaniis-hr-storage
# Save AccessKeyId and SecretAccessKey from the response
```

### Attach inline policy

Only the minimum permissions required:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AVANIISHRDocumentStorage",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::avaniis-documents-prod/*"
    }
  ]
}
```

Save as `avaniis-storage-policy.json` and apply:

```bash
aws iam put-user-policy \
  --user-name avaniis-hr-storage \
  --policy-name AVANIISDocumentStorage \
  --policy-document file://avaniis-storage-policy.json
```

---

## 4. S3 Bucket Setup

```bash
# Create bucket (UAE region)
aws s3api create-bucket \
  --bucket avaniis-documents-prod \
  --region me-central-1 \
  --create-bucket-configuration LocationConstraint=me-central-1

# Block all public access (required)
aws s3api put-public-access-block \
  --bucket avaniis-documents-prod \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable versioning (optional but recommended for audit trail)
aws s3api put-bucket-versioning \
  --bucket avaniis-documents-prod \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket avaniis-documents-prod \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'
```

---

## 5. Pre-signed URL TTL

| Use case | TTL | Notes |
|---|---|---|
| Document download | 15 min (900 s) | Default for `getSignedUrl()` |
| Profile photo display | 7 days (604,800 s) | `PHOTO_SAS_TTL_MINUTES` constant |

AWS pre-signed URLs are generated server-side via `@aws-sdk/s3-request-presigner`.  
Max TTL for AWS SigV4 pre-signed URLs: **7 days** (same as profile photo TTL).

---

## 6. Production Readiness Checklist

- [ ] `DOCUMENT_STORAGE_PROVIDER=aws` set in Vercel env vars
- [ ] `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` set
- [ ] Bucket exists with **Block Public Access** fully enabled
- [ ] IAM policy grants only `PutObject`, `GetObject`, `DeleteObject`, `HeadObject`
- [ ] Server-side encryption (SSE-S3 or SSE-KMS) enabled on bucket
- [ ] Versioning enabled for audit/recovery purposes
- [ ] Test upload via `POST /api/persons/{id}/documents` with HR_ADMIN credentials
- [ ] Test download; verify pre-signed URL contains `X-Amz-Signature`
- [ ] Test ESS self-upload via `POST /api/me/documents`
- [ ] Verify pre-signed URL expires after 15 minutes
- [ ] CloudTrail logging enabled on the S3 bucket for compliance audit trail

---

## 7. Rotating IAM Credentials

1. In AWS IAM Console → User `avaniis-hr-storage` → Security credentials
2. **Create new access key** (note: max 2 active keys per user)
3. Update `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in Vercel
4. Redeploy and verify uploads/downloads still work
5. **Deactivate** the old access key, then delete it after 24h

---

## 8. Lifecycle Policy (cost optimization)

```json
{
  "Rules": [
    {
      "ID": "TransitionToIA",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Transitions": [
        { "Days": 90, "StorageClass": "STANDARD_IA" }
      ]
    },
    {
      "ID": "DeleteNoncurrentVersions",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": { "NoncurrentDays": 365 }
    }
  ]
}
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Document storage is not configured` | `DOCUMENT_STORAGE_PROVIDER` missing | Add env var in Vercel |
| `Missing required env var(s) for AWS S3 provider` | One or more AWS env vars not set | The error message lists all missing vars |
| `AccessDenied` on upload | IAM policy too restrictive or wrong bucket | Verify `s3:PutObject` permission on `arn:aws:s3:::YOUR_BUCKET/*` |
| `NoSuchBucket` | Bucket name wrong or wrong region | Verify `AWS_S3_BUCKET_NAME` and `AWS_REGION` match the actual bucket |
| `SignatureDoesNotMatch` | System clock skew | Vercel functions have accurate clocks; contact AWS support if persistent |
| Pre-signed URL returns 403 | URL expired or credentials rotated | Re-issue URL via `getDocumentUrl(docId)` |

---

## 10. Cost Estimate (S3 Standard, eu-central-1, 2024 pricing)

| Usage | Approximate cost/month |
|---|---|
| 500 GB stored | ~$11.50 USD |
| 1M GET requests (pre-signed) | ~$0.0004 USD |
| 1M PUT requests (upload) | ~$0.005 USD |
| Data transfer out (1 GB) | ~$0.09 USD |

Use **S3 Intelligent-Tiering** or lifecycle transitions to reduce costs for infrequently accessed documents.
