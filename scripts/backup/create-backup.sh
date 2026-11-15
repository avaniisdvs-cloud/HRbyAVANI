#!/usr/bin/env bash
#
# create-backup.sh — pre-migration full offline ZIP backup of the AVANIIS HCM repo.
#
# SAFE BY DEFAULT: runs in --dry-run mode unless --execute is passed.
# It only READS the repository and WRITES a single .zip to the backup directory.
# It NEVER touches the database, runs migrations, or modifies application code.
#
# Usage:
#   scripts/backup/create-backup.sh                 # dry-run (prints plan, writes nothing)
#   scripts/backup/create-backup.sh --execute       # create the ZIP
#   scripts/backup/create-backup.sh --execute my-label
#
# Per project policy:
#   - INCLUDES node_modules and .git  -> backup is self-contained (no reinstall on restore)
#   - EXCLUDES .next, build/cache artifacts, test output, and ALL secrets (.env*, .vercel)
#   - Reports the FULL ABSOLUTE PATH of the resulting ZIP.
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST_DIR="${AVANIIS_BACKUP_DIR:-${REPO_DIR}/backups}"

MODE="${1:---dry-run}"
LABEL="${2:-pre-migration-backup}"
TS="$(date +%Y%m%d_%H%M)"
DEST="${DEST_DIR}/${TS}_${LABEL}.zip"

# Patterns excluded from the archive (relative to repo root).
EXCLUDES=(
  "*/.next/*" "./.next/*"
  "*/node_modules/.cache/*"
  "./.turbo/*" "*/.turbo/*"
  "./coverage/*" "./playwright-report/*" "./test-results/*"
  "*.log"
  "./.env" "./.env.*" "*/.env" "*/.env.*"   # secrets — never archived
  "./.vercel/*"                              # may contain pulled env/secrets
  "*/.DS_Store"
)

echo "== AVANIIS HCM pre-migration backup =="
echo "Repo:        ${REPO_DIR}"
echo "Destination: ${DEST}"
echo "Mode:        ${MODE}"
echo "Excludes:    ${EXCLUDES[*]}"
echo "Includes:    node_modules, .git (self-contained restore)"

if [ ! -d "${REPO_DIR}" ]; then echo "ERROR: repo not found"; exit 1; fi
mkdir -p "${DEST_DIR}"

if [ "${MODE}" != "--execute" ]; then
  echo ""
  echo "[DRY-RUN] No archive written. Re-run with --execute to create the ZIP."
  echo "[DRY-RUN] Approx working-tree size (excl. .next):"
  du -sh "${REPO_DIR}" 2>/dev/null || true
  exit 0
fi

cd "${REPO_DIR}"

# Build -x args for zip
XARGS=()
for p in "${EXCLUDES[@]}"; do XARGS+=("-x" "$p"); done

echo ""
echo "[EXECUTE] Creating archive..."
zip -r -q -y "${DEST}" . "${XARGS[@]}"

if [ -s "${DEST}" ]; then
  SIZE="$(du -h "${DEST}" | cut -f1)"
  echo "[OK] Backup created."
  echo "[OK] Full path: ${DEST}"
  echo "[OK] Size:      ${SIZE}"
else
  echo "ERROR: archive missing or empty"; exit 1
fi
