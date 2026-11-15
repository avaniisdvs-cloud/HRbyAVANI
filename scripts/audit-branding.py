#!/usr/bin/env python3
"""Scan all project-owned paths, file bytes, and ZIP entries for retired branding."""
from pathlib import Path
import io
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'.git', '.next', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'evidence'}
# Encoded signatures keep retired names out of the application and its documentation.
SIGNATURES = [bytes.fromhex(s) for s in (
    '6b6865647261', '6b657475726168', '626162757665656e616b',
    'd983d98ad8aad988d8b1d8a7', 'd983d8aad988d8b1d8a7',
)]
PATTERN = re.compile(b'|'.join(re.escape(s) for s in SIGNATURES), re.I)
issues = []
count = 0
archive_entries = 0

def inspect(name, data, depth=0):
    global archive_entries
    if PATTERN.search(name.encode()) or PATTERN.search(data):
        issues.append(name)
    if depth < 4 and zipfile.is_zipfile(io.BytesIO(data)):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for entry in archive.infolist():
                if not entry.is_dir():
                    archive_entries += 1
                    inspect(name + '::' + entry.filename, archive.read(entry), depth + 1)

for path in ROOT.rglob('*'):
    if any(part in EXCLUDED for part in path.relative_to(ROOT).parts) or not path.is_file():
        continue
    count += 1
    inspect(str(path.relative_to(ROOT)), path.read_bytes())

print(f'Inspected {count} files and {archive_entries} archive entries; {len(issues)} retired-brand matches.')
for issue in issues:
    print(issue)
raise SystemExit(bool(issues))
